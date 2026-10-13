import type { Pool } from 'pg';
import { staff, type Actor } from './auth';
import { ensure } from './errors';
import { expireCompanyReservations } from './reservations';

export async function publicCatalog(pool: Pool, slug: string, limit=50, offset=0) {
  const company=await pool.query('SELECT id,name,slug FROM companies WHERE slug=$1',[slug]);
  ensure(company.rows[0],404,'COMPANY_NOT_FOUND','Tienda inexistente');
  await expireCompanyReservations(pool,company.rows[0].id);
  const products=await pool.query(`SELECT p.id,p.sku,p.name,p.description,p.price_minor::text,p.currency,p.image_url,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('locationId',l.id,'name',l.name,'kind',l.kind,
      'shippingEnabled',l.shipping_enabled,'available',COALESCE(s.on_hand-s.reserved,0)) ORDER BY l.name)
      FROM locations l LEFT JOIN stock s ON s.company_id=l.company_id AND s.location_id=l.id AND s.product_id=p.id
      WHERE l.company_id=p.company_id AND l.active),'[]'::jsonb) AS availability
    FROM products p WHERE p.company_id=$1 AND p.active ORDER BY p.name,p.id LIMIT $2 OFFSET $3`,[company.rows[0].id,limit,offset]);
  return {company:company.rows[0],products:products.rows,limit,offset};
}
export async function inventory(pool: Pool, actor: Actor, limit=50, offset=0) {
  staff(actor);
  await expireCompanyReservations(pool,actor.company_id);
  const {rows}=await pool.query(`SELECT s.product_id,p.sku,p.name AS product_name,s.location_id,l.name AS location_name,
    s.on_hand,s.reserved,s.on_hand-s.reserved AS available,s.updated_at
    FROM stock s JOIN products p ON p.company_id=s.company_id AND p.id=s.product_id
    JOIN locations l ON l.company_id=s.company_id AND l.id=s.location_id
    WHERE s.company_id=$1 AND ($2='OWNER' OR EXISTS(SELECT 1 FROM agent_locations a WHERE a.company_id=s.company_id AND a.user_id=$3 AND a.location_id=s.location_id))
    ORDER BY p.name,s.product_id,l.name LIMIT $4 OFFSET $5`,[actor.company_id,actor.role,actor.id,limit,offset]);
  return {items:rows,limit,offset};
}
export async function inventoryMatrix(pool:Pool,actor:Actor,limit=50,offset=0) {
  staff(actor);
  await expireCompanyReservations(pool,actor.company_id);
  const {rows}=await pool.query(`WITH page AS (
    SELECT id,sku,name FROM products WHERE company_id=$1 ORDER BY name,id LIMIT $4 OFFSET $5
  ) SELECT p.id AS product_id,p.sku,p.name AS product_name,l.id AS location_id,l.name AS location_name,
    COALESCE(s.on_hand,0) AS on_hand,COALESCE(s.reserved,0) AS reserved,
    COALESCE(s.on_hand-s.reserved,0) AS available
    FROM page p CROSS JOIN locations l
    LEFT JOIN stock s ON s.company_id=l.company_id AND s.product_id=p.id AND s.location_id=l.id
    WHERE l.company_id=$1 AND ($2='OWNER' OR EXISTS (
      SELECT 1 FROM agent_locations a WHERE a.company_id=l.company_id AND a.user_id=$3 AND a.location_id=l.id))
    ORDER BY p.name,p.id,l.name,l.id`,[actor.company_id,actor.role,actor.id,limit,offset]);
  return {items:rows,productCount:new Set(rows.map(row=>row.product_id)).size,limit,offset};
}
export async function history(pool: Pool,actor: Actor,limit=50,offset=0) {
  staff(actor);
  const {rows}=await pool.query(`SELECT m.id,m.operation_id,m.product_id,m.location_id,m.delta,m.on_hand_after,m.created_at,
    o.kind,o.reason,o.actor_id,p.sku,l.name AS location_name
    FROM stock_movements m JOIN inventory_operations o ON o.company_id=m.company_id AND o.id=m.operation_id
    JOIN products p ON p.company_id=m.company_id AND p.id=m.product_id JOIN locations l ON l.company_id=m.company_id AND l.id=m.location_id
    WHERE m.company_id=$1 AND ($2='OWNER' OR EXISTS(SELECT 1 FROM agent_locations a WHERE a.company_id=m.company_id AND a.user_id=$3 AND a.location_id=m.location_id))
    ORDER BY m.created_at DESC,m.id LIMIT $4 OFFSET $5`,[actor.company_id,actor.role,actor.id,limit,offset]);
  return {items:rows,limit,offset};
}
