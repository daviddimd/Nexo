import {z} from 'zod';
import type {Pool} from 'pg';
import {createCompanyRecords,hashPassword} from './auth';
import {transaction} from './db';
import {commercialSchema,recordCommercialInTransaction} from './commercial';

const companySchema=z.object({slug:z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),name:z.string().trim().min(1).max(200),
  email:z.email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(12).max(128)}).strict();
export async function onboardCompany(pool:Pool,rawCompany:unknown,key:string,rawTerms:unknown){
  const company=companySchema.parse(rawCompany),terms=commercialSchema.parse(rawTerms);
  const hashed=await hashPassword(company.password);
  return transaction(pool,async db=>{
    const created=await createCompanyRecords(db,company,hashed);
    const commercial=await recordCommercialInTransaction(db,created.companyId,key,terms);
    return {...created,commercial};
  });
}
