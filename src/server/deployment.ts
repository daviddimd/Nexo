import type {Pool} from 'pg';

export function configurationIssues(env:NodeJS.ProcessEnv,maintenance=false){
  const issues:string[]=[];
  if(!env.DATABASE_URL)issues.push('DATABASE_URL_REQUIRED');
  try{const url=new URL(env.APP_ORIGIN??'');if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error();
    if(env.NODE_ENV==='production'&&url.protocol!=='https:')issues.push('HTTPS_ORIGIN_REQUIRED');
  }catch{issues.push('INVALID_APP_ORIGIN');}
  if(env.NODE_ENV==='production'){
    if(env.NEXO_LOCAL_CUSTOMER_ACCESS==='true')issues.push('LOCAL_CUSTOMER_ACCESS_FORBIDDEN');
    if(env.NEXO_SIMULATOR_ENABLED!=='false')issues.push('SIMULATOR_MUST_BE_DISABLED');
    if(env.NEXO_LOCAL_MAIL_ENABLED!=='false')issues.push('LOCAL_MAIL_MUST_BE_DISABLED');
    if(env.NEXO_LICENSE_PRIVATE_KEY_FILE)issues.push('PRIVATE_SIGNING_KEY_FORBIDDEN');
    if(!maintenance&&['NEXO_MIGRATION_DATABASE_URL','NEXO_OPERATOR_DATABASE_URL','SETUP_ADMIN_PASSWORD'].some(k=>env[k]))issues.push('ADMINISTRATIVE_SECRETS_IN_RUNTIME');
  }
  if(Boolean(env.NEXO_INSTALLATION_FILE)!==Boolean(env.NEXO_LICENSE_TRUSTED_KEYS_FILE))issues.push('INCOMPLETE_LICENSE_CONFIGURATION');
  return issues;
}
export async function inspectDatabase(pool:Pool,kind:'runtime'|'operator'|'migration',schema:string){
  const issues:string[]=[];
  const db=await pool.connect();
  try{
    await db.query('BEGIN READ ONLY');
    const identity=(await db.query(`SELECT current_user username,current_database() database,current_schema() schema,
      r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.oid,
      has_schema_privilege(current_user,$1,'CREATE') can_create,
      has_database_privilege(current_user,current_database(),'CREATE') can_create_schema
      FROM pg_roles r WHERE rolname=current_user`,[schema])).rows[0];
    if(identity.schema!==schema)issues.push('SEARCH_PATH_MISMATCH');
    const owner=(await db.query('SELECT pg_get_userbyid(nspowner) owner FROM pg_namespace WHERE nspname=$1',[schema])).rows[0]?.owner;
    if(kind==='migration'){
      if(owner!==identity.username)issues.push('MIGRATION_SCHEMA_OWNERSHIP_REQUIRED');
    }else{
      if(identity.rolsuper||identity.rolcreatedb||identity.rolcreaterole||identity.rolreplication||identity.rolbypassrls||identity.can_create||identity.can_create_schema||owner===identity.username)issues.push('EXCESSIVE_DATABASE_AUTHORITY');
      if((await db.query('SELECT 1 FROM pg_auth_members WHERE member=$1 OR roleid=$1',[identity.oid])).rowCount)issues.push('ROLE_MEMBERSHIPS_FORBIDDEN');
    }
    const q=(name:string)=>`"${schema.replaceAll('"','""')}"."${name}"`;
    for(const table of ['companies','stock','commercial_revisions','installation_identity','license_imports','schema_migrations']){
      const exists=(await db.query('SELECT to_regclass($1) object',[q(table)])).rows[0].object;
      if(!exists){issues.push(`MISSING_TABLE:${table}`);continue;}
      const rights=(await db.query(`SELECT has_table_privilege(current_user,$1,'SELECT') readable,
        has_table_privilege(current_user,$1,'INSERT') insertable,has_table_privilege(current_user,$1,'UPDATE') updatable,
        has_table_privilege(current_user,$1,'DELETE') deletable,has_table_privilege(current_user,$1,'TRUNCATE') truncatable`,[q(table)])).rows[0];
      const protectedTable=['commercial_revisions','installation_identity','license_imports','schema_migrations'].includes(table);
      if(kind==='runtime'&&protectedTable&&(rights.insertable||rights.updatable||rights.deletable||rights.truncatable))issues.push(`FORBIDDEN_WRITE:${table}`);
      if(kind==='runtime'&&table!=='schema_migrations'&&!rights.readable)issues.push(`MISSING_READ:${table}`);
      if(kind==='runtime'&&table==='stock'&&(!rights.insertable||!rights.updatable))issues.push('STOCK_WRITE_REQUIRED');
      if(kind==='operator'&&table==='stock'&&(rights.insertable||rights.updatable||rights.deletable))issues.push('OPERATOR_STOCK_WRITE_FORBIDDEN');
      if(kind==='operator'&&['companies','commercial_revisions','license_imports'].includes(table)&&!rights.insertable)issues.push(`OPERATOR_INSERT_REQUIRED:${table}`);
    }
    await db.query('COMMIT');
    return {kind,username:identity.username,database:identity.database,schema:identity.schema,issues};
  }catch{await db.query('ROLLBACK');throw new Error('Database inspection failed');}
  finally{db.release();}
}
