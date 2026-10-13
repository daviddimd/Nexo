import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {database} from '../src/server/db';
import {uuid} from '../src/server/schemas';
import {assertLocalMail,decryptLocalMail} from '../src/server/local-mail';

const pool=database();
try{
  if(process.env.NODE_ENV!=='production'&&!process.env.NEXO_LOCAL_MAIL_KEY&&existsSync('.nexo/demo-runtime.json')){
    const demo=JSON.parse(await readFile('.nexo/demo-runtime.json','utf8'));
    process.env.NEXO_LOCAL_MAIL_ENABLED='true';process.env.NEXO_LOCAL_MAIL_KEY=demo.mailKey;
  }
  assertLocalMail();const companyId=uuid.parse(process.argv[2]);const messageId=process.argv[3]?uuid.parse(process.argv[3]):null;
  if(!messageId){
    const {rows}=await pool.query(`SELECT m.id,m.recipient,m.purpose,m.expires_at FROM available_local_mail m
      WHERE m.company_id=$1
      ORDER BY m.created_at DESC LIMIT 50`,[companyId]);
    console.log(JSON.stringify(rows,null,2));
  }else{
    const {rows}=await pool.query(`SELECT m.encrypted_payload FROM available_local_mail m
      WHERE m.company_id=$1 AND m.id=$2`,[companyId,messageId]);
    if(!rows[0])throw new Error('No local message');
    const payload=decryptLocalMail(rows[0].encrypted_payload,companyId,messageId);
    const directory=resolve('.local-mail');await mkdir(directory,{recursive:true,mode:0o700});
    const path=resolve(directory,`${messageId}.json`);
    await writeFile(path,JSON.stringify(payload,null,2),{flag:'wx',mode:0o600});
    console.log(`Mensaje local guardado en ${path}. Contiene un token sensible; eliminarlo tras la prueba.`);
  }
}catch{console.error('No se pudo leer el correo local. Comprueba modo, clave, empresa e ID; no se sobrescriben exportaciones existentes.');process.exitCode=1;}
finally{await pool.end();}
