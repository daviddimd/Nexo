import {before,after,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import sharp from 'sharp';
import {migrate} from '../scripts/migrate';
import {createCompany,type Actor} from '../src/server/auth';
import {createLocation,createUser,createProduct,patchProduct,patchLocation} from '../src/server/manage';
import {applyOperation} from '../src/server/inventory';
import {createLocalSale,createOnlineOrder,getOrder} from '../src/server/orders';
import {createPaymentIntent} from '../src/server/payments';
import {simulateCheckout} from '../src/server/demo-checkout';
import {businessReport} from '../src/server/reports';
import {uploadProductImage,publicProductImage} from '../src/server/product-images';
import {managedProducts,inventoryMatrix} from '../src/server/catalog';
import {dashboardSummary} from '../src/server/dashboard';
import {requestShippingQuote} from '../src/server/shipping';
import {refundPayment} from '../src/server/aftersales';
describe('Reports, product images and customer simulator',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
 const schema=`nexo_remaining_test_${randomUUID().replaceAll('-','')}`,password='Nexo-integration-password-123!';
 let admin:Pool,pool:Pool,owner:Actor,agent:Actor,buyer:Actor,foreign:Actor,branch:string,otherBranch:string,product:string,slug:string;
 before(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options',`-c search_path=${schema}`);pool=new Pool({connectionString:url.toString()});await migrate(pool);
  slug=`features-${randomUUID().slice(0,8)}`;const c=await createCompany(pool,{slug,name:'Features',email:'owner@example.test',password});owner={id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER'};
  const other=await createCompany(pool,{slug:`other-${randomUUID().slice(0,8)}`,name:'Other',email:'owner@example.test',password});foreign={id:other.userId,company_id:other.companyId,name:'Other',role:'OWNER'};
  branch=(await createLocation(pool,owner,{name:'Centro',kind:'STORE'})).id;otherBranch=(await createLocation(pool,owner,{name:'Norte',kind:'STORE'})).id;
  for(const role of ['AGENT','CUSTOMER'] as const){const u=await createUser(pool,owner,{name:role,email:`${role.toLowerCase()}@example.test`,password,role,locationIds:role==='AGENT'?[branch]:[]});const actor={id:u.id,company_id:c.companyId,name:u.name,role};if(role==='AGENT')agent=actor;else buyer=actor;}
  product=(await createProduct(pool,owner,{sku:'TEST-IMAGE',name:'Producto de prueba',priceMinor:10000})).id;
  for(const locationId of [branch,otherBranch])await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:product,locationId,quantity:10,reason:'Recepción de pruebas'});
  Object.assign(process.env,{NODE_ENV:'test',NEXO_SIMULATOR_ENABLED:'true',NEXO_SIMULATOR_SECRETS:JSON.stringify({[c.companyId]:randomBytes(32).toString('hex')})});
 });
 after(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
 test('uploaded images are normalized, public only for the correct active product and isolated by company',async()=>{
  const bytes=await sharp({create:{width:12,height:12,channels:3,background:'#155A83'}}).png().toBuffer();
  const request=()=>new Request('http://localhost/api/image',{method:'POST',headers:{'content-type':'image/png'},body:new Uint8Array(bytes)});
  await assert.rejects(()=>uploadProductImage(pool,buyer,product,request()),(e:any)=>e.code==='FORBIDDEN');
  await assert.rejects(()=>uploadProductImage(pool,foreign,product,request()),(e:any)=>e.code==='PRODUCT_NOT_FOUND');
  await uploadProductImage(pool,owner,product,request());const image=await publicProductImage(pool,slug,product);assert.equal(image.headers.get('content-type'),'image/webp');assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format,'webp');
  await assert.rejects(()=>uploadProductImage(pool,owner,product,new Request('http://localhost/image',{method:'POST',headers:{'content-type':'image/png'},body:'not an image'})),(e:any)=>e.code==='INVALID_IMAGE');
  await patchProduct(pool,owner,product,{active:false});await assert.rejects(()=>publicProductImage(pool,slug,product),(e:any)=>e.code==='IMAGE_NOT_FOUND');await patchProduct(pool,owner,product,{active:true});
 });
 test('reports scope sales and stock alerts to assigned locations',async()=>{
  await createLocalSale(pool,owner,randomUUID(),{locationId:branch,items:[{productId:product,quantity:2}],payment:{amountMinor:'20000',method:'CASH',reference:'report-centro'}});
  await createLocalSale(pool,owner,randomUUID(),{locationId:otherBranch,items:[{productId:product,quantity:1}],payment:{amountMinor:'10000',method:'CASH',reference:'report-norte'}});
  const period={from:new Date(Date.now()-86400000).toISOString().slice(0,10),to:new Date(Date.now()+86400000).toISOString().slice(0,10),threshold:9};
  const report=await businessReport(pool,agent,period);assert.equal(report.sales.length,1);assert.equal(report.sales[0].gross,'20000');assert.ok(report.lowStock.every(r=>r.location==='Centro'));assert.equal((await businessReport(pool,foreign,period)).sales.length,0);
  await assert.rejects(()=>businessReport(pool,buyer,period),(e:any)=>e.code==='FORBIDDEN');
 });
 test('customer simulator applies once and remains unavailable in production',async()=>{
  const order=await createOnlineOrder(pool,buyer,randomUUID(),{fulfillment:'PICKUP',locationId:branch,items:[{productId:product,quantity:1}]});
  const intent=await createPaymentIntent(pool,buyer,randomUUID(),{orderId:order.id});
  assert.equal((await simulateCheckout(pool,buyer,intent.id)).result,'APPLIED');assert.equal((await simulateCheckout(pool,buyer,intent.id)).replayed,true);assert.equal((await getOrder(pool,buyer,order.id)).status,'PAID');
  assert.equal((await pool.query('SELECT on_hand FROM stock WHERE company_id=$1 AND product_id=$2 AND location_id=$3',[owner.company_id,product,branch])).rows[0].on_hand,7);
  Object.assign(process.env,{NODE_ENV:'production'});try{await assert.rejects(()=>simulateCheckout(pool,buyer,intent.id),(e:any)=>e.code==='SIMULATOR_DISABLED');}finally{Object.assign(process.env,{NODE_ENV:'test'});}
 });
 test('catalog filters apply before pagination and keep inactive and foreign products separate',async()=>{
  const late=await createProduct(pool,owner,{sku:'ZZ-ULTIMO',name:'ZZ Producto filtrado',priceMinor:2500});
  const inactive=await createProduct(pool,owner,{sku:'ZZ-INACTIVO',name:'ZZ Inactivo',priceMinor:2500});await patchProduct(pool,owner,inactive.id,{active:false});
  await createProduct(pool,foreign,{sku:'ZZ-ULTIMO',name:'ZZ Producto ajeno',priceMinor:2500});
  const result=await managedProducts(pool,owner,1,0,{q:'ultimo',status:'active'});assert.deepEqual(result.items.map(p=>p.id),[late.id]);
  assert.equal((await managedProducts(pool,owner,1,1,{q:'ultimo'})).items.length,0);
  assert.deepEqual((await managedProducts(pool,owner,10,0,{status:'inactive'})).items.map(p=>p.id),[inactive.id]);
  assert.equal((await managedProducts(pool,owner,10,0,{q:'%'})).items.length,0);
 });
 test('inventory filters use available stock, keep complete products and enforce branch permissions',async()=>{
  const low=await createProduct(pool,owner,{sku:'FILTRO-BAJO',name:'ZZ Filtro bajo',priceMinor:1000});
  await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:low.id,locationId:branch,quantity:3,reason:'Stock bajo de prueba'});
  const page=await inventoryMatrix(pool,owner,1,0,{q:'filtro-bajo',availability:'low'});assert.equal(page.productCount,1);assert.equal(page.items.length,2);assert.ok(page.items.every(i=>i.product_id===low.id));
  assert.equal((await inventoryMatrix(pool,owner,1,1,{q:'filtro-bajo',availability:'low'})).items.length,0);
  assert.equal((await inventoryMatrix(pool,agent,50,0,{locationId:otherBranch})).items.length,0);
  const scoped=await inventoryMatrix(pool,agent,50,0,{q:'FILTRO-BAJO',locationId:branch,availability:'available'});assert.equal(scoped.items.length,1);assert.equal(scoped.items[0].available,3);
  await createOnlineOrder(pool,buyer,randomUUID(),{fulfillment:'PICKUP',locationId:branch,items:[{productId:low.id,quantity:3}]});
  assert.equal((await inventoryMatrix(pool,agent,50,0,{q:'FILTRO-BAJO',availability:'available'})).items.length,0);
  const empty=await inventoryMatrix(pool,agent,50,0,{q:'FILTRO-BAJO',availability:'empty'});assert.equal(empty.items[0].on_hand,3);assert.equal(empty.items[0].available,0);
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{availability:'invalid'}));
 });
 test('inventory sorting covers full filtered results and uses only authorized location totals',async()=>{
  const ids:string[]=[];
  for(const [sku,name,quantity] of [['SORT-C','Orden A',1],['SORT-A','Orden Z',3],['SORT-B','Orden M',2]] as const){
    const p=await createProduct(pool,owner,{sku,name,priceMinor:1000});ids.push(p.id);
    await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:p.id,locationId:branch,quantity,reason:'Ordenación de prueba'});
  }
  await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:ids[0],locationId:otherBranch,quantity:100,reason:'Existencias de otra ubicación'});
  const first=await inventoryMatrix(pool,owner,1,0,{q:'SORT-',sort:'name_asc'}),second=await inventoryMatrix(pool,owner,1,1,{q:'SORT-',sort:'name_asc'});
  assert.equal(first.items.length,2);assert.ok(first.items.every(i=>i.product_id===ids[0]));assert.ok(second.items.every(i=>i.product_id===ids[2]));
  assert.equal((await inventoryMatrix(pool,owner,1,0,{q:'SORT-',sort:'name_desc'})).items[0].product_id,ids[1]);
  assert.equal((await inventoryMatrix(pool,owner,1,0,{q:'SORT-',sort:'sku_asc'})).items[0].product_id,ids[1]);
  assert.equal((await inventoryMatrix(pool,owner,1,0,{q:'SORT-',sort:'sku_desc'})).items[0].product_id,ids[0]);
  assert.equal((await inventoryMatrix(pool,owner,1,0,{q:'SORT-',sort:'stock_desc'})).items[0].product_id,ids[0]);
  assert.equal((await inventoryMatrix(pool,agent,1,0,{q:'SORT-',sort:'stock_desc'})).items[0].product_id,ids[1]);
  assert.equal((await inventoryMatrix(pool,owner,1,0,{q:'SORT-',locationId:branch,sort:'stock_asc'})).items[0].product_id,ids[0]);
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{sort:'DROP TABLE products'}));
 });
 test('dashboard totals cover all authorized data and exclude refunded pending deliveries',async()=>{
  await patchLocation(pool,owner,branch,{shippingEnabled:true});
  await requestShippingQuote(pool,buyer,randomUUID(),{items:[{productId:product,quantity:1}],address:{recipient:'Cliente de prueba',phone:'+56000000000',line1:'Dirección ficticia 123',commune:'Talca',region:'Maule',country:'CL'}});
  const own=await dashboardSummary(pool,owner),scoped=await dashboardSummary(pool,agent),other=await dashboardSummary(pool,foreign);
  assert.equal(own.sales_minor,'40000');assert.equal(scoped.sales_minor,'30000');assert.equal(scoped.sales_count,2);
  assert.equal(scoped.awaiting_delivery,1);assert.equal(scoped.awaiting_quotes,1);assert.ok(scoped.alerts.every((a:{location:string})=>a.location==='Centro'));
  assert.ok(scoped.empty_stock_count>=1);assert.equal(other.sales_minor,'0');assert.equal(other.awaiting_quotes,0);assert.equal(other.low_stock_count,0);
  await assert.rejects(()=>dashboardSummary(pool,buyer),(e:any)=>e.code==='FORBIDDEN');
  const capture=(await pool.query("SELECT id FROM payment_captures WHERE company_id=$1 AND disposition='APPLIED'",[owner.company_id])).rows[0];
  await refundPayment(pool,owner,randomUUID(),{captureId:capture.id},{amountMinor:'10000',reason:'Reembolso antes de entregar'});
  const after=await dashboardSummary(pool,agent);assert.equal(after.awaiting_delivery,0);assert.equal(after.sales_minor,'30000');
 });
});
