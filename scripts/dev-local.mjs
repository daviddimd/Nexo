import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import pg from 'pg';

const root=resolve('.nexo'),data=join(root,'postgres'),stateFile=join(root,'dev.json');
const children=[];let pgStarted=false,stopping=false,cancelled=false,bin;
function command(executable,args,env=process.env,quiet=false){return new Promise((accept,reject)=>{
  const child=spawn(executable,args,{env,stdio:quiet?'ignore':'inherit',windowsHide:true});
  child.once('error',()=>reject(new Error('No se pudo ejecutar una herramienta local.')));
  child.once('exit',code=>code===0?accept():reject(new Error('Una herramienta local no terminó correctamente.')));
});}
const tool=name=>join(bin,name+(process.platform==='win32'?'.exe':''));
async function free(port){await new Promise((accept,reject)=>{const server=createServer();server.once('error',()=>reject(new Error(`El puerto ${port} está ocupado. Detén el proceso anterior antes de iniciar Nexo.`)));server.listen(port,'127.0.0.1',()=>server.close(accept));});}
async function stop(code=0){
  if(stopping)return;stopping=true;
  for(const child of children){if(child.exitCode===null){try{
    if(process.platform==='win32')await command('taskkill',['/PID',String(child.pid),'/T','/F'],process.env,true);else child.kill('SIGTERM');
  }catch{}}}
  if(pgStarted)try{await command(tool('pg_ctl'),['-D',data,'stop','-m','fast'],process.env,true);}catch{console.error('No se pudo detener PostgreSQL local.');code=1;}
  process.exitCode=code;
}
const signal=()=>{cancelled=true;if(children.length)void stop();};
process.on('SIGINT',signal);process.on('SIGTERM',signal);
try{
  if(existsSync('.env'))loadEnvFile('.env');
  if(process.env.NODE_ENV==='production')throw new Error('Este comando es solo para desarrollo local.');
  await mkdir(root,{recursive:true});
  let state;
  if(existsSync(stateFile))state=JSON.parse(await readFile(stateFile,'utf8'));
  else{state={port:55440,user:'nexo_local_admin',password:randomBytes(32).toString('hex')};await writeFile(stateFile,JSON.stringify(state)+'\n',{flag:'wx',mode:0o600});}
  if(state.port!==55440||state.user!=='nexo_local_admin'||!/^[a-f0-9]{64}$/.test(state.password))throw new Error('Configuración local inválida; conserva los archivos y revisa .nexo/dev.json.');
  const url=`postgresql://${state.user}:${state.password}@127.0.0.1:${state.port}/nexo_dev`;
  if(process.env.DATABASE_URL&&process.env.DATABASE_URL!==url)throw new Error('Existe DATABASE_URL externa. Usa npm run dev:web para conservar ese entorno, o retírala antes de usar el entorno local integrado.');
  const webPort=Number(process.env.PORT??3000);if(!Number.isInteger(webPort)||webPort<1024||webPort>65535)throw new Error('PORT inválido.');await free(webPort);
  bin=process.env.NEXO_PG_BIN;
  if(!bin&&process.platform==='win32')for(const version of ['18','17','16']){const candidate=`C:/Program Files/PostgreSQL/${version}/bin`;if(existsSync(join(candidate,'pg_ctl.exe'))){bin=candidate;break;}}
  bin??='';
  if(!existsSync(join(data,'PG_VERSION'))){
    await free(state.port);const passwordFile=join(root,'init-password.tmp');await writeFile(passwordFile,state.password,{mode:0o600});
    try{await command(tool('initdb'),['-D',data,'-U',state.user,'--encoding=UTF8','--auth=scram-sha-256',`--pwfile=${passwordFile}`]);}
    finally{await unlink(passwordFile);}
  }
  let running=true;try{await command(tool('pg_ctl'),['-D',data,'status'],process.env,true);}catch{running=false;}
  if(cancelled)throw new Error('Inicio cancelado.');
  if(!running){await free(state.port);await command(tool('pg_ctl'),['-D',data,'-l',join(root,'postgres.log'),'-o',`-p ${state.port} -h 127.0.0.1`,'start']);pgStarted=true;}
  if(cancelled)throw new Error('Inicio cancelado.');
  const pool=new pg.Pool({connectionString:url.replace('/nexo_dev','/postgres'),connectionTimeoutMillis:5000});
  try{if(!(await pool.query("SELECT 1 FROM pg_database WHERE datname='nexo_dev'")).rowCount)await pool.query('CREATE DATABASE nexo_dev');}finally{await pool.end();}
  const env={...process.env,NODE_ENV:'development',DATABASE_URL:url,NEXO_MIGRATION_DATABASE_URL:url,APP_ORIGIN:`http://localhost:${webPort}`};
  await command(process.execPath,['--import','tsx','scripts/migrate.ts'],env);
  if(cancelled)throw new Error('Inicio cancelado.');
  if(!existsSync('.env'))await writeFile('.env',`# Entorno local Nexo; no usar en producción ni compartir.\nDATABASE_URL=${url}\nNEXO_MIGRATION_DATABASE_URL=${url}\nNEXO_OPERATOR_DATABASE_URL=${url}\nAPP_ORIGIN=http://localhost:${webPort}\nNEXO_SIMULATOR_ENABLED=false\nNEXO_LOCAL_MAIL_ENABLED=false\n`,{flag:'wx',mode:0o600});
  console.log(`\nNexo: http://localhost:${webPort}/panel\nPostgreSQL local persistente + web + worker. Ctrl+C detiene este entorno.\n`);
  const demoPath=join(root,'demo-runtime.json');
  let demo;if(existsSync(demoPath))demo=JSON.parse(await readFile(demoPath,'utf8'));else{demo={simulatorSecret:randomBytes(32).toString('hex'),mailKey:randomBytes(32).toString('hex')};await writeFile(demoPath,JSON.stringify(demo),{flag:'wx',mode:0o600});}
  if(!/^[a-f0-9]{64}$/.test(demo.simulatorSecret)||!/^[a-f0-9]{64}$/.test(demo.mailKey))throw new Error('Configuración demo inválida');
  const runtime={...env,NEXO_LOCAL_SETUP_ENABLED:'true',NEXO_LOCAL_CUSTOMER_ACCESS:'true',NEXO_SIMULATOR_ENABLED:'true',NEXO_LOCAL_SIMULATOR_SECRET:demo.simulatorSecret,NEXO_LOCAL_MAIL_ENABLED:'true',NEXO_LOCAL_MAIL_KEY:env.NEXO_LOCAL_MAIL_KEY??demo.mailKey};delete runtime.NEXO_MIGRATION_DATABASE_URL;delete runtime.NEXO_OPERATOR_DATABASE_URL;
  for(const args of [['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(webPort)],['--import','tsx','scripts/expire-orders.ts','--watch']]){
    if(stopping)break;const child=spawn(process.execPath,args,{env:runtime,stdio:'inherit',windowsHide:true});children.push(child);
    child.once('error',()=>void stop(1));child.once('exit',code=>{if(!stopping)void stop(code??1);});
  }
}catch(error){console.error(error.message?.startsWith('El puerto')||error.message?.startsWith('Existe DATABASE_URL')?error.message:'No se pudo iniciar el entorno local. Revisa PostgreSQL instalado, puertos y configuración .nexo.');await stop(1);}
