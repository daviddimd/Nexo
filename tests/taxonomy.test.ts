import {applyOperation} from '../src/server/inventory';
import {before,after,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,type Actor} from '../src/server/auth';
import {createProduct,patchProduct,createUser,createLocation} from '../src/server/manage';
import {createCategory,renameCategory,listCategories} from '../src/server/categories';
import {managedProducts,publicCatalog,inventoryMatrix,inventoryFacets} from '../src/server/catalog';
import {demoProducts} from '../scripts/demo-products';
import {technologyCategories,type Category} from '../src/catalog/taxonomy';
const code=(expected:string)=>(error:unknown)=>(error as {code:string}).code===expected;
describe('Categorías y especificaciones tipadas',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
 let admin:Pool,pool:Pool,owner:Actor,foreign:Actor,agent:Actor,customer:Actor,categories:Category[],foreignCategories:Category[],slug:string;
 const schema='nexo_taxonomy_test_'+randomUUID().replaceAll('-','');
 before(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options',`-c search_path=${schema}`);pool=new Pool({connectionString:url.toString()});await migrate(pool);
  slug='taxonomy-'+randomUUID().slice(0,8);const a=await createCompany(pool,{slug,name:'Taxonomy',email:'owner@example.test',password:'Taxonomy-password-123!'});owner={id:a.userId,company_id:a.companyId,name:'Owner',role:'OWNER'};
  const b=await createCompany(pool,{slug:'other-'+randomUUID().slice(0,8),name:'Other',email:'owner@example.test',password:'Taxonomy-password-123!'});foreign={id:b.userId,company_id:b.companyId,name:'Other',role:'OWNER'};
  categories=(await listCategories(pool,owner)).items;foreignCategories=(await listCategories(pool,foreign)).items;
  for(const role of ['AGENT','CUSTOMER'] as const){const user=await createUser(pool,owner,{name:role,email:role.toLowerCase()+'@example.test',password:'Taxonomy-password-123!',role});const actor={id:user.id,company_id:owner.company_id,name:role,role};if(role==='AGENT')agent=actor;else customer=actor;}
 });
 after(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
 const category=(slug:string)=>categories.find(c=>c.slug===slug)!;
 test('plantilla independiente por empresa y especificaciones heredadas',async()=>{
  assert.equal(categories.length,technologyCategories.length);assert.notEqual(category('ssd').id,foreignCategories.find(c=>c.slug==='ssd')!.id);
  assert.equal(category('ssd').path,'Componentes / Almacenamiento / SSD');assert.ok(category('ssd').fields.some(f=>f.key==='capacity_gb'&&f.type==='number'));
  assert.ok(category('monitores-escritorio').fields.some(f=>f.key==='refresh_hz'));assert.equal(category('monitores-escritorio').fields.filter(f=>f.key==='brand').length,1);
  await assert.rejects(()=>listCategories(pool,customer),code('FORBIDDEN'));
 });
 test('categorías personalizadas requieren propietario y respetan aislamiento e identidad',async()=>{
  await assert.rejects(()=>createCategory(pool,agent,{name:'Custom',slug:'custom'}),code('FORBIDDEN'));
  await assert.rejects(()=>createCategory(pool,owner,{name:'Foreign',slug:'foreign',parentId:foreignCategories[0].id}),code('CATEGORY_INVALID'));
  await assert.rejects(()=>createCategory(pool,owner,{name:'Duplicate',slug:'duplicate',parentId:category('ssd').id,attributes:[{key:'capacity_gb',label:'Capacidad',type:'text'}]}),code('ATTRIBUTE_DUPLICATE'));
  const added=await createCategory(pool,owner,{name:'SSD industriales',slug:'ssd-industriales',parentId:category('ssd').id,attributes:[{key:'temperature_c',label:'Temperatura máxima',type:'number',unit:'°C',min:0,max:150}]});
  assert.ok(added.fields.some(f=>f.key==='capacity_gb'));assert.ok(added.fields.some(f=>f.key==='temperature_c'));
  await renameCategory(pool,owner,added.id,{name:'SSD de uso industrial'});assert.equal((await listCategories(pool,owner)).items.find(c=>c.id===added.id)?.name,'SSD de uso industrial');
  await assert.rejects(()=>pool.query('UPDATE categories SET parent_id=NULL WHERE company_id=$1 AND id=$2',[owner.company_id,added.id]));
  await assert.rejects(()=>renameCategory(pool,foreign,added.id,{name:'Other'}),code('CATEGORY_NOT_FOUND'));
 });
 test('valida tipos, valores permitidos y categoría de la empresa',async()=>{
  const base={sku:'INVALID',name:'Invalid',priceMinor:1000,categoryId:category('ssd').id};
  await assert.rejects(()=>createProduct(pool,owner,{...base,specifications:{capacity_gb:'512'}}),code('SPECIFICATION_INVALID'));
  await assert.rejects(()=>createProduct(pool,owner,{...base,specifications:{refresh_hz:144}}),code('SPECIFICATION_INVALID'));
  await assert.rejects(()=>createProduct(pool,owner,{...base,specifications:{interface:'Unlisted'}}),code('SPECIFICATION_INVALID'));
  await assert.rejects(()=>createProduct(pool,owner,{...base,specifications:{capacity_gb:-1}}),code('SPECIFICATION_INVALID'));
  await assert.rejects(()=>createProduct(pool,owner,{...base,categoryId:foreignCategories[0].id}),code('CATEGORY_INVALID'));
  await assert.rejects(()=>createProduct(pool,owner,{...base,categoryId:null,specifications:{brand:'Example'}}),code('CATEGORY_REQUIRED'));
  await assert.rejects(()=>pool.query('INSERT INTO products(id,company_id,sku,name,price_minor,category_id) VALUES($1,$2,$3,$4,0,$5)',[randomUUID(),owner.company_id,'FK-TEST','Invalid FK',foreignCategories[0].id]),code('23503'));
 });
 test('ediciones preservan metadata; cambio de categoría exige revisar la ficha',async()=>{
  const p=await createProduct(pool,owner,{sku:'EDIT',name:'Edit',description:'Descripción conservada',imageUrl:'https://example.test/image.webp',priceMinor:1000,categoryId:category('ssd').id,specifications:{capacity_gb:512,dram:false}});
  const updated=await patchProduct(pool,owner,p.id,{priceMinor:2000});assert.equal(updated.category_id,p.category_id);assert.equal(updated.description,p.description);assert.equal(updated.image_url,p.image_url);assert.deepEqual(updated.specifications,{capacity_gb:512,dram:false});
  await assert.rejects(()=>patchProduct(pool,owner,p.id,{categoryId:category('monitores-escritorio').id}),code('SPECIFICATIONS_REQUIRED'));
  await assert.rejects(()=>patchProduct(pool,owner,p.id,{categoryId:category('monitores-escritorio').id,specifications:{capacity_gb:512}}),code('SPECIFICATION_INVALID'));
  const changed=await patchProduct(pool,owner,p.id,{categoryId:category('monitores-escritorio').id,specifications:{resolution:'2560x1440',refresh_hz:165,curved:false}});assert.equal(changed.specifications.refresh_hz,165);
 });
 test('semilla completa válida; filtros incluyen descendientes y catálogo público expone ficha',async()=>{
  for(const product of demoProducts)await createProduct(pool,owner,{sku:product.sku,name:product.name,priceMinor:product.price,categoryId:category(product.category).id,specifications:product.specifications});
  const storage=await managedProducts(pool,owner,100,0,{categoryId:category('almacenamiento').id});assert.equal(storage.items.length,demoProducts.filter(p=>['ssd','hdd'].includes(p.category)).length);assert.ok(storage.items.every(p=>typeof p.specifications.capacity_gb==='number'));
  const leaked=await managedProducts(pool,foreign,100,0,{categoryId:category('componentes').id});assert.equal(leaked.items.length,0);
  const publicResult=await publicCatalog(pool,slug,100);publicResult.products.push(...(await publicCatalog(pool,slug,100,100)).products);assert.ok(publicResult.products.some(p=>p.specifications.capacity_gb===128));assert.ok(publicResult.products.some(p=>p.specifications.capacity_gb===1000));assert.ok(publicResult.products.some(p=>p.specifications.resolution==='3840x2160'));
  const ancestors=publicResult.categories.find(c=>c.slug==='monitores-escritorio')!;assert.ok(ancestors.fields.some(f=>f.key==='refresh_hz'));
 });

 test('filtros de inventario combinan precio, categoría descendiente y especificaciones antes de paginar',async()=>{
  const branch=await createLocation(pool,owner,{name:'Filter branch',kind:'STORE'}),web=await createLocation(pool,owner,{name:'Filter web',kind:'WEB'});
  for(const [index,capacity] of [512,1000,1000].entries()){
   const p=await createProduct(pool,owner,{sku:'FILTER-'+index,name:'FILTER '+index,priceMinor:[40000,65000,95000][index],categoryId:category('ssd').id,specifications:{brand:'Example',capacity_gb:capacity}});
   for(const location of [branch,web])await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:p.id,locationId:location.id,quantity:location.id===branch.id?3:10,reason:'Filter fixture'});
  }
  const f={q:'FILTER',categoryId:category('ssd').id,specs:JSON.stringify({capacity_gb:1000})};
  const first=await inventoryMatrix(pool,owner,1,0,f),second=await inventoryMatrix(pool,owner,1,1,f);
  assert.equal(first.productCount,1);assert.equal(first.items.length,2);assert.equal(first.items[0].sku,'FILTER-1');assert.equal(second.items[0].sku,'FILTER-2');
  const combined=await inventoryMatrix(pool,owner,50,0,{...f,categoryId:category('almacenamiento').id,priceMin:'60000',priceMax:'80000',specs:JSON.stringify({capacity_gb:1000,brand:'Example'})});assert.equal(combined.productCount,1);assert.equal(combined.items[0].sku,'FILTER-1');
  const user=await createUser(pool,owner,{name:'Filter agent',email:'filter-agent@example.test',password:'Taxonomy-password-123!',role:'AGENT',locationIds:[branch.id]});const scoped={id:user.id,company_id:owner.company_id,name:user.name,role:'AGENT' as const};
  const restricted=await inventoryMatrix(pool,scoped,50,0,{...f,sort:'stock_desc'});assert.ok(restricted.items.every(item=>item.location_id===branch.id&&item.available===3));
  assert.equal((await inventoryMatrix(pool,scoped,50,0,{...f,locationId:web.id})).productCount,0);
  assert.equal((await inventoryMatrix(pool,foreign,50,0,{q:'FILTER'})).productCount,0);
 });
 test('características conservan tipos: false se diferencia de desconocido y de texto',async()=>{
  for(const [index,specifications] of [{curved:false},{curved:true},{}].entries())await createProduct(pool,owner,{sku:'BOOL-'+index,name:'BOOL '+index,priceMinor:1000,categoryId:category('monitores-escritorio').id,specifications});
  const matches=await inventoryMatrix(pool,owner,50,0,{q:'BOOL',categoryId:category('monitores').id,specs:JSON.stringify({curved:false})});assert.equal(matches.productCount,1);assert.equal(matches.items[0].sku,'BOOL-0');
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{categoryId:category('ssd').id,specs:JSON.stringify({capacity_gb:'1000'})}),code('SPECIFICATION_INVALID'));
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{categoryId:category('ssd').id,specs:JSON.stringify({refresh_hz:60})}),code('SPECIFICATION_INVALID'));
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{priceMin:'80000',priceMax:'1000'}));
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{priceMin:'-1'}));
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{priceMax:'1000000000001'}));
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{specs:'{bad json'}));
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{specs:'null'}));
  await assert.rejects(()=>inventoryMatrix(pool,owner,50,0,{specs:JSON.stringify({brand:'Example'})}),code('CATEGORY_REQUIRED'));
 });
 test('opciones de características se obtienen de todo el catálogo de la empresa',async()=>{
  const facets=await inventoryFacets(pool,owner,category('ssd').id);assert.ok(facets.fields.some(f=>f.key==='capacity_gb'));assert.ok(facets.values.capacity_gb.includes(128));assert.ok(facets.values.capacity_gb.includes(1000));assert.ok(!facets.fields.some(f=>f.key==='refresh_hz'));
  const monitor=await inventoryFacets(pool,owner,category('monitores').id);assert.ok(monitor.values.resolution.includes('3840x2160'));assert.ok(monitor.values.curved.includes(false));
  assert.deepEqual(await inventoryFacets(pool,owner,''),{fields:[],values:{}});
  await assert.rejects(()=>inventoryFacets(pool,foreign,category('ssd').id),code('CATEGORY_INVALID'));
  await assert.rejects(()=>inventoryFacets(pool,customer,category('ssd').id),code('FORBIDDEN'));
 });
});
