import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {transaction} from '../src/server/db';
import {pathToFileURL} from 'node:url';
export async function migrate(pool:Pool) {
  await transaction(pool,async db=>{
    await db.query("SELECT pg_advisory_xact_lock(713491281)");
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for(const name of (await readdir(resolve('db'))).filter(v=>/^\d+.*\.sql$/.test(v)).sort()) {
      const sql=await readFile(resolve('db',name),'utf8');const checksum=createHash('sha256').update(sql).digest('hex');
      const previous=await db.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
      if(previous.rows[0]){if(previous.rows[0].checksum!==checksum)throw new Error(`Migration changed: ${name}`);continue;}
      await db.query(sql);await db.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
    }
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  let pool:Pool|undefined;
  try{const connectionString=process.env.NEXO_MIGRATION_DATABASE_URL;if(!connectionString)throw new Error('Migration connection required');
    const {Pool}=await import('pg');pool=new Pool({connectionString,connectionTimeoutMillis:5000,statement_timeout:15000});await migrate(pool);console.log('Migraciones aplicadas.');
  }catch{console.error('No se pudieron aplicar las migraciones. Revisa NEXO_MIGRATION_DATABASE_URL y permisos de propietario.');process.exitCode=1;}finally{if(pool)await pool.end();}
}
