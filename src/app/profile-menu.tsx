'use client';
import {useId,useRef,useState} from 'react';
import {ActionIcon} from './action-icon';

export default function ProfileMenu({name,role,disabled=false,onSettings}:{name:string;role:string;disabled?:boolean;onSettings?:()=>void}){
  const id=useId(),popup=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),saving=useRef(false);
  const [expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [position,setPosition]=useState({top:0,right:16});
  const roleLabel=role==='OWNER'?'Propietario':role==='AGENT'?'Agente':'Cliente';
  function close(){popup.current?.hidePopover();}
  async function logout(){
    if(saving.current)return;saving.current=true;setBusy(true);setError('');
    try{const response=await fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!response.ok&&response.status!==401)throw Error();window.location.replace('/');}
    catch{setError('No se pudo cerrar la sesión. Intenta nuevamente.');saving.current=false;setBusy(false);}
  }
  return <div className="profile-control">
    <button ref={trigger} type="button" className="icon-button profile-trigger" aria-label="Abrir perfil" title="Perfil" aria-expanded={expanded} aria-controls={id} popoverTarget={id} disabled={disabled||busy}
      onClick={()=>{const rect=trigger.current!.getBoundingClientRect();setPosition({top:Math.min(rect.bottom+10,Math.max(8,window.innerHeight-260)),right:Math.max(12,window.innerWidth-rect.right)});}}>
      <ActionIcon name="profile" size={24}/>
    </button>
    <div id={id} ref={popup} popover="auto" className="profile-popup" style={position} role="group" aria-label="Opciones de perfil" onToggle={event=>setExpanded(event.newState==='open')}>
      <div className="profile-identity"><strong>{name}</strong><span>{roleLabel}</span></div>
      <a className="profile-option" href="/panel?seccion=settings" onClick={event=>{if(disabled||busy){event.preventDefault();return;}close();if(onSettings){event.preventDefault();onSettings();}}}><ActionIcon name="settings"/>Configuración</a>
      <button className="profile-option" disabled={disabled||busy} onClick={logout}><ActionIcon name="logout"/>{busy?'Cerrando sesión…':'Cerrar sesión'}</button>
      {error&&<p className="profile-error" role="alert">{error}</p>}
    </div>
  </div>;
}
