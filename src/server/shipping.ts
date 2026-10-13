import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { digest, staff, type Actor } from './auth';
import { priceCart, shippingLocation, eligibleShippingLocation, type PricedItem } from './checkout';
import { ensure } from './errors';
import { stockTransaction } from './stock-transaction';
import { quoteApprovalSchema, quoteRejectionSchema, quoteRequestSchema, type ShippingAddress } from './shipping-schemas';
import type { CartItem } from './order-schemas';

type Quote = {
  id: string; company_id: string; customer_id: string; location_id: string;
  address: ShippingAddress; status: 'REQUESTED'|'APPROVED'|'REJECTED'|'USED'|'EXPIRED';
  shipping_minor: string|null; goods_minor: string|null; priced_items: PricedItem[]|null;
  approved_by: string|null; approved_at: Date|null; expires_at: Date|null;
  note: string|null; created_at: Date;
};
async function findQuote(db: PoolClient, companyId: string, id: string) {
  const { rows } = await db.query<Quote>(`SELECT id,company_id,customer_id,location_id,address,status,
    shipping_minor::text,goods_minor::text,priced_items,approved_by,approved_at,expires_at,note,created_at
    FROM shipping_quotes WHERE company_id=$1 AND id=$2`, [companyId, id]);
  ensure(rows[0], 404, 'QUOTE_NOT_FOUND', 'Cotización inexistente');
  return rows[0];
}
async function access(db: PoolClient, actor: Actor, quote: Quote) {
  if (actor.role==='CUSTOMER') ensure(quote.customer_id===actor.id,404,'QUOTE_NOT_FOUND','Cotización inexistente');
  if (actor.role==='AGENT') {
    const permission=await db.query('SELECT 1 FROM agent_locations WHERE company_id=$1 AND user_id=$2 AND location_id=$3',[actor.company_id,actor.id,quote.location_id]);
    ensure(permission.rowCount,404,'QUOTE_NOT_FOUND','Cotización inexistente');
  }
}
async function items(db: PoolClient, quote: Quote) {
  const {rows}=await db.query<{product_id:string;quantity:number}>(`SELECT product_id,quantity FROM shipping_quote_items
    WHERE company_id=$1 AND quote_id=$2 ORDER BY product_id`,[quote.company_id,quote.id]);
  return rows.map(row=>({productId:row.product_id,quantity:row.quantity}));
}
async function result(db: PoolClient, quote: Quote) {
  const details=await db.query(`SELECT i.product_id AS "productId",p.sku,p.name,i.quantity,
    p.price_minor::text AS "unitPrice",(p.price_minor*i.quantity)::text AS "lineTotal"
    FROM shipping_quote_items i JOIN products p ON p.company_id=i.company_id AND p.id=i.product_id
    WHERE i.company_id=$1 AND i.quote_id=$2 ORDER BY i.product_id`,[quote.company_id,quote.id]);
  return {...quote,items:await items(db,quote),itemDetails:details.rows};
}

