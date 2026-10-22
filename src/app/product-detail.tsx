import TechnologySignature from './technology-signature';
import Link from 'next/link';
import type {CSSProperties} from 'react';
import type {ProductDetail as Detail} from '../server/product-detail';
import {specificationLabel} from '../catalog/taxonomy';
import ProfileMenu from './profile-menu';
import ProductPurchase from './tienda/product-purchase';
import {storeLogo,storeTheme} from './tienda/store-identity';
import styles from './product-detail.module.css';
export default function ProductDetail({data,user,from='inventory'}:{data:Detail;user?:{name:string;role:string};from?:'inventory'|'products'}){
 const {company,product,fields,availability,categoryPath}=data;
 const publicLogo=storeLogo(company.slug,company.logo_url);
 const back=user?`/panel?seccion=${from}`:`/tienda?empresa=${encodeURIComponent(company.slug)}`;
 const available=availability.filter(l=>l.active).reduce((sum,l)=>sum+l.available,0);
 const populated=fields.filter(field=>product.specifications[field.key]!==undefined);
 const money=new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(product.price_minor));
 return <main className={`${styles.page} ${!user?styles.storeTheme:''}`} style={{...(!user?storeTheme(company.slug,company.primary_color):{}),'--product-color':'var(--nexo-primary)'} as CSSProperties}>
  <header className={styles.header}>{user?<Link className={styles.logo} href="/panel?seccion=home" aria-label="Nexo, inicio">nexo<span>.</span></Link>:<Link className={styles.company} href={back}>{publicLogo?<img src={publicLogo} alt={company.name}/>:company.name}</Link>}{user?<ProfileMenu name={user.name} role={user.role}/>:<span className={styles.headerLabel}>Catálogo de productos</span>}</header>
  <Link className={styles.back} href={back} prefetch={false}>← {user?(from==='products'?'Volver a productos':'Volver al inventario'):'Volver al catálogo'}</Link>
  <div className={styles.hero}>
   <div className={styles.image}>{product.image_url?<img src={product.image_url} alt={product.name}/>:<div className={styles.placeholder}><svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5"/></svg><span>Imagen no disponible</span></div>}</div>
   <div className={styles.overview}>{categoryPath&&<p className={styles.category}>{categoryPath}</p>}<span className={styles.sku}>SKU · {product.sku}</span><h1>{product.name}</h1>
    <div className={styles.badges}>{!product.active&&<span className={styles.inactive}>Producto inactivo</span>}<span className={available>0?styles.inStock:styles.outOfStock}>{available>0?'Stock disponible':'Sin stock disponible'}</span></div>
    <p className={styles.price}>{money}<small>Precio en pesos chilenos</small></p>
    <p className={styles.stockSummary}>{user?'Disponible en tus ubicaciones':'Disponible entre bodega web y sucursales'}: <strong>{available} {available===1?'unidad':'unidades'}</strong></p>
    {!user&&<ProductPurchase slug={company.slug} product={{...product,category_name:categoryPath,availability:availability.filter(l=>l.active)}}/>}
    {user&&<p className={styles.privateNote}>La disponibilidad muestra únicamente las ubicaciones a las que tienes acceso.</p>}
   </div>
  </div>
  <div className={styles.details}>
   <div><section className={styles.card}><h2>Descripción</h2><p className={styles.description}>{product.description||'Este producto aún no tiene una descripción.'}</p></section>
    <section className={styles.card}><h2>Ficha técnica</h2>{populated.length?<dl className={styles.specifications}>{populated.map(field=><div key={field.key}><dt>{field.label}</dt><dd>{specificationLabel(field,product.specifications[field.key])}</dd></div>)}</dl>:<p className={styles.muted}>La ficha técnica aún no está completada.</p>}</section></div>
   <section className={styles.card}><h2>Disponibilidad por ubicación</h2><p className={styles.muted}>Unidades disponibles, descontando las reservas.</p><ul className={styles.locations}>{availability.map(location=><li key={location.locationId}><div><strong>{location.name}</strong><span>{!location.active?'Ubicación inactiva':location.kind==='WEB'?'Envío desde bodega web':location.shippingEnabled?'Retiro o envío desde sucursal':'Solo retiro en sucursal'}</span>{user&&<small>Físico: {location.onHand} · Reservado: {location.reserved}</small>}</div><span className={location.available>0?styles.quantity:styles.zero}>{location.available}</span></li>)}</ul>{!availability.length&&<p className={styles.muted}>{user?'No tienes ubicaciones asignadas para consultar este producto.':'No hay ubicaciones disponibles para este producto.'}</p>}</section>
  </div>
  <footer className={styles.footer}><TechnologySignature/></footer>
 </main>;
}
