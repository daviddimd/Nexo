'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import styles from './panel.module.css';

export default function Modal({title,busy,onClose,children,className=''}:{title:string;busy:boolean;onClose:()=>void;children:ReactNode;className?:string}){
  const dialog=useRef<HTMLDialogElement>(null),heading=useId();
  useEffect(()=>{
    const element=dialog.current!;
    const previousOverflow=document.body.style.overflow;
    element.showModal();document.body.style.overflow='hidden';
    return()=>{element.close();document.body.style.overflow=previousOverflow;};
  },[]);
  return <dialog ref={dialog} className={`${styles.modal} ${className}`} aria-labelledby={heading}
    onCancel={event=>{event.preventDefault();if(!busy)onClose();}}
    onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <div className={styles.modalContent}>
      <header className={styles.modalHeader}><h2 id={heading} tabIndex={-1} autoFocus>{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar ventana">Cerrar ×</button></header>
      <div className={styles.modalBody}>{children}</div>
    </div>
  </dialog>;
}
