import {randomBytes,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {owner,digest,hashPassword,type Actor} from './auth';
import {stockTransaction} from './stock-transaction';
import {transaction} from './db';
import {lockCompany} from './order-store';
import {ensure} from './errors';
import {uuid} from './schemas';
import {audit} from './audit';
import {accountRate} from './account-rate';
import {assertLocalMail,encryptLocalMail} from './local-mail';

const inviteSchema=z.object({email:z.email().max(254).transform(v=>v.toLowerCase()),role:z.enum(['AGENT','OWNER']).default('AGENT'),
  locationIds:z.array(uuid).max(100).default([]),reason:z.string().trim().min(3).max(500)}).strict();
type Invitation={id:string;company_id:string;invited_by:string;email:string;role:'AGENT'|'OWNER';location_ids:string[];status:string;expires_at:Date;accepted_user_id:string|null;closed_at:Date|null;created_at:Date};
const columns='id,company_id,invited_by,email,role,location_ids,status,expires_at,accepted_user_id,closed_at,created_at';
async function expire(db:PoolClient,companyId:string){await db.query("UPDATE staff_invitations SET status='EXPIRED',closed_at=clock_timestamp() WHERE company_id=$1 AND status='PENDING' AND expires_at<=clock_timestamp()",[companyId]);}
async function invitation(db:PoolClient,companyId:string,id:string){
  const {rows}=await db.query<Invitation>(`SELECT ${columns} FROM staff_invitations WHERE company_id=$1 AND id=$2`,[companyId,id]);
  ensure(rows[0],404,'INVITATION_NOT_FOUND','Invitación inexistente');return rows[0];
}
export async function createInvitation(pool:Pool,actor:Actor,key:string,raw:unknown){
  owner(actor);assertLocalMail();const input=inviteSchema.parse(raw);input.locationIds=[...new Set(input.locationIds)].sort();
  ensure(input.role==='AGENT'||!input.locationIds.length,400,'INVALID_ASSIGNMENT','Un administrador no tiene asignaciones limitadas');
  ensure(/^[A-Za-z0-9_-]{8,128}$/.test(key),400,'INVALID_IDEMPOTENCY_KEY','Idempotency-Key inválida');
  await accountRate(pool,'INVITE_CREATE',`${actor.company_id}:${actor.id}`,20);
  const hash=digest(JSON.stringify({actor:actor.id,...input}));
  return stockTransaction(pool,actor,async db=>{
    await expire(db,actor.company_id);
    const old=await db.query('SELECT id,request_hash FROM staff_invitations WHERE company_id=$1 AND idempotency_key=$2',[actor.company_id,key]);
    if(old.rows[0]){ensure(old.rows[0].request_hash===hash,409,'IDEMPOTENCY_CONFLICT','Clave utilizada con otros datos');return {...await invitation(db,actor.company_id,old.rows[0].id),replayed:true};}
    const existing=await db.query('SELECT 1 FROM users WHERE company_id=$1 AND email=$2',[actor.company_id,input.email]);
    ensure(!existing.rowCount,409,'ACCOUNT_EXISTS','Ya existe una cuenta; administra esa cuenta sin invitación');
    const pending=await db.query("SELECT 1 FROM staff_invitations WHERE company_id=$1 AND email=$2 AND status='PENDING'",[actor.company_id,input.email]);
    ensure(!pending.rowCount,409,'INVITATION_PENDING','Revoca la invitación anterior antes de emitir otra');
    const valid=await db.query('SELECT id FROM locations WHERE company_id=$1 AND id=ANY($2::uuid[]) AND active',[actor.company_id,input.locationIds]);
    ensure(valid.rowCount===input.locationIds.length,400,'INVALID_ASSIGNMENT','Ubicaciones inválidas o inactivas');
    const id=randomUUID(),token=randomBytes(32).toString('base64url'),messageId=randomUUID();
    await db.query(`INSERT INTO staff_invitations(id,company_id,invited_by,email,role,location_ids,token_hash,expires_at,idempotency_key,request_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '7 days',$8,$9)`,[id,actor.company_id,actor.id,input.email,input.role,input.locationIds,digest(token),key,hash]);
    const result=await invitation(db,actor.company_id,id);
    const company=(await db.query<{slug:string}>('SELECT slug FROM companies WHERE id=$1',[actor.company_id])).rows[0].slug;
    const payload={purpose:'STAFF_INVITATION',recipient:input.email,company,companyId:actor.company_id,token,expiresAt:result.expires_at,method:'POST',endpoint:'/api/auth/accept-invitation'};
    await db.query(`INSERT INTO local_mail(id,company_id,invitation_id,recipient,purpose,encrypted_payload,expires_at)
      VALUES($1,$2,$3,$4,'STAFF_INVITATION',$5,$6)`,[messageId,actor.company_id,id,input.email,encryptLocalMail(payload,actor.company_id,messageId),result.expires_at]);
    await audit(db,actor,'INVITATION_CREATED',id,{email:input.email,role:input.role,locationIds:input.locationIds,reason:input.reason,delivery:'LOCAL_ONLY'});
    return {...result,replayed:false};
  });
}
export async function listInvitations(pool:Pool,actor:Actor,limit=50,offset=0){
  owner(actor);return stockTransaction(pool,actor,async db=>{await expire(db,actor.company_id);
    const {rows}=await db.query(`SELECT ${columns} FROM staff_invitations WHERE company_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`,[actor.company_id,limit,offset]);return {items:rows,limit,offset};});
}
export async function revokeInvitation(pool:Pool,actor:Actor,id:string,raw:unknown){
  owner(actor);const input=z.object({reason:z.string().trim().min(3).max(500)}).strict().parse(raw);
  return stockTransaction(pool,actor,async db=>{
    await expire(db,actor.company_id);const current=await invitation(db,actor.company_id,id);
    if(current.status==='REVOKED')return {...current,replayed:true};
    ensure(current.status==='PENDING',409,'INVITATION_CLOSED','Invitación ya cerrada');
    await db.query("UPDATE staff_invitations SET status='REVOKED',closed_at=clock_timestamp() WHERE company_id=$1 AND id=$2",[actor.company_id,id]);
    await audit(db,actor,'INVITATION_REVOKED',id,{reason:input.reason});return {...await invitation(db,actor.company_id,id),replayed:false};
  });
}
export async function acceptInvitation(pool:Pool,raw:unknown){
  const input=z.object({company:z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    name:z.string().trim().min(1).max(200),password:z.string().min(12).max(128)}).strict().parse(raw);
  assertLocalMail();await accountRate(pool,'INVITE_ACCEPT_COMPANY',input.company,500);await accountRate(pool,'INVITE_ACCEPT_TOKEN',`${input.company}:${digest(input.token)}`);
  const hashed=await hashPassword(input.password);
  return transaction(pool,async db=>{
    const company=(await db.query<{id:string}>('SELECT id FROM companies WHERE slug=$1',[input.company])).rows[0];
    ensure(company,400,'INVITATION_INVALID','Invitación inválida o vencida');await lockCompany(db,company.id);
    const {rows}=await db.query<Invitation>(`SELECT ${columns} FROM staff_invitations WHERE company_id=$1 AND token_hash=$2
      AND status='PENDING' AND expires_at>clock_timestamp()`,[company.id,digest(input.token)]);
    const current=rows[0];ensure(current,400,'INVITATION_INVALID','Invitación inválida o vencida');
    const inviter=await db.query("SELECT 1 FROM users WHERE company_id=$1 AND id=$2 AND active AND role='OWNER' AND (NOT email_verification_required OR email_verified_at IS NOT NULL)",[company.id,current.invited_by]);
    ensure(inviter.rowCount,400,'INVITATION_INVALID','Invitación inválida o vencida');
    const valid=await db.query('SELECT id FROM locations WHERE company_id=$1 AND id=ANY($2::uuid[]) AND active',[company.id,current.location_ids]);
    ensure(valid.rowCount===current.location_ids.length,409,'INVITATION_LOCATIONS_CHANGED','Las ubicaciones cambiaron; pide una nueva invitación');
    const existing=await db.query('SELECT 1 FROM users WHERE company_id=$1 AND email=$2',[company.id,current.email]);
    ensure(!existing.rowCount,409,'ACCOUNT_EXISTS','La cuenta ya existe; no se reemplazan sus credenciales');
    const id=randomUUID();
    await db.query(`INSERT INTO users(id,company_id,email,name,password_hash,role,email_verification_required,email_verified_at)
      VALUES($1,$2,$3,$4,$5,$6,true,clock_timestamp())`,[id,company.id,current.email,input.name,hashed,current.role]);
    for(const locationId of current.location_ids)await db.query('INSERT INTO agent_locations(company_id,user_id,location_id) VALUES($1,$2,$3)',[company.id,id,locationId]);
    await db.query("UPDATE staff_invitations SET status='ACCEPTED',accepted_user_id=$3,closed_at=clock_timestamp() WHERE company_id=$1 AND id=$2",[company.id,current.id,id]);
    await db.query(`INSERT INTO administrative_events(id,company_id,actor_id,action,entity_id,details) VALUES($1,$2,NULL,'INVITATION_ACCEPTED',$3,$4)`,[randomUUID(),company.id,current.id,JSON.stringify({userId:id,role:current.role,locationIds:current.location_ids,verification:'LOCAL_TOKEN'})]);
    return {ok:true,signInRequired:true};
  });
}
