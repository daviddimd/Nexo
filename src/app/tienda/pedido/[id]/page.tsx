import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Storefront from '../../storefront';

export const metadata:Metadata={title:'Tu pedido',robots:{index:false,follow:false}};

export default async function OrderPage({params,searchParams}:{
 params:Promise<{id:string}>;
 searchParams:Promise<{vista?:string}>;
}){
 const [{id},{vista}]=await Promise.all([params,searchParams]);
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))notFound();
 return <Storefront key={id} orderId={id} confirmationPage={vista==='confirmacion'}/>;
}
