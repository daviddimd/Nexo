import type {Pool} from 'pg';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';
import {createCompanyRecords,hashPassword} from './auth';
import {transaction} from './db';
import {ensure} from './errors';
const schema=z.object({name:z.string().trim().min(1).max(200),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),email:z.email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(12).max(128)}).strict();
const resetSchema=z.object({action:z.literal('reset-demo-credentials'),recoveryKey:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(12).max(128)}).strict();
function enabled(){return process.env.NODE_ENV!=='production'&&process.env.NEXO_LOCAL_SETUP_ENABLED==='true';}
function demoResetEnabled(){return process.env.NODE_ENV==='development'&&process.env.NEXO_LOCAL_SETUP_ENABLED==='true'&&/^[a-f0-9]{64}$/.test(process.env.NEXO_LOCAL_CREDENTIAL_RESET_KEY??'');}
export async function initialSetupStatus(pool:Pool){
  const available=enabled()&&(await pool.query('SELECT 1 FROM companies LIMIT 1')).rowCount===0;
  const resetAvailable=demoResetEnabled()&&(await pool.query(`SELECT 1 FROM companies c JOIN users u ON u.company_id=c.id
    WHERE c.slug='prismabyte' AND u.email='admin@prismabyte.cl' AND u.role='OWNER' AND u.active LIMIT 1`)).rowCount===1;
  return {available,resetAvailable};
}
export async function initialSetup(pool:Pool,raw:unknown){
  if(typeof raw==='object'&&raw!==null&&'action' in raw&&(raw as {action?:unknown}).action==='reset-demo-credentials')return resetDemoCredentials(pool,raw);
  ensure(enabled(),403,'SETUP_DISABLED','La configuración inicial no está habilitada');
  const input=schema.parse(raw),hashed=await hashPassword(input.password);
  return transaction(pool,async db=>{await db.query('LOCK TABLE companies IN SHARE ROW EXCLUSIVE MODE');
    ensure((await db.query('SELECT 1 FROM companies LIMIT 1')).rowCount===0,409,'SETUP_COMPLETE','La instalación ya tiene una empresa configurada');
    await createCompanyRecords(db,input,hashed);return {created:true,company:input.slug};});
}
async function resetDemoCredentials(pool:Pool,raw:unknown){
  ensure(demoResetEnabled(),403,'DEMO_RESET_DISABLED','El restablecimiento solo está disponible en la demostración local.');
  const input=resetSchema.parse(raw),expected=Buffer.from(process.env.NEXO_LOCAL_CREDENTIAL_RESET_KEY!,'hex'),provided=Buffer.from(input.recoveryKey,'hex');
  ensure(expected.length===provided.length&&timingSafeEqual(expected,provided),403,'DEMO_RESET_KEY_INVALID','La llave de recuperación no es válida.');
  const passwordHash=await hashPassword(input.password);
  return transaction(pool,async db=>{
    await db.query('LOCK TABLE companies IN SHARE ROW EXCLUSIVE MODE');
    const {rows}=await db.query<{id:string;slug:string}>(`SELECT u.id,c.slug FROM companies c JOIN users u ON u.company_id=c.id
      WHERE c.slug='prismabyte' AND u.email='admin@prismabyte.cl' AND u.role='OWNER' AND u.active FOR UPDATE OF u`);
    ensure(rows.length===1,404,'DEMO_ADMIN_NOT_FOUND','No se encontró el administrador activo de PrismaByte.');
    await db.query('UPDATE users SET password_hash=$3 WHERE company_id=(SELECT id FROM companies WHERE slug=$1) AND id=$2',['prismabyte',rows[0].id,passwordHash]);
    return {reset:true,company:rows[0].slug,email:'admin@prismabyte.cl'};
  });
}

