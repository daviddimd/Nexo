import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { stockTransaction } from './stock-transaction';
import { digest, locationAccess, staff, type Actor } from './auth';
import { ensure } from './errors';
import { operationSchema, type Operation } from './schemas';

type Movement={id:string;product_id:string;location_id:string;delta:number;on_hand_after:number;created_at:Date};
type OperationRecord={id:string;kind:Operation['kind'];reason:string;actor_id:string;created_at:Date};
async function operationResult(db: PoolClient, companyId: string, id: string) {
  const operation=await db.query<OperationRecord>('SELECT id,kind,reason,actor_id,created_at FROM inventory_operations WHERE company_id=$1 AND id=$2',[companyId,id]);
  const movements=await db.query<Movement>(`SELECT id,product_id,location_id,delta,on_hand_after,created_at FROM stock_movements
    WHERE company_id=$1 AND operation_id=$2 ORDER BY location_id`,[companyId,id]);
  return {...operation.rows[0], movements:movements.rows};
}
export async function applyOperation(pool: Pool, actor: Actor, key: string, raw: Operation) {
  staff(actor);
  ensure(/^[A-Za-z0-9_-]{8,128}$/.test(key),400,'INVALID_IDEMPOTENCY_KEY','Idempotency-Key debe contener entre 8 y 128 caracteres seguros');
  const input=operationSchema.parse(raw);
  const requestHash=digest(JSON.stringify({actor:actor.id,...input}));
  return stockTransaction(pool, actor, async db => {
    await locationAccess(db,actor,input.locationId);
    if(input.destinationId) await locationAccess(db,actor,input.destinationId);
    const previous=await db.query('SELECT id,request_hash FROM inventory_operations WHERE company_id=$1 AND idempotency_key=$2',[actor.company_id,key]);
    if(previous.rows[0]) {
      ensure(previous.rows[0].request_hash===requestHash,409,'IDEMPOTENCY_CONFLICT','La clave ya se utilizó con otros datos');
      return {...await operationResult(db,actor.company_id,previous.rows[0].id), replayed:true};
    }
    const product=await db.query('SELECT id FROM products WHERE company_id=$1 AND id=$2 AND active',[actor.company_id,input.productId]);
    ensure(product.rows[0],404,'PRODUCT_NOT_FOUND','Producto inexistente o inactivo');
    const id=randomUUID();
    await db.query(`INSERT INTO inventory_operations(id,company_id,actor_id,idempotency_key,request_hash,kind,reason) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [id,actor.company_id,actor.id,key,requestHash,input.kind,input.reason]);
    const delta=input.kind==='SALE'||input.kind==='TRANSFER' ? -input.quantity : input.quantity;
    const changes=[{location:input.locationId,delta}];
    if(input.kind==='TRANSFER') changes.push({location:input.destinationId!,delta:input.quantity});
    for(const change of changes) {
      await db.query(`INSERT INTO stock(company_id,product_id,location_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[actor.company_id,input.productId,change.location]);
      const updated=await db.query(`UPDATE stock SET on_hand=on_hand+$4,updated_at=now()
        WHERE company_id=$1 AND product_id=$2 AND location_id=$3 AND on_hand::bigint+$4>=reserved AND on_hand::bigint+$4<=2147483647 RETURNING on_hand`,
        [actor.company_id,input.productId,change.location,change.delta]);
      ensure(updated.rows[0],409,'INSUFFICIENT_STOCK','Stock disponible insuficiente o capacidad excedida');
      await db.query(`INSERT INTO stock_movements(id,company_id,operation_id,product_id,location_id,delta,on_hand_after) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(),actor.company_id,id,input.productId,change.location,change.delta,updated.rows[0].on_hand]);
    }
    return {...await operationResult(db,actor.company_id,id),replayed:false};
  });
}
