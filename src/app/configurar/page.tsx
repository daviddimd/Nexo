'use client';
import NexoFooter from '../nexo-footer';
import {useEffect,useState,type FormEvent} from 'react';

type SetupStatus={available:boolean;resetAvailable:boolean};

export default function Setup(){
 const [available,setAvailable]=useState(false),[resetAvailable,setResetAvailable]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [created,setCreated]=useState(''),[resetMode,setResetMode]=useState(false),[resetDone,setResetDone]=useState(false);
 useEffect(()=>{fetch('/api/setup').then(r=>{if(!r.ok)throw new Error();return r.json() as Promise<SetupStatus>;}).then(v=>{setAvailable(v.available);setResetAvailable(v.resetAvailable);}).catch(()=>setMessage('No pudimos conectar con la instalación.')).finally(()=>setLoading(false));},[]);

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget);
  if(f.get('password')!==f.get('confirm')){setMessage('Las contraseñas deben coincidir.');return;}
  setBusy(true);setMessage('');
  try{const r=await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:f.get('name'),slug:f.get('slug'),email:f.get('email'),password:f.get('password')})}),v=await r.json();if(!r.ok)throw new Error(v.error?.message??'No se pudo configurar');setCreated(v.company);setAvailable(false);}
  catch(error){setMessage((error as Error).message);}
  finally{setBusy(false);}
 }

 async function reset(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget);
  if(f.get('password')!==f.get('confirm')){setMessage('Las contraseñas deben coincidir.');return;}
  setBusy(true);setMessage('');
  try{const r=await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reset-demo-credentials',recoveryKey:f.get('recoveryKey'),password:f.get('password')})}),v=await r.json();if(!r.ok)throw new Error(v.error?.message??'No se pudo restablecer el acceso');setResetDone(true);setResetAvailable(false);}
  catch(error){setMessage((error as Error).message);}
  finally{setBusy(false);}
 }

 return <main><a className="brand-link" href="/">nexo<span className="brand-dot">.</span></a><span className="eyebrow">PRIMEROS PASOS</span><h1>Tu empresa empieza aquí.</h1><p>Crea tu negocio y el acceso de su primer administrador.</p><p role="status">{message}</p>
  {loading?<p>Comprobando instalación…</p>:created?<section><h2>Tu empresa está lista</h2><p>Usa <strong>{created}</strong> como identificador, junto al correo y contraseña que elegiste.</p><a className="primary" href={`/panel?empresa=${encodeURIComponent(created)}`}>Entrar al panel →</a></section>
  :resetDone?<section><h2>Acceso restablecido</h2><p>La nueva contraseña ya está activa para <strong>admin@prismabyte.cl</strong>.</p><a className="primary" href="/panel?empresa=prismabyte">Entrar al panel →</a></section>
  :available?<section><form onSubmit={submit}><fieldset disabled={busy}>
   <label>Nombre de empresa<input name="name" required maxLength={200} autoComplete="organization"/></label><label>Identificador de tienda<input name="slug" placeholder="mi-tienda" pattern="[a-z0-9][a-z0-9-]{1,62}" required maxLength={63}/></label><small>Minúsculas, números y guiones. Lo usarás para entrar y compartir tu catálogo.</small>
   <label>Correo del administrador<input name="email" type="email" required autoComplete="username"/></label><label>Contraseña (mínimo 12 caracteres)<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label><label>Repite la contraseña<input name="confirm" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label><button className="primary">{busy?'Creando…':'Crear empresa y administrador'}</button>
  </fieldset></form></section>
  :<section><h2>La configuración inicial no está disponible</h2><p>Si tu empresa ya está configurada, accede con tu cuenta del equipo.</p><a className="primary" href="/panel">Acceder al equipo →</a>
   {resetAvailable&&<div className="local-recovery"><h3>¿Olvidaste el acceso de PrismaByte?</h3><p>En esta instalación local puedes elegir una contraseña nueva para <strong>admin@prismabyte.cl</strong>. Se cerrarán las sesiones activas de esa cuenta.</p>
    {!resetMode?<button type="button" className="secondary" onClick={()=>{setMessage('');setResetMode(true);}}>Restablecer acceso de la demo</button>
    :<form onSubmit={reset}><fieldset disabled={busy}>
      <label>Llave local de recuperación<input name="recoveryKey" type="password" minLength={64} maxLength={64} required autoComplete="off"/></label><small>Está en `.nexo/demo-runtime.json`, en la propiedad `credentialResetKey` de esta instalación.</small>
      <label>Nueva contraseña (mínimo 12 caracteres)<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label><label>Repite la contraseña<input name="confirm" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label>
      <button className="primary">{busy?'Restableciendo…':'Guardar nueva contraseña'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setResetMode(false);setMessage('');}}>Cancelar</button>
     </fieldset></form>}
   </div>}
  </section>}
  <p>¿Ya tienes una cuenta? <a href="/panel">Acceder al equipo</a></p><NexoFooter/>
 </main>;
}

