import {before,after,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,type Actor} from '../src/server/auth';
import {createProduct,createLocation,patchLocation,patchProduct} from '../src/server/manage';
import {listCategories} from '../src/server/categories';
import {applyOperation} from '../src/server/inventory';
import {publicCatalog,publicFacets} from '../src/server/catalog';
describe('Catálogo público de la empresa',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
 let admin:Pool,pool:Pool,owner:Actor,slug:string,ssd:string,components:string,foreignCategory:string,store:string,hiddenStore:string;
 const schema='nexo_store_test_'+randomUUID().replaceAll('-','');
 before(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);admin=new Pool({connectionString:url.toString()});await admin.query('CREATE SCHEMA "'+schema+'"');url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);
  slug='store-'+randomUUID().slice(0,8);const company=await createCompany(pool,{slug,name:'Store company',email:'owner@example.test',password:'Store-catalog-password-123!'});owner={id:company.userId,company_id:company.companyId,name:'Owner',role:'OWNER'};
  const categories=(await listCategories(pool,owner)).items;ssd=categories.find(category=>category.slug==='ssd')!.id;components=categories.find(category=>category.slug==='componentes')!.id;
  const other=await createCompany(pool,{slug:'other-'+randomUUID().slice(0,8),name:'Other',email:'owner@example.test',password:'Store-catalog-password-123!'});foreignCategory=(await listCategories(pool,{...owner,company_id:other.companyId,id:other.userId})).items[0].id;
  store=(await createLocation(pool,owner,{name:'Centro',kind:'STORE'})).id;hiddenStore=(await createLocation(pool,owner,{name:'Cerrada',kind:'STORE'})).id;
  for(const [sku,name,price,capacity,active] of [['SSD-A','Alpha SSD',100,128,true],['SSD-B','Beta SSD',300,512,true],['SSD-C','Charlie SSD',200,512,true],['SSD-H','Hidden SSD',400,512,false]] as const){const product=await createProduct(pool,owner,{sku,name,priceMinor:price,categoryId:ssd,specifications:{capacity_gb:capacity,dram:false,brand:'Example'}});if(sku==='SSD-B')await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:product.id,locationId:store,quantity:3,reason:'Public catalog fixture'});else await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:product.id,locationId:hiddenStore,quantity:2,reason:'Hidden stock fixture'});if(!active)await patchProduct(pool,owner,product.id,{active:false});}
  await patchLocation(pool,owner,hiddenStore,{active:false});
 });
 after(async()=>{await pool?.end();if(admin){await admin.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.end();}});
 test('combina categorías descendientes, características tipadas y precio antes de paginar',async()=>{
  assert.equal((await publicCatalog(pool,slug,24,0,{categoryId:components})).products.length,3);
  const result=await publicCatalog(pool,slug,1,0,{categoryId:ssd,priceMin:'150',priceMax:'350',specs:JSON.stringify({capacity_gb:512,dram:false}),sort:'price_desc'});assert.deepEqual(result.products.map(product=>product.sku),['SSD-B']);
  const next=await publicCatalog(pool,slug,1,1,{categoryId:ssd,priceMin:'150',priceMax:'350',specs:JSON.stringify({capacity_gb:512,dram:false}),sort:'price_desc'});assert.deepEqual(next.products.map(product=>product.sku),['SSD-C']);
 });
 test('búsqueda por SKU y orden de precio ascendente funcionan en todo el catálogo',async()=>{
  assert.deepEqual((await publicCatalog(pool,slug,24,0,{q:'ssd-c'})).products.map(product=>product.sku),['SSD-C']);
  assert.deepEqual((await publicCatalog(pool,slug,24,0,{sort:'price_asc'})).products.map(product=>product.sku),['SSD-A','SSD-C','SSD-B']);
 });
 test('stock público excluye tiendas inactivas, productos inactivos y cantidades privadas',async()=>{
  const result=await publicCatalog(pool,slug,24,0,{available:'available'});assert.deepEqual(result.products.map(product=>product.sku),['SSD-B']);assert.equal(result.products[0].availability[0].available,3);assert.equal(result.locations.length,1);assert.equal(result.locations[0].id,store);assert.ok(!Object.hasOwn(result.products[0].availability[0],'reserved'));assert.ok(!Object.hasOwn(result.products[0].availability[0],'on_hand'));
  const empty=await publicCatalog(pool,slug,24,0,{q:'SSD-A'});assert.equal(empty.products[0].availability[0].available,0);
 });
 test('rechaza categorías ajenas, características inválidas y rangos invertidos',async()=>{
  await assert.rejects(()=>publicCatalog(pool,slug,24,0,{categoryId:foreignCategory}));await assert.rejects(()=>publicCatalog(pool,slug,24,0,{categoryId:ssd,specs:JSON.stringify({dram:'false'})}));await assert.rejects(()=>publicCatalog(pool,slug,24,0,{priceMin:'300',priceMax:'100'}));await assert.rejects(()=>publicCatalog(pool,slug,24,0,{sort:'price_minor; DROP TABLE products'}));
 });
 test('facetas públicas distinguen marcas, modelos y valores reales sin depender de la página',async()=>{
  await pool.query("UPDATE products SET specifications=specifications || '{\"model\":\"Alpha-128\"}'::jsonb WHERE company_id=$1 AND sku='SSD-A'",[owner.company_id]);
  await pool.query("UPDATE products SET specifications=specifications || '{\"model\":\"Beta-512\"}'::jsonb WHERE company_id=$1 AND sku='SSD-B'",[owner.company_id]);
  await pool.query("UPDATE products SET specifications=specifications || '{\"brand\":\"Hidden brand\",\"model\":\"Secret model\"}'::jsonb WHERE company_id=$1 AND sku='SSD-H'",[owner.company_id]);
  await createProduct(pool,owner,{sku:'OTHER-SSD',name:'Other manufacturer',priceMinor:100,categoryId:ssd,specifications:{brand:'Other',model:'Gamma',capacity_gb:1000,dram:true}});
  const all=await publicFacets(pool,slug,{categoryId:ssd});assert.deepEqual(all.values.brand,['Example','Other']);assert.deepEqual(all.values.capacity_gb,[128,512,1000]);
  const scoped=await publicFacets(pool,slug,{categoryId:ssd,brand:'Example',modelQ:'BETA'});assert.deepEqual(scoped.values.brand,['Example','Other']);assert.deepEqual(scoped.values.model,['Beta-512']);assert.deepEqual(scoped.values.dram,[false]);assert.deepEqual(scoped.values.capacity_gb,[128,512]);
  const second=await publicFacets(pool,slug,{categoryId:ssd,brand:'Other'});assert.deepEqual(second.values.model,['Gamma']);assert.deepEqual(second.values.dram,[true]);assert.deepEqual(second.values.capacity_gb,[1000]);
  const filtered=await publicCatalog(pool,slug,24,0,{categoryId:ssd,specs:JSON.stringify({brand:'Example',model:'Beta-512',dram:false})});assert.deepEqual(filtered.products.map(product=>product.sku),['SSD-B']);
  const parent=await publicFacets(pool,slug,{categoryId:components});assert.deepEqual(parent.values.brand,['Example','Other']);assert.ok(!Object.hasOwn(parent.values,'capacity_gb'));
  await assert.rejects(()=>publicFacets(pool,slug,{categoryId:foreignCategory}));await assert.rejects(()=>publicFacets(pool,'absent-company',{categoryId:ssd}));
 });

 test('la página de marca agrupa categorías sin incluir productos de otra marca',async()=>{
  const monitor=(await listCategories(pool,owner)).items.find(category=>category.slug==='monitores-escritorio')!;await createProduct(pool,owner,{sku:'EXAMPLE-MONITOR',name:'Example monitor',priceMinor:500,categoryId:monitor.id,specifications:{brand:'Example',model:'Display 24'}});
  const found=await publicCatalog(pool,slug,24,0,{brand:'Example'});assert.deepEqual(found.products.map(product=>product.sku),['SSD-A','SSD-B','SSD-C','EXAMPLE-MONITOR']);
  assert.equal((await publicCatalog(pool,slug,24,0,{brand:'Hidden brand'})).products.length,0);
  assert.equal((await publicCatalog(pool,slug,24,0,{brand:'Unknown'})).products.length,0);
  assert.deepEqual((await publicCatalog(pool,slug,24,0,{brand:'Other',categoryId:components})).products.map(product=>product.sku),['OTHER-SSD']);
 });

});
