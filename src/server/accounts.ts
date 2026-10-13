import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {owner,hashPassword,verifyPassword,type Actor} from './auth';
import {stockTransaction} from './stock-transaction';
import {ensure} from './errors';
import {uuid} from './schemas';
import {audit} from './audit';
import {accountRate} from './account-rate';

const text=z.string().trim().min(1).max(200);
const reason=z.string().trim().min(3).max(500);
const password=z.string().min(12).max(128);
const patchSchema=z.object({name:text.optional(),email:z.email().max(254).transform(v=>v.toLowerCase()).optional(),
  active:z.boolean().optional(),role:z.enum(['OWNER','AGENT','CUSTOMER']).optional(),locationIds:z.array(uuid).max(100).optional(),reason
}).strict().refine(v=>Object.keys(v).length>1,'Incluye un cambio');
const settingsSchema=z.object({name:text.optional(),logoUrl:z.url().refine(v=>v.startsWith('https://'),'HTTPS requerido').nullable().optional(),
  primaryColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),contactEmail:z.email().max(254).transform(v=>v.toLowerCase()).nullable().optional(),
  contactPhone:z.string().trim().max(40).nullable().optional(),about:z.string().trim().max(2000).optional(),reason
}).strict().refine(v=>Object.keys(v).length>1,'Incluye un cambio');
type User={id:string;email:string;name:string;role:Actor['role'];active:boolean};
async function userById(db:PoolClient,companyId:string,id:string){
  const {rows}=await db.query<User>('SELECT id,email,name,role,active FROM users WHERE company_id=$1 AND id=$2',[companyId,id]);
  ensure(rows[0],404,'USER_NOT_FOUND','Cuenta inexistente');return rows[0];
}
async function assignments(db:PoolClient,companyId:string,id:string){
  const {rows}=await db.query<{location_id:string}>('SELECT location_id FROM agent_locations WHERE company_id=$1 AND user_id=$2 ORDER BY location_id',[companyId,id]);
  return rows.map(r=>r.location_id);
}
export async function listUsers(pool:Pool,actor:Actor,limit=50,offset=0){
  owner(actor);return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query(`SELECT u.id,u.email,u.name,u.role,u.active,u.email_verification_required,u.email_verified_at,
      ARRAY(SELECT a.location_id FROM agent_locations a WHERE a.company_id=u.company_id AND a.user_id=u.id ORDER BY a.location_id) AS "locationIds"
      FROM users u WHERE u.company_id=$1 ORDER BY u.name,u.id LIMIT $2 OFFSET $3`,[actor.company_id,limit,offset]);
    return {items:rows,limit,offset};
  });
}
export async function patchUser(pool:Pool,actor:Actor,id:string,raw:unknown){
  owner(actor);const input=patchSchema.parse(raw);
  return stockTransaction(pool,actor,async db=>{
    const before=await userById(db,actor.company_id,id);const oldLocations=await assignments(db,actor.company_id,id);
    const role=input.role??before.role;
    ensure((role==='CUSTOMER')===(before.role==='CUSTOMER'),409,'CUSTOMER_ROLE_IMMUTABLE','No se convierte una cuenta cliente en personal ni viceversa');
    const locationIds=[...new Set(input.locationIds??(role==='AGENT'?oldLocations:[]))].sort();
    ensure(role==='AGENT'||locationIds.length===0,400,'INVALID_ASSIGNMENT','Solo agentes tienen ubicaciones asignadas');
    if(input.locationIds){
      const valid=await db.query('SELECT id FROM locations WHERE company_id=$1 AND id=ANY($2::uuid[]) AND active',[actor.company_id,locationIds]);
      ensure(valid.rowCount===locationIds.length,400,'INVALID_ASSIGNMENT','Ubicaciones inválidas o inactivas');
    }
    if(before.role==='OWNER'&&before.active&&(role!=='OWNER'||input.active===false)){
      const other=await db.query("SELECT 1 FROM users WHERE company_id=$1 AND id<>$2 AND role='OWNER' AND active",[actor.company_id,id]);
      ensure(other.rowCount,409,'LAST_OWNER','La empresa debe conservar un administrador activo');
    }
    const taken=await db.query('SELECT 1 FROM users WHERE company_id=$1 AND email=$2 AND id<>$3',[actor.company_id,input.email??before.email,id]);
    ensure(!taken.rowCount,409,'EMAIL_EXISTS','Correo ya registrado en esta empresa');
    const next={name:input.name??before.name,email:input.email??before.email,role,active:input.active??before.active};
    // Compare individual fields; object key order must not turn a no-op into a change.
    const fieldsChanged=before.name!==next.name||before.email!==next.email||before.role!==next.role||before.active!==next.active;
    const locationsChanged=JSON.stringify(oldLocations)!==JSON.stringify(locationIds);
    if(!fieldsChanged&&!locationsChanged)return {...before,locationIds:oldLocations,changed:false};
    await db.query('UPDATE users SET name=$3,email=$4,role=$5,active=$6 WHERE company_id=$1 AND id=$2',[actor.company_id,id,next.name,next.email,next.role,next.active]);
    if(locationsChanged){
      await db.query('DELETE FROM agent_locations WHERE company_id=$1 AND user_id=$2',[actor.company_id,id]);
      for(const locationId of locationIds)await db.query('INSERT INTO agent_locations(company_id,user_id,location_id) VALUES($1,$2,$3)',[actor.company_id,id,locationId]);
      await db.query('DELETE FROM sessions WHERE company_id=$1 AND user_id=$2',[actor.company_id,id]);
    }
    await audit(db,actor,'USER_UPDATED',id,{before:{...before,locationIds:oldLocations},after:{id,...next,locationIds},reason:input.reason});
    return {id,...next,locationIds,changed:true};
  });
}
export async function resetUserPassword(pool:Pool,actor:Actor,id:string,raw:unknown){
  owner(actor);const input=z.object({password,reason}).strict().parse(raw);
  ensure(id!==actor.id,400,'USE_PASSWORD_CHANGE','Cambia tu propia contraseña indicando la actual');
  const hashed=await hashPassword(input.password);
  return stockTransaction(pool,actor,async db=>{
    await userById(db,actor.company_id,id);
    await db.query('UPDATE users SET password_hash=$3 WHERE company_id=$1 AND id=$2',[actor.company_id,id,hashed]);
    await audit(db,actor,'PASSWORD_RESET',id,{reason:input.reason});return {ok:true,sessionsRevoked:true};
  });
}
export async function changePassword(pool:Pool,actor:Actor,raw:unknown){
  const input=z.object({currentPassword:z.string().min(1).max(128),newPassword:password}).strict().parse(raw);
  ensure(input.currentPassword!==input.newPassword,400,'PASSWORD_UNCHANGED','Elige una contraseña diferente');
  await accountRate(pool,'PASSWORD_CHANGE',`${actor.company_id}:${actor.id}`);
  const hashed=await hashPassword(input.newPassword);
  return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query<{password_hash:string}>('SELECT password_hash FROM users WHERE company_id=$1 AND id=$2',[actor.company_id,actor.id]);
    ensure(await verifyPassword(input.currentPassword,rows[0].password_hash),403,'CURRENT_PASSWORD_INVALID','Contraseña actual incorrecta');
    await db.query('UPDATE users SET password_hash=$3 WHERE company_id=$1 AND id=$2',[actor.company_id,actor.id,hashed]);
    await audit(db,actor,'PASSWORD_CHANGED',actor.id,{});return {ok:true,sessionsRevoked:true};
  });
}
const companyColumns='id,slug,name,logo_url,primary_color,contact_email,contact_phone,about';
export async function companySettings(pool:Pool,actor:Actor){
  owner(actor);return stockTransaction(pool,actor,async db=>(await db.query(`SELECT ${companyColumns},reservation_minutes FROM companies WHERE id=$1`,[actor.company_id])).rows[0]);
}
export async function publicSettings(pool:Pool,slug:string){
  const {rows}=await pool.query(`SELECT ${companyColumns} FROM companies WHERE slug=$1`,[slug]);
  ensure(rows[0],404,'COMPANY_NOT_FOUND','Empresa inexistente');return {...rows[0],poweredBy:'Nexo'};
}
export async function patchCompanySettings(pool:Pool,actor:Actor,raw:unknown){
  owner(actor);const input=settingsSchema.parse(raw);
  const columns:Record<string,string>={name:'name',logoUrl:'logo_url',primaryColor:'primary_color',contactEmail:'contact_email',contactPhone:'contact_phone',about:'about'};
  return stockTransaction(pool,actor,async db=>{
    const before=(await db.query(`SELECT ${companyColumns} FROM companies WHERE id=$1`,[actor.company_id])).rows[0];
    const entries=Object.entries(input).filter(([key])=>key!=='reason');
    const {rows}=await db.query(`UPDATE companies SET ${entries.map(([k],i)=>`${columns[k]}=$${i+2}`).join(',')} WHERE id=$1 RETURNING ${companyColumns}`,[actor.company_id,...entries.map(([,v])=>v)]);
    if(JSON.stringify(before)!==JSON.stringify(rows[0]))await audit(db,actor,'COMPANY_UPDATED',actor.company_id,{before,after:rows[0],reason:input.reason});
    return rows[0];
  });
}
export async function listAdministrativeEvents(pool:Pool,actor:Actor,limit=50,offset=0){
  owner(actor);return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query('SELECT id,actor_id,action,entity_id,details,created_at FROM administrative_events WHERE company_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3',[actor.company_id,limit,offset]);
    return {items:rows,limit,offset};
  });
}
