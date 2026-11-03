import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Pool} from 'pg';
import {backupDatabase} from './backup-store';
import type {Actor} from '../src/server/auth';
import {createLocalSale,createOnlineOrder,confirmManualPayment,fulfillOrder,cancelOrder} from '../src/server/orders';
import {requestShippingQuote,approveShippingQuote,rejectShippingQuote} from '../src/server/shipping';
import {businessReport} from '../src/server/reports';

// Explicit local maintenance command. Uses domain operations and their idempotency keys;
// never resets stock, changes historical timestamps, or bypasses database triggers.
if(process.env.NODE_ENV==='production'||process.argv[2]!=='--apply'||process.argv.length!==3)throw new Error('Solo instalación local: tsx scripts/seed-local-activity.ts --apply');
const root=resolve('.nexo'),config=JSON.parse(await readFile(join(root,'dev.json'),'utf8')),access=JSON.parse(await readFile(join(root,'prismabyte-access.json'),'utf8'));
if(config.port!==55440||config.user!=='nexo_local_admin'||access.company!=='prismabyte'||access.environment!=='local-demo')throw new Error('Esta carga solo admite la instalación local de PrismaByte');
const url=new URL('postgresql://127.0.0.1:55440/nexo_dev');url.username=config.user;url.password=config.password;
const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
type Entry={productId:string;price:string;locationId:string};
type Plan={version:number;owner:Actor;customers:Actor[];local:Entry[];pickup:Entry[];shipping:Entry[];backup:string;completed?:boolean};
const planFile=join(root,'activity-seed-v1.json');
try{
 const owner=(await pool.query("SELECT u.id,u.company_id,u.name,u.role FROM users u JOIN companies c ON c.id=u.company_id WHERE c.slug='prismabyte' AND u.role='OWNER' AND u.active AND u.email=$1",[access.email])).rows[0] as Actor;
 if(!owner)throw new Error('Administrador local no encontrado');
 let plan:Plan|null=null;
 try{plan=JSON.parse(await readFile(planFile,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(plan&&plan.owner.company_id!==owner.company_id)throw new Error('El plan pertenece a otra instalación');
 if(!plan){
  const customers=(await pool.query("SELECT id,company_id,name,role FROM users WHERE company_id=$1 AND role='CUSTOMER' AND active ORDER BY email LIMIT 3",[owner.company_id])).rows as Actor[];
  if(customers.length<3)throw new Error('Se necesitan las tres cuentas locales de cliente');
  const stores=(await pool.query("SELECT id FROM locations WHERE company_id=$1 AND active AND kind='STORE' ORDER BY name",[owner.company_id])).rows;
  if(stores.length!==6)throw new Error('Se esperan las seis sucursales locales');
  async function pick(locationId:string,index:number):Promise<Entry>{
   const rows=(await pool.query(`SELECT p.id,p.price_minor::text AS price FROM products p JOIN stock s ON s.company_id=p.company_id AND s.product_id=p.id WHERE p.company_id=$1 AND p.active AND s.location_id=$2 AND s.on_hand-s.reserved>=6 ORDER BY p.sku`,[owner.company_id,locationId])).rows;
   if(!rows.length)throw new Error('Stock insuficiente para cargar actividad');const product=rows[index%rows.length];return {productId:product.id,price:product.price,locationId};
  }
  const local:Entry[]=[],pickup:Entry[]=[],shipping:Entry[]=[];
  for(let i=0;i<12;i++)local.push(await pick(stores[i%6].id,i*3));
  for(let i=0;i<6;i++)pickup.push(await pick(stores[i].id,i*5+1));
  const web=(await pool.query("SELECT id FROM locations WHERE company_id=$1 AND active AND kind='WEB'",[owner.company_id])).rows[0];if(!web)throw new Error('Falta la bodega web');
  for(let i=0;i<6;i++)shipping.push(await pick(web.id,i*7+2));
  await mkdir(join(root,'backups'),{recursive:true});const backup=join(root,'backups',`before-activity-${Date.now()}.dump`);
  await backupDatabase(url.toString(),'public',backup,process.env.NEXO_PG_BIN??'C:/Program Files/PostgreSQL/18/bin');
  plan={version:1,owner,customers,local,pickup,shipping,backup};await writeFile(planFile,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 }
 if(!plan.completed){
  const key=(kind:string,i:number)=>`pb-activity-v1-${kind}-${i}`;
  const payment=(entry:Entry,reference:string)=>({amountMinor:entry.price,method:'TRANSFER' as const,reference});
  for(const [i,e] of plan.local.entries())await createLocalSale(pool,owner,key('local',i),{locationId:e.locationId,items:[{productId:e.productId,quantity:1}],payment:payment(e,key('receipt',i))});
  for(const [i,e] of plan.pickup.entries()){
   const customer=plan.customers[i%3];const order=await createOnlineOrder(pool,customer,key('pickup',i),{fulfillment:'PICKUP',locationId:e.locationId,items:[{productId:e.productId,quantity:1}]});
   if(i===5)await cancelOrder(pool,customer,order.id,{reason:'Cliente solicita cambiar la selección de productos'});
   else{await confirmManualPayment(pool,owner,order.id,payment(e,key('pickup-payment',i)));if(i<3)await fulfillOrder(pool,owner,order.id);}
  }
  const destinations=[['Talca','Maule'],['Curicó','Maule'],['Concepción','Biobío'],['Santiago','Metropolitana'],['Recoleta','Metropolitana'],['Vitacura','Metropolitana']];
  for(const [i,e] of plan.shipping.entries()){
   const customer=plan.customers[i%3],items=[{productId:e.productId,quantity:1}];
   const quote=await requestShippingQuote(pool,customer,key('quote',i),{items,address:{recipient:customer.name,phone:'+56900000000',line1:`Dirección de entrega ${100+i}`,commune:destinations[i][0],region:destinations[i][1],country:'CL'}});
   if(i<2)continue;
   if(i===3){await rejectShippingQuote(pool,owner,quote.id,{reason:'Destino fuera de la cobertura de entrega disponible'});continue;}
   const fee=String(i%2?4990:3990);await approveShippingQuote(pool,owner,quote.id,{shippingMinor:fee,note:'Despacho a domicilio. Coordinación de entrega con el destinatario.'});
   if(i===2)continue;
   const order=await createOnlineOrder(pool,customer,key('shipping-order',i),{fulfillment:'SHIP',shippingQuoteId:quote.id,items});
   await confirmManualPayment(pool,owner,order.id,{amountMinor:(BigInt(e.price)+BigInt(fee)).toString(),method:'TRANSFER',reference:key('shipping-payment',i)});
   if(i===4)await fulfillOrder(pool,owner,order.id);
  }
  plan.completed=true;await writeFile(planFile,JSON.stringify(plan,null,2)+'\n');
 }
 const invalid=await pool.query(`SELECT s.product_id FROM stock s WHERE s.company_id=$1 AND (s.on_hand<0 OR s.reserved<0 OR s.reserved>s.on_hand OR s.on_hand<>COALESCE((SELECT sum(m.delta) FROM stock_movements m WHERE m.company_id=s.company_id AND m.product_id=s.product_id AND m.location_id=s.location_id),0) OR s.reserved<>COALESCE((SELECT sum(i.quantity) FROM order_items i JOIN orders o ON o.company_id=i.company_id AND o.id=i.order_id WHERE i.company_id=s.company_id AND i.product_id=s.product_id AND o.location_id=s.location_id AND o.status='RESERVED'),0))`,[owner.company_id]);
 if(invalid.rowCount)throw new Error('La verificación de stock no pasó');
 const counts=await pool.query("SELECT status,count(*)::int FROM orders WHERE company_id=$1 GROUP BY status ORDER BY status",[owner.company_id]);
 const quotes=await pool.query("SELECT status,count(*)::int FROM shipping_quotes WHERE company_id=$1 GROUP BY status ORDER BY status",[owner.company_id]);
 const today=(await pool.query("SELECT (clock_timestamp() AT TIME ZONE 'America/Santiago')::date::text AS day")).rows[0].day;
 const report=await businessReport(pool,owner,{from:today,to:today,threshold:5});
 console.log(JSON.stringify({orders:counts.rows,quotes:quotes.rows,sales:report.sales.map(r=>({location:r.name,orders:r.orders,gross:r.gross})),stockVerified:true,backup:plan.backup}));
}finally{await pool.end();}
