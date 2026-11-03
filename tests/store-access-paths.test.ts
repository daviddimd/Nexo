import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storeAccessPath,storeReturnPath,storeHome} from '../src/catalog/store-access-paths';
test('login and registration have separate URLs and preserve checkout context',()=>{
 const back='/tienda?empresa=prismabyte&categoria=abc&carrito=1&entrega=shipping#catalogo';
 const login=new URL(storeAccessPath('login','prismabyte',back),'https://nexo.local');
 const register=new URL(storeAccessPath('register','prismabyte',back),'https://nexo.local');
 assert.equal(login.pathname,'/tienda/iniciar-sesion');assert.equal(register.pathname,'/tienda/crear-cuenta');
 assert.equal(login.searchParams.get('volver'),back);assert.equal(register.searchParams.get('volver'),back);
});
test('return URLs reject external destinations, staff pages and other tenants',()=>{
 for(const value of ['https://other.test','//other.test','/panel','/tienda?empresa=otra','/tienda/iniciar-sesion?empresa=prismabyte','/tienda/crear-cuenta?empresa=prismabyte','/\\other.test',null])assert.equal(storeReturnPath(value,'prismabyte'),storeHome('prismabyte'));
});
test('return URL keeps product and catalog navigation inside the current store',()=>{
 const product='/tienda/productos/12345678-1234-1234-1234-123456789abc?empresa=prismabyte';assert.equal(storeReturnPath(product,'prismabyte'),product);
 assert.equal(storeReturnPath('/tienda?marca=Apple','prismabyte'),'/tienda?marca=Apple&empresa=prismabyte');
 assert.equal(new URL(storeAccessPath('reset','prismabyte',product),'https://nexo.local').searchParams.get('modo'),'reset');
});
