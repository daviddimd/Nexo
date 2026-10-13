import {readFile,stat,writeFile} from 'node:fs/promises';
import {initializeInstallation,readInstallation} from '../src/server/installation';
import {signLicense,verifyLicense} from '../src/server/licenses';
import {Pool} from 'pg';
import {importLicense} from '../src/server/license-store';

async function smallFile(path:string){if((await stat(path)).size>65536)throw new Error('File too large');return readFile(path,'utf8');}
try{
  const [command,...args]=process.argv.slice(2);
  if(command==='init'&&args.length===1){console.log(JSON.stringify(await initializeInstallation(args[0])));}
  else if(command==='sign'&&args.length===2){
    const keyFile=process.env.NEXO_LICENSE_PRIVATE_KEY_FILE,keyId=process.env.NEXO_LICENSE_KEY_ID;
    if(!keyFile||!keyId)throw new Error('Operator signing configuration required');
    const result=signLicense(JSON.parse(await smallFile(args[0])),keyId,await smallFile(keyFile));
    await writeFile(args[1],JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});console.log('Licencia firmada.');
  }else if((command==='verify'||command==='import')&&args.length===3){
    const trustFile=process.env.NEXO_LICENSE_TRUSTED_KEYS_FILE;if(!trustFile)throw new Error('Trusted keys required');
    const identity=await readInstallation(args[1]);
    const document=JSON.parse(await smallFile(args[0])),trustedKeys=JSON.parse(await smallFile(trustFile));
    if(command==='verify')console.log(JSON.stringify(verifyLicense(document,trustedKeys,{companyId:args[2],installationId:identity.installationId})));
    else{
      const connectionString=process.env.NEXO_OPERATOR_DATABASE_URL;if(!connectionString)throw new Error('Operator connection required');
      const pool=new Pool({connectionString,connectionTimeoutMillis:5000,statement_timeout:15000});
      try{console.log(JSON.stringify(await importLicense(pool,args[2],document,{installationId:identity.installationId,trustedKeys})));}
      finally{await pool.end();}
    }
  }else throw new Error('Invalid arguments');
}catch{console.error('No se pudo completar la operación de licencia. Revisa archivos, claves y argumentos.');process.exitCode=1;}
