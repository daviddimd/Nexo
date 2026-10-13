import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { digest } from './auth';
import { ensure } from './errors';
import { event, isExpired, orderItems, type Order } from './order-store';

type Settlement = {
  source: 'MANUAL'|'SIMULATOR';
  method: 'CASH'|'CARD'|'TRANSFER'|'GATEWAY';
  reference: string;
  actorId: string|null;
};

// Internal service only. Callers must authorize the agent or verify the provider
// signature and payment amount first; never expose this function directly as a route.
export async function settleReservedOrder(db: PoolClient, order: Order, payment: Settlement) {
  ensure(order.status==='RESERVED',409,'INVALID_ORDER_STATE','El pedido no admite confirmación');
  ensure(order.fulfillment!=='SHIP'||order.shipping_quote_id,409,'SHIPPING_QUOTE_REQUIRED','El pedido antiguo de envío debe recrearse con cotización');
  ensure(!await isExpired(db,order),409,'RESERVATION_EXPIRED','La reserva venció');
  const operationId=randomUUID();
  await db.query(`INSERT INTO inventory_operations(id,company_id,actor_id,idempotency_key,request_hash,kind,reason)
    VALUES($1,$2,$3,$4,$5,'SALE',$6)`,[operationId,order.company_id,payment.actorId,`order:${order.id}`,
      digest(JSON.stringify(payment)),`Pago ${payment.source==='MANUAL'?'manual':'simulado'} de pedido ${order.id}`]);
  for(const item of await orderItems(db,order)) {
    const changed=await db.query<{on_hand:number}>(`UPDATE stock SET on_hand=on_hand-$4,reserved=reserved-$4,updated_at=clock_timestamp()
      WHERE company_id=$1 AND product_id=$2 AND location_id=$3 AND reserved>=$4 AND on_hand>=$4 RETURNING on_hand`,
      [order.company_id,item.product_id,order.location_id,item.quantity]);
    ensure(changed.rows[0],409,'RESERVATION_INTEGRITY','No se pudo consumir la reserva');
    await db.query(`INSERT INTO stock_movements(id,company_id,operation_id,product_id,location_id,delta,on_hand_after)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),order.company_id,operationId,item.product_id,order.location_id,-item.quantity,changed.rows[0].on_hand]);
  }
  ensure(!await isExpired(db,order),409,'RESERVATION_EXPIRED','La reserva venció');
  await db.query(`UPDATE orders SET status='PAID',payment_method=$3,payment_reference=$4,payment_source=$5,
    paid_by=$6,paid_at=clock_timestamp(),sale_operation_id=$7,updated_at=clock_timestamp() WHERE company_id=$1 AND id=$2`,
    [order.company_id,order.id,payment.method,payment.reference,payment.source,payment.actorId,operationId]);
  await event(db,order,'PAYMENT_RECORDED',payment.actorId,payment.source==='MANUAL'
    ?'Pago registrado manualmente por agente; no verificado por pasarela'
    :'Pago del simulador firmado; no se movió dinero real');
}
