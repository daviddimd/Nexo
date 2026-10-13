import {randomUUID} from 'node:crypto';
import type { Pool } from 'pg';
import {audit} from './audit';
import {stockTransaction} from './stock-transaction';
import {owner,staff,locationAccess,hashPassword,type Actor} from './auth';
import {ensure} from './errors';
import {locationSchema,locationPatchSchema,productSchema,productPatchSchema,userSchema} from './schemas';

export async function createProduct(pool:Pool,actor:Actor,raw:unknown) {
  staff(actor); const v=productSchema.parse(raw);
  return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query(`INSERT INTO products(id,company_id,sku,name,description,price_minor,image_url) VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING id,sku,name,description,price_minor::text,currency,image_url,active`,[randomUUID(),actor.company_id,v.sku,v.name,v.description,v.priceMinor,v.imageUrl]);
    return rows[0];
  });
}
export async function patchProduct(pool:Pool,actor:Actor,id:string,raw:unknown) {
  staff(actor);const input=productPatchSchema.parse(raw);
  const columns:Record<string,string>={sku:'sku',name:'name',description:'description',priceMinor:'price_minor',imageUrl:'image_url',active:'active'};
  return stockTransaction(pool,actor,async db=>{
    if(input.active===false) {
      const reserved=await db.query('SELECT 1 FROM stock WHERE company_id=$1 AND product_id=$2 AND reserved>0 LIMIT 1',[actor.company_id,id]);
      ensure(!reserved.rowCount,409,'RESERVATIONS_EXIST','El producto tiene reservas pendientes');
    }
    const entries=Object.entries(input);
    const {rows}=await db.query(`UPDATE products SET ${entries.map(([k],i)=>`${columns[k]}=$${i+3}`).join(',')}${Object.hasOwn(input,'imageUrl')?',image_data=NULL':''}
      WHERE company_id=$1 AND id=$2 RETURNING id,sku,name,description,price_minor::text,currency,image_url,active`,[actor.company_id,id,...entries.map(([,v])=>v)]);
    ensure(rows[0],404,'PRODUCT_NOT_FOUND','Producto inexistente'); return rows[0];
  });
}
export async function createLocation(pool:Pool,actor:Actor,raw:unknown) {
  owner(actor);const v=locationSchema.parse(raw);
  return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query(`INSERT INTO locations(id,company_id,name,kind,shipping_enabled) VALUES($1,$2,$3,$4,$5) RETURNING *`,[randomUUID(),actor.company_id,v.name,v.kind,v.shippingEnabled]);
    await audit(db,actor,'LOCATION_CREATED',rows[0].id,{name:v.name,kind:v.kind,shippingEnabled:v.shippingEnabled});
    return rows[0];
  });
}
export async function patchLocation(pool:Pool,actor:Actor,id:string,raw:unknown) {
  staff(actor);const v=locationPatchSchema.parse(raw);
  if(actor.role!=='OWNER') ensure(Object.keys(v).every(k=>k==='shippingEnabled'),403,'FORBIDDEN','Solo puedes cambiar la habilitación de envíos');
  return stockTransaction(pool,actor,async db=>{
    // Owner can reactivate an inactive location; agents must have an active assignment.
    if(actor.role!=='OWNER') await locationAccess(db,actor,id);
    if(v.active===false) {
      const reserved=await db.query('SELECT 1 FROM stock WHERE company_id=$1 AND location_id=$2 AND reserved>0 LIMIT 1',[actor.company_id,id]);
      ensure(!reserved.rowCount,409,'RESERVATIONS_EXIST','La ubicación tiene reservas pendientes');
    }
    const columns:Record<string,string>={name:'name',shippingEnabled:'shipping_enabled',active:'active'};
    const before=(await db.query('SELECT name,shipping_enabled,active FROM locations WHERE company_id=$1 AND id=$2',[actor.company_id,id])).rows[0];
    const entries=Object.entries(v);
    const {rows}=await db.query(`UPDATE locations SET ${entries.map(([k],i)=>`${columns[k]}=$${i+3}`).join(',')} WHERE company_id=$1 AND id=$2 RETURNING *`,[actor.company_id,id,...entries.map(([,value])=>value)]);
    ensure(rows[0],404,'LOCATION_NOT_FOUND','Ubicación inexistente');
    await audit(db,actor,'LOCATION_UPDATED',id,{before,after:{name:rows[0].name,shipping_enabled:rows[0].shipping_enabled,active:rows[0].active}});
    return rows[0];
  });
}
export async function createUser(pool:Pool,actor:Actor,raw:unknown) {
  owner(actor);const v=userSchema.parse(raw);const hashed=await hashPassword(v.password);
  const locationIds=[...new Set(v.locationIds)];
  ensure(v.role==='AGENT'||locationIds.length===0,400,'INVALID_ASSIGNMENT','Un cliente no puede tener ubicaciones asignadas');
  return stockTransaction(pool,actor,async db=>{
    const matches=await db.query('SELECT id FROM locations WHERE company_id=$1 AND id=ANY($2::uuid[]) AND active',[actor.company_id,locationIds]);
    ensure(matches.rowCount===locationIds.length,400,'INVALID_ASSIGNMENT','Ubicaciones inválidas');
    const {rows}=await db.query(`INSERT INTO users(id,company_id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,name,role,active`,[randomUUID(),actor.company_id,v.email,v.name,hashed,v.role]);
    for(const locationId of locationIds) await db.query('INSERT INTO agent_locations(company_id,user_id,location_id) VALUES($1,$2,$3)',[actor.company_id,rows[0].id,locationId]);
    await audit(db,actor,'USER_CREATED',rows[0].id,{email:v.email,name:v.name,role:v.role,locationIds});
    return {...rows[0],locationIds};
  });
}
