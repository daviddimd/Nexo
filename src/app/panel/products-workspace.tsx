'use client';
import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import type {Category} from '../../catalog/taxonomy';
import type {ManagedProduct} from './catalog-manager';
import {IconButton} from '../action-icon';
import RowActions from './row-actions';
import ProductSearch from './product-search';
import styles from './products-workspace.module.css';

export type ProductFilters={q:string;categoryId:string;status:string};
type Props={products:ManagedProduct[];categories:Category[];filters:ProductFilters;busy:boolean;page:number;categoryControl:ReactNode;children:ReactNode;
 request:(path:string,options?:RequestInit)=>Promise<unknown>;onFilter:(values:ProductFilters)=>Promise<boolean>;onRefresh:()=>Promise<void>;onPage:(page:number)=>Promise<void>;onNew:()=>void;onEdit:(product:ManagedProduct)=>void};
function BoxIcon(){return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v9M7.5 5.5l9 5"/></svg>;}
function Thumbnail({source}:{source:string|null}){
 const [failed,setFailed]=useState(false);
 return <span className={styles.thumbnail}>{source&&!failed?<img src={source} alt="" width={52} height={52} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<BoxIcon/>}</span>;
}
const money=new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
export default function ProductsWorkspace({products,categories,filters,busy,page,categoryControl,children,request,onFilter,onRefresh,onPage,onNew,onEdit}:Props){
 const [draft,setDraft]=useState(filters);
 const table=useRef<HTMLDivElement>(null);
 useEffect(()=>{setDraft(filters);table.current?.scrollTo({top:0});},[filters,page]);
 const categoryMap=new Map(categories.map(c=>[c.id,c]));
 const filtered=Boolean(filters.q||filters.categoryId||filters.status!=='all');
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();void onFilter(draft);}
 return <div className={styles.workspace}>
  <div data-panel-reveal="products-workspace-0" className={styles.heading}><div><h2>Productos</h2><p>Organiza tu catálogo, sus precios y especificaciones.</p></div><div className={styles.headingActions}>{categoryControl}<IconButton icon="refresh" label="Actualizar productos" disabled={busy} onClick={()=>void onRefresh()}/><button className={styles.primary} disabled={busy} onClick={onNew}><span aria-hidden="true">＋</span> Nuevo producto</button></div></div>
  <div className={styles.catalog}>
   <form data-panel-reveal="products-workspace-1" className={styles.filters} onSubmit={submit}><fieldset disabled={busy}>
    <label className={styles.search}>Buscar producto<ProductSearch defaultValue={draft.q} onValueChange={q=>setDraft(v=>({...v,q}))} request={request} onSelect={sku=>void onFilter({...draft,q:sku})}/></label>
    <label>Categoría<select value={draft.categoryId} onChange={e=>setDraft(v=>({...v,categoryId:e.target.value}))}><option value="">Todas las categorías</option>{categories.map(c=><option key={c.id} value={c.id}>{c.path}</option>)}</select></label>
    <label>Estado<select value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value}))}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
    <button type="submit" className={styles.apply}>Aplicar</button><button type="button" className={styles.clear} onClick={()=>void onFilter({q:'',categoryId:'',status:'all'})}>Limpiar</button>
   </fieldset></form>
   <div data-panel-reveal="products-workspace-2" className={styles.listHeading}><span>{products.length} {products.length===1?'producto':'productos'} en esta página{filtered?' · Resultados filtrados':''}</span><span>Precios en CLP</span></div>
   <div ref={table} data-panel-reveal="products-workspace-3" className={styles.tableScroll} tabIndex={0} role="region" aria-label="Catálogo de productos" aria-busy={busy}>
    <table className={styles.table}><thead><tr><th scope="col">Producto</th><th scope="col">Categoría</th><th scope="col" className={styles.price}>Precio</th><th scope="col">Estado</th><th scope="col" className={styles.menuCell}><span className={styles.srOnly}>Opciones de producto</span></th></tr></thead><tbody>
     {products.map(product=>{const category=categoryMap.get(product.category_id??''),parent=category?.path.split(' / ').slice(0,-1).join(' / '),href=`/panel/productos/${product.id}?desde=products`;return <tr key={product.id}>
      <td className={styles.identity}><Link href={href} prefetch={false} className={styles.productLink}><Thumbnail key={product.image_url} source={product.image_url}/><span><strong>{product.name}</strong><small>{product.sku}</small></span></Link></td>
      <td className={styles.category}><span>{category?.name??'Sin categoría'}</span>{parent&&<small>{parent}</small>}</td>
      <td className={styles.price}>{money.format(Number(product.price_minor))}</td>
      <td><span className={`${styles.status} ${product.active?styles.active:styles.inactive}`}>{product.active?'Activo':'Inactivo'}</span></td>
      <td className={styles.menuCell}><RowActions name={product.name} disabled={busy} editLabel="Editar producto" detailHref={href} onEdit={()=>onEdit(product)}/></td>
     </tr>;})}
     {!products.length&&<tr><td colSpan={5}><div className={styles.empty}><BoxIcon/><h3>{filtered?'No encontramos productos':'Todavía no hay productos en esta página'}</h3><p>{filtered?'Prueba con otro nombre, categoría o estado.':'Agrega productos para comenzar a organizar tu catálogo.'}</p>{filtered&&<button type="button" disabled={busy} onClick={()=>void onFilter({q:'',categoryId:'',status:'all'})}>Limpiar filtros</button>}</div></td></tr>}
    </tbody></table>
   </div>
   <div data-panel-reveal="products-workspace-4" className={styles.pagination}><span>Hasta 100 productos por página</span><nav aria-label="Páginas de productos"><IconButton icon="previous" label="Productos anteriores" disabled={busy||page===0} onClick={()=>void onPage(page-1)}/><span>Página {page+1}</span><IconButton icon="next" label="Productos siguientes" disabled={busy||products.length<100} onClick={()=>void onPage(page+1)}/></nav></div>
  </div>
  {children}
 </div>;
}
