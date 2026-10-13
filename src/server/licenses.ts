import {createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {z} from 'zod';

const instant=z.iso.datetime({offset:true});
export const licenseClaims=z.object({
  format:z.literal('nexo-license-v1'),licenseId:z.uuid(),installationId:z.uuid(),companyId:z.uuid(),
  revision:z.number().int().positive().max(2147483647),issuedAt:instant,effectiveAt:instant,startsAt:instant,
  mode:z.enum(['SUBSCRIPTION','PERPETUAL']),status:z.enum(['ENABLED','CANCELLED']),
  accessUntil:instant.nullable(),updatesUntil:instant,supportUntil:instant
}).strict().superRefine((v,ctx)=>{
  const start=Date.parse(v.startsAt);
  if(v.mode==='SUBSCRIPTION'&&(v.accessUntil===null||Date.parse(v.accessUntil)<=start))ctx.addIssue({code:'custom',message:'Invalid subscription period'});
  if(v.mode==='PERPETUAL'&&v.accessUntil!==null)ctx.addIssue({code:'custom',message:'Perpetual access cannot expire'});
  if(Date.parse(v.updatesUntil)<start||Date.parse(v.supportUntil)<start)ctx.addIssue({code:'custom',message:'Invalid coverage period'});
});
export type LicenseClaims=z.infer<typeof licenseClaims>;
const encoded=z.string().min(1).max(16384).regex(/^[A-Za-z0-9_-]+$/);
const envelope=z.object({algorithm:z.literal('Ed25519'),keyId:z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),payload:encoded,signature:encoded}).strict();
export type SignedLicense=z.infer<typeof envelope>;
function decode(value:string){const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)throw new Error('Noncanonical encoding');return bytes;}
// The key identifier and format are authenticated along with the exact payload bytes.
function message(keyId:string,payload:string){return Buffer.from(`nexo-license-v1\nEd25519\n${keyId}\n${payload}`,'utf8');}
export function signLicense(raw:unknown,keyId:string,privatePem:string):SignedLicense{
  const claims=licenseClaims.parse(raw);
  const key=createPrivateKey(privatePem);if(key.asymmetricKeyType!=='ed25519')throw new Error('Ed25519 key required');
  const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
  envelope.parse({algorithm:'Ed25519',keyId,payload,signature:'AA'});
  return {algorithm:'Ed25519',keyId,payload,signature:sign(null,message(keyId,payload),key).toString('base64url')};
}
export function verifyLicense(raw:unknown,trustedKeys:Readonly<Record<string,string>>,binding:{companyId:string;installationId:string},at=new Date()){
  const token=envelope.parse(raw);
  if(!Object.hasOwn(trustedKeys,token.keyId))throw new Error('Untrusted signing key');
  const key=createPublicKey(trustedKeys[token.keyId]);if(key.asymmetricKeyType!=='ed25519')throw new Error('Ed25519 key required');
  const payload=decode(token.payload),signature=decode(token.signature);
  if(signature.length!==64||!verify(null,message(token.keyId,token.payload),key,signature))throw new Error('Invalid signature');
  const claims=licenseClaims.parse(JSON.parse(payload.toString('utf8')));
  if(claims.companyId!==z.uuid().parse(binding.companyId)||claims.installationId!==z.uuid().parse(binding.installationId))throw new Error('License binding mismatch');
  const now=at.getTime();if(!Number.isFinite(now))throw new Error('Invalid clock');
  if(Date.parse(claims.issuedAt)>now)throw new Error('License issued in the future');
  const effective=Date.parse(claims.effectiveAt)<=now,started=Date.parse(claims.startsAt)<=now;
  const state=!effective?'SCHEDULED':claims.status==='CANCELLED'?'CANCELLED':!started?'SCHEDULED':claims.accessUntil!==null&&Date.parse(claims.accessUntil)<=now?'EXPIRED':'ACTIVE';
  return {claims,state,updatesActive:effective&&started&&claims.status==='ENABLED'&&Date.parse(claims.updatesUntil)>now,
    supportActive:effective&&started&&claims.status==='ENABLED'&&Date.parse(claims.supportUntil)>now,
    operationalRestriction:'NONE' as const,billingEnabled:false};
}
