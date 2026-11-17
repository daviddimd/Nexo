import {redirect} from 'next/navigation';
import {pageSession} from '../../server/page-session';
export default async function WorkspaceHome(){
  const user=await pageSession();
  if(!user)redirect('/panel');
  if(user.role==='CUSTOMER')redirect('/panel');
  redirect('/panel?seccion=home');
}
