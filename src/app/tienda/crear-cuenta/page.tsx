import {renderStoreAccess,type AccessSearch} from '../access-route';
export const metadata={title:'Crear cuenta · Tu tienda',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<AccessSearch>}){return renderStoreAccess(await searchParams,'register');}
