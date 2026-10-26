'use client';
import Link from 'next/link';
import type {ReactNode} from 'react';
import type {Category} from '../../catalog/taxonomy';
import StoreSearch from './store-search';
import CategoryMenu from './category-menu';
import {storeLogo} from './store-identity';
import styles from './storefront.module.css';
type Props={slug:string;company:{name:string;logo_url?:string|null};categories:Category[];categoryId:string;query:string;disabled:boolean;busy:boolean;cartCount:number;account:ReactNode;onCart:()=>void;onQuery:(query:string)=>void;onSearch:()=>void;onCategory:(id:string)=>void;onPurchases?:()=>void;contentTarget?:string};
export default function StoreHeader({slug,company,categories,categoryId,query,disabled,busy,cartCount,account,onCart,onQuery,onSearch,onCategory,onPurchases,contentTarget='catalogo'}:Props){
 const logo=storeLogo(slug,company.logo_url);
 return <><a className={styles.skipLink} href={`#${contentTarget}`}>Ir al contenido</a><div className={styles.chrome}>
  <header className={styles.header}>
   <Link className={styles.company} href={`/tienda?empresa=${encodeURIComponent(slug)}`} prefetch={false}>{logo?<img src={logo} alt={company.name}/>:<><span className={styles.companyMark} aria-hidden="true">{company.name.slice(0,1)}</span><span>{company.name}</span></>}</Link>
   <StoreSearch className={styles.search} slug={slug} value={query} disabled={disabled} onChange={onQuery} onSearch={onSearch}/>
   <div className={styles.account}>{account}<button className={styles.cartButton} aria-label={`Abrir carrito, ${cartCount} ${cartCount===1?'unidad':'unidades'}`} disabled={busy} onClick={onCart}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h2l2.5 12h11l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span>Carrito</span><b>{cartCount}</b></button></div>
  </header>
  <nav className={styles.categories} aria-label="Categorías de productos"><button type="button" disabled={disabled} aria-current={!categoryId?'page':undefined} onClick={()=>onCategory('')}>Todo el catálogo</button>{categories.filter(category=>!category.parent_id).map(category=><CategoryMenu key={category.id} category={category} categories={categories} active={categoryId} disabled={disabled} onChoose={onCategory}/>)}{onPurchases&&<button type="button" onClick={onPurchases}>Mis compras</button>}</nav>
 </div></>;
}
