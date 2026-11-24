import {randomUUID} from 'node:crypto';
import type {Pool, PoolClient} from 'pg';
import {z} from 'zod';
import {staff, type Actor} from './auth';
import {ensure} from './errors';
import {stockTransaction} from './stock-transaction';
import {event, findOrder, orderAccess, orderResult, type Order} from './order-store';
import {assertFulfillable, completeOrder} from './orders';

// Etapas que ve el equipo en Envíos. Un pedido pagado sin ficha está "por preparar".
export const dispatchStages = ['prepare', 'preparing', 'dispatched', 'delivered'] as const;
export type DispatchStage = typeof dispatchStages[number];

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(value => (value === '' || value === null ? undefined : value), schema.optional());
const shipmentData = z.object({
 carrier: text(2, 80),
 trackingCode: optional(text(3, 80)),
 estimatedDelivery: optional(z.iso.date()),
}).strict();

const listFilters = z.object({
 stage: z.enum(['all', ...dispatchStages]).default('all'),
 q: z.string().trim().max(80).default('').transform(value => value.replace(/[%_\\]/g, '\\$&')),
}).strict();

// Un solo origen de verdad para la etapa: la usan la lista y los contadores.
const baseQuery = `SELECT o.id,o.created_at,o.paid_at,o.fulfilled_at,o.status,o.total_minor::text AS total_minor,o.location_id,l.name AS location_name,
   o.shipping_address,
   COALESCE((SELECT sum(i.quantity) FROM order_items i WHERE i.company_id=o.company_id AND i.order_id=o.id),0)::int AS units,
   s.status AS shipment_status,s.carrier,s.tracking_code,s.estimated_delivery::text AS estimated_delivery,
   s.prepared_at,s.dispatched_at,s.delivered_at,
   CASE WHEN s.status='DELIVERED' THEN 'delivered'
        WHEN o.status='FULFILLED' THEN 'dispatched'
        WHEN s.status='PREPARING' THEN 'preparing'
        ELSE 'prepare' END AS stage,
   (o.status='PAID' AND (EXISTS(SELECT 1 FROM refunds r LEFT JOIN payment_captures c ON c.company_id=r.company_id AND c.id=r.capture_id
      WHERE r.company_id=o.company_id AND r.order_id=o.id AND (r.capture_id IS NULL OR c.disposition='APPLIED'))
    OR EXISTS(SELECT 1 FROM return_receipts w WHERE w.company_id=o.company_id AND w.order_id=o.id AND w.kind='WITHDRAWAL'))) AS blocked
  FROM orders o JOIN locations l ON l.company_id=o.company_id AND l.id=o.location_id
  LEFT JOIN shipments s ON s.company_id=o.company_id AND s.order_id=o.id
  WHERE o.company_id=$1 AND o.fulfillment='SHIP' AND o.status IN ('PAID','FULFILLED')
   AND ($2='OWNER' OR EXISTS(SELECT 1 FROM agent_locations a WHERE a.company_id=o.company_id AND a.user_id=$3 AND a.location_id=o.location_id))`;

export async function listDispatches(pool: Pool, actor: Actor, limit = 25, offset = 0, raw: unknown = {}) {
 staff(actor);
 const filters = listFilters.parse(raw);
 return stockTransaction(pool, actor, async db => {
  const counted = await db.query<{stage: DispatchStage; total: number; late: number}>(
   `WITH base AS (${baseQuery}) SELECT stage,count(*)::int AS total,
     count(*) FILTER (WHERE stage IN ('prepare','preparing') AND NOT blocked AND paid_at < clock_timestamp() - interval '24 hours')::int AS late
    FROM base GROUP BY stage`, [actor.company_id, actor.role, actor.id]);
  const counts: Record<string, number> = {prepare: 0, preparing: 0, dispatched: 0, delivered: 0};
  let late = 0;
  for (const row of counted.rows) { counts[row.stage] = row.total; late += row.late; }
  const {rows} = await db.query(
   `WITH base AS (${baseQuery}) SELECT * FROM base
     WHERE ($4='all' OR stage=$4)
      AND ($5='' OR id::text ILIKE $5||'%' OR tracking_code ILIKE '%'||$5||'%' OR carrier ILIKE '%'||$5||'%'
        OR shipping_address->>'recipient' ILIKE '%'||$5||'%' OR shipping_address->>'commune' ILIKE '%'||$5||'%')
     ORDER BY (stage IN ('prepare','preparing')) DESC,
       CASE WHEN stage IN ('prepare','preparing') THEN paid_at END ASC,
       COALESCE(delivered_at,dispatched_at,fulfilled_at,paid_at) DESC, id
     LIMIT $6 OFFSET $7`, [actor.company_id, actor.role, actor.id, filters.stage, filters.q, limit, offset]);
  return {items: rows, counts, late, limit, offset};
 });
}

async function shipmentOf(db: PoolClient, order: Order) {
 const {rows} = await db.query<{id: string; status: 'PREPARING' | 'DISPATCHED' | 'DELIVERED'; carrier: string | null; tracking_code: string | null; estimated_delivery: string | null}>(
  'SELECT id,status,carrier,tracking_code,estimated_delivery::text AS estimated_delivery FROM shipments WHERE company_id=$1 AND order_id=$2 FOR UPDATE',
  [order.company_id, order.id]);
 return rows[0] ?? null;
}

