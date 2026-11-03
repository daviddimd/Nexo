import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import type {Actor} from './auth';
import {ensure} from './errors';
import {stockTransaction} from './stock-transaction';
import {testCardBrand} from '../catalog/test-card';
export function testMethodsEnabled(actor:Actor){ensure(process.env.NODE_ENV!=='production'&&process.env.NEXO_SIMULATOR_ENABLED==='true',404,'TEST_METHODS_DISABLED','Los métodos de prueba no están habilitados');ensure(actor.role==='CUSTOMER',403,'CUSTOMER_REQUIRED','Requiere una cuenta de cliente');}
export async function listTestCards(pool:Pool,actor:Actor){testMethodsEnabled(actor);return stockTransaction(pool,actor,async db=>({items:(await db.query('SELECT id,label,brand,prefix,last_four FROM test_payment_cards WHERE company_id=$1 AND user_id=$2 AND active ORDER BY created_at',[actor.company_id,actor.id])).rows}));}
export async function saveTestCard(pool:Pool,actor:Actor,raw:unknown){
 testMethodsEnabled(actor);const input=z.object({label:z.string().trim().min(1).max(80),number:z.string().transform(v=>v.replace(/[ -]/g,'')).pipe(z.string().regex(/^[0-9]{12,19}$/))}).strict().parse(raw);
 // Discard the full input immediately; persistence contains only prefix, suffix and display label.
 const prefix=input.number.slice(0,6),last=input.number.slice(-4),brand=testCardBrand(prefix);
 return stockTransaction(pool,actor,async db=>{
  const previous=(await db.query('SELECT id,active FROM test_payment_cards WHERE company_id=$1 AND user_id=$2 AND brand=$3 AND prefix=$4 AND last_four=$5',[actor.company_id,actor.id,brand,prefix,last])).rows[0];
  if(!previous?.active)ensure(Number((await db.query('SELECT count(*) FROM test_payment_cards WHERE company_id=$1 AND user_id=$2 AND active',[actor.company_id,actor.id])).rows[0].count)<8,409,'CARD_LIMIT','Puedes guardar hasta ocho tarjetas de prueba');
  const result=previous?await db.query('UPDATE test_payment_cards SET label=$3,active=true WHERE company_id=$1 AND id=$2 RETURNING id,label,brand,prefix,last_four',[actor.company_id,previous.id,input.label]):await db.query('INSERT INTO test_payment_cards(id,company_id,user_id,label,brand,prefix,last_four) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,label,brand,prefix,last_four',[randomUUID(),actor.company_id,actor.id,input.label,brand,prefix,last]);return result.rows[0];
 });
}
export async function removeTestCard(pool:Pool,actor:Actor,id:string){testMethodsEnabled(actor);return stockTransaction(pool,actor,async db=>{ensure((await db.query('UPDATE test_payment_cards SET active=false WHERE company_id=$1 AND user_id=$2 AND id=$3 RETURNING id',[actor.company_id,actor.id,id])).rowCount,404,'CARD_NOT_FOUND','Tarjeta inexistente');return {removed:true};});}
export async function selectTestPayment(pool:Pool,actor:Actor,id:string,raw:unknown){
 testMethodsEnabled(actor);const input=z.object({method:z.enum(['CARD','TRANSFER']).default('TRANSFER'),cardId:z.uuid().optional()}).strict().parse(raw);
 ensure(input.method==='CARD'?!!input.cardId:!input.cardId,400,'INVALID_PAYMENT_METHOD','Selecciona una tarjeta para este medio de pago');
 return stockTransaction(pool,actor,async db=>{
  const intent=(await db.query('SELECT id,customer_id,status FROM payment_intents WHERE company_id=$1 AND id=$2',[actor.company_id,id])).rows[0];ensure(intent&&intent.customer_id===actor.id,404,'PAYMENT_NOT_FOUND','Intento de pago inexistente');
  const old=(await db.query('SELECT method,card_id FROM test_payment_choices WHERE company_id=$1 AND intent_id=$2',[actor.company_id,id])).rows[0];
  if(old){ensure(old.method===input.method&&(old.card_id??undefined)===input.cardId,409,'PAYMENT_METHOD_CONFLICT','Este pago ya tiene otro método seleccionado');return;}
  ensure(intent.status==='PENDING',409,'PAYMENT_NOT_AVAILABLE','El pago ya no está pendiente');
  const card=input.cardId?(await db.query('SELECT id,label,brand,last_four FROM test_payment_cards WHERE company_id=$1 AND user_id=$2 AND id=$3 AND active',[actor.company_id,actor.id,input.cardId])).rows[0]:null;
  ensure(input.method!=='CARD'||card,404,'CARD_NOT_FOUND','Tarjeta inexistente');
  await db.query('INSERT INTO test_payment_choices(company_id,intent_id,user_id,method,card_id,card_label,card_brand,card_last_four) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[actor.company_id,id,actor.id,input.method,card?.id??null,card?.label??null,card?.brand??null,card?.last_four??null]);
 });
}
