'use client';
import {useId,useRef,useState} from 'react';
import styles from './panel.module.css';

export default function RowActions({name,disabled,onEdit,onPassword}:{name:string;disabled:boolean;onEdit:()=>void;onPassword?:()=>void}){
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
  const [expanded,setExpanded]=useState(false),[position,setPosition]=useState({top:0,right:12});
  function choose(action:()=>void){if(disabled)return;popup.current?.hidePopover();action();}
  return <>
    <button ref={trigger} type="button" className={`icon-button ${styles.rowMenuTrigger}`} disabled={disabled} aria-label={`Acciones de ${name}`} title="Acciones de cuenta" aria-expanded={expanded} aria-controls={id} popoverTarget={id}
      onClick={()=>{const rect=trigger.current!.getBoundingClientRect();const height=onPassword?112:64;setPosition({top:rect.bottom+height+8>window.innerHeight?Math.max(8,rect.top-height-8):rect.bottom+8,right:Math.max(12,window.innerWidth-rect.right)});}}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
    </button>
    <div id={id} ref={popup} popover="auto" role="group" aria-label={`Opciones de ${name}`} className={styles.rowActionMenu} style={position} onToggle={event=>setExpanded(event.newState==='open')}>
      <button type="button" disabled={disabled} onClick={()=>choose(onEdit)}>Editar cuenta</button>
      {onPassword&&<button type="button" disabled={disabled} onClick={()=>choose(onPassword)}>Cambiar contraseña</button>}
    </div>
  </>;
}
