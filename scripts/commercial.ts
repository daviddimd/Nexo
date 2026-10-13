import {readFile,stat} from 'node:fs/promises';
import {Pool} from 'pg';
import {recordCommercial} from '../src/server/commercial';
import {onboardCompany} from '../src/server/onboarding';

// Deliberately separate from the application's connection string; no fallback.
const connectionString=process.env.NEXO_OPERATOR_DATABASE_URL;
let pool:Pool|undefined;
try{
  if(!connectionString)throw new Error('Operator connection required');
  const [command,companyId,key,file]=process.argv.slice(2);
  if(!file||!key||!['record','onboard'].includes(command))throw new Error('Invalid arguments');
  if((await stat(file)).size>65536)throw new Error('File too large');
  const terms=JSON.parse(await readFile(file,'utf8'));
  pool=new Pool({connectionString,connectionTimeoutMillis:5000,statement_timeout:15000});
  if(command==='record'){
    const result=await recordCommercial(pool,companyId,key,terms);
    console.log(JSON.stringify({companyId,revision:result.record.revision,replayed:result.replayed,currentState:result.summary.state}));
  }else{
    if(companyId!=='new')throw new Error('Use new for onboarding');
    const result=await onboardCompany(pool,{slug:process.env.SETUP_COMPANY_SLUG,name:process.env.SETUP_COMPANY_NAME,
      email:process.env.SETUP_ADMIN_EMAIL,password:process.env.SETUP_ADMIN_PASSWORD},key,terms);
    console.log(JSON.stringify({companyId:result.companyId,revision:result.commercial.record.revision}));
  }
}catch(error){
  console.error('No se pudo registrar la operación comercial.',{code:(error as {code?:string}).code??'INVALID_SETUP'});process.exitCode=1;
}finally{if(pool)await pool.end();}
