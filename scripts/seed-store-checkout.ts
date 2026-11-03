import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Pool} from 'pg';
import {backupDatabase} from './backup-store';
import {migrate} from './migrate';
import type {Actor} from '../src/server/auth';
import {saveShippingRate} from '../src/server/shipping-rates';
import {customerProfile} from '../src/server/customer-profile';
import {saveTestCard} from '../src/server/test-payment-methods';
if(process.env.NODE_ENV==='production'||process.argv[2]!=='--apply'||process.argv.length!==3)throw new Error('Solo instalación local: tsx scripts/seed-store-checkout.ts --apply');
const root=resolve('.nexo'),config=JSON.parse(await readFile(join(root,'dev.json'),'utf8')),access=JSON.parse(await readFile(join(root,'prismabyte-access.json'),'utf8'));
if(config.port!==55440||config.user!=='nexo_local_admin'||access.company!=='prismabyte'||access.environment!=='local-demo')throw new Error('Solo admite la instalación local de PrismaByte');
const url=new URL('postgresql://127.0.0.1:55440/nexo_dev');url.username=config.user;url.password=config.password;
const pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
try{
 const marker=join(root,'store-checkout-seed.json');try{await readFile(marker);throw new Error('La configuración inicial ya se cargó. Edita las tarifas y cuentas desde la interfaz.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const owner=(await pool.query("SELECT u.id,u.company_id,u.name,u.role FROM users u JOIN companies c ON c.id=u.company_id WHERE c.slug='prismabyte' AND u.email=$1 AND u.active AND u.role='OWNER'",[access.email])).rows[0] as Actor;if(!owner)throw new Error('Administrador local no encontrado');
 await mkdir(join(root,'backups'),{recursive:true});const backup=join(root,'backups',`before-store-checkout-${Date.now()}.dump`);await backupDatabase(url.toString(),'public',backup,process.env.NEXO_PG_BIN??'C:/Program Files/PostgreSQL/18/bin');await migrate(pool);
 const destinations=[['Talca','Maule','3990'],['Curicó','Maule','3990'],['Concepción','Biobío','4990'],['Santiago Centro','Metropolitana','2990'],['Santiago','Metropolitana','2990'],['Recoleta','Metropolitana','2990'],['Vitacura','Metropolitana','2990']];
 let added=0;for(const [city,region,feeMinor] of destinations){if((await pool.query('SELECT 1 FROM shipping_rates WHERE company_id=$1 AND city=$2 AND region=$3',[owner.company_id,city,region])).rowCount)continue;await saveShippingRate(pool,owner,null,{city,region,feeMinor,active:true});added++;}
 Object.assign(process.env,{NODE_ENV:'development',NEXO_SIMULATOR_ENABLED:'true'});let customers=0;
 const accounts=(await pool.query("SELECT id,company_id,name,role FROM users WHERE company_id=$1 AND role='CUSTOMER' AND active ORDER BY email LIMIT 3",[owner.company_id])).rows as Actor[];
 for(const [i,buyer] of accounts.entries()){
  const profile=await customerProfile(pool,buyer);
  if(!profile.defaultAddress)await customerProfile(pool,buyer,{name:profile.name,phone:profile.phone||'+56900000000',defaultAddress:{recipient:profile.name,phone:'+56900000000',line1:`Dirección de pruebas ${100+i}`,commune:destinations[i][0],region:destinations[i][1],country:'CL'},paymentPreference:profile.paymentPreference??'CARD'});
  await saveTestCard(pool,buyer,{label:'Visa',holder:buyer.name,expiryMonth:12,expiryYear:2035,cvv:'123',number:'4000000000000010'});await saveTestCard(pool,buyer,{label:'Mastercard',holder:buyer.name,expiryMonth:12,expiryYear:2035,cvv:'123',number:'5100000000000022'});customers++;
 }
 const result={ratesAdded:added,customersPrepared:customers,backup,appliedAt:new Date().toISOString()};await writeFile(marker,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}finally{await pool.end();}
