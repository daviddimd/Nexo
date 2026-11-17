'use client';

import Link from 'next/link';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {specificationLabel, type Attribute, type Category, type Specifications} from '../../catalog/taxonomy';
import {emptyInventoryFilters, type InventoryFilters} from '../../catalog/inventory-filters';
import {ActionIcon,IconButton} from '../action-icon';
import ProductSearch from './product-search';
import Modal from './modal';
import styles from './inventory-browser.module.css';

type Location = {id:string; name:string; active?:boolean};
type Product = {id:string; name:string};
export type InventoryMovement = {
 kind:'RECEIPT'|'TRANSFER'|'ADJUSTMENT'; product?:Product; sourceId?:string; destinationId?:string;
};
type Cell = {
 product_id:string; product_name:string; sku:string; location_id:string; location_name:string;
 minimum_stock:number; price_minor:string; active:boolean; available:number; on_hand:number; reserved:number;
};
type Matrix = {items:Cell[]; total:number; counts:Record<string,number>; brands:string[]};
type Facets = {fields:Attribute[]; values:Record<string,(string|number|boolean)[]>};
type Props = {userId:string; categories:Category[]; locations:Location[]; request:(path:string,options?:RequestInit)=>Promise<any>; onMovement:(target?:InventoryMovement)=>void};
const stockStates = [['all','Todos'],['empty','Agotados'],['low','Stock bajo']] as const;
const quantities = [['available','Disponible'],['on_hand','Físico'],['reserved','Reservado']] as const;
type Metric = typeof quantities[number][0];
const filterKeys = Object.keys(emptyInventoryFilters) as (keyof InventoryFilters)[];
const number = new Intl.NumberFormat('es-CL');
const currency = new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP'});
function readSpecs(text:string):Specifications {
 try { const value=JSON.parse(text); return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; }
 catch { return {}; }
}
function csvCell(value:string|number) {
 let text=String(value);
 if(typeof value==='string'&&/^[\s]*[=+@-]|^[\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}

export default function InventoryBrowser({userId,categories,locations,request,onMovement}:Props) {
 const storageKey=`nexo:inventory:${userId}`;
 const [filters,setFilters]=useState<InventoryFilters>(emptyInventoryFilters);
 const [draft,setDraft]=useState<InventoryFilters>(emptyInventoryFilters);
 const [specs,setSpecs]=useState<Specifications>({});
 const [facets,setFacets]=useState<Facets>();
 const [facetError,setFacetError]=useState(false);
 const [limit,setLimit]=useState(25);
 const [page,setPage]=useState(0);
 const [density,setDensity]=useState('compact');
 const [price,setPrice]=useState(false);
 const [open,setOpen]=useState(false);
 const pendingSearch=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [ready,setReady]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [data,setData]=useState<Matrix>();
 const [updated,setUpdated]=useState(0);
 const [now,setNow]=useState(Date.now);
 const [revision,setRevision]=useState(0);
 const [exporting,setExporting]=useState(false);
 const [exportError,setExportError]=useState('');
 const [actions,setActions]=useState<{row:Cell;location?:Location}>();
 const [otherStock,setOtherStock]=useState<{id:string;name:string;available:number}[]>();
 const search=useRef<HTMLFormElement>(null);
 const stickyHead=useRef<HTMLDivElement>(null);
 const body=useRef<HTMLDivElement>(null);
 const exportRequest=useRef<AbortController|null>(null);


 useEffect(()=>{
  const url=new URL(window.location.href);
  let saved:{filters?:InventoryFilters; density?:string; limit?:number; price?:boolean}={};
  try { saved=JSON.parse(localStorage.getItem(storageKey)??'{}')??{}; } catch {}
  const explicit=filterKeys.some(key=>url.searchParams.has(key));
  const initial={...emptyInventoryFilters,...(explicit?{metric:saved.filters?.metric??'available'}:saved.filters)};
  for(const key of filterKeys) { const value=url.searchParams.get(key); if(value!==null)initial[key]=value; }
  initial.specs=JSON.stringify(readSpecs(initial.specs));
  setFilters(initial);setDraft(initial);setSpecs(readSpecs(initial.specs));
  setLimit([25,50,100].includes(saved.limit??0)?saved.limit!:25);
  setDensity(saved.density==='comfortable'?'comfortable':'compact');
  setPrice(saved.price===true);
  setReady(true);
 },[storageKey]);

 useEffect(()=>{
  if(!ready)return;
  const url=new URL(window.location.href);
  // Keep a marker even when every filter is at its default so shared URLs don't read the recipient's preferences.
  for(const key of filterKeys) {
   if(key==='availability'||filters[key]!==emptyInventoryFilters[key])url.searchParams.set(key,filters[key]);
   else url.searchParams.delete(key);
  }
  window.history.replaceState(null,'',url);
  try { localStorage.setItem(storageKey,JSON.stringify({filters,density,limit,price})); } catch {}
 },[ready,filters,density,limit,price,storageKey]);

 useEffect(()=>{
  if(!ready)return;
  const controller=new AbortController();
  setLoading(true);setError('');
  const query=new URLSearchParams({...filters,limit:String(limit),offset:String(page*limit)});
  request(`inventory/matrix?${query}`,{signal:controller.signal}).then((matrix:Matrix)=>{
   if(controller.signal.aborted)return;
   const lastPage=Math.max(0,Math.ceil(matrix.total/limit)-1);
   if(page>lastPage){setPage(lastPage);return;}
   setData(matrix);const time=Date.now();setUpdated(time);setNow(time);
  }).catch(failure=>{if(!controller.signal.aborted)setError((failure as Error).message);})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[ready,filters,limit,page,revision,request]);

 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),30000);
  const shortcut=(event:KeyboardEvent)=>{
   if(event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
   if((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],dialog')||document.querySelector('dialog[open]'))return;
   event.preventDefault();search.current?.querySelector('input')?.focus();
  };
  window.addEventListener('keydown',shortcut);
  return()=>{if(pendingSearch.current)clearTimeout(pendingSearch.current);clearInterval(timer);window.removeEventListener('keydown',shortcut);exportRequest.current?.abort();};
 },[]);

 useEffect(()=>{
  setFacets(undefined);setFacetError(false);
  if(!draft.categoryId)return;
  const controller=new AbortController();
  request(`inventory/facets?categoryId=${encodeURIComponent(draft.categoryId)}`,{signal:controller.signal})
   .then(value=>{if(!controller.signal.aborted)setFacets(value);})
   .catch(()=>{if(!controller.signal.aborted)setFacetError(true);});
  return()=>controller.abort();
 },[draft.categoryId,request]);

 useEffect(()=>{
  setOtherStock(undefined);
  if(!actions?.location||!filters.locationId)return;
  const controller=new AbortController();
  const id=actions.location.id;
  request(`products/${actions.row.product_id}`,{signal:controller.signal}).then((detail:{
   availability:{locationId:string;name:string;active:boolean;available:number}[];
  })=>{
   if(!controller.signal.aborted)setOtherStock(detail.availability
    .filter(location=>location.active&&location.locationId!==id&&location.available>0)
    .map(location=>({id:location.locationId,name:location.name,available:location.available})));
  }).catch(()=>{/* The transfer form still allows choosing an origin manually. */});
  return()=>controller.abort();
 },[actions,filters.locationId,request]);

 function apply(next:InventoryFilters) {
  setPage(0);setFilters(next);setDraft(next);setSpecs(readSpecs(next.specs));
 }
 const visible=locations.filter(location=>!filters.locationId||filters.locationId===location.id);
 const metric:Metric=filters.metric==='on_hand'||filters.metric==='reserved'?filters.metric:'available';
 const metricLabel=quantities.find(([key])=>key===metric)![1];
 const products=new Map<string,{row:Cell;cells:Map<string,Cell>;total:number}>();
 for(const cell of data?.items??[]){
  let product=products.get(cell.product_id);
  if(!product){product={row:cell,cells:new Map(),total:0};products.set(cell.product_id,product);}
  product.cells.set(cell.location_id,cell);product.total+=cell[metric];
 }

 function sort(field:'name'|'stock',location='') {
  const ascending=filters.sort!==`${field}_asc`||filters.sortLocation!==location;
  apply({...filters,sort:`${field}_${ascending?'asc':'desc'}`,sortLocation:location});
 }
 function sortMark(field:'name'|'stock',location='') {
  if(filters.sortLocation!==location)return '';
  if(filters.sort===`${field}_asc`)return ' ↑';
  if(filters.sort===`${field}_desc`)return ' ↓';
  return '';
 }
 function commitSearch(value:string) {
  if(pendingSearch.current)clearTimeout(pendingSearch.current);
  const q=value.trim();
  setPage(0);
  setFilters(current=>current.q===q?current:{...current,q});
  setDraft(current=>current.q===q?current:{...current,q});
 }
 function queueSearch(value:string) {
  if(pendingSearch.current)clearTimeout(pendingSearch.current);
  pendingSearch.current=setTimeout(()=>commitSearch(value),300);
 }
 function submitSearch(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();commitSearch(String(new FormData(event.currentTarget).get('q')??''));
 }
 function clearFilters() {
  if(pendingSearch.current)clearTimeout(pendingSearch.current);
  apply({...emptyInventoryFilters,metric:filters.metric});
 }
 function stockStatus(cells:Map<string,Cell>,minimum:number) {
  const stock=[...cells.values()];
  const empty=stock.filter(cell=>cell.available===0).length;
  if(empty)return empty===1?'Agotado en 1 ubicación':`Agotado en ${empty} ubicaciones`;
  return stock.some(cell=>cell.available<=minimum)?'Reponer':'Al día';
 }
 function sortDirection(field:'name'|'stock',location='') {
  if(filters.sortLocation!==location)return undefined;
  if(filters.sort===`${field}_asc`)return 'ascending' as const;
  if(filters.sort===`${field}_desc`)return 'descending' as const;
 }
 const chips:{label:string; remove:()=>void}[]=[];
 function chip(label:string,patch:Partial<InventoryFilters>) {chips.push({label,remove:()=>apply({...filters,...patch})});}
 if(filters.q)chip(filters.q,{q:''});
 if(filters.locationId)chip(locations.find(l=>l.id===filters.locationId)?.name??'Ubicación',{locationId:'',sortLocation:''});
 if(filters.availability!=='all')chip(stockStates.find(([key])=>key===filters.availability)?.[1]??'Stock',{availability:'all'});
 if(filters.categoryId)chip(categories.find(c=>c.id===filters.categoryId)?.name??'Categoría',{categoryId:'',specs:'{}'});
 if(filters.brand)chip(filters.brand,{brand:''});
 if(filters.status!=='all')chip(filters.status==='active'?'Activo en tienda':'Inactivo',{status:'all'});
 if(filters.priceMin||filters.priceMax)chip(`Precio: ${filters.priceMin||'0'}–${filters.priceMax||'sin límite'}`,{priceMin:'',priceMax:''});
 const appliedSpecs=readSpecs(filters.specs);
 const categoryFields=categories.find(category=>category.id===filters.categoryId)?.fields??[];
 for(const [key,value] of Object.entries(appliedSpecs)){
  const next={...appliedSpecs};delete next[key];
  const field=categoryFields.find(attribute=>attribute.key===key);
  chip(field?`${field.label}: ${specificationLabel(field,value)}`:`${key}: ${value}`,{specs:JSON.stringify(next)});
 }

 async function exportCSV() {
  if(exportRequest.current)return;
  const controller=new AbortController();
  exportRequest.current=controller;setExporting(true);setExportError('');
  try {
   const rows=[['SKU','Producto','Ubicación','Disponible','Físico','Reservado','Mínimo','Precio CLP','Estado'].map(csvCell).join(',')];
   for(let offset=0;;offset+=100){
    const query=new URLSearchParams({...filters,limit:'100',offset:String(offset)});
    const batch:Matrix=await request(`inventory/matrix?${query}`,{signal:controller.signal});
    for(const cell of batch.items)rows.push([cell.sku,cell.product_name,cell.location_name,cell.available,cell.on_hand,cell.reserved,cell.minimum_stock,Number(cell.price_minor),cell.active?'Activo':'Inactivo'].map(csvCell).join(','));
    if(offset+100>=batch.total||batch.items.length===0)break;
   }
   if(controller.signal.aborted)return;
   const url=URL.createObjectURL(new Blob(['\uFEFF',rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));
   const link=document.createElement('a');link.href=url;link.download='inventario-nexo.csv';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch { if(!controller.signal.aborted)setExportError('No se pudo exportar el inventario. Inténtalo nuevamente.'); }
  finally { exportRequest.current=null;if(!controller.signal.aborted)setExporting(false); }
 }

 function stockCell(row:Cell,cell:Cell|undefined,location:Location) {
  if(!cell)return '—';
  const state=metric==='available'?(cell.available===0?'empty':cell.available<=row.minimum_stock?'low':undefined):undefined;
  const text=state==='empty'?'Sin stock':state==='low'?`Stock bajo (mínimo ${row.minimum_stock})`:metricLabel;
  const content=number.format(cell[metric]);
  return row.active&&location.active!==false
   ? <button type="button" className={styles.stock} data-stock={state} title={text} aria-label={`${row.product_name}, ${location.name}: ${cell[metric]}, ${text}. Acciones`} onClick={()=>setActions({row,location})}>{content}</button>
   : <span className={styles.stock} data-stock={state} title={text}><span className={styles.srOnly}>{text}: </span>{content}</span>;
 }

 const columns=<colgroup><col className={styles.productColumn}/><col className={styles.totalColumn}/>{visible.map(location=><col className={styles.locationColumn} key={location.id}/>)}{price&&<col className={styles.priceColumn}/>}<col className={styles.statusColumn}/><col className={styles.actionColumn}/></colgroup>;
 const tableWidth=248+92+visible.length*126+(price?118:0)+160+54;
 const minAgo=Math.max(0,Math.floor((now-updated)/60000));
 const chosenProduct=actions&&products.get(actions.row.product_id);
 const visibleSources=actions?.location&&chosenProduct?[...chosenProduct.cells.values()]
  .filter(cell=>cell.location_id!==actions.location?.id&&cell.available>0&&locations.some(location=>location.id===cell.location_id&&location.active!==false))
  .map(cell=>({id:cell.location_id,name:cell.location_name,available:cell.available})): [];
 const source=(filters.locationId?otherStock??visibleSources:visibleSources).reduce<typeof visibleSources[number]|undefined>(
  (best,location)=>!best||location.available>best.available?location:best,undefined);
 function movement(kind:InventoryMovement['kind']) {
  if(!actions)return;
  onMovement({kind,product:{id:actions.row.product_id,name:actions.row.product_name},...(kind==='TRANSFER'?{sourceId:source?.id,destinationId:actions.location?.id}:{sourceId:actions.location?.id})});
 }
 return <div className={styles.browser} role="region" aria-labelledby="inventory-title">
  <header className={styles.heading}><h2 id="inventory-title">Inventario</h2></header>
  <div className={styles.toolbar}>
   <form ref={search} className={styles.search} onSubmit={submitSearch} role="search">
    <ProductSearch defaultValue={filters.q} request={request} ariaLabel="Buscar producto" onValueChange={queueSearch} onSelect={commitSearch}/>
    <kbd aria-hidden="true">/</kbd>
   </form>
   <div className={styles.tools}>
    <details className={styles.help}><summary aria-label="Cómo leer el inventario" title="Cómo leer el inventario"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg></summary><div>
     <strong>Cómo leer el inventario</strong><p>Físico: unidades en la ubicación. Reservado: unidades comprometidas. Disponible: físico menos reservado.</p>
     <p>Agotados cuenta cada producto con al menos una ubicación visible en cero. El número ámbar señala stock bajo según el mínimo del producto. Total suma las ubicaciones visibles.</p>
    </div></details>
    <button type="button" className={styles.ghost} aria-label="Actualizar inventario" title={updated?(minAgo?`Actualizado hace ${minAgo} min`:'Actualizado hace un momento'):'Actualizar inventario'} disabled={loading} onClick={()=>setRevision(value=>value+1)}><ActionIcon name="refresh" size={18}/></button>
    <button type="button" disabled={exporting||!data?.total||loading} onClick={()=>void exportCSV()}>{exporting?'Exportando…':'Exportar CSV'}</button>
    <button type="button" className={styles.primaryAction} onClick={()=>onMovement()}>Registrar movimiento</button>
   </div>
  </div>
  {exportError&&<p role="alert">{exportError}</p>}
  <div className={styles.toolbar}>
   <div className={styles.states} role="group" aria-label="Disponibilidad">
    {stockStates.map(([key,label])=><button key={key} type="button" aria-pressed={filters.availability===key} onClick={()=>apply({...filters,availability:key})}>{label}{data?.counts[key]!==undefined&&` (${number.format(data.counts[key])})`}</button>)}
   </div>
   <div className={styles.tools}>
    <button type="button" aria-expanded={open} aria-controls="inventory-filters" onClick={()=>setOpen(!open)}>Filtros{chips.length>0&&` (${chips.length})`}</button>
    <details className={styles.view}><summary>Vista</summary><div className={styles.viewPanel}>
     <fieldset><legend>Ver</legend>{quantities.map(([key,label])=><label key={key}><input type="radio" name="inventory-metric" checked={metric===key} onChange={()=>apply({...filters,metric:key})}/>{label}</label>)}</fieldset>
     <fieldset><legend>Densidad</legend>{[['compact','Compacta'],['comfortable','Cómoda']].map(([key,label])=><label key={key}><input type="radio" name="inventory-density" checked={density===key} onChange={()=>setDensity(key)}/>{label}</label>)}</fieldset>
     <fieldset><legend>Columnas</legend><label><input type="checkbox" checked={price} onChange={event=>setPrice(event.target.checked)}/> Precio</label></fieldset>
     <label className={styles.mobileSort}>Ordenar<select value={filters.sortLocation?'location':filters.sort} onChange={event=>apply({...filters,sort:event.target.value,sortLocation:''})}><option value="name_asc">Nombre A–Z</option><option value="name_desc">Nombre Z–A</option><option value="sku_asc">SKU A–Z</option><option value="sku_desc">SKU Z–A</option><option value="stock_asc">Menor total</option><option value="stock_desc">Mayor total</option>{filters.sortLocation&&<option value="location" disabled>Por ubicación</option>}</select></label>
    </div></details>
   </div>
  </div>
  {chips.length>0&&<div className={styles.chips} aria-label="Filtros activos">{chips.map(({label,remove},index)=><button type="button" key={index} onClick={remove} aria-label={`Quitar filtro: ${label}`}>{label} ×</button>)}</div>}
  <div className={styles.layout} data-expanded={open}>
   <aside id="inventory-filters" className={styles.sidebar} hidden={!open} aria-label="Filtros de inventario">
    <form onSubmit={event=>{event.preventDefault();apply({...draft,specs:JSON.stringify(specs)});}}>
     <details open><summary>Ubicación</summary>
      <label>Ubicación<select value={draft.locationId} onChange={event=>setDraft({...draft,locationId:event.target.value,sortLocation:''})}><option value="">Todas las ubicaciones</option>{locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
     </details>
     <label>Categoría<select value={draft.categoryId} onChange={event=>{setDraft({...draft,categoryId:event.target.value});setSpecs({});}}><option value="">Todas las categorías</option>{categories.map(category=><option key={category.id} value={category.id}>{category.path}</option>)}</select></label>
     <label>Marca<select value={draft.brand} onChange={event=>setDraft({...draft,brand:event.target.value})}><option value="">Todas las marcas</option>{[...new Set([...(data?.brands??[]),...(draft.brand?[draft.brand]:[])])].map(brand=><option key={brand}>{brand}</option>)}</select></label>
     <label>Estado en tienda<select value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value})}><option value="all">Todos</option><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label>
     <details><summary>Precio</summary><label>Desde (CLP)<input type="number" min={0} max={1e12} value={draft.priceMin} onChange={event=>setDraft({...draft,priceMin:event.target.value})}/></label><label>Hasta (CLP)<input type="number" min={draft.priceMin||0} max={1e12} value={draft.priceMax} onChange={event=>setDraft({...draft,priceMax:event.target.value})}/></label></details>
     {!draft.categoryId?<p className={styles.hint}>Características: selecciona una categoría.</p>:<details key={draft.categoryId} open><summary>Características</summary>
      {facetError?<p role="alert">No se pudieron cargar las características.</p>:!facets?<p role="status">Cargando características…</p>:facets.fields.filter(field=>field.key!=='brand'&&facets.values[field.key]?.length>0).map(field=><label key={field.key}>{field.label}<select value={specs[field.key]===undefined?'':JSON.stringify(specs[field.key])} onChange={event=>{const next={...specs};if(event.target.value)next[field.key]=JSON.parse(event.target.value);else delete next[field.key];setSpecs(next);}}><option value="">Todas las opciones</option>{facets.values[field.key].map(value=><option value={JSON.stringify(value)} key={JSON.stringify(value)}>{specificationLabel(field,value)}</option>)}</select></label>)}
      {facets&&!facets.fields.some(field=>field.key!=='brand'&&facets.values[field.key]?.length>0)&&<p className={styles.hint}>Esta categoría no tiene características filtrables cargadas.</p>}
     </details>}
     <div className={styles.filterActions}><button className={styles.apply} type="submit">Aplicar</button><button className={styles.clear} type="button" onClick={clearFilters}>Limpiar{chips.length>0&&` (${chips.length})`}</button></div>
    </form>
   </aside>
   <div className={styles.results} aria-busy={loading}>
    {error?<div className={styles.empty} role="alert"><p>{error}</p><button type="button" onClick={()=>setRevision(revision+1)}>Reintentar</button><button type="button" onClick={()=>apply(emptyInventoryFilters)}>Restablecer filtros</button></div>:loading?<div className={styles.skeleton} aria-label="Cargando inventario">{Array.from({length:5},(_,index)=><span key={index}/>)}</div>:!products.size?<div className={styles.empty}><p>No hay productos con estos filtros.</p><button type="button" onClick={clearFilters}>Limpiar filtros</button></div>:<>
     <div className={styles.desktop} style={{'--table-width':`${tableWidth}px`} as React.CSSProperties}>
      <div className={styles.sticky}><div ref={stickyHead} className={styles.headClip} onScroll={event=>{if(body.current&&body.current.scrollLeft!==event.currentTarget.scrollLeft)body.current.scrollLeft=event.currentTarget.scrollLeft;}}>
       <table className={styles.matrix} role="presentation">{columns}<tbody><tr>
        <td><button type="button" onClick={()=>sort('name')}>Producto{sortMark('name')}</button></td>
        <td><button type="button" onClick={()=>sort('stock')}>Total{sortMark('stock')}</button></td>
        {visible.map(location=><td key={location.id}><button title={location.name} type="button" onClick={()=>sort('stock',location.id)}>{location.name.replace(/^Sucursal /,'')}{sortMark('stock',location.id)}</button></td>)}
        {price&&<td>Precio CLP</td>}<td>Estado</td><td/>
       </tr></tbody></table>
      </div></div>
      <div ref={body} tabIndex={0} role="region" aria-label="Matriz de inventario con desplazamiento horizontal" className={styles.tableScroll} onScroll={event=>{if(stickyHead.current)stickyHead.current.scrollLeft=event.currentTarget.scrollLeft;}}>
       <table className={styles.matrix} data-density={density}>{columns}
        <thead><tr>{['Producto','Total',...visible.map(location=>location.name),...(price?['Precio CLP']:[]),'Estado','Acciones'].map((label,index)=><th scope="col" key={index} aria-sort={index===0?sortDirection('name'):index===1?sortDirection('stock'):visible[index-2]?sortDirection('stock',visible[index-2].id):undefined}><span className={styles.srOnly}>{label}</span></th>)}</tr></thead>
        <tbody>{[...products.values()].map(({row,cells,total})=><tr key={row.product_id}>
         <th scope="row"><Link href={`/panel/productos/${row.product_id}`} prefetch={false}>{row.product_name}</Link><small>{row.sku}{!row.active?' · Inactivo':''}</small></th>
         <td><strong>{number.format(total)}</strong></td>{visible.map(location=><td key={location.id}>{stockCell(row,cells.get(location.id),location)}</td>)}
         {price&&<td>{currency.format(BigInt(row.price_minor))}</td>}
         <td className={styles.rowStatus}>{stockStatus(cells,row.minimum_stock)}</td>
         <td><button type="button" className={styles.more} aria-label={`Acciones de ${row.product_name}`} onClick={()=>setActions({row})}>⋯</button></td>
        </tr>)}</tbody>
       </table>
      </div>
     </div>
     <div className={styles.cards} data-density={density}>{[...products.values()].map(({row,cells,total})=><article key={row.product_id}>
      <div><Link href={`/panel/productos/${row.product_id}`} prefetch={false}>{row.product_name}</Link><small>{row.sku}{!row.active?' · Inactivo':''}{price?` · ${currency.format(BigInt(row.price_minor))}`:''}</small></div>
      <button type="button" className={styles.more} aria-label={`Acciones de ${row.product_name}`} onClick={()=>setActions({row})}>⋯</button>
      <small className={styles.cardStatus}>{stockStatus(cells,row.minimum_stock)}</small><details><summary>Total {metricLabel.toLowerCase()}: <strong>{number.format(total)}</strong> · Ubicaciones</summary><ul>{visible.map(location=><li key={location.id}>{location.name}{stockCell(row,cells.get(location.id),location)}</li>)}</ul></details>
     </article>)}</div>
    <footer className={styles.resultsBar}>
     <span aria-live="polite">{data?.total?`${number.format(page*limit+1)}–${number.format(Math.min((page+1)*limit,data.total))} de ${number.format(data.total)}`:data?'0 productos':''}</span>
     <label>Por página<select value={limit} onChange={event=>{setPage(0);setLimit(Number(event.target.value));}}>{[25,50,100].map(value=><option key={value}>{value}</option>)}</select></label>
     <nav aria-label="Páginas de inventario"><IconButton icon="previous" label="Página anterior" disabled={loading||page===0} onClick={()=>setPage(page-1)}/><IconButton icon="next" label="Página siguiente" disabled={loading||!data||(page+1)*limit>=data.total} onClick={()=>setPage(page+1)}/></nav>
    </footer>
    </>}
   </div>
  </div>
  {actions&&<Modal busy={false} title={actions.location?actions.location.name:actions.row.product_name} onClose={()=>setActions(undefined)}>
   <div className={styles.rowMenu}>
    {actions.location&&<p>{actions.row.product_name}</p>}
    <Link href={`/panel/productos/${actions.row.product_id}`} prefetch={false}>Ver ficha</Link>
    {actions.row.active&&<>
     <button type="button" onClick={()=>movement('RECEIPT')}>Registrar entrada</button>
     <button type="button" onClick={()=>movement('TRANSFER')}>{source?`Transferir desde ${source.name} (${source.available} disponibles)`:'Transferir'}</button>
     <button type="button" onClick={()=>movement('ADJUSTMENT')}>Ajustar stock</button>
    </>}
   </div>
  </Modal>}
 </div>;
}
