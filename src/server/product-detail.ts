import type {Pool} from 'pg';
import {staff,type Actor} from './auth';
import {ensure} from './errors';
import {uuid} from './schemas';
import {readCategories} from './categories';
import {expireCompanyReservations} from './reservations';
import type {Attribute,Specifications} from '../catalog/taxonomy';
export type ProductDetail={
 company:{id:string;slug:string;name:string;logo_url:string|null;primary_color:string|null};
 product:{id:string;sku:string;name:string;description:string;price_minor:string;currency:string;image_url:string|null;active:boolean;category_id:string|null;specifications:Specifications};
 categoryPath:string;fields:Attribute[];
 availability:{locationId:string;name:string;kind:'WEB'|'STORE';active:boolean;shippingEnabled:boolean;available:number;onHand?:number;reserved?:number}[];
};
async function detail(pool:Pool,companyId:string,id:string,actor?:Actor):Promise<ProductDetail>{
 const company=(await pool.query('SELECT id,slug,name,logo_url,primary_color FROM companies WHERE id=$1',[companyId])).rows[0];
 const product=(await pool.query(`SELECT id,sku,name,description,price_minor::text,currency,image_url,active,category_id,specifications FROM products WHERE company_id=$1 AND id=$2 AND ($3::boolean OR active)`,[companyId,id,Boolean(actor)])).rows[0];
 ensure(company&&product,404,'PRODUCT_NOT_FOUND','Producto inexistente o no disponible');
 await expireCompanyReservations(pool,companyId);
 const {rows}=await pool.query(`SELECT l.id,l.name,l.kind,l.active,l.shipping_enabled,
  COALESCE(s.on_hand,0) AS on_hand,COALESCE(s.reserved,0) AS reserved,COALESCE(s.on_hand-s.reserved,0) AS available
  FROM locations l LEFT JOIN stock s ON s.company_id=l.company_id AND s.location_id=l.id AND s.product_id=$2
  WHERE l.company_id=$1 AND ($3::boolean OR l.active)
  AND ($4::text IS NULL OR $4='OWNER' OR EXISTS(SELECT 1 FROM agent_locations a WHERE a.company_id=l.company_id AND a.location_id=l.id AND a.user_id=$5))
  ORDER BY l.kind DESC,l.name,l.id`,[companyId,id,Boolean(actor),actor?.role??null,actor?.id??null]);
 const category=(await readCategories(pool,companyId)).find(c=>c.id===product.category_id);
 return {company,product,categoryPath:category?.path??'',fields:category?.fields??[],availability:rows.map(row=>({locationId:row.id,name:row.name,kind:row.kind,active:row.active,shippingEnabled:row.shipping_enabled,available:row.available,...(actor?{onHand:row.on_hand,reserved:row.reserved}:{})}))};
}
export async function managedProductDetail(pool:Pool,actor:Actor,id:string){staff(actor);return detail(pool,actor.company_id,uuid.parse(id),actor);}
export async function publicProductDetail(pool:Pool,slug:string,id:string){
 const company=(await pool.query('SELECT id FROM companies WHERE slug=$1',[slug])).rows[0];
 ensure(company,404,'PRODUCT_NOT_FOUND','Producto inexistente o no disponible');return detail(pool,company.id,uuid.parse(id));
}
