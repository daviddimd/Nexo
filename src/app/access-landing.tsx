'use client';
import Link from 'next/link';
import {plans, clp} from './planes/plans-data';
import NexoFooter from './nexo-footer';
import PublicHeader from './public-header';
import LandingStory from './landing-story';
import LandingLivePreview from './landing-live-preview';
import useLandingExperience from './use-landing-experience';
import localFont from 'next/font/local';
import {useEffect,useState} from 'react';
import styles from './access-landing.module.css';
import 'lenis/dist/lenis.css';

const demoHref='/planes?demo=1#pedir-demo';
const startingPrice=Math.min(...plans.map(plan=>plan.price));
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
  <div className={styles.preloader} aria-hidden="true"><strong>nexo<span>.</span></strong><i/></div>
  <PublicHeader panel={panel} demoAction={<Link className={styles.demoCta} href={demoHref}>Pedir demo</Link>}/>
  <div className={styles.wrap}>
   <section className={styles.hero} data-hero aria-labelledby="landing-title">
    <div className={styles.copy}>
     <span data-hero-detail className={styles.eyebrow}>Diseñado para empresas de tecnología</span>
     <h1 id="landing-title"><span className={styles.line}><span data-hero-line>Tus ventas y tu stock,</span></span><span className={styles.line}><span data-hero-line>en el mismo lugar.</span></span></h1>
     <div className={styles.intro}><p data-hero-detail>Administra productos, precios y existencias por sucursal o bodega web.</p>
      <div data-hero-detail className={styles.conversionActions}><ConversionActions/></div>
      {error&&<p className={styles.error} role="alert">{error}</p>}</div>
    </div>
    <div className={styles.showcase} data-hero-art><LandingLivePreview/></div>
   </section>
  </div>
  <div className={styles.wrap}>
  <LandingStory/>
  {setup&&<div className={styles.setup}><a href="/configurar">Configurar mi empresa</a></div>}
  <section className={styles.closing} aria-labelledby="closing-title"><div><h2 id="closing-title">¿Listo para ordenar tu stock?</h2><p>Desde <strong>{clp(startingPrice)} al mes</strong> · IVA incluido</p></div><div className={styles.conversionActions}><ConversionActions/></div></section>
  <NexoFooter className={styles.footer} extra={<div className={styles.footerContact}><Link href="/preguntas#contacto">Contacto</Link><span>© {new Date().getFullYear()} Nexo</span></div>}/>
 </div>
 </main>;
}

function ConversionActions(){
 return <><Link className={`${styles.demoCta} ${styles.mainCta}`} href={demoHref}>Pedir demo</Link><Link className={`${styles.navCta} ${styles.mainCta}`} href="/planes">Ver planes</Link></>;
}
