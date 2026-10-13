import {before,after,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import sharp from 'sharp';
import {migrate} from '../scripts/migrate';
import {createCompany,type Actor} from '../src/server/auth';
import {createLocation,createUser,createProduct,patchProduct} from '../src/server/manage';
import {applyOperation} from '../src/server/inventory';
import {createLocalSale,createOnlineOrder,getOrder} from '../src/server/orders';
import {createPaymentIntent} from '../src/server/payments';
import {simulateCheckout} from '../src/server/demo-checkout';
import {businessReport} from '../src/server/reports';
import {uploadProductImage,publicProductImage} from '../src/server/product-images';
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
});
