"use client";
import {useEffect, useRef, useState} from 'react';
import PublicHeader from '../public-header';
import NexoFooter from '../nexo-footer';
import LandingLivePreview from '../landing-live-preview';
import {plans, clp, count, type PlanId} from './plans-data';
import landing from '../access-landing.module.css';
import styles from './plans-page.module.css';

import DemoRequestForm, {type Interest} from '../demo-request-form';
const questions = [
 ['¿Cómo se muestran los precios?', 'Los precios se muestran en pesos chilenos por mes, con IVA incluido.'],
 ['¿Qué cuenta como sucursal?', 'Cada local físico con inventario propio cuenta como una sucursal. La bodega web es independiente y no ocupa un cupo.'],
 ['¿Qué es un acceso de equipo?', 'Es el acceso de una persona del equipo, con permisos y ubicaciones asignados. Cada plan incluye además una cuenta de propietario.'],
 ['¿Qué costos quedan fuera?', 'El dominio, los servicios de terceros y las comisiones de una futura pasarela se pagan por separado. Migraciones y desarrollos especiales se cotizan según su alcance.'],
 ['¿Puedo pasar de un plan a otro?', 'Está previsto que puedas cambiar de plan a medida que crezca tu empresa. Las condiciones se definirán al habilitar la contratación.'],
];

export default function PlansPage({initialDemoOpen}: {initialDemoOpen:boolean}){
 const [selected,setSelected]=useState<PlanId>('profesional');
 const [interest,setInterest]=useState<Interest>('profesional');
 const [demoOpen,setDemoOpen]=useState(initialDemoOpen);
 const demoForm=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(demoOpen)demoForm.current?.focus({preventScroll:true});
 },[demoOpen]);

 const current=plans.find(plan=>plan.id===selected)!;

 function selectPlan(plan: PlanId) {
  setSelected(plan);
  setInterest(plan);
 }

 return <main className={landing.page}>
  <PublicHeader panel="/inicio" current="planes"/>
  <div className={`${landing.wrap} ${landing.routeContent}`}>
   <div className={styles.intro}>
    <h1>Planes para empresas de tecnología</h1>
   </div>
   <div className={styles.grid} role="radiogroup" aria-label="Elige un plan">
     {plans.map(plan=><article key={plan.id} className={styles.card} data-featured={plan.featured} data-selected={selected===plan.id}>
      <div className={styles.cardTop}><h2 id={`plan-${plan.id}`}>{plan.name}</h2>{plan.featured&&<span className={styles.badge}>Recomendado</span>}</div>
      <p className={styles.description}>{plan.description}</p>
      <div className={styles.price}><strong>{clp(plan.price)}</strong><span>/ mes · IVA incluido</span></div>
      <ul className={styles.limits}>
       <li><a href="#cuenta-como-sucursal" onClick={()=>{const detail=document.querySelector<HTMLDetailsElement>('#cuenta-como-sucursal');if(detail)detail.open=true;}}>{plan.branches} {plan.branches===1?'sucursal física':'sucursales físicas'}</a></li>
       <li>{plan.agents} accesos de equipo</li>
       <li>Hasta {count(plan.products)} productos</li>
      </ul>
      <input className={styles.planRadio} type="radio" name="selected-plan" checked={selected===plan.id} aria-labelledby={`plan-${plan.id}`} onChange={()=>selectPlan(plan.id)}/>
     </article>)}
    </div>
    <div className={styles.selection}>
     <p role="status">Plan seleccionado <strong>{current.name}</strong> · {clp(current.price)} al mes · IVA incluido</p>
     <button type="button" className={styles.primary} aria-controls="pedir-demo" aria-expanded={demoOpen} onClick={()=>{setInterest(selected);setDemoOpen(!demoOpen);}}>Pedir demo</button>
    </div>
   <div id="pedir-demo" ref={demoForm} data-open={demoOpen} inert={!demoOpen} tabIndex={-1} className={styles.demoDisclosure}>
    <div className={styles.demoDisclosureBody}>
     <div className={styles.contact}>
    <div><h2>¿Hablamos?</h2><p>Te contactaremos por correo para coordinar la demo.</p></div>
    <DemoRequestForm interest={interest} onInterestChange={setInterest}/>
   </div>
    </div>
   </div>
    <div className={styles.comparison}>
     <h2>Compara los planes</h2>
     <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Comparación de planes">
      <table><thead><tr><th scope="col">Capacidad</th>{plans.map(plan=><th key={plan.id} scope="col" data-featured={plan.featured}>{plan.name}</th>)}</tr></thead>
       <tbody>{([
        ['Precio mensual (IVA incluido)',(plan: typeof plans[number])=>clp(plan.price)],
        ['Sucursales físicas',(plan: typeof plans[number])=>plan.branches],
        ['Accesos de equipo',(plan: typeof plans[number])=>plan.agents],
        ['Productos en catálogo',(plan: typeof plans[number])=>count(plan.products)],
       ] as const).map(([label,value])=><tr key={label}><th scope="row">{label}</th>{plans.map(plan=><td key={plan.id} data-featured={plan.featured}>{value(plan)}</td>)}</tr>)}</tbody>
      </table>
     </div>
     <p className={styles.footnote}>El alojamiento, las actualizaciones y el soporte se definen en las condiciones comerciales.</p>
     <p><button type="button" className={styles.quoteLink} onClick={()=>{setInterest('a-medida');setDemoOpen(true);demoForm.current?.scrollIntoView({block:'start'});}}>¿Necesitas más? Cotiza a medida</button></p>
    </div>

   <div className={styles.included}>
    <div><h2>Un catálogo pensado para tecnología</h2><p>Organiza marcas, modelos y especificaciones como capacidad o resolución. Consulta stock disponible y reservado por ubicación, registra transferencias y gestiona ventas, devoluciones y pedidos.</p><p>Cada plan incluye tienda online, una bodega web y una cuenta de propietario.</p></div>
    <div className={styles.mockup} inert aria-hidden="true"><LandingLivePreview decorative/></div>
   </div>
   <div className={styles.faq}>
    <div><h2>Preguntas sobre los planes</h2><a href="/preguntas#contratar">Contratación y preguntas sobre Nexo</a></div>
    <div>{questions.map(([question,answer],index)=><details key={question} id={index===1?'cuenta-como-sucursal':undefined} name="planes-faq" open={index===0 || undefined}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div>
   </div>
   <NexoFooter className={`${landing.footer} ${styles.plansFooter}`}/>
  </div>
 </main>;
}
