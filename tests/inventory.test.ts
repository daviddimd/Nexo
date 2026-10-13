import {describe,test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,login,authenticate,type Actor} from '../src/server/auth';
import {createLocation,createProduct,createUser,patchLocation,patchProduct} from '../src/server/manage';
import {applyOperation} from '../src/server/inventory';
import {inventory,publicCatalog} from '../src/server/catalog';
import {database} from '../src/server/db';
import {GET,POST,PATCH} from '../src/app/api/[...path]/route';
import {body} from '../src/server/http';

const testUrl=process.env.TEST_DATABASE_URL;
describe('PostgreSQL inventory integration',{skip:!testUrl,concurrency:false},()=>{
  let pool:Pool,adminPool:Pool,owner:Actor,other:Actor,agent:Actor,customer:Actor;
  let source:string,destination:string,foreignLocation:string,slug:string;
  const schema=`nexo_test_${randomUUID().replaceAll('-','')}`;
  const password='Nexo-test-password-123!';
  before(async()=>{
    const url=new URL(testUrl!);
    assert.match(url.pathname,/test/i,'TEST_DATABASE_URL must point to a test database');
    adminPool=new Pool({connectionString:testUrl});
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('options',`-c search_path=${schema}`);
    pool=new Pool({connectionString:url.toString(),max:20});
    process.env.DATABASE_URL=url.toString();process.env.APP_ORIGIN='http://localhost:3000';
    await migrate(pool);await migrate(pool); // migration replay must be safe
    slug=`test-${randomUUID().slice(0,8)}`;
    const first=await createCompany(pool,{slug,name:'Empresa A',email:'owner@example.test',password});
    owner={id:first.userId,company_id:first.companyId,role:'OWNER',name:'Owner'};
    const second=await createCompany(pool,{slug:`other-${randomUUID().slice(0,8)}`,name:'Empresa B',email:'owner@example.test',password});
    other={id:second.userId,company_id:second.companyId,role:'OWNER',name:'Other'};
    source=(await createLocation(pool,owner,{name:'Sucursal Centro',kind:'STORE'})).id;
    destination=(await createLocation(pool,owner,{name:'Sucursal Norte',kind:'STORE'})).id;
    foreignLocation=(await createLocation(pool,other,{name:'Tienda B',kind:'STORE'})).id;
    const a=await createUser(pool,owner,{name:'Agente',email:'agent@example.test',password,role:'AGENT',locationIds:[source]});
    agent={id:a.id,company_id:owner.company_id,role:'AGENT',name:a.name};
    const c=await createUser(pool,owner,{name:'Cliente',email:'client@example.test',password,role:'CUSTOMER'});
    customer={id:c.id,company_id:owner.company_id,role:'CUSTOMER',name:c.name};
  });
  after(async()=>{
    if(pool)await pool.end();
    if(process.env.DATABASE_URL)await database().end();
    if(adminPool){await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end();}
  });
  async function product(quantity=0) {
    const p=await createProduct(pool,owner,{sku:randomUUID(),name:'Producto de prueba',priceMinor:19990});
    if(quantity)await applyOperation(pool,owner,randomUUID(),{kind:'RECEIPT',productId:p.id,locationId:source,quantity,reason:'Carga inicial'});
    return p.id as string;
  }
  async function balance(id:string,location=source){return (await pool.query('SELECT on_hand,reserved FROM stock WHERE company_id=$1 AND product_id=$2 AND location_id=$3',[owner.company_id,id,location])).rows[0];}
  const rejects=(fn:()=>Promise<unknown>,code:string)=>assert.rejects(fn,(e:{code?:string})=>e.code===code);

  test('15 simultaneous sales of 10 units: exactly 10 succeed, no negative stock',async()=>{
    const id=await product(10);
    const results=await Promise.allSettled(Array.from({length:15},()=>applyOperation(pool,owner,randomUUID(),{kind:'SALE',productId:id,locationId:source,quantity:1,reason:'Venta local'})));
    assert.equal(results.filter(v=>v.status==='fulfilled').length,10);
    for(const r of results)if(r.status==='rejected')assert.equal(r.reason.code,'INSUFFICIENT_STOCK');
    assert.equal((await balance(id)).on_hand,0);
  });
  test('concurrent duplicate requests deduct only once and reject a changed payload',async()=>{
    const id=await product(20),key=randomUUID();
    const input={kind:'SALE' as const,productId:id,locationId:source,quantity:5,reason:'Venta repetida'};
    const results=await Promise.all([applyOperation(pool,owner,key,input),applyOperation(pool,owner,key,input)]);
    assert.equal(results[0].id,results[1].id);assert.equal(results.filter(v=>v.replayed).length,1);
    assert.equal((await balance(id)).on_hand,15);
    await rejects(()=>applyOperation(pool,owner,key,{...input,quantity:6}),'IDEMPOTENCY_CONFLICT');
  });
  test('transfers preserve total stock and record both movements',async()=>{
    const id=await product(12);
    const result=await applyOperation(pool,owner,randomUUID(),{kind:'TRANSFER',productId:id,locationId:source,destinationId:destination,quantity:4,reason:'Traslado sucursal'});
    assert.equal((await balance(id)).on_hand,8);assert.equal((await balance(id,destination)).on_hand,4);
    assert.deepEqual(result.movements.map(v=>v.delta).sort((a,b)=>a-b),[-4,4]);
  });
  test('failure on transfer destination rolls back source and ledger',async()=>{
    const id=await product(5);
    await pool.query('INSERT INTO stock(company_id,product_id,location_id,on_hand) VALUES($1,$2,$3,2147483647)',[owner.company_id,id,destination]);
    const key=randomUUID();
    await rejects(()=>applyOperation(pool,owner,key,{kind:'TRANSFER',productId:id,locationId:source,destinationId:destination,quantity:1,reason:'Transferencia excedida'}),'INSUFFICIENT_STOCK');
    assert.equal((await balance(id)).on_hand,5);
    assert.equal((await pool.query('SELECT 1 FROM inventory_operations WHERE company_id=$1 AND idempotency_key=$2',[owner.company_id,key])).rowCount,0);
  });
  test('reserved stock cannot be sold or removed by adjustment',async()=>{
    const id=await product(5);
    await pool.query('UPDATE stock SET reserved=4 WHERE company_id=$1 AND product_id=$2',[owner.company_id,id]);
    for(const kind of ['SALE','ADJUSTMENT'] as const)await rejects(()=>applyOperation(pool,owner,randomUUID(),{kind,productId:id,locationId:source,quantity:kind==='SALE'?2:-2,reason:'Prueba reservas'}),'INSUFFICIENT_STOCK');
    assert.deepEqual(await balance(id),{on_hand:5,reserved:4});
  });
  test('customers cannot mutate inventory or create products',async()=>{
    const id=await product(2);
    await rejects(()=>applyOperation(pool,customer,randomUUID(),{kind:'SALE',productId:id,locationId:source,quantity:1,reason:'Intento cliente'}),'FORBIDDEN');
    await rejects(()=>createProduct(pool,customer,{sku:'x',name:'x',priceMinor:0}),'FORBIDDEN');
  });
  test('agents are restricted to assigned branches including transfer destinations',async()=>{
    const id=await product(5);
    await applyOperation(pool,agent,randomUUID(),{kind:'SALE',productId:id,locationId:source,quantity:1,reason:'Venta agente'});
    await rejects(()=>applyOperation(pool,agent,randomUUID(),{kind:'TRANSFER',productId:id,locationId:source,destinationId:destination,quantity:1,reason:'Destino no autorizado'}),'LOCATION_FORBIDDEN');
    assert.equal((await balance(id)).on_hand,4);
    const visible=await inventory(pool,agent);assert(visible.items.every(v=>v.location_id===source));
    await patchLocation(pool,agent,source,{shippingEnabled:true});
    await rejects(()=>patchLocation(pool,agent,source,{name:'Nuevo nombre'}),'FORBIDDEN');
    await rejects(()=>createUser(pool,agent,{name:'x'}),'FORBIDDEN');
  });
  test('company separation holds for reads, updates and database foreign keys',async()=>{
    const id=await product(3);
    await rejects(()=>applyOperation(pool,other,randomUUID(),{kind:'SALE',productId:id,locationId:foreignLocation,quantity:1,reason:'Cruce empresa'}),'PRODUCT_NOT_FOUND');
    await rejects(()=>patchProduct(pool,other,id,{name:'Intrusión'}),'PRODUCT_NOT_FOUND');
    assert.equal((await inventory(pool,other)).items.length,0);
    await assert.rejects(()=>pool.query('INSERT INTO stock(company_id,product_id,location_id) VALUES($1,$2,$3)',[other.company_id,id,foreignLocation]),(e:{code:string})=>e.code==='23503');
  });
  test('public catalog exposes available quantity and excludes inactive products/locations',async()=>{
    const id=await product(8);await pool.query('UPDATE stock SET reserved=3 WHERE company_id=$1 AND product_id=$2',[owner.company_id,id]);
    const result=await publicCatalog(pool,slug,100);
    const p=result.products.find(v=>v.id===id)!;
    assert.equal(p.availability.find((v:{locationId:string})=>v.locationId===source).available,5);
    assert(!('password_hash' in p));assert(!('on_hand' in p.availability[0]));
    await rejects(()=>patchProduct(pool,owner,id,{active:false}),'RESERVATIONS_EXIST');
    // This legacy fixture has synthetic reserved units, not an order to cancel.
    await pool.query('UPDATE stock SET reserved=0 WHERE company_id=$1 AND product_id=$2',[owner.company_id,id]);
    await patchProduct(pool,owner,id,{active:false});
    assert(!(await publicCatalog(pool,slug,100)).products.some(v=>v.id===id));
  });
  test('ledger rejects mutation and audit total equals on_hand',async()=>{
    const id=await product(7);
    await applyOperation(pool,owner,randomUUID(),{kind:'ADJUSTMENT',productId:id,locationId:source,quantity:-2,reason:'Corrección conteo'});
    const result=await pool.query('SELECT sum(delta)::integer AS total FROM stock_movements WHERE company_id=$1 AND product_id=$2',[owner.company_id,id]);
    assert.equal(result.rows[0].total,(await balance(id)).on_hand);
    await assert.rejects(()=>pool.query('UPDATE stock_movements SET delta=100 WHERE product_id=$1',[id]));
  });
  test('authentication, expiry, logout and API permissions',async()=>{
    const result=await login(pool,{company:slug,email:'owner@example.test',password});
    assert.equal((await authenticate(pool,result.token)).id,owner.id);
    await rejects(()=>authenticate(pool,'invalid'),'UNAUTHENTICATED');
    const apiLogin=await POST(new Request('http://localhost:3000/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({company:slug,email:'client@example.test',password})}),{params:Promise.resolve({path:['auth','login']})});
    assert.equal(apiLogin.status,200);const session=apiLogin.headers.get('set-cookie')!.split(';')[0];
    assert.match(apiLogin.headers.get('set-cookie')!,/HttpOnly/);
    const blocked=await GET(new Request('http://localhost:3000/api/inventory',{headers:{cookie:session}}),{params:Promise.resolve({path:['inventory']})});assert.equal(blocked.status,403);
    const crossOrigin=await PATCH(new Request('http://localhost:3000/api/locations/x',{method:'PATCH',headers:{origin:'https://evil.example',cookie:session}}),{params:Promise.resolve({path:['locations','x']})});assert.equal(crossOrigin.status,403);
    const logout=await POST(new Request('http://localhost:3000/api/auth/logout',{method:'POST',headers:{cookie:session}}),{params:Promise.resolve({path:['auth','logout']})});assert.equal(logout.status,200);
    const expired=await GET(new Request('http://localhost:3000/api/auth/me',{headers:{cookie:session}}),{params:Promise.resolve({path:['auth','me']})});assert.equal(expired.status,401);
    await pool.query('UPDATE sessions SET expires_at=now()-interval \'1 second\' WHERE user_id=$1',[owner.id]);
    await rejects(()=>authenticate(pool,result.token),'UNAUTHENTICATED');
  });
  test('invalid JSON, excessive bodies and schema abuse are rejected',async()=>{
    await rejects(()=>body(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:'{'})),'INVALID_JSON');
    await rejects(()=>body(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'x'.repeat(65537)})})),'BODY_TOO_LARGE');
    const id=await product(1);
    await assert.rejects(()=>applyOperation(pool,owner,randomUUID(),{kind:'SALE',productId:id,locationId:source,quantity:-1,reason:'Venta negativa'}));
    const result=await POST(new Request('http://localhost:3000/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({company:slug,email:'x@example.test',password:'x',role:'OWNER'})}),{params:Promise.resolve({path:['auth','login']})});assert.equal(result.status,400);
  });
  test('login throttling persists in PostgreSQL',async()=>{
    for(let i=0;i<10;i++)await rejects(()=>login(pool,{company:slug,email:'missing@example.test',password:'wrong'}),'INVALID_CREDENTIALS');
    await rejects(()=>login(pool,{company:slug,email:'missing@example.test',password:'wrong'}),'LOGIN_LIMIT');
  });
});
