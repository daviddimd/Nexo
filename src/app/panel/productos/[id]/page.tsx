import {notFound,redirect} from 'next/navigation';
import {pageSession} from '../../../../server/page-session';
import {database} from '../../../../server/db';
import {managedProductDetail} from '../../../../server/product-detail';
import {uuid} from '../../../../server/schemas';
import {AppError} from '../../../../server/errors';
import ProductDetail from '../../../product-detail';
export const metadata={title:'Producto · Nexo'};
export default async function ProductPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{desde?:string}>}){
 const actor=await pageSession();if(!actor)redirect('/panel');if(actor.role==='CUSTOMER')redirect('/tienda');
 const {id}=await params;if(!uuid.safeParse(id).success)notFound();
 const from=(await searchParams).desde==='products'?'products':'inventory';
 let data;try{data=await managedProductDetail(database(),actor,id);}catch(error){if(error instanceof AppError&&error.status===404)notFound();throw error;}
 return <ProductDetail data={data} user={actor} from={from}/>;
}
