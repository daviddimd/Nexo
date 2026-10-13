import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { digest, staff, type Actor } from './auth';
import { transaction } from './db';
import { AppError, ensure } from './errors';
import { expireDue, findOrder, isExpired, lockCompany, orderAccess } from './order-store';
import { stockTransaction } from './stock-transaction';
import { settleReservedOrder } from './settlement';
import { paymentIntentSchema, type SimulatorEvent } from './payment-schemas';
import { simulatorSecret, verifySimulatorEvent } from './simulator';

type Intent = {
  id:string; company_id:string; order_id:string; customer_id:string; provider:'SIMULATOR';
  status:'PENDING'|'FAILED'|'SUCCEEDED'|'REVIEW'; amount_minor:string; currency:string; created_at:Date;
};
type EventResult = { result:'APPLIED'|'REVIEW'|'IGNORED'; reason:string };

async function intentById(db: PoolClient, companyId: string, id: string) {
  const {rows}=await db.query<Intent>(`SELECT id,company_id,order_id,customer_id,provider,status,amount_minor::text,currency,created_at
    FROM payment_intents WHERE company_id=$1 AND id=$2`,[companyId,id]);
  ensure(rows[0],404,'PAYMENT_NOT_FOUND','Intento de pago inexistente');
  return rows[0];
}

