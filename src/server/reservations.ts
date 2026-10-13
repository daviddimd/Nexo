import type { Pool } from 'pg';
import { transaction } from './db';
import { expireDue, lockCompany } from './order-store';

export async function expireCompanyReservations(pool: Pool, companyId: string) {
  return transaction(pool, async db => {
    await lockCompany(db, companyId);
    return expireDue(db, companyId);
  });
}

export async function expireReservations(pool: Pool) {
  const { rows } = await pool.query<{ company_id: string }>(`SELECT DISTINCT company_id FROM orders
    WHERE status='RESERVED' AND expires_at <= clock_timestamp() ORDER BY company_id LIMIT 100`);
  let expired = 0;
  for (const row of rows) expired += await expireCompanyReservations(pool, row.company_id);
  return { companies: rows.length, expired };
}
