import {notFound,redirect} from 'next/navigation';
import {database} from '../../server/db';
import {publicSettings} from '../../server/accounts';
import {pageSession} from '../../server/page-session';
import {storeReturnPath,type AccessMode} from '../../catalog/store-access-paths';
import StoreAccessPage from './access-page';
export type AccessSearch={empresa?:string|string[];volver?:string|string[];modo?:string|string[]};
export async function renderStoreAccess(search:AccessSearch,primary:'login'|'register'){
 const slug=typeof search.empresa==='string'?search.empresa:'';
 if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug))notFound();
 let company;try{company=await publicSettings(database(),slug);}catch(error){if((error as {status?:number}).status===404)notFound();throw error;}
 const target=storeReturnPath(search.volver,slug),user=await pageSession();
 if(user?.role==='CUSTOMER'&&user.company_id===company.id)redirect(target);
 const auxiliary=['forgot','resend','verify','reset'];
 const mode:AccessMode=primary==='login'&&typeof search.modo==='string'&&auxiliary.includes(search.modo)?search.modo as AccessMode:primary;
 return <StoreAccessPage company={company} mode={mode} returnTo={target}/>;
}
