'use client';
import {useEffect,useId,useState} from 'react';
import {specificationLabel,type Category,type Specifications} from '../../catalog/taxonomy';
import styles from './store-traits.module.css';
type Props={slug:string;category:Category;specs:Specifications;disabled:boolean;onChange:(specs:Specifications)=>void};
type Facets={key:string;values:Record<string,(string|number|boolean)[]>;error:string;loading:boolean};
export default function StoreTraits({slug,category,specs,disabled,onChange}:Props){
 const id=useId(),brand=String(specs.brand??''),model=String(specs.model??'');
 const [draft,setDraft]=useState({selected:model,text:model}),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[retry,setRetry]=useState(0);
 const text=draft.selected===model?draft.text:model;
 const query=text===model?'':text.trim(),key=JSON.stringify([slug,category.id,brand,query]);
 const [facets,setFacets]=useState<Facets>({key:'',values:{},error:'',loading:true});
 const current=facets.key===key,loading=!current||facets.loading,values=current?facets.values:{},error=current?facets.error:'';
 const choices=(values.model??[]).filter((value):value is string=>typeof value==='string').sort((a,b)=>a.localeCompare(b,'es')).slice(0,30);
 useEffect(()=>{
  const controller=new AbortController();setFacets({key,values:{},loading:true,error:''});
  const timer=setTimeout(async()=>{
   try{const response=await fetch(`/api/public/${encodeURIComponent(slug)}/facets?${new URLSearchParams({categoryId:category.id,brand,modelQ:query})}`,{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw Error('No pudimos cargar los filtros.');if(!controller.signal.aborted)setFacets({key,values:data.values,loading:false,error:''});}
   catch(error){if(!controller.signal.aborted)setFacets({key,values:{},loading:false,error:(error as Error).message});}
  },query?180:0);
  return()=>{clearTimeout(timer);controller.abort();};
 },[key,retry]);
 useEffect(()=>{if(active>=0)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'});},[active,id]);
 function choose(value:string){setDraft({selected:value,text:value});onChange({...specs,model:value});setOpen(false);setActive(-1);}
 function update(key:string,value:string|number|boolean|undefined){const next={...specs};if(value===undefined)delete next[key];else next[key]=value;onChange(next);}
 return <>
  {error&&<div className={styles.error} role="alert">{error}<button type="button" disabled={disabled} onClick={()=>setRetry(value=>value+1)}>Reintentar</button></div>}
  {category.fields.map(field=>field.key==='model'?<label key={field.key}>Modelo / número de parte<div className={styles.model}><input type="search" role="combobox" aria-label="Buscar modelo" autoComplete="off" aria-autocomplete="list" aria-expanded={open&&!disabled} aria-controls={id} aria-activedescendant={open&&active>=0&&choices[active]?`${id}-${active}`:undefined} disabled={disabled} placeholder={brand?`Buscar modelo de ${brand}…`:'Buscar un modelo…'} maxLength={200} value={text} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onChange={event=>{setDraft({selected:'',text:event.target.value});const next={...specs};delete next.model;onChange(next);setOpen(true);setActive(-1);}} onKeyDown={event=>{
   if(event.nativeEvent.isComposing)return;
   if(event.key==='Escape'){event.preventDefault();setOpen(false);setActive(-1);}
   else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);if(choices.length)setActive(value=>event.key==='ArrowDown'?(value+1)%choices.length:value<=0?choices.length-1:value-1);}
   else if(event.key==='Enter'&&open&&choices.length){event.preventDefault();choose(choices[active>=0?active:0]);}
  }}/>{open&&!disabled&&<div className={styles.suggestions}><div role="listbox" id={id} aria-label="Modelos disponibles" aria-busy={loading}>{choices.map((value,index)=><div key={value} role="option" id={`${id}-${index}`} aria-selected={active===index} className={active===index?styles.selected:undefined} onPointerDown={event=>event.preventDefault()} onPointerMove={()=>setActive(index)} onClick={()=>choose(value)}>{value}</div>)}</div>{(loading||!choices.length)&&<p role="status">{loading?'Buscando modelos…':error||'No hay modelos que coincidan.'}</p>}</div>}</div>{model?<small className={styles.hint}>Modelo seleccionado: {model}</small>:text&&<small className={styles.hint}>Elige una sugerencia para filtrar por modelo.</small>}</label>:<label key={field.key}>{field.label}<select disabled={disabled||loading} value={JSON.stringify(specs[field.key]??'')} onChange={event=>{
   const value=JSON.parse(event.target.value) as string|number|boolean;
   if(field.key==='brand'){onChange(value===''?{}:{brand:value});setDraft({selected:'',text:''});setOpen(false);setActive(-1);}
   else update(field.key,value===''?undefined:value);
  }}><option value={'""'}>{loading?'Cargando opciones…':field.key==='brand'?'Todas las marcas':'Todas'}</option>{[...new Set([...(values[field.key]??[]),...(specs[field.key]!==undefined?[specs[field.key]]:[])])].sort((a,b)=>typeof a==='number'&&typeof b==='number'?a-b:specificationLabel(field,a).localeCompare(specificationLabel(field,b),'es')).map(value=><option key={JSON.stringify(value)} value={JSON.stringify(value)}>{specificationLabel(field,value)}</option>)}</select></label>)}
 </>;
}
