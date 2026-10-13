import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyRelease} from '../scripts/verify-release.mjs';
async function fixture(fn:(dir:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'nexo-release-'));try{
  await writeFile(join(dir,'server.js'),'example');
  await writeFile(join(dir,'release-manifest.json'),JSON.stringify({version:'test',platform:process.platform,architecture:process.arch,
    files:[{path:'server.js',sha256:createHash('sha256').update('example').digest('hex')}]}));await fn(dir);
}finally{await rm(dir,{recursive:true,force:true});}}
test('manifest validates expected file contents',()=>fixture(async dir=>assert.equal((await verifyRelease(dir)).valid,true)));
test('manifest rejects modified files',()=>fixture(async dir=>{await writeFile(join(dir,'server.js'),'modified');await assert.rejects(()=>verifyRelease(dir));}));
test('manifest rejects unexpected private files',()=>fixture(async dir=>{await writeFile(join(dir,'.env'),'secret');await assert.rejects(()=>verifyRelease(dir));}));
