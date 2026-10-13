import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../scripts/migrate';
import { createCompany, login, type Actor } from '../src/server/auth';
import { database, transaction } from '../src/server/db';
import { createLocation, createProduct, createUser, patchLocation, patchProduct } from '../src/server/manage';
import { applyOperation } from '../src/server/inventory';
import { createOnlineOrder, getOrder, confirmManualPayment, cancelOrder } from '../src/server/orders';
import { requestShippingQuote, approveShippingQuote, rejectShippingQuote, getShippingQuote, listShippingQuotes } from '../src/server/shipping';
import { createPaymentIntent, getPaymentIntent, listPaymentCaptures, processSimulatorWebhook } from '../src/server/payments';
import { POST } from '../src/app/api/[...path]/route';
import type { SimulatorEvent } from '../src/server/payment-schemas';

const testUrl=process.env.TEST_DATABASE_URL;
describe('Quoted shipping and simulator', {skip:!testUrl,concurrency:false},()=>{
  const schema=`nexo_checkout_test_${randomUUID().replaceAll('-','')}`;
  const password='Nexo-checkout-test-password-123!';
  const address={recipient:'Cliente de prueba',phone:'+56912345678',line1:'Calle de prueba 123',commune:'Santiago',region:'Metropolitana',country:'CL'};
  const secret=randomBytes(32).toString('hex');
  let pool:Pool,adminPool:Pool,owner:Actor,other:Actor,agent:Actor,branch:string,north:string,web:string,slug:string;
  before(async()=>{
    const url=new URL(testUrl!);assert.match(url.pathname,/test/i);
    adminPool=new Pool({connectionString:testUrl});await adminPool.query(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('options',`-c search_path=${schema}`);
    pool=new Pool({connectionString:url.toString(),max:20});
    Object.assign(process.env,{DATABASE_URL:url.toString(),APP_ORIGIN:'http://localhost:3000',NODE_ENV:'test',NEXO_SIMULATOR_ENABLED:'true'});
    await migrate(pool);await migrate(pool);
    slug=`checkout-${randomUUID().slice(0,8)}`;
    const a=await createCompany(pool,{slug,name:'Checkout A',email:'owner@example.test',password});
    owner={id:a.userId,company_id:a.companyId,name:'Owner',role:'OWNER'};
    const b=await createCompany(pool,{slug:`other-${randomUUID().slice(0,8)}`,name:'Checkout B',email:'owner@example.test',password});
    other={id:b.userId,company_id:b.companyId,name:'Other',role:'OWNER'};
    process.env.NEXO_SIMULATOR_SECRETS=JSON.stringify({[a.companyId]:secret,[b.companyId]:randomBytes(32).toString('hex')});
    branch=(await createLocation(pool,owner,{name:'Centro',kind:'STORE',shippingEnabled:true})).id;
    north=(await createLocation(pool,owner,{name:'Norte',kind:'STORE'})).id;
    web=(await createLocation(pool,owner,{name:'Web',kind:'WEB'})).id;
    const u=await createUser(pool,owner,{name:'Agente',email:'agent@example.test',password,role:'AGENT',locationIds:[branch]});
    agent={id:u.id,company_id:a.companyId,name:u.name,role:'AGENT'};
  });
  after(async()=>{
    if(pool)await pool.end();if(process.env.DATABASE_URL)await database().end();
    if(adminPool){await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end();}
  });
  async function buyer(){
    const email=`${randomUUID()}@example.test`;
    const u=await createUser(pool,owner,{name:'Cliente',email,password,role:'CUSTOMER'});
    return {actor:{id:u.id,company_id:owner.company_id,name:u.name,role:'CUSTOMER' as const},email};
  }
  async function product(quantity=4,location=branch){
    const p=await createProduct(pool,owner,{sku:randomUUID(),name:'SSD',priceMinor:10000});
    if(quantity)await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:p.id,locationId:location,quantity,reason:'Carga prueba'});
    return p.id as string;
  }
  async function stock(id:string,location=branch){return (await pool.query('SELECT on_hand,reserved FROM stock WHERE company_id=$1 AND product_id=$2 AND location_id=$3',[owner.company_id,id,location])).rows[0];}
  const pickup=(id:string)=>({fulfillment:'PICKUP',locationId:branch,items:[{productId:id,quantity:1}]});
  const rejects=(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,(e:{code?:string})=>e.code===code);
  async function setupPayment(){
    const {actor}=await buyer();const id=await product();
    const order=await createOnlineOrder(pool,actor,randomUUID(),pickup(id));
    const intent=await createPaymentIntent(pool,actor,randomUUID(),{orderId:order.id});
    return {actor,id,order,intent};
  }
  function payload(intentId:string,patch:Partial<SimulatorEvent>={}):SimulatorEvent {
    return {eventId:randomUUID(),intentId,transactionId:randomUUID(),status:'SUCCEEDED',amountMinor:'10000',currency:'CLP',...patch};
  }
  function signed(event:SimulatorEvent,companyId=owner.company_id,timestamp=Math.floor(Date.now()/1000).toString()){
    const raw=JSON.stringify(event);const signature=createHmac('sha256',secret).update(`${companyId}.${timestamp}.${raw}`).digest('hex');
    return {raw,signature,timestamp};
  }
  async function webhook(event:SimulatorEvent){const s=signed(event);return processSimulatorWebhook(pool,owner.company_id,s.raw,s.timestamp,s.signature);}
  async function expire(table:'orders'|'shipping_quotes',id:string){
    await transaction(pool,async db=>{
      await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[owner.company_id]);
      const trigger=table==='orders'?'order_transitions':'shipping_quote_transitions';
      await db.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
      await db.query(`UPDATE ${table} SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,[id]);
      await db.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
    });
  }

  test('quote request and approval reserve nothing; checkout snapshots address, goods and fee',async()=>{
    const {actor}=await buyer();const id=await product();const input={items:[{productId:id,quantity:2}],address};const key=randomUUID();
    const quote=await requestShippingQuote(pool,actor,key,input);
    assert.equal(quote.itemDetails[0].productId,id);assert.equal(quote.itemDetails[0].quantity,2);
    assert.equal(quote.itemDetails[0].lineTotal,'20000');assert.ok(quote.itemDetails[0].name);
    assert.equal(quote.status,'REQUESTED');assert.equal((await requestShippingQuote(pool,actor,key,input)).replayed,true);
    const approved=await approveShippingQuote(pool,agent,quote.id,{shippingMinor:'3500',note:'Despacho cotizado'});
    assert.equal(approved.goods_minor,'20000');assert.deepEqual(await stock(id),{on_hand:4,reserved:0});
    await patchProduct(pool,owner,id,{priceMinor:12000});
    const detail=await getShippingQuote(pool,actor,quote.id);
    assert.equal(detail.itemDetails[0].lineTotal,'24000');assert.equal(detail.priced_items?.[0].lineTotal,'20000');
    const order=await createOnlineOrder(pool,actor,randomUUID(),{fulfillment:'SHIP',shippingQuoteId:quote.id,items:input.items});
    assert.equal(order.total_minor,'23500');assert.equal(order.goods_minor,'20000');assert.equal(order.shipping_minor,'3500');
    assert.deepEqual(order.shipping_address,address);assert.equal((await getShippingQuote(pool,actor,quote.id)).status,'USED');
    assert.deepEqual(await stock(id),{on_hand:4,reserved:2});
    await rejects(()=>createOnlineOrder(pool,actor,randomUUID(),{fulfillment:'SHIP',shippingQuoteId:quote.id,items:input.items}),'QUOTE_NOT_APPROVED');
  });
  test('unapproved, mismatched and expired quotes cannot create orders',async()=>{
    const {actor}=await buyer();const id=await product();const items=[{productId:id,quantity:1}];
    const quote=await requestShippingQuote(pool,actor,randomUUID(),{items,address});
    const order=(cart=items)=>createOnlineOrder(pool,actor,randomUUID(),{fulfillment:'SHIP',shippingQuoteId:quote.id,items:cart});
    await rejects(()=>order(),'QUOTE_NOT_APPROVED');
    await approveShippingQuote(pool,owner,quote.id,{shippingMinor:'3000',note:'Costo aprobado'});
    await rejects(()=>order([{productId:id,quantity:2}]),'QUOTE_CART_MISMATCH');
    await expire('shipping_quotes',quote.id);await rejects(()=>order(),'QUOTE_NOT_APPROVED');
    assert.equal((await getShippingQuote(pool,actor,quote.id)).status,'EXPIRED');assert.equal((await stock(id)).reserved,0);
  });
  test('quote permissions restrict customers, agents and other companies; lists omit addresses',async()=>{
    const a=await buyer();const b=await buyer();const id=await product(3,web);
    const quote=await requestShippingQuote(pool,a.actor,randomUUID(),{items:[{productId:id,quantity:1}],address});
    await rejects(()=>getShippingQuote(pool,b.actor,quote.id),'QUOTE_NOT_FOUND');
    await rejects(()=>approveShippingQuote(pool,agent,quote.id,{shippingMinor:'0',note:'Sin permiso web'}),'QUOTE_NOT_FOUND');
    await rejects(()=>getShippingQuote(pool,other,quote.id),'QUOTE_NOT_FOUND');
    await rejects(()=>approveShippingQuote(pool,a.actor,quote.id,{}),'FORBIDDEN');
    const list=await listShippingQuotes(pool,owner);assert(list.items.every(row=>!('address' in row)));
    await rejectShippingQuote(pool,owner,quote.id,{reason:'Fuera de cobertura'});
    assert.equal((await rejectShippingQuote(pool,owner,quote.id,{reason:'Fuera de cobertura'})).replayed,true);
  });
  test('disabled shipping and stock sold during quoting prevent checkout without partial state',async()=>{
    const {actor}=await buyer();const id=await product(1);const items=[{productId:id,quantity:1}];
    const quote=await requestShippingQuote(pool,actor,randomUUID(),{items,address});
    await approveShippingQuote(pool,owner,quote.id,{shippingMinor:'1000',note:'Costo aprobado'});
    await patchLocation(pool,owner,branch,{shippingEnabled:false});
    await rejects(()=>createOnlineOrder(pool,actor,randomUUID(),{fulfillment:'SHIP',shippingQuoteId:quote.id,items}),'SHIPPING_DISABLED');
    await patchLocation(pool,owner,branch,{shippingEnabled:true});
    await applyOperation(pool,owner,randomUUID(),{kind:'SALE',productId:id,locationId:branch,quantity:1,reason:'Vendido mientras cotizaba'});
    await rejects(()=>createOnlineOrder(pool,actor,randomUUID(),{fulfillment:'SHIP',shippingQuoteId:quote.id,items}),'INSUFFICIENT_STOCK');
    assert.equal((await getShippingQuote(pool,actor,quote.id)).status,'APPROVED');assert.equal((await stock(id)).reserved,0);
  });
  test('signed duplicate events apply once; customer never receives a signing secret',async()=>{
    const {actor,id,order,intent}=await setupPayment();const event=payload(intent.id);
    const results=await Promise.all([webhook(event),webhook(event)]);
    assert.equal(results.filter(row=>row.replayed).length,1);assert(results.every(row=>row.result==='APPLIED'));
    assert.deepEqual(await stock(id),{on_hand:3,reserved:0});
    const paid=await getOrder(pool,actor,order.id);assert.equal(paid.payment_source,'SIMULATOR');assert.equal(paid.paid_by,null);
    const read=await getPaymentIntent(pool,actor,intent.id);assert.equal(read.status,'SUCCEEDED');assert(!('secret' in read));
  });
  test('invalid, stale or cross-company signatures cannot mutate stock',async()=>{
    const {id,intent}=await setupPayment();const event=payload(intent.id);const s=signed(event);
    await rejects(()=>processSimulatorWebhook(pool,owner.company_id,s.raw,s.timestamp,'0'.repeat(64)),'INVALID_SIGNATURE');
    const old=signed(event,owner.company_id,Math.floor(Date.now()/1000-600).toString());
    await rejects(()=>processSimulatorWebhook(pool,owner.company_id,old.raw,old.timestamp,old.signature),'SIGNATURE_EXPIRED');
    await rejects(()=>processSimulatorWebhook(pool,other.company_id,s.raw,s.timestamp,s.signature),'INVALID_SIGNATURE');
    assert.deepEqual(await stock(id),{on_hand:4,reserved:1});
  });
  test('amount and currency mismatches create review captures, not paid orders',async()=>{
    const {actor,id,order,intent}=await setupPayment();
    assert.equal((await webhook(payload(intent.id,{amountMinor:'1'}))).result,'REVIEW');
    assert.equal((await webhook(payload(intent.id,{currency:'USD'}))).result,'REVIEW');
    assert.equal((await getOrder(pool,actor,order.id)).status,'RESERVED');assert.deepEqual(await stock(id),{on_hand:4,reserved:1});
    const valid=await webhook(payload(intent.id));assert.equal(valid.result,'APPLIED');
  });
  test('late success stays recorded for review without reclaiming stock',async()=>{
    const {actor,id,order,intent}=await setupPayment();await expire('orders',order.id);
    const result=await webhook(payload(intent.id));assert.equal(result.result,'REVIEW');assert.equal(result.reason,'RESERVATION_EXPIRED');
    assert.equal((await getOrder(pool,actor,order.id)).status,'EXPIRED');assert.deepEqual(await stock(id),{on_hand:4,reserved:0});
    const captures=await listPaymentCaptures(pool,agent);assert(captures.items.some(c=>c.intent_id===intent.id&&c.disposition==='REVIEW'));
  });
  test('manual payment followed by simulator success does not deduct twice',async()=>{
    const {id,order,intent}=await setupPayment();
    await confirmManualPayment(pool,agent,order.id,{amountMinor:'10000',method:'CASH',reference:randomUUID()});
    const result=await webhook(payload(intent.id));assert.equal(result.result,'REVIEW');assert.equal(result.reason,'ORDER_ALREADY_PAID');
    assert.deepEqual(await stock(id),{on_hand:3,reserved:0});
  });
  test('failure before success and failure after success cannot reverse confirmed payment',async()=>{
    const {id,intent}=await setupPayment();
    await webhook(payload(intent.id,{status:'FAILED'}));
    assert.equal((await webhook(payload(intent.id))).result,'APPLIED');
    assert.equal((await webhook(payload(intent.id,{status:'FAILED'}))).reason,'STALE_FAILURE');
    assert.deepEqual(await stock(id),{on_hand:3,reserved:0});
  });
  test('same transaction under a new event is ignored; extra capture is recorded for review',async()=>{
    const {id,intent}=await setupPayment();const event=payload(intent.id);
    await webhook(event);
    assert.equal((await webhook({...event,eventId:randomUUID()})).reason,'TRANSACTION_ALREADY_RECORDED');
    assert.equal((await webhook(payload(intent.id))).reason,'ORDER_ALREADY_PAID');
    assert.deepEqual(await stock(id),{on_hand:3,reserved:0});
    await rejects(()=>webhook({...event,amountMinor:'2'}),'EVENT_CONFLICT');
    await rejects(()=>webhook({...event,eventId:randomUUID(),amountMinor:'2'}),'TRANSACTION_CONFLICT');
  });
  test('signed success racing cancellation remains consistent and receipts are retained',async()=>{
    const {actor,id,order,intent}=await setupPayment();
    const outcomes=await Promise.allSettled([webhook(payload(intent.id)),cancelOrder(pool,actor,order.id,{reason:'Cancelación concurrente'})]);
    const final=await getOrder(pool,actor,order.id);
    assert(['PAID','CANCELLED'].includes(final.status));
    assert.deepEqual(await stock(id),{on_hand:final.status==='PAID'?3:4,reserved:0});
    assert(outcomes[0].status==='fulfilled'); // captured payment is never silently discarded
  });
  test('intent idempotency, ownership and production simulator gate',async()=>{
    const {actor}=await buyer();const id=await product();const order=await createOnlineOrder(pool,actor,randomUUID(),pickup(id));const key=randomUUID();
    const intent=await createPaymentIntent(pool,actor,key,{orderId:order.id});
    assert.equal((await createPaymentIntent(pool,actor,key,{orderId:order.id})).replayed,true);
    await rejects(()=>createPaymentIntent(pool,actor,randomUUID(),{orderId:order.id}),'PAYMENT_ALREADY_STARTED');
    const b=await buyer();await rejects(()=>getPaymentIntent(pool,b.actor,intent.id),'ORDER_NOT_FOUND');
    await rejects(()=>listPaymentCaptures(pool,actor),'FORBIDDEN');
    Object.assign(process.env,{NODE_ENV:'production'});
    try{await rejects(()=>createPaymentIntent(pool,actor,key,{orderId:order.id}),'SIMULATOR_DISABLED');}
    finally{Object.assign(process.env,{NODE_ENV:'test'});}
  });
  test('HTTP simulator webhook uses signature rather than a customer session',async()=>{
    const {actor,intent}=await setupPayment();const event=payload(intent.id);const s=signed(event);
    const context={params:Promise.resolve({path:['payments','simulator',owner.company_id,'webhook']})};
    const unsigned=await POST(new Request(`http://localhost:3000/api/payments/simulator/${owner.company_id}/webhook`,{
      method:'POST',headers:{'content-type':'application/json'},body:s.raw,
    }),context);assert.equal(unsigned.status,401);
    const signedResponse=await POST(new Request(`http://localhost:3000/api/payments/simulator/${owner.company_id}/webhook`,{
      method:'POST',headers:{'content-type':'application/json','x-nexo-timestamp':s.timestamp,'x-nexo-signature':s.signature},body:s.raw,
    }),context);assert.equal(signedResponse.status,200);assert.equal((await signedResponse.json()).result,'APPLIED');
    const known=await pool.query('SELECT email FROM users WHERE id=$1',[actor.id]);
    const logged=await login(pool,{company:slug,email:known.rows[0].email,password});
    const blocked=await POST(new Request('http://localhost:3000/api/orders/x/manual-payment',{
      method:'POST',headers:{cookie:`nexo_session=${logged.token}`,'content-type':'application/json'},body:'{}',
    }),{params:Promise.resolve({path:['orders',randomUUID(),'manual-payment']})});assert.equal(blocked.status,403);
  });
});
