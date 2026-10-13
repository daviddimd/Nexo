import type {Pool} from 'pg';
import {z} from 'zod';
import {createCompanyRecords,hashPassword} from './auth';
import {transaction} from './db';
import {ensure} from './errors';
const schema=z.object({name:z.string().trim().min(1).max(200),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),email:z.email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(12).max(128)}).strict();
function enabled(){return process.env.NODE_ENV!=='production'&&process.env.NEXO_LOCAL_SETUP_ENABLED==='true';}
export async function initialSetupStatus(pool:Pool){return {available:enabled()&&(await pool.query('SELECT 1 FROM companies LIMIT 1')).rowCount===0};}
export async function initialSetup(pool:Pool,raw:unknown){
  ensure(enabled(),403,'SETUP_DISABLED','La configuración inicial no está habilitada');
  const input=schema.parse(raw),hashed=await hashPassword(input.password);
  return transaction(pool,async db=>{await db.query('LOCK TABLE companies IN SHARE ROW EXCLUSIVE MODE');
    ensure((await db.query('SELECT 1 FROM companies LIMIT 1')).rowCount===0,409,'SETUP_COMPLETE','La instalación ya tiene una empresa configurada');
    await createCompanyRecords(db,input,hashed);return {created:true,company:input.slug};});
}
