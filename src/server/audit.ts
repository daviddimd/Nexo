import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Actor} from './auth';

// Callers provide explicit safe fields. Never pass raw request/password/session data.
export async function audit(db:PoolClient,actor:Actor,action:string,entityId:string,details:unknown){
  await db.query(`INSERT INTO administrative_events(id,company_id,actor_id,action,entity_id,details)
    VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),actor.company_id,actor.id,action,entityId,JSON.stringify(details)]);
}
