import type {Pool} from 'pg';
import {staff,type Actor} from './auth';
import {stockTransaction} from './stock-transaction';

export async function dashboardSummary(pool:Pool,actor:Actor){
  staff(actor);
  return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query(`WITH visible AS (
      SELECT l.id FROM locations l WHERE l.company_id=$1 AND ($2='OWNER' OR EXISTS (
        SELECT 1 FROM agent_locations a WHERE a.company_id=l.company_id AND a.location_id=l.id AND a.user_id=$3))
    ), today AS (SELECT (clock_timestamp() AT TIME ZONE 'America/Santiago')::date AS day),
    alerts AS (
      SELECT p.sku,p.name,l.id AS location_id,l.name AS location,COALESCE(s.on_hand-s.reserved,0) AS available
      FROM products p JOIN locations l ON l.company_id=p.company_id AND l.id IN(SELECT id FROM visible)
      LEFT JOIN stock s ON s.company_id=p.company_id AND s.product_id=p.id AND s.location_id=l.id
      WHERE p.company_id=$1 AND p.active AND l.active AND COALESCE(s.on_hand-s.reserved,0)<=5
    ) SELECT c.name AS company,(SELECT day::text FROM today) AS date,
      (SELECT count(*)::int FROM orders o WHERE o.company_id=$1 AND o.location_id IN(SELECT id FROM visible)
        AND (o.paid_at AT TIME ZONE 'America/Santiago')::date=(SELECT day FROM today)) AS sales_count,
      (SELECT COALESCE(sum(o.total_minor),0)::text FROM orders o WHERE o.company_id=$1 AND o.location_id IN(SELECT id FROM visible)
        AND (o.paid_at AT TIME ZONE 'America/Santiago')::date=(SELECT day FROM today)) AS sales_minor,
      (SELECT count(*)::int FROM orders o WHERE o.company_id=$1 AND o.location_id IN(SELECT id FROM visible) AND o.status='PAID'
        AND NOT EXISTS(SELECT 1 FROM return_receipts r WHERE r.company_id=o.company_id AND r.order_id=o.id AND r.kind='WITHDRAWAL')
        AND NOT EXISTS(SELECT 1 FROM refunds r LEFT JOIN payment_captures cap ON cap.company_id=r.company_id AND cap.id=r.capture_id
          WHERE r.company_id=o.company_id AND r.order_id=o.id AND (r.capture_id IS NULL OR cap.disposition='APPLIED'))) AS awaiting_delivery,
      (SELECT count(*)::int FROM orders o WHERE o.company_id=$1 AND o.location_id IN(SELECT id FROM visible) AND o.fulfillment='SHIP' AND o.status='PAID' AND NOT EXISTS(SELECT 1 FROM refunds r LEFT JOIN payment_captures c ON c.company_id=r.company_id AND c.id=r.capture_id WHERE r.company_id=o.company_id AND r.order_id=o.id AND (r.capture_id IS NULL OR c.disposition='APPLIED')) AND NOT EXISTS(SELECT 1 FROM return_receipts r WHERE r.company_id=o.company_id AND r.order_id=o.id AND r.kind='WITHDRAWAL')) AS awaiting_shipments,
      (SELECT count(*)::int FROM shipping_quotes q WHERE q.company_id=$1 AND q.location_id IN(SELECT id FROM visible) AND q.status='REQUESTED') AS awaiting_quotes,
      (SELECT count(*)::int FROM alerts) AS low_stock_count,
      (SELECT count(*)::int FROM alerts WHERE available=0) AS empty_stock_count,
      COALESCE((SELECT jsonb_agg(a) FROM (SELECT * FROM alerts ORDER BY available,name,location LIMIT 5) a),'[]'::jsonb) AS alerts
      FROM companies c WHERE c.id=$1`,[actor.company_id,actor.role,actor.id]);
    return {...rows[0],timezone:'America/Santiago'};
  });
}
