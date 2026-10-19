'use client';
import TechnologySignature from './technology-signature';
import {useEffect,useState} from 'react';
import styles from './access-landing.module.css';

function WorkspacePreview(){
 const rows=[['Kingston NV3 · SSD 1 TB','Almacenamiento',24,12,8],['Logitech MX Master 3S','Periféricos',18,6,4],['Samsung S31C · Monitor 24″','Monitores',12,3,0]] as const;
 return <figure className={styles.preview} aria-label="Vista ilustrativa del inventario de Nexo, con datos de ejemplo">
  <div className={styles.previewTop}><span className={styles.previewLogo}>nexo<span>.</span></span><span className={styles.previewTab}>Inventario</span><span className={styles.previewCompany}>Tu empresa</span></div>
  <div className={styles.previewBody}>
   <div className={styles.previewTitle}><h2 className={styles.inventoryHeading}>Stock por ubicación</h2><span>Stock disponible</span></div>
   <div className={styles.previewTable}><table><thead><tr><th>Producto</th><th>Web</th><th>Centro</th><th>Norte</th></tr></thead><tbody>{rows.map(([name,category,...stock])=><tr key={name}><td>{name}<small>{category}</small></td>{stock.map((quantity,index)=><td key={index}><span className={quantity===0?styles.emptyStock:quantity<=4?styles.lowStock:undefined}>{quantity}</span></td>)}</tr>)}</tbody></table></div>
  </div>
  <div className={styles.saleFlow}><span className={styles.check} aria-hidden="true">✓</span><div><strong>Cada venta descuenta el stock de su ubicación.</strong><span>Registra la venta <b aria-hidden="true">→</b> Consulta el stock actualizado</span></div></div>
  <figcaption>Vista ilustrativa · Datos de ejemplo</figcaption>
 </figure>;
}
export default function Home(){
 const [setup,setSetup]=useState(false),[store,setStore]=useState<{name:string;slug:string}|null>(null),[error,setError]=useState('');
 useEffect(()=>{Promise.all([fetch('/api/setup').then(r=>{if(!r.ok)throw new Error();return r.json();}),fetch('/api/public/start').then(r=>{if(!r.ok)throw new Error();return r.json();})]).then(([s,p])=>{setSetup(s.available);setStore(p.store);}).catch(()=>setError('No pudimos conectar con la empresa. Intenta de nuevo en unos momentos.'));},[]);
 const panel=`/panel${store?`?empresa=${encodeURIComponent(store.slug)}`:''}`;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.logo} href="/" aria-label="Nexo, inicio">nexo<span>.</span></a><span className={styles.headerTag}>Gestión de ventas e inventario.</span></header>
  <div className={styles.hero}>
   <div className={styles.intro}><span className={styles.eyebrow}>DISEÑADO PARA EMPRESAS QUE VIVEN LA TECNOLOGÍA</span><h1>Tus ventas y tu stock,<br/><span>en el mismo lugar.</span></h1><p>Administra tus productos y precios, registra ventas y consulta cuánto stock queda en cada sucursal o en tu bodega web.</p><a className={styles.access} href={panel}>Entrar a mi empresa <span aria-hidden="true">→</span></a>{error&&<p className={styles.error} role="alert">{error}</p>}</div>
   <div className={styles.showcase}><div className={styles.showcaseLabel}><span/> TU INVENTARIO, SUCURSAL POR SUCURSAL</div><WorkspacePreview/></div>
  </div>
  <div className={styles.benefits} aria-label="Lo que puedes hacer con Nexo">
   <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5"/></svg><div><h2>Inventario por sucursal</h2><p>Consulta las unidades disponibles y reservadas.</p></div></div>
   <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7 3h10v18l-2-1-3 1-3-1-2 1V3Z M10 8h4 M10 12h4 M10 16h2"/></svg><div><h2>Registro de ventas</h2><p>Vende desde el panel y descuenta el stock correspondiente.</p></div></div>
   <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3 M16 5a3 3 0 0 1 0 6 M17 15a5 5 0 0 1 4 5"/></svg><div><h2>Accesos para tu equipo</h2><p>Define en qué sucursales puede trabajar cada agente.</p></div></div>
  </div>
  {setup&&<div className={styles.setup}><span>¿Es tu primera vez en Nexo?</span><a href="/configurar">Configurar mi empresa →</a></div>}
  <footer className={styles.footer}><span><TechnologySignature/></span>{store&&<a href={`/tienda?empresa=${encodeURIComponent(store.slug)}`}>Ver catálogo público →</a>}</footer>
 </main>;
}
