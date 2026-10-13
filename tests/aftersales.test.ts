import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,type Actor} from '../src/server/auth';
import {createLocation,createProduct,createUser,patchProduct} from '../src/server/manage';
import {applyOperation} from '../src/server/inventory';
import {createOnlineOrder,confirmManualPayment,fulfillOrder,cancelOrder,getOrder} from '../src/server/orders';
import {createPaymentIntent,processSimulatorWebhook,listPaymentCaptures} from '../src/server/payments';
import {refundPayment,resolveZeroCapture,receiveReturn,aftersalesSummary} from '../src/server/aftersales';

describe('Refund receipts and independent physical returns',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
  const schema=`nexo_aftersales_test_${randomUUID().replaceAll('-','')}`;
  const secret=randomBytes(32).toString('hex'),password='Nexo-aftersales-test-123!';
  let admin:Pool,pool:Pool,owner:Actor,agent:Actor,buyer:Actor,other:Actor,branch:string,north:string;
  before(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);
    admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('options',`-c search_path=${schema}`);pool=new Pool({connectionString:url.toString()});
    await migrate(pool);await migrate(pool);
    const c=await createCompany(pool,{slug:`after-${randomUUID().slice(0,8)}`,name:'Aftersales',email:'owner@example.test',password});
    owner={id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER'};
    const b=await createCompany(pool,{slug:`other-${randomUUID().slice(0,8)}`,name:'Other',email:'owner@example.test',password});
    other={id:b.userId,company_id:b.companyId,name:'Other',role:'OWNER'};
    branch=(await createLocation(pool,owner,{name:'Centro',kind:'STORE'})).id;
    north=(await createLocation(pool,owner,{name:'Norte',kind:'STORE'})).id;
    const a=await createUser(pool,owner,{name:'Agent',email:'agent@example.test',password,role:'AGENT',locationIds:[branch]});
    agent={id:a.id,company_id:c.companyId,name:'Agent',role:'AGENT'};
    const u=await createUser(pool,owner,{name:'Customer',email:'buyer@example.test',password,role:'CUSTOMER'});
    buyer={id:u.id,company_id:c.companyId,name:'Customer',role:'CUSTOMER'};
    Object.assign(process.env,{NODE_ENV:'test',NEXO_SIMULATOR_ENABLED:'true',NEXO_SIMULATOR_SECRETS:JSON.stringify({[c.companyId]:secret})});
  });
  after(async()=>{if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
  const reject=(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,(e:{code?:string})=>e.code===code);
  async function setup(quantity=2,locationId=branch){
    const p=await createProduct(pool,owner,{sku:randomUUID(),name:'SSD',priceMinor:10000});
    await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:p.id,locationId,quantity:10,reason:'Carga inicial'});
    const order=await createOnlineOrder(pool,buyer,randomUUID(),{fulfillment:'PICKUP',locationId,items:[{productId:p.id,quantity}]});
    return {order,productId:p.id as string};
  }
  async function paid(delivered=true,quantity=2){
    const s=await setup(quantity);await confirmManualPayment(pool,owner,s.order.id,{amountMinor:String(quantity*10000),method:'CASH',reference:randomUUID()});
    if(delivered)await fulfillOrder(pool,owner,s.order.id);return s;
  }
  async function capture(orderId:string,amountMinor='20000',currency='CLP',intentId?:string){
    const intent=intentId??(await createPaymentIntent(pool,buyer,randomUUID(),{orderId})).id;
    const payload={eventId:randomUUID(),intentId:intent,transactionId:randomUUID(),status:'SUCCEEDED',amountMinor,currency};
    const raw=JSON.stringify(payload),ts=String(Math.floor(Date.now()/1000));
    const signature=createHmac('sha256',secret).update(`${owner.company_id}.${ts}.${raw}`).digest('hex');
    await processSimulatorWebhook(pool,owner.company_id,raw,ts,signature);
    const result=await pool.query('SELECT id FROM payment_captures WHERE company_id=$1 AND transaction_id=$2',[owner.company_id,payload.transactionId]);
    return {id:result.rows[0].id as string,intentId:intent};
  }
  async function stock(id:string,locationId=branch){return (await pool.query('SELECT on_hand,reserved FROM stock WHERE company_id=$1 AND product_id=$2 AND location_id=$3',[owner.company_id,id,locationId])).rows[0];}
  const refund=(amountMinor:string,reference=randomUUID())=>({amountMinor,reference,reason:'Reembolso solicitado'});
  const receipt=(id:string,restockQuantity=1,damagedQuantity=0,locationId=branch)=>({locationId,reason:'Recepción verificada',items:[{productId:id,restockQuantity,damagedQuantity}]});

  test('manual refunds are partial, idempotent and never change stock or historical payment',async()=>{
    const {order,productId}=await paid();const key=randomUUID(),input=refund('5000');
    const r=await refundPayment(pool,owner,key,{orderId:order.id},input);assert.equal(r.source,'MANUAL');
    assert.equal((await refundPayment(pool,owner,key,{orderId:order.id},input)).replayed,true);
    await reject(()=>refundPayment(pool,owner,key,{orderId:order.id},refund('6000')),'IDEMPOTENCY_CONFLICT');
    assert.deepEqual(await stock(productId),{on_hand:8,reserved:0});
    assert.equal((await getOrder(pool,buyer,order.id)).status,'FULFILLED');
    assert.equal((await aftersalesSummary(pool,buyer,order.id)).refunds.length,1);
  });
  test('concurrent refunds cannot exceed the payment and duplicate references fail',async()=>{
    const {order}=await paid();const results=await Promise.allSettled([1,2].map(()=>refundPayment(pool,owner,randomUUID(),{orderId:order.id},refund('15000'))));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const first=(await aftersalesSummary(pool,owner,order.id)).refunds[0];
    await reject(()=>refundPayment(pool,owner,randomUUID(),{orderId:order.id},refund('1',first.reference)),'REFUND_REFERENCE_CONFLICT');
  });
  test('refunds require administrator, actual manual payment and tenant ownership',async()=>{
    const {order}=await setup();
    await reject(()=>refundPayment(pool,owner,randomUUID(),{orderId:order.id},refund('1')),'MANUAL_PAYMENT_REQUIRED');
    await reject(()=>refundPayment(pool,agent,randomUUID(),{orderId:order.id},refund('1')),'FORBIDDEN');
    await reject(()=>refundPayment(pool,buyer,randomUUID(),{orderId:order.id},refund('1')),'FORBIDDEN');
    await reject(()=>refundPayment(pool,other,randomUUID(),{orderId:order.id},refund('1')),'ORDER_NOT_FOUND');
  });
  test('late capture is resolved only after complete simulated refund, no stock reclaimed',async()=>{
    const {order,productId}=await setup();const intent=await createPaymentIntent(pool,buyer,randomUUID(),{orderId:order.id});
    await cancelOrder(pool,buyer,order.id,{reason:'Cliente canceló'});const c=await capture(order.id,'20000','CLP',intent.id);
    await refundPayment(pool,owner,randomUUID(),{captureId:c.id},{amountMinor:'5000',reason:'Reembolso parcial'});
    let row=(await listPaymentCaptures(pool,owner)).items.find(r=>r.id===c.id)!;assert.equal(row.resolution,null);
    const key=randomUUID(),input={amountMinor:'15000',reason:'Reembolso restante'};
    await refundPayment(pool,owner,key,{captureId:c.id},input);
    assert.equal((await refundPayment(pool,owner,key,{captureId:c.id},input)).replayed,true);
    row=(await listPaymentCaptures(pool,owner)).items.find(r=>r.id===c.id)!;assert.equal(row.resolution,'REFUNDED');assert.equal(row.refunded_minor,'20000');
    assert.deepEqual(await stock(productId),{on_hand:10,reserved:0});
    await reject(()=>resolveZeroCapture(pool,owner,c.id,{reason:'Cerrar sin devolver'}),'REFUND_REQUIRED');
  });
  test('mismatched currency refunds preserve captured currency, not order amount',async()=>{
    const {order}=await setup();const c=await capture(order.id,'37','USD');
    const r=await refundPayment(pool,owner,randomUUID(),{captureId:c.id},{amountMinor:'37',reason:'Moneda incorrecta'});
    assert.equal(r.currency,'USD');assert.equal(r.source,'SIMULATOR');
    await reject(()=>refundPayment(pool,owner,randomUUID(),{captureId:c.id},{amountMinor:'1',reason:'Excede captura'}),'REFUND_EXCEEDS_PAYMENT');
    assert.equal((await aftersalesSummary(pool,buyer,order.id)).refunds.length,0);
  });
  test('zero capture has auditable no-funds resolution and repeat protection',async()=>{
    const {order}=await setup();const c=await capture(order.id,'0');
    const r=await resolveZeroCapture(pool,owner,c.id,{reason:'No se recibió dinero'});assert.equal(r.outcome,'NO_FUNDS');
    assert.equal((await resolveZeroCapture(pool,owner,c.id,{reason:'No se recibió dinero'})).replayed,true);
    await reject(()=>resolveZeroCapture(pool,owner,c.id,{reason:'Otra explicación'}),'RESOLUTION_CONFLICT');
  });
  test('extra capture refund does not block delivery; applied payment refund does',async()=>{
    const {order,productId}=await setup();const c=await capture(order.id);const extra=await capture(order.id,'20000','CLP',c.intentId);
    await refundPayment(pool,owner,randomUUID(),{captureId:extra.id},{amountMinor:'20000',reason:'Pago duplicado'});
    await fulfillOrder(pool,owner,order.id);assert.deepEqual(await stock(productId),{on_hand:8,reserved:0});
    const s=await setup();const applied=await capture(s.order.id);
    await refundPayment(pool,owner,randomUUID(),{captureId:applied.id},{amountMinor:'100',reason:'Reembolso parcial'});
    await reject(()=>fulfillOrder(pool,owner,s.order.id),'REFUNDED_ORDER');
    await reject(()=>refundPayment(pool,owner,randomUUID(),{orderId:s.order.id},refund('1')),'MANUAL_PAYMENT_REQUIRED');
  });
  test('simulator refunds are blocked in production even when enabled',async()=>{
    const {order}=await setup();const c=await capture(order.id);
    Object.assign(process.env,{NODE_ENV:'production'});
    try{await reject(()=>refundPayment(pool,owner,randomUUID(),{captureId:c.id},{amountMinor:'1',reason:'Prueba producción'}),'SIMULATOR_DISABLED');}
    finally{Object.assign(process.env,{NODE_ENV:'test'});}
  });
  test('returned goods are separate from refunds; damaged units never become available',async()=>{
    const {order,productId}=await paid();
    const r=await receiveReturn(pool,agent,order.id,randomUUID(),receipt(productId,1,1));
    assert(r.operation_id);assert.deepEqual(await stock(productId),{on_hand:9,reserved:0});
    const summary=await aftersalesSummary(pool,buyer,order.id);assert.equal(summary.refunds.length,0);assert.equal(summary.returns.length,1);
    assert.equal(summary.returns[0].items[0].damaged_quantity,1);
  });
  test('damaged-only receipt has no stock movement; inactive sold products can return elsewhere',async()=>{
    const {order,productId}=await paid();await patchProduct(pool,owner,productId,{active:false});
    const r=await receiveReturn(pool,owner,order.id,randomUUID(),receipt(productId,0,1,north));assert.equal(r.operation_id,null);
    assert.equal(await stock(productId,north),undefined);
    await receiveReturn(pool,owner,order.id,randomUUID(),receipt(productId,1,0,north));
    assert.deepEqual(await stock(productId,north),{on_hand:1,reserved:0});
  });
  test('concurrent returns and retries cannot receive more units than sold',async()=>{
    const {order,productId}=await paid(true,1);const input=receipt(productId),key=randomUUID();
    const results=await Promise.allSettled([receiveReturn(pool,owner,order.id,key,input),receiveReturn(pool,owner,order.id,randomUUID(),input)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await stock(productId),{on_hand:10,reserved:0});
    const summary=await aftersalesSummary(pool,owner,order.id);const winning=summary.returns[0];
    assert.equal((await receiveReturn(pool,owner,order.id,winning.idempotency_key,input)).replayed,true);
  });
  test('returns reject undelivered, foreign products, unauthorized branch and customer',async()=>{
    const {order,productId}=await paid(false);
    await reject(()=>receiveReturn(pool,owner,order.id,randomUUID(),receipt(productId)),'DELIVERY_REQUIRED');
    await fulfillOrder(pool,owner,order.id);
    await reject(()=>receiveReturn(pool,buyer,order.id,randomUUID(),receipt(productId)),'FORBIDDEN');
    await reject(()=>receiveReturn(pool,agent,order.id,randomUUID(),receipt(productId,1,0,north)),'LOCATION_FORBIDDEN');
    await reject(()=>receiveReturn(pool,owner,order.id,randomUUID(),receipt(randomUUID())),'PRODUCT_NOT_SOLD');
    await reject(()=>aftersalesSummary(pool,other,order.id),'ORDER_NOT_FOUND');
    const s=await setup(1,north);await confirmManualPayment(pool,owner,s.order.id,{amountMinor:'10000',method:'CASH',reference:randomUUID()});await fulfillOrder(pool,owner,s.order.id);
    await reject(()=>receiveReturn(pool,agent,s.order.id,randomUUID(),receipt(s.productId)),'ORDER_NOT_FOUND');
  });
  test('multi-line invalid return rolls back all receipts, operations and stock',async()=>{
    const {order,productId}=await paid();const input=receipt(productId);input.items.push({productId:randomUUID(),restockQuantity:1,damagedQuantity:0});
    await reject(()=>receiveReturn(pool,owner,order.id,randomUUID(),input),'PRODUCT_NOT_SOLD');
    assert.deepEqual(await stock(productId),{on_hand:8,reserved:0});assert.equal((await aftersalesSummary(pool,owner,order.id)).returns.length,0);
  });
  test('database refuses ledger edits and unsupported resolution without financial proof',async()=>{
    const {order}=await setup();const c=await capture(order.id,'1');
    await assert.rejects(()=>pool.query(`INSERT INTO capture_resolutions(company_id,capture_id,actor_id,outcome,reason) VALUES($1,$2,$3,'REFUNDED','Sin prueba')`,[owner.company_id,c.id,owner.id]));
    await refundPayment(pool,owner,randomUUID(),{captureId:c.id},{amountMinor:'1',reason:'Devolver captura'});
    await assert.rejects(()=>pool.query('UPDATE refunds SET reason=$2 WHERE capture_id=$1',[c.id,'Alterado']));
    await assert.rejects(()=>pool.query('DELETE FROM capture_resolutions WHERE capture_id=$1',[c.id]));
    const s=await paid();const r=await receiveReturn(pool,owner,s.order.id,randomUUID(),receipt(s.productId));
    await assert.rejects(()=>pool.query('DELETE FROM return_items WHERE receipt_id=$1',[r.id]));
  });
  test('undelivered withdrawal requires full refund then restores entire origin once',async()=>{
    const {order,productId}=await paid(false);const input=receipt(productId,2),key=randomUUID();
    await reject(()=>receiveReturn(pool,owner,order.id,key,input,'WITHDRAWAL'),'FULL_REFUND_REQUIRED');
    await refundPayment(pool,owner,randomUUID(),{orderId:order.id},refund('20000'));
    await reject(()=>receiveReturn(pool,owner,order.id,key,receipt(productId,1),'WITHDRAWAL'),'FULL_WITHDRAWAL_REQUIRED');
    await reject(()=>receiveReturn(pool,owner,order.id,key,receipt(productId,2,0,north),'WITHDRAWAL'),'FULL_WITHDRAWAL_REQUIRED');
    await receiveReturn(pool,agent,order.id,key,input,'WITHDRAWAL');
    assert.deepEqual(await stock(productId),{on_hand:10,reserved:0});
    assert.equal((await receiveReturn(pool,agent,order.id,key,input,'WITHDRAWAL')).replayed,true);
    await reject(()=>receiveReturn(pool,agent,order.id,randomUUID(),input,'WITHDRAWAL'),'RETURN_EXCEEDS_SOLD');
    await reject(()=>fulfillOrder(pool,owner,order.id),'REFUNDED_ORDER');
    const summary=await aftersalesSummary(pool,buyer,order.id);assert.equal(summary.refundState,'FULL');assert.equal(summary.withdrawn,true);
  });
  test('database also rejects refunds over remaining balance',async()=>{
    const {order}=await paid();await refundPayment(pool,owner,randomUUID(),{orderId:order.id},refund('15000'));
    await assert.rejects(()=>pool.query(`INSERT INTO refunds(id,company_id,order_id,actor_id,amount_minor,currency,source,reference,reason,idempotency_key,request_hash)
      VALUES($1,$2,$3,$4,6000,'CLP','MANUAL',$5,'Exceso',$6,'hash')`,[randomUUID(),owner.company_id,order.id,owner.id,randomUUID(),randomUUID()]));
  });
});
