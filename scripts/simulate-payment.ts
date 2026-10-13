import { createHmac, randomUUID } from 'node:crypto';
import { database } from '../src/server/db';
import { simulatorSecret } from '../src/server/simulator';
import { uuid } from '../src/server/schemas';

const pool=database();
try {
  const companyId=uuid.parse(process.argv[2]);
  const intentId=uuid.parse(process.argv[3]);
  const status=process.argv[4]??'SUCCEEDED';
  if(!['SUCCEEDED','FAILED'].includes(status))throw new Error('Invalid status');
  const origin=new URL(process.env.APP_ORIGIN??'http://localhost:3000');
  if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new Error('Simulator requires loopback');
  const secret=simulatorSecret(companyId);
  const intent=await pool.query<{amount_minor:string;currency:string}>(
    'SELECT amount_minor::text,currency FROM payment_intents WHERE company_id=$1 AND id=$2',[companyId,intentId]);
  if(!intent.rows[0])throw new Error('Unknown payment intent');
  const payload=JSON.stringify({eventId:randomUUID(),intentId,transactionId:randomUUID(),status,
    amountMinor:intent.rows[0].amount_minor,currency:intent.rows[0].currency});
  const timestamp=Math.floor(Date.now()/1000).toString();
  const signature=createHmac('sha256',secret).update(`${companyId}.${timestamp}.${payload}`).digest('hex');
  const response=await fetch(new URL(`/api/payments/simulator/${companyId}/webhook`,origin),{
    method:'POST',headers:{'content-type':'application/json','x-nexo-timestamp':timestamp,'x-nexo-signature':signature},
    body:payload,signal:AbortSignal.timeout(5000),
  });
  console.log('HTTP',response.status,await response.json());
  if(!response.ok)process.exitCode=1;
} catch {
  console.error('Simulación fallida. Revisa IDs, configuración y servidor local. No se realizó un cobro real.');
  process.exitCode=1;
} finally {await pool.end();}
