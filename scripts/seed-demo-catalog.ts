import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Pool} from 'pg';
import {migrate} from './migrate';
import {backupDatabase} from './backup-store';
import {demoProducts} from './demo-products';
import {loadDemoImages,applyDemoImages} from './demo-images';
import {readCategories,validateProductMetadata} from '../src/server/categories';
import {transaction} from '../src/server/db';
import {audit} from '../src/server/audit';
import {lockCompany} from '../src/server/order-store';
import type {Actor} from '../src/server/auth';

// Maintenance command for the explicitly identified local demo. Never exposed as an HTTP route.
const mode=process.argv[2];
if(process.env.NODE_ENV==='production'||process.argv.length!==3||!['--replace','--fill','--images'].includes(mode))throw new Error('Usar demo:seed -- --fill, --images o --replace solo para la demostración local');
if(new Set(demoProducts.map(p=>p.sku)).size!==demoProducts.length)throw new Error('La semilla contiene SKU duplicados');
const images=await loadDemoImages();
const root=resolve('.nexo');
const config=JSON.parse(await readFile(join(root,'dev.json'),'utf8'));
const access=JSON.parse(await readFile(join(root,'prismabyte-access.json'),'utf8'));
if(config.port!==55440||config.user!=='nexo_local_admin'||access.company!=='prismabyte'||access.email!=='admin@prismabyte.example'||access.environment!=='local-demo')throw new Error('La instalación no es la demostración local de PrismaByte');
const url=new URL('postgresql://127.0.0.1:55440/nexo_dev');url.username=config.user;url.password=config.password;
const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
const tables=['return_items','return_receipts','refunds','capture_resolutions','payment_events','payment_captures','payment_intents','order_events','order_items','orders','shipping_quote_items','shipping_quotes','stock_movements','inventory_operations','stock','products'] as const;
try{
 const ownerResult=await pool.query("SELECT u.id,u.company_id,u.name,u.role FROM users u JOIN companies c ON c.id=u.company_id WHERE c.slug='prismabyte' AND u.email='admin@prismabyte.example' AND u.active AND u.role='OWNER'");
 if(ownerResult.rowCount!==1)throw new Error('No se encontró al administrador de demostración');
 const actor=ownerResult.rows[0] as Actor;
 await mkdir(join(root,'backups'),{recursive:true});
 const backup=join(root,'backups',`before-catalog-${Date.now()}.dump`);
 await backupDatabase(url.toString(),'public',backup,process.env.NEXO_PG_BIN??'C:/Program Files/PostgreSQL/18/bin');
 await migrate(pool);
 const result=await transaction(pool,async db=>{
  await lockCompany(db,actor.company_id);
  const locations=(await db.query('SELECT id,name,kind FROM locations WHERE company_id=$1 AND active ORDER BY kind DESC,name',[actor.company_id])).rows;
  if(locations.length!==7||locations.filter(l=>l.kind==='WEB').length!==1)throw new Error('Se esperan las siete ubicaciones activas de PrismaByte');
  const categories=await readCategories(db,actor.company_id);
  const categoryIds=new Map(categories.map(c=>[c.slug,c.id]));
  for(const product of demoProducts){const id=categoryIds.get(product.category);if(!id)throw new Error('Categoría de semilla inexistente');await validateProductMetadata(db,actor.company_id,id,product.specifications);}
  const foreignCounts:Record<string,number>={};
  for(const table of tables)foreignCounts[table]=Number((await db.query(`SELECT count(*) FROM ${table} WHERE company_id<>$1`,[actor.company_id])).rows[0].count);
  const removed:Record<string,number>={};
  // Only this privileged local maintenance transaction bypasses append-only demo records.
  // Table constraints remain; deletion order respects every FK. Triggers resume before inserting the new seed.
  if(mode==='--replace'){
   await db.query("SET LOCAL session_replication_role='replica'");
   for(const table of tables)removed[table]=(await db.query("DELETE FROM "+table+" WHERE company_id=$1",[actor.company_id])).rowCount??0;
   await db.query("SET LOCAL session_replication_role='origin'");
  }
  const existing=new Set((await db.query('SELECT sku FROM products WHERE company_id=$1',[actor.company_id])).rows.map(p=>p.sku));
  let added=0;
  let units=0;
  for(const [index,product] of demoProducts.entries()){
   if(mode==='--images'||existing.has(product.sku))continue;
   added++;
   const id=randomUUID(),categoryId=categoryIds.get(product.category)!;
   await db.query('INSERT INTO products(id,company_id,sku,name,description,price_minor,category_id,specifications) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,actor.company_id,product.sku,product.name,'Producto de demostración. Precio y existencias simulados; no constituyen una oferta comercial.',product.price,categoryId,JSON.stringify(product.specifications)]);
   for(const [position,location] of locations.entries()){
    const quantity=location.kind==='WEB'?product.base*2:(index+position)%11===0?0:Math.max(1,Math.floor(product.base*[.35,.7,.45,.3,.5,.25][(position-1+6)%6])-(index+position)%3);
    await db.query('INSERT INTO stock(company_id,product_id,location_id,on_hand) VALUES($1,$2,$3,$4)',[actor.company_id,id,location.id,quantity]);
    if(quantity>0){
     const operation=randomUUID(),body={productId:id,locationId:location.id,quantity};
     await db.query("INSERT INTO inventory_operations(id,company_id,actor_id,idempotency_key,request_hash,kind,reason) VALUES($1,$2,$3,$4,$5,'RECEIPT','DEMO: recepción inicial de catálogo categorizado')",[operation,actor.company_id,actor.id,`categorized-seed-${id}-${location.id}`,createHash('sha256').update(JSON.stringify(body)).digest('hex')]);
     await db.query('INSERT INTO stock_movements(id,company_id,operation_id,product_id,location_id,delta,on_hand_after) VALUES($1,$2,$3,$4,$5,$6,$6)',[randomUUID(),actor.company_id,operation,id,location.id,quantity]);
    }
    units+=quantity;
   }
  }
  const imagesAdded=await applyDemoImages(db,actor.company_id,'prismabyte',images);
  for(const table of tables)if(foreignCounts[table]!==Number((await db.query(`SELECT count(*) FROM ${table} WHERE company_id<>$1`,[actor.company_id])).rows[0].count))throw new Error('Se modificaron datos fuera de la demo');
  const invalid=await db.query(`SELECT 1 FROM stock s WHERE s.company_id=$1 AND (s.on_hand<>COALESCE((SELECT sum(m.delta) FROM stock_movements m WHERE m.company_id=s.company_id AND m.product_id=s.product_id AND m.location_id=s.location_id),0))`,[actor.company_id]);
  if(invalid.rowCount)throw new Error('Libro de stock inconsistente');
  const totals=(await db.query('SELECT count(*) AS products FROM products WHERE company_id=$1',[actor.company_id])).rows[0];
  const stockTotals=(await db.query('SELECT COALESCE(sum(on_hand),0) AS units,COALESCE(sum(reserved),0) AS reserved FROM stock WHERE company_id=$1',[actor.company_id])).rows[0];
  await audit(db,actor,mode==='--images'?'DEMO_IMAGES_ADDED':mode==='--fill'?'DEMO_CATALOG_FILLED':'DEMO_CATALOG_REPLACED',actor.company_id,{removed,added,imagesAdded,seededProducts:demoProducts.length,addedUnits:units});
  return {company:'prismabyte',mode,imagesAdded,products:Number(totals.products),seededProducts:demoProducts.length,added,categories:categories.length,locations:locations.length,units:Number(stockTotals.units),reserved:Number(stockTotals.reserved),addedUnits:units,removed};
 });
 await writeFile(join(root,'prismabyte-taxonomy-seed.json'),JSON.stringify({...result,backup,appliedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({...result,backup}));
}finally{await pool.end();}
