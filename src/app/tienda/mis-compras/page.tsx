import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {storeAccessPath,storePurchasesPath} from '../../../catalog/store-access-paths';
import {publicSettings} from '../../../server/accounts';
import {database} from '../../../server/db';
import {pageSession} from '../../../server/page-session';
import Storefront from '../storefront';

export const metadata:Metadata={title:'Mis compras',robots:{index:false,follow:false}};

export default async function PurchasesPage({searchParams}:{searchParams:Promise<{empresa?:string|string[]}>}){
 const {empresa}=await searchParams;
 if(typeof empresa!=='string'||!/^[a-z0-9][a-z0-9-]{1,62}$/.test(empresa))notFound();
 const company=await publicSettings(database(),empresa).catch(error=>{
  if((error as {status?:number}).status===404)notFound();
  throw error;
 });
 const user=await pageSession();
 if(!user||user.role==='CUSTOMER'&&user.company_id!==company.id){
  redirect(storeAccessPath('login',empresa,storePurchasesPath(empresa)));
 }
 if(user.role!=='CUSTOMER')redirect('/panel');
 return <Storefront key={empresa} initialCompany={company} purchasesPage/>;
}
