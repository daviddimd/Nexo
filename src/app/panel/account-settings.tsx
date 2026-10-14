'use client';
import {useRef,useState,type FormEvent} from 'react';
import styles from './panel.module.css';
export default function AccountSettings({name,role,busy,setBusy,request}:{name:string;role:string;busy:boolean;setBusy:(v:boolean)=>void;request:(p:string,o?:RequestInit)=>Promise<any>}){
  const [notice,setNotice]=useState(''),[subcategory,setSubcategory]=useState<'information'|'password'>('information');const saving=useRef(false);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving.current)return;const form=new FormData(event.currentTarget);
    if(form.get('newPassword')!==form.get('confirmation')){setNotice('Las contraseñas no coinciden.');return;}
    saving.current=true;setBusy(true);setNotice('');
    try{await request('auth/password',{method:'POST',body:JSON.stringify({currentPassword:form.get('currentPassword'),newPassword:form.get('newPassword')})});window.location.replace('/panel');}
    catch(error){setNotice((error as Error).message);saving.current=false;setBusy(false);}
  }
  const roleLabel=role==='OWNER'?'Propietario':role==='AGENT'?'Agente':'Cliente';
  return <section><h2>Mi cuenta y seguridad</h2>
    <nav className={styles.settingsSubnav} aria-label="Opciones de mi cuenta"><button disabled={busy} aria-pressed={subcategory==='information'} onClick={()=>{setSubcategory('information');setNotice('');}}>Información</button><button disabled={busy} aria-pressed={subcategory==='password'} onClick={()=>{setSubcategory('password');setNotice('');}}>Cambiar contraseña</button></nav>
    {subcategory==='information'?<><h3>Información de la cuenta</h3><dl className={styles.settingsInformation}><div><dt>Nombre</dt><dd>{name}</dd></div><div><dt>Rol</dt><dd>{roleLabel}</dd></div></dl></>:<><h3>Cambiar contraseña</h3><p>Confirma tu contraseña actual. Al guardar se cerrarán tus sesiones y deberás volver a acceder.</p><p role="status" aria-live="polite">{notice}</p>
    <form onSubmit={save}><fieldset disabled={busy}><label>Contraseña actual<input name="currentPassword" type="password" required maxLength={128} autoComplete="current-password"/></label><label>Nueva contraseña<input name="newPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><label>Confirmar nueva contraseña<input name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><button>Guardar contraseña</button></fieldset></form>
    </>}
  </section>;
}
