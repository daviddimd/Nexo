import {Pool} from 'pg';
import {configurationIssues,inspectDatabase} from '../src/server/deployment';

const maintenance=process.argv.includes('--maintenance');
const issues=configurationIssues(process.env,maintenance);
const connections=[['runtime',process.env.DATABASE_URL],...(maintenance?[['operator',process.env.NEXO_OPERATOR_DATABASE_URL],['migration',process.env.NEXO_MIGRATION_DATABASE_URL]]:[])] as const;
const checks=[];
for(const [kind,url] of connections){
  if(!url){issues.push(`CONNECTION_REQUIRED:${kind}`);continue;}
  const pool=new Pool({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:5000});
  try{checks.push(await inspectDatabase(pool,kind as 'runtime'|'operator'|'migration',process.env.NEXO_DATABASE_SCHEMA??'public'));}
  catch{issues.push(`CONNECTION_CHECK_FAILED:${kind}`);}
  finally{await pool.end();}
}
if(maintenance&&checks.length===3){
  if(new Set(checks.map(c=>c.username)).size!==3)issues.push('CONNECTION_ROLES_NOT_DISTINCT');
  if(new Set(checks.map(c=>c.database)).size!==1)issues.push('CONNECTION_DATABASE_MISMATCH');
}
const ok=issues.length===0&&checks.every(c=>c.issues.length===0);
console.log(JSON.stringify({ok,issues,checks}));if(!ok)process.exitCode=1;