export async function requestShippingQuote(pool: Pool, actor: Actor, key: string, raw: unknown) {
  ensure(actor.role==='CUSTOMER',403,'CUSTOMER_REQUIRED','Requiere una cuenta de cliente');
  ensure(/^[A-Za-z0-9_-]{8,128}$/.test(key),400,'INVALID_IDEMPOTENCY_KEY','Idempotency-Key inválida');
  const input=quoteRequestSchema.parse(raw); input.items.sort((a,b)=>a.productId.localeCompare(b.productId));
  const hash=digest(JSON.stringify({actor:actor.id,...input}));
  return stockTransaction(pool,actor,async db=>{
    const previous=await db.query<{id:string;request_hash:string}>('SELECT id,request_hash FROM shipping_quotes WHERE company_id=$1 AND idempotency_key=$2',[actor.company_id,key]);
    if(previous.rows[0]) {
      ensure(previous.rows[0].request_hash===hash,409,'IDEMPOTENCY_CONFLICT','Clave utilizada con otros datos');
      return {...await result(db,await findQuote(db,actor.company_id,previous.rows[0].id)),replayed:true};
    }
    const pending=await db.query<{count:number}>("SELECT count(*)::integer AS count FROM shipping_quotes WHERE company_id=$1 AND customer_id=$2 AND status IN ('REQUESTED','APPROVED')",[actor.company_id,actor.id]);
    ensure(pending.rows[0].count<5,409,'PENDING_QUOTE_LIMIT','Ya tienes cinco cotizaciones pendientes');
    await priceCart(db,actor.company_id,input.items);
    const locationId=await shippingLocation(db,actor.company_id,input.items);
    const id=randomUUID();
    await db.query('INSERT INTO shipping_quotes(id,company_id,customer_id,location_id,address,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,actor.company_id,actor.id,locationId,JSON.stringify(input.address),key,hash]);
    for(const item of input.items) await db.query('INSERT INTO shipping_quote_items(company_id,quote_id,product_id,quantity) VALUES($1,$2,$3,$4)',[actor.company_id,id,item.productId,item.quantity]);
    return {...await result(db,await findQuote(db,actor.company_id,id)),replayed:false};
  });
}

export async function approveShippingQuote(pool: Pool, actor: Actor, id: string, raw: unknown) {
  staff(actor);const input=quoteApprovalSchema.parse(raw);
  return stockTransaction(pool,actor,async db=>{
    const quote=await findQuote(db,actor.company_id,id);await access(db,actor,quote);
    if(quote.status==='APPROVED'||quote.status==='USED') {
      ensure(quote.shipping_minor===input.shippingMinor&&quote.note===input.note,409,'QUOTE_CONFLICT','Cotización ya aprobada con otros datos');
      return {...await result(db,quote),replayed:true};
    }
    ensure(quote.status==='REQUESTED',409,'INVALID_QUOTE_STATE','La cotización no admite aprobación');
    await eligibleShippingLocation(db,actor.company_id,quote.location_id);
    const cart=await priceCart(db,actor.company_id,await items(db,quote));
    ensure(BigInt(cart.total)+BigInt(input.shippingMinor)<=1000000000000000n,400,'ORDER_TOTAL_LIMIT','Monto excedido');
    await db.query(`UPDATE shipping_quotes SET status='APPROVED',shipping_minor=$3,goods_minor=$4,priced_items=$5,
      approved_by=$6,approved_at=clock_timestamp(),expires_at=clock_timestamp()+interval '30 minutes',note=$7 WHERE company_id=$1 AND id=$2`,
      [actor.company_id,id,input.shippingMinor,cart.total,JSON.stringify(cart.items),actor.id,input.note]);
    return {...await result(db,await findQuote(db,actor.company_id,id)),replayed:false};
  });
}

export async function rejectShippingQuote(pool: Pool, actor: Actor, id: string, raw: unknown) {
  staff(actor);const {reason}=quoteRejectionSchema.parse(raw);
  return stockTransaction(pool,actor,async db=>{
    const quote=await findQuote(db,actor.company_id,id);await access(db,actor,quote);
    if(quote.status==='REJECTED') {
      ensure(quote.note===reason,409,'QUOTE_CONFLICT','Cotización rechazada con otro motivo');
      return {...await result(db,quote),replayed:true};
    }
    ensure(quote.status==='REQUESTED',409,'INVALID_QUOTE_STATE','La cotización no admite rechazo');
    await db.query("UPDATE shipping_quotes SET status='REJECTED',note=$3 WHERE company_id=$1 AND id=$2",[actor.company_id,id,reason]);
    return {...await result(db,await findQuote(db,actor.company_id,id)),replayed:false};
  });
}

export async function getShippingQuote(pool: Pool, actor: Actor, id: string) {
  return stockTransaction(pool,actor,async db=>{
    const quote=await findQuote(db,actor.company_id,id);await access(db,actor,quote);return result(db,quote);
  });
}
export async function listShippingQuotes(pool: Pool, actor: Actor, limit=50, offset=0) {
  return stockTransaction(pool,actor,async db=>{
    // Address is deliberately omitted from the list; authorized detail exposes it.
    const {rows}=await db.query(`SELECT q.id,q.status,q.location_id,q.shipping_minor::text,q.goods_minor::text,q.expires_at,q.created_at
      FROM shipping_quotes q WHERE company_id=$1 AND ($2='OWNER' OR ($2='CUSTOMER' AND customer_id=$3)
      OR ($2='AGENT' AND EXISTS(SELECT 1 FROM agent_locations a WHERE a.company_id=q.company_id AND a.location_id=q.location_id AND a.user_id=$3)))
      ORDER BY q.created_at DESC,q.id LIMIT $4 OFFSET $5`,[actor.company_id,actor.role,actor.id,limit,offset]);
    return {items:rows,limit,offset};
  });
}

// Caller owns company lock. Consume only after the order and its reservation exist.
export async function approvedShippingQuote(db: PoolClient, actor: Actor, id: string, requested: CartItem[]) {
  const quote=await findQuote(db,actor.company_id,id);
  ensure(quote.customer_id===actor.id,404,'QUOTE_NOT_FOUND','Cotización inexistente');
  ensure(quote.status==='APPROVED',409,'QUOTE_NOT_APPROVED','La cotización debe estar aprobada y sin utilizar');
  const clock=await db.query<{expired:boolean}>('SELECT clock_timestamp()>=$1 AS expired',[quote.expires_at]);
  ensure(!clock.rows[0].expired,409,'QUOTE_EXPIRED','La cotización venció');
  ensure(JSON.stringify(await items(db,quote))===JSON.stringify(requested),409,'QUOTE_CART_MISMATCH','El carrito no coincide con lo cotizado');
  await eligibleShippingLocation(db,actor.company_id,quote.location_id);
  // Price is guaranteed for the quote lifetime, but inactive/deleted products cannot be sold.
  const active=await db.query('SELECT id FROM products WHERE company_id=$1 AND id=ANY($2::uuid[]) AND active',[actor.company_id,requested.map(item=>item.productId)]);
  ensure(active.rowCount===requested.length,404,'PRODUCT_NOT_FOUND','Producto no disponible');
  return quote as Quote & { shipping_minor:string;goods_minor:string;priced_items:PricedItem[] };
}
