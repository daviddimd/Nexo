import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {Pool} from 'pg';
import {spawnSync} from 'node:child_process';
import {inspectDatabase} from '../src/server/deployment';
import {migrate} from '../scripts/migrate';
import {applyDatabasePermissions} from '../scripts/database-permissions';
import {createCompany,login,type Actor} from '../src/server/auth';
import {createLocation,createProduct,createUser} from '../src/server/manage';
import {applyOperation} from '../src/server/inventory';
import {createOnlineOrder,cancelOrder} from '../src/server/orders';
import {recordCommercial,type CommercialInput} from '../src/server/commercial';
import {signLicense} from '../src/server/licenses';
import {importLicense,licenseSummary} from '../src/server/license-store';

describe('Separate database privileges',{skip:!process.env.TEST_DATABASE_URL,concurrency:false},()=>{
  const suffix=randomUUID().replaceAll('-',''),schema=`nexo_acl_${suffix}`,runtimeRole=`nexo_web_${suffix}`,operatorRole=`nexo_op_${suffix}`;
  let admin:Pool,ownerPool:Pool,web:Pool,operator:Pool;
  const password='Permissions-password-123!';
  const profile={schema,runtimeRole,operatorRole};
  before(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);admin=new Pool({connectionString:url.toString()});
    await admin.query(`CREATE SCHEMA "${schema}"`);await admin.query(`CREATE ROLE "${runtimeRole}" NOLOGIN`);await admin.query(`CREATE ROLE "${operatorRole}" NOLOGIN`);
    url.searchParams.set('options',`-c search_path=${schema}`);ownerPool=new Pool({connectionString:url.toString()});await migrate(ownerPool);
    await applyDatabasePermissions(ownerPool,profile);await applyDatabasePermissions(ownerPool,profile);
    url.searchParams.set('options',`-c search_path=${schema} -c role=${runtimeRole}`);web=new Pool({connectionString:url.toString()});
    url.searchParams.set('options',`-c search_path=${schema} -c role=${operatorRole}`);operator=new Pool({connectionString:url.toString()});
  });
  after(async()=>{
    for(const pool of [web,operator,ownerPool])if(pool)await pool.end();
    if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);await admin.query(`DROP ROLE IF EXISTS "${operatorRole}"`);await admin.end();}
  });
  const denied=(pool:Pool,sql:string)=>assert.rejects(()=>pool.query(sql),(e:{code:string})=>e.code==='42501');
  async function company(){const slug=`acl-${randomUUID().slice(0,8)}`;const c=await createCompany(operator,{slug,name:'Pyme',email:'owner@example.test',password});
    return {...c,slug,actor:{id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER' as const}};}
  test('runtime cannot mutate commercial/licenses/schema or disable ledger triggers',async()=>{
    for(const table of ['commercial_revisions','license_imports','installation_identity','schema_migrations']){
      await denied(web,`DELETE FROM ${table}`);await denied(web,`INSERT INTO ${table} DEFAULT VALUES`);
    }
    await denied(web,'INSERT INTO companies DEFAULT VALUES');await denied(web,'CREATE TABLE rogue(id integer)');
    await denied(web,'ALTER TABLE stock_movements DISABLE TRIGGER ALL');await denied(web,'DELETE FROM stock_movements');
    await denied(web,'TRUNCATE stock');await denied(web,'SELECT * FROM schema_migrations');
  });
  test('runtime login, catalog, stock ledger and reservation/cancellation still work',async()=>{
    const c=await company();assert.ok((await login(web,{company:c.slug,email:'owner@example.test',password})).token);
    const branch=await createLocation(web,c.actor,{name:'Centro',kind:'STORE'}),product=await createProduct(web,c.actor,{sku:'SSD',name:'SSD',priceMinor:1000});
    await applyOperation(web,c.actor,randomUUID(),{kind:'RECEIPT',productId:product.id,locationId:branch.id,quantity:3,reason:'Carga inicial'});
    const buyer=await createUser(web,c.actor,{name:'Buyer',email:'buyer@example.test',password,role:'CUSTOMER'});
    const customer:Actor={id:buyer.id,company_id:c.companyId,name:buyer.name,role:'CUSTOMER'};
    const order=await createOnlineOrder(web,customer,randomUUID(),{fulfillment:'PICKUP',locationId:branch.id,items:[{productId:product.id,quantity:1}]});
    assert.equal(order.status,'RESERVED');await cancelOrder(web,customer,order.id,{reason:'Cancelación de prueba'});
    await applyOperation(web,c.actor,randomUUID(),{kind:'SALE',productId:product.id,locationId:branch.id,quantity:1,reason:'Venta local'});
    assert.deepEqual((await web.query('SELECT on_hand,reserved FROM stock WHERE product_id=$1',[product.id])).rows[0],{on_hand:2,reserved:0});
  });
  test('operator can record commercial terms and licenses; runtime can read them',async()=>{
    const c=await company();const t:CommercialInput={mode:'PERPETUAL',status:'ENABLED',effectiveAt:'2026-01-01T00:00:00Z',startsAt:'2026-01-01T00:00:00Z',accessUntil:null,
      updatesUntil:'2027-01-01T00:00:00Z',supportUntil:'2027-01-01T00:00:00Z',operator:'Test operator',reference:'Agreement',reason:'Initial terms',expectedRevision:0};
    await recordCommercial(operator,c.companyId,randomUUID(),t);
    const keys=generateKeyPairSync('ed25519'),privatePem=keys.privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicPem=keys.publicKey.export({type:'spki',format:'pem'}).toString();
    const context={installationId:randomUUID(),trustedKeys:{test:publicPem}};
    const token=signLicense({format:'nexo-license-v1',licenseId:randomUUID(),companyId:c.companyId,installationId:context.installationId,revision:1,issuedAt:t.startsAt,
      effectiveAt:t.effectiveAt,startsAt:t.startsAt,accessUntil:t.accessUntil,updatesUntil:t.updatesUntil,supportUntil:t.supportUntil,mode:t.mode,status:t.status},'test',privatePem);
    await importLicense(operator,c.companyId,token,context);assert.equal((await licenseSummary(web,c.actor,context)).state,'ACTIVE');
    await denied(operator,'INSERT INTO stock_movements DEFAULT VALUES');await denied(operator,'DELETE FROM sessions');await denied(operator,'CREATE TABLE rogue(id integer)');
  });
  test('profile refuses unsafe identifiers, shared roles and foreign schema contents atomically',async()=>{
    await assert.rejects(()=>applyDatabasePermissions(ownerPool,{...profile,runtimeRole:'bad;sql'}));
    await assert.rejects(()=>applyDatabasePermissions(ownerPool,{...profile,operatorRole:runtimeRole}));
    await ownerPool.query('CREATE TABLE unrelated(id integer)');
    await assert.rejects(()=>applyDatabasePermissions(ownerPool,profile));await ownerPool.query('DROP TABLE unrelated');
    assert.equal((await web.query('SELECT 1 FROM companies LIMIT 1')).rowCount,1);
    await admin.query(`GRANT "${runtimeRole}" TO "${operatorRole}"`);
    try{await assert.rejects(()=>applyDatabasePermissions(ownerPool,profile));}
    finally{await admin.query(`REVOKE "${runtimeRole}" FROM "${operatorRole}"`);}
  });
  test('administrative CLIs never fall back to the web connection',()=>{
    const env={...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,NEXO_MIGRATION_DATABASE_URL:'',NEXO_OPERATOR_DATABASE_URL:''};
    for(const script of ['scripts/migrate.ts','scripts/create-company.ts','scripts/database-permissions.ts']){
      const result=spawnSync(process.execPath,['--import','tsx',script],{env,encoding:'utf8'});
      assert.equal(result.status,1);assert.ok(!result.stderr.includes('postgresql://'));
    }
  });
  test('doctor checks actual restricted roles and detects owner used as runtime',async()=>{
    assert.deepEqual((await inspectDatabase(web,'runtime',schema)).issues,[]);
    assert.deepEqual((await inspectDatabase(operator,'operator',schema)).issues,[]);
    assert.deepEqual((await inspectDatabase(ownerPool,'migration',schema)).issues,[]);
    assert.ok((await inspectDatabase(ownerPool,'runtime',schema)).issues.includes('EXCESSIVE_DATABASE_AUTHORITY'));
  });
});
