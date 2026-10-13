import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {migrate} from '../scripts/migrate';
import {createCompany,type Actor} from '../src/server/auth';
import {createLocation,createProduct} from '../src/server/manage';
import {applyOperation} from '../src/server/inventory';
import {backupDatabase,restoreTestDatabase} from '../scripts/backup-store';

test('PostgreSQL custom archive restores accounts, stock, ledger and migration history',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const original=new URL(process.env.TEST_DATABASE_URL!);assert.match(original.pathname,/test/i);
  const suffix=randomUUID().replaceAll('-',''),schema=`nexo_backup_${suffix}`,target=`nexo_${suffix}_restore_test`;
  const admin=new Pool({connectionString:original.toString()});let source:Pool|undefined,restored:Pool|undefined;
  const dir=await mkdtemp(join(tmpdir(),'nexo-backup-')),file=join(dir,'backup.dump');
  const bin=process.env.NEXO_PG_BIN;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);await admin.query(`CREATE DATABASE "${target}"`);
    const sourceUrl=new URL(original);sourceUrl.searchParams.set('options',`-c search_path=${schema}`);source=new Pool({connectionString:sourceUrl.toString()});await migrate(source);
    const c=await createCompany(source,{slug:'restore-pyme',name:'Restore pyme',email:'owner@example.test',password:'Restore-password-123!'});
    const actor:Actor={id:c.userId,company_id:c.companyId,name:'Owner',role:'OWNER'};
    const branch=await createLocation(source,actor,{name:'Centro',kind:'STORE'}),product=await createProduct(source,actor,{sku:'SSD',name:'SSD',priceMinor:1000});
    await applyOperation(source,actor,randomUUID(),{kind:'RECEIPT',productId:product.id,locationId:branch.id,quantity:5,reason:'Carga inicial'});
    await applyOperation(source,actor,randomUUID(),{kind:'SALE',productId:product.id,locationId:branch.id,quantity:2,reason:'Venta inicial'});
    await backupDatabase(original.toString(),schema,file,bin);
    const archive=await readFile(file);assert.equal(archive.subarray(0,5).toString(),'PGDMP');
    await assert.rejects(()=>backupDatabase(original.toString(),schema,file,bin));assert.deepEqual(await readFile(file),archive);
    await assert.rejects(()=>restoreTestDatabase(original.toString(),file,bin));
    const targetUrl=new URL(original);targetUrl.pathname='/'+target;targetUrl.searchParams.delete('options');
    const corrupt=join(dir,'corrupt.dump');await writeFile(corrupt,'invalid archive');
    await assert.rejects(()=>restoreTestDatabase(targetUrl.toString(),corrupt,bin));
    await restoreTestDatabase(targetUrl.toString(),file,bin);
    targetUrl.searchParams.set('options',`-c search_path=${schema}`);restored=new Pool({connectionString:targetUrl.toString()});
    for(const table of ['companies','users','products','locations','stock','stock_movements','inventory_operations','schema_migrations']){
      assert.deepEqual((await restored.query(`SELECT * FROM ${table} ORDER BY 1`)).rows,(await source.query(`SELECT * FROM ${table} ORDER BY 1`)).rows);
    }
    assert.deepEqual((await restored.query('SELECT on_hand,reserved FROM stock')).rows[0],{on_hand:3,reserved:0});
    await assert.rejects(()=>restored!.query('DELETE FROM stock_movements'));
    await assert.rejects(()=>restoreTestDatabase(targetUrl.toString(),file,bin));
    await migrate(restored); // Checksums are still compatible after restoration.
  }finally{
    if(restored)await restored.end();if(source)await source.end();
    await admin.query(`DROP DATABASE IF EXISTS "${target}" WITH (FORCE)`);await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
    await rm(dir,{recursive:true,force:true});
  }
});
