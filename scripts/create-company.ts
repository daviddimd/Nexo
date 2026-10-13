import {z} from 'zod';
import {Pool} from 'pg';
import {createCompany} from '../src/server/auth';
const input=z.object({slug:z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),name:z.string().trim().min(1).max(200),email:z.email(),password:z.string().min(12).max(128)});
let pool:Pool|undefined;
try {
  const connectionString=process.env.NEXO_OPERATOR_DATABASE_URL;if(!connectionString)throw new Error('Operator connection required');
  pool=new Pool({connectionString,connectionTimeoutMillis:5000,statement_timeout:15000});
  const company=input.parse({slug:process.env.SETUP_COMPANY_SLUG,name:process.env.SETUP_COMPANY_NAME,email:process.env.SETUP_ADMIN_EMAIL,password:process.env.SETUP_ADMIN_PASSWORD});
  const result=await createCompany(pool,company);console.log('Empresa y administrador creados:',result.companyId);
} catch {console.error('No se pudo crear la empresa. Revisa SETUP_* en .env, unicidad y conexión.');process.exitCode=1;}
finally {if(pool)await pool.end();}
