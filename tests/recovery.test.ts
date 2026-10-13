import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,login,authenticate,digest,type Actor} from '../src/server/auth';
import {database,transaction} from '../src/server/db';
import {createUser} from '../src/server/manage';
import {patchUser,resetUserPassword,changePassword} from '../src/server/accounts';
import {createOnlineOrder} from '../src/server/orders';
import {registerCustomer,requestAccountMail,consumeAccountToken} from '../src/server/recovery';
import {decryptLocalMail} from '../src/server/local-mail';
import {POST} from '../src/app/api/[...path]/route';

describe('Public registration, verification and recovery',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
  const schema=`nexo_recovery_test_${randomUUID().replaceAll('-','')}`;
  const password='Registration-password-123!',newPassword='Recovered-password-456!';
  const key=randomBytes(32).toString('hex');
  let admin:Pool,pool:Pool,owner:Actor,slug:string,otherSlug:string;
  before(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);
    admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('options',`-c search_path=${schema}`);pool=new Pool({connectionString:url.toString()});
    Object.assign(process.env,{DATABASE_URL:url.toString(),APP_ORIGIN:'http://localhost:3000',NODE_ENV:'test',NEXO_LOCAL_MAIL_ENABLED:'true',NEXO_LOCAL_MAIL_KEY:key});
    await migrate(pool);await migrate(pool);slug=`registration-${randomUUID().slice(0,8)}`;otherSlug=`other-${randomUUID().slice(0,8)}`;
    const c=await createCompany(pool,{slug,name:'Registro',email:'owner@example.test',password});
    owner={id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER'};
    await createCompany(pool,{slug:otherSlug,name:'Otra',email:'owner@example.test',password});
  });
  after(async()=>{if(pool)await pool.end();await database().end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
  const reject=(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,(e:{code?:string})=>e.code===code);
  async function register(){
    const email=`${randomUUID()}@example.test`;await registerCustomer(pool,{company:slug,email,name:'Cliente',password});
    const user=(await pool.query('SELECT * FROM users WHERE company_id=$1 AND email=$2',[owner.company_id,email])).rows[0];return {email,user};
  }
  type Message={purpose:string;token:string;recipient:string;endpoint:string};
  async function message(email:string,purpose='VERIFY_EMAIL'){
    const row=(await pool.query(`SELECT m.* FROM local_mail m JOIN account_tokens t ON t.company_id=m.company_id AND t.id=m.token_id
      WHERE m.company_id=$1 AND m.recipient=$2 AND m.purpose=$3 AND t.invalidated_at IS NULL AND t.consumed_at IS NULL ORDER BY m.created_at DESC LIMIT 1`,[owner.company_id,email,purpose])).rows[0];
    assert(row);return {row,payload:decryptLocalMail(row.encrypted_payload,row.company_id,row.id) as Message};
  }
  const consume=(purpose:'VERIFY_EMAIL'|'RESET_PASSWORD',token:string,company=slug)=>consumeAccountToken(pool,purpose,{company,token,...(purpose==='RESET_PASSWORD'?{newPassword}: {})});
  async function verified(){const s=await register();await consume('VERIFY_EMAIL',(await message(s.email)).payload.token);return s;}

  test('register creates only unverified CUSTOMER, encrypted local message and no public credentials',async()=>{
    const {email,user}=await register();assert.equal(user.role,'CUSTOMER');assert.equal(user.email_verification_required,true);assert.equal(user.email_verified_at,null);
    await reject(()=>login(pool,{company:slug,email,password}),'INVALID_CREDENTIALS');
    const {row,payload}=await message(email);assert(!row.encrypted_payload.includes(payload.token));
    const token=(await pool.query('SELECT token_hash FROM account_tokens WHERE id=$1',[row.token_id])).rows[0];assert.equal(token.token_hash,digest(payload.token));
    const actor={id:user.id,company_id:owner.company_id,name:'Cliente',role:'CUSTOMER' as const};
    await reject(()=>createOnlineOrder(pool,actor,randomUUID(),{fulfillment:'PICKUP',locationId:randomUUID(),items:[{productId:randomUUID(),quantity:1}]}),'FORBIDDEN');
    const audit=(await pool.query('SELECT details FROM administrative_events WHERE entity_id=$1',[user.id])).rows;
    assert(!JSON.stringify(audit).includes(payload.token));assert(!JSON.stringify(audit).includes(password));
  });
  test('duplicate and unknown-company registration have same response without changing credentials',async()=>{
    const {email,user}=await register();
    const duplicate=await registerCustomer(pool,{company:slug,email,name:'Intruso',password:newPassword});
    const unknown=await registerCustomer(pool,{company:'unknown-company',email,name:'Intruso',password:newPassword});assert.deepEqual(duplicate,unknown);
    const after=(await pool.query('SELECT password_hash,name FROM users WHERE id=$1',[user.id])).rows[0];assert.equal(after.password_hash,user.password_hash);assert.equal(after.name,'Cliente');
    assert.equal((await pool.query('SELECT 1 FROM local_mail WHERE recipient=$1',[email])).rowCount,1);
    await assert.rejects(()=>registerCustomer(pool,{company:slug,email,name:'Admin',password,role:'OWNER'}));
  });
  test('verification is single-use under concurrency and then permits login',async()=>{
    const {email}=await register();const {payload}=await message(email);
    const results=await Promise.allSettled([consume('VERIFY_EMAIL',payload.token),consume('VERIFY_EMAIL',payload.token)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert((await login(pool,{company:slug,email,password})).token);
    await reject(()=>consume('VERIFY_EMAIL',payload.token),'TOKEN_INVALID');
  });
  test('resend invalidates previous verification and does not change user password',async()=>{
    const {email}=await register();const old=(await message(email)).payload;
    await requestAccountMail(pool,'VERIFY_EMAIL',{company:slug,email});const current=(await message(email)).payload;
    assert.notEqual(old.token,current.token);await reject(()=>consume('VERIFY_EMAIL',old.token),'TOKEN_INVALID');await consume('VERIFY_EMAIL',current.token);
    assert((await login(pool,{company:slug,email,password})).token);
  });
  test('wrong company, wrong purpose and expired tokens cannot verify',async()=>{
    const {email}=await register();const {payload,row}=await message(email);
    await reject(()=>consume('VERIFY_EMAIL',payload.token,otherSlug),'TOKEN_INVALID');
    await reject(()=>consume('RESET_PASSWORD',payload.token),'TOKEN_INVALID');
    await transaction(pool,async db=>{
      await db.query('ALTER TABLE account_tokens DISABLE TRIGGER account_token_transitions');
      await db.query("UPDATE account_tokens SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[row.token_id]);
      await db.query('ALTER TABLE account_tokens ENABLE TRIGGER account_token_transitions');
    });
    await reject(()=>consume('VERIFY_EMAIL',payload.token),'TOKEN_INVALID');
  });
  test('recovery changes password once, revokes sessions and never signs in automatically',async()=>{
    const {email}=await verified();const session=await login(pool,{company:slug,email,password});
    const response=await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email});assert(!('token' in response));
    const {payload}=await message(email,'RESET_PASSWORD');const result=await consume('RESET_PASSWORD',payload.token);assert.equal(result.signInRequired,true);
    await reject(()=>authenticate(pool,session.token),'UNAUTHENTICATED');await reject(()=>login(pool,{company:slug,email,password}),'INVALID_CREDENTIALS');
    assert((await login(pool,{company:slug,email,password:newPassword})).token);await reject(()=>consume('RESET_PASSWORD',payload.token),'TOKEN_INVALID');
  });
  test('inactive, unknown and unverified mailboxes receive same response without reset messages',async()=>{
    const {email,user}=await register();
    const unverified=await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email});
    const unknown=await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email:'missing@example.test'});assert.deepEqual(unverified,unknown);
    await patchUser(pool,owner,user.id,{active:false,reason:'Suspensión de prueba'});
    assert.deepEqual(await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email}),unknown);
    assert.equal((await pool.query("SELECT 1 FROM local_mail WHERE recipient=$1 AND purpose='RESET_PASSWORD'",[email])).rowCount,0);
  });
  test('new reset request invalidates old request, concurrent consumption applies once',async()=>{
    const {email}=await verified();await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email});const old=(await message(email,'RESET_PASSWORD')).payload;
    await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email});const next=(await message(email,'RESET_PASSWORD')).payload;
    await reject(()=>consume('RESET_PASSWORD',old.token),'TOKEN_INVALID');
    const results=await Promise.allSettled([consume('RESET_PASSWORD',next.token),consume('RESET_PASSWORD',next.token)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  });
  test('email edits clear verification and invalidate pending tokens',async()=>{
    const {email,user}=await verified();await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email});const token=(await message(email,'RESET_PASSWORD')).payload.token;
    const next=`${randomUUID()}@example.test`;await patchUser(pool,owner,user.id,{email:next,reason:'Correo nuevo'});
    await reject(()=>consume('RESET_PASSWORD',token),'TOKEN_INVALID');await reject(()=>login(pool,{company:slug,email:next,password}),'INVALID_CREDENTIALS');
    await requestAccountMail(pool,'VERIFY_EMAIL',{company:slug,email:next});await consume('VERIFY_EMAIL',(await message(next)).payload.token);
    assert((await login(pool,{company:slug,email:next,password})).token);
  });
  test('admin password reset and deactivation invalidate previously issued tokens',async()=>{
    const {email,user}=await verified();await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email});const old=(await message(email,'RESET_PASSWORD')).payload.token;
    await resetUserPassword(pool,owner,user.id,{password:newPassword,reason:'Reset administrado'});await reject(()=>consume('RESET_PASSWORD',old),'TOKEN_INVALID');
    await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email});const next=(await message(email,'RESET_PASSWORD')).payload.token;
    await patchUser(pool,owner,user.id,{active:false,reason:'Desactivar cuenta'});await patchUser(pool,owner,user.id,{active:true,reason:'Reactivar cuenta'});
    await reject(()=>consume('RESET_PASSWORD',next),'TOKEN_INVALID');
  });
  test('public request limits persist even when no account exists',async()=>{
    const email=`${randomUUID()}@example.test`;for(let i=0;i<5;i++)await requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email});
    await reject(()=>requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email}),'ACCOUNT_RATE_LIMIT');
  });
  test('wrong current-password attempts are limited without revoking valid session',async()=>{
    const u=await createUser(pool,owner,{name:'Cambio',email:`${randomUUID()}@example.test`,password,role:'CUSTOMER'});
    const actor={id:u.id,company_id:owner.company_id,name:u.name,role:'CUSTOMER' as const};const session=await login(pool,{company:slug,email:u.email,password});
    for(let i=0;i<5;i++)await reject(()=>changePassword(pool,actor,{currentPassword:'incorrecta',newPassword}),'CURRENT_PASSWORD_INVALID');
    await reject(()=>changePassword(pool,actor,{currentPassword:password,newPassword}),'ACCOUNT_RATE_LIMIT');assert((await authenticate(pool,session.token)).id);
  });
  test('local encryption rejects tampering, different message/company and production mode',async()=>{
    const {email}=await register();const {row}=await message(email);
    assert.throws(()=>decryptLocalMail(row.encrypted_payload,owner.company_id,randomUUID()));
    assert.throws(()=>decryptLocalMail(row.encrypted_payload,randomUUID(),row.id));
    assert.throws(()=>decryptLocalMail(row.encrypted_payload.slice(0,-8)+'AAAAAAAA',owner.company_id,row.id));
    Object.assign(process.env,{NODE_ENV:'production'});
    try{await reject(()=>requestAccountMail(pool,'RESET_PASSWORD',{company:slug,email}),'MAIL_UNAVAILABLE');assert.throws(()=>decryptLocalMail(row.encrypted_payload,owner.company_id,row.id));}
    finally{Object.assign(process.env,{NODE_ENV:'test'});}
  });
  test('failure to save local mail rolls back account, tokens and audit',async()=>{
    const email=`${randomUUID()}@example.test`;
    await pool.query(`CREATE FUNCTION fail_local_mail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test failure'; END; $$`);
    await pool.query('CREATE TRIGGER fail_mail BEFORE INSERT ON local_mail FOR EACH ROW EXECUTE FUNCTION fail_local_mail()');
    try{await assert.rejects(()=>registerCustomer(pool,{company:slug,email,name:'Rollback',password}));}
    finally{await pool.query('DROP TRIGGER fail_mail ON local_mail');await pool.query('DROP FUNCTION fail_local_mail()');}
    assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1',[email])).rowCount,0);
    assert.equal((await pool.query('SELECT 1 FROM account_tokens WHERE email=$1',[email])).rowCount,0);
  });
  test('HTTP public flow enforces Origin and never exposes tokens in response',async()=>{
    const email=`${randomUUID()}@example.test`;const raw={company:slug,email,name:'HTTP',password};
    const headers={'content-type':'application/json',origin:'http://localhost:3000'};
    const request=(path:string,data:unknown,origin=headers.origin)=>POST(new Request(`http://localhost:3000/api/auth/${path}`,{method:'POST',headers:{...headers,origin},body:JSON.stringify(data)}),{params:Promise.resolve({path:['auth',path]})});
    assert.equal((await request('register',raw,'https://attacker.test')).status,403);
    const registered=await request('register',raw);assert.equal(registered.status,202);assert(!JSON.stringify(await registered.json()).includes('token'));
    const token=(await message(email)).payload.token;assert.equal((await request('verify-email',{company:slug,token})).status,200);
    assert.equal((await request('forgot-password',{company:slug,email})).status,202);
    const reset=await request('reset-password',{company:slug,token:(await message(email,'RESET_PASSWORD')).payload.token,newPassword});
    assert.equal(reset.status,200);assert(reset.headers.get('set-cookie')?.includes('Max-Age=0'));
  });
  test('local-mail CLI exports exclusively to ignored local file and never prints token',async()=>{
    const {email}=await register();const {row,payload}=await message(email);const path=resolve('.local-mail',`${row.id}.json`);
    const exported=spawnSync(process.execPath,['--import','tsx','scripts/local-mail.ts',owner.company_id,row.id],{encoding:'utf8',env:process.env});
    assert.equal(exported.status,0,exported.stderr);assert(!exported.stdout.includes(payload.token));
    try{
      const stored=JSON.parse(await readFile(path,'utf8'));assert.equal(stored.token,payload.token);assert.equal(stored.company,slug);
      const repeated=spawnSync(process.execPath,['--import','tsx','scripts/local-mail.ts',owner.company_id,row.id],{encoding:'utf8',env:process.env});assert.equal(repeated.status,1);
    }finally{await unlink(path);}
  });
});
