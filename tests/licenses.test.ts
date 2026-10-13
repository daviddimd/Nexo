import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {signLicense,verifyLicense,type LicenseClaims} from '../src/server/licenses';
import {initializeInstallation,readInstallation} from '../src/server/installation';

const pair=generateKeyPairSync('ed25519');
const privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const publicPem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
const trust={key1:publicPem};
const claims:LicenseClaims={format:'nexo-license-v1',licenseId:randomUUID(),companyId:randomUUID(),installationId:randomUUID(),revision:1,
  issuedAt:'2026-01-01T00:00:00Z',effectiveAt:'2026-01-01T00:00:00Z',startsAt:'2026-01-01T00:00:00Z',mode:'SUBSCRIPTION',status:'ENABLED',
  accessUntil:'2027-01-01T00:00:00Z',updatesUntil:'2026-06-01T00:00:00Z',supportUntil:'2026-09-01T00:00:00Z'};
const now=new Date('2026-10-12T00:00:00Z');
const check=(raw:unknown,keys:Record<string,string>=trust,binding={companyId:claims.companyId,installationId:claims.installationId})=>verifyLicense(raw,keys,binding,now);
const issue=(patch:Partial<LicenseClaims>={})=>signLicense({...claims,...patch},'key1',privatePem);

test('signed subscription verifies with independent support and update periods',()=>{
  const result=check(issue());assert.equal(result.state,'ACTIVE');assert.equal(result.updatesActive,false);assert.equal(result.supportActive,false);
  assert.equal(result.operationalRestriction,'NONE');assert.equal(result.billingEnabled,false);
});
test('payload, signature, key identifier and algorithm tampering rejected',()=>{
  const token=issue();const modified={...claims,accessUntil:'2099-01-01T00:00:00Z'};
  assert.throws(()=>check({...token,payload:Buffer.from(JSON.stringify(modified)).toString('base64url')}));
  const signature=Buffer.from(token.signature,'base64url');signature[0]^=1;
  assert.throws(()=>check({...token,signature:signature.toString('base64url')}));
  assert.throws(()=>check({...token,keyId:'key2'},{key1:publicPem,key2:publicPem}));
  assert.throws(()=>check({...token,algorithm:'none'}));
});
test('unknown signer and replacement public key rejected',()=>{
  assert.throws(()=>check(issue(),{} as typeof trust));
  const other=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
  assert.throws(()=>check(issue(),{key1:other}));
});
test('company and installation bindings are required',()=>{
  assert.throws(()=>check(issue(),trust,{companyId:randomUUID(),installationId:claims.installationId}));
  assert.throws(()=>check(issue(),trust,{companyId:claims.companyId,installationId:randomUUID()}));
});
test('expired and cancelled signed terms remain informational',()=>{
  assert.equal(check(issue({accessUntil:'2026-10-12T00:00:00Z'})).state,'EXPIRED');
  const result=check(issue({status:'CANCELLED'}));assert.equal(result.state,'CANCELLED');assert.equal(result.operationalRestriction,'NONE');
});
test('perpetual use survives coverage expiry without invented renewal',()=>{
  assert.equal(check(issue({mode:'PERPETUAL',accessUntil:null})).state,'ACTIVE');
  assert.throws(()=>issue({mode:'PERPETUAL'}));assert.throws(()=>issue({accessUntil:null}));
});
test('future activation and future starts are scheduled; future issuance rejected',()=>{
  assert.equal(check(issue({effectiveAt:'2026-12-01T00:00:00Z'})).state,'SCHEDULED');
  assert.equal(check(issue({startsAt:'2026-11-01T00:00:00Z',updatesUntil:'2027-01-01T00:00:00Z',supportUntil:'2027-01-01T00:00:00Z'})).state,'SCHEDULED');
  assert.throws(()=>check(issue({issuedAt:'2026-12-01T00:00:00Z'})));
});
test('strict schema rejects extra capabilities, invalid periods and invalid revisions',()=>{
  assert.throws(()=>signLicense({...claims,unlimited:true},'key1',privatePem));
  assert.throws(()=>issue({updatesUntil:'2025-01-01T00:00:00Z'}));
  assert.throws(()=>issue({revision:0}));assert.throws(()=>issue({accessUntil:claims.startsAt}));
});
test('noncanonical, oversized and malformed envelope rejected',()=>{
  const token=issue();assert.throws(()=>check({...token,payload:token.payload+'='}));
  assert.throws(()=>check({...token,payload:'A'.repeat(16385)}));assert.throws(()=>check({...token,publicKey:publicPem}));
  assert.throws(()=>check({...token,signature:'AA'}));
});
test('non Ed25519 signing keys rejected',()=>{
  const rsa=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
  assert.throws(()=>signLicense(claims,'key1',rsa));
});
test('initialization preserves identity across repeated and concurrent calls',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'nexo-identity-'));try{
    const path=join(dir,'installation.json');
    const results=await Promise.all(Array.from({length:5},()=>initializeInstallation(path)));
    const original=results[0];
    for(const result of results)assert.deepEqual(result,original);
    assert.deepEqual(await readInstallation(path),original);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('missing or corrupt identity fails without silent replacement',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'nexo-identity-'));try{
    const path=join(dir,'installation.json');await assert.rejects(()=>readInstallation(path));
    await writeFile(path,'broken');await assert.rejects(()=>initializeInstallation(path));assert.equal(await readFile(path,'utf8'),'broken');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('operator CLI signs, verifies binding and refuses overwriting an issued file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'nexo-license-cli-'));try{
    const identityFile=join(dir,'installation.json'),privateFile=join(dir,'signer.private.pem'),trustedFile=join(dir,'trust.json');
    const input=join(dir,'claims.json'),output=join(dir,'license.json');
    const identity=await initializeInstallation(identityFile);
    await writeFile(privateFile,privatePem);await writeFile(trustedFile,JSON.stringify(trust));
    await writeFile(input,JSON.stringify({...claims,installationId:identity.installationId}));
    const env={...process.env,NEXO_LICENSE_PRIVATE_KEY_FILE:privateFile,NEXO_LICENSE_KEY_ID:'key1',NEXO_LICENSE_TRUSTED_KEYS_FILE:trustedFile};
    const cli=(args:string[])=>spawnSync(process.execPath,['--import','tsx','scripts/license.ts',...args],{env,encoding:'utf8'});
    const signed=cli(['sign',input,output]);assert.equal(signed.status,0,signed.stderr);assert.ok(!signed.stdout.includes('PRIVATE KEY'));
    const original=await readFile(output,'utf8');assert.notEqual(cli(['sign',input,output]).status,0);assert.equal(await readFile(output,'utf8'),original);
    const verified=cli(['verify',output,identityFile,claims.companyId]);assert.equal(verified.status,0,verified.stderr);
    assert.equal(JSON.parse(verified.stdout).operationalRestriction,'NONE');
    assert.notEqual(cli(['verify',output,identityFile,randomUUID()]).status,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
