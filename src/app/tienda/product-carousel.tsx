'use client';
import Link from 'next/link';
import {productLabel} from '../../catalog/product-label';
import {useEffect,useLayoutEffect,useId,useRef,useState} from 'react';
import {ActionIcon} from '../action-icon';
import type {StoreProduct} from './cart-context';
import styles from './product-carousel.module.css';

const money=(value:string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));

export default function ProductCarousel({products,slug,disabled}:{products:StoreProduct[];slug:string;disabled:boolean}){
 const viewport=useRef<HTMLDivElement>(null),container=useRef<HTMLElement>(null),current=useRef(0),id=useId();
 const [index,setIndex]=useState(0),[rotating,setRotating]=useState(true),[hovered,setHovered]=useState(false),[visible,setVisible]=useState(false),[documentHidden,setDocumentHidden]=useState(false);
 const looping=products.length>1;
 const slides=looping?[products[products.length-1],...products,products[0]]:products;
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>{if(preference.matches)setRotating(false);};reduced();preference.addEventListener('change',reduced);
  const visibility=()=>setDocumentHidden(document.hidden);visibility();document.addEventListener('visibilitychange',visibility);
  const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{threshold:.1});
  if(container.current)observer.observe(container.current);
  return()=>{preference.removeEventListener('change',reduced);document.removeEventListener('visibilitychange',visibility);observer.disconnect();};
 },[]);
 useEffect(()=>{
  if(!looping||!rotating||hovered||!visible||documentHidden||disabled)return;
  const timer=setInterval(()=>go(current.current+1),5000);return()=>clearInterval(timer);
 },[looping,rotating,hovered,visible,documentHidden,disabled,index]);
 useLayoutEffect(()=>{
  const element=viewport.current;if(!element)return;
  element.scrollTo({left:(current.current+(looping?1:0))*element.clientWidth,behavior:'instant'});
  const observer=new ResizeObserver(()=>element.scrollTo({left:(current.current+(looping?1:0))*element.clientWidth,behavior:'instant'}));
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 function go(next:number,keyboard=false){
  const element=viewport.current;if(!element)return;
  if(!products.length)return;
  const target=looping?(next<0?0:next>=products.length?products.length+1:next+1):0;
  element.scrollTo({left:target*element.clientWidth,behavior:keyboard||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 function settle(){
  const element=viewport.current;if(!looping||!element?.clientWidth)return;
  const physical=Math.round(element.scrollLeft/element.clientWidth);
  if(physical===0||physical===products.length+1)element.scrollTo({left:(physical===0?products.length:1)*element.clientWidth,behavior:'instant'});
 }
 if(!products.length)return <section className={styles.empty}><h1>Explora nuestro catálogo</h1><a href="#catalogo">Ver productos →</a></section>;
 return <section ref={container} className={styles.carousel} onPointerEnter={event=>{if(event.pointerType==='mouse')setHovered(true);}} onPointerLeave={()=>setHovered(false)} onFocusCapture={event=>{if(!(event.target as HTMLElement).closest('[data-rotation-control]'))setRotating(false);}} aria-roledescription="carrusel" aria-label="Productos destacados">
  <div ref={viewport} id={id} className={styles.viewport} tabIndex={0} aria-label="Desliza para ver más productos" onPointerDown={()=>setRotating(false)} onScrollEnd={settle} onScroll={event=>{
   const element=event.currentTarget;if(!element.clientWidth)return;
   const physical=Math.round(element.scrollLeft/element.clientWidth);
   const next=looping?((physical-1)%products.length+products.length)%products.length:0;
   current.current=next;setIndex(next);
  }} onKeyDown={event=>{
   if(event.target!==event.currentTarget)return;
   if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();go(event.key==='Home'?0:event.key==='End'?products.length-1:current.current+(event.key==='ArrowRight'?1:-1),true);
   }
  }}>
   {slides.map((product,physical)=>{const clone=looping&&(physical===0||physical===slides.length-1),slide=looping?((physical-1)%products.length+products.length)%products.length:0;const label=productLabel(product);return <div key={`${product.id}-${physical}`} inert={clone} aria-hidden={clone||undefined} data-variant={slide%3} className={styles.slide} role="group" aria-roledescription="diapositiva" aria-label={`${slide+1} de ${products.length}: ${product.name}`}>
    <div className={styles.copy}><span className={styles.category}>{label.brand}</span>{slide===0&&!clone?<h1>{label.title}</h1>:<h2>{label.title}</h2>}<strong className={styles.price}>{money(product.price_minor)}</strong><Link className={styles.link} href={`/tienda/productos/${product.id}?empresa=${encodeURIComponent(slug)}`} prefetch={false} aria-disabled={disabled} onClick={event=>{if(disabled)event.preventDefault();}}>Ver producto <span aria-hidden="true">↗</span></Link></div>
    <Link className={styles.photo} href={`/tienda/productos/${product.id}?empresa=${encodeURIComponent(slug)}`} prefetch={false} aria-disabled={disabled} onClick={event=>{if(disabled)event.preventDefault();}} tabIndex={-1} aria-hidden="true"><img src={product.image_url!} alt="" width={900} height={600} loading={slide===0&&!clone?'eager':'lazy'} fetchPriority={slide===0&&!clone?'high':'auto'}/></Link>
   </div>;})}
  </div>
  {products.length>1&&<div className={styles.controls}><div className={styles.dots} aria-label="Elegir producto destacado">{products.map((product,slide)=><button type="button" key={product.id} aria-label={`Mostrar ${product.name}`} aria-current={slide===index?'true':undefined} aria-controls={id} onClick={event=>go(slide,event.detail===0)}><span/></button>)}</div><div className={styles.arrows}><button type="button" data-rotation-control aria-label={rotating?'Pausar carrusel automático':'Reanudar carrusel automático'} aria-controls={id} onClick={()=>setRotating(value=>!value)}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{rotating?<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>:<path d="m8 5 11 7-11 7V5Z"/>}</svg></button><span className={styles.counter} aria-live={rotating?'off':'polite'} aria-atomic="true">{index+1} / {products.length}</span><button type="button" aria-label="Producto anterior" aria-controls={id} onClick={event=>go(current.current-1,event.detail===0)}><ActionIcon name="previous" size={18}/></button><button type="button" aria-label="Producto siguiente" aria-controls={id} onClick={event=>go(current.current+1,event.detail===0)}><ActionIcon name="next" size={18}/></button></div></div>}
 </section>;
}
