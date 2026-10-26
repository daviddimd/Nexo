'use client';
import TechnologySignature from './technology-signature';
import LandingStory from './landing-story';
import LandingLivePreview from './landing-live-preview';
import useLandingExperience from './use-landing-experience';
import localFont from 'next/font/local';
import {useEffect,useState} from 'react';
import styles from './access-landing.module.css';
import 'lenis/dist/lenis.css';

const displayFont=localFont({src:'../../public/fonts/SpaceGroteskVariable.ttf',weight:'300 700',display:'swap',variable:'--nexo-display'});
export default function Home(){
 const experience=useLandingExperience();
 const [setup,setSetup]=useState(false),[store,setStore]=useState<{name:string;slug:string}|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  const load=(url:string)=>fetch(url,{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error();return r.json();});
  Promise.all([load('/api/setup'),load('/api/public/start')]).then(([s,p])=>{setSetup(s.available);setStore(p.store);}).catch(()=>{if(!controller.signal.aborted)setError('No pudimos conectar con la empresa. Intenta de nuevo en unos momentos.');});
  return()=>controller.abort();
 },[]);
 const panel=`/panel${store?`?empresa=${encodeURIComponent(store.slug)}`:''}`;
 return <main id="contenido" ref={experience} className={`${styles.page} ${displayFont.variable}`}>
  <a className={styles.skip} href="#producto">Saltar al contenido del producto</a>
  <div className={styles.progress} data-scroll-progress aria-hidden="true"/>
  <div className={styles.cursor} data-cursor aria-hidden="true"><span/></div>
  <div className={styles.preloader} aria-hidden="true"><strong>nexo<span>.</span></strong><i/></div>
  <div className={styles.wrap}>
   <header className={styles.header}><a className={styles.logo} href="/" aria-label="Nexo, inicio">nexo<span>.</span></a><nav className={styles.landingNav} aria-label="Navegación principal"><a href="#producto">Producto</a><a href="#planes">Planes</a><a href="#preguntas">Preguntas frecuentes</a><a className={styles.navCta} href={panel}>Entrar</a></nav></header>
   <section className={styles.hero} data-hero aria-labelledby="landing-title">
    <div className={styles.copy}>
     <span data-hero-detail className={styles.eyebrow}>Diseñado para empresas que viven la tecnología</span>
     <h1 id="landing-title"><span className={styles.line}><span data-hero-line>Tus ventas y tu stock,</span></span><span className={styles.line}><span data-hero-line>en el mismo lugar.</span></span></h1>
     <div className={styles.intro}><p data-hero-detail>Administra tus productos y precios, registra ventas y consulta cuánto stock queda en cada sucursal o en tu bodega web.</p>
      <div className={styles.actions}><a data-hero-detail data-magnetic className={styles.access} href={panel}>Entrar a mi empresa</a><a data-hero-detail className={styles.discover} href="#producto">Conoce cómo funciona</a></div>
      {error&&<p className={styles.error} role="alert">{error}</p>}</div>
    </div>
    <div className={styles.showcase} data-hero-art><p className={styles.showcaseLabel}>Tu inventario, sucursal por sucursal</p><LandingLivePreview/></div>
   </section>
  </div>
  <div className={styles.wrap}>
  <div className={styles.benefits} aria-label="Lo que puedes hacer con Nexo">
   <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5"/></svg><div><h2>Inventario por sucursal</h2><p>Consulta las unidades disponibles y reservadas.</p></div></div>
   <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7 3h10v18l-2-1-3 1-3-1-2 1V3Z M10 8h4 M10 12h4 M10 16h2"/></svg><div><h2>Registro de ventas</h2><p>Vende desde el panel y descuenta el stock correspondiente.</p></div></div>
   <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3 M16 5a3 3 0 0 1 0 6 M17 15a5 5 0 0 1 4 5"/></svg><div><h2>Accesos para tu equipo</h2><p>Define en qué sucursales puede trabajar cada agente.</p></div></div>
  </div>
  <LandingStory panel={panel}/>
  {setup&&<div className={styles.setup}><span>¿Es tu primera vez en Nexo?</span><a href="/configurar">Configurar mi empresa</a></div>}
  <footer className={styles.footer}><span><TechnologySignature/></span>{store&&<a href={`/tienda?empresa=${encodeURIComponent(store.slug)}`}>Ver catálogo público</a>}</footer>
 </div>
 </main>;
}
