import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { digest, locationAccess, owner, staff, type Actor } from './auth';
import { stockTransaction as orderTransaction } from './stock-transaction';
import {audit} from './audit';
import { ensure } from './errors';
import { priceCart, type PricedCart } from './checkout';
import { approvedShippingQuote } from './shipping';
import { settleReservedOrder } from './settlement';
import type { ShippingAddress } from './shipping-schemas';
import {
  cancelOrderSchema, localSaleSchema, manualPaymentSchema, onlineOrderSchema,
  orderSettingsSchema, type ManualPayment,
} from './order-schemas';
import {
  event, findOrder, isExpired,
  orderAccess, orderResult, releaseReservation, type Order,
} from './order-store';

function idempotencyKey(key: string) {
  ensure(/^[A-Za-z0-9_-]{8,128}$/.test(key), 400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key inválida');
}

async function replay(db: PoolClient, actor: Actor, key: string, hash: string) {
  const { rows } = await db.query<{ id: string; request_hash: string }>(
    'SELECT id,request_hash FROM orders WHERE company_id=$1 AND idempotency_key=$2', [actor.company_id, key]);
  if (!rows[0]) return null;
  ensure(rows[0].request_hash === hash, 409, 'IDEMPOTENCY_CONFLICT', 'La clave ya se utilizó con otros datos');
  const order = await findOrder(db, actor.company_id, rows[0].id);
  await orderAccess(db, actor, order);
  return { ...await orderResult(db, order), replayed: true };
}

async function storeLocation(db: PoolClient, companyId: string, id: string) {
  const result = await db.query("SELECT 1 FROM locations WHERE company_id=$1 AND id=$2 AND kind='STORE' AND active", [companyId, id]);
  ensure(result.rowCount, 404, 'PICKUP_LOCATION_INVALID', 'Sucursal inexistente o inactiva');
  return id;
}

async function reserveDraft(db: PoolClient, actor: Actor, key: string, hash: string,
  channel: Order['channel'], fulfillment: Order['fulfillment'], locationId: string, cart: PricedCart,
  shipping?: { quoteId:string; address:ShippingAddress; fee:string }) {
  const company = await db.query<{ reservation_minutes: number }>('SELECT reservation_minutes FROM companies WHERE id=$1', [actor.company_id]);
  const id = randomUUID();
  await db.query(`INSERT INTO orders(id,company_id,customer_id,created_by,channel,fulfillment,
    location_id,total_minor,idempotency_key,request_hash,expires_at,goods_minor,shipping_minor,shipping_quote_id,shipping_address)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()+$11*interval '1 minute',$12,$13,$14,$15)`,
    [id, actor.company_id, channel === 'ONLINE' ? actor.id : null, actor.id, channel, fulfillment,
      locationId, (BigInt(cart.total)+BigInt(shipping?.fee??'0')).toString(), key, hash, company.rows[0].reservation_minutes,
      cart.total,shipping?.fee??'0',shipping?.quoteId??null,shipping?JSON.stringify(shipping.address):null]);
  for (const item of cart.items) {
    const reserved = await db.query(`UPDATE stock SET reserved=reserved+$4,updated_at=clock_timestamp()
      WHERE company_id=$1 AND product_id=$2 AND location_id=$3 AND on_hand-reserved >= $4`,
      [actor.company_id, item.productId, locationId, item.quantity]);
    ensure(reserved.rowCount, 409, 'INSUFFICIENT_STOCK', 'Stock disponible insuficiente en la ubicación elegida');
    await db.query(`INSERT INTO order_items(company_id,order_id,product_id,sku,name,quantity,unit_price_minor,line_total_minor)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [actor.company_id, id, item.productId, item.sku, item.name, item.quantity, item.unitPrice, item.lineTotal]);
  }
  const order = await findOrder(db, actor.company_id, id);
  await event(db, order, 'RESERVED', actor.id, 'Stock reservado para el pedido');
  return order;
}

export async function createOnlineOrder(pool: Pool, actor: Actor, key: string, raw: unknown) {
  ensure(actor.role === 'CUSTOMER', 403, 'CUSTOMER_REQUIRED', 'La compra online requiere una cuenta de cliente');
  idempotencyKey(key);
  const input = onlineOrderSchema.parse(raw);
  input.items.sort((a, b) => a.productId.localeCompare(b.productId));
  const hash = digest(JSON.stringify({ actor: actor.id, channel: 'ONLINE', ...input }));
  return orderTransaction(pool, actor, async db => {
    const previous = await replay(db, actor, key, hash);
    if (previous) return previous;
    const pending = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM orders
      WHERE company_id=$1 AND customer_id=$2 AND status='RESERVED'`, [actor.company_id, actor.id]);
    ensure(pending.rows[0].count < 5, 409, 'PENDING_ORDER_LIMIT', 'Ya tienes cinco pedidos pendientes');
    const quote = input.fulfillment==='SHIP' ? await approvedShippingQuote(db,actor,input.shippingQuoteId!,input.items) : null;
    const cart = quote ? {items:quote.priced_items,total:quote.goods_minor} : await priceCart(db, actor.company_id, input.items);
    const locationId = quote ? quote.location_id : await storeLocation(db, actor.company_id, input.locationId!);
    const order = await reserveDraft(db, actor, key, hash, 'ONLINE', input.fulfillment, locationId, cart,
      quote ? {quoteId:quote.id,address:quote.address,fee:quote.shipping_minor} : undefined);
    if(quote) {
      const used=await db.query("UPDATE shipping_quotes SET status='USED' WHERE company_id=$1 AND id=$2 AND expires_at>clock_timestamp() RETURNING id",[actor.company_id,quote.id]);
      ensure(used.rowCount,409,'QUOTE_EXPIRED','La cotización venció');
    }
    return { ...await orderResult(db, order), replayed: false };
  });
}

