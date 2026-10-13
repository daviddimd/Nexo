import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,login,authenticate,type Actor} from '../src/server/auth';
import {database,transaction} from '../src/server/db';
import {createLocation,createProduct,createUser} from '../src/server/manage';
import {patchUser,listUsers,changePassword,resetUserPassword,patchCompanySettings,publicSettings,companySettings,listAdministrativeEvents} from '../src/server/accounts';
import {updateOrderSettings} from '../src/server/orders';
import {GET,POST,PATCH} from '../src/app/api/[...path]/route';

const testUrl=process.env.TEST_DATABASE_URL;
describe('Company and account administration',{skip:!testUrl,concurrency:false},()=>{
  const schema=`nexo_accounts_test_${randomUUID().replaceAll('-','')}`;
  const password='Account-test-password-123!',newPassword='New-account-password-456!';
  let admin:Pool,pool:Pool,owner:Actor,other:Actor,branch:string,north:string,slug:string;
  before(async()=>{
    const url=new URL(testUrl!);assert.match(url.pathname,/test/i);admin=new Pool({connectionString:testUrl});
    await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options',`-c search_path=${schema}`);
    pool=new Pool({connectionString:url.toString()});Object.assign(process.env,{DATABASE_URL:url.toString(),APP_ORIGIN:'http://localhost:3000',NODE_ENV:'test'});
    await migrate(pool);await migrate(pool);
    const a=await company();owner=a.actor;slug=a.slug;other=(await company()).actor;
    branch=(await createLocation(pool,owner,{name:'Centro',kind:'STORE'})).id;
    north=(await createLocation(pool,owner,{name:'Norte',kind:'STORE'})).id;
  });
  after(async()=>{if(pool)await pool.end();await database().end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
  const reject=(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,(e:{code?:string})=>e.code===code);
  async function company(){
    const slug=`account-${randomUUID().slice(0,8)}`;
    const c=await createCompany(pool,{slug,name:'Empresa inicial',email:'owner@example.test',password});
    return {slug,actor:{id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER' as const}};
  }
  async function user(role:'AGENT'|'CUSTOMER'='AGENT',locations=[branch]){
    const email=`${randomUUID()}@example.test`;
    const u=await createUser(pool,owner,{name:'Cuenta prueba',email,password,role,locationIds:role==='AGENT'?locations:[]});
    return {email,actor:{id:u.id,company_id:owner.company_id,name:u.name,role} as Actor};
  }
  const signIn=(email:string,pw=password,companySlug=slug)=>login(pool,{company:companySlug,email,password:pw});
  test('logout revokes only the current session and clears its cookie',async()=>{
    const c=await company();const first=await signIn('owner@example.test',password,c.slug),second=await signIn('owner@example.test',password,c.slug);
    const headers={origin:'http://localhost:3000',cookie:`nexo_session=${first.token}`,'content-type':'application/json'};
    const response=await POST(new Request('http://localhost:3000/api/auth/logout',{method:'POST',headers,body:'{}'}),{params:Promise.resolve({path:['auth','logout']})});
    assert.equal(response.status,200);assert.match(response.headers.get('set-cookie')??'',/Max-Age=0/);
    await reject(()=>authenticate(pool,first.token),'UNAUTHENTICATED');assert.equal((await authenticate(pool,second.token)).id,c.actor.id);
  });

  test('lists expose assignments, never password hashes; foreign accounts absent',async()=>{
    const a=await user();const rows=await listUsers(pool,owner);
    assert.deepEqual(rows.items.find(r=>r.id===a.actor.id).locationIds,[branch]);
    assert(rows.items.every(r=>!('password_hash' in r)&&r.id!==other.id));
    await reject(()=>listUsers(pool,a.actor),'FORBIDDEN');
  });
  test('reassigning agent revokes sessions and moves inventory permissions',async()=>{
    const a=await user();const s=await signIn(a.email);
    const next=await patchUser(pool,owner,a.actor.id,{locationIds:[north,north],reason:'Traslado de sucursal'});
    assert.deepEqual(next.locationIds,[north]);await reject(()=>authenticate(pool,s.token),'UNAUTHENTICATED');
    const {locationAccess}=await import('../src/server/auth');
    await transaction(pool,async db=>{await reject(()=>locationAccess(db,a.actor,branch),'LOCATION_FORBIDDEN');await locationAccess(db,a.actor,north);});
  });
  test('role promotion clears branch assignments and revokes prior sessions',async()=>{
    const a=await user();const s=await signIn(a.email);
    const promoted=await patchUser(pool,owner,a.actor.id,{role:'OWNER',reason:'Responsable de empresa'});
    assert.equal(promoted.role,'OWNER');assert.deepEqual(promoted.locationIds,[]);
    await reject(()=>authenticate(pool,s.token),'UNAUTHENTICATED');
    const current=await authenticate(pool,(await signIn(a.email)).token);assert.equal(current.role,'OWNER');
    await patchUser(pool,owner,a.actor.id,{role:'AGENT',locationIds:[branch],reason:'Volver a operación'});
  });
  test('last active owner protected in API and database',async()=>{
    const c=await company();
    await reject(()=>patchUser(pool,c.actor,c.actor.id,{active:false,reason:'Desactivar administrador'}),'LAST_OWNER');
    await reject(()=>patchUser(pool,c.actor,c.actor.id,{role:'AGENT',reason:'Cambiar administrador'}),'LAST_OWNER');
    await assert.rejects(()=>pool.query('UPDATE users SET active=false WHERE id=$1',[c.actor.id]));
  });
  test('simultaneous owner demotions always preserve an active owner',async()=>{
    const c=await company();const u=await createUser(pool,c.actor,{name:'Segundo',email:'second@example.test',password,role:'AGENT'});
    await patchUser(pool,c.actor,u.id,{role:'OWNER',reason:'Segundo administrador'});
    const second={id:u.id,company_id:c.actor.company_id,name:'Segundo',role:'OWNER' as const};
    const results=await Promise.allSettled([
      patchUser(pool,c.actor,c.actor.id,{role:'AGENT',reason:'Cambiar primer rol'}),
      patchUser(pool,second,second.id,{role:'AGENT',reason:'Cambiar segundo rol'})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await pool.query("SELECT 1 FROM users WHERE company_id=$1 AND role='OWNER' AND active",[c.actor.company_id])).rowCount,1);
  });
  test('deactivation blocks login, revokes sessions and rejects a stale actor on creation',async()=>{
    const a=await user();const s=await signIn(a.email);
    await patchUser(pool,owner,a.actor.id,{active:false,reason:'Cuenta suspendida'});
    await reject(()=>authenticate(pool,s.token),'UNAUTHENTICATED');await reject(()=>signIn(a.email),'INVALID_CREDENTIALS');
    await reject(()=>createProduct(pool,a.actor,{sku:randomUUID(),name:'Inválido',priceMinor:1}),'FORBIDDEN');
    await patchUser(pool,owner,a.actor.id,{active:true,reason:'Cuenta reactivada'});
    assert((await signIn(a.email)).token);
  });
  test('customers cannot become staff and assignments require same-company active locations',async()=>{
    const a=await user('CUSTOMER');const b=await user();
    await reject(()=>patchUser(pool,owner,a.actor.id,{role:'AGENT',reason:'Cambio inválido'}),'CUSTOMER_ROLE_IMMUTABLE');
    await reject(()=>patchUser(pool,owner,b.actor.id,{role:'CUSTOMER',reason:'Cambio inválido'}),'CUSTOMER_ROLE_IMMUTABLE');
    await reject(()=>patchUser(pool,owner,a.actor.id,{locationIds:[branch],reason:'Cambio inválido'}),'INVALID_ASSIGNMENT');
    const foreign=(await createLocation(pool,other,{name:'Ajena',kind:'STORE'})).id;
    await reject(()=>patchUser(pool,owner,b.actor.id,{locationIds:[foreign],reason:'Cambio inválido'}),'INVALID_ASSIGNMENT');
    await reject(()=>patchUser(pool,other,b.actor.id,{name:'Ajeno',reason:'Cambio inválido'}),'USER_NOT_FOUND');
  });
  test('email changes are normalized, unique and invalidate old login/session',async()=>{
    const a=await user();const b=await user();const s=await signIn(a.email);const email=`NEW-${randomUUID()}@EXAMPLE.TEST`;
    const updated=await patchUser(pool,owner,a.actor.id,{email,reason:'Correo actualizado'});assert.equal(updated.email,email.toLowerCase());
    await reject(()=>authenticate(pool,s.token),'UNAUTHENTICATED');await reject(()=>signIn(a.email),'INVALID_CREDENTIALS');
    assert((await signIn(email.toLowerCase())).token);
    await reject(()=>patchUser(pool,owner,b.actor.id,{email,reason:'Correo repetido'}),'EMAIL_EXISTS');
  });
  test('no-op profile patch preserves sessions and produces no audit duplicate',async()=>{
    const a=await user();const s=await signIn(a.email);
    const before=(await listAdministrativeEvents(pool,owner)).items.length;
    const result=await patchUser(pool,owner,a.actor.id,{name:'Cuenta prueba',locationIds:[branch],reason:'Sin cambios'});
    assert.equal(result.changed,false);assert((await authenticate(pool,s.token)).id);
    assert.equal((await listAdministrativeEvents(pool,owner)).items.length,before);
  });
  test('self password change checks old password and revokes all sessions',async()=>{
    const a=await user('CUSTOMER');const s1=await signIn(a.email),s2=await signIn(a.email);
    await reject(()=>changePassword(pool,a.actor,{currentPassword:'incorrecta',newPassword}),'CURRENT_PASSWORD_INVALID');
    assert((await authenticate(pool,s1.token)).id);
    await changePassword(pool,a.actor,{currentPassword:password,newPassword});
    await reject(()=>authenticate(pool,s1.token),'UNAUTHENTICATED');await reject(()=>authenticate(pool,s2.token),'UNAUTHENTICATED');
    await reject(()=>signIn(a.email),'INVALID_CREDENTIALS');assert((await signIn(a.email,newPassword)).token);
  });
  test('administrator password reset is scoped, audited and secret-free',async()=>{
    const a=await user();const s=await signIn(a.email);
    await reject(()=>resetUserPassword(pool,a.actor,a.actor.id,{password:newPassword,reason:'No autorizado'}),'FORBIDDEN');
    await reject(()=>resetUserPassword(pool,owner,owner.id,{password:newPassword,reason:'Usar ruta propia'}),'USE_PASSWORD_CHANGE');
    await reject(()=>resetUserPassword(pool,other,a.actor.id,{password:newPassword,reason:'Empresa ajena'}),'USER_NOT_FOUND');
    await resetUserPassword(pool,owner,a.actor.id,{password:newPassword,reason:'Restablecimiento acordado'});
    await reject(()=>authenticate(pool,s.token),'UNAUTHENTICATED');assert((await signIn(a.email,newPassword)).token);
    const logs=await listAdministrativeEvents(pool,owner);const reset=logs.items.find(r=>r.entity_id===a.actor.id&&r.action==='PASSWORD_RESET');
    assert(reset);assert.deepEqual(reset.details,{reason:'Restablecimiento acordado'});assert(!JSON.stringify(logs).includes(newPassword));
  });
  test('owner settings expose the current reservation period without making it public',async()=>{
    const c=await company();
    assert.equal((await companySettings(pool,c.actor)).reservation_minutes,15);
    await updateOrderSettings(pool,c.actor,{reservationMinutes:37});
    assert.equal((await companySettings(pool,c.actor)).reservation_minutes,37);
    assert(!('reservation_minutes' in await publicSettings(pool,c.slug)));
    const a=await user();await reject(()=>companySettings(pool,a.actor),'FORBIDDEN');
  });
  test('branding settings are public, validated and separate for each company',async()=>{
    const a=await user();const before=await companySettings(pool,other);
    await patchCompanySettings(pool,owner,{name:'Tecnología propia',primaryColor:'#112233',logoUrl:'https://example.test/logo.png',contactEmail:'CONTACTO@EXAMPLE.TEST',about:'Nuestra tienda',reason:'Configurar empresa'});
    const visible=await publicSettings(pool,slug);assert.equal(visible.name,'Tecnología propia');assert.equal(visible.poweredBy,'Nexo');assert.equal(visible.contact_email,'contacto@example.test');
    assert(!('reservation_minutes' in visible));assert.deepEqual(await companySettings(pool,other),before);
    await reject(()=>patchCompanySettings(pool,a.actor,{name:'Intruso',reason:'Sin permisos'}),'FORBIDDEN');
    await assert.rejects(()=>patchCompanySettings(pool,owner,{logoUrl:'javascript:alert(1)',reason:'URL inválida'}));
    await assert.rejects(()=>patchCompanySettings(pool,owner,{primaryColor:'red',reason:'Color inválido'}));
  });
  test('audit is administrator-only, immutable and scoped to the company',async()=>{
    const a=await user();const events=await listAdministrativeEvents(pool,owner);assert(events.items.length);
    await reject(()=>listAdministrativeEvents(pool,a.actor),'FORBIDDEN');
    await assert.rejects(()=>pool.query('DELETE FROM administrative_events WHERE id=$1',[events.items[0].id]));
    const foreign=await listAdministrativeEvents(pool,other);assert(foreign.items.every(r=>r.actor_id===other.id));
  });
  test('HTTP administration authenticates, uses company session and rejects customer mutations',async()=>{
    const a=await user('CUSTOMER');const session=await signIn('owner@example.test');const customer=await signIn(a.email);
    const headers={'content-type':'application/json',origin:'http://localhost:3000',cookie:`nexo_session=${session.token}`};
    const path=['users',a.actor.id];
    const response=await PATCH(new Request(`http://localhost:3000/api/${path.join('/')}`,{method:'PATCH',headers,body:JSON.stringify({name:'Actualizado por API',reason:'Corrección de nombre'})}),{params:Promise.resolve({path})});
    assert.equal(response.status,200);assert.equal((await response.json()).name,'Actualizado por API');
    const forbidden=await PATCH(new Request(`http://localhost:3000/api/${path.join('/')}`,{method:'PATCH',headers:{...headers,cookie:`nexo_session=${customer.token}`},body:JSON.stringify({active:false,reason:'Sin autorización'})}),{params:Promise.resolve({path})});
    assert.equal(forbidden.status,403);
    const publicResponse=await GET(new Request(`http://localhost:3000/api/public/${slug}/settings`),{params:Promise.resolve({path:['public',slug,'settings']})});assert.equal(publicResponse.status,200);
    const changed=await POST(new Request('http://localhost:3000/api/auth/password',{method:'POST',headers:{...headers,cookie:`nexo_session=${customer.token}`},body:JSON.stringify({currentPassword:password,newPassword})}),{params:Promise.resolve({path:['auth','password']})});
    assert.equal(changed.status,200);assert(changed.headers.get('set-cookie')?.includes('Max-Age=0'));
  });
});
