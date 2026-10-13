import {cookies} from 'next/headers';
import {authenticate} from './auth';
import {database} from './db';
import {AppError} from './errors';
export async function pageSession(){
  const token=(await cookies()).get('nexo_session')?.value;
  if(!token)return null;
  try{return await authenticate(database(),token);}
  catch(error){if(error instanceof AppError&&error.status===401)return null;throw error;}
}
