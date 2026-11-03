import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { digest, owner, staff, locationAccess, type Actor } from './auth';
import { ensure } from './errors';
import { uuid } from './schemas';
import { stockTransaction } from './stock-transaction';
import { findOrder, orderAccess, orderItems, event } from './order-store';
import { simulatorSecret } from './simulator';

const reason=z.string().trim().min(3).max(500);
const amount=z.string().regex(/^[1-9][0-9]{0,15}$/);
const refundSchema=z.object({amountMinor:amount,reason,reference:z.string().trim().min(3).max(120).optional()}).strict();
const receiptSchema=z.object({locationId:uuid,reason,items:z.array(z.object({productId:uuid,
  restockQuantity:z.number().int().min(0).max(1000000),damagedQuantity:z.number().int().min(0).max(1000000)
}).strict().refine(v=>v.restockQuantity+v.damagedQuantity>0&&v.restockQuantity+v.damagedQuantity<=1000000)).min(1).max(50)
  .refine(v=>new Set(v.map(i=>i.productId)).size===v.length,'Agrupa los productos repetidos')}).strict();
function keyValid(key:string){ensure(/^[A-Za-z0-9_-]{8,128}$/.test(key),400,'INVALID_IDEMPOTENCY_KEY','Idempotency-Key inválida');}

type Capture={id:string;order_id:string;amount_minor:string;currency:string;disposition:'APPLIED'|'REVIEW'};
async function captureById(db:PoolClient,actor:Actor,id:string){
  const {rows}=await db.query<Capture>(`SELECT c.id,i.order_id,c.amount_minor::text,c.currency,c.disposition
    FROM payment_captures c JOIN payment_intents i ON i.company_id=c.company_id AND i.id=c.intent_id
    WHERE c.company_id=$1 AND c.id=$2`,[actor.company_id,id]);
  ensure(rows[0],404,'CAPTURE_NOT_FOUND','Captura inexistente');return rows[0];
}
async function refunded(db:PoolClient,companyId:string,captureId:string|null,orderId:string){
  const {rows}=await db.query<{total:string}>(`SELECT COALESCE(sum(amount_minor),0)::text total FROM refunds
    WHERE company_id=$1 AND (($2::uuid IS NOT NULL AND capture_id=$2) OR ($2::uuid IS NULL AND capture_id IS NULL AND order_id=$3))`,[companyId,captureId,orderId]);
  return BigInt(rows[0].total);
}

