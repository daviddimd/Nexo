'use client';
import {useEffect,useId,useRef,useState} from 'react';
import type {Category} from '../../catalog/taxonomy';
import styles from './category-menu.module.css';

export default function CategoryMenu({category,categories,active,disabled,onChoose}:{category:Category;categories:Category[];active:string;disabled:boolean;onChoose:(id:string)=>void}){
 const id=useId(),popup=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0});
 const selected=categories.find(item=>item.id===active);
 const containsSelection=selected&&(selected.id===category.id||selected.path.startsWith(category.path+' /'));
 useEffect(()=>{if(disabled)popup.current?.hidePopover();},[disabled]);
 useEffect(()=>{if(!open)return;const close=()=>popup.current?.hidePopover();window.addEventListener('resize',close);window.addEventListener('scroll',close);return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close);};},[open]);
 function choose(value:string){if(disabled)return;popup.current?.hidePopover();trigger.current?.focus({preventScroll:true});onChoose(value);}
 function descendants(parent:string){return <ul>{categories.filter(item=>item.parent_id===parent).map(item=><li key={item.id}><button type="button" disabled={disabled} aria-current={item.id===active?'true':undefined} onClick={()=>choose(item.id)}>{item.name}</button>{categories.some(child=>child.parent_id===item.id)&&descendants(item.id)}</li>)}</ul>;}
 return <>
  <button ref={trigger} type="button" className={styles.trigger} disabled={disabled} aria-expanded={open} aria-controls={id} aria-current={containsSelection?'page':undefined} popoverTarget={id} onClick={()=>{
   const rect=trigger.current!.getBoundingClientRect(),width=Math.min(620,window.innerWidth-32);
   setPosition({top:rect.bottom+10,left:Math.max(16,Math.min(rect.left,window.innerWidth-width-16))});
  }}>{category.name}<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={open?'m4 10 4-4 4 4':'m4 6 4 4 4-4'}/></svg></button>
  <div ref={popup} id={id} popover="auto" className={styles.popup} style={position} role="group" aria-label={`Subcategorías de ${category.name}`} onToggle={event=>setOpen(event.newState==='open')}>
   <div className={styles.heading}><strong>{category.name}</strong><button type="button" disabled={disabled} onClick={()=>choose(category.id)}>Ver todo <span aria-hidden="true">→</span></button></div>
   {categories.some(item=>item.parent_id===category.id)?descendants(category.id):<p>No hay subcategorías. Puedes explorar todos los productos de esta categoría.</p>}
  </div>
 </>;
}
