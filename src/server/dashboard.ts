import type {Pool} from 'pg';
import {staff,type Actor} from './auth';
import {z} from 'zod';
import {stockTransaction} from './stock-transaction';

const alertQuery = z.object({
 status: z.enum(['all', 'empty', 'low']).default('all'),
 locationId: z.string().uuid().or(z.literal('')).default(''),
 offset: z.coerce.number().int().min(0).max(2147483647).default(0),
});

export async function dashboardSummary(pool:Pool,actor:Actor,raw:unknown={}){
  const filters = alertQuery.parse(raw);
  staff(actor);
  return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query(`WITH visible AS (
      SELECT l.id,l.name,l.active FROM locations l WHERE l.company_id=$1 AND ($2='OWNER' OR EXISTS (
        SELECT 1 FROM agent_locations a WHERE a.company_id=l.company_id AND a.location_id=l.id AND a.user_id=$3))
    ), today AS (SELECT (clock_timestamp() AT TIME ZONE 'America/Santiago')::date AS day),
    alerts AS (
      SELECT p.id AS product_id,p.sku,p.name,l.id AS location_id,l.name AS location,p.minimum_stock,COALESCE(s.on_hand,0) AS physical,COALESCE(s.reserved,0) AS reserved,COALESCE(s.on_hand-s.reserved,0) AS available
      FROM products p JOIN locations l ON l.company_id=p.company_id AND l.id IN(SELECT id FROM visible)
      LEFT JOIN stock s ON s.company_id=p.company_id AND s.product_id=p.id AND s.location_id=l.id
      WHERE p.company_id=$1 AND p.active AND l.active AND COALESCE(s.on_hand-s.reserved,0)<=p.minimum_stock
    ), filtered AS (
      SELECT * FROM alerts WHERE ($4='all' OR ($4='empty' AND available=0) OR ($4='low' AND available>0))
        AND ($5::uuid IS NULL OR location_id=$5::uuid)
    ), fulfillment_pending AS (
      SELECT o.fulfillment FROM orders o
      WHERE o.company_id=$1 AND o.location_id IN(SELECT id FROM visible)
        AND o.status='PAID' AND o.fulfillment IN ('PICKUP','SHIP')
        AND NOT EXISTS(SELECT 1 FROM return_receipts r WHERE r.company_id=o.company_id AND r.order_id=o.id AND r.kind='WITHDRAWAL')
        AND NOT EXISTS(SELECT 1 FROM refunds r LEFT JOIN payment_captures cap ON cap.company_id=r.company_id AND cap.id=r.capture_id
          WHERE r.company_id=o.company_id AND r.order_id=o.id AND (r.capture_id IS NULL OR cap.disposition='APPLIED'))
    ) SELECT c.name AS company,(SELECT day::text FROM today) AS date,
      (SELECT count(*)::int FROM orders o WHERE o.company_id=$1 AND o.location_id IN(SELECT id FROM visible)
        AND (o.paid_at AT TIME ZONE 'America/Santiago')::date=(SELECT day FROM today)) AS sales_count,
      (SELECT COALESCE(sum(o.total_minor),0)::text FROM orders o WHERE o.company_id=$1 AND o.location_id IN(SELECT id FROM visible)
        AND (o.paid_at AT TIME ZONE 'America/Santiago')::date=(SELECT day FROM today)) AS sales_minor,
      (SELECT COALESCE(sum(o.total_minor),0)::text FROM orders o WHERE o.company_id=$1 AND o.location_id IN(SELECT id FROM visible)
        AND (o.paid_at AT TIME ZONE 'America/Santiago')::date=(SELECT day-1 FROM today)) AS yesterday_sales_minor,
      (SELECT count(*)::int FROM fulfillment_pending) AS awaiting_delivery,
      (SELECT count(*)::int FROM fulfillment_pending WHERE fulfillment='PICKUP') AS awaiting_pickup,
      (SELECT count(*)::int FROM fulfillment_pending WHERE fulfillment='SHIP') AS awaiting_shipments,
      (SELECT count(*)::int FROM shipping_quotes q WHERE q.company_id=$1 AND q.location_id IN(SELECT id FROM visible) AND q.status='REQUESTED') AS awaiting_quotes,
      (SELECT count(*)::int FROM alerts) AS low_stock_count,
      (SELECT count(*)::int FROM alerts WHERE available=0) AS empty_stock_count,
      (SELECT count(*)::int FROM filtered) AS filtered_count,
      (SELECT count(*)::int FROM stock s
        JOIN products p ON p.company_id=s.company_id AND p.id=s.product_id AND p.active
        JOIN visible v ON v.id=s.location_id AND v.active
        WHERE s.company_id=$1 AND s.on_hand>s.reserved
        AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.company_id=$1
          AND m.product_id=s.product_id AND m.location_id=s.location_id
          AND m.created_at>=now()-interval '30 days')) AS inactive_stock_count,
      COALESCE((SELECT jsonb_agg(v ORDER BY v.name,v.id) FROM visible v WHERE v.active),'[]'::jsonb) AS alert_locations,
      COALESCE((SELECT jsonb_agg(a ORDER BY a.available,a.name,a.location,a.product_id,a.location_id) FROM (
        SELECT * FROM filtered ORDER BY available,name,location,product_id,location_id LIMIT 8 OFFSET $6
      ) a),'[]'::jsonb) AS alerts
      FROM companies c WHERE c.id=$1`,[actor.company_id,actor.role,actor.id,filters.status,filters.locationId||null,filters.offset]);
    return {...rows[0],timezone:'America/Santiago'};
  });
}
