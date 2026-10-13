import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {writeFile,unlink,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,login,type Actor} from '../src/server/auth';
import {database} from '../src/server/db';
import {createUser,createLocation,createProduct} from '../src/server/manage';
import {applyOperation} from '../src/server/inventory';
import {recordCommercial,commercialSummary,commercialHistory,type CommercialInput} from '../src/server/commercial';
import {onboardCompany} from '../src/server/onboarding';
import {GET,POST,PATCH} from '../src/app/api/[...path]/route';

describe('Commercial registry without billing or operational gates',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
  const schema=`nexo_commercial_test_${randomUUID().replaceAll('-','')}`,password='Commercial-password-123!';
  let pool:Pool,admin:Pool,url:string;
  const day=86400000,now=Date.now(),date=(delta:number)=>new Date(now+delta*day).toISOString();
  const terms=(patch:Partial<CommercialInput>={}):CommercialInput=>({mode:'SUBSCRIPTION',status:'ENABLED',effectiveAt:date(-2),startsAt:date(-2),accessUntil:date(30),
    updatesUntil:date(30),supportUntil:date(30),operator:'Operador de prueba',reference:'Acuerdo de prueba',reason:'Alta comercial manual',expectedRevision:0,...patch});
  before(async()=>{
    const parsed=new URL(process.env.TEST_DATABASE_URL!);assert.match(parsed.pathname,/test/i);admin=new Pool({connectionString:parsed.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);
    parsed.searchParams.set('options',`-c search_path=${schema}`);url=parsed.toString();pool=new Pool({connectionString:url});
    Object.assign(process.env,{DATABASE_URL:url,APP_ORIGIN:'http://localhost:3000',NODE_ENV:'test'});await migrate(pool);await migrate(pool);
  });
  after(async()=>{if(pool)await pool.end();await database().end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
  const reject=(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,(e:{code?:string})=>e.code===code);
  async function company(){const slug=`commercial-${randomUUID().slice(0,8)}`;const c=await createCompany(pool,{slug,name:'Pyme',email:'owner@example.test',password});
    return {...c,slug,actor:{id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER' as const}};}

  test('existing company is UNCONFIGURED without implicit contract, payment or operational lock',async()=>{
    const c=await company();const s=await commercialSummary(pool,c.actor);assert.equal(s.state,'UNCONFIGURED');assert.equal(s.latestRevision,0);assert.equal(s.current,null);
    assert.equal(s.operationalRestriction,'NONE');assert.equal(s.billingEnabled,false);
  });
  test('subscription snapshot has independent access/update/support periods',async()=>{
    const c=await company();await recordCommercial(pool,c.companyId,randomUUID(),terms({updatesUntil:date(-1),supportUntil:date(3)}));
    const s=await commercialSummary(pool,c.actor);assert.equal(s.state,'ACTIVE');assert.equal(s.current?.mode,'SUBSCRIPTION');assert.equal(s.current?.updatesActive,false);assert.equal(s.current?.supportActive,true);
    assert(!('request_hash' in s.current!)&&!('idempotency_key' in s.current!));
  });
  test('perpetual usage remains ACTIVE when update and support periods expire',async()=>{
    const c=await company();await recordCommercial(pool,c.companyId,randomUUID(),terms({mode:'PERPETUAL',accessUntil:null,updatesUntil:date(-1),supportUntil:date(-1)}));
    const s=await commercialSummary(pool,c.actor);assert.equal(s.state,'ACTIVE');assert.equal(s.current?.access_until,null);assert.equal(s.current?.supportActive,false);assert.equal(s.current?.updatesActive,false);
  });
  test('expired subscription never blocks stock operations or changes stock automatically',async()=>{
    const c=await company();const branch=await createLocation(pool,c.actor,{name:'Centro',kind:'STORE'});const p=await createProduct(pool,c.actor,{sku:'SSD',name:'SSD',priceMinor:1000});
    await applyOperation(pool,c.actor,randomUUID(),{kind:'RECEIPT',productId:p.id,locationId:branch.id,quantity:3,reason:'Carga inicial'});
    await recordCommercial(pool,c.companyId,randomUUID(),terms({accessUntil:date(-1)}));assert.equal((await commercialSummary(pool,c.actor)).state,'EXPIRED');
    assert.equal((await pool.query('SELECT on_hand FROM stock WHERE product_id=$1',[p.id])).rows[0].on_hand,3);
    await applyOperation(pool,c.actor,randomUUID(),{kind:'SALE',productId:p.id,locationId:branch.id,quantity:1,reason:'Venta tras registro comercial'});
    assert.equal((await pool.query('SELECT on_hand FROM stock WHERE product_id=$1',[p.id])).rows[0].on_hand,2);
  });
  test('scheduled renewal does not replace active terms before effective date',async()=>{
    const c=await company();await recordCommercial(pool,c.companyId,randomUUID(),terms());
    await recordCommercial(pool,c.companyId,randomUUID(),terms({expectedRevision:1,effectiveAt:date(10),accessUntil:date(60)}));
    const s=await commercialSummary(pool,c.actor);assert.equal(s.latestRevision,2);assert.equal(s.current?.revision,1);assert.equal(s.state,'ACTIVE');
    assert.equal(s.scheduled[0].revision,2);assert.equal(s.scheduled[0].accessStatus,'SCHEDULED');assert.equal(s.scheduled[0].supportActive,false);
  });
  test('future first activation has no current contract yet',async()=>{
    const c=await company();await recordCommercial(pool,c.companyId,randomUUID(),terms({effectiveAt:date(10),startsAt:date(10)}));
    const s=await commercialSummary(pool,c.actor);assert.equal(s.state,'SCHEDULED');assert.equal(s.current,null);
  });
  test('newer immediate revision supersedes old scheduled revision without reviving it',async()=>{
    const c=await company();await recordCommercial(pool,c.companyId,randomUUID(),terms());
    await recordCommercial(pool,c.companyId,randomUUID(),terms({expectedRevision:1,effectiveAt:date(10),accessUntil:date(60)}));
    await recordCommercial(pool,c.companyId,randomUUID(),terms({expectedRevision:2,status:'CANCELLED'}));
    const s=await commercialSummary(pool,c.actor);assert.equal(s.state,'CANCELLED');assert.equal(s.current?.revision,3);assert.equal(s.scheduled.length,0);assert.equal(s.operationalRestriction,'NONE');
    assert.equal(s.current?.updatesActive,false);
  });
  test('concurrent same-key recording produces one revision and audit event',async()=>{
    const c=await company(),key=randomUUID(),raw=terms();const results=await Promise.all([recordCommercial(pool,c.companyId,key,raw),recordCommercial(pool,c.companyId,key,raw)]);
    assert.equal(results.filter(r=>r.replayed).length,1);assert.equal(results[0].record.id,results[1].record.id);
    assert.equal((await pool.query("SELECT 1 FROM administrative_events WHERE company_id=$1 AND action='COMMERCIAL_RECORDED'",[c.companyId])).rowCount,1);
    await reject(()=>recordCommercial(pool,c.companyId,key,{...raw,reason:'Otro motivo'}),'IDEMPOTENCY_CONFLICT');
  });
  test('optimistic revision rejects lost updates and replay never overwrites latest terms',async()=>{
    const c=await company(),key=randomUUID(),raw=terms();await recordCommercial(pool,c.companyId,key,raw);
    const results=await Promise.allSettled([30,60].map(days=>recordCommercial(pool,c.companyId,randomUUID(),terms({expectedRevision:1,accessUntil:date(days)}))));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const replay=await recordCommercial(pool,c.companyId,key,raw);assert.equal(replay.record.revision,1);assert.equal(replay.summary.latestRevision,2);
    await reject(()=>recordCommercial(pool,c.companyId,randomUUID(),terms()),'COMMERCIAL_REVISION_CONFLICT');
  });
  test('strict schema rejects permanent expiry, missing subscription expiry and unpriced arbitrary plans',async()=>{
    const c=await company();for(const raw of [terms({mode:'PERPETUAL'}),terms({accessUntil:null}),terms({accessUntil:date(-3)}),terms({supportUntil:date(-3)}),{...terms(),priceMinor:999},{...terms(),plan:'PRO'}]){
      await assert.rejects(()=>recordCommercial(pool,c.companyId,randomUUID(),raw));
    }
    assert.equal((await commercialHistory(pool,c.actor)).items.length,0);
    await reject(()=>recordCommercial(pool,randomUUID(),randomUUID(),terms()),'COMPANY_NOT_FOUND');
  });
  test('operator onboarding creates administrator and first commercial revision atomically',async()=>{
    const slug=`onboard-${randomUUID().slice(0,8)}`;const input={slug,name:'Nueva pyme',email:'owner@example.test',password};
    const created=await onboardCompany(pool,input,randomUUID(),terms());assert.equal(created.commercial.record.revision,1);
    assert((await login(pool,{company:slug,email:input.email,password})).token);
    const failedSlug=`failed-${randomUUID().slice(0,8)}`;await reject(()=>onboardCompany(pool,{...input,slug:failedSlug},randomUUID(),terms({expectedRevision:1})),'COMMERCIAL_REVISION_CONFLICT');
    assert.equal((await pool.query('SELECT 1 FROM companies WHERE slug=$1',[failedSlug])).rowCount,0);
  });
  test('company separation and read-only HTTP prevent self-granting licenses',async()=>{
    const c=await company(),other=await company();await recordCommercial(pool,c.companyId,randomUUID(),terms());
    assert.equal((await commercialSummary(pool,other.actor)).state,'UNCONFIGURED');
    const u=await createUser(pool,c.actor,{name:'Agent',email:'agent@example.test',password,role:'AGENT'});const agent:Actor={id:u.id,company_id:c.companyId,name:u.name,role:'AGENT'};
    await reject(()=>commercialSummary(pool,agent),'FORBIDDEN');
    const session=await login(pool,{company:c.slug,email:'owner@example.test',password});const headers={'content-type':'application/json',origin:'http://localhost:3000',cookie:`nexo_session=${session.token}`};
    const get=await GET(new Request('http://localhost:3000/api/commercial',{headers}),{params:Promise.resolve({path:['commercial']})});assert.equal(get.status,200);
    for(const handler of [POST,PATCH]){
      const response=await handler(new Request('http://localhost:3000/api/commercial',{method:handler===POST?'POST':'PATCH',headers,body:JSON.stringify(terms())}),{params:Promise.resolve({path:['commercial']})});assert.equal(response.status,404);
    }
  });
  test('commercial ledger cannot be rewritten or deleted and revisions cannot be skipped',async()=>{
    const c=await company();const r=await recordCommercial(pool,c.companyId,randomUUID(),terms());
    await assert.rejects(()=>pool.query('UPDATE commercial_revisions SET support_until=clock_timestamp() WHERE id=$1',[r.record.id]));
    await assert.rejects(()=>pool.query('DELETE FROM commercial_revisions WHERE id=$1',[r.record.id]));
    await assert.rejects(()=>pool.query(`INSERT INTO commercial_revisions SELECT $1,company_id,revision+2,mode,status,effective_at,starts_at,access_until,
      updates_until,support_until,operator_label,reference,reason,$2,request_hash,clock_timestamp() FROM commercial_revisions WHERE id=$3`,[randomUUID(),randomUUID(),r.record.id]));
  });
  test('operator CLI requires separate connection and never prints admin password',async()=>{
    const c=await company();const directory=resolve('.local-mail');await mkdir(directory,{recursive:true});const file=resolve(directory,`commercial-${randomUUID()}.json`);
    await writeFile(file,JSON.stringify(terms()),{flag:'wx'});
    try{
      const base={...process.env,NEXO_OPERATOR_DATABASE_URL:''};
      const rejected=spawnSync(process.execPath,['--import','tsx','scripts/commercial.ts','record',c.companyId,randomUUID(),file],{encoding:'utf8',env:base});assert.equal(rejected.status,1);
      const result=spawnSync(process.execPath,['--import','tsx','scripts/commercial.ts','record',c.companyId,randomUUID(),file],{encoding:'utf8',env:{...base,NEXO_OPERATOR_DATABASE_URL:url}});assert.equal(result.status,0,result.stderr);
      assert.equal(JSON.parse(result.stdout).revision,1);assert(!result.stdout.includes(password));
    }finally{await unlink(file);}
  });
});
