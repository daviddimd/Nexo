import type {Pool} from 'pg';
import {z} from 'zod';
import type {Actor} from './auth';
import {ensure} from './errors';
import {stockTransaction} from './stock-transaction';
import {addressSchema} from './shipping-schemas';
const profileSchema=z.object({name:z.string().trim().min(1).max(200),phone:z.string().trim().max(30).regex(/^[+0-9 ()-]*$/),defaultAddress:addressSchema.nullable(),paymentPreference:z.enum(['CARD','TRANSFER']).nullable()}).strict();
export async function customerProfile(pool:Pool,actor:Actor,raw?:unknown){
 ensure(actor.role==='CUSTOMER',403,'CUSTOMER_REQUIRED','Requiere una cuenta de cliente');
 const input=raw===undefined?null:profileSchema.parse(raw);
 return stockTransaction(pool,actor,async db=>{
  if(input){
   await db.query('UPDATE users SET name=$3 WHERE company_id=$1 AND id=$2',[actor.company_id,actor.id,input.name]);
   await db.query(`INSERT INTO customer_profiles(company_id,user_id,phone,default_address,payment_preference) VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,user_id) DO UPDATE SET phone=EXCLUDED.phone,default_address=EXCLUDED.default_address,payment_preference=EXCLUDED.payment_preference,updated_at=clock_timestamp()`,[actor.company_id,actor.id,input.phone,input.defaultAddress?JSON.stringify(input.defaultAddress):null,input.paymentPreference]);
  }
  const user=(await db.query('SELECT name,email FROM users WHERE company_id=$1 AND id=$2',[actor.company_id,actor.id])).rows[0];
  const profile=(await db.query('SELECT phone,default_address,payment_preference FROM customer_profiles WHERE company_id=$1 AND user_id=$2',[actor.company_id,actor.id])).rows[0];
  return {...user,phone:profile?.phone??'',defaultAddress:profile?.default_address??null,paymentPreference:profile?.payment_preference??null};
 });
}
