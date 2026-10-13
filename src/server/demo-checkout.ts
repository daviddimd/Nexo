import {createHmac} from 'node:crypto';
import type {Pool} from 'pg';
import {ensure} from './errors';
import type {Actor} from './auth';
import {getPaymentIntent,processSimulatorWebhook} from './payments';
import {simulatorSecret} from './simulator';
export async function simulateCheckout(pool:Pool,actor:Actor,id:string){
 ensure(actor.role==='CUSTOMER',403,'CUSTOMER_REQUIRED','Usa una cuenta de cliente');
 const intent=await getPaymentIntent(pool,actor,id),secret=simulatorSecret(actor.company_id);
 const raw=JSON.stringify({eventId:`checkout-${id}`,intentId:id,transactionId:`checkout-${id}`,status:'SUCCEEDED',amountMinor:intent.amount_minor,currency:intent.currency});
 const timestamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',secret).update(`${actor.company_id}.${timestamp}.${raw}`).digest('hex');
 return processSimulatorWebhook(pool,actor.company_id,raw,timestamp,signature);
}
