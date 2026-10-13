import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {link,unlink,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Pool} from 'pg';

function connection(raw:string){
  const url=new URL(raw);if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Invalid connection');
  for(const key of url.searchParams.keys())if(!['sslmode','options'].includes(key))throw new Error('Unsupported connection option');
  const sslmode=url.searchParams.get('sslmode')??'prefer';
  if(!['disable','allow','prefer','require','verify-ca','verify-full'].includes(sslmode))throw new Error('Invalid TLS mode');
  // Both preflight and libpq tools must address the same database, without role/search-path overrides.
  url.searchParams.delete('options');
  const database=decodeURIComponent(url.pathname.slice(1));if(!/^[a-zA-Z0-9_]+$/.test(database))throw new Error('Invalid database name');
  const inherited=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')));
  const env={...inherited,NODE_ENV:process.env.NODE_ENV,PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:sslmode,PGCONNECT_TIMEOUT:'5',
    PGOPTIONS:'',PGDATABASE:database,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username)};
  return {url,database,env};
}
function run(command:'pg_dump'|'pg_restore',args:string[],env:NodeJS.ProcessEnv,bin?:string){
  const executable=bin?join(bin,command+(process.platform==='win32'?'.exe':'')):command;
  return new Promise<void>((accept,reject)=>{
    const child=spawn(executable,args,{env,stdio:['ignore','ignore','ignore'],windowsHide:true});
    child.once('error',()=>reject(new Error('PostgreSQL tool unavailable')));
    child.once('close',code=>code===0?accept():reject(new Error('PostgreSQL backup operation failed')));
  });
}
export async function backupDatabase(raw:string,schema:string,file:string,bin?:string){
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema))throw new Error('Invalid schema');
  const config=connection(raw),target=resolve(file),temporary=`${target}.${randomUUID()}.tmp`;
  const handle=await open(temporary,'wx',0o600);await handle.close();
  try{
    await run('pg_dump',['--format=custom','--no-owner','--no-acl',`--schema=${schema}`,`--file=${temporary}`],config.env,bin);
    await link(temporary,target); // Never overwrite an existing backup.
    return {format:'postgresql-custom',schema};
  }finally{await unlink(temporary);}
}
export async function restoreTestDatabase(raw:string,file:string,bin?:string){
  const config=connection(raw);
  if(!/^[a-z][a-z0-9_]*_restore_test$/.test(config.database))throw new Error('Only a dedicated restore_test target is supported');
  const pool=new Pool({connectionString:config.url.toString(),connectionTimeoutMillis:5000,statement_timeout:5000});
  try{
    // Reject any user object, including views and functions, before invoking restore.
    const occupied=await pool.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema'
      UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema' LIMIT 1`);
    if(occupied.rowCount)throw new Error('Restore target must be empty');
    await run('pg_restore',['--single-transaction','--exit-on-error','--no-owner','--no-acl',`--dbname=${config.database}`,resolve(file)],config.env,bin);
    return {restored:true};
  }finally{await pool.end();}
}
