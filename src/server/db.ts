import { Pool, type PoolClient } from 'pg';

const globalDb = globalThis as unknown as { nexoPool?: Pool };
export function database(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return globalDb.nexoPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10,
    connectionTimeoutMillis: 5000, statement_timeout: 15000, idle_in_transaction_session_timeout: 15000 });
}
export async function transaction<T>(pool: Pool, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const value = await fn(db); await db.query('COMMIT'); return value; }
  catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