// A simulated refund is a local financial receipt. It never calls a real provider.
export async function refundPayment(pool:Pool,actor:Actor,key:string,target:{captureId:string}|{orderId:string},raw:unknown){
  owner(actor);keyValid(key);const input=refundSchema.parse(raw);
  const hash=digest(JSON.stringify({actor:actor.id,target,...input}));
  return stockTransaction(pool,actor,async db=>{
    const old=await db.query('SELECT *,amount_minor::text FROM refunds WHERE company_id=$1 AND idempotency_key=$2',[actor.company_id,key]);
    if(old.rows[0]){ensure(old.rows[0].request_hash===hash,409,'IDEMPOTENCY_CONFLICT','Clave usada con otros datos');return {...old.rows[0],replayed:true};}
    const capture='captureId' in target?await captureById(db,actor,target.captureId):null;
    const order=await findOrder(db,actor.company_id,capture?.order_id??('orderId' in target?target.orderId:''));
    let maximum:bigint;let currency:string;let reference:string;
    if(capture){
      simulatorSecret(actor.company_id);
      ensure(input.reference===undefined,400,'SIMULATOR_REFERENCE','La referencia se genera automáticamente');
      maximum=BigInt(capture.amount_minor);currency=capture.currency;reference=`sim-refund:${randomUUID()}`;
    }else{
      ensure(order.payment_source==='MANUAL'&&['PAID','FULFILLED'].includes(order.status),409,'MANUAL_PAYMENT_REQUIRED','Requiere un pago manual registrado');
      ensure(input.reference&&!input.reference.startsWith('sim-refund:'),400,'REFUND_REFERENCE_REQUIRED','Registra la referencia del reembolso ya realizado');
      maximum=BigInt(order.total_minor);currency=order.currency;reference=input.reference;
    }
    const total=BigInt(input.amountMinor)+await refunded(db,actor.company_id,capture?.id??null,order.id);
    ensure(total<=maximum,
      409,'REFUND_EXCEEDS_PAYMENT','El reembolso supera el saldo del pago');
    const duplicate=await db.query('SELECT 1 FROM refunds WHERE company_id=$1 AND reference=$2',[actor.company_id,reference]);
    ensure(!duplicate.rowCount,409,'REFUND_REFERENCE_CONFLICT','Referencia de reembolso ya registrada');
    const id=randomUUID();
    const {rows}=await db.query(`INSERT INTO refunds(id,company_id,order_id,capture_id,actor_id,amount_minor,currency,source,reference,reason,idempotency_key,request_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *,amount_minor::text`,
      [id,actor.company_id,order.id,capture?.id??null,actor.id,input.amountMinor,currency,capture?'SIMULATOR':'MANUAL',reference,input.reason,key,hash]);
    await event(db,order,'REFUND_RECORDED',actor.id,`Reembolso ${id}: ${input.reason}`);
    if(capture?.disposition==='REVIEW'&&total===maximum){
      await db.query(`INSERT INTO capture_resolutions(company_id,capture_id,actor_id,outcome,reason) VALUES($1,$2,$3,'REFUNDED',$4)`,[actor.company_id,capture.id,actor.id,input.reason]);
      await event(db,order,'CAPTURE_RESOLVED',actor.id,`Captura ${capture.id} reembolsada completamente`);
    }
    return {...rows[0],replayed:false};
  });
}

export async function resolveZeroCapture(pool:Pool,actor:Actor,id:string,raw:unknown){
  owner(actor);const input=z.object({reason}).strict().parse(raw);
  return stockTransaction(pool,actor,async db=>{
    const capture=await captureById(db,actor,id);
    ensure(capture.disposition==='REVIEW'&&capture.amount_minor==='0',409,'REFUND_REQUIRED','Solo una captura sin fondos admite este cierre; las demás requieren reembolso');
    const old=await db.query('SELECT * FROM capture_resolutions WHERE company_id=$1 AND capture_id=$2',[actor.company_id,id]);
    if(old.rows[0]){ensure(old.rows[0].reason===input.reason,409,'RESOLUTION_CONFLICT','Ya tiene otra resolución');return {...old.rows[0],replayed:true};}
    const {rows}=await db.query(`INSERT INTO capture_resolutions(company_id,capture_id,actor_id,outcome,reason) VALUES($1,$2,$3,'NO_FUNDS',$4) RETURNING *`,[actor.company_id,id,actor.id,input.reason]);
    await event(db,await findOrder(db,actor.company_id,capture.order_id),'CAPTURE_RESOLVED',actor.id,`Captura ${id} sin fondos: ${input.reason}`);
    return {...rows[0],replayed:false};
  });
}

