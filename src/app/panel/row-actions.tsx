'use client';
import {useId,useRef,useState} from 'react';
import Link from 'next/link';
import styles from './panel.module.css';

export default function RowActions({name,disabled,onEdit,onPassword,editLabel='Editar cuenta',detailHref}:{name:string;disabled:boolean;onEdit:()=>void;onPassword?:()=>void;editLabel?:string;detailHref?:string}){
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
  const [expanded,setExpanded]=useState(false),[position,setPosition]=useState({top:0,right:12});
  function choose(action:()=>void){if(disabled)return;popup.current?.hidePopover();action();}
  return <>
    <button ref={trigger} type="button" className={`icon-button ${styles.rowMenuTrigger}`} disabled={disabled} aria-label={`Acciones de ${name}`} title="Opciones" aria-expanded={expanded} aria-controls={id} popoverTarget={id}
      onClick={()=>{const rect=trigger.current!.getBoundingClientRect();const height=64+Number(Boolean(onPassword))*48+Number(Boolean(detailHref))*48;setPosition({top:rect.bottom+height+8>window.innerHeight?Math.max(8,rect.top-height-8):rect.bottom+8,right:Math.max(12,window.innerWidth-rect.right)});}}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
    </button>
    <div id={id} ref={popup} popover="auto" role="group" aria-label={`Opciones de ${name}`} className={styles.rowActionMenu} style={position} onToggle={event=>setExpanded(event.newState==='open')}>
      {detailHref&&<Link href={detailHref} prefetch={false} className={styles.rowActionLink} aria-disabled={disabled} onClick={event=>{if(disabled){event.preventDefault();return;}popup.current?.hidePopover();}}>Ver ficha</Link>}
      <button type="button" disabled={disabled} onClick={()=>choose(onEdit)}>{editLabel}</button>
      {onPassword&&<button type="button" disabled={disabled} onClick={()=>choose(onPassword)}>Cambiar contraseña</button>}
    </div>
  </>;
}
