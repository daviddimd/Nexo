import {after,before,beforeEach,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,login,type Actor} from '../src/server/auth';
import {database,transaction} from '../src/server/db';
import {createLocation,createUser,patchLocation} from '../src/server/manage';
import {patchUser} from '../src/server/accounts';
import {createInvitation,listInvitations,revokeInvitation,acceptInvitation} from '../src/server/invitations';
import {registerCustomer} from '../src/server/recovery';
import {decryptLocalMail} from '../src/server/local-mail';
import {POST,GET} from '../src/app/api/[...path]/route';

describe('Staff invitations',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
  const schema=`nexo_invitation_test_${randomUUID().replaceAll('-','')}`,password='Invitation-password-123!';
  let pool:Pool,admin:Pool,owner:Actor,other:Actor,agent:Actor,customer:Actor,branch:string,north:string,slug:string,otherSlug:string;
  before(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);admin=new Pool({connectionString:url.toString()});await admin.query(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('options',`-c search_path=${schema}`);pool=new Pool({connectionString:url.toString()});
    Object.assign(process.env,{DATABASE_URL:url.toString(),APP_ORIGIN:'http://localhost:3000',NODE_ENV:'test',NEXO_LOCAL_MAIL_ENABLED:'true',NEXO_LOCAL_MAIL_KEY:randomBytes(32).toString('hex')});
    await migrate(pool);await migrate(pool);slug=`invite-${randomUUID().slice(0,8)}`;otherSlug=`other-${randomUUID().slice(0,8)}`;
    const a=await createCompany(pool,{slug,name:'Invitaciones',email:'owner@example.test',password});owner={id:a.userId,company_id:a.companyId,name:'Owner',role:'OWNER'};
    const b=await createCompany(pool,{slug:otherSlug,name:'Otra',email:'owner@example.test',password});other={id:b.userId,company_id:b.companyId,name:'Other',role:'OWNER'};
    branch=(await createLocation(pool,owner,{name:'Centro',kind:'STORE'})).id;north=(await createLocation(pool,owner,{name:'Norte',kind:'STORE'})).id;
    const u=await createUser(pool,owner,{name:'Agente',email:'agent@example.test',password,role:'AGENT',locationIds:[branch]});agent={id:u.id,company_id:a.companyId,name:u.name,role:'AGENT'};
    const c=await createUser(pool,owner,{name:'Cliente',email:'customer@example.test',password,role:'CUSTOMER'});customer={id:c.id,company_id:a.companyId,name:c.name,role:'CUSTOMER'};
  });
  after(async()=>{if(pool)await pool.end();await database().end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
  // Each case has an independent rate-limit window in this isolated test schema.
  beforeEach(async()=>{await pool.query('DELETE FROM account_rate_limits');});
  const reject=(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,(e:{code?:string})=>e.code===code);
  const input=(patch:Record<string,unknown>={})=>({email:`${randomUUID()}@example.test`,role:'AGENT',locationIds:[branch],reason:'Nueva incorporación',...patch});
  async function invite(patch:Record<string,unknown>={}){return createInvitation(pool,owner,randomUUID(),input(patch));}
  async function token(id:string){const row=(await pool.query('SELECT * FROM local_mail WHERE invitation_id=$1',[id])).rows[0];assert(row);return (decryptLocalMail(row.encrypted_payload,row.company_id,row.id) as {token:string}).token;}
  const accept=(value:string,company=slug)=>acceptInvitation(pool,{company,token:value,name:'Persona invitada',password});

  test('invitation snapshots normalized email and locations, exposes no token and creates no account yet',async()=>{
    const email=`TEST-${randomUUID()}@EXAMPLE.TEST`;const i=await invite({email,locationIds:[branch,branch]});assert.equal(i.email,email.toLowerCase());assert.deepEqual(i.location_ids,[branch]);
    assert(!('token_hash' in i)&&!('token' in i));assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1',[i.email])).rowCount,0);
    const list=await listInvitations(pool,owner);assert(list.items.every(r=>!('token_hash' in r)));
    const mail=(await pool.query('SELECT encrypted_payload FROM local_mail WHERE invitation_id=$1',[i.id])).rows[0];assert(!mail.encrypted_payload.includes(await token(i.id)));
  });
  test('concurrent idempotent issuance makes one invitation and one local message',async()=>{
    const key=randomUUID(),raw=input();const results=await Promise.all([createInvitation(pool,owner,key,raw),createInvitation(pool,owner,key,raw)]);
    assert.equal(results[0].id,results[1].id);assert.equal(results.filter(r=>r.replayed).length,1);
    assert.equal((await pool.query('SELECT 1 FROM local_mail WHERE invitation_id=$1',[results[0].id])).rowCount,1);
    await reject(()=>createInvitation(pool,owner,key,{...raw,role:'OWNER',locationIds:[]}),'IDEMPOTENCY_CONFLICT');
  });
  test('concurrent acceptance creates a single account with fixed permissions',async()=>{
    const i=await invite();const value=await token(i.id);const results=await Promise.allSettled([accept(value),accept(value)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const u=(await pool.query('SELECT * FROM users WHERE company_id=$1 AND email=$2',[owner.company_id,i.email])).rows[0];assert.equal(u.role,'AGENT');assert(u.email_verified_at);assert.equal(u.email_verification_required,true);
    const locations=(await pool.query('SELECT location_id FROM agent_locations WHERE user_id=$1',[u.id])).rows;assert.deepEqual(locations,[{location_id:branch}]);
    assert((await login(pool,{company:slug,email:i.email,password})).token);
    await reject(()=>accept(value),'INVITATION_INVALID');
    const cli=spawnSync(process.execPath,['--import','tsx','scripts/local-mail.ts',owner.company_id],{encoding:'utf8',env:process.env});assert.equal(cli.status,0);assert(!cli.stdout.includes(i.id));
    assert.equal((await pool.query('SELECT 1 FROM available_local_mail WHERE invitation_id=$1',[i.id])).rowCount,0);
  });
  test('acceptance rejects role, locations and email supplied by recipient',async()=>{
    const i=await invite();const value=await token(i.id);
    for(const extra of [{role:'OWNER'},{locationIds:[north]},{email:'different@example.test'}])await assert.rejects(()=>acceptInvitation(pool,{company:slug,token:value,name:'Intento',password,...extra}));
    await accept(value);assert.equal((await pool.query('SELECT role FROM users WHERE email=$1',[i.email])).rows[0].role,'AGENT');
  });
  test('explicit OWNER invitation grants administration without location assignments',async()=>{
    const i=await invite({role:'OWNER',locationIds:[]});await accept(await token(i.id));
    const session=await login(pool,{company:slug,email:i.email,password});assert.equal(session.user.role,'OWNER');
    await assert.rejects(()=>invite({role:'OWNER',locationIds:[branch]}));
  });
  test('revocation prevents acceptance and permits issuing a different invitation',async()=>{
    const i=await invite();const value=await token(i.id);
    await revokeInvitation(pool,owner,i.id,{reason:'Invitación retirada'});assert.equal((await revokeInvitation(pool,owner,i.id,{reason:'Reintento'})).replayed,true);
    await reject(()=>accept(value),'INVITATION_INVALID');const next=await invite({email:i.email,locationIds:[north]});assert.notEqual(next.id,i.id);
    await accept(await token(next.id));
  });
  test('expired invitation cannot be accepted and list reflects expiration',async()=>{
    const i=await invite();const value=await token(i.id);
    await transaction(pool,async db=>{await db.query('ALTER TABLE staff_invitations DISABLE TRIGGER invitation_transitions');
      await db.query("UPDATE staff_invitations SET created_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[i.id]);await db.query('ALTER TABLE staff_invitations ENABLE TRIGGER invitation_transitions');});
    await reject(()=>accept(value),'INVITATION_INVALID');assert.equal((await listInvitations(pool,owner)).items.find(r=>r.id===i.id)!.status,'EXPIRED');
    const next=await invite({email:i.email});assert.equal(next.status,'PENDING');
  });
  test('tenant isolation and staff/customer restrictions cover create, list and revoke',async()=>{
    const i=await invite();await reject(async()=>accept(await token(i.id),otherSlug),'INVITATION_INVALID');
    await reject(()=>listInvitations(pool,agent),'FORBIDDEN');await reject(()=>createInvitation(pool,customer,randomUUID(),input()),'FORBIDDEN');
    await reject(()=>revokeInvitation(pool,other,i.id,{reason:'Empresa ajena'}),'INVITATION_NOT_FOUND');
    assert(!(await listInvitations(pool,other)).items.some(r=>r.id===i.id));
    const foreign=(await createLocation(pool,other,{name:'Otra sucursal',kind:'STORE'})).id;
    await reject(()=>invite({locationIds:[foreign]}),'INVALID_ASSIGNMENT');
  });
  test('disabled location blocks acceptance atomically; fresh invitation needed if desired',async()=>{
    const i=await invite({locationIds:[north]});const value=await token(i.id);await patchLocation(pool,owner,north,{active:false});
    await reject(()=>accept(value),'INVITATION_LOCATIONS_CHANGED');assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1',[i.email])).rowCount,0);
    assert.equal((await pool.query('SELECT status FROM staff_invitations WHERE id=$1',[i.id])).rows[0].status,'PENDING');await patchLocation(pool,owner,north,{active:true});
  });
  test('existing customer or staff account is never replaced by invitation',async()=>{
    await reject(()=>invite({email:'customer@example.test'}),'ACCOUNT_EXISTS');await reject(()=>invite({email:'agent@example.test'}),'ACCOUNT_EXISTS');
    const i=await invite();const u=await createUser(pool,owner,{name:'Cuenta existente',email:i.email,password,role:'CUSTOMER'});
    const before=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[u.id])).rows[0];await reject(async()=>accept(await token(i.id)),'ACCOUNT_EXISTS');
    assert.deepEqual((await pool.query('SELECT password_hash FROM users WHERE id=$1',[u.id])).rows[0],before);
  });
  test('pending staff invitation prevents public customer registration for reserved email',async()=>{
    const i=await invite();const response=await registerCustomer(pool,{company:slug,email:i.email,name:'Registro público',password});assert.equal(response.accepted,true);
    assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1',[i.email])).rowCount,0);await accept(await token(i.id));
  });
  test('losing inviter authority permanently revokes pending invitations',async()=>{
    const u=await createUser(pool,owner,{name:'Responsable',email:`${randomUUID()}@example.test`,password,role:'AGENT'});
    await patchUser(pool,owner,u.id,{role:'OWNER',reason:'Administrar empresa'});const inviter={id:u.id,company_id:owner.company_id,name:u.name,role:'OWNER' as const};
    const i=await createInvitation(pool,inviter,randomUUID(),input());const value=await token(i.id);
    await patchUser(pool,owner,u.id,{role:'AGENT',reason:'Dejar administración'});await patchUser(pool,owner,u.id,{role:'OWNER',reason:'Volver administración'});
    await reject(()=>accept(value),'INVITATION_INVALID');assert.equal((await pool.query('SELECT status FROM staff_invitations WHERE id=$1',[i.id])).rows[0].status,'REVOKED');
  });
  test('database prevents permission snapshot edits and outbox failure rolls back issuance',async()=>{
    const i=await invite();await assert.rejects(()=>pool.query("UPDATE staff_invitations SET role='OWNER',location_ids='{}' WHERE id=$1",[i.id]));
    await assert.rejects(()=>pool.query('DELETE FROM staff_invitations WHERE id=$1',[i.id]));
    await pool.query(`CREATE FUNCTION fail_invite_mail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test failure'; END; $$`);
    await pool.query('CREATE TRIGGER fail_invite_mail BEFORE INSERT ON local_mail FOR EACH ROW EXECUTE FUNCTION fail_invite_mail()');const raw=input();
    try{await assert.rejects(()=>createInvitation(pool,owner,randomUUID(),raw));}
    finally{await pool.query('DROP TRIGGER fail_invite_mail ON local_mail');await pool.query('DROP FUNCTION fail_invite_mail()');}
    assert.equal((await pool.query('SELECT 1 FROM staff_invitations WHERE email=$1',[raw.email])).rowCount,0);
  });
  test('HTTP issuance requires owner, acceptance uses token and local mode is blocked in production',async()=>{
    const session=await login(pool,{company:slug,email:'owner@example.test',password});const raw=input();
    const headers={'content-type':'application/json',origin:'http://localhost:3000',cookie:`nexo_session=${session.token}`,'idempotency-key':randomUUID()};
    const response=await POST(new Request('http://localhost:3000/api/invitations',{method:'POST',headers,body:JSON.stringify(raw)}),{params:Promise.resolve({path:['invitations']})});assert.equal(response.status,201);const i=await response.json();assert(!('token' in i));
    const listed=await GET(new Request('http://localhost:3000/api/invitations',{headers}),{params:Promise.resolve({path:['invitations']})});assert.equal(listed.status,200);
    const value=await token(i.id);const accepted=await POST(new Request('http://localhost:3000/api/auth/accept-invitation',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3000'},body:JSON.stringify({company:slug,token:value,name:'HTTP',password})}),{params:Promise.resolve({path:['auth','accept-invitation']})});assert.equal(accepted.status,200);assert(!accepted.headers.has('set-cookie'));
    Object.assign(process.env,{NODE_ENV:'production'});try{await reject(()=>accept(value),'MAIL_UNAVAILABLE');await reject(()=>createInvitation(pool,owner,randomUUID(),input()),'MAIL_UNAVAILABLE');}finally{Object.assign(process.env,{NODE_ENV:'test'});}
  });
  test('issuance rate limit counts failed requests and acceptance races revocation safely',async()=>{
    const i=await invite();const value=await token(i.id);
    const results=await Promise.allSettled([accept(value),revokeInvitation(pool,owner,i.id,{reason:'Retirar invitación'})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const state=(await pool.query('SELECT status FROM staff_invitations WHERE id=$1',[i.id])).rows[0].status;
    assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1',[i.email])).rowCount,state==='ACCEPTED'?1:0);
    for(let n=0;n<19;n++)await reject(()=>createInvitation(pool,owner,randomUUID(),input({email:'customer@example.test'})),'ACCOUNT_EXISTS');
    await reject(()=>invite(),'ACCOUNT_RATE_LIMIT');
  });
});
