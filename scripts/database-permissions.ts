import type {Pool} from 'pg';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {transaction} from '../src/server/db';

const tables=['customer_addresses','test_payment_cards','test_payment_choices','shipping_rates','customer_profiles','categories','companies','users','sessions','login_attempts','locations','agent_locations','products','stock','inventory_operations','stock_movements',
  'orders','order_items','order_events','shipping_quotes','shipping_quote_items','payment_intents','payment_captures','payment_events',
  'refunds','capture_resolutions','return_receipts','return_items','administrative_events','account_tokens','local_mail','account_rate_limits',
  'staff_invitations','commercial_revisions','installation_identity','license_imports','schema_migrations'];
const protectedTables=['commercial_revisions','installation_identity','license_imports','schema_migrations'];
const ledger=['test_payment_choices','inventory_operations','stock_movements','order_items','order_events','shipping_quote_items','payment_captures','payment_events',
  'refunds','capture_resolutions','return_receipts','return_items','administrative_events','local_mail'];
const identifier=(value:string)=>{if(!/^[a-z][a-z0-9_]{0,62}$/.test(value))throw new Error('Invalid SQL identifier');return `"${value}"`;};

// Existing dedicated roles only. Never creates logins or passwords.
export async function applyDatabasePermissions(pool:Pool,input:{schema:string;runtimeRole:string;operatorRole:string}){
  const s=identifier(input.schema),runtime=identifier(input.runtimeRole),operator=identifier(input.operatorRole);
  if(input.runtimeRole===input.operatorRole)throw new Error('Distinct roles required');
  return transaction(pool,async db=>{
    await db.query('SELECT pg_advisory_xact_lock(713491281)');
    const owner=(await db.query<{current_user:string}>('SELECT current_user')).rows[0].current_user;
    const schema=(await db.query('SELECT pg_get_userbyid(nspowner) owner FROM pg_namespace WHERE nspname=$1',[input.schema])).rows[0];
    if(schema?.owner!==owner||[input.runtimeRole,input.operatorRole].includes(owner))throw new Error('Schema owner connection required');
    const roles=(await db.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,oid FROM pg_roles WHERE rolname=ANY($1::text[])`,[[input.runtimeRole,input.operatorRole]])).rows;
    if(roles.length!==2||roles.some(r=>r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls))throw new Error('Unprivileged roles required');
    if((await db.query(`SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=ANY($1::oid[])`,[roles.map(r=>r.oid)])).rowCount)throw new Error('Runtime/operator cannot own database');
    for(const role of roles){
      if((await db.query('SELECT has_database_privilege($1,current_database(),\'CREATE\') allowed',[role.rolname])).rows[0].allowed)throw new Error('Runtime/operator cannot create schemas');
    }
    if((await db.query('SELECT 1 FROM pg_auth_members WHERE member=ANY($1::oid[]) OR roleid=ANY($1::oid[])',[roles.map(r=>r.oid)])).rowCount)throw new Error('Dedicated roles without memberships required');
    const objects=(await db.query(`SELECT c.relname,c.relkind,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','S','f')`,[input.schema])).rows;
    const expected=[...tables,'available_local_mail'].sort();
    if(JSON.stringify(objects.map(o=>o.relname).sort())!==JSON.stringify(expected)||objects.some(o=>o.owner!==owner))throw new Error('Exclusive fully migrated Nexo schema required');
    if((await db.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND (pg_get_userbyid(p.proowner)<>$2 OR p.prosecdef)`,[input.schema,owner])).rowCount)throw new Error('Unexpected function ownership or security definer');
    // Reset this schema's ACL only. Reapply after every migration.
    await db.query(`REVOKE ALL ON SCHEMA ${s} FROM PUBLIC,${runtime},${operator}`);
    await db.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM PUBLIC,${runtime},${operator}`);
    await db.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${s} FROM PUBLIC,${runtime},${operator}`);
    await db.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${s} FROM PUBLIC,${runtime},${operator}`);
    await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} REVOKE ALL ON TABLES FROM PUBLIC,${runtime},${operator}`);
    await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} REVOKE ALL ON SEQUENCES FROM PUBLIC,${runtime},${operator}`);
    await db.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} REVOKE ALL ON FUNCTIONS FROM PUBLIC,${runtime},${operator}`);
    await db.query(`GRANT USAGE ON SCHEMA ${s} TO ${runtime},${operator}`);
    const grant=async(privilege:string,names:string[],role:string)=>db.query(`GRANT ${privilege} ON ${names.map(n=>`${s}.${identifier(n)}`).join(',')} TO ${role}`);
    await grant('SELECT',tables.filter(t=>t!=='schema_migrations'),runtime);
    await grant('SELECT',['available_local_mail'],runtime);
    await grant('INSERT',tables.filter(t=>t!=='companies'&&!protectedTables.includes(t)),runtime);
    await grant('UPDATE,DELETE',tables.filter(t=>t!=='companies'&&!protectedTables.includes(t)&&!ledger.includes(t)),runtime);
    await grant('UPDATE',['companies'],runtime);
    await grant('SELECT',['categories','companies','users','commercial_revisions','installation_identity','license_imports'],operator);
    await grant('INSERT',['categories','companies','users','commercial_revisions','installation_identity','license_imports','administrative_events'],operator);
    // FOR UPDATE in shared company locks requires UPDATE privilege.
    await grant('UPDATE',['companies','categories'],operator);
    return {schema:input.schema,runtimeRole:input.runtimeRole,operatorRole:input.operatorRole};
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const {Pool}=await import('pg');let pool:Pool|undefined;
  try{
    const connectionString=process.env.NEXO_MIGRATION_DATABASE_URL;if(!connectionString)throw new Error('Migration connection required');
    pool=new Pool({connectionString,connectionTimeoutMillis:5000,statement_timeout:15000});
    console.log(JSON.stringify(await applyDatabasePermissions(pool,{schema:process.env.NEXO_DATABASE_SCHEMA??'public',runtimeRole:process.env.NEXO_RUNTIME_ROLE??'',operatorRole:process.env.NEXO_OPERATOR_ROLE??''})));
  }catch{console.error('No se pudieron aplicar los permisos. Revisa conexión de propietario, esquema y roles exclusivos.');process.exitCode=1;}
  finally{if(pool)await pool.end();}
}