async function shippableOrder(db: PoolClient, actor: Actor, id: string) {
 const order = await findOrder(db, actor.company_id, id);
 await orderAccess(db, actor, order);
 ensure(order.fulfillment === 'SHIP', 409, 'NOT_A_SHIPMENT', 'El pedido no es un envío a domicilio');
 return order;
}

async function result(db: PoolClient, actor: Actor, id: string, replayed: boolean) {
 return {...await orderResult(db, await findOrder(db, actor.company_id, id)), replayed};
}

async function createShipment(db: PoolClient, actor: Actor, order: Order) {
 const id = randomUUID();
 await db.query('INSERT INTO shipments(id,company_id,order_id,prepared_by) VALUES($1,$2,$3,$4)', [id, order.company_id, order.id, actor.id]);
 await event(db, order, 'SHIPMENT_PREPARING', actor.id, 'Pedido en preparación');
 return id;
}

export async function prepareShipment(pool: Pool, actor: Actor, orderId: string) {
 staff(actor);
 return stockTransaction(pool, actor, async db => {
  const order = await shippableOrder(db, actor, orderId);
  if (await shipmentOf(db, order)) return result(db, actor, order.id, true);
  ensure(order.status !== 'FULFILLED', 409, 'ALREADY_DISPATCHED', 'El pedido ya fue despachado');
  await assertFulfillable(db, order);
  await createShipment(db, actor, order);
  return result(db, actor, order.id, false);
 });
}

export async function dispatchShipment(pool: Pool, actor: Actor, orderId: string, raw: unknown) {
 staff(actor);
 const input = shipmentData.parse(raw);
 return stockTransaction(pool, actor, async db => {
  const order = await shippableOrder(db, actor, orderId);
  const current = await shipmentOf(db, order);
  if (current && current.status !== 'PREPARING') {
   ensure(current.carrier === input.carrier && current.tracking_code === (input.trackingCode ?? null),
    409, 'SHIPMENT_CONFLICT', 'El pedido ya fue despachado con otros datos; usa corregir datos del despacho');
   return result(db, actor, order.id, true);
  }
  ensure(order.status !== 'FULFILLED', 409, 'ALREADY_DISPATCHED', 'El pedido ya fue despachado sin ficha de envío');
  await assertFulfillable(db, order);
  if (!current) await createShipment(db, actor, order);
  await completeOrder(db, actor, order);
  await db.query(`UPDATE shipments SET status='DISPATCHED',carrier=$3,tracking_code=$4,estimated_delivery=$5,
    dispatched_by=$6,dispatched_at=clock_timestamp(),updated_at=clock_timestamp() WHERE company_id=$1 AND order_id=$2`,
   [order.company_id, order.id, input.carrier, input.trackingCode ?? null, input.estimatedDelivery ?? null, actor.id]);
  return result(db, actor, order.id, false);
 });
}

export async function updateShipment(pool: Pool, actor: Actor, orderId: string, raw: unknown) {
 staff(actor);
 const input = shipmentData.parse(raw);
 return stockTransaction(pool, actor, async db => {
  const order = await shippableOrder(db, actor, orderId);
  const current = await shipmentOf(db, order);
  ensure(current, 404, 'SHIPMENT_NOT_FOUND', 'El pedido todavía no tiene un despacho registrado');
  ensure(current.status === 'DISPATCHED', 409, 'SHIPMENT_LOCKED', 'Solo se pueden corregir despachos que aún no figuran como entregados');
  const unchanged = current.carrier === input.carrier && current.tracking_code === (input.trackingCode ?? null)
   && current.estimated_delivery === (input.estimatedDelivery ?? null);
  if (unchanged) return result(db, actor, order.id, true);
  await db.query(`UPDATE shipments SET carrier=$3,tracking_code=$4,estimated_delivery=$5,updated_at=clock_timestamp()
   WHERE company_id=$1 AND order_id=$2`, [order.company_id, order.id, input.carrier, input.trackingCode ?? null, input.estimatedDelivery ?? null]);
  await event(db, order, 'SHIPMENT_UPDATED', actor.id, `Datos de despacho actualizados: ${input.carrier}${input.trackingCode ? ` · ${input.trackingCode}` : ''}`);
  return result(db, actor, order.id, false);
 });
}

export async function deliverShipment(pool: Pool, actor: Actor, orderId: string) {
 staff(actor);
 return stockTransaction(pool, actor, async db => {
  const order = await shippableOrder(db, actor, orderId);
  const current = await shipmentOf(db, order);
  ensure(current, 409, 'SHIPMENT_NOT_DISPATCHED', 'Registra el despacho antes de confirmar la entrega');
  if (current.status === 'DELIVERED') return result(db, actor, order.id, true);
  ensure(current.status === 'DISPATCHED', 409, 'SHIPMENT_NOT_DISPATCHED', 'Registra el despacho antes de confirmar la entrega');
  await db.query(`UPDATE shipments SET status='DELIVERED',delivered_by=$3,delivered_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE company_id=$1 AND order_id=$2`, [order.company_id, order.id, actor.id]);
  await event(db, order, 'SHIPMENT_DELIVERED', actor.id, 'Entrega confirmada');
  return result(db, actor, order.id, false);
 });
}
