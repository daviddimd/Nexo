import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {initialSetup,initialSetupStatus} from '../src/server/initial-setup';
import {login,createCompany} from '../src/server/auth';
const input={slug:'mi-tienda',name:'Mi empresa',email:'owner@example.test',password:'Setup-local-password-123!'};
async function fixture(fn:(pool:Pool)=>Promise<void>){
 const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);const admin=new Pool({connectionString:url.toString()}),schema=`nexo_setup_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options',`-c search_path=${schema}`);const pool=new Pool({connectionString:url.toString()});
 const oldMode=process.env.NODE_ENV,oldFlag=process.env.NEXO_LOCAL_SETUP_ENABLED;Object.assign(process.env,{NODE_ENV:'test',NEXO_LOCAL_SETUP_ENABLED:'true'});
 try{await migrate(pool);await fn(pool);}finally{if(oldMode===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');else Object.assign(process.env,{NODE_ENV:oldMode});if(oldFlag===undefined)delete process.env.NEXO_LOCAL_SETUP_ENABLED;else process.env.NEXO_LOCAL_SETUP_ENABLED=oldFlag;await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
}
describe('First local setup',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
 test('concurrent first submissions create exactly one company and OWNER',()=>fixture(async pool=>{
  assert.equal((await initialSetupStatus(pool)).available,true);
  const results=await Promise.allSettled([initialSetup(pool,input),initialSetup(pool,{...input,slug:'otra-tienda'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await pool.query('SELECT 1 FROM companies')).rowCount,1);assert.equal((await pool.query("SELECT 1 FROM users WHERE role='OWNER'")).rowCount,1);
  const slug=(await pool.query('SELECT slug FROM companies')).rows[0].slug;assert.equal((await login(pool,{company:slug,email:input.email,password:input.password})).user.role,'OWNER');
  assert.equal((await initialSetupStatus(pool)).available,false);
 }));
 test('production and disabled local flag reject initialization',()=>fixture(async pool=>{
  Object.assign(process.env,{NODE_ENV:'production'});assert.equal((await initialSetupStatus(pool)).available,false);await assert.rejects(()=>initialSetup(pool,input));
  Object.assign(process.env,{NODE_ENV:'test'});delete process.env.NEXO_LOCAL_SETUP_ENABLED;await assert.rejects(()=>initialSetup(pool,input));assert.equal((await pool.query('SELECT 1 FROM companies')).rowCount,0);
 }));
 test('existing installation never allows public creation of another administrator',()=>fixture(async pool=>{
  await createCompany(pool,input);assert.equal((await initialSetupStatus(pool)).available,false);
  await assert.rejects(()=>initialSetup(pool,{...input,slug:'other'}),(e:{code?:string})=>e.code==='SETUP_COMPLETE');assert.equal((await pool.query('SELECT 1 FROM users')).rowCount,1);
 }));
 test('invalid credentials or injected role cannot create accounts',()=>fixture(async pool=>{
  await assert.rejects(()=>initialSetup(pool,{...input,password:'short'}));await assert.rejects(()=>initialSetup(pool,{...input,role:'OWNER'}));assert.equal((await pool.query('SELECT 1 FROM companies')).rowCount,0);
 }));
});

