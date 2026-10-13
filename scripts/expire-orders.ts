import { setTimeout as delay } from 'node:timers/promises';
import { database } from '../src/server/db';
import { expireReservations } from '../src/server/reservations';

async function main() {
const pool = database();
const watch = process.argv.includes('--watch');
const stop = new AbortController();
process.on('SIGINT', () => stop.abort());
process.on('SIGTERM', () => stop.abort());

try {
  do {
    const result = await expireReservations(pool);
    if (!watch || result.expired) console.log('Reservas vencidas liberadas:', result.expired);
    if (!watch || stop.signal.aborted) break;
    try { await delay(5000, undefined, { signal: stop.signal }); } catch { break; }
  } while (!stop.signal.aborted);
} catch {
  console.error('No se pudieron liberar las reservas. Revisa la conexión y las migraciones.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
}
void main();