async function receiptResult(db:PoolClient,companyId:string,id:string){
  const {rows}=await db.query('SELECT * FROM return_receipts WHERE company_id=$1 AND id=$2',[companyId,id]);
  const items=await db.query('SELECT product_id,restock_quantity,damaged_quantity FROM return_items WHERE company_id=$1 AND receipt_id=$2 ORDER BY product_id',[companyId,id]);
  return {...rows[0],items:items.rows};
}
export async function receiveReturn(pool:Pool,actor:Actor,orderId:string,key:string,raw:unknown,kind:'RETURN'|'WITHDRAWAL'='RETURN'){
  staff(actor);keyValid(key);const input=receiptSchema.parse(raw);input.items.sort((a,b)=>a.productId.localeCompare(b.productId));
  const hash=digest(JSON.stringify({actor:actor.id,orderId,kind,...input}));
  return stockTransaction(pool,actor,async db=>{
    const order=await findOrder(db,actor.company_id,orderId);await orderAccess(db,actor,order);
    await locationAccess(db,actor,input.locationId);
    const old=await db.query('SELECT id,request_hash FROM return_receipts WHERE company_id=$1 AND idempotency_key=$2',[actor.company_id,key]);
    if(old.rows[0]){ensure(old.rows[0].request_hash===hash,409,'IDEMPOTENCY_CONFLICT','Clave usada con otros datos');return {...await receiptResult(db,actor.company_id,old.rows[0].id),replayed:true};}
    ensure(order.status===(kind==='RETURN'?'FULFILLED':'PAID'),409,'DELIVERY_REQUIRED',kind==='RETURN'?'Solo se reciben devoluciones de pedidos entregados o despachados':'Solo se revierte stock de pedidos pagados aún sin entregar');
    const sold=await orderItems(db,order);
    if(kind==='WITHDRAWAL'){
      ensure(input.locationId===order.location_id&&input.items.length===sold.length&&input.items.every(i=>
        i.damagedQuantity===0&&sold.some(s=>s.product_id===i.productId&&s.quantity===i.restockQuantity)),
        409,'FULL_WITHDRAWAL_REQUIRED','Revierte todo el pedido a su origen, sin unidades dañadas');
      const balance=await db.query<{total:string}>(`SELECT COALESCE(sum(r.amount_minor),0)::text total FROM refunds r
        LEFT JOIN payment_captures c ON c.company_id=r.company_id AND c.id=r.capture_id
        WHERE r.company_id=$1 AND r.order_id=$2 AND (r.capture_id IS NULL OR c.disposition='APPLIED')`,[actor.company_id,orderId]);
      ensure(BigInt(balance.rows[0].total)===BigInt(order.total_minor),409,'FULL_REFUND_REQUIRED','Registra primero el reembolso completo del pago aplicado');
    }
    const previous=await db.query<{product_id:string;quantity:string}>(`SELECT i.product_id,sum(i.restock_quantity::bigint+i.damaged_quantity)::text quantity
      FROM return_items i JOIN return_receipts r ON r.company_id=i.company_id AND r.id=i.receipt_id
      WHERE r.company_id=$1 AND r.order_id=$2 GROUP BY i.product_id`,[actor.company_id,orderId]);
    for(const item of input.items){
      const original=sold.find(p=>p.product_id===item.productId);
      ensure(original,409,'PRODUCT_NOT_SOLD','Producto no incluido en el pedido');
      const returned=BigInt(previous.rows.find(p=>p.product_id===item.productId)?.quantity??'0');
      ensure(returned+BigInt(item.restockQuantity+item.damagedQuantity)<=BigInt(original.quantity),409,'RETURN_EXCEEDS_SOLD','Cantidad devuelta superior a la vendida');
    }
    const id=randomUUID();const operationId=input.items.some(i=>i.restockQuantity>0)?randomUUID():null;
    if(operationId)await db.query(`INSERT INTO inventory_operations(id,company_id,actor_id,idempotency_key,request_hash,kind,reason)
      VALUES($1,$2,$3,$4,$5,'RETURN',$6)`,[operationId,actor.company_id,actor.id,`return:${id}`,hash,input.reason]);
    await db.query(`INSERT INTO return_receipts(id,company_id,order_id,location_id,actor_id,operation_id,reason,idempotency_key,request_hash,kind)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,actor.company_id,orderId,input.locationId,actor.id,operationId,input.reason,key,hash,kind]);
    for(const item of input.items){
      await db.query(`INSERT INTO return_items(company_id,receipt_id,product_id,restock_quantity,damaged_quantity) VALUES($1,$2,$3,$4,$5)`,[actor.company_id,id,item.productId,item.restockQuantity,item.damagedQuantity]);
      if(!item.restockQuantity)continue;
      await db.query('INSERT INTO stock(company_id,product_id,location_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[actor.company_id,item.productId,input.locationId]);
      const updated=await db.query(`UPDATE stock SET on_hand=on_hand+$4,updated_at=clock_timestamp()
        WHERE company_id=$1 AND product_id=$2 AND location_id=$3 AND on_hand::bigint+$4<=2147483647 RETURNING on_hand`,[actor.company_id,item.productId,input.locationId,item.restockQuantity]);
      ensure(updated.rowCount,409,'STOCK_CAPACITY','La ubicación excedería su capacidad de stock');
      await db.query(`INSERT INTO stock_movements(id,company_id,operation_id,product_id,location_id,delta,on_hand_after) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),actor.company_id,operationId,item.productId,input.locationId,item.restockQuantity,updated.rows[0].on_hand]);
    }
    await event(db,order,'RETURN_RECEIVED',actor.id,`${kind==='RETURN'?'Recepción':'Reversión antes de entrega'} ${id}: ${input.reason}`);
    return {...await receiptResult(db,actor.company_id,id),replayed:false};
  });
}

