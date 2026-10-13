import { createHmac, timingSafeEqual } from 'node:crypto';
import { ensure } from './errors';
import { simulatorEventSchema } from './payment-schemas';

export function simulatorSecret(companyId: string) {
  ensure(process.env.NODE_ENV !== 'production' && process.env.NEXO_SIMULATOR_ENABLED === 'true',
    404, 'SIMULATOR_DISABLED', 'Simulador no habilitado');
  let secrets: Record<string, unknown>;
  try { secrets = JSON.parse(process.env.NEXO_SIMULATOR_SECRETS ?? '{}'); }
  catch { secrets = {}; }
  ensure(secrets && typeof secrets === 'object' && !Array.isArray(secrets),503,'SIMULATOR_UNCONFIGURED','Configura el simulador');
  const configured = Object.hasOwn(secrets,companyId) ? secrets[companyId] : null;
  const localSeed=process.env.NEXO_LOCAL_SETUP_ENABLED==='true'?process.env.NEXO_LOCAL_SIMULATOR_SECRET:null;
  const secret=configured??(localSeed&&/^[a-f0-9]{64}$/.test(localSeed)?createHmac('sha256',localSeed).update(companyId).digest('hex'):null);
  ensure(typeof secret === 'string' && Buffer.byteLength(secret) >= 32,503,'SIMULATOR_UNCONFIGURED','Configura el secreto de esta empresa');
  return secret;
}

export function verifySimulatorEvent(companyId: string, raw: string, timestamp: string|null, signature: string|null) {
  const secret = simulatorSecret(companyId);
  ensure(timestamp && /^[0-9]{10,12}$/.test(timestamp),401,'INVALID_SIGNATURE','Firma inválida');
  ensure(Math.abs(Date.now()/1000-Number(timestamp)) <= 300,401,'SIGNATURE_EXPIRED','Firma fuera del plazo permitido');
  ensure(signature && /^[a-f0-9]{64}$/.test(signature),401,'INVALID_SIGNATURE','Firma inválida');
  const expected = createHmac('sha256',secret).update(`${companyId}.${timestamp}.${raw}`).digest();
  ensure(timingSafeEqual(expected,Buffer.from(signature,'hex')),401,'INVALID_SIGNATURE','Firma inválida');
  let payload: unknown;
  try { payload=JSON.parse(raw); } catch { ensure(false,400,'INVALID_JSON','JSON inválido'); }
  return simulatorEventSchema.parse(payload);
}
