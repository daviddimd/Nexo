import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {database} from '../../../server/db';
import {publicSettings} from '../../../server/accounts';
import {pageSession} from '../../../server/page-session';
import {storeAccessPath,storeAccountPath,storeAccountSection,storePurchasesPath} from '../../../catalog/store-access-paths';
import Storefront from '../storefront';
export const metadata:Metadata={title:'Mi cuenta',robots:{index:false,follow:false}};
type Search={empresa?:string|string[];seccion?:string|string[];pedido?:string|string[]};
export default async function StoreSettings({searchParams}:{searchParams:Promise<Search>}){
 const search=await searchParams,slug=typeof search.empresa==='string'?search.empresa:'';
 if(!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug))notFound();
 let company;try{company=await publicSettings(database(),slug);}catch(error){if((error as {status?:number}).status===404)notFound();throw error;}
 const section=storeAccountSection(search.seccion),order=typeof search.pedido==='string'&&/^[0-9a-f-]{36}$/i.test(search.pedido)?search.pedido:undefined;
 if(section==='orders')redirect(storePurchasesPath(slug));
 const user=await pageSession();
 if(!user||user.role==='CUSTOMER'&&user.company_id!==company.id)redirect(storeAccessPath('login',slug,storeAccountPath(slug,section,order)));
 if(user.role!=='CUSTOMER')redirect('/panel?seccion=settings');
 return <Storefront initialCompany={company} settingsPage settingsSection={section} returnOrder={order}/>;
}
