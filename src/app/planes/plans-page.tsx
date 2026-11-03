"use client";
import {useState} from 'react';
import Link from 'next/link';
import localFont from 'next/font/local';
import TechnologySignature from '../technology-signature';
import {plans,clp,count,type PlanId} from './plans-data';
import landing from '../access-landing.module.css';
import styles from './plans-page.module.css';
const displayFont=localFont({src:'../../../public/fonts/SpaceGroteskVariable.ttf',weight:'300 700',display:'swap',variable:'--nexo-display'});
const included=['Tienda online y catálogo','Stock disponible y reservado','Ventas locales y pedidos','Transferencias entre ubicaciones','Categorías y especificaciones','Permisos e historial de movimientos'];
const questions=[
 ['¿Los precios son definitivos?','Son una propuesta de lanzamiento en pesos chilenos, con pago mensual y más IVA. Elegir una propuesta aquí no activa una suscripción, no genera cobros y no aplica límites a tu cuenta.'],
 ['¿Qué cuenta como sucursal?','Cada local físico que maneja su propio inventario cuenta como una sucursal. Los tres planes contemplan además una bodega web independiente y una cuenta de propietario. Las cuentas de agente son adicionales a la del propietario.'],
 ['¿Qué costos quedan fuera?','La compra y renovación del dominio, los servicios de terceros y las comisiones de una futura pasarela de pago se pagan por separado. Migraciones de datos y desarrollos especiales se cotizan según su alcance.'],
 ['¿Incluye pagos reales o facturación electrónica?','Todavía no. El registro de pagos no procesa cargos y Nexo no emite documentos tributarios electrónicos del SII. Estas integraciones no están disponibles actualmente.'],
 ['¿Puedo pasar de un plan a otro?','La propuesta contempla cambiar de plan cuando tu empresa necesite más capacidad. El proceso, los plazos y las condiciones se definirán antes de habilitar la contratación.'],
];
function Check(){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>;}
export default function PlansPage(){
 const [mode,setMode]=useState<'subscription'|'permanent'>('subscription');
 const [selected,setSelected]=useState<PlanId>('profesional');
 const current=plans.find(plan=>plan.id===selected)!;
 const permanent=mode==='permanent';
 return <main className={`${landing.page} ${displayFont.variable}`}>
  <div className={landing.wrap}>
   <header className={landing.header}><Link className={landing.logo} href="/" aria-label="Nexo, inicio">nexo<span>.</span></Link><nav className={landing.landingNav} aria-label="Navegación principal"><Link href="/#producto">Producto</Link><Link href="/planes" className={landing.plansLink} aria-current="page">Planes</Link><Link href="/#preguntas">Preguntas frecuentes</Link><Link className={landing.navCta} href="/inicio">Entrar</Link></nav></header>
   <div className={styles.intro}><span className={styles.eyebrow}>Planes Nexo · Para empresas de tecnología</span><h1>Tu empresa crece.<br/><span>Tu sistema también.</span></h1><p>Tres planes para vender, ordenar tu catálogo y mantener conectado el stock de tus sucursales.</p></div>
   <div className={styles.toolbar}><div className={styles.mode} role="group" aria-label="Modalidad de Nexo"><button type="button" aria-pressed={!permanent} onClick={()=>setMode('subscription')}>Suscripción mensual</button><button type="button" aria-pressed={permanent} onClick={()=>setMode('permanent')}>Instalación permanente</button></div><span className={styles.tax}>{permanent?'Implementación según tu empresa':'CLP · Valores netos + IVA'}</span></div>
   {!permanent?<>
    <div className={styles.grid} aria-label="Propuestas de suscripción">
     {plans.map(plan=><article key={plan.id} className={`${styles.card} ${plan.featured?styles.featured:''}`} data-selected={selected===plan.id} aria-labelledby={`plan-${plan.id}`}>
      <div className={styles.cardTop}><h2 id={`plan-${plan.id}`}>{plan.name}</h2>{plan.featured&&<span className={styles.badge}>Recomendado</span>}</div>
      <p className={styles.description}>{plan.description}</p>
      <div className={styles.price}><strong>{clp(plan.price)}</strong><span>/ mes</span></div><p className={styles.priceNote}>+ IVA · Propuesta de lanzamiento</p>
      <ul className={styles.limits}><li><Check/><strong>{plan.branches} {plan.branches===1?'sucursal':'sucursales'}</strong></li><li><Check/><span>{plan.agents} cuentas de agente</span></li><li><Check/><span>Hasta {count(plan.products)} productos</span></li><li><Check/><span>1 bodega web adicional</span></li></ul>
      <p className={styles.fit}>{plan.fit}</p>
      <button className={styles.choose} type="button" aria-pressed={selected===plan.id} onClick={()=>setSelected(plan.id)} aria-label={`Revisar propuesta ${plan.name}`}>{selected===plan.id?'Propuesta seleccionada':`Revisar ${plan.name}`}<span aria-hidden="true">{selected===plan.id?'✓':'↗'}</span></button>
     </article>)}
    </div>
    <aside className={styles.selection} aria-label="Propuesta seleccionada"><div><p role="status" aria-live="polite">Estás revisando <strong>{current.name}</strong> · {clp(current.price)} + IVA / mes</p><span>La selección es orientativa. La contratación aún no está habilitada.</span></div><Link className={styles.primary} href="/inicio">Conocer Nexo <span aria-hidden="true">↗</span></Link></aside>
    <section className={styles.included} aria-labelledby="included-title"><div><span className={styles.eyebrow}>La base es la misma</span><h2 id="included-title">Lo importante,<br/>en los tres.</h2><p>Cambias la capacidad. Conservas las herramientas para trabajar.</p></div><ul>{included.map(item=><li key={item}><Check/>{item}</li>)}</ul></section>
    <section className={styles.comparison} aria-labelledby="compare-title"><div className={styles.sectionHeading}><h2 id="compare-title">Compara sin dar vueltas.</h2><p>Capacidad prevista por empresa.</p></div><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Comparación de planes"><table><thead><tr><th scope="col">Tu operación</th>{plans.map(plan=><th key={plan.id} scope="col" data-selected={selected===plan.id}>{plan.name}</th>)}</tr></thead><tbody>
     <tr><th scope="row">Precio mensual + IVA</th>{plans.map(plan=><td key={plan.id} data-selected={selected===plan.id}>{clp(plan.price)}</td>)}</tr>
     <tr><th scope="row">Sucursales físicas</th>{plans.map(plan=><td key={plan.id}>{plan.branches}</td>)}</tr>
     <tr><th scope="row">Cuentas de agente</th>{plans.map(plan=><td key={plan.id}>{plan.agents}</td>)}</tr>
     <tr><th scope="row">Productos en catálogo</th>{plans.map(plan=><td key={plan.id}>{count(plan.products)}</td>)}</tr>
     <tr><th scope="row">Propietario y bodega web</th>{plans.map(plan=><td key={plan.id}>1 de cada uno</td>)}</tr>
     <tr><th scope="row">Tienda, ventas e inventario</th>{plans.map(plan=><td key={plan.id}>Incluidos</td>)}</tr>
     <tr><th scope="row">Alojamiento y actualizaciones</th>{plans.map(plan=><td key={plan.id}>Previstos al contratar</td>)}</tr>
    </tbody></table></div><p className={styles.footnote}>Estos cupos son una propuesta comercial y todavía no restringen las cuentas. El alojamiento, las actualizaciones y el soporte se definirán en las condiciones finales del servicio.</p></section>
   </>:<section className={styles.permanent} aria-labelledby="permanent-title"><div><span className={styles.eyebrow}>Una modalidad distinta</span><h2 id="permanent-title">Nexo, en tu entorno.</h2><p>Una instalación del producto en el servidor que acuerdes para tu empresa, con una propuesta de implementación propia.</p><strong className={styles.quote}>A cotizar</strong><span className={styles.priceNote}>Según el servidor, las ubicaciones y la puesta en marcha.</span><Link className={styles.primary} href="/inicio">Conocer Nexo <span aria-hidden="true">↗</span></Link></div><div className={styles.permanentDetails}><h3>Una propuesta a tu medida</h3><ul>{['Instalación del producto para tu empresa','Servidor elegido y acordado con el cliente','Período de actualizaciones definido por contrato','Soporte y mantenimiento con alcance acordado'].map(item=><li key={item}><Check/>{item}</li>)}</ul><p>El servidor, el dominio y los servicios de terceros se presupuestan por separado. La modalidad permanente no implica soporte o actualizaciones sin límite de tiempo.</p></div></section>}
   <section className={styles.faq} aria-labelledby="plans-faq"><div><span className={styles.eyebrow}>Antes de elegir</span><h2 id="plans-faq">Las cuentas claras.</h2><p>Lo que incluyen las propuestas y lo que todavía estamos preparando.</p></div><div>{questions.map(([question,answer])=><details key={question} name="plans-faq"><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div></section>
   <nav className={styles.links} aria-label="Información adicional"><Link href="/">Volver al inicio</Link><Link href="/#preguntas">Sobre Nexo</Link><Link href="/legal/terminos">Términos y condiciones</Link><Link href="/legal/privacidad">Privacidad</Link></nav>
   <footer className={landing.footer}><TechnologySignature/></footer>
  </div>
 </main>;
}
