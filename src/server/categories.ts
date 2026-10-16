import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {attributesSchema,categoryTree,type Category,type Specifications} from '../catalog/taxonomy';
import {owner,staff,type Actor} from './auth';
import {ensure} from './errors';
import {stockTransaction} from './stock-transaction';
import {audit} from './audit';
export async function readCategories(db:Pick<Pool,'query'>|PoolClient,companyId:string):Promise<Category[]>{
 const {rows}=await db.query('SELECT id,parent_id,name,slug,attributes FROM categories WHERE company_id=$1',[companyId]);
 return categoryTree(rows.map(row=>({...row,attributes:attributesSchema.parse(row.attributes)})));
}
export async function listCategories(pool:Pool,actor:Actor){staff(actor);return {items:await readCategories(pool,actor.company_id)};}
const createSchema=z.object({name:z.string().trim().min(1).max(100),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),parentId:z.uuid().nullable().default(null),attributes:attributesSchema.default([])}).strict();
export async function createCategory(pool:Pool,actor:Actor,raw:unknown){
 owner(actor);const input=createSchema.parse(raw);
 return stockTransaction(pool,actor,async db=>{
  const categories=await readCategories(db,actor.company_id),parent=categories.find(c=>c.id===input.parentId);
  ensure(input.parentId===null||parent,400,'CATEGORY_INVALID','Categoría superior inexistente');
  ensure(!parent||parent.depth<4,400,'CATEGORY_DEPTH','Máximo cinco niveles de categorías');
  ensure(categories.length<500,400,'CATEGORY_LIMIT','Máximo 500 categorías');
  const inherited=new Set((parent?.fields??[{key:'brand'},{key:'model'}]).map(f=>f.key));
  ensure(input.attributes.every(a=>!inherited.has(a.key)),400,'ATTRIBUTE_DUPLICATE','La especificación ya existe en una categoría superior');
  ensure((parent?.fields.length??2)+input.attributes.length<=40,400,'ATTRIBUTE_LIMIT','Máximo 40 especificaciones por producto');
  ensure(!categories.some(c=>c.slug===input.slug),409,'CATEGORY_EXISTS','Identificador de categoría ya utilizado');
  const id=randomUUID();await db.query('INSERT INTO categories(id,company_id,parent_id,name,slug,attributes) VALUES($1,$2,$3,$4,$5,$6)',[id,actor.company_id,input.parentId,input.name,input.slug,JSON.stringify(input.attributes)]);
  await audit(db,actor,'CATEGORY_CREATED',id,{name:input.name,parentId:input.parentId});
  return (await readCategories(db,actor.company_id)).find(c=>c.id===id)!;
 });
}
export async function renameCategory(pool:Pool,actor:Actor,id:string,raw:unknown){
 owner(actor);const {name}=z.object({name:z.string().trim().min(1).max(100)}).strict().parse(raw);
 return stockTransaction(pool,actor,async db=>{
  const result=await db.query('UPDATE categories SET name=$3 WHERE company_id=$1 AND id=$2 RETURNING id',[actor.company_id,id,name]);
  ensure(result.rowCount,404,'CATEGORY_NOT_FOUND','Categoría inexistente');await audit(db,actor,'CATEGORY_RENAMED',id,{name});return {id,name};
 });
}
export async function validateProductMetadata(db:PoolClient,companyId:string,categoryId:string|null,specifications:Specifications){
 if(!categoryId){ensure(!Object.keys(specifications).length,400,'CATEGORY_REQUIRED','Selecciona una categoría antes de agregar especificaciones');return;}
 const category=(await readCategories(db,companyId)).find(c=>c.id===categoryId);
 ensure(category,400,'CATEGORY_INVALID','La categoría no pertenece a esta empresa');
 for(const [key,value] of Object.entries(specifications)){
  const field=category.fields.find(f=>f.key===key);ensure(field,400,'SPECIFICATION_INVALID',`Especificación no válida: ${key}`);
  const valid=field.type==='number'?typeof value==='number'&&Number.isFinite(value)&&value>=(field.min??-Infinity)&&value<=(field.max??Infinity):field.type==='boolean'?typeof value==='boolean':field.type==='select'?typeof value==='string'&&field.options!.some(o=>o.value===value):typeof value==='string'&&value.trim().length>0;
  ensure(valid,400,'SPECIFICATION_INVALID',`Valor no válido para ${field.label}`);
 }
}
