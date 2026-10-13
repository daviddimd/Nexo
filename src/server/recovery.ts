import {randomBytes,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {digest,hashPassword} from './auth';
import {transaction} from './db';
import {ensure} from './errors';
import {lockCompany} from './order-store';
import {assertLocalMail,encryptLocalMail} from './local-mail';
import {accountRate} from './account-rate';

const company=z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/);
const email=z.email().max(254).transform(v=>v.toLowerCase());
const mailboxSchema=z.object({company,email}).strict();
const password=z.string().min(12).max(128);
const tokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const generic={accepted:true,message:'Si corresponde a una cuenta habilitada, habrá instrucciones de correo disponibles.'};
type Account={id:string;company_id:string;email:string;name:string;role:'OWNER'|'AGENT'|'CUSTOMER';active:boolean;
  password_hash:string;email_verification_required:boolean;email_verified_at:Date|null};
type Purpose='VERIFY_EMAIL'|'RESET_PASSWORD';
async function publicAccountEvent(db:PoolClient,account:Account,action:string,details:unknown){
  await db.query(`INSERT INTO administrative_events(id,company_id,actor_id,action,entity_id,details)
    VALUES($1,$2,NULL,$3,$4,$5)`,[randomUUID(),account.company_id,action,account.id,JSON.stringify(details)]);
}

