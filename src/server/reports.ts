import type {Pool} from 'pg';
import {z} from 'zod';
import {staff,type Actor} from './auth';
import {stockTransaction} from './stock-transaction';
import {ensure} from './errors';
export async function businessReport(pool:Pool,actor:Actor,raw:unknown){
 staff(actor);const input=z.object({from:z.iso.date(),to:z.iso.date(),threshold:z.coerce.number().int().min(0).max(1000000).default(5)}).strict().parse(raw);
 ensure(input.from<=input.to&&Date.parse(input.to)-Date.parse(input.from)<=366*86400000,400,'INVALID_PERIOD','Selecciona un período de hasta 366 días');
 return stockTransaction(pool,actor,async db=>{
 const args=[actor.company_id,actor.role,actor.id,input.from,input.to];
 const sales=await db.query(`SELECT l.id,l.name,
  (SELECT count(*)::int FROM orders o WHERE o.company_id=l.company_id AND o.location_id=l.id AND o.paid_at IS NOT NULL AND (o.paid_at AT TIME ZONE 'America/Santiago')::date BETWEEN $4::date AND $5::date) AS orders,
  (SELECT coalesce(sum(o.total_minor),0)::text FROM orders o WHERE o.company_id=l.company_id AND o.location_id=l.id AND o.paid_at IS NOT NULL AND (o.paid_at AT TIME ZONE 'America/Santiago')::date BETWEEN $4::date AND $5::date) AS gross,
  (SELECT coalesce(sum(r.amount_minor),0)::text FROM refunds r JOIN orders o ON o.company_id=r.company_id AND o.id=r.order_id LEFT JOIN payment_captures c ON c.company_id=r.company_id AND c.id=r.capture_id WHERE r.company_id=l.company_id AND o.location_id=l.id AND (r.capture_id IS NULL OR c.disposition='APPLIED') AND (r.created_at AT TIME ZONE 'America/Santiago')::date BETWEEN $4::date AND $5::date) AS refunds
 FROM locations l WHERE l.company_id=$1 AND ($2='OWNER' OR EXISTS(SELECT 1 FROM agent_locations a WHERE a.company_id=l.company_id AND a.location_id=l.id AND a.user_id=$3)) ORDER BY l.name`,args);
 const low=await db.query(`SELECT p.id,p.sku,p.name,l.name AS location,coalesce(s.on_hand-s.reserved,0) AS available FROM products p JOIN locations l ON l.company_id=p.company_id LEFT JOIN stock s ON s.company_id=p.company_id AND s.product_id=p.id AND s.location_id=l.id WHERE p.company_id=$1 AND p.active AND l.active AND coalesce(s.on_hand-s.reserved,0)<=$4 AND ($2='OWNER' OR EXISTS(SELECT 1 FROM agent_locations a WHERE a.company_id=l.company_id AND a.location_id=l.id AND a.user_id=$3)) ORDER BY available,p.name,l.name LIMIT 101`,[actor.company_id,actor.role,actor.id,input.threshold]);
 return {period:input,timezone:'America/Santiago',sales:sales.rows,lowStock:low.rows.slice(0,100),moreLowStock:low.rows.length>100};
 });
}
