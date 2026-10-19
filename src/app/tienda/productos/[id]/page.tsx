import {notFound} from 'next/navigation';
import {database} from '../../../../server/db';
import {publicProductDetail} from '../../../../server/product-detail';
import {uuid} from '../../../../server/schemas';
import {AppError} from '../../../../server/errors';
import ProductDetail from '../../../product-detail';
export const metadata={title:'Producto · Nexo'};
export default async function ProductPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{empresa?:string}>}){
 const {id}=await params,{empresa}=await searchParams;if(typeof empresa!=='string'||!uuid.safeParse(id).success)notFound();
 let data;try{data=await publicProductDetail(database(),empresa,id);}catch(error){if(error instanceof AppError&&error.status===404)notFound();throw error;}
 return <ProductDetail data={data}/>;
}
