import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {technologyCategories} from '../catalog/taxonomy';
export async function initializeTechnologyCategories(db:PoolClient,companyId:string){
 const ids=new Map<string,string>();
 // Legacy upgrade fixtures and migrations may create a company before migration 011.
 if(!(await db.query("SELECT to_regclass('categories') AS table_name")).rows[0].table_name)return ids;
 for(const category of technologyCategories){
  const parentId=category.parent?ids.get(category.parent):null;
  if(category.parent&&!parentId)throw new Error('Missing template parent');
  const {rows}=await db.query(`INSERT INTO categories(id,company_id,parent_id,name,slug,attributes) VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(company_id,slug) DO UPDATE SET slug=categories.slug RETURNING id`,[randomUUID(),companyId,parentId,category.name,category.slug,JSON.stringify(category.attributes)]);
  ids.set(category.slug,rows[0].id);
 }
 return ids;
}
