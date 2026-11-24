import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,type Actor} from '../src/server/auth';
import {createUser,createProduct,createLocation} from '../src/server/manage';
import {applyOperation} from '../src/server/inventory';
import {saveShippingRate,publicDeliveryRates,deliveryEstimate} from '../src/server/shipping-rates';
import {createOnlineOrder,confirmManualPayment,getOrder,fulfillOrder,listOrders} from '../src/server/orders';
import {refundPayment} from '../src/server/aftersales';
import {listDispatches,prepareShipment,dispatchShipment,updateShipment,deliverShipment} from '../src/server/dispatch';

describe('Despacho de envíos: preparación, despacho y entrega',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
 const schema='nexo_dispatch_'+randomUUID().replaceAll('-','');
 let admin:Pool,pool:Pool,owner:Actor,agentElsewhere:Actor,agentHere:Actor,buyer:Actor,foreign:Actor,product:string,rate:{id:string},store:string,other:string;
 const address={recipient:'Cliente Uno',phone:'+56900000000',line1:'Dirección de pruebas 123',commune:'Curicó',region:'Maule',country:'CL' as const};
 const key=()=>randomUUID();
 const password='Dispatch-test-password-123!';
 async function paid(){
  const order=await createOnlineOrder(pool,buyer,key(),{fulfillment:'SHIP',shippingRateId:rate.id,expectedTotalMinor:'13990',address,items:[{productId:product,quantity:1}]});
  await confirmManualPayment(pool,owner,order.id,{amountMinor:order.total_minor,method:'TRANSFER',reference:'TR-'+randomUUID().slice(0,8)});
  return order.id as string;
 }
 const stage=async(id:string,actor=owner)=>(await listDispatches(pool,actor,100,0,{})).items.find((item:{id:string})=>item.id===id)?.stage;
 before(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);
  admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options',`-c search_path=${schema}`);pool=new Pool({connectionString:url.toString()});await migrate(pool);
  const c=await createCompany(pool,{slug:'dispatch-'+randomUUID().slice(0,8),name:'Dispatch store',email:'owner@example.test',password});
  owner={id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER'};
  const o=await createCompany(pool,{slug:'foreign-'+randomUUID().slice(0,8),name:'Other',email:'owner@example.test',password});
  foreign={...owner,id:o.userId,company_id:o.companyId};
  await createLocation(pool,owner,{name:'Bodega web',kind:'WEB'});
  store=(await createLocation(pool,owner,{name:'Curicó',kind:'STORE',shippingEnabled:true})).id;
  other=(await createLocation(pool,owner,{name:'Talca',kind:'STORE',shippingEnabled:true})).id;
  const buyerRow=await createUser(pool,owner,{name:'Cliente Uno',email:'buyer@example.test',password,role:'CUSTOMER'});buyer={id:buyerRow.id,name:buyerRow.name,company_id:c.companyId,role:'CUSTOMER'};
  const here=await createUser(pool,owner,{name:'Agente',email:'here@example.test',password,role:'AGENT',locationIds:[store]});agentHere={id:here.id,name:here.name,company_id:c.companyId,role:'AGENT'};
  const away=await createUser(pool,owner,{name:'Agente otra sucursal',email:'away@example.test',password,role:'AGENT',locationIds:[other]});agentElsewhere={id:away.id,name:away.name,company_id:c.companyId,role:'AGENT'};
  product=(await createProduct(pool,owner,{sku:'ENVIO',name:'Producto',priceMinor:10000})).id;
  for(const locationId of [store])await applyOperation(pool,owner,key(),{kind:'RECEIPT',productId:product,locationId,quantity:50,reason:'Carga inicial de pruebas'});
  rate=await saveShippingRate(pool,owner,null,{city:'Curicó',region:'Maule',feeMinor:'3990',active:true});
 });
 after(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});

 test('a paid shipment starts as "por preparar" and unpaid orders never reach the board',async()=>{
  const unpaid=await createOnlineOrder(pool,buyer,key(),{fulfillment:'SHIP',shippingRateId:rate.id,expectedTotalMinor:'13990',address,items:[{productId:product,quantity:1}]});
  const id=await paid();
  const board=await listDispatches(pool,owner,100,0,{});
  assert.equal(await stage(id),'prepare');assert.equal(board.items.find((i:{id:string})=>i.id===unpaid.id),undefined);
  const row=board.items.find((i:{id:string})=>i.id===id);assert.equal(row.units,1);assert.equal(row.shipping_address.commune,'Curicó');assert.equal(row.blocked,false);
  assert.ok(board.counts.prepare>=1);assert.equal(board.late,0);
 });

 test('prepare is idempotent and keeps the order paid; dispatch records carrier and fulfils the order once',async()=>{
  const id=await paid();
  const prepared=await prepareShipment(pool,owner,id);assert.equal(prepared.replayed,false);assert.equal(prepared.status,'PAID');assert.equal(prepared.shipment.status,'PREPARING');
  assert.equal((await prepareShipment(pool,owner,id)).replayed,true);assert.equal(await stage(id),'preparing');
  await assert.rejects(()=>dispatchShipment(pool,owner,id,{carrier:'X'}),(e:any)=>e.status===400||e.name==='ZodError');
  const sent=await dispatchShipment(pool,owner,id,{carrier:'Chilexpress',trackingCode:'CX-123456',estimatedDelivery:'2030-01-15'});
  assert.equal(sent.status,'FULFILLED');assert.equal(sent.shipment.status,'DISPATCHED');assert.equal(sent.shipment.carrier,'Chilexpress');assert.equal(sent.shipment.estimated_delivery,'2030-01-15');
  assert.equal((await dispatchShipment(pool,owner,id,{carrier:'Chilexpress',trackingCode:'CX-123456',estimatedDelivery:'2030-01-15'})).replayed,true);
  await assert.rejects(()=>dispatchShipment(pool,owner,id,{carrier:'Starken',trackingCode:'ST-1'}),(e:any)=>e.code==='SHIPMENT_CONFLICT');
  assert.equal(await stage(id),'dispatched');
  const types=(await getOrder(pool,owner,id)).events.map((e:{type:string})=>e.type);assert.deepEqual(types.filter((t:string)=>['SHIPMENT_PREPARING','FULFILLED'].includes(t)),['SHIPMENT_PREPARING','FULFILLED']);
  const customerView=await getOrder(pool,buyer,id);assert.equal(customerView.shipment.tracking_code,'CX-123456');
 });

 test('dispatch without a prior preparation step creates the record, and own delivery needs no tracking code',async()=>{
  const id=await paid();
  const sent=await dispatchShipment(pool,owner,id,{carrier:'Reparto propio',trackingCode:'',estimatedDelivery:''});
  assert.equal(sent.shipment.status,'DISPATCHED');assert.equal(sent.shipment.tracking_code,null);assert.equal(sent.shipment.estimated_delivery,null);
  assert.equal((await pool.query('SELECT prepared_by FROM shipments WHERE order_id=$1',[id])).rows[0].prepared_by,owner.id);
 });

 test('corrections are audited, delivery is confirmed once and then the record is closed',async()=>{
  const id=await paid();await dispatchShipment(pool,owner,id,{carrier:'Starken',trackingCode:'ST-0001'});
  const fresh=await paid();
  await assert.rejects(()=>deliverShipment(pool,owner,fresh),(e:any)=>e.code==='SHIPMENT_NOT_DISPATCHED');
  const fixed=await updateShipment(pool,owner,id,{carrier:'Starken',trackingCode:'ST-0002'});assert.equal(fixed.shipment.tracking_code,'ST-0002');assert.equal(fixed.replayed,false);
  assert.equal((await updateShipment(pool,owner,id,{carrier:'Starken',trackingCode:'ST-0002'})).replayed,true);
  const done=await deliverShipment(pool,owner,id);assert.equal(done.shipment.status,'DELIVERED');assert.equal((await deliverShipment(pool,owner,id)).replayed,true);
  assert.equal(await stage(id),'delivered');
  await assert.rejects(()=>updateShipment(pool,owner,id,{carrier:'Starken',trackingCode:'ST-0003'}),(e:any)=>e.code==='SHIPMENT_LOCKED');
  const types=(await getOrder(pool,owner,id)).events.map((e:{type:string})=>e.type);assert.ok(types.includes('SHIPMENT_UPDATED')&&types.includes('SHIPMENT_DELIVERED'));
 });

 test('refunds block preparing and dispatching and are flagged on the board',async()=>{
  const id=await paid();
  await refundPayment(pool,owner,key(),{orderId:id},{amountMinor:'1000',reference:'REF-'+randomUUID().slice(0,8),reason:'Reembolso parcial de prueba'});
  const row=(await listDispatches(pool,owner,100,0,{})).items.find((i:{id:string})=>i.id===id);assert.equal(row.blocked,true);
  await assert.rejects(()=>prepareShipment(pool,owner,id),(e:any)=>e.code==='REFUNDED_ORDER');
  await assert.rejects(()=>dispatchShipment(pool,owner,id,{carrier:'Starken'}),(e:any)=>e.code==='REFUNDED_ORDER');
 });

 test('filters, search and per-location permissions',async()=>{
  const id=await paid();await prepareShipment(pool,owner,id);
  assert.ok((await listDispatches(pool,owner,100,0,{stage:'preparing'})).items.some((i:{id:string})=>i.id===id));
  assert.ok(!(await listDispatches(pool,owner,100,0,{stage:'delivered'})).items.some((i:{id:string})=>i.id===id));
  assert.ok((await listDispatches(pool,owner,100,0,{q:id.slice(0,8)})).items.some((i:{id:string})=>i.id===id));
  assert.equal((await listDispatches(pool,owner,100,0,{q:'%'})).items.length,0);
  assert.ok((await listDispatches(pool,agentHere,100,0,{})).items.some((i:{id:string})=>i.id===id));
  assert.equal((await listDispatches(pool,agentElsewhere,100,0,{})).items.length,0);
  await assert.rejects(()=>prepareShipment(pool,agentElsewhere,id),(e:any)=>e.code==='ORDER_NOT_FOUND');
  await assert.rejects(()=>listDispatches(pool,buyer,100,0,{}),(e:any)=>e.code==='FORBIDDEN');
  await assert.rejects(()=>dispatchShipment(pool,buyer,id,{carrier:'Starken'}),(e:any)=>e.code==='FORBIDDEN');
  assert.equal((await listDispatches(pool,foreign,100,0,{})).items.length,0);
  await assert.rejects(()=>prepareShipment(pool,foreign,id),(e:any)=>e.code==='ORDER_NOT_FOUND');
  await assert.rejects(()=>listDispatches(pool,owner,100,0,{stage:'nope'}));
 });

 test('legacy fulfilled shipments without a record are still listed and cannot be dispatched twice',async()=>{
  const id=await paid();await fulfillOrder(pool,owner,id);
  assert.equal(await stage(id),'dispatched');
  await assert.rejects(()=>dispatchShipment(pool,owner,id,{carrier:'Starken'}),(e:any)=>e.code==='ALREADY_DISPATCHED');
  await assert.rejects(()=>prepareShipment(pool,owner,id),(e:any)=>e.code==='ALREADY_DISPATCHED');
 });

 test('the database refuses shipments for unpaid or non-delivery orders, deletions and invalid transitions',async()=>{
  const unpaid=await createOnlineOrder(pool,buyer,key(),{fulfillment:'SHIP',shippingRateId:rate.id,expectedTotalMinor:'13990',address,items:[{productId:product,quantity:1}]});
  await assert.rejects(()=>pool.query('INSERT INTO shipments(id,company_id,order_id,prepared_by) VALUES($1,$2,$3,$4)',[randomUUID(),owner.company_id,unpaid.id,owner.id]));
  const id=await paid();await prepareShipment(pool,owner,id);
  await assert.rejects(()=>pool.query("UPDATE shipments SET status='DELIVERED' WHERE order_id=$1",[id]));
  await assert.rejects(()=>pool.query('DELETE FROM shipments WHERE order_id=$1',[id]));
  const pickup=await createOnlineOrder(pool,buyer,key(),{fulfillment:'PICKUP',locationId:store,items:[{productId:product,quantity:1}]});
  await assert.rejects(()=>prepareShipment(pool,owner,pickup.id),(e:any)=>e.code==='NOT_A_SHIPMENT');
 });

 test('rates can promise a delivery window; the order keeps the promise it was sold with',async()=>{
  await assert.rejects(()=>saveShippingRate(pool,owner,null,{city:'Talca',region:'Maule',feeMinor:'2990',deliveryDaysMin:2}));
  await assert.rejects(()=>saveShippingRate(pool,owner,null,{city:'Talca',region:'Maule',feeMinor:'2990',deliveryDaysMin:5,deliveryDaysMax:2}));
  await assert.rejects(()=>saveShippingRate(pool,owner,null,{city:'Talca',region:'Maule',feeMinor:'2990',deliveryDaysMin:-1,deliveryDaysMax:2}));
  const talca=await saveShippingRate(pool,owner,null,{city:'Talca',region:'Maule',feeMinor:'2990',deliveryDaysMin:2,deliveryDaysMax:4});
  assert.equal(talca.delivery_days_min,2);assert.equal(talca.delivery_days_max,4);
  const slug=(await pool.query('SELECT slug FROM companies WHERE id=$1',[owner.company_id])).rows[0].slug;
  const listed=(await publicDeliveryRates(pool,slug)).items;
  assert.equal(listed.find((r:{city:string})=>r.city==='Talca').delivery_days_max,4);assert.equal(listed.find((r:{city:string})=>r.city==='Curicó').delivery_days_min,null);
  const estimate=await deliveryEstimate(pool,slug,{rateId:talca.id,items:[{productId:product,quantity:1}]});assert.equal(estimate.deliveryDaysMin,2);assert.equal(estimate.deliveryDaysMax,4);
  const order=await createOnlineOrder(pool,buyer,key(),{fulfillment:'SHIP',shippingRateId:talca.id,expectedTotalMinor:'12990',address:{...address,commune:'Talca'},items:[{productId:product,quantity:1}]});
  assert.equal(order.delivery_days_min,2);assert.equal(order.delivery_days_max,4);
  await saveShippingRate(pool,owner,talca.id,{city:'Talca',region:'Maule',feeMinor:'2990',deliveryDaysMin:7,deliveryDaysMax:9});
  const later=await getOrder(pool,buyer,order.id);assert.equal(later.delivery_days_min,2);assert.equal(later.delivery_days_max,4);
  await saveShippingRate(pool,owner,talca.id,{city:'Talca',region:'Maule',feeMinor:'2990'});
  assert.equal((await publicDeliveryRates(pool,slug)).items.find((r:{city:string})=>r.city==='Talca').delivery_days_min,null);
  await assert.rejects(()=>pool.query('UPDATE orders SET delivery_days_min=9,delivery_days_max=3 WHERE id=$1',[order.id]));
 });

 test('the customer list exposes the delivery stage of each shipment',async()=>{
  const id=await paid();
  const stageOf=async()=>(await listOrders(pool,buyer,50,0,'SHIP')).items.find((o:{id:string})=>o.id===id).shipment_status;
  assert.equal(await stageOf(),null);
  await prepareShipment(pool,owner,id);assert.equal(await stageOf(),'PREPARING');
  await dispatchShipment(pool,owner,id,{carrier:'Starken'});assert.equal(await stageOf(),'DISPATCHED');
  await deliverShipment(pool,owner,id);assert.equal(await stageOf(),'DELIVERED');
 });
});
