import type { PoolClient } from 'pg';
import { ensure } from './errors';
import type { CartItem } from './order-schemas';

export type PricedItem = CartItem & { sku: string; name: string; unitPrice: string; lineTotal: string };
export type PricedCart = { items: PricedItem[]; total: string };

export async function priceCart(db: PoolClient, companyId: string, items: CartItem[]): Promise<PricedCart> {
  const { rows } = await db.query<{ id: string; sku: string; name: string; price_minor: string }>(
    'SELECT id,sku,name,price_minor::text FROM products WHERE company_id=$1 AND id=ANY($2::uuid[]) AND active',
    [companyId, items.map(item => item.productId)]);
  ensure(rows.length === items.length, 404, 'PRODUCT_NOT_FOUND', 'Uno o más productos no están disponibles');
  const products = new Map(rows.map(product => [product.id, product]));
  let total = 0n;
  const priced = items.map(item => {
    const product = products.get(item.productId)!;
    const lineTotal = BigInt(product.price_minor) * BigInt(item.quantity);
    total += lineTotal;
    return { ...item, sku: product.sku, name: product.name, unitPrice: product.price_minor, lineTotal: lineTotal.toString() };
  });
  ensure(total <= 1000000000000000n, 400, 'ORDER_TOTAL_LIMIT', 'El monto excede el límite');
  return { items: priced, total: total.toString() };
}

export async function shippingLocation(db: PoolClient, companyId: string, items: CartItem[]) {
  const { rows } = await db.query<{ id: string }>(`WITH requested AS (
    SELECT * FROM unnest($2::uuid[], $3::integer[]) AS r(product_id,quantity)
  ) SELECT l.id FROM locations l WHERE l.company_id=$1 AND l.active
    AND (l.kind='WEB' OR (l.kind='STORE' AND l.shipping_enabled))
    AND NOT EXISTS (
      SELECT 1 FROM requested r LEFT JOIN stock s ON s.company_id=l.company_id
        AND s.location_id=l.id AND s.product_id=r.product_id
      WHERE COALESCE(s.on_hand-s.reserved,0) < r.quantity
    ) ORDER BY CASE WHEN l.kind='WEB' THEN 0 ELSE 1 END,l.name,l.id LIMIT 1`,
    [companyId, items.map(item => item.productId), items.map(item => item.quantity)]);
  ensure(rows[0], 409, 'FULFILLMENT_UNAVAILABLE', 'Ninguna ubicación habilitada puede completar el envío');
  return rows[0].id;
}

export async function eligibleShippingLocation(db: PoolClient, companyId: string, id: string) {
  const result = await db.query(`SELECT 1 FROM locations WHERE company_id=$1 AND id=$2 AND active
    AND (kind='WEB' OR (kind='STORE' AND shipping_enabled))`, [companyId, id]);
  ensure(result.rowCount, 409, 'SHIPPING_DISABLED', 'La ubicación ya no está habilitada para envíos');
}
