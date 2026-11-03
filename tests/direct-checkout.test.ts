import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {GET,POST} from '../src/app/api/[...path]/route';
import {database} from '../src/server/db';
import {createCompany,login,type Actor} from '../src/server/auth';
import {createUser,createProduct,createLocation,patchLocation} from '../src/server/manage';
import {applyOperation} from '../src/server/inventory';
import {saveShippingRate,publicDeliveryRates,deliveryEstimate} from '../src/server/shipping-rates';
import {customerProfile} from '../src/server/customer-profile';
import {saveTestCard,listTestCards,removeTestCard} from '../src/server/test-payment-methods';
import {createOnlineOrder,getOrder,listOrders,cancelOrder,fulfillOrder} from '../src/server/orders';
import {createPaymentIntent} from '../src/server/payments';
import {simulateCheckout} from '../src/server/demo-checkout';
import {testCardBrand} from '../src/catalog/test-card';

test('fictitious card branding recognizes prefixes without validity checks',()=>{assert.equal(testCardBrand('400000'),'Visa');assert.equal(testCardBrand('510000'),'Mastercard');assert.equal(testCardBrand('222100'),'Mastercard');assert.equal(testCardBrand('340000'),'American Express');assert.equal(testCardBrand('999999'),'Tarjeta');});

