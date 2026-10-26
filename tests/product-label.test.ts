import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productLabel} from '../src/catalog/product-label';
import {demoProducts} from '../scripts/demo-products';

test('separa marca del nombre comercial conservando versiones y capacidad',()=>{
 assert.deepEqual(productLabel({name:'Apple MacBook Air M2 (2022) · 16/512 GB',specifications:{brand:'Apple',model:'MLY33'}}),{brand:'Apple',title:'MacBook Air M2 (2022) · 16/512 GB'});
 assert.deepEqual(productLabel({name:'Kingston FURY Beast · DDR4 16 GB 3200 MT/s',specifications:{brand:'Kingston',model:'KF432C16BB1/16'}}),{brand:'Kingston',title:'FURY Beast · DDR4 16 GB 3200 MT/s'});
});
test('no recorta fragmentos, marcas ausentes ni nombres sin prefijo de marca',()=>{
 assert.equal(productLabel({name:'LGUltra Model',specifications:{brand:'LG'}}).title,'LGUltra Model');
 assert.equal(productLabel({name:'Monitor de LG',specifications:{brand:'LG'}}).title,'Monitor de LG');
 assert.deepEqual(productLabel({name:'MacBook Air',specifications:{}}),{brand:'',title:'MacBook Air'});
 assert.equal(productLabel({name:'Apple',specifications:{brand:'Apple'}}).title,'Apple');
 assert.equal(productLabel({name:'asus · ZenScreen',specifications:{brand:'ASUS'}}).title,'ZenScreen');
});
test('la semilla completa conserva los nombres comerciales y variantes al separar la marca',()=>{
 assert.ok(demoProducts.length>=100);
 for(const product of demoProducts){const label=productLabel(product);assert.ok(label.brand,product.sku);assert.ok(label.title,product.sku);assert.ok(product.name.endsWith(label.title),product.sku);}
});
