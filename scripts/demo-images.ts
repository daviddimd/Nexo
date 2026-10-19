import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import sharp from 'sharp';
import {demoProducts} from './demo-products';

type Photo={file:string;sha256:string;sourcePage:string;sourceImage:string;referenceModel?:string;note?:string};

/** Packaged assets only: seeding never downloads remote URLs or depends on their availability. */
export async function loadDemoImages():Promise<Map<string,Buffer>>{
 const directory=new URL('./demo-images/',import.meta.url);
 const manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8')) as {version:number;products:Record<string,Photo>};
 const expected=new Set(demoProducts.map(p=>p.sku));
 if(manifest.version!==1||Object.keys(manifest.products).length!==expected.size)throw new Error('Cobertura incompleta de imÃ¡genes de demostraciÃ³n');
 const files=new Map<string,Buffer>(),images=new Map<string,Buffer>();
 for(const [sku,photo] of Object.entries(manifest.products)){
  if(!expected.has(sku)||!/^assets\/[a-f0-9]{20}\.webp$/.test(photo.file)||!/^https:\/\//.test(photo.sourcePage)||!/^https:\/\//.test(photo.sourceImage))throw new Error('Manifiesto de imÃ¡genes invÃ¡lido');
  let data=files.get(photo.file);
  if(!data){
   data=await readFile(new URL(photo.file,directory));
   const meta=await sharp(data,{limitInputPixels:16000000}).metadata();
   if(data.length>2*1024*1024||meta.format!=='webp'||!meta.width||!meta.height||meta.width>1600||meta.height>1600)throw new Error('Imagen de demostraciÃ³n invÃ¡lida');
   files.set(photo.file,data);
  }
  if(createHash('sha256').update(data).digest('hex')!==photo.sha256)throw new Error('La imagen no coincide con el manifiesto');
  images.set(sku,data);
 }
 return images;
}

/** Caller holds the company lock and transaction. Existing images, including external URLs, are preserved. */
export async function applyDemoImages(db:PoolClient,companyId:string,slug:string,images:ReadonlyMap<string,Buffer>):Promise<number>{
 let added=0;
 for(const [sku,data] of images){
  const result=await db.query(`UPDATE products SET image_data=$4,image_url='/api/public/'||$2||'/products/'||id::text||'/image'
   WHERE company_id=$1 AND sku=$3 AND image_data IS NULL AND image_url IS NULL`,[companyId,slug,sku,data]);
  added+=result.rowCount??0;
 }
 return added;
}
