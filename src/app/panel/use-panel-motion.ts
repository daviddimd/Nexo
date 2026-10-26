"use client";
import {useLayoutEffect,useRef} from 'react';

/** Animate navigation without remounting forms or changing the scroll layout. */
export default function usePanelMotion(section:string,ready:boolean){
 const panel=useRef<HTMLElement>(null);
 const animations=useRef<Animation[]>([]);
 useLayoutEffect(()=>{
  const element=panel.current;if(!element||!ready)return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop=()=>{animations.current.forEach(animation=>animation.cancel());animations.current=[];};
  const pointer=()=>{element.dataset.motion=preference.matches?'instant':'pointer';};
  const keyboard=()=>{element.dataset.motion='instant';stop();};
  const change=()=>{if(preference.matches){element.dataset.motion='instant';stop();}};
  pointer();
  document.addEventListener('pointerdown',pointer,true);
  document.addEventListener('keydown',keyboard,true);
  preference.addEventListener('change',change);
  return()=>{stop();document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',keyboard,true);preference.removeEventListener('change',change);};
 },[ready]);
 useLayoutEffect(()=>{
  const element=panel.current;
  if(!ready||!element||element.dataset.motion!=='pointer'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const seen=new Set<string>();
  const reveal=()=>{
   if(element.dataset.motion!=='pointer'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   let nextBlock=0;
   element.querySelectorAll<HTMLElement>('[data-panel-reveal]').forEach(block=>{
    const key=block.dataset.panelReveal!;
    if(seen.has(key)||!block.getClientRects().length||block.closest('[hidden]'))return;
    seen.add(key);
    // Keep each batch under 280ms, including data loaded after the heading.
    const delay=Math.min(nextBlock++*35,100);
    animations.current.push(block.animate(
     [{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],
     {duration:180,delay,fill:'backwards',easing:'cubic-bezier(.23,1,.32,1)'}
    ));
   });
  };
  reveal();
  // Data may arrive after mount; reveal each named block once per section visit.
  const observer=new MutationObserver(reveal);
  observer.observe(element,{childList:true,subtree:true});
  return()=>{observer.disconnect();animations.current.forEach(animation=>animation.cancel());animations.current=[];};
 },[section,ready]);
 return panel;
}
