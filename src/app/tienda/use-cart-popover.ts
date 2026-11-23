"use client";
import {useCallback,useLayoutEffect,useRef} from 'react';

/** Non-modal native popover, positioned from the actual cart trigger. */
export default function useCartPopover(busy:boolean,onDismiss:()=>void){
 const panel=useRef<HTMLDivElement>(null),busyRef=useRef(busy),dismiss=useRef(onDismiss);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),closing=useRef(false);
 busyRef.current=busy;dismiss.current=onDismiss;
 const close=useCallback(()=>{
  if(busyRef.current||closing.current)return;
  closing.current=true;
  panel.current?.hidePopover();
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  timer.current=setTimeout(()=>dismiss.current(),reduce?0:220);
 },[]);
 useLayoutEffect(()=>{
  const element=panel.current;if(!element)return;
  const anchor=document.querySelector<HTMLButtonElement>('[data-store-cart-trigger]');
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  let frame:number|null=null;
  function position(){
   const rect=anchor?.getBoundingClientRect(),width=Math.min(500,window.innerWidth-24);
   const top=Math.max(12,Math.min((rect?.bottom??12)+10,window.innerHeight-180));
   const right=Math.min(Math.max(12,window.innerWidth-(rect?.right??window.innerWidth-12)),window.innerWidth-width-12);
   element!.style.width=width+'px';element!.style.top=top+'px';element!.style.right=right+'px';
   element!.style.maxHeight=Math.max(100,window.innerHeight-top-12)+'px';
   const origin=(rect?rect.left+rect.width/2:window.innerWidth-24)-(window.innerWidth-right-width);
   element!.style.transformOrigin=Math.max(20,Math.min(width-20,origin))+'px 0px';
  }
  function update(){if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;position();});}
  function outside(event:PointerEvent){if(!element!.contains(event.target as Node))close();}
  function escape(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();close();}}
  position();element.showPopover();anchor?.setAttribute('aria-expanded','true');
  element.querySelector<HTMLButtonElement>('[data-cart-close]')?.focus({preventScroll:true});
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);
  window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  return()=>{
   const shouldRestore=element.contains(document.activeElement)||document.activeElement===document.body;
   document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);
   window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);
   if(frame!==null)cancelAnimationFrame(frame);if(timer.current!==null)clearTimeout(timer.current);
   element.hidePopover();anchor?.setAttribute('aria-expanded','false');
   if(shouldRestore&&previous?.isConnected)previous.focus({preventScroll:true});
  };
 },[close]);
 return {panel,close};
}
