"use client";
import {useLayoutEffect,useRef} from 'react';
import {interpolateAmount} from '../catalog/amount-motion';
import styles from './animated-amount.module.css';

export const AMOUNT_DURATION_MS=1200;
const currency=new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
/** Entrance feedback only: values used by forms and assistive technology are always exact. */
export default function AnimatedAmount({value,active=true}:{value:string|bigint;active?:boolean}){
 const target=BigInt(value),text=currency.format(target);
 const root=useRef<HTMLSpanElement>(null),visual=useRef<HTMLSpanElement>(null);
 const previous=useRef<{active:boolean;target:bigint}|null>(null);
 useLayoutEffect(()=>{
  const element=root.current,number=visual.current;if(!element||!number)return;
  const before=previous.current;previous.current={active,target};
  let frame=0,observer:IntersectionObserver|undefined,started=false,settled=false;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const finish=()=>{settled=true;cancelAnimationFrame(frame);number.textContent=currency.format(target);observer?.disconnect();};
  const keyboard=()=>finish();
  const visibility=()=>{if(document.hidden)finish();};
  const reduced=()=>{if(preference.matches)finish();};
  // Totals edited during a sale must update immediately, rather than counting again on every input.
  if(!active||target===0n||preference.matches||document.hidden||element.closest('[data-motion="instant"]')||(before?.active&&before.target!==target)){
   finish();return;
  }
  number.textContent=currency.format(0n);
  const start=()=>{
   if(started||settled)return;started=true;observer?.disconnect();
   let origin:number|undefined;
   const tick=(time:number)=>{
    if(settled)return;
    origin??=time;const progress=Math.min(1,(time-origin)/AMOUNT_DURATION_MS);
    // Cubic ease-out: rapid initial movement with a gradual finish, without overshooting.
    const eased=1-Math.pow(1-progress,3);
    number.textContent=currency.format(interpolateAmount(0n,target,eased));
    if(progress<1)frame=requestAnimationFrame(tick);else finish();
   };
   frame=requestAnimationFrame(tick);
  };
  if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))start();},{threshold:.1});observer.observe(element);}else start();
  document.addEventListener('keydown',keyboard,true);
  document.addEventListener('visibilitychange',visibility);
  preference.addEventListener('change',reduced);
  return()=>{finish();document.removeEventListener('keydown',keyboard,true);document.removeEventListener('visibilitychange',visibility);preference.removeEventListener('change',reduced);};
 },[target,active]);
 return <span ref={root} className={styles.amount}><span className={styles.readable}>{text}</span><span aria-hidden="true" className={styles.size}>{text}</span><span ref={visual} aria-hidden="true" className={styles.visual}>{text}</span></span>;
}
