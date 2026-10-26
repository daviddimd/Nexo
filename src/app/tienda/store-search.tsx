'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {productLabel} from '../../catalog/product-label';
import {useRouter} from 'next/navigation';
import type {StoreProduct} from './cart-context';
import styles from './store-search.module.css';

const money=(value:string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
type Results={query:string;items:StoreProduct[];loading:boolean;error:string};
export default function StoreSearch({slug,value,disabled,className,onChange,onSearch}:{slug:string;value:string;disabled:boolean;className:string;onChange:(value:string)=>void;onSearch:()=>void}){
 const router=useRouter(),id=useId(),form=useRef<HTMLFormElement>(null),list=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1),[results,setResults]=useState<Results>({query:'',items:[],loading:false,error:''});
 const query=value.trim(),expanded=open&&!disabled&&query.length>0;
 const current=results.query===query,items=current?results.items:[],loading=!current||results.loading,error=current?results.error:'';
 useEffect(()=>{
  if(!expanded)return;
  const controller=new AbortController();setResults({query,items:[],loading:true,error:''});
  const timer=setTimeout(async()=>{
   try{
    const params=new URLSearchParams({q:query,limit:'6'});
    const response=await fetch(`/api/public/${encodeURIComponent(slug)}/catalog?${params}`,{cache:'no-store',signal:controller.signal});
    const data=await response.json();if(!response.ok)throw Error('No pudimos cargar las sugerencias. Puedes pulsar Buscar para intentarlo.');
    if(!controller.signal.aborted)setResults({query,items:data.products,loading:false,error:''});
   }catch(error){if(!controller.signal.aborted)setResults({query,items:[],loading:false,error:(error as Error).message});}
  },180);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query,slug,expanded]);
 useEffect(()=>{const close=(event:PointerEvent)=>{if(!form.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 useEffect(()=>{if(active>=0)list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({block:'nearest'});},[active]);
 function choose(product:StoreProduct){if(disabled)return;setOpen(false);setActive(-1);router.push(`/tienda/productos/${encodeURIComponent(product.id)}?empresa=${encodeURIComponent(slug)}`);}
 return <form ref={form} className={`${className} ${styles.form}`} role="search" onSubmit={event=>{event.preventDefault();if(disabled)return;setOpen(false);setActive(-1);onSearch();}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);}}>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
  <input type="search" role="combobox" aria-label="Buscar productos por nombre o SKU" aria-autocomplete="list" aria-expanded={expanded} aria-controls={id} aria-activedescendant={expanded&&active>=0&&items[active]?`${id}-${active}`:undefined} autoComplete="off" enterKeyHint="search" maxLength={200} placeholder="Buscar un producto o modelo…" value={value} disabled={disabled} onChange={event=>{onChange(event.target.value);setActive(-1);setOpen(true);}} onFocus={()=>setOpen(true)} onKeyDown={event=>{
   if(event.nativeEvent.isComposing)return;
   if(event.key==='Escape'){event.preventDefault();setOpen(false);setActive(-1);}
   else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);if(items.length)setActive(index=>event.key==='ArrowDown'?(index+1)%items.length:index<=0?items.length-1:index-1);}
   else if(event.key==='Enter'&&expanded&&active>=0&&items[active]){event.preventDefault();choose(items[active]);}
  }}/>
  <button type="submit" disabled={disabled}>Buscar</button>
  {expanded&&<div className={styles.popup}>
   <div className={styles.heading}>Productos sugeridos <small>Nombre o SKU</small></div>
   <div ref={list} id={id} role="listbox" aria-label="Resultados de búsqueda" aria-busy={loading} className={styles.results}>
    {items.map((product,index)=>{const label=productLabel(product);return <div key={product.id} id={`${id}-${index}`} data-index={index} role="option" aria-selected={active===index} className={`${styles.option} ${active===index?styles.selected:''}`} onPointerDown={event=>event.preventDefault()} onPointerMove={()=>setActive(index)} onClick={()=>choose(product)}>
     <div className={styles.image}>{product.image_url?<img src={product.image_url} alt="" width={52} height={52}/>:<span aria-hidden="true">▧</span>}</div><div className={styles.name}>{label.brand&&<small className={styles.brand}>{label.brand}</small>}<strong>{label.title}</strong><small>{product.sku}</small></div><div className={styles.price}><strong>{money(product.price_minor)}</strong><small>{product.availability.some(location=>location.available>0)?'Disponible':'Sin stock'}</small></div>
    </div>;})}
   </div>
   {(loading||error||!items.length)&&<p className={styles.status} role="status">{loading?'Buscando productos…':error||'No encontramos productos con ese nombre o SKU.'}</p>}
   <button type="submit" className={styles.allResults}>Ver resultados en el catálogo <span aria-hidden="true">→</span></button>
  </div>}
 </form>;
}