async function recordPayment(db: PoolClient, actor: Actor, order: Order, payment: ManualPayment) {
  ensure(payment.amountMinor === order.total_minor, 409, 'PAYMENT_AMOUNT_MISMATCH', 'El monto no coincide con el pedido');
  if (order.status === 'PAID' || order.status === 'FULFILLED') {
    ensure(order.payment_reference === payment.reference && order.payment_method === payment.method,
      409, 'PAYMENT_CONFLICT', 'El pedido ya tiene otro pago registrado');
    return true;
  }
  ensure(order.status !== 'EXPIRED', 409, 'RESERVATION_EXPIRED', 'La reserva venció; no se registró el pago');
  ensure(order.status === 'RESERVED', 409, 'INVALID_ORDER_STATE', 'El pedido no admite pagos');
  ensure(!await isExpired(db, order), 409, 'RESERVATION_EXPIRED', 'La reserva venció; no se registró el pago');
  const usedReference = await db.query('SELECT 1 FROM orders WHERE company_id=$1 AND payment_reference=$2', [order.company_id, payment.reference]);
  ensure(!usedReference.rowCount, 409, 'PAYMENT_REFERENCE_USED', 'La referencia pertenece a otro pedido');
  await settleReservedOrder(db,order,{source:'MANUAL',method:payment.method,reference:payment.reference,actorId:actor.id});
  return false;
}

export async function confirmManualPayment(pool: Pool, actor: Actor, id: string, raw: unknown) {
  staff(actor);
  const payment = manualPaymentSchema.parse(raw);
  return orderTransaction(pool, actor, async db => {
    const order = await findOrder(db, actor.company_id, id);
    await orderAccess(db, actor, order);
    const replayed = await recordPayment(db, actor, order, payment);
    return { ...await orderResult(db, await findOrder(db, actor.company_id, id)), replayed };
  });
}

export async function cancelOrder(pool: Pool, actor: Actor, id: string, raw: unknown) {
  const { reason } = cancelOrderSchema.parse(raw);
  return orderTransaction(pool, actor, async db => {
    const order = await findOrder(db, actor.company_id, id);
    await orderAccess(db, actor, order);
    if (order.status === 'CANCELLED') {
      ensure(order.cancellation_reason === reason, 409, 'CANCELLATION_CONFLICT', 'El pedido ya tiene otra cancelación registrada');
      return { ...await orderResult(db, order), replayed: true };
    }
    ensure(order.status === 'RESERVED', 409, 'INVALID_ORDER_STATE', 'Solo se pueden cancelar pedidos con reserva pendiente');
    ensure(!await isExpired(db, order), 409, 'RESERVATION_EXPIRED', 'La reserva ya venció');
    await releaseReservation(db, order, 'CANCELLED', actor.id, reason);
    return { ...await orderResult(db, await findOrder(db, actor.company_id, id)), replayed: false };
  });
}

