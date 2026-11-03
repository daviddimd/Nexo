import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import type {Actor} from './auth';
import {ensure} from './errors';
import {stockTransaction} from './stock-transaction';
import {addressSchema,type ShippingAddress} from './shipping-address';
const profileSchema=z.object({
 name:z.string().trim().min(1).max(200).optional(),
 phone:z.string().trim().max(30).regex(/^[+0-9 ()-]*$/).optional(),
 defaultAddress:addressSchema.nullable().optional(),
 paymentPreference:z.enum(['CARD','TRANSFER']).nullable().optional()
}).strict().refine(value=>Object.keys(value).length>0);
const savedAddressSchema=z.object({label:z.string().trim().min(1).max(60),address:addressSchema,isDefault:z.boolean().default(false)}).strict();
function customer(actor:Actor){ensure(actor.role==='CUSTOMER',403,'CUSTOMER_REQUIRED','Requiere una cuenta de cliente');}
async function syncDefault(db:PoolClient,actor:Actor){
 const address=(await db.query('SELECT address FROM customer_addresses WHERE company_id=$1 AND user_id=$2 AND is_default',[actor.company_id,actor.id])).rows[0]?.address??null;
 await db.query(`INSERT INTO customer_profiles(company_id,user_id,default_address) VALUES($1,$2,$3)
 ON CONFLICT(company_id,user_id) DO UPDATE SET default_address=EXCLUDED.default_address,updated_at=clock_timestamp()`,[actor.company_id,actor.id,address?JSON.stringify(address):null]);
}
async function writeAddress(db:PoolClient,actor:Actor,id:string|null,input:z.infer<typeof savedAddressSchema>){
 const list=(await db.query('SELECT id,is_default FROM customer_addresses WHERE company_id=$1 AND user_id=$2 ORDER BY created_at,id',[actor.company_id,actor.id])).rows;
 const old=id?list.find(row=>row.id===id):null;
 if(id)ensure(old,404,'ADDRESS_NOT_FOUND','Dirección inexistente');
 else ensure(list.length<20,409,'ADDRESS_LIMIT','Puedes guardar hasta veinte direcciones');
 const isDefault=input.isDefault||!!old?.is_default||!list.some(row=>row.is_default);
 if(isDefault)await db.query('UPDATE customer_addresses SET is_default=false WHERE company_id=$1 AND user_id=$2 AND is_default',[actor.company_id,actor.id]);
 const result=id?await db.query('UPDATE customer_addresses SET label=$4,address=$5,is_default=$6 WHERE company_id=$1 AND user_id=$2 AND id=$3 RETURNING id,label,address,is_default AS "isDefault"',[actor.company_id,actor.id,id,input.label,JSON.stringify(input.address),isDefault]):
 await db.query('INSERT INTO customer_addresses(id,company_id,user_id,label,address,is_default) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,label,address,is_default AS "isDefault"',[randomUUID(),actor.company_id,actor.id,input.label,JSON.stringify(input.address),isDefault]);
 await syncDefault(db,actor);
 return result.rows[0];
}
export async function saveCustomerAddress(pool:Pool,actor:Actor,id:string|null,raw:unknown){
 customer(actor);const input=savedAddressSchema.parse(raw);
 return stockTransaction(pool,actor,db=>writeAddress(db,actor,id,input));
}
export async function removeCustomerAddress(pool:Pool,actor:Actor,id:string){
 customer(actor);
 return stockTransaction(pool,actor,async db=>{
  const removed=(await db.query('DELETE FROM customer_addresses WHERE company_id=$1 AND user_id=$2 AND id=$3 RETURNING is_default',[actor.company_id,actor.id,id])).rows[0];
  ensure(removed,404,'ADDRESS_NOT_FOUND','Dirección inexistente');
  if(removed.is_default)await db.query('UPDATE customer_addresses SET is_default=true WHERE id=(SELECT id FROM customer_addresses WHERE company_id=$1 AND user_id=$2 ORDER BY created_at,id LIMIT 1)',[actor.company_id,actor.id]);
  await syncDefault(db,actor);return {removed:true};
 });
}
export async function customerProfile(pool:Pool,actor:Actor,raw?:unknown){
 customer(actor);const input=raw===undefined?null:profileSchema.parse(raw);
 return stockTransaction(pool,actor,async db=>{
  if(input){
   if(input.name!==undefined)await db.query('UPDATE users SET name=$3 WHERE company_id=$1 AND id=$2',[actor.company_id,actor.id,input.name]);
   await db.query('INSERT INTO customer_profiles(company_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor.company_id,actor.id]);
   if(input.phone!==undefined)await db.query('UPDATE customer_profiles SET phone=$3,updated_at=clock_timestamp() WHERE company_id=$1 AND user_id=$2',[actor.company_id,actor.id,input.phone]);
   if(input.paymentPreference!==undefined)await db.query('UPDATE customer_profiles SET payment_preference=$3,updated_at=clock_timestamp() WHERE company_id=$1 AND user_id=$2',[actor.company_id,actor.id,input.paymentPreference]);
   if(input.defaultAddress){
    // Legacy checkout callers append/reuse an address instead of replacing the address book.
    const old=(await db.query('SELECT id,label FROM customer_addresses WHERE company_id=$1 AND user_id=$2 AND address=$3::jsonb',[actor.company_id,actor.id,JSON.stringify(input.defaultAddress)])).rows[0];
    await writeAddress(db,actor,old?.id??null,{label:old?.label??'Entrega',address:input.defaultAddress,isDefault:true});
   }else if(input.defaultAddress===null){
    await db.query('UPDATE customer_addresses SET is_default=false WHERE company_id=$1 AND user_id=$2',[actor.company_id,actor.id]);
    await syncDefault(db,actor);
   }
  }
  const user=(await db.query<{name:string;email:string}>('SELECT name,email FROM users WHERE company_id=$1 AND id=$2',[actor.company_id,actor.id])).rows[0];
  const profile=(await db.query<{phone:string;default_address:ShippingAddress|null;payment_preference:'CARD'|'TRANSFER'|null}>('SELECT phone,default_address,payment_preference FROM customer_profiles WHERE company_id=$1 AND user_id=$2',[actor.company_id,actor.id])).rows[0];
  const addresses=(await db.query<{id:string;label:string;address:ShippingAddress;isDefault:boolean}>('SELECT id,label,address,is_default AS "isDefault" FROM customer_addresses WHERE company_id=$1 AND user_id=$2 ORDER BY is_default DESC,created_at,id',[actor.company_id,actor.id])).rows;
  return {...user,phone:profile?.phone??'',defaultAddress:profile?.default_address??null,paymentPreference:profile?.payment_preference??null,addresses};
 });
}
