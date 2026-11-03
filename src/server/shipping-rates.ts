import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {owner,type Actor} from './auth';
import {stockTransaction} from './stock-transaction';
import {transaction} from './db';
import {ensure} from './errors';
import {audit} from './audit';
import {priceCart,shippingLocation} from './checkout';
import {itemsSchema} from './order-schemas';
import type {ShippingAddress} from './shipping-schemas';
import {uuid} from './schemas';
export const placeKey=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const rateSchema=z.object({city:z.string().trim().min(2).max(100),region:z.string().trim().min(2).max(100),feeMinor:z.string().regex(/^(0|[1-9][0-9]{0,12})$/).refine(v=>BigInt(v)<=1000000000000n),active:z.boolean().default(true)}).strict();
export async function listShippingRates(pool:Pool,actor:Actor){owner(actor);return stockTransaction(pool,actor,async db=>({items:(await db.query('SELECT id,city,region,fee_minor::text,active FROM shipping_rates WHERE company_id=$1 ORDER BY region,city',[actor.company_id])).rows}));}
export async function saveShippingRate(pool:Pool,actor:Actor,id:string|null,raw:unknown){
 owner(actor);const input=rateSchema.parse(raw);return stockTransaction(pool,actor,async db=>{
  if(id)ensure((await db.query('SELECT 1 FROM shipping_rates WHERE company_id=$1 AND id=$2',[actor.company_id,id])).rowCount,404,'RATE_NOT_FOUND','Tarifa inexistente');
  const result=id?await db.query('UPDATE shipping_rates SET city=$3,region=$4,city_key=$5,region_key=$6,fee_minor=$7,active=$8,updated_at=clock_timestamp() WHERE company_id=$1 AND id=$2 RETURNING id,city,region,fee_minor::text,active',[actor.company_id,id,input.city,input.region,placeKey(input.city),placeKey(input.region),input.feeMinor,input.active]):await db.query('INSERT INTO shipping_rates(id,company_id,city,region,city_key,region_key,fee_minor,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,city,region,fee_minor::text,active',[randomUUID(),actor.company_id,input.city,input.region,placeKey(input.city),placeKey(input.region),input.feeMinor,input.active]);
  await audit(db,actor,'SHIPPING_RATE_UPDATED',result.rows[0].id,{city:input.city,region:input.region,feeMinor:input.feeMinor,active:input.active});return result.rows[0];
 });
}
export async function automaticDelivery(db:PoolClient,companyId:string,rateId:string,items:z.infer<typeof itemsSchema>,address?:ShippingAddress){
 const rate=(await db.query('SELECT id,city,region,city_key,region_key,fee_minor::text FROM shipping_rates WHERE company_id=$1 AND id=$2 AND active',[companyId,rateId])).rows[0];
 ensure(rate,409,'DESTINATION_UNAVAILABLE','No hay cobertura para el destino seleccionado');
 if(address)ensure(placeKey(address.commune)===rate.city_key&&placeKey(address.region)===rate.region_key,400,'ADDRESS_RATE_MISMATCH','La dirección no coincide con la ciudad y región seleccionadas');
 const cart=await priceCart(db,companyId,items);const locationId=await shippingLocation(db,companyId,items);
 const total=(BigInt(cart.total)+BigInt(rate.fee_minor)).toString();ensure(BigInt(total)<=1000000000000000n,400,'ORDER_TOTAL_LIMIT','El total supera el límite');
 return {rate,cart,locationId,total};
}
export async function publicDeliveryRates(pool:Pool,slug:string){
 const company=(await pool.query('SELECT id FROM companies WHERE slug=$1',[slug])).rows[0];ensure(company,404,'COMPANY_NOT_FOUND','Tienda inexistente');
 return {items:(await pool.query('SELECT id,city,region,fee_minor::text FROM shipping_rates WHERE company_id=$1 AND active ORDER BY region,city',[company.id])).rows};
}
export async function deliveryEstimate(pool:Pool,slug:string,raw:unknown){
 const input=z.object({rateId:uuid,items:itemsSchema}).strict().parse(raw);
 return transaction(pool,async db=>{
  const company=(await db.query('SELECT id FROM companies WHERE slug=$1',[slug])).rows[0];ensure(company,404,'COMPANY_NOT_FOUND','Tienda inexistente');
  const result=await automaticDelivery(db,company.id,input.rateId,input.items);
  return {rateId:result.rate.id,city:result.rate.city,region:result.rate.region,goodsMinor:result.cart.total,shippingMinor:result.rate.fee_minor,totalMinor:result.total};
 });
}
