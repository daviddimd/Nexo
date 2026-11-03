import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,login,type Actor} from '../src/server/auth';
import {createUser} from '../src/server/manage';
import {customerProfile,saveCustomerAddress,removeCustomerAddress} from '../src/server/customer-profile';
import {saveTestCard,listTestCards,revealTestCard,removeTestCard} from '../src/server/test-payment-methods';
import {GET,POST,PATCH,DELETE} from '../src/app/api/[...path]/route';
import {database} from '../src/server/db';
import {cardExpiryValid,cardSecurityCodeValid} from '../src/catalog/card-format';

test('card formats validate calendar and brand-specific security codes without bank validation',()=>{
 const now=new Date(2026,10,3);
 assert.equal(cardExpiryValid(11,2026,now),true);
 assert.equal(cardExpiryValid(10,2026,now),false);
 assert.equal(cardExpiryValid(13,2030,now),false);
 assert.equal(cardSecurityCodeValid('400000','123'),true);
 assert.equal(cardSecurityCodeValid('400000','1234'),false);
 assert.equal(cardSecurityCodeValid('370000','1234'),true);
 assert.equal(cardSecurityCodeValid('370000','123'),false);
});
describe('Customer address book and protected card details',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
 const schema='nexo_wallet_'+randomUUID().replaceAll('-',''),password='Wallet-password-2026!';
 let admin:Pool,pool:Pool,buyer:Actor,other:Actor,foreign:Actor,card:any;
 const address={recipient:'Cliente Uno',phone:'+56912345678',line1:'Avenida Central 123',commune:'Talca',region:'Maule',country:'CL' as const};
 const input={label:'Mi Visa',holder:'Cliente Uno',number:'4000000000000010',expiryMonth:12,expiryYear:2090,cvv:'731'};
 before(async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);
  admin=new Pool({connectionString:url.toString()});await admin.query('CREATE SCHEMA "'+schema+'"');
  url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);
  const c=await createCompany(pool,{slug:'wallet-'+randomUUID().slice(0,8),name:'Wallet store',email:'owner@example.test',password});
  const owner:Actor={id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER'};
  const u=await createUser(pool,owner,{name:'Cliente Uno',email:'first@example.test',password,role:'CUSTOMER'});
  buyer={id:u.id,company_id:c.companyId,name:u.name,role:'CUSTOMER'};
  const u2=await createUser(pool,owner,{name:'Cliente Dos',email:'second@example.test',password,role:'CUSTOMER'});other={...buyer,id:u2.id,name:u2.name};
  const f=await createCompany(pool,{slug:'foreign-'+randomUUID().slice(0,8),name:'Foreign',email:'owner@example.test',password});
  const uf=await createUser(pool,{...owner,id:f.userId,company_id:f.companyId},{name:'Foreign',email:'foreign@example.test',password,role:'CUSTOMER'});
  foreign={...buyer,id:uf.id,company_id:f.companyId};
  Object.assign(process.env,{DATABASE_URL:url.toString(),APP_ORIGIN:'http://localhost:3000',NODE_ENV:'test',NEXO_SIMULATOR_ENABLED:'true'});
 });
 after(async()=>{await database().end();await pool?.end();if(admin){await admin.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.end();}});
 test('multiple addresses persist; default and removal fallback stay in sync with checkout',async()=>{
  const home=await saveCustomerAddress(pool,buyer,null,{label:'Casa',address,isDefault:false});
  const office=await saveCustomerAddress(pool,buyer,null,{label:'Trabajo',address:{...address,line1:'Oficina 456'},isDefault:false});
  let profile=await customerProfile(pool,buyer);assert.equal(profile.addresses.length,2);assert.equal(profile.addresses[0].id,home.id);assert.deepEqual(profile.defaultAddress,address);
  await saveCustomerAddress(pool,buyer,office.id,{label:'Trabajo',address:office.address,isDefault:true});
  profile=await customerProfile(pool,buyer);assert.equal(profile.addresses.filter(row=>row.isDefault).length,1);assert.equal(profile.defaultAddress?.line1,'Oficina 456');
  await removeCustomerAddress(pool,buyer,office.id);profile=await customerProfile(pool,buyer);assert.equal(profile.addresses.length,1);assert.deepEqual(profile.defaultAddress,address);
 });
 test('address endpoints prevent changes or deletions across users and tenants',async()=>{
  const profile=await customerProfile(pool,buyer),id=profile.addresses[0].id;
  for(const actor of [other,foreign]){
   assert.equal((await customerProfile(pool,actor)).addresses.length,0);
   await assert.rejects(()=>saveCustomerAddress(pool,actor,id,{label:'Ataque',address,isDefault:true}));
   await assert.rejects(()=>removeCustomerAddress(pool,actor,id));
  }
 });
 test('legacy checkout updates reuse addresses; profile-only changes never erase the book',async()=>{
  await customerProfile(pool,buyer,{defaultAddress:address});await customerProfile(pool,buyer,{defaultAddress:address});
  await customerProfile(pool,buyer,{phone:'+56911111111'});await customerProfile(pool,buyer,{paymentPreference:'CARD'});
  const profile=await customerProfile(pool,buyer);assert.equal(profile.addresses.length,1);assert.deepEqual(profile.defaultAddress,address);assert.equal(profile.phone,'+56911111111');
 });
 test('deleting the last address clears checkout data; concurrent defaults stay unique',async()=>{
  const last=(await customerProfile(pool,buyer)).addresses[0];
  await removeCustomerAddress(pool,buyer,last.id);
  assert.equal((await customerProfile(pool,buyer)).defaultAddress,null);
  await Promise.all([
   saveCustomerAddress(pool,buyer,null,{label:'Casa',address,isDefault:true}),
   saveCustomerAddress(pool,buyer,null,{label:'Trabajo',address:{...address,line1:'Oficina 500'},isDefault:true})
  ]);
  const profile=await customerProfile(pool,buyer);
  assert.equal(profile.addresses.length,2);assert.equal(profile.addresses.filter(row=>row.isDefault).length,1);
  assert.deepEqual(profile.defaultAddress,profile.addresses.find(row=>row.isDefault)!.address);
 });
 test('card metadata stays masked in normal responses and PAN/CVV never reach storage',async()=>{
  card=await saveTestCard(pool,buyer,input);assert.equal(card.brand,'Visa');
  const listed=(await listTestCards(pool,buyer)).items[0];
  assert.equal(listed.last_four,'0010');assert.equal(listed.holder,undefined);assert.equal(listed.expiry_month,undefined);assert.equal(listed.prefix,undefined);
  const row=(await pool.query('SELECT * FROM test_payment_cards WHERE id=$1',[card.id])).rows[0];
  assert.equal(row.holder,input.holder);assert.equal(row.expiry_month,12);assert.equal(row.expiry_year,2090);
  assert.ok(!JSON.stringify(row).includes(input.number));assert.ok(!JSON.stringify(row).includes('"cvv"'));
  assert.equal((await saveTestCard(pool,buyer,input)).id,card.id);
 });
 test('invalid expiry, security code and unexpected payload fields cannot save cards',async()=>{
  await assert.rejects(()=>saveTestCard(pool,buyer,{...input,expiryMonth:13}));
  await assert.rejects(()=>saveTestCard(pool,buyer,{...input,expiryYear:2001}));
  await assert.rejects(()=>saveTestCard(pool,buyer,{...input,cvv:'1234'}));
  await assert.rejects(()=>saveTestCard(pool,buyer,{...input,number:'370000000000001',cvv:'123'}));
  await assert.rejects(()=>saveTestCard(pool,buyer,{...input,userId:other.id}));
  const amex=await saveTestCard(pool,buyer,{...input,number:'370000000000001',cvv:'1234'});assert.equal(amex.brand,'American Express');
 });
 test('detail reveal verifies the actual password and isolates cards, with a short visibility lifetime',async()=>{
  await assert.rejects(()=>revealTestCard(pool,buyer,card.id,{password:'incorrect'}));
  await assert.rejects(()=>revealTestCard(pool,other,card.id,{password}));
  await assert.rejects(()=>revealTestCard(pool,foreign,card.id,{password}));
  const details=await revealTestCard(pool,buyer,card.id,{password});
  assert.equal(details.holder,input.holder);assert.equal(details.expiryMonth,12);assert.equal(details.expiryYear,2090);
  assert.ok(new Date(details.expiresAt).getTime()-Date.now()<=30000);
  assert.ok(!JSON.stringify(details).includes(input.number));assert.equal((details as any).cvv,undefined);
  await removeTestCard(pool,buyer,card.id);await assert.rejects(()=>revealTestCard(pool,buyer,card.id,{password}));
 });
 test('HTTP routes save, edit and delete addresses and require a password to reveal card details',async()=>{
  const slug=(await pool.query('SELECT slug FROM companies WHERE id=$1',[buyer.company_id])).rows[0].slug;
  const session=await login(pool,{company:slug,email:'first@example.test',password});
  const context=(path:string)=>({params:Promise.resolve({path:path.split('/')})});
  const request=(path:string,method:string,body?:unknown,token=session.token)=>new Request('http://localhost:3000/api/'+path,{method,headers:{cookie:'nexo_session='+token,origin:'http://localhost:3000','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const created=await POST(request('customer/addresses','POST',{label:'HTTP',address,isDefault:false}),context('customer/addresses'));assert.equal(created.status,201);
  const entry=await created.json(),path='customer/addresses/'+entry.id;
  const updated=await PATCH(request(path,'PATCH',{label:'Editada',address,isDefault:true}),context(path));assert.equal(updated.status,200);
  const response=await GET(request('customer/profile','GET'),context('customer/profile'));assert.equal((await response.json()).addresses[0].label,'Editada');
  assert.equal((await DELETE(request(path,'DELETE',undefined,''),context(path))).status,401);
  assert.equal((await DELETE(request(path,'DELETE'),context(path))).status,200);
  const saved=await POST(request('customer/test-cards','POST',input),context('customer/test-cards'));assert.equal(saved.status,201);const value=await saved.json();
  const reveal='customer/test-cards/'+value.id+'/reveal';
  const refused=await POST(request(reveal,'POST',{password:'wrong'}),context(reveal));assert.equal(refused.status,401);
  const unlocked=await POST(request(reveal,'POST',{password}),context(reveal));assert.equal(unlocked.status,200);assert.equal(unlocked.headers.get('cache-control'),'no-store');
  const details=await unlocked.json();assert.equal(details.holder,input.holder);assert.equal(details.cvv,undefined);assert.equal(details.number,undefined);
 });
 test('failed password checks count against a persistent limit',async()=>{
  let limited=false;
  for(let i=0;i<12;i++){try{await revealTestCard(pool,other,randomUUID(),{password:'incorrect'});}catch(error){if((error as any).code==='ACCOUNT_RATE_LIMIT'){limited=true;break;}}}
  assert.equal(limited,true);
 });
});
