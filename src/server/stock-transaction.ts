import type { Pool, PoolClient } from 'pg';
import type { Actor } from './auth';
import { transaction } from './db';
import { currentActor, expireDue, lockCompany } from './order-store';

// The company lock is shared by orders, inventory and catalog-setting changes.
// Keep expiration even when a business command fails; roll back only that command.
export async function stockTransaction<T>(pool: Pool, actor: Actor, command: (db: PoolClient) => Promise<T>): Promise<T> {
  const outcome = await transaction(pool, async db => {
    await lockCompany(db, actor.company_id);
    await currentActor(db, actor);
    await expireDue(db, actor.company_id);
    await db.query('SAVEPOINT stock_command');
    try {
      return { ok: true as const, value: await command(db) };
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT stock_command');
      await expireDue(db, actor.company_id);
      return { ok: false as const, error };
    }
  });
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
