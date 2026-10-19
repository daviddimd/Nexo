import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {loadDemoImages,applyDemoImages} from '../scripts/demo-images';
import {demoProducts} from '../scripts/demo-products';
import {migrate} from '../scripts/migrate';
import {createCompany,type Actor} from '../src/server/auth';
import {createProduct} from '../src/server/manage';
import {publicProductImage} from '../src/server/product-images';

test('la semilla incluye imágenes WebP verificadas para todos sus productos',async()=>{
 const images=await loadDemoImages();assert.equal(images.size,demoProducts.length);
 for(const product of demoProducts)assert.ok(images.get(product.sku)?.length);
});

test('cargar fotos es idempotente, respeta empresa y conserva imágenes propias',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL!);assert.match(url.pathname,/test/i);
 const admin=new Pool({connectionString:url.toString()}),schema='nexo_demo_images_'+randomUUID().replaceAll('-','');let pool:Pool|undefined;
 try{
  await admin.query('CREATE SCHEMA "'+schema+'"');url.searchParams.set('options','-c search_path='+schema);pool=new Pool({connectionString:url.toString()});await migrate(pool);
  const slug='photo-'+randomUUID().slice(0,8),otherSlug='other-'+randomUUID().slice(0,8);
  const company=await createCompany(pool,{slug,name:'Photo demo',email:'owner@example.test',password:'Demo-image-test-password-123!'});
  const foreign=await createCompany(pool,{slug:otherSlug,name:'Other',email:'owner@example.test',password:'Demo-image-test-password-123!'});
  const owner:Actor={id:company.userId,company_id:company.companyId,name:'Owner',role:'OWNER'};
  const skus=demoProducts.slice(0,3).map(p=>p.sku),ids:string[]=[];
  for(const sku of skus)ids.push((await createProduct(pool,owner,{sku,name:sku,priceMinor:123})).id);
  const foreignOwner:Actor={id:foreign.userId,company_id:foreign.companyId,name:'Other',role:'OWNER'};
  const foreignId=(await createProduct(pool,foreignOwner,{sku:skus[0],name:'Foreign product',priceMinor:456})).id;
  await pool.query('UPDATE products SET image_url=$2 WHERE id=$1',[ids[1],'https://example.test/custom.webp']);
  const ownPhoto=(await loadDemoImages()).get(skus[0])!;
  await pool.query('UPDATE products SET image_data=$2,image_url=$3 WHERE id=$1',[ids[2],ownPhoto,'/api/public/'+slug+'/products/'+ids[2]+'/image']);
  const before=(await pool.query('SELECT sku,name,price_minor FROM products ORDER BY id')).rows;
  const db=await pool.connect();
  try{
   assert.equal(await applyDemoImages(db,company.companyId,slug,await loadDemoImages()),1);
   assert.equal(await applyDemoImages(db,company.companyId,slug,await loadDemoImages()),0);
  }finally{db.release();}
  assert.deepEqual((await pool.query('SELECT sku,name,price_minor FROM products ORDER BY id')).rows,before);
  assert.equal((await pool.query('SELECT image_url FROM products WHERE id=$1',[ids[1]])).rows[0].image_url,'https://example.test/custom.webp');
  assert.deepEqual((await pool.query('SELECT image_data FROM products WHERE id=$1',[ids[2]])).rows[0].image_data,ownPhoto);
  assert.equal((await pool.query('SELECT image_url FROM products WHERE id=$1',[foreignId])).rows[0].image_url,null);
  const response=await publicProductImage(pool,slug,ids[0]);assert.equal(response.headers.get('content-type'),'image/webp');assert.ok((await response.arrayBuffer()).byteLength>0);
 }finally{await pool?.end();await admin.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.end();}
});