export async function aftersalesSummary(pool:Pool,actor:Actor,orderId:string){
  return stockTransaction(pool,actor,async db=>{
    const order=await findOrder(db,actor.company_id,orderId);await orderAccess(db,actor,order);
    const refunds=await db.query(`SELECT id,capture_id,amount_minor::text,currency,source,reference,reason,created_at FROM refunds WHERE company_id=$1 AND order_id=$2 ORDER BY created_at,id`,[actor.company_id,orderId]);
    const receipts=await db.query<{id:string}>('SELECT id FROM return_receipts WHERE company_id=$1 AND order_id=$2 ORDER BY created_at,id',[actor.company_id,orderId]);
    const returns=[];for(const row of receipts.rows)returns.push(await receiptResult(db,actor.company_id,row.id));
    // Extra/tardy captures are staff-only financial exceptions, not customer order refunds.
    const visibleRefunds=actor.role==='CUSTOMER'?refunds.rows.filter(r=>!r.capture_id):refunds.rows;
    if(actor.role==='CUSTOMER'){
      const applied=await db.query<{id:string}>(`SELECT c.id FROM payment_captures c JOIN payment_intents i ON i.company_id=c.company_id AND i.id=c.intent_id WHERE c.company_id=$1 AND i.order_id=$2 AND c.disposition='APPLIED'`,[actor.company_id,orderId]);
      visibleRefunds.push(...refunds.rows.filter(r=>applied.rows.some(c=>c.id===r.capture_id)));
    }
    const appliedRefunds=await db.query<{total:string}>(`SELECT COALESCE(sum(r.amount_minor),0)::text total FROM refunds r
      LEFT JOIN payment_captures c ON c.company_id=r.company_id AND c.id=r.capture_id
      WHERE r.company_id=$1 AND r.order_id=$2 AND (r.capture_id IS NULL OR c.disposition='APPLIED')`,[actor.company_id,orderId]);
    const total=appliedRefunds.rows[0].total;
    const captures=actor.role==='OWNER'?(await db.query(`SELECT c.id,c.amount_minor::text,c.currency,c.disposition FROM payment_captures c JOIN payment_intents i ON i.company_id=c.company_id AND i.id=c.intent_id WHERE c.company_id=$1 AND i.order_id=$2 ORDER BY c.created_at,c.id`,[actor.company_id,orderId])).rows:[];
    return {orderId,orderPaymentRefundedMinor:total,refundState:total==='0'?'NONE':total===order.total_minor?'FULL':'PARTIAL',
      captures,withdrawn:returns.some(r=>r.kind==='WITHDRAWAL'),refunds:visibleRefunds,returns};
  });
}
