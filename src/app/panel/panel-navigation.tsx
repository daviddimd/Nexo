'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import styles from './panel.module.css';

const sections=[['inventory','Inventario'],['movements','Movimientos'],['products','Productos'],['locations','Ubicaciones'],['orders','Pedidos'],['reports','Reportes'],['shipping','Envíos']] as const;
type Section=typeof sections[number][0];

export default function PanelNavigation({selected,disabled,onNavigate}:{selected:string;disabled:boolean;onNavigate:(section:Section)=>void}){
 const nav=useRef<HTMLElement>(null);
 const [indicator,setIndicator]=useState({left:0,width:0,visible:false});
 useLayoutEffect(()=>{
  const element=nav.current;if(!element)return;
  let disposed=false;
  const update=()=>{
   if(disposed)return;
   const label=element.querySelector<HTMLSpanElement>('button[aria-pressed="true"] span');
   if(!label){setIndicator(previous=>previous.visible?{...previous,visible:false}:previous);return;}
   const rect=label.getBoundingClientRect(),container=element.getBoundingClientRect();
   setIndicator({left:rect.left-container.left+element.scrollLeft,width:rect.width,visible:true});
  };
  update();
  const observer=new ResizeObserver(update);observer.observe(element);
  element.querySelectorAll('button').forEach(button=>observer.observe(button));
  void document.fonts.ready.then(update);
  const active=element.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
  if(active){
   const buttonRect=active.getBoundingClientRect(),navRect=element.getBoundingClientRect();
   if(buttonRect.left<navRect.left||buttonRect.right>navRect.right){
    element.scrollTo({left:element.scrollLeft+buttonRect.left-navRect.left-(element.clientWidth-buttonRect.width)/2,behavior:element.dataset.keyboard==='true'||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
   }
  }
  return()=>{disposed=true;observer.disconnect();};
 },[selected]);
 return <nav ref={nav} className={styles.topNav} aria-label="Secciones del panel">
  {sections.map(([section,label])=><button key={section} type="button" disabled={disabled} aria-pressed={selected===section} aria-current={selected===section?'page':undefined} onClick={event=>{if(nav.current)nav.current.dataset.keyboard=String(event.detail===0);onNavigate(section);}}><span>{label}</span></button>)}
  <span className={styles.navIndicator} aria-hidden="true" style={{width:indicator.width,transform:`translateX(${indicator.left}px)`,opacity:indicator.visible?1:0}}/>
 </nav>;
}