export async function createPaymentIntent(pool: Pool, actor: Actor, key: string, raw: unknown) {
  ensure(actor.role==='CUSTOMER',403,'CUSTOMER_REQUIRED','Requiere una cuenta de cliente');
  simulatorSecret(actor.company_id);
  ensure(/^[A-Za-z0-9_-]{8,128}$/.test(key),400,'INVALID_IDEMPOTENCY_KEY','Idempotency-Key inválida');
  const input=paymentIntentSchema.parse(raw);
  const hash=digest(JSON.stringify({actor:actor.id,...input}));
  return stockTransaction(pool,actor,async db=>{
    const previous=await db.query<{id:string;request_hash:string}>('SELECT id,request_hash FROM payment_intents WHERE company_id=$1 AND idempotency_key=$2',[actor.company_id,key]);
    if(previous.rows[0]) {
      ensure(previous.rows[0].request_hash===hash,409,'IDEMPOTENCY_CONFLICT','Clave utilizada con otros datos');
      return {...await intentById(db,actor.company_id,previous.rows[0].id),simulated:true,checkoutUrl:null,replayed:true};
    }
    const order=await findOrder(db,actor.company_id,input.orderId);await orderAccess(db,actor,order);
    ensure(order.status==='RESERVED'&&!await isExpired(db,order),409,'PAYMENT_NOT_AVAILABLE','El pedido no tiene reserva vigente');
    ensure(order.fulfillment!=='SHIP'||order.shipping_quote_id,409,'SHIPPING_QUOTE_REQUIRED','Recrea el pedido de envío con cotización');
    ensure(BigInt(order.total_minor)>0n,409,'ZERO_PAYMENT_NOT_SUPPORTED','Un pedido gratuito requiere registro manual');
    const existing=await db.query('SELECT 1 FROM payment_intents WHERE company_id=$1 AND order_id=$2',[actor.company_id,order.id]);
    ensure(!existing.rowCount,409,'PAYMENT_ALREADY_STARTED','Ya existe un intento para el pedido; reintenta con su clave original');
    const id=randomUUID();
    await db.query(`INSERT INTO payment_intents(id,company_id,order_id,customer_id,amount_minor,currency,idempotency_key,request_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,actor.company_id,order.id,actor.id,order.total_minor,order.currency,key,hash]);
    return {...await intentById(db,actor.company_id,id),simulated:true,checkoutUrl:null,replayed:false};
  });
}

export async function getPaymentIntent(pool: Pool, actor: Actor, id: string) {
  return stockTransaction(pool,actor,async db=>{
    const intent=await intentById(db,actor.company_id,id);
    await orderAccess(db,actor,await findOrder(db,actor.company_id,intent.order_id));
    return {...intent,simulated:true};
  });
}

async function success(db: PoolClient, companyId: string, intent: Intent, payload: SimulatorEvent): Promise<EventResult> {
  const existing=await db.query<{intent_id:string;amount_minor:string;currency:string;disposition:EventResult['result'];reason:string}>(
    'SELECT intent_id,amount_minor::text,currency,disposition,reason FROM payment_captures WHERE company_id=$1 AND transaction_id=$2',[companyId,payload.transactionId]);
  if(existing.rows[0]) {
    ensure(existing.rows[0].intent_id===intent.id&&existing.rows[0].amount_minor===payload.amountMinor&&existing.rows[0].currency===payload.currency,
      409,'TRANSACTION_CONFLICT','Transacción asociada a otros datos');
    return {result:'IGNORED',reason:'TRANSACTION_ALREADY_RECORDED'};
  }
  let outcome:EventResult={result:'REVIEW',reason:'ORDER_NOT_PAYABLE'};
  const order=await findOrder(db,companyId,intent.order_id);
  if(payload.amountMinor!==intent.amount_minor||payload.currency!==intent.currency) {
    outcome.reason='AMOUNT_OR_CURRENCY_MISMATCH';
  } else if(order.status==='PAID'||order.status==='FULFILLED') {
    outcome.reason='ORDER_ALREADY_PAID';
  } else if(order.status==='EXPIRED'||await isExpired(db,order)) {
    outcome.reason='RESERVATION_EXPIRED';
  } else if(order.status==='RESERVED') {
    await db.query('SAVEPOINT gateway_settlement');
    try {
      await settleReservedOrder(db,order,{source:'SIMULATOR',method:'GATEWAY',reference:`simulator:${payload.transactionId}`,actorId:null});
      outcome={result:'APPLIED',reason:'PAYMENT_APPLIED'};
    } catch(error) {
      await db.query('ROLLBACK TO SAVEPOINT gateway_settlement');
      if(!(error instanceof AppError))throw error;
      outcome={result:'REVIEW',reason:error.code};
      await expireDue(db,companyId);
    }
  }
  await db.query(`INSERT INTO payment_captures(id,company_id,intent_id,transaction_id,amount_minor,currency,disposition,reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),companyId,intent.id,payload.transactionId,payload.amountMinor,payload.currency,outcome.result,outcome.reason]);
  const target=outcome.result==='APPLIED'?'SUCCEEDED':intent.status==='SUCCEEDED'?'SUCCEEDED':'REVIEW';
  if(target!==intent.status) await db.query('UPDATE payment_intents SET status=$3,updated_at=clock_timestamp() WHERE company_id=$1 AND id=$2',[companyId,intent.id,target]);
  return outcome;
}

export async function processSimulatorWebhook(pool: Pool, companyId: string, raw: string, timestamp: string|null, signature: string|null) {
  const payload=verifySimulatorEvent(companyId,raw,timestamp,signature);
  const hash=digest(raw);
  return transaction(pool,async db=>{
    await lockCompany(db,companyId);await expireDue(db,companyId);
    const previous=await db.query<{payload_hash:string;result:EventResult['result'];reason:string}>(
      'SELECT payload_hash,result,reason FROM payment_events WHERE company_id=$1 AND event_id=$2',[companyId,payload.eventId]);
    if(previous.rows[0]) {
      ensure(previous.rows[0].payload_hash===hash,409,'EVENT_CONFLICT','Evento ya registrado con otros datos');
      return {result:previous.rows[0].result,reason:previous.rows[0].reason,replayed:true,simulated:true};
    }
    const intent=await intentById(db,companyId,payload.intentId);
    let outcome:EventResult;
    if(payload.status==='SUCCEEDED') outcome=await success(db,companyId,intent,payload);
    else {
      if(intent.status==='PENDING') await db.query("UPDATE payment_intents SET status='FAILED',updated_at=clock_timestamp() WHERE company_id=$1 AND id=$2",[companyId,intent.id]);
      outcome={result:'IGNORED',reason:intent.status==='PENDING'?'PAYMENT_FAILED':'STALE_FAILURE'};
    }
    await db.query(`INSERT INTO payment_events(id,company_id,intent_id,event_id,payload_hash,status,transaction_id,result,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),companyId,intent.id,payload.eventId,hash,payload.status,payload.transactionId,outcome.result,outcome.reason]);
    return {...outcome,replayed:false,simulated:true};
  });
}

export async function listPaymentCaptures(pool: Pool, actor: Actor, limit=50, offset=0) {
  staff(actor);
  return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query(`SELECT c.id,c.intent_id,i.order_id,c.transaction_id,c.amount_minor::text,c.currency,c.disposition,c.reason,c.created_at,
      COALESCE((SELECT sum(r.amount_minor) FROM refunds r WHERE r.company_id=c.company_id AND r.capture_id=c.id),0)::text refunded_minor,
      s.outcome AS resolution,s.created_at AS resolved_at
      FROM payment_captures c JOIN payment_intents i ON i.company_id=c.company_id AND i.id=c.intent_id
      LEFT JOIN capture_resolutions s ON s.company_id=c.company_id AND s.capture_id=c.id
      JOIN orders o ON o.company_id=i.company_id AND o.id=i.order_id WHERE c.company_id=$1
      AND ($2='OWNER' OR EXISTS(SELECT 1 FROM agent_locations a WHERE a.company_id=o.company_id AND a.user_id=$3 AND a.location_id=o.location_id))
      ORDER BY c.created_at DESC,c.id LIMIT $4 OFFSET $5`,[actor.company_id,actor.role,actor.id,limit,offset]);
    return {items:rows,limit,offset};
  });
}
