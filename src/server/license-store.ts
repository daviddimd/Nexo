import {randomUUID} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {owner,digest,type Actor} from './auth';
import {transaction} from './db';
import {stockTransaction} from './stock-transaction';
import {lockCompany} from './order-store';
import {ensure} from './errors';
import {readInstallation} from './installation';
import {verifyLicense,type SignedLicense,type LicenseClaims} from './licenses';

export type LicenseContext={installationId:string;trustedKeys:Readonly<Record<string,string>>};
export async function runtimeLicenseContext():Promise<LicenseContext>{
  try{
    const identityFile=process.env.NEXO_INSTALLATION_FILE,keysFile=process.env.NEXO_LICENSE_TRUSTED_KEYS_FILE;
    if(!identityFile||!keysFile||(await stat(keysFile)).size>65536)throw new Error();
    const identity=await readInstallation(identityFile);
    const keys=z.record(z.string(),z.string().max(8192)).parse(JSON.parse(await readFile(keysFile,'utf8')));
    return {installationId:identity.installationId,trustedKeys:keys};
  }catch{ensure(false,503,'LICENSE_CONFIGURATION_REQUIRED','Configura identidad y claves públicas de la instalación');}
}
async function databaseBinding(db:PoolClient,context:LicenseContext){
  const row=(await db.query<{installation_id:string}>('SELECT installation_id FROM installation_identity')).rows[0];
  ensure(!row||row.installation_id===context.installationId,409,'INSTALLATION_MISMATCH','La identidad no corresponde a esta base');
}
function documentHash(token:SignedLicense){return digest(JSON.stringify([token.algorithm,token.keyId,token.payload,token.signature]));}
function matchingTerms(row:Record<string,unknown>,claims:LicenseClaims){
  for(const [column,field] of [['effective_at','effectiveAt'],['starts_at','startsAt'],['access_until','accessUntil'],['updates_until','updatesUntil'],['support_until','supportUntil']] as const){
    const actual=row[column],expected=claims[field];
    if(actual===null?expected!==null:!(actual instanceof Date)||expected===null||actual.getTime()!==Date.parse(expected))return false;
  }
  return row.mode===claims.mode&&row.status===claims.status;
}
// Operator-only import: tenant HTTP routes deliberately provide reads only.
export async function importLicense(pool:Pool,companyId:string,raw:unknown,context:LicenseContext){
  z.uuid().parse(companyId);z.uuid().parse(context.installationId);
  return transaction(pool,async db=>{
    await lockCompany(db,companyId);
    // Serialize the first identity registration across different companies too.
    await db.query('SELECT pg_advisory_xact_lock(713491282)');
    await databaseBinding(db,context);
    const at=(await db.query<{at:Date}>('SELECT clock_timestamp() at')).rows[0].at;
    let verified:ReturnType<typeof verifyLicense>;
    try{verified=verifyLicense(raw,context.trustedKeys,{companyId,installationId:context.installationId},at);}
    catch{ensure(false,400,'INVALID_LICENSE','Firma, identidad o condiciones de licencia inválidas');}
    const claims=verified.claims,token=raw as SignedLicense,hash=documentHash(token);
    const latest=(await db.query<{revision:number}>('SELECT revision FROM license_imports WHERE company_id=$1 ORDER BY revision DESC LIMIT 1',[companyId])).rows[0]?.revision??0;
    const existing=(await db.query<{id:string;document_hash:string}>('SELECT id,document_hash FROM license_imports WHERE company_id=$1 AND revision=$2',[companyId,claims.revision])).rows[0];
    if(existing){
      ensure(existing.document_hash===hash,409,'LICENSE_REVISION_CONFLICT','Revisión ya importada con otro documento');
      return {id:existing.id,revision:claims.revision,latestRevision:latest,replayed:true};
    }
    ensure(claims.revision>latest,409,'LICENSE_ROLLBACK','No se puede importar una revisión anterior');
    const commercial=(await db.query('SELECT * FROM commercial_revisions WHERE company_id=$1 AND revision=$2',[companyId,claims.revision])).rows[0];
    ensure(commercial&&matchingTerms(commercial,claims),409,'LICENSE_COMMERCIAL_MISMATCH','La licencia no coincide con la revisión comercial');
    await db.query('INSERT INTO installation_identity(installation_id) VALUES($1) ON CONFLICT(singleton) DO NOTHING',[context.installationId]);
    const id=randomUUID();
    await db.query(`INSERT INTO license_imports(id,company_id,installation_id,revision,license_id,commercial_id,envelope,document_hash,effective_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,companyId,context.installationId,claims.revision,claims.licenseId,commercial.id,JSON.stringify(token),hash,claims.effectiveAt]);
    await db.query(`INSERT INTO administrative_events(id,company_id,actor_id,action,entity_id,details) VALUES($1,$2,NULL,'LICENSE_IMPORTED',$3,$4)`,
      [randomUUID(),companyId,id,JSON.stringify({revision:claims.revision,licenseId:claims.licenseId,keyId:token.keyId,source:'OPERATOR_CLI'})]);
    return {id,revision:claims.revision,latestRevision:claims.revision,replayed:false};
  });
}
type Imported={id:string;revision:number;license_id:string;imported_at:Date;effective_at:Date;envelope:SignedLicense};
export async function licenseSummary(pool:Pool,actor:Actor,context:LicenseContext){
  owner(actor);return stockTransaction(pool,actor,async db=>{
    await databaseBinding(db,context);
    const at=(await db.query<{at:Date}>('SELECT clock_timestamp() at')).rows[0].at;
    const rows=(await db.query<Imported>('SELECT id,revision,license_id,imported_at,effective_at,envelope FROM license_imports WHERE company_id=$1 ORDER BY revision DESC',[actor.company_id])).rows;
    const validated=rows.map(row=>{
      try{return {row,result:verifyLicense(row.envelope,context.trustedKeys,{companyId:actor.company_id,installationId:context.installationId},at)};}
      catch{return {row,result:null};}
    });
    // Select by signed effective date first. Never fall back from an invalid effective revision.
    const current=validated.find(v=>v.row.effective_at<=at);
    const view=(v:typeof validated[number])=>({id:v.row.id,revision:v.row.revision,licenseId:v.row.license_id,importedAt:v.row.imported_at,
      state:v.result?.state??'INVALID_SIGNATURE',claims:v.result?.claims??null,updatesActive:v.result?.updatesActive??false,supportActive:v.result?.supportActive??false});
    return {asOf:at,installationId:context.installationId,latestRevision:rows[0]?.revision??0,state:current?view(current).state:rows.length?'SCHEDULED':'UNCONFIGURED',
      current:current?view(current):null,scheduled:validated.filter(v=>v.row.revision>(current?.row.revision??0)).map(view),operationalRestriction:'NONE',billingEnabled:false};
  });
}
export async function licenseHistory(pool:Pool,actor:Actor,limit=50,offset=0){
  owner(actor);return stockTransaction(pool,actor,async db=>{
    const {rows}=await db.query('SELECT id,revision,license_id,installation_id,commercial_id,imported_at FROM license_imports WHERE company_id=$1 ORDER BY revision DESC LIMIT $2 OFFSET $3',[actor.company_id,limit,offset]);
    return {items:rows,limit,offset};
  });
}
