import {redirect} from 'next/navigation';
import {pageSession} from '../../server/page-session';
import {database} from '../../server/db';
export default async function WorkspaceHome(){
  const user=await pageSession();
  if(!user)redirect('/panel');
  if(user.role==='CUSTOMER'){
    const company=(await database().query('SELECT slug FROM companies WHERE id=$1',[user.company_id])).rows[0];
    redirect(`/tienda?empresa=${encodeURIComponent(company.slug)}`);
  }
  redirect('/panel?seccion=home');
}
