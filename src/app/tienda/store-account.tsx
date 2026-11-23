'use client';
import Link from 'next/link';
import {storeAccountPath,storeHome,storeOrderPath,type StoreAccountSection} from '../../catalog/store-access-paths';
import AccountPassword from '../account-password';
import CustomerSettings from './customer-settings';
import type {CustomerProfile,TestCard} from './customer-types';
import {ActionIcon} from '../action-icon';
import styles from './store-account.module.css';
type Props={initialSection?:StoreAccountSection;returnOrder?:string;profile:CustomerProfile|null;cards:TestCard[];request:(path:string,options?:RequestInit)=>Promise<any>;onUpdated:()=>Promise<void>;onLogout:()=>void;user:{name:string;email:string;role:string};company:string;slug:string;customer:boolean;busy:boolean;notice:string};
export default function StoreAccount({initialSection='info',returnOrder,profile,cards,request,onUpdated,onLogout,user,company,slug,customer,busy,notice}:Props){
 const section=initialSection;
 return <section id="mi-cuenta" className={styles.accountPage} aria-labelledby="account-page-title">
  <header className={styles.accountHeading}><div><h1 id="account-page-title">Mi cuenta</h1><span>{section==='info'?'Perfil':section==='address'?'Direcciones':section==='payments'?'Pagos':section==='security'?'Seguridad':'Mis compras'}</span></div>
   <Link href={returnOrder?storeOrderPath(slug,returnOrder):storeHome(slug)}>{returnOrder?'Volver al pedido':'Volver a la tienda'} <span aria-hidden="true">→</span></Link>
  </header>
  <div className={styles.accountSurface}>
  {user&&notice&&<p className={styles.notice} role="status">{notice}</p>}
  <div className={styles.profileLayout}>
   <aside className={styles.sidebar}><div className={styles.person}><span className={styles.avatar}>{user.name.split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase()}</span><strong>{user.name}</strong><small>{user.email}</small></div><nav aria-label="Cuenta"><Link href={storeAccountPath(slug,'info',returnOrder)} aria-current={section==='info'?'page':undefined}><ActionIcon name="profile" size={19}/>Perfil</Link>{customer&&<><Link href={storeAccountPath(slug,'address',returnOrder)} aria-current={section==='address'?'page':undefined}><ActionIcon name="location" size={19}/>Direcciones</Link><Link href={storeAccountPath(slug,'payments',returnOrder)} aria-current={section==='payments'?'page':undefined}><ActionIcon name="card" size={19}/>Pagos</Link></>}<Link href={storeAccountPath(slug,'security',returnOrder)} aria-current={section==='security'?'page':undefined}><ActionIcon name="lock" size={19}/>Seguridad</Link></nav><button type="button" className={styles.logout} onClick={onLogout}><ActionIcon name="logout" size={18}/>Cerrar sesión</button></aside>
   <div className={styles.profileContent}>{customer&&profile&&['info','address','payments'].includes(section)?<CustomerSettings key={section} section={section as 'info'|'address'|'payments'} profile={profile} cards={cards} request={request} onUpdated={onUpdated}/>:section==='info'?<><h3>Perfil</h3><p className={styles.intro}>Estos son los datos de tu sesión actual.</p><dl className={styles.information}><div><dt>Nombre</dt><dd>{user.name}</dd></div><div><dt>Tipo de cuenta</dt><dd>{user.role==='CUSTOMER'?'Cliente':user.role==='OWNER'?'Propietario':'Agente'}</dd></div>{customer&&<div><dt>Tienda</dt><dd>{company}</dd></div>}</dl>{!customer&&<p className={styles.notice}>Para comprar en esta tienda necesitas una cuenta de cliente de la empresa.</p>}</>:<><header className={styles.sectionHeading}><h3>Seguridad</h3></header><p className={styles.intro}>Administra la contraseña que utilizas para iniciar sesión.</p><div className={styles.securityCard}><ActionIcon name="lock" size={24}/><div><strong>Contraseña</strong><p>Para cambiarla necesitarás tu contraseña actual. Al guardar, se cerrarán tus sesiones.</p><AccountPassword modalClassName={styles.dialog} returnTo={`/tienda?empresa=${encodeURIComponent(slug)}`}/></div></div></>}</div>
  </div>

 </div></section>;
}
