'use client';
import {createContext,useContext,useEffect,useState,type Dispatch,type SetStateAction,type ReactNode} from 'react';
import type {Specifications} from '../../catalog/taxonomy';
export type StoreProduct={id:string;sku:string;name:string;description:string;image_url:string|null;price_minor:string;category_id:string|null;category_name:string|null;specifications:Specifications;availability:{locationId:string;name:string;kind:string;available:number;shippingEnabled:boolean}[]};
type Line={product:StoreProduct;quantity:number};
type Carts=Record<string,Line[]>;
const STORAGE_PREFIX='nexo:store-cart:';
function validCart(value:unknown):Line[]{
 if(!Array.isArray(value))return [];
 return value.slice(0,50).filter((line):line is Line=>Boolean(line&&typeof line==='object'&&'product'in line&&line.product&&typeof line.product.id==='string'&&typeof line.product.name==='string'&&typeof line.product.price_minor==='string'&&Number.isInteger(line.quantity)&&line.quantity>0&&line.quantity<=1000000));
}
const CartContext=createContext<{carts:Carts;setCarts:Dispatch<SetStateAction<Carts>>;hydrated:boolean}|null>(null);
export default function StoreCartProvider({children}:{children:ReactNode}){
 const [carts,setCarts]=useState<Carts>({}),[hydrated,setHydrated]=useState(false);
 useEffect(()=>{
  const restored:Carts={};
  try{for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(!key?.startsWith(STORAGE_PREFIX))continue;const slug=key.slice(STORAGE_PREFIX.length);if(!slug)continue;restored[slug]=validCart(JSON.parse(localStorage.getItem(key)??'null'));}}catch{}
  setCarts(restored);setHydrated(true);
 },[]);
 useEffect(()=>{
  if(!hydrated)return;
  try{for(const [slug,cart] of Object.entries(carts))localStorage.setItem(STORAGE_PREFIX+slug,JSON.stringify(cart));}catch{}
 },[carts,hydrated]);
 return <CartContext.Provider value={{carts,setCarts,hydrated}}>{children}</CartContext.Provider>;
}
export function useStoreCart(slug:string){
 const context=useContext(CartContext);if(!context)throw new Error('Store cart provider missing');
 const cart=context.carts[slug]??[];
 const setCart:Dispatch<SetStateAction<Line[]>>=action=>context.setCarts(previous=>({...previous,[slug]:typeof action==='function'?action(previous[slug]??[]):action}));
 return {cart,setCart,hydrated:context.hydrated};
}

/** Briefly carries the product thumbnail to the cart control after an add succeeds. */
export function animateProductToCart(source:HTMLElement|null,imageUrl:string|null){
 if(!source||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const target=document.querySelector<HTMLElement>('[data-store-cart-trigger]');if(!target)return;
 const from=source.getBoundingClientRect(),to=target.getBoundingClientRect();
 const size=56,startX=from.left+from.width/2-size/2,startY=from.top+from.height/2-size/2;
 const ghost=imageUrl?document.createElement('img'):document.createElement('div');
 if(ghost instanceof HTMLImageElement){ghost.src=imageUrl!;ghost.alt='';}else{ghost.textContent='+';ghost.style.color='white';ghost.style.fontSize='28px';ghost.style.lineHeight='56px';ghost.style.textAlign='center';}
 Object.assign(ghost.style,{position:'fixed',left:`${startX}px`,top:`${startY}px`,width:`${size}px`,height:`${size}px`,objectFit:'contain',padding:'5px',borderRadius:'12px',background:'#fff',boxShadow:'0 8px 22px rgb(19 43 70 / .22)',pointerEvents:'none',zIndex:'10000',willChange:'transform, opacity'});
 document.body.appendChild(ghost);
 const dx=to.left+to.width/2-(startX+size/2),dy=to.top+to.height/2-(startY+size/2);
 const animation=ghost.animate([{transform:'translate(0, 0) scale(1)',opacity:1},{transform:`translate(${dx}px, ${dy}px) scale(.28)`,opacity:.18}],{duration:280,easing:'cubic-bezier(.77,0,.175,1)',fill:'forwards'});
 animation.onfinish=()=>ghost.remove();animation.oncancel=()=>ghost.remove();
}
