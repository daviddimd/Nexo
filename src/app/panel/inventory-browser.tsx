'use client';
import {useEffect,useId,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {specificationLabel,type Attribute,type Category,type Specifications} from '../../catalog/taxonomy';
import {emptyInventoryFilters,type InventoryFilters} from '../../catalog/inventory-filters';
import ProductSearch from './product-search';
import styles from './inventory-browser.module.css';
type Facets={fields:Attribute[];values:Record<string,(string|number|boolean)[]>};
type Props={filters:InventoryFilters;categories:Category[];locations:{id:string;name:string}[];busy:boolean;request:(path:string,options?:RequestInit)=>Promise<any>;onApply:(filters:InventoryFilters)=>Promise<boolean>;children:ReactNode};
export default function InventoryBrowser({filters,categories,locations,busy,request,onApply,children}:Props){
 const [open,setOpen]=useState(true),[draft,setDraft]=useState(filters),[specs,setSpecs]=useState<Specifications>(()=>JSON.parse(filters.specs)),[facets,setFacets]=useState<Facets>({fields:[],values:{}}),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const form=useRef<HTMLFormElement>(null),panelId=useId();
 useEffect(()=>{if(window.matchMedia('(max-width:760px)').matches)setOpen(false);},[]);
 useEffect(()=>{setDraft(filters);setSpecs(JSON.parse(filters.specs));},[filters]);
 useEffect(()=>{
  const controller=new AbortController();setFacets({fields:[],values:{}});setError('');
  if(!draft.categoryId){setLoading(false);return()=>controller.abort();}
  setLoading(true);
  request(`inventory/facets?categoryId=${encodeURIComponent(draft.categoryId)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setFacets(data);}).catch(error=>{if(!controller.signal.aborted)setError((error as Error).message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[draft.categoryId,request]);
 const appliedSpecs=JSON.parse(filters.specs) as Specifications;
 const count=Number(Boolean(filters.q))+Number(Boolean(filters.categoryId))+Number(Boolean(filters.priceMin||filters.priceMax))+Number(Boolean(filters.locationId))+Number(filters.availability!=='all')+Object.keys(appliedSpecs).length;
 function values(q?:string){return {...draft,q:q??String(new FormData(form.current!).get('q')??''),sort:filters.sort,specs:JSON.stringify(specs)};}
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();void onApply(values());}
 return <div className={styles.browser}>
  <div className={styles.toolbar}><button type="button" className={styles.toggle} aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(v=>!v)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filtros{count>0&&<span className={styles.count}>{count}</span>}<svg className={open?styles.chevronOpen:undefined} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></button>
   <label className={styles.sort}>Ordenar por<select value={filters.sort} disabled={busy} onChange={e=>void onApply({...filters,sort:e.target.value})}><option value="name_asc">Nombre: A–Z</option><option value="name_desc">Nombre: Z–A</option><option value="sku_asc">SKU: A–Z</option><option value="sku_desc">SKU: Z–A</option><option value="stock_asc">Stock: menor a mayor</option><option value="stock_desc">Stock: mayor a menor</option></select></label>
  </div>
  <div className={`${styles.layout} ${open?styles.expanded:''}`}>
   <aside className={styles.sidebar} id={panelId} hidden={!open} aria-label="Filtros de inventario"><form ref={form} onSubmit={submit}><fieldset disabled={busy}>
    <label className={styles.search}>Buscar producto<ProductSearch defaultValue={draft.q} onValueChange={q=>setDraft(v=>({...v,q}))} request={request} onSelect={sku=>void onApply(values(sku))}/></label>
    <details open><summary>Categoría</summary><label><span className={styles.srOnly}>Categoría del producto</span><select value={draft.categoryId} onChange={e=>{setDraft(v=>({...v,categoryId:e.target.value}));setSpecs({});}}><option value="">Todas las categorías</option>{categories.map(c=><option key={c.id} value={c.id}>{c.path}</option>)}</select></label></details>
    <details open><summary>Precio</summary><div className={styles.prices}><label>Desde (CLP)<input type="number" min={0} max={1e12} step={1} placeholder="0" value={draft.priceMin} onChange={e=>setDraft(v=>({...v,priceMin:e.target.value}))}/></label><label>Hasta (CLP)<input type="number" min={draft.priceMin||0} max={1e12} step={1} placeholder="Sin límite" value={draft.priceMax} onChange={e=>setDraft(v=>({...v,priceMax:e.target.value}))}/></label></div></details>
    <details open><summary>Características</summary>{!draft.categoryId?<p className={styles.hint}>Selecciona una categoría para ver sus características.</p>:loading?<p className={styles.hint} role="status">Cargando características…</p>:error?<p className={styles.error} role="alert">{error}</p>:<>
     {facets.fields.filter(field=>facets.values[field.key]?.length).map(field=><label key={field.key}>{field.label}<select value={specs[field.key]===undefined?'':JSON.stringify(specs[field.key])} onChange={e=>{const value=e.target.value;setSpecs(previous=>{const next={...previous};if(value==='')delete next[field.key];else next[field.key]=JSON.parse(value);return next;});}}><option value="">Todas las opciones</option>{facets.values[field.key].map(value=><option key={JSON.stringify(value)} value={JSON.stringify(value)}>{specificationLabel(field,value)}</option>)}</select></label>)}
     {!facets.fields.some(field=>facets.values[field.key]?.length)&&<p className={styles.hint}>Esta categoría aún no tiene características cargadas.</p>}
    </>}</details>
    <details><summary>Ubicación y stock</summary><label>Ubicación<select value={draft.locationId} onChange={e=>setDraft(v=>({...v,locationId:e.target.value}))}><option value="">Todas las ubicaciones</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Disponibilidad<select value={draft.availability} onChange={e=>setDraft(v=>({...v,availability:e.target.value}))}><option value="all">Todo el stock</option><option value="available">Con stock</option><option value="empty">Sin stock</option><option value="low">Stock bajo (1 a 5)</option></select></label></details>
    <div className={styles.actions}><button type="submit" className={styles.apply}>Aplicar filtros</button><button type="button" className={styles.clear} onClick={()=>void onApply({...emptyInventoryFilters,sort:filters.sort})}>Limpiar filtros</button></div>
   </fieldset></form></aside>
   <div className={styles.content}>{count>0&&<div className={styles.applied} role="status">{count} {count===1?'filtro aplicado':'filtros aplicados'}{filters.categoryId&&<span> · {categories.find(c=>c.id===filters.categoryId)?.name}</span>}</div>}{children}</div>
  </div>
 </div>;
}
