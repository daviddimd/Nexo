import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {ensure} from './errors';

function localKey(){
  ensure(process.env.NEXO_LOCAL_MAIL_ENABLED==='true'&&process.env.NODE_ENV!=='production',503,'MAIL_UNAVAILABLE','Correo local no disponible');
  const key=process.env.NEXO_LOCAL_MAIL_KEY??'';
  ensure(/^[a-fA-F0-9]{64}$/.test(key),503,'MAIL_UNAVAILABLE','Configura una clave de correo local de 32 bytes');
  return Buffer.from(key,'hex');
}
export function assertLocalMail(){localKey();}
export function encryptLocalMail(payload:unknown,companyId:string,messageId:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',localKey(),iv);
  cipher.setAAD(Buffer.from(`${companyId}.${messageId}`));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),ciphertext].map(b=>b.toString('base64url')).join('.');
}
export function decryptLocalMail(encrypted:string,companyId:string,messageId:string):unknown{
  const [iv,tag,ciphertext]=encrypted.split('.').map(v=>Buffer.from(v,'base64url'));
  const decipher=createDecipheriv('aes-256-gcm',localKey(),iv);decipher.setAAD(Buffer.from(`${companyId}.${messageId}`));decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));
}
