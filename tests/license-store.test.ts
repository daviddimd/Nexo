import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,login,type Actor} from '../src/server/auth';
import {database} from '../src/server/db';
import {createUser} from '../src/server/manage';
import {recordCommercial,type CommercialInput} from '../src/server/commercial';
import {signLicense,type LicenseClaims} from '../src/server/licenses';
import {importLicense,licenseSummary,licenseHistory,type LicenseContext} from '../src/server/license-store';
import {GET,POST,PATCH} from '../src/app/api/[...path]/route';

describe('Persistent signed licenses',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
  const schema=`nexo_license_test_${randomUUID().replaceAll('-','')}`,password='License-password-123!';
  const pair=generateKeyPairSync('ed25519'),privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
  const publicPem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
  const context:LicenseContext={installationId:randomUUID(),trustedKeys:{operator:publicPem}};
  let pool:Pool,admin:Pool,url:string;
  const day=86400000,now=Date.now(),date=(days:number)=>new Date(now+days*day).toISOString();
  const terms=(patch:Partial<CommercialInput>={}):CommercialInput=>({mode:'SUBSCRIPTION',status:'ENABLED',effectiveAt:date(-1),startsAt:date(-2),accessUntil:date(30),
    updatesUntil:date(10),supportUntil:date(20),operator:'Test operator',reference:'Agreement',reason:'Initial terms',expectedRevision:0,...patch});
  before(async()=>{
    const parsed=new URL(process.env.TEST_DATABASE_URL!);assert.match(parsed.pathname,/test/i);admin=new Pool({connectionString:parsed.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);
    parsed.searchParams.set('options',`-c search_path=${schema}`);url=parsed.toString();pool=new Pool({connectionString:url});
    Object.assign(process.env,{DATABASE_URL:url,APP_ORIGIN:'http://localhost:3000',NODE_ENV:'test'});await migrate(pool);await migrate(pool);
  });
  after(async()=>{if(pool)await pool.end();await database().end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
  async function company(){const slug=`license-${randomUUID().slice(0,8)}`;const c=await createCompany(pool,{slug,name:'Pyme',email:'owner@example.test',password});
    return {...c,slug,actor:{id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER' as const}};}
  function signed(companyId:string,t:CommercialInput,revision=1,patch:Partial<LicenseClaims>={}){
    return signLicense({format:'nexo-license-v1',licenseId:randomUUID(),companyId,installationId:context.installationId,revision,issuedAt:date(-1),
      effectiveAt:t.effectiveAt,startsAt:t.startsAt,accessUntil:t.accessUntil,updatesUntil:t.updatesUntil,supportUntil:t.supportUntil,mode:t.mode,status:t.status,...patch},'operator',privatePem);
  }
  const reject=(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,(e:{code?:string})=>e.code===code);
  async function recorded(patch:Partial<CommercialInput>={}){const c=await company(),t=terms(patch);await recordCommercial(pool,c.companyId,randomUUID(),t);return {...c,t,token:signed(c.companyId,t)};}

  test('existing company remains unconfigured without automatic import',async()=>{
    const c=await company();assert.equal((await licenseSummary(pool,c.actor,context)).state,'UNCONFIGURED');
    assert.equal((await licenseHistory(pool,c.actor)).items.length,0);
  });
  test('import is immutable, linked to commercial terms and audited once on concurrent retry',async()=>{
    const c=await recorded();const results=await Promise.all([importLicense(pool,c.companyId,c.token,context),importLicense(pool,c.companyId,c.token,context)]);
    assert.equal(results[0].id,results[1].id);assert.equal(results.filter(r=>r.replayed).length,1);
    const s=await licenseSummary(pool,c.actor,context);assert.equal(s.state,'ACTIVE');assert.equal(s.latestRevision,1);assert.equal(s.operationalRestriction,'NONE');
    assert.equal((await pool.query("SELECT 1 FROM administrative_events WHERE company_id=$1 AND action='LICENSE_IMPORTED'",[c.companyId])).rowCount,1);
    await assert.rejects(()=>pool.query('DELETE FROM license_imports WHERE company_id=$1',[c.companyId]));
    await assert.rejects(()=>pool.query('UPDATE license_imports SET revision=2 WHERE company_id=$1',[c.companyId]));
    await assert.rejects(()=>pool.query('DELETE FROM installation_identity'));
  });
  test('higher revision advances; old replay cannot replace it and different same revision conflicts',async()=>{
    const c=await recorded();await importLicense(pool,c.companyId,c.token,context);
    const t2=terms({expectedRevision:1,status:'CANCELLED'});await recordCommercial(pool,c.companyId,randomUUID(),t2);
    await importLicense(pool,c.companyId,signed(c.companyId,t2,2),context);
    const replay=await importLicense(pool,c.companyId,c.token,context);assert.equal(replay.latestRevision,2);assert.equal(replay.replayed,true);
    assert.equal((await licenseSummary(pool,c.actor,context)).state,'CANCELLED');
    await reject(()=>importLicense(pool,c.companyId,signed(c.companyId,c.t),context),'LICENSE_REVISION_CONFLICT');
  });
  test('unimported older revision cannot be introduced after a newer one',async()=>{
    const c=await recorded();const t2=terms({expectedRevision:1});await recordCommercial(pool,c.companyId,randomUUID(),t2);
    await importLicense(pool,c.companyId,signed(c.companyId,t2,2),context);
    await reject(()=>importLicense(pool,c.companyId,c.token,context),'LICENSE_ROLLBACK');
    const first=(await pool.query('SELECT id FROM commercial_revisions WHERE company_id=$1 AND revision=1',[c.companyId])).rows[0].id;
    await assert.rejects(()=>pool.query(`INSERT INTO license_imports(id,company_id,installation_id,revision,license_id,commercial_id,effective_at,envelope,document_hash)
      SELECT $1,company_id,installation_id,1,$2,$3,effective_at,envelope,document_hash FROM license_imports WHERE company_id=$4`,[randomUUID(),randomUUID(),first,c.companyId]));
  });
  test('concurrent different documents for same revision accept exactly one',async()=>{
    const c=await recorded();const results=await Promise.allSettled([importLicense(pool,c.companyId,c.token,context),importLicense(pool,c.companyId,signed(c.companyId,c.t),context)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
    assert.equal((await licenseHistory(pool,c.actor)).items.length,1);
  });
  test('missing or mismatched commercial terms fail without importing',async()=>{
    const c=await company(),t=terms();await reject(()=>importLicense(pool,c.companyId,signed(c.companyId,t),context),'LICENSE_COMMERCIAL_MISMATCH');
    await recordCommercial(pool,c.companyId,randomUUID(),t);
    await reject(()=>importLicense(pool,c.companyId,signed(c.companyId,t,1,{supportUntil:date(25)}),context),'LICENSE_COMMERCIAL_MISMATCH');
    assert.equal((await licenseHistory(pool,c.actor)).items.length,0);
  });
  test('invalid signatures, foreign company and foreign installation rejected',async()=>{
    const c=await recorded(),other=await company();
    await reject(()=>importLicense(pool,c.companyId,{...c.token,signature:'AA'},context),'INVALID_LICENSE');
    await reject(()=>importLicense(pool,other.companyId,c.token,context),'INVALID_LICENSE');
    await reject(()=>importLicense(pool,c.companyId,signed(c.companyId,c.t,1,{installationId:randomUUID()}),context),'INVALID_LICENSE');
    await reject(()=>importLicense(pool,c.companyId,c.token,{...context,installationId:randomUUID()}),'INSTALLATION_MISMATCH');
  });
  test('future renewal remains scheduled while current effective license applies',async()=>{
    const c=await recorded();await importLicense(pool,c.companyId,c.token,context);
    const t2=terms({expectedRevision:1,effectiveAt:date(5)});await recordCommercial(pool,c.companyId,randomUUID(),t2);
    await importLicense(pool,c.companyId,signed(c.companyId,t2,2),context);
    const s=await licenseSummary(pool,c.actor,context);assert.equal(s.current?.revision,1);assert.equal(s.scheduled[0].revision,2);assert.equal(s.scheduled[0].state,'SCHEDULED');
    const t3=terms({expectedRevision:2,status:'CANCELLED'});await recordCommercial(pool,c.companyId,randomUUID(),t3);
    await importLicense(pool,c.companyId,signed(c.companyId,t3,3),context);
    assert.equal((await licenseSummary(pool,c.actor,context)).scheduled.length,0);
  });
  test('retiring a trusted key marks license invalid without fallback or operational gate',async()=>{
    const c=await recorded();await importLicense(pool,c.companyId,c.token,context);
    const t2=terms({expectedRevision:1});await recordCommercial(pool,c.companyId,randomUUID(),t2);
    const rotated=signLicense(JSON.parse(Buffer.from(signed(c.companyId,t2,2).payload,'base64url').toString('utf8')),'retired',privatePem);
    await importLicense(pool,c.companyId,rotated,{...context,trustedKeys:{...context.trustedKeys,retired:publicPem}});
    const s=await licenseSummary(pool,c.actor,context);assert.equal(s.state,'INVALID_SIGNATURE');assert.equal(s.current?.revision,2);assert.equal(s.current?.claims,null);assert.equal(s.operationalRestriction,'NONE');
  });
  test('expired and perpetual terms preserve independent coverage and no billing',async()=>{
    const c=await recorded({accessUntil:date(-0.5),updatesUntil:date(10)});await importLicense(pool,c.companyId,c.token,context);
    const s=await licenseSummary(pool,c.actor,context);assert.equal(s.state,'EXPIRED');assert.equal(s.current?.updatesActive,true);assert.equal(s.billingEnabled,false);
    const p=await recorded({mode:'PERPETUAL',accessUntil:null,supportUntil:date(-1),updatesUntil:date(-1)});await importLicense(pool,p.companyId,p.token,context);
    assert.equal((await licenseSummary(pool,p.actor,context)).state,'ACTIVE');
  });
  test('owner-only reads are isolated; no HTTP import writer',async()=>{
    const c=await recorded(),other=await company();await importLicense(pool,c.companyId,c.token,context);
    assert.equal((await licenseHistory(pool,other.actor)).items.length,0);
    const u=await createUser(pool,c.actor,{name:'Agent',email:'agent@example.test',password,role:'AGENT'});
    await reject(()=>licenseHistory(pool,{id:u.id,company_id:c.companyId,name:u.name,role:'AGENT'}),'FORBIDDEN');
    const session=await login(pool,{company:c.slug,email:'owner@example.test',password});
    const headers={origin:'http://localhost:3000',cookie:`nexo_session=${session.token}`};
    for(const handler of [POST,PATCH]){
      const r=await handler(new Request('http://localhost:3000/api/licenses',{method:handler===POST?'POST':'PATCH',headers}),{params:Promise.resolve({path:['licenses']})});assert.equal(r.status,404);
    }
    const r=await GET(new Request('http://localhost:3000/api/licenses/history',{headers}),{params:Promise.resolve({path:['licenses','history']})});
    assert.equal(r.status,200);const history=await r.json();assert.equal(history.items[0].envelope,undefined);
  });
  test('import CLI requires operator connection and reads installation binding',async()=>{
    const c=await recorded(),dir=await mkdtemp(join(tmpdir(),'nexo-import-'));
    try{
      const file=join(dir,'license.json'),identity=join(dir,'installation.json'),keys=join(dir,'keys.json');
      await writeFile(file,JSON.stringify(c.token));await writeFile(identity,JSON.stringify({format:'nexo-installation-v1',installationId:context.installationId}));await writeFile(keys,JSON.stringify(context.trustedKeys));
      const env={...process.env,NEXO_OPERATOR_DATABASE_URL:'',NEXO_LICENSE_TRUSTED_KEYS_FILE:keys};
      const args=['--import','tsx','scripts/license.ts','import',file,identity,c.companyId];
      assert.equal(spawnSync(process.execPath,args,{env,encoding:'utf8'}).status,1);
      const result=spawnSync(process.execPath,args,{env:{...env,NEXO_OPERATOR_DATABASE_URL:url},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
      assert.equal(JSON.parse(result.stdout).revision,1);
      Object.assign(process.env,{NEXO_INSTALLATION_FILE:identity,NEXO_LICENSE_TRUSTED_KEYS_FILE:keys});
      const session=await login(pool,{company:c.slug,email:'owner@example.test',password});
      const r=await GET(new Request('http://localhost:3000/api/licenses',{headers:{cookie:`nexo_session=${session.token}`}}),{params:Promise.resolve({path:['licenses']})});assert.equal(r.status,200);
      delete process.env.NEXO_INSTALLATION_FILE;
      const missing=await GET(new Request('http://localhost:3000/api/licenses',{headers:{cookie:`nexo_session=${session.token}`}}),{params:Promise.resolve({path:['licenses']})});assert.equal(missing.status,503);
    }finally{delete process.env.NEXO_INSTALLATION_FILE;delete process.env.NEXO_LICENSE_TRUSTED_KEYS_FILE;await rm(dir,{recursive:true,force:true});}
  });
});
