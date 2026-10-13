import {redirect} from 'next/navigation';
import {pageSession} from '../server/page-session';
import AccessLanding from './access-landing';
export default async function Home(){
  if(await pageSession())redirect('/inicio');
  return <AccessLanding/>;
}
