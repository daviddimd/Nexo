import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ensure } from './errors';
import type { Actor } from './auth';
import type { ShippingAddress } from './shipping-schemas';

export type OrderStatus = 'RESERVED' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'FULFILLED';
export type Order = {
  id: string; company_id: string; customer_id: string | null; created_by: string;
  channel: 'ONLINE' | 'LOCAL'; fulfillment: 'PICKUP' | 'SHIP' | 'LOCAL';
  location_id: string; status: OrderStatus; currency: string; total_minor: string;
  goods_minor: string; shipping_minor: string; shipping_quote_id: string|null; shipping_address: ShippingAddress|null;
  payment_source: 'MANUAL'|'SIMULATOR'|null;
  expires_at: Date; payment_method: string | null; payment_reference: string | null;
  paid_by: string | null; paid_at: Date | null; fulfilled_at: Date | null;
  cancellation_reason: string | null; sale_operation_id: string | null;
  created_at: Date; updated_at: Date;
};
export type OrderItem = {
  product_id: string; sku: string; name: string; quantity: number;
  unit_price_minor: string; line_total_minor: string;
};
export type OrderEvent = { id: string; type: string; actor_id: string | null; reason: string; created_at: Date };

export async function lockCompany(db: PoolClient, companyId: string) {
  const result = await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId]);
  ensure(result.rowCount, 404, 'COMPANY_NOT_FOUND', 'Empresa inexistente');
}

export async function currentActor(db: PoolClient, actor: Actor) {
  const { rows } = await db.query('SELECT role FROM users WHERE company_id=$1 AND id=$2 AND active AND (NOT email_verification_required OR email_verified_at IS NOT NULL)', [actor.company_id, actor.id]);
  ensure(rows[0]?.role === actor.role, 403, 'FORBIDDEN', 'Cuenta inactiva o permisos modificados');
}

export async function findOrder(db: PoolClient, companyId: string, id: string): Promise<Order> {
  const { rows } = await db.query<Order>(`SELECT id,company_id,customer_id,created_by,channel,fulfillment,
    location_id,status,currency,total_minor::text,expires_at,payment_method,payment_reference,paid_by,
    paid_at,fulfilled_at,cancellation_reason,sale_operation_id,created_at,updated_at,
    goods_minor::text,shipping_minor::text,shipping_quote_id,shipping_address,payment_source
    FROM orders WHERE company_id=$1 AND id=$2`, [companyId, id]);
  ensure(rows[0], 404, 'ORDER_NOT_FOUND', 'Pedido inexistente');
  return rows[0];
}

export async function orderAccess(db: PoolClient, actor: Actor, order: Order) {
  // Return the same 404 for missing and unauthorized customer/branch orders.
  if (actor.role === 'CUSTOMER') {
    ensure(order.customer_id === actor.id, 404, 'ORDER_NOT_FOUND', 'Pedido inexistente');
  } else if (actor.role === 'AGENT') {
    const permission = await db.query(`SELECT 1 FROM agent_locations
      WHERE company_id=$1 AND user_id=$2 AND location_id=$3`, [actor.company_id, actor.id, order.location_id]);
    ensure(permission.rowCount, 404, 'ORDER_NOT_FOUND', 'Pedido inexistente');
  }
}

export async function orderItems(db: PoolClient, order: Order) {
  const { rows } = await db.query<OrderItem>(`SELECT product_id,sku,name,quantity,unit_price_minor::text,line_total_minor::text
    FROM order_items WHERE company_id=$1 AND order_id=$2 ORDER BY product_id`, [order.company_id, order.id]);
  return rows;
}

export async function orderResult(db: PoolClient, order: Order) {
  const items = await orderItems(db, order);
  const { rows: events } = await db.query<OrderEvent>(`SELECT id,type,actor_id,reason,created_at FROM order_events
    WHERE company_id=$1 AND order_id=$2 ORDER BY created_at,id`, [order.company_id, order.id]);
  return { ...order, items, events };
}

export async function event(db: PoolClient, order: Order, type: OrderEvent['type'], actorId: string | null, reason: string) {
  await db.query(`INSERT INTO order_events(id,company_id,order_id,actor_id,type,reason) VALUES($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), order.company_id, order.id, actorId, type, reason]);
}

export async function releaseReservation(db: PoolClient, order: Order, status: 'EXPIRED' | 'CANCELLED', actorId: string | null, reason: string) {
  for (const item of await orderItems(db, order)) {
    const changed = await db.query(`UPDATE stock SET reserved=reserved-$4,updated_at=clock_timestamp()
      WHERE company_id=$1 AND product_id=$2 AND location_id=$3 AND reserved >= $4`,
      [order.company_id, item.product_id, order.location_id, item.quantity]);
    ensure(changed.rowCount, 409, 'RESERVATION_INTEGRITY', 'No se pudo liberar la reserva; requiere revisión');
  }
  await db.query(`UPDATE orders SET status=$3,cancellation_reason=$4,updated_at=clock_timestamp()
    WHERE company_id=$1 AND id=$2`, [order.company_id, order.id, status, reason]);
  await event(db, order, status, actorId, reason);
}

// Caller must hold the company lock; all inventory and order writers share it.
export async function expireDue(db: PoolClient, companyId: string) {
  // Wall-clock time is read AFTER acquiring the lock, not PostgreSQL's transaction-start now().
  const clock = await db.query<{ cutoff: Date }>('SELECT clock_timestamp() AS cutoff');
  await db.query("UPDATE shipping_quotes SET status='EXPIRED' WHERE company_id=$1 AND status='APPROVED' AND expires_at<=$2", [companyId,clock.rows[0].cutoff]);
  const due = await db.query<{ id: string }>(`SELECT id FROM orders
    WHERE company_id=$1 AND status='RESERVED' AND expires_at <= $2 ORDER BY expires_at,id`, [companyId, clock.rows[0].cutoff]);
  for (const row of due.rows) {
    await releaseReservation(db, await findOrder(db, companyId, row.id), 'EXPIRED', null, 'Venció el plazo de reserva');
  }
  return due.rowCount ?? 0;
}

export async function isExpired(db: PoolClient, order: Order) {
  const { rows } = await db.query<{ expired: boolean }>('SELECT clock_timestamp() >= $1 AS expired', [order.expires_at]);
  return rows[0].expired;
}
