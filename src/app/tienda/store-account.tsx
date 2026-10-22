'use client';
import {useState,type FormEvent} from 'react';
import Modal from '../panel/modal';
import AccountPassword from '../account-password';
import {ActionIcon} from '../action-icon';
import styles from './store-account.module.css';
type Props={user:{name:string;role:string}|null;company:string;slug:string;customer:boolean;busy:boolean;notice:string;mode:string;onMode:(mode:string)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onClose:()=>void};
const modes:Record<string,{title:string;description:string;action:string}>={login:{title:'Qué bueno verte de nuevo',description:'Accede a tus compras y continúa donde quedaste.',action:'Iniciar sesión'},register:{title:'Tu cuenta, tu próxima compra',description:'Crea una cuenta para comprar y seguir tus pedidos.',action:'Crear cuenta'},forgot:{title:'Recupera tu acceso',description:'Solicita un código para cambiar tu contraseña.',action:'Solicitar código'},resend:{title:'Verifica tu correo',description:'Solicita un nuevo código para activar tu cuenta.',action:'Enviar código'},verify:{title:'Activa tu cuenta',description:'Ingresa el código de verificación que recibiste.',action:'Verificar correo'},reset:{title:'Una nueva contraseña',description:'Ingresa el código de recuperación y tu nueva contraseña.',action:'Guardar contraseña'}};
export default function StoreAccount({user,company,slug,customer,busy,notice,mode,onMode,onSubmit,onClose}:Props){
 const [section,setSection]=useState<'info'|'security'>('info'),copy=modes[mode]??modes.login;
 return <Modal title={user?'Mi cuenta':'Accede a tu cuenta'} className={`${styles.dialog} ${user?styles.profileDialog:styles.accessDialog}`} busy={busy} onClose={onClose}>
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {user?<div className={styles.profileLayout}>
   <aside className={styles.sidebar}><div className={styles.person}><span className={styles.avatar}><ActionIcon name="profile" size={30}/></span><strong>{user.name}</strong><small>{user.role==='CUSTOMER'?'Cliente':user.role==='OWNER'?'Propietario':'Agente'}</small></div><nav aria-label="Secciones de mi cuenta"><button type="button" aria-pressed={section==='info'} onClick={()=>setSection('info')}><ActionIcon name="profile" size={19}/>Información personal</button><button type="button" aria-pressed={section==='security'} onClick={()=>setSection('security')}><ActionIcon name="security" size={19}/>Seguridad</button></nav></aside>
   <div className={styles.profileContent}>{section==='info'?<><span className={styles.eyebrow}>TU PERFIL</span><h3>Información personal</h3><p className={styles.intro}>Estos son los datos de tu sesión actual.</p><dl className={styles.information}><div><dt>Nombre</dt><dd>{user.name}</dd></div><div><dt>Tipo de cuenta</dt><dd>{user.role==='CUSTOMER'?'Cliente':user.role==='OWNER'?'Propietario':'Agente'}</dd></div>{customer&&<div><dt>Tienda</dt><dd>{company}</dd></div>}</dl>{!customer&&<p className={styles.notice}>Para comprar en esta tienda necesitas una cuenta de cliente de la empresa.</p>}</>:<><span className={styles.eyebrow}>CUIDA TU ACCESO</span><h3>Seguridad de la cuenta</h3><p className={styles.intro}>Administra la contraseña que utilizas para iniciar sesión.</p><div className={styles.securityCard}><ActionIcon name="security" size={24}/><div><strong>Contraseña</strong><p>Para cambiarla necesitarás tu contraseña actual. Al guardar, se cerrarán tus sesiones.</p><AccountPassword modalClassName={styles.dialog} returnTo={`/tienda?empresa=${encodeURIComponent(slug)}`}/></div></div></>}</div>
  </div>:<div className={styles.access}>
   <span className={styles.accessIcon}><ActionIcon name={mode==='login'||mode==='register'?'profile':'security'} size={28}/></span><span className={styles.eyebrow}>{company}</span><h3>{copy.title}</h3><p className={styles.intro}>{copy.description}</p>
   {['login','register'].includes(mode)&&<div className={styles.switcher} role="group" aria-label="Acceso de cliente"><button type="button" disabled={busy} aria-pressed={mode==='login'} onClick={()=>onMode('login')}>Iniciar sesión</button><button type="button" disabled={busy} aria-pressed={mode==='register'} onClick={()=>onMode('register')}>Crear cuenta</button></div>}
   <form key={mode} onSubmit={onSubmit}><fieldset disabled={busy}>
    {mode==='register'&&<label>Nombre<input name="name" required maxLength={200} autoComplete="name" placeholder="Tu nombre"/></label>}
    {!['verify','reset'].includes(mode)&&<label>Correo electrónico<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="nombre@correo.cl"/></label>}
    {['verify','reset'].includes(mode)&&<label>Código recibido<input name="token" required autoComplete="one-time-code" autoCapitalize="none" spellCheck={false}/></label>}
    {['login','register','reset'].includes(mode)&&<label>Contraseña<input name="password" type="password" minLength={mode==='login'?1:12} maxLength={128} required autoComplete={mode==='login'?'current-password':'new-password'}/>{mode!=='login'&&<small>Usa al menos 12 caracteres.</small>}</label>}
    {mode==='login'&&<button type="button" className={styles.textButton} onClick={()=>onMode('forgot')}>Olvidé mi contraseña</button>}
    <button type="submit" className={styles.primary}>{busy?'Procesando…':copy.action}<span aria-hidden="true">→</span></button>
   </fieldset></form>
   {!['login','register'].includes(mode)&&<button type="button" className={styles.textButton} disabled={busy} onClick={()=>onMode('login')}>← Volver al inicio de sesión</button>}
   <details className={styles.accessHelp}><summary>Verificación y recuperación</summary><div>{[['verify','Tengo un código de verificación'],['resend','Reenviar verificación'],['reset','Tengo un código para cambiar mi contraseña']].map(([value,label])=><button type="button" key={value} disabled={busy} onClick={()=>onMode(value)}>{label}</button>)}</div></details>
  </div>}
 </Modal>;
}
