import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import { transaction } from './db';
import { ensure } from './errors';
const derive = promisify(scrypt);
export type Actor = {id: string; company_id: string; role: 'OWNER'|'AGENT'|'CUSTOMER'; name: string};
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${((await derive(password, salt, 64)) as Buffer).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hash] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const actual = await derive(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// Same expensive operation for a missing account to reduce account enumeration by timing.
const dummyHash = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
export async function login(pool: Pool, input: {company: string; email: string; password: string}) {
  const count = await pool.query(`INSERT INTO login_attempts(company_slug,email,attempts,window_started_at) VALUES($1,$2,1,now())
    ON CONFLICT(company_slug,email) DO UPDATE SET
    attempts=CASE WHEN login_attempts.window_started_at < now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
    window_started_at=CASE WHEN login_attempts.window_started_at < now()-interval '15 minutes' THEN now() ELSE login_attempts.window_started_at END RETURNING attempts`, [input.company,input.email]);
  ensure(count.rows[0].attempts <= 10, 429, 'LOGIN_LIMIT', 'Demasiados intentos. Espera 15 minutos.');
  const {rows} = await pool.query(`SELECT u.* FROM users u JOIN companies c ON c.id=u.company_id WHERE c.slug=$1 AND u.email=$2 AND u.active`, [input.company,input.email]);
  const user = rows[0];
  const valid = await verifyPassword(input.password, user?.password_hash ?? dummyHash);
  ensure(user && valid && (!user.email_verification_required||user.email_verified_at), 401, 'INVALID_CREDENTIALS', 'Credenciales incorrectas o cuenta no habilitada');
  const token = randomBytes(32).toString('base64url');
  await transaction(pool, async db => {
    await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[user.company_id]);
    const fresh=await db.query('SELECT password_hash,role,active,email_verification_required,email_verified_at FROM users WHERE company_id=$1 AND id=$2',[user.company_id,user.id]);
    ensure(fresh.rows[0]?.active&&fresh.rows[0].password_hash===user.password_hash&&fresh.rows[0].role===user.role,
      401,'INVALID_CREDENTIALS','La cuenta cambió durante el acceso; vuelve a iniciar sesión');
    ensure(!fresh.rows[0].email_verification_required||fresh.rows[0].email_verified_at,401,'INVALID_CREDENTIALS','Cuenta no habilitada');
    await db.query('DELETE FROM login_attempts WHERE company_slug=$1 AND email=$2',[input.company,input.email]);
    await db.query(`INSERT INTO sessions(token_hash,company_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')`, [digest(token),user.company_id,user.id]);
  });
  return {token, user: {id:user.id, company_id:user.company_id, name:user.name, role:user.role}};
}
export async function authenticate(pool: Pool, token: string | undefined): Promise<Actor> {
  ensure(token && token.length <= 128, 401, 'UNAUTHENTICATED', 'Inicia sesión');
  const {rows} = await pool.query(`SELECT u.id,u.company_id,u.role,u.name FROM sessions s JOIN users u ON u.company_id=s.company_id AND u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND (NOT u.email_verification_required OR u.email_verified_at IS NOT NULL)`,[digest(token)]);
  ensure(rows[0],401,'UNAUTHENTICATED','Sesión inválida o vencida');
  return rows[0];
}
export function staff(actor: Actor) { ensure(actor.role==='OWNER'||actor.role==='AGENT',403,'FORBIDDEN','Requiere una cuenta de agente'); }
export function owner(actor: Actor) { ensure(actor.role==='OWNER',403,'FORBIDDEN','Requiere una cuenta administradora'); }
export async function locationAccess(db: PoolClient, actor: Actor, id: string) {
  staff(actor);
  const {rows} = await db.query(`SELECT id FROM locations WHERE company_id=$1 AND id=$2 AND active`,[actor.company_id,id]);
  ensure(rows[0],404,'LOCATION_NOT_FOUND','Ubicación inexistente o inactiva');
  if(actor.role!=='OWNER') {
    const permission=await db.query('SELECT 1 FROM agent_locations WHERE company_id=$1 AND user_id=$2 AND location_id=$3',[actor.company_id,actor.id,id]);
    ensure(permission.rowCount,403,'LOCATION_FORBIDDEN','No tienes permiso para esta ubicación');
  }
}
export async function createCompany(pool: Pool, input: {slug:string; name:string; email:string; password:string}) {
  const passwordHash = await hashPassword(input.password);
  return transaction(pool, db => createCompanyRecords(db,input,passwordHash));
}
export async function createCompanyRecords(db:PoolClient,input:{slug:string;name:string;email:string},passwordHash:string){
    const companyId=randomUUID(), userId=randomUUID();
    await db.query('INSERT INTO companies(id,slug,name) VALUES($1,$2,$3)',[companyId,input.slug,input.name]);
    await db.query(`INSERT INTO users(id,company_id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5,'OWNER')`,[userId,companyId,input.email.toLowerCase(),'Administrador',passwordHash]);
    return {companyId,userId};
}
