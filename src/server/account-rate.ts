import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {ensure} from './errors';

// Separate committed counters: rejected/rolled-back business commands still count.
export async function accountRate(pool:Pool,scope:string,identity:string,limit=5){
  const bucket=createHash('sha256').update(JSON.stringify([scope,identity])).digest('hex');
  const {rows}=await pool.query(`INSERT INTO account_rate_limits(bucket,attempts,window_started_at) VALUES($1,1,clock_timestamp())
    ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN account_rate_limits.window_started_at<clock_timestamp()-interval '15 minutes'
    THEN 1 ELSE LEAST(account_rate_limits.attempts+1,1000000) END,
    window_started_at=CASE WHEN account_rate_limits.window_started_at<clock_timestamp()-interval '15 minutes'
    THEN clock_timestamp() ELSE account_rate_limits.window_started_at END RETURNING attempts`,[bucket]);
  ensure(rows[0].attempts<=limit,429,'ACCOUNT_RATE_LIMIT','Demasiados intentos; espera 15 minutos');
}
