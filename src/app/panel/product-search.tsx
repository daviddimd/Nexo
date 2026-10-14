'use client';
import {useEffect,useId,useRef,useState} from 'react';
import styles from './panel.module.css';
type Suggestion={id:string;name:string;sku:string;active:boolean};
export default function ProductSearch({defaultValue,request,onSelect}:{defaultValue:string;request:(path:string,options?:RequestInit)=>Promise<any>;onSelect:(sku:string,form:HTMLFormElement)=>void}){
  const [value,setValue]=useState(defaultValue),[open,setOpen]=useState(false),[items,setItems]=useState<Suggestion[]>([]),[loading,setLoading]=useState(false),[active,setActive]=useState(-1),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null),listId=useId();
  useEffect(()=>{
    if(!open||!value.trim()){setItems([]);setLoading(false);return;}
    const controller=new AbortController();setItems([]);setActive(-1);setLoading(true);setError('');
    const timer=setTimeout(async()=>{try{const data=await request(`products?limit=6&q=${encodeURIComponent(value.trim())}`,{signal:controller.signal});if(!controller.signal.aborted)setItems(data.items);}catch(error){if(!controller.signal.aborted)setError('No se pudieron cargar las sugerencias. Puedes buscar con Aplicar.');}finally{if(!controller.signal.aborted)setLoading(false);}},200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[value,open]);
  const expanded=open&&!!value.trim();
  function choose(item:Suggestion){setValue(item.sku);setOpen(false);setActive(-1);if(input.current?.form)onSelect(item.sku,input.current.form);}
  return <div className={styles.searchInput}>
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
    <input ref={input} name="q" maxLength={200} value={value} placeholder="Nombre o SKU…" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded?listId:undefined} aria-activedescendant={expanded&&active>=0?`${listId}-${active}`:undefined}
      onChange={event=>{setValue(event.target.value);setOpen(true);setActive(-1);}} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)}
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);setActive(-1);}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);if(items.length)setActive(index=>event.key==='ArrowDown'?(index+1)%items.length:(index<=0?items.length-1:index-1));}else if(event.key==='Enter'&&expanded&&active>=0&&items[active]){event.preventDefault();choose(items[active]);}}}/>
    {expanded&&<div className={styles.suggestions}>
      <div id={listId} role="listbox" aria-label="Productos sugeridos" aria-busy={loading}>
        {items.map((item,index)=><div id={`${listId}-${index}`} key={item.id} role="option" aria-selected={active===index} className={styles.suggestionOption} onPointerDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(item)}><span>{item.name}</span><small>{item.sku}{!item.active?' · Inactivo':''}</small></div>)}
      </div>
      {(loading||error||!items.length)&&<p role="status">{loading?'Buscando productos…':error||'No hay productos que coincidan.'}</p>}
    </div>}
  </div>;
}