async function limits(pool:Pool,slug:string,identity:string,action:string){
  await accountRate(pool,`PUBLIC_COMPANY:${action}`,slug,500);
  await accountRate(pool,`PUBLIC_MAILBOX:${action}`,JSON.stringify([slug,identity]));
}
async function companyBySlug(db:PoolClient,slug:string){
  const {rows}=await db.query<{id:string}>('SELECT id FROM companies WHERE slug=$1',[slug]);return rows[0];
}
async function issue(db:PoolClient,account:Account,purpose:Purpose){
  await db.query(`UPDATE account_tokens SET invalidated_at=clock_timestamp() WHERE company_id=$1 AND user_id=$2
    AND purpose=$3 AND consumed_at IS NULL AND invalidated_at IS NULL`,[account.company_id,account.id,purpose]);
  const token=randomBytes(32).toString('base64url'),id=randomUUID(),messageId=randomUUID();
  const {rows}=await db.query<{expires_at:Date}>(`INSERT INTO account_tokens(id,company_id,user_id,purpose,token_hash,email,credential_hash,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+$8::interval) RETURNING expires_at`,
    [id,account.company_id,account.id,purpose,digest(token),account.email,digest(account.password_hash),purpose==='VERIFY_EMAIL'?'24 hours':'20 minutes']);
  const company=(await db.query<{slug:string}>('SELECT slug FROM companies WHERE id=$1',[account.company_id])).rows[0].slug;
  const payload={purpose,recipient:account.email,company,companyId:account.company_id,token,expiresAt:rows[0].expires_at,
    method:'POST',endpoint:purpose==='VERIFY_EMAIL'?'/api/auth/verify-email':'/api/auth/reset-password'};
  await db.query(`INSERT INTO local_mail(id,company_id,token_id,recipient,purpose,encrypted_payload,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[messageId,account.company_id,id,account.email,purpose,encryptLocalMail(payload,account.company_id,messageId),rows[0].expires_at]);
  await publicAccountEvent(db,account,'ACCOUNT_TOKEN_ISSUED',{purpose,delivery:'LOCAL_ONLY'});
}
export async function registerCustomer(pool:Pool,raw:unknown){
  const input=mailboxSchema.extend({name:z.string().trim().min(1).max(200),password}).strict().parse(raw);
  assertLocalMail();await limits(pool,input.company,input.email,'REGISTER');
  const hashed=await hashPassword(input.password);
  return transaction(pool,async db=>{
    const c=await companyBySlug(db,input.company);if(!c)return generic;
    await lockCompany(db,c.id);
    const existing=await db.query('SELECT 1 FROM users WHERE company_id=$1 AND email=$2',[c.id,input.email]);
    if(existing.rowCount)return generic;
    const invitation=await db.query("SELECT 1 FROM staff_invitations WHERE company_id=$1 AND email=$2 AND status='PENDING' AND expires_at>clock_timestamp()",[c.id,input.email]);
    if(invitation.rowCount)return generic;
    const {rows}=await db.query<Account>(`INSERT INTO users(id,company_id,email,name,password_hash,role,email_verification_required)
      VALUES($1,$2,$3,$4,$5,'CUSTOMER',true) RETURNING *`,[randomUUID(),c.id,input.email,input.name,hashed]);
    await publicAccountEvent(db,rows[0],'CUSTOMER_REGISTERED',{verificationRequired:true});
    await issue(db,rows[0],'VERIFY_EMAIL');return generic;
  });
}
export async function requestAccountMail(pool:Pool,purpose:Purpose,raw:unknown){
  const input=mailboxSchema.parse(raw);assertLocalMail();await limits(pool,input.company,input.email,purpose);
  return transaction(pool,async db=>{
    const c=await companyBySlug(db,input.company);if(!c)return generic;await lockCompany(db,c.id);
    const {rows}=await db.query<Account>('SELECT * FROM users WHERE company_id=$1 AND email=$2 AND active',[c.id,input.email]);
    const user=rows[0];if(!user)return generic;
    if(purpose==='VERIFY_EMAIL'&&(!user.email_verification_required||user.email_verified_at))return generic;
    if(purpose==='RESET_PASSWORD'&&user.email_verification_required&&!user.email_verified_at)return generic;
    await issue(db,user,purpose);return generic;
  });
}
export async function consumeAccountToken(pool:Pool,purpose:Purpose,raw:unknown){
  const input=z.object({company,token:tokenSchema,newPassword:password.optional()}).strict().parse(raw);
  ensure(purpose==='RESET_PASSWORD'?!!input.newPassword:input.newPassword===undefined,400,'INVALID_TOKEN_REQUEST','Datos incompatibles con la operación');
  assertLocalMail();await limits(pool,input.company,digest(input.token),`CONSUME:${purpose}`);
  const hashed=input.newPassword?await hashPassword(input.newPassword):null;
  return transaction(pool,async db=>{
    const c=await companyBySlug(db,input.company);ensure(c,400,'TOKEN_INVALID','Token inválido o vencido');await lockCompany(db,c.id);
    const lookup=await db.query<Account&{token_id:string;credential_hash:string}>(`SELECT u.*,t.id AS token_id,t.credential_hash FROM account_tokens t JOIN users u ON u.company_id=t.company_id AND u.id=t.user_id
        WHERE t.company_id=$1 AND t.token_hash=$2 AND t.purpose=$3 AND t.consumed_at IS NULL AND t.invalidated_at IS NULL
        AND t.expires_at>clock_timestamp() AND t.email=u.email`,[c.id,digest(input.token),purpose]);
    const user=lookup.rows[0];ensure(user&&user.credential_hash===digest(user.password_hash),400,'TOKEN_INVALID','Token inválido o vencido');
    ensure(user.active,400,'TOKEN_INVALID','Token inválido o vencido');
    if(purpose==='VERIFY_EMAIL')ensure(user.email_verification_required&&!user.email_verified_at,400,'TOKEN_INVALID','Token inválido o vencido');
    else ensure(!user.email_verification_required||user.email_verified_at,400,'TOKEN_INVALID','Token inválido o vencido');
    await db.query('UPDATE account_tokens SET consumed_at=clock_timestamp() WHERE id=$1',[user.token_id]);
    if(purpose==='VERIFY_EMAIL')await db.query('UPDATE users SET email_verified_at=clock_timestamp() WHERE company_id=$1 AND id=$2',[c.id,user.id]);
    else await db.query('UPDATE users SET password_hash=$3 WHERE company_id=$1 AND id=$2',[c.id,user.id,hashed]);
    await publicAccountEvent(db,user,purpose==='VERIFY_EMAIL'?'EMAIL_VERIFIED':'PASSWORD_RECOVERED',{});
    return {ok:true,signInRequired:true};
  });
}
