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
import {chileDestinationKey, findChileRegion} from '../catalog/chile-destinations';
export const placeKey=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const rateSchema=z.object({city:z.string().trim().min(2).max(100),region:z.string().trim().min(2).max(100),feeMinor:z.string().regex(/^(0|[1-9][0-9]{0,12})$/).refine(v=>BigInt(v)<=1000000000000n),active:z.boolean().default(true),deliveryDaysMin:z.number().int().min(0).max(60).nullable().default(null),deliveryDaysMax:z.number().int().min(0).max(60).nullable().default(null)}).strict().refine(v=>(v.deliveryDaysMin===null)===(v.deliveryDaysMax===null)&&(v.deliveryDaysMin===null||v.deliveryDaysMax!==null&&v.deliveryDaysMin<=v.deliveryDaysMax),{message:'Indica el plazo mínimo y máximo, y que el mínimo no supere al máximo'});
export async function listShippingRates(pool:Pool,actor:Actor){owner(actor);return stockTransaction(pool,actor,async db=>({items:(await db.query('SELECT id,city,region,fee_minor::text,active,delivery_days_min,delivery_days_max FROM shipping_rates WHERE company_id=$1 ORDER BY region,city',[actor.company_id])).rows}));}
export async function saveShippingRate(pool:Pool,actor:Actor,id:string|null,raw:unknown){
 owner(actor);const input=rateSchema.parse(raw);return stockTransaction(pool,actor,async db=>{
  const {rows:existing}=await db.query<{id:string;city:string;region:string}>('SELECT id,city,region FROM shipping_rates WHERE company_id=$1',[actor.company_id]);
  const previous=existing.find(rate=>rate.id===id);
  if(id)ensure(previous,404,'RATE_NOT_FOUND','Tarifa inexistente');
  const destination=chileDestinationKey(input.region,input.city);
  const sameDestination=previous&&chileDestinationKey(previous.region,previous.city)===destination;
  if(sameDestination){
    input.region=previous.region;
    input.city=previous.city;
  }else{
    const region=findChileRegion(input.region);
    const commune=region?.communes.find(name=>chileDestinationKey(region.name,name)===destination);
    ensure(region&&commune,400,'INVALID_DESTINATION','Selecciona una comuna de la región elegida.');
    ensure(!existing.some(rate=>chileDestinationKey(rate.region,rate.city)===destination),409,'DUPLICATE_DESTINATION','Ya existe una tarifa para esta comuna. Edita esa tarifa.');
    input.region=region.name;
    input.city=commune;
  }
  const result=id?await db.query('UPDATE shipping_rates SET city=$3,region=$4,city_key=$5,region_key=$6,fee_minor=$7,active=$8,delivery_days_min=$9,delivery_days_max=$10,updated_at=clock_timestamp() WHERE company_id=$1 AND id=$2 RETURNING id,city,region,fee_minor::text,active,delivery_days_min,delivery_days_max',[actor.company_id,id,input.city,input.region,placeKey(input.city),placeKey(input.region),input.feeMinor,input.active,input.deliveryDaysMin,input.deliveryDaysMax]):await db.query('INSERT INTO shipping_rates(id,company_id,city,region,city_key,region_key,fee_minor,active,delivery_days_min,delivery_days_max) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,city,region,fee_minor::text,active,delivery_days_min,delivery_days_max',[randomUUID(),actor.company_id,input.city,input.region,placeKey(input.city),placeKey(input.region),input.feeMinor,input.active,input.deliveryDaysMin,input.deliveryDaysMax]);
  await audit(db,actor,'SHIPPING_RATE_UPDATED',result.rows[0].id,{city:input.city,region:input.region,feeMinor:input.feeMinor,active:input.active,deliveryDaysMin:input.deliveryDaysMin,deliveryDaysMax:input.deliveryDaysMax});return result.rows[0];
 });
}
export async function automaticDelivery(db:PoolClient,companyId:string,rateId:string,items:z.infer<typeof itemsSchema>,address?:ShippingAddress){
 const rate=(await db.query('SELECT id,city,region,city_key,region_key,fee_minor::text,delivery_days_min,delivery_days_max FROM shipping_rates WHERE company_id=$1 AND id=$2 AND active',[companyId,rateId])).rows[0];
 ensure(rate,409,'DESTINATION_UNAVAILABLE','No hay cobertura para el destino seleccionado');
 if(address)ensure(chileDestinationKey(address.region,address.commune)===chileDestinationKey(rate.region,rate.city),400,'ADDRESS_RATE_MISMATCH','La dirección no coincide con la ciudad y región seleccionadas');
 const cart=await priceCart(db,companyId,items);const locationId=await shippingLocation(db,companyId,items);
 const total=(BigInt(cart.total)+BigInt(rate.fee_minor)).toString();ensure(BigInt(total)<=1000000000000000n,400,'ORDER_TOTAL_LIMIT','El total supera el límite');
 return {rate,cart,locationId,total};
}
export async function publicDeliveryRates(pool:Pool,slug:string){
 const company=(await pool.query('SELECT id FROM companies WHERE slug=$1',[slug])).rows[0];ensure(company,404,'COMPANY_NOT_FOUND','Tienda inexistente');
 return {items:(await pool.query('SELECT id,city,region,fee_minor::text,delivery_days_min,delivery_days_max FROM shipping_rates WHERE company_id=$1 AND active ORDER BY region,city',[company.id])).rows};
}
export async function deliveryEstimate(pool:Pool,slug:string,raw:unknown){
 const input=z.object({rateId:uuid,items:itemsSchema}).strict().parse(raw);
 return transaction(pool,async db=>{
  const company=(await db.query('SELECT id FROM companies WHERE slug=$1',[slug])).rows[0];ensure(company,404,'COMPANY_NOT_FOUND','Tienda inexistente');
  const result=await automaticDelivery(db,company.id,input.rateId,input.items);
  return {rateId:result.rate.id,city:result.rate.city,region:result.rate.region,goodsMinor:result.cart.total,shippingMinor:result.rate.fee_minor,totalMinor:result.total,deliveryDaysMin:result.rate.delivery_days_min,deliveryDaysMax:result.rate.delivery_days_max};
 });
}
