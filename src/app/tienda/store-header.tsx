'use client';
import Link from 'next/link';
import {useState,type ReactNode} from 'react';
import type {Category} from '../../catalog/taxonomy';
import StoreSearch from './store-search';
import CategoryMenu from './category-menu';
import {storeLogo} from './store-identity';
import styles from './store-header.module.css';
type Props={slug:string;company:{name:string;logo_url?:string|null};categories:Category[];categoryId:string;query:string;disabled:boolean;busy:boolean;cartCount:number;account:ReactNode;onCart:()=>void;onQuery:(query:string)=>void;onSearch:()=>void;onCategory:(id:string)=>void;contentTarget?:string;accountPage?:boolean};
export default function StoreHeader({slug,company,categories,categoryId,query,disabled,busy,cartCount,account,onCart,onQuery,onSearch,onCategory,contentTarget='catalogo',accountPage=false}:Props){
 const logo=storeLogo(slug,company.logo_url);
 const [searchExpanded,setSearchExpanded]=useState(false);

 return <><a className={styles.skipLink} href={`#${contentTarget}`}>Ir al contenido</a><div className={styles.chrome} data-account-page={accountPage||undefined} data-search-open={searchExpanded}>
  <span className={styles.glassSurface} aria-hidden="true"/>
  <header className={styles.header}>
   <Link className={styles.company} href={`/tienda?empresa=${encodeURIComponent(slug)}`} prefetch={false}>{logo?<img src={logo} alt={company.name}/>:<><span className={styles.companyMark} aria-hidden="true">{company.name.slice(0,1)}</span><span>{company.name}</span></>}</Link>
  <nav className={styles.categories} aria-label="Categorías de productos"><button type="button" disabled={disabled} aria-current={!categoryId?'page':undefined} onClick={()=>onCategory('')}>Catálogo</button>{categories.filter(category=>!category.parent_id).map(category=><CategoryMenu key={category.id} label={category.name==='Accesorios y periféricos'?'Accesorios':category.name} category={category} categories={categories} active={categoryId} disabled={disabled} onChoose={onCategory}/>)}</nav>
   <div className={styles.searchSlot}><StoreSearch onExpandedChange={setSearchExpanded} collapsible className={styles.search} slug={slug} value={query} disabled={disabled} onChange={onQuery} onSearch={onSearch}/></div>
   <div className={styles.account}>{account}<button data-store-cart-trigger aria-haspopup="dialog" aria-controls="store-cart-popover" className={styles.cartButton} aria-label={`Abrir carrito, ${cartCount} ${cartCount===1?'unidad':'unidades'}`} disabled={busy} onClick={onCart}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h2l2.5 12h11l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span>Carrito</span><b>{cartCount}</b></button></div>
  </header>

 </div></>;
}
