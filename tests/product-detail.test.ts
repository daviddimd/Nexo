import {before,after,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,type Actor} from '../src/server/auth';
import {createProduct,patchProduct,createLocation,createUser,patchLocation} from '../src/server/manage';
import {createOnlineOrder} from '../src/server/orders';
import {applyOperation} from '../src/server/inventory';
import {listCategories} from '../src/server/categories';
import {managedProductDetail,publicProductDetail} from '../src/server/product-detail';
const code=(value:string)=>(error:unknown)=>(error as {code:string}).code===value;
describe('Fichas individuales de producto',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
 let admin:Pool,pool:Pool,owner:Actor,foreign:Actor,agent:Actor,customer:Actor,slug:string,productId:string,storeId:string,webId:string,inactiveId:string;
 const schema='nexo_detail_test_'+randomUUID().replaceAll('-','');
 before(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);admin=new Pool({connectionString:url.toString()});await admin.query('CREATE SCHEMA "'+schema+'"');url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);
  slug='detail-'+randomUUID().slice(0,8);const a=await createCompany(pool,{slug,name:'Detail company',email:'owner@example.test',password:'Product-detail-password-123!'});owner={id:a.userId,company_id:a.companyId,name:'Owner',role:'OWNER'};
  const b=await createCompany(pool,{slug:'foreign-'+randomUUID().slice(0,8),name:'Other',email:'owner@example.test',password:'Product-detail-password-123!'});foreign={id:b.userId,company_id:b.companyId,name:'Foreign',role:'OWNER'};
  webId=(await createLocation(pool,owner,{name:'Web',kind:'WEB'})).id;storeId=(await createLocation(pool,owner,{name:'Centro',kind:'STORE'})).id;inactiveId=(await createLocation(pool,owner,{name:'Inactive',kind:'STORE'})).id;
  for(const role of ['AGENT','CUSTOMER'] as const){const user=await createUser(pool,owner,{name:role,email:role.toLowerCase()+'@example.test',password:'Product-detail-password-123!',role,locationIds:role==='AGENT'?[storeId]:[]});const actor={id:user.id,company_id:owner.company_id,name:role,role};if(role==='AGENT')agent=actor;else customer=actor;}
  const category=(await listCategories(pool,owner)).items.find(c=>c.slug==='ssd')!;
  productId=(await createProduct(pool,owner,{sku:'DETAIL-SSD',name:'SSD detail',description:'Descripción de la ficha',priceMinor:64990,categoryId:category.id,specifications:{brand:'Example',capacity_gb:1000,dram:false}})).id;
  for(const [locationId,quantity] of [[webId,10],[storeId,5],[inactiveId,2]] as const)await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId,locationId,quantity,reason:'Detail fixture'});
  await patchLocation(pool,owner,inactiveId,{active:false});
  await createOnlineOrder(pool,customer,randomUUID(),{fulfillment:'PICKUP',locationId:storeId,items:[{productId,quantity:2}]});
 });
 after(async()=>{await pool?.end();if(admin){await admin.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.end();}});
 test('ficha pública tiene especificaciones y disponible, sin cantidades privadas',async()=>{
  const detail=await publicProductDetail(pool,slug,productId);assert.equal(detail.product.name,'SSD detail');assert.equal(detail.product.price_minor,'64990');assert.equal(detail.product.specifications.dram,false);assert.equal(detail.product.specifications.capacity_gb,1000);assert.equal(detail.categoryPath,'Componentes / Almacenamiento / SSD');
  assert.equal(detail.availability.length,2);assert.equal(detail.availability.find(l=>l.locationId===storeId)?.available,3);assert.ok(detail.availability.every(l=>l.active&&!Object.hasOwn(l,'onHand')&&!Object.hasOwn(l,'reserved')));assert.ok(!Object.hasOwn(detail.company,'reservation_minutes'));
 });
 test('ficha interna respeta sucursales asignadas y ofrece stock físico y reservado',async()=>{
  const scoped=await managedProductDetail(pool,agent,productId);assert.equal(scoped.availability.length,1);assert.equal(scoped.availability[0].locationId,storeId);assert.equal(scoped.availability[0].onHand,5);assert.equal(scoped.availability[0].reserved,2);assert.equal(scoped.availability[0].available,3);
  const all=await managedProductDetail(pool,owner,productId);assert.equal(all.availability.length,3);assert.equal(all.availability.find(l=>l.locationId===inactiveId)?.active,false);
  await assert.rejects(()=>managedProductDetail(pool,customer,productId),code('FORBIDDEN'));
 });
 test('no permite consultar producto de otra empresa ni uno inexistente',async()=>{
  await assert.rejects(()=>managedProductDetail(pool,foreign,productId),code('PRODUCT_NOT_FOUND'));
  const foreignSlug=(await pool.query('SELECT slug FROM companies WHERE id=$1',[foreign.company_id])).rows[0].slug;
  await assert.rejects(()=>publicProductDetail(pool,foreignSlug,productId),code('PRODUCT_NOT_FOUND'));
  await assert.rejects(()=>publicProductDetail(pool,slug,randomUUID()),code('PRODUCT_NOT_FOUND'));
  await assert.rejects(()=>publicProductDetail(pool,'missing-company',productId),code('PRODUCT_NOT_FOUND'));
 });
 test('productos inactivos quedan ocultos en público y consultables por personal',async()=>{
  const hidden=await createProduct(pool,owner,{sku:'HIDDEN',name:'Inactive product',priceMinor:100});await patchProduct(pool,owner,hidden.id,{active:false});
  await assert.rejects(()=>publicProductDetail(pool,slug,hidden.id),code('PRODUCT_NOT_FOUND'));
  const result=await managedProductDetail(pool,owner,hidden.id);assert.equal(result.product.active,false);assert.equal(result.categoryPath,'');assert.deepEqual(result.fields,[]);
 });
});