describe('Direct shipping, persistent customer profile and local payment cards',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
 const schema='nexo_direct_'+randomUUID().replaceAll('-','');let admin:Pool,pool:Pool,owner:Actor,buyer:Actor,second:Actor,foreign:Actor,product:string,web:string,store:string,rate:any,slug:string;
 const address={recipient:'Cliente Uno',phone:'+56900000000',line1:'Dirección de pruebas 123',commune:'Curicó',region:'Maule',country:'CL' as const};
 const key=()=>randomUUID();
 const items=()=>[{productId:product,quantity:1}];
 const draft=(extra:Record<string,unknown>={})=>({fulfillment:'SHIP',shippingRateId:rate.id,expectedTotalMinor:'13990',address,items:items(),...extra});
 before(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options',`-c search_path=${schema}`);pool=new Pool({connectionString:url.toString()});await migrate(pool);
  const c=await createCompany(pool,{slug:'direct-'+randomUUID().slice(0,8),name:'Direct store',email:'owner@example.test',password:'Direct-test-password-123!'});slug=(await pool.query('SELECT slug FROM companies WHERE id=$1',[c.companyId])).rows[0].slug;owner={id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER'};
  const other=await createCompany(pool,{slug:'foreign-'+randomUUID().slice(0,8),name:'Other',email:'owner@example.test',password:'Direct-test-password-123!'});foreign={...owner,id:other.userId,company_id:other.companyId};
  const user=await createUser(pool,owner,{name:'Cliente Uno',email:'buyer@example.test',password:'Direct-test-password-123!',role:'CUSTOMER'});buyer={id:user.id,name:user.name,company_id:c.companyId,role:'CUSTOMER'};
  const user2=await createUser(pool,owner,{name:'Cliente Dos',email:'second@example.test',password:'Direct-test-password-123!',role:'CUSTOMER'});second={...buyer,id:user2.id,name:user2.name};
  web=(await createLocation(pool,owner,{name:'Bodega web',kind:'WEB'})).id;store=(await createLocation(pool,owner,{name:'Curicó',kind:'STORE',shippingEnabled:true})).id;
  product=(await createProduct(pool,owner,{sku:'PRODUCT',name:'Producto',priceMinor:10000})).id;
  for(const locationId of [web,store])await applyOperation(pool,owner,key(),{kind:'RECEIPT',productId:product,locationId,quantity:30,reason:'Carga inicial de pruebas'});
  rate=await saveShippingRate(pool,owner,null,{city:'Curicó',region:'Maule',feeMinor:'3990',active:true});
  Object.assign(process.env,{DATABASE_URL:url.toString(),APP_ORIGIN:'http://localhost:3000',NODE_ENV:'test',NEXO_SIMULATOR_ENABLED:'true',NEXO_SIMULATOR_SECRETS:JSON.stringify({[c.companyId]:randomBytes(32).toString('hex')})});
 });
 after(async()=>{await database().end();await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
 test('public destinations expose configured fees; estimate never creates quotes or reservations',async()=>{
  const rates=await publicDeliveryRates(pool,slug);assert.equal(rates.items[0].fee_minor,'3990');const estimate=await deliveryEstimate(pool,slug,{rateId:rate.id,items:items()});assert.equal(estimate.totalMinor,'13990');
  assert.equal((await pool.query('SELECT count(*)::int n FROM shipping_quotes')).rows[0].n,0);assert.equal((await pool.query('SELECT sum(reserved)::int n FROM stock')).rows[0].n,0);
 });
 test('owner-only rate configuration isolates companies and normalizes city duplicates',async()=>{
  await assert.rejects(()=>saveShippingRate(pool,buyer,null,{city:'Talca',region:'Maule',feeMinor:'1000'}));
  await assert.rejects(()=>saveShippingRate(pool,foreign,rate.id,{city:'Curicó',region:'Maule',feeMinor:'1000'}));
  await assert.rejects(()=>saveShippingRate(pool,owner,null,{city:'CURICO',region:'maule',feeMinor:'2000'}));
 });
 test('direct checkout reserves once, bypasses quotations and preserves a fixed shipping snapshot',async()=>{
  const idempotency=key(),order=await createOnlineOrder(pool,buyer,idempotency,draft());const replay=await createOnlineOrder(pool,buyer,idempotency,draft());assert.equal(replay.id,order.id);assert.equal(order.shipping_rate_id,rate.id);assert.equal(order.shipping_quote_id,null);assert.equal(order.shipping_minor,'3990');assert.equal(order.location_id,web);assert.equal(order.total_minor,'13990');
  await saveShippingRate(pool,owner,rate.id,{city:'Curicó',region:'Maule',feeMinor:'4990'});assert.equal((await getOrder(pool,buyer,order.id)).shipping_minor,'3990');
  await assert.rejects(()=>pool.query('UPDATE orders SET shipping_rate_id=NULL WHERE id=$1',[order.id]));await cancelOrder(pool,buyer,order.id,{reason:'Liberar reserva de pruebas'});await saveShippingRate(pool,owner,rate.id,{city:'Curicó',region:'Maule',feeMinor:'3990'});
 });
 test('changed totals, forged prices, inactive destinations and mismatched addresses create no partial orders',async()=>{
  const before=Number((await pool.query('SELECT count(*) n FROM orders')).rows[0].n);
  await assert.rejects(()=>createOnlineOrder(pool,buyer,key(),draft({expectedTotalMinor:'10000'})));
  await assert.rejects(()=>createOnlineOrder(pool,buyer,key(),draft({shippingMinor:'0'})));
  await assert.rejects(()=>createOnlineOrder(pool,buyer,key(),draft({address:{...address,commune:'Talca'}})));
  await assert.rejects(()=>createOnlineOrder(pool,buyer,key(),draft({shippingRateId:randomUUID()})));
  await saveShippingRate(pool,owner,rate.id,{city:'Curicó',region:'Maule',feeMinor:'3990',active:false});await assert.rejects(()=>createOnlineOrder(pool,buyer,key(),draft()));await saveShippingRate(pool,owner,rate.id,{city:'Curicó',region:'Maule',feeMinor:'3990',active:true});
  assert.equal(Number((await pool.query('SELECT count(*) n FROM orders')).rows[0].n),before);
 });
 test('shipping fallback uses an enabled store and rejects stock shortages',async()=>{
  const p=(await createProduct(pool,owner,{sku:'STORE-ONLY',name:'Solo sucursal',priceMinor:1000})).id;await applyOperation(pool,owner,key(),{kind:'RECEIPT',productId:p,locationId:store,quantity:2,reason:'Stock en tienda'});
  const estimate=await deliveryEstimate(pool,slug,{rateId:rate.id,items:[{productId:p,quantity:1}]});assert.equal(estimate.totalMinor,'4990');
  await patchLocation(pool,owner,store,{shippingEnabled:false});await assert.rejects(()=>deliveryEstimate(pool,slug,{rateId:rate.id,items:[{productId:p,quantity:1}]}));await patchLocation(pool,owner,store,{shippingEnabled:true});await assert.rejects(()=>deliveryEstimate(pool,slug,{rateId:rate.id,items:[{productId:p,quantity:3}]}));
 });
 test('customer profile persists address and preference; another account never sees it',async()=>{
  await customerProfile(pool,buyer,{name:'Cliente Actualizado',phone:'+56900000000',defaultAddress:address,paymentPreference:'CARD'});const profile=await customerProfile(pool,buyer);assert.equal(profile.name,'Cliente Actualizado');assert.deepEqual(profile.defaultAddress,address);assert.equal(profile.paymentPreference,'CARD');assert.equal((await customerProfile(pool,second)).defaultAddress,null);await assert.rejects(()=>customerProfile(pool,owner));
  await assert.rejects(()=>customerProfile(pool,buyer,{name:'Cliente',phone:'',defaultAddress:address,paymentPreference:'CARD',userId:second.id}));
 });
 test('cards store only masked identifiers, deduplicate and remain private to the customer',async()=>{
  const number='4000000000000010';const card=await saveTestCard(pool,buyer,{label:'Tarjeta local',number});assert.equal(card.brand,'Visa');assert.equal(card.prefix,'400000');assert.equal(card.last_four,'0010');
  const saved=await saveTestCard(pool,buyer,{label:'Tarjeta local',number});assert.equal(saved.id,card.id);assert.equal((await listTestCards(pool,buyer)).items.length,1);assert.equal((await listTestCards(pool,second)).items.length,0);
  const row=(await pool.query('SELECT * FROM test_payment_cards WHERE id=$1',[card.id])).rows[0];assert.ok(!JSON.stringify(row).includes(number));assert.ok(!Object.hasOwn(row,'number'));
  await assert.rejects(()=>saveTestCard(pool,buyer,{label:'Tarjeta',number,cvv:'123'}));await assert.rejects(()=>removeTestCard(pool,second,card.id));
 });
 test('simulated payment uses saved card, repeated payment and dispatch deduct stock only once',async()=>{
  const card=(await listTestCards(pool,buyer)).items[0];const order=await createOnlineOrder(pool,buyer,key(),draft());const intent=await createPaymentIntent(pool,buyer,key(),{orderId:order.id});
  const before=(await pool.query('SELECT on_hand FROM stock WHERE company_id=$1 AND product_id=$2 AND location_id=$3',[buyer.company_id,product,web])).rows[0].on_hand;
  await assert.rejects(()=>simulateCheckout(pool,second,intent.id,{method:'CARD',cardId:card.id}));
  await simulateCheckout(pool,buyer,intent.id,{method:'CARD',cardId:card.id});await simulateCheckout(pool,buyer,intent.id,{method:'CARD',cardId:card.id});await fulfillOrder(pool,owner,order.id);
  assert.equal((await pool.query('SELECT on_hand FROM stock WHERE company_id=$1 AND product_id=$2 AND location_id=$3',[buyer.company_id,product,web])).rows[0].on_hand,before-1);
  const receipt=await getOrder(pool,buyer,order.id);assert.equal(receipt.testPayment.card_last_four,'0010');assert.equal(receipt.status,'FULFILLED');await removeTestCard(pool,buyer,card.id);assert.equal((await getOrder(pool,buyer,order.id)).testPayment.card_last_four,'0010');
  await assert.rejects(()=>simulateCheckout(pool,buyer,intent.id,{method:'TRANSFER'}));assert.ok((await listOrders(pool,buyer,25,0,'SHIP')).items.some(o=>o.id===order.id));assert.equal((await listOrders(pool,second,25,0,'SHIP')).items.length,0);
 });
 test('another customer card cannot be used even inside the same store',async()=>{
  const other=await saveTestCard(pool,second,{label:'Otra cuenta',number:'5100000000000022'});const order=await createOnlineOrder(pool,buyer,key(),draft());const intent=await createPaymentIntent(pool,buyer,key(),{orderId:order.id});await assert.rejects(()=>simulateCheckout(pool,buyer,intent.id,{method:'CARD',cardId:other.id}));await cancelOrder(pool,buyer,order.id,{reason:'Cancelar pedido de prueba'});
 });
 test('HTTP checkout authenticates the customer, stores a masked card and pays without a quotation',async()=>{
  const loginResult=await login(pool,{company:slug,email:'buyer@example.test',password:'Direct-test-password-123!'});
  const context=(path:string)=>({params:Promise.resolve({path:path.split('/')})});
  const request=(path:string,body?:unknown,token=loginResult.token)=>new Request('http://localhost:3000/api/'+path,{method:body===undefined?'GET':'POST',headers:{cookie:'nexo_session='+token,origin:'http://localhost:3000','content-type':'application/json','idempotency-key':key()},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal((await GET(request('customer/profile',undefined,''),context('customer/profile'))).status,401);
  const profile=await GET(request('customer/profile'),context('customer/profile'));assert.equal(profile.status,200);assert.equal((await profile.json()).defaultAddress.commune,'Curicó');
  const estimate=await POST(request(`public/${slug}/shipping-estimate`,{rateId:rate.id,items:items()}),context(`public/${slug}/shipping-estimate`));assert.equal(estimate.status,200);assert.equal((await estimate.json()).shippingMinor,'3990');
  const cardResponse=await POST(request('customer/test-cards',{label:'Tarjeta HTTP',number:'4000000000000010'}),context('customer/test-cards'));assert.equal(cardResponse.status,201);const card=await cardResponse.json();assert.equal(card.last_four,'0010');assert.equal(card.number,undefined);
  const created=await POST(request('orders',draft()),context('orders'));assert.equal(created.status,201);const order=await created.json();assert.equal(order.shipping_quote_id,null);
  const pay=await POST(request('payments/intents',{orderId:order.id}),context('payments/intents'));assert.equal(pay.status,201);const intent=await pay.json();
  const paid=await POST(request(`payments/intents/${intent.id}/simulate`,{method:'CARD',cardId:card.id}),context(`payments/intents/${intent.id}/simulate`));assert.equal(paid.status,200);
  const detail=await GET(request(`orders/${order.id}`),context(`orders/${order.id}`));const value=await detail.json();assert.equal(value.status,'PAID');assert.equal(value.testPayment.card_last_four,'0010');
  const history=await GET(request('orders'),context('orders'));assert.ok((await history.json()).items.some((row:any)=>row.id===order.id));assert.equal((await pool.query('SELECT count(*)::int n FROM shipping_quotes')).rows[0].n,0);
 });
 test('test cards and simulated payments are unavailable in production',async()=>{
  Object.assign(process.env,{NODE_ENV:'production'});try{await assert.rejects(()=>listTestCards(pool,buyer));await assert.rejects(()=>saveTestCard(pool,buyer,{label:'No permitido',number:'4000000000000010'}));}finally{Object.assign(process.env,{NODE_ENV:'test'});}
 });
});
