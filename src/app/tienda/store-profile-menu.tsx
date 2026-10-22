'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {ActionIcon} from '../action-icon';
import styles from './store-profile-menu.module.css';

type Props={user:{name:string;role:string}|null;disabled:boolean;onSettings:()=>void;onLogin:()=>void;onRegister:()=>void;onLogout:()=>void;onPurchases?:()=>void};
export default function StoreProfileMenu({user,disabled,onSettings,onLogin,onRegister,onLogout,onPurchases}:Props){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,right:16});
 useEffect(()=>{if(disabled)popup.current?.hidePopover();},[disabled]);
 useEffect(()=>{if(!open)return;const close=()=>popup.current?.hidePopover();window.addEventListener('resize',close);window.addEventListener('scroll',close);return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close);};},[open]);
 function choose(action:()=>void){if(disabled)return;popup.current?.hidePopover();action();}
 return <div className={styles.control}>
  <button ref={trigger} type="button" className={styles.trigger} title="Mi cuenta" aria-label="Abrir mi cuenta" aria-expanded={open} aria-controls={id} disabled={disabled} popoverTarget={id} onClick={()=>{const rect=trigger.current!.getBoundingClientRect();setPosition({top:rect.bottom+10,right:Math.max(16,window.innerWidth-rect.right)});}}><ActionIcon name="profile" size={23}/></button>
  <div ref={popup} id={id} popover="auto" role="group" aria-label="Opciones de mi cuenta" className={styles.popup} style={position} onToggle={event=>setOpen(event.newState==='open')}>
   <div className={styles.identity}><strong>{user?.name||'Bienvenido'}</strong><span>{user?(user.role==='CUSTOMER'?'Tu cuenta de cliente':'Sesión del equipo'):'Accede para comprar y seguir tus pedidos'}</span></div>
   {user?<>
    {onPurchases&&<button type="button" disabled={disabled} onClick={()=>choose(onPurchases)}><ActionIcon name="clock"/>Mis compras</button>}
    <button type="button" disabled={disabled} onClick={()=>choose(onSettings)}><ActionIcon name="settings"/>Configuración</button>
    <div className={styles.divider}/><button type="button" className={styles.logout} disabled={disabled} onClick={()=>choose(onLogout)}><ActionIcon name="logout"/>Cerrar sesión</button>
   </>:<><button type="button" disabled={disabled} onClick={()=>choose(onLogin)}><ActionIcon name="profile"/>Iniciar sesión</button><button type="button" disabled={disabled} onClick={()=>choose(onRegister)}><ActionIcon name="team"/>Crear cuenta</button></>}
  </div>
 </div>;
}
