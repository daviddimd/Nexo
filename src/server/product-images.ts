import sharp from 'sharp';
import type {Pool} from 'pg';
import {staff,type Actor} from './auth';
import {ensure,AppError} from './errors';
import {stockTransaction} from './stock-transaction';
export async function uploadProductImage(pool:Pool,actor:Actor,id:string,request:Request){
 staff(actor);ensure(['image/png','image/jpeg','image/webp'].includes(request.headers.get('content-type')??''),415,'IMAGE_TYPE','Usa PNG, JPEG o WebP');
 const reader=request.body?.getReader();ensure(reader,400,'EMPTY_IMAGE','Selecciona una imagen');let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>2097152){await reader.cancel();throw new AppError(413,'IMAGE_TOO_LARGE','Máximo 2 MB');}chunks.push(part.value);}}finally{reader.releaseLock();}
 let image:Buffer;try{image=await sharp(Buffer.concat(chunks),{limitInputPixels:16000000,animated:false}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();}catch{throw new AppError(400,'INVALID_IMAGE','La imagen no se pudo procesar');}
 ensure(image.length<=2097152,413,'IMAGE_TOO_LARGE','La imagen procesada supera 2 MB');
 return stockTransaction(pool,actor,async db=>{const company=(await db.query('SELECT slug FROM companies WHERE id=$1',[actor.company_id])).rows[0];const url=`/api/public/${company.slug}/products/${id}/image`;
 const result=await db.query('UPDATE products SET image_data=$3,image_url=$4 WHERE company_id=$1 AND id=$2 RETURNING image_url',[actor.company_id,id,image,url]);ensure(result.rowCount,404,'PRODUCT_NOT_FOUND','Producto inexistente');return result.rows[0];});
}
export async function publicProductImage(pool:Pool,slug:string,id:string){
 const result=await pool.query('SELECT p.image_data,p.image_url FROM products p JOIN companies c ON c.id=p.company_id WHERE c.slug=$1 AND p.id=$2 AND p.active',[slug,id]);
 const image=result.rows[0];ensure(image?.image_data&&image.image_url===`/api/public/${slug}/products/${id}/image`,404,'IMAGE_NOT_FOUND','Imagen inexistente');
 return new Response(new Uint8Array(image.image_data),{headers:{'content-type':'image/webp','x-content-type-options':'nosniff','cache-control':'no-store'}});
}