async function completeOrder(db: PoolClient, actor: Actor, order: Order) {
  if (order.status === 'FULFILLED') return true;
  ensure(order.status === 'PAID', 409, 'PAYMENT_REQUIRED', 'El pedido debe estar pagado antes de entregar o despachar');
  const refunds=await db.query(`SELECT 1 FROM refunds r LEFT JOIN payment_captures c ON c.company_id=r.company_id AND c.id=r.capture_id
    WHERE r.company_id=$1 AND r.order_id=$2 AND (r.capture_id IS NULL OR c.disposition='APPLIED') LIMIT 1`,[order.company_id,order.id]);
  ensure(!refunds.rowCount,409,'REFUNDED_ORDER','El pago del pedido tiene reembolsos; requiere resolver la entrega');
  const withdrawn=await db.query("SELECT 1 FROM return_receipts WHERE company_id=$1 AND order_id=$2 AND kind='WITHDRAWAL' LIMIT 1",[order.company_id,order.id]);
  ensure(!withdrawn.rowCount,409,'WITHDRAWN_ORDER','El stock del pedido ya fue revertido');
  await db.query(`UPDATE orders SET status='FULFILLED',fulfilled_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE company_id=$1 AND id=$2`, [order.company_id, order.id]);
  const reason = order.fulfillment === 'SHIP' ? 'Pedido despachado' : 'Pedido entregado al cliente';
  await event(db, order, 'FULFILLED', actor.id, reason);
  return false;
}

export async function fulfillOrder(pool: Pool, actor: Actor, id: string) {
  staff(actor);
  return orderTransaction(pool, actor, async db => {
    const order = await findOrder(db, actor.company_id, id);
    await orderAccess(db, actor, order);
    const replayed = await completeOrder(db, actor, order);
    return { ...await orderResult(db, await findOrder(db, actor.company_id, id)), replayed };
  });
}

export async function createLocalSale(pool: Pool, actor: Actor, key: string, raw: unknown) {
  staff(actor); idempotencyKey(key);
  const input = localSaleSchema.parse(raw);
  input.items.sort((a, b) => a.productId.localeCompare(b.productId));
  const hash = digest(JSON.stringify({ actor: actor.id, channel: 'LOCAL', ...input }));
  return orderTransaction(pool, actor, async db => {
    const previous = await replay(db, actor, key, hash);
    if (previous) return previous;
    await locationAccess(db, actor, input.locationId);
    await storeLocation(db, actor.company_id, input.locationId);
    const cart = await priceCart(db, actor.company_id, input.items);
    const order = await reserveDraft(db, actor, key, hash, 'LOCAL', 'LOCAL', input.locationId, cart);
    await recordPayment(db, actor, order, input.payment);
    await completeOrder(db, actor, await findOrder(db, actor.company_id, order.id));
    return { ...await orderResult(db, await findOrder(db, actor.company_id, order.id)), replayed: false };
  });
}

export async function getOrder(pool: Pool, actor: Actor, id: string) {
  return orderTransaction(pool, actor, async db => {
    const order = await findOrder(db, actor.company_id, id);
    await orderAccess(db, actor, order);
    return orderResult(db, order);
  });
}

export async function listOrders(pool: Pool, actor: Actor, limit = 50, offset = 0) {
  return orderTransaction(pool, actor, async db => {
    const { rows } = await db.query(`SELECT o.id,o.channel,o.fulfillment,o.location_id,o.status,o.currency,
      o.total_minor::text,o.expires_at,o.created_at,o.paid_at,o.fulfilled_at
      FROM orders o WHERE o.company_id=$1 AND (
        $2='OWNER' OR ($2='CUSTOMER' AND o.customer_id=$3) OR ($2='AGENT' AND EXISTS (
          SELECT 1 FROM agent_locations a WHERE a.company_id=o.company_id AND a.user_id=$3 AND a.location_id=o.location_id
        ))) ORDER BY o.created_at DESC,o.id LIMIT $4 OFFSET $5`, [actor.company_id, actor.role, actor.id, limit, offset]);
    return { items: rows, limit, offset };
  });
}

export async function updateOrderSettings(pool: Pool, actor: Actor, raw: unknown) {
  owner(actor);
  const input = orderSettingsSchema.parse(raw);
  return orderTransaction(pool, actor, async db => {
    const before=(await db.query('SELECT reservation_minutes FROM companies WHERE id=$1',[actor.company_id])).rows[0];
    await db.query('UPDATE companies SET reservation_minutes=$2 WHERE id=$1', [actor.company_id, input.reservationMinutes]);
    if(before.reservation_minutes!==input.reservationMinutes)await audit(db,actor,'ORDER_SETTINGS_UPDATED',actor.company_id,{before,after:{reservation_minutes:input.reservationMinutes}});
    return input;
  });
}
