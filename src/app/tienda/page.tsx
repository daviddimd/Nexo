import type {Metadata} from 'next';
import {database} from '../../server/db';
import {publicSettings} from '../../server/accounts';
export {default} from './storefront';
export async function generateMetadata({searchParams}:{searchParams:Promise<{empresa?:string|string[]}>}):Promise<Metadata>{
 const {empresa}=await searchParams;
 if(typeof empresa!=='string'||!empresa)return {title:'Tienda',description:'Catálogo de productos y disponibilidad por sucursal.'};
 try{const company=await publicSettings(database(),empresa);return {title:`${company.name} · Tienda`,description:company.about||`Explora el catálogo de ${company.name}, consulta disponibilidad y elige retiro o envío.`};}
 catch{return {title:'Tienda',description:'Catálogo de productos y disponibilidad por sucursal.'};}
}
