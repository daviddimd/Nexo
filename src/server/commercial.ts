import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {owner,digest,type Actor} from './auth';
import {transaction} from './db';
import {stockTransaction} from './stock-transaction';
import {lockCompany} from './order-store';
import {ensure} from './errors';
import {uuid} from './schemas';

const instant=z.iso.datetime({offset:true}).transform(v=>new Date(v).toISOString());
const text=z.string().trim().min(3).max(200);
export const commercialSchema=z.object({mode:z.enum(['SUBSCRIPTION','PERPETUAL']),status:z.enum(['ENABLED','CANCELLED']),
  effectiveAt:instant,startsAt:instant,accessUntil:instant.nullable(),updatesUntil:instant,supportUntil:instant,
  operator:text,reference:text,reason:z.string().trim().min(3).max(500),expectedRevision:z.number().int().min(0).max(2147483646)
}).strict().superRefine((v,ctx)=>{
  if(v.mode==='SUBSCRIPTION'&&(!v.accessUntil||v.accessUntil<=v.startsAt))ctx.addIssue({code:'custom',message:'Suscripción requiere vencimiento posterior al inicio'});
  if(v.mode==='PERPETUAL'&&v.accessUntil!==null)ctx.addIssue({code:'custom',message:'Licencia permanente no tiene vencimiento de uso'});
  if(v.updatesUntil<v.startsAt||v.supportUntil<v.startsAt)ctx.addIssue({code:'custom',message:'Actualizaciones y soporte no pueden vencer antes del inicio'});
});
export type CommercialInput=z.input<typeof commercialSchema>;
type Terms=z.output<typeof commercialSchema>;
type Revision={id:string;company_id:string;revision:number;mode:'SUBSCRIPTION'|'PERPETUAL';status:'ENABLED'|'CANCELLED';
  effective_at:Date;starts_at:Date;access_until:Date|null;updates_until:Date;support_until:Date;
  operator_label:string;reference:string;reason:string;created_at:Date};
const columns='id,company_id,revision,mode,status,effective_at,starts_at,access_until,updates_until,support_until,operator_label,reference,reason,created_at';

function projected(record:Revision,at:Date){
  const started=record.starts_at<=at;
  const effective=record.effective_at<=at;
  const accessStatus=!effective?'SCHEDULED':record.status==='CANCELLED'?'CANCELLED':!started?'SCHEDULED':record.access_until&&record.access_until<=at?'EXPIRED':'ACTIVE';
  return {...record,effective,accessStatus,updatesActive:effective&&record.status==='ENABLED'&&started&&record.updates_until>at,
    supportActive:effective&&record.status==='ENABLED'&&started&&record.support_until>at};
}
async function summary(db:PoolClient,companyId:string){
  const at=(await db.query<{at:Date}>('SELECT clock_timestamp() AS at')).rows[0].at;
  const {rows}=await db.query<Revision>(`SELECT ${columns} FROM commercial_revisions WHERE company_id=$1 ORDER BY revision DESC`,[companyId]);
  const current=rows.find(r=>r.effective_at<=at)??null;
  const scheduled=rows.filter(r=>r.effective_at>at&&r.revision>(current?.revision??0)).map(r=>projected(r,at));
  const terms=current?projected(current,at):null;
  return {asOf:at,latestRevision:rows[0]?.revision??0,state:terms?.accessStatus??(scheduled.length?'SCHEDULED':'UNCONFIGURED'),
    current:terms,scheduled,operationalRestriction:'NONE' as const,billingEnabled:false};
}

// Operator-only service: never expose this writer as a tenant HTTP endpoint.
export async function recordCommercialInTransaction(db:PoolClient,companyId:string,key:string,terms:Terms){
  ensure(/^[A-Za-z0-9_-]{8,128}$/.test(key),400,'INVALID_IDEMPOTENCY_KEY','Idempotency-Key inválida');
  await lockCompany(db,companyId);
  const hash=digest(JSON.stringify(terms));
  const old=await db.query<{id:string;request_hash:string}>('SELECT id,request_hash FROM commercial_revisions WHERE company_id=$1 AND idempotency_key=$2',[companyId,key]);
  if(old.rows[0]){
    ensure(old.rows[0].request_hash===hash,409,'IDEMPOTENCY_CONFLICT','Clave utilizada con otros datos');
    const record=(await db.query<Revision>(`SELECT ${columns} FROM commercial_revisions WHERE company_id=$1 AND id=$2`,[companyId,old.rows[0].id])).rows[0];
    return {record,replayed:true,summary:await summary(db,companyId)};
  }
  const previous=(await db.query<{revision:number}>('SELECT COALESCE(max(revision),0) revision FROM commercial_revisions WHERE company_id=$1',[companyId])).rows[0].revision;
  ensure(previous===terms.expectedRevision,409,'COMMERCIAL_REVISION_CONFLICT','La configuración cambió; revisa la última revisión antes de aplicar');
  const id=randomUUID();
  const {rows}=await db.query<Revision>(`INSERT INTO commercial_revisions(id,company_id,revision,mode,status,effective_at,starts_at,access_until,updates_until,support_until,
    operator_label,reference,reason,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${columns}`,
    [id,companyId,previous+1,terms.mode,terms.status,terms.effectiveAt,terms.startsAt,terms.accessUntil,terms.updatesUntil,terms.supportUntil,terms.operator,terms.reference,terms.reason,key,hash]);
  await db.query(`INSERT INTO administrative_events(id,company_id,actor_id,action,entity_id,details) VALUES($1,$2,NULL,'COMMERCIAL_RECORDED',$3,$4)`,
    [randomUUID(),companyId,id,JSON.stringify({revision:previous+1,operator:terms.operator,reference:terms.reference,reason:terms.reason,source:'OPERATOR_CLI'})]);
  return {record:rows[0],replayed:false,summary:await summary(db,companyId)};
}
export async function recordCommercial(pool:Pool,companyId:string,key:string,raw:unknown){
  const id=uuid.parse(companyId),terms=commercialSchema.parse(raw);
  return transaction(pool,db=>recordCommercialInTransaction(db,id,key,terms));
}
export async function commercialSummary(pool:Pool,actor:Actor){
  owner(actor);return stockTransaction(pool,actor,db=>summary(db,actor.company_id));
}
export async function commercialHistory(pool:Pool,actor:Actor,limit=50,offset=0){
  owner(actor);return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query<Revision>(`SELECT ${columns} FROM commercial_revisions WHERE company_id=$1 ORDER BY revision DESC LIMIT $2 OFFSET $3`,[actor.company_id,limit,offset]);return {items:rows,limit,offset};
  });
}
