"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import styles from './landing-story.module.css';
import LandingHeading from './landing-heading';

const demos=[
 {name:'Stock por sucursal',title:'Sabes cuántas unidades hay. Y dónde.',description:'Consulta lo disponible, lo reservado y los movimientos de cada ubicación.',steps:['Llega mercadería a la bodega','Registra una transferencia','Consulta el stock actualizado']},
 {name:'Una venta local',title:'Vendes. El inventario queda al día.',description:'El agente registra la venta y el stock se descuenta de la sucursal que entrega el producto.',steps:['Selecciona el producto','Confirma el pago y la entrega','La venta queda registrada']},
 {name:'Tu tienda online',title:'Tu catálogo también trabaja en la web.',description:'Tus clientes ven los productos y su disponibilidad, y eligen retiro o solicitan una cotización de envío.',steps:['El cliente elige un producto','Selecciona retiro en sucursal','El pedido reserva sus unidades']},
];
const faqs=[
 ['¿Nexo sirve si tengo más de una sucursal?','Sí. Cada ubicación tiene su propio inventario. Puedes separar la bodega web de las tiendas, consultar existencias y registrar transferencias entre ellas.'],
 ['¿Mi equipo puede ver y modificar todo?','El propietario administra la empresa. Los agentes trabajan con los permisos y ubicaciones asignados. Tus clientes utilizan la tienda, sin acceso al panel de gestión.'],
 ['¿Puedo vender en tienda y por internet?','Sí. Las ventas locales y los pedidos online utilizan el inventario de las ubicaciones correspondientes. Los pedidos pueden reservar unidades mientras se completa la compra.'],
 ['¿Qué pasa si el producto solo está en una tienda?','Puedes permitir el retiro en esa sucursal o habilitar envíos desde ella. El envío se cotiza antes del pago, según el flujo de esta versión.'],
 ['¿La web llevará mi marca?','La tienda está pensada para mostrar la identidad, el catálogo y los datos de tu empresa. La tecnología de Nexo se identifica con una firma al pie. La personalización seguirá ampliándose.'],
 ['¿Ya puedo contratar o realizar pagos reales?','Estamos en beta. Puedes explorar el prototipo; los precios, la contratación y la pasarela de pagos real todavía no están habilitados. Las demostraciones utilizan datos de ejemplo.'],
 ['¿Qué diferencia hay entre suscripción e instalación permanente?','La suscripción plantea un servicio periódico. La instalación permanente contempla ejecutar el producto en el servidor acordado con el cliente. Alojamiento, actualizaciones, soporte y condiciones se definirán en cada propuesta.'],
];

function ProductDemo(){
 const root=useRef<HTMLDivElement>(null);
 const [demo,setDemo]=useState(0),[step,setStep]=useState(0),[playing,setPlaying]=useState(false),[visible,setVisible]=useState(false);
 const manual=useRef(false);
 useEffect(()=>{
  const element=root.current;if(!element)return;
  const progress=(event:Event)=>{const frame=(event as CustomEvent<number>).detail;setPlaying(false);setDemo(Math.floor(frame/3));setStep(frame%3);};
  element.addEventListener('nexo-story-progress',progress);
  return()=>element.removeEventListener('nexo-story-progress',progress);
 },[]);
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const change=()=>setPlaying(!preference.matches&&!manual.current);
  change();preference.addEventListener('change',change);
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.25});
  if(root.current)observer.observe(root.current);
  return()=>{observer.disconnect();preference.removeEventListener('change',change);};
 },[]);
 useEffect(()=>{
  if(!playing||!visible||(root.current?.dataset.scrollDriven==='true'&&root.current?.dataset.scrollManual!=='true'))return;
  let timer:ReturnType<typeof setInterval>|undefined;
  const update=()=>{clearInterval(timer);if(!document.hidden)timer=setInterval(()=>setStep(value=>(value+1)%3),2800);};
  update();document.addEventListener('visibilitychange',update);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};
 },[playing,visible,demo]);
 const choose=(value:number)=>{if(root.current)root.current.dataset.scrollManual='true';manual.current=true;setPlaying(false);setDemo(value);setStep(0);};
 const stop=()=>{if(root.current)root.current.dataset.scrollManual='true';manual.current=true;setPlaying(false);};
 return <div ref={root} data-product-demo className={styles.demo} onFocusCapture={event=>{if(!(event.target as HTMLElement).closest('[data-play-control]'))stop();}}>
  <div className={styles.demoTabs} role="group" aria-label="Demostraciones del producto">{demos.map((item,index)=><button key={item.name} aria-pressed={demo===index} onClick={()=>choose(index)}>{item.name}</button>)}</div>
  <div className={styles.demoLayout}>
   <div className={styles.demoCopy}><span className={styles.kicker}>Así se trabaja en Nexo</span><h3>{demos[demo].title}</h3><p>{demos[demo].description}</p><ol className={styles.steps}>{demos[demo].steps.map((label,index)=><li key={label} data-current={step===index}><span aria-hidden="true">{index<step?'✓':`0${index+1}`}</span>{label}</li>)}</ol></div>
   <figure data-demo-screen className={styles.screen} aria-label={`Demostración ilustrativa: ${demos[demo].name}`}>
    <div className={styles.screenHeader}><strong>nexo<span>.</span></strong><span>{demos[demo].name}</span><span className={styles.demoBadge}>Demo</span></div>
    <div className={styles.scene} key={demo}>
     <div className={styles.sceneTitle}><div><small>Prismabyte, empresa de ejemplo</small><h4>{demo===0?'Inventario':demo===1?'Nueva venta':'Pedido online'}</h4></div><span className={styles.status}>{step===2?'Actualizado':'En proceso'}</span></div>
     <div className={styles.product}><span className={styles.productSymbol} aria-hidden="true">▱</span><div><small>Kingston</small><strong>NV3 · SSD NVMe 1 TB</strong><span>SKU KIN-NV3-1000</span></div></div>
     {demo===0?<div className={styles.stockGrid}>{[['Bodega web',step===0?24:20],['Talca',step===0?8:12],['Concepción',6]].map(([label,quantity])=><div key={label}><span>{label}</span><strong>{quantity}</strong><small>disponibles</small></div>)}</div>:<div className={styles.receipt}><div><span>{demo===1?'Sucursal de venta':'Retiro en'}</span><strong>Talca</strong></div><div><span>Unidades</span><strong>1</strong></div><div><span>{demo===1?'Total de ejemplo':'Estado del pedido'}</span><strong>{demo===1?'$64.990':step===2?'Reservado':'Por confirmar'}</strong></div></div>}
     <div key={`${demo}-${step}`} className={styles.result} data-complete={step===2}><span aria-hidden="true">{step===2?'✓':'↗'}</span><div><strong>{demos[demo].steps[step]}</strong><small>{demo===0?(step===0?'24 unidades en bodega web':step===1?'4 unidades de bodega web a Talca':'Bodega web: 20 · Talca: 12'):demo===1?(step===2?'1 unidad descontada en Talca':'Una venta, una ubicación, un registro'):step===2?'1 unidad reservada para este pedido':'Disponibilidad por ubicación'}</small></div></div>
    </div>
    <figcaption><span>Demostración animada · Datos ilustrativos</span><button data-play-control type="button" onClick={()=>{if(root.current)root.current.dataset.scrollManual='true';manual.current=true;setPlaying(value=>!value);}} aria-label={playing?'Pausar demostración':'Reproducir demostración'}>{playing?'Ⅱ Pausar':'▷ Reproducir'}</button></figcaption>
   </figure>
  </div>
  <div className={styles.demoControls} role="group" aria-label="Pasos de la demostración">{[0,1,2].map(index=><button key={index} aria-label={`Mostrar paso ${index+1}`} aria-pressed={step===index} onClick={()=>{stop();setStep(index);}}><span/></button>)}</div>
 </div>;
}

export default function LandingStory({panel}:{panel:string}){
 const root=useRef<HTMLDivElement>(null);
 const [mode,setMode]=useState<'subscription'|'permanent'>('subscription');
 const permanent=mode==='permanent';
 return <div ref={root} className={styles.story}>
  <section id="producto" className={styles.section} aria-labelledby="product-heading">
   <div data-story-reveal className={styles.sectionIntro}><span className={styles.kicker}>Menos saltos entre herramientas</span><LandingHeading id="product-heading" text="De la primera consulta a la última unidad."/><p>Un catálogo, el stock de tus ubicaciones y las ventas de tu equipo. Conectados para el trabajo de cada día.</p></div>
   <div data-story-pin><ProductDemo/></div>
  </section>
  <section className={`${styles.section} ${styles.operation}`} aria-labelledby="operation-heading">
   <div data-story-reveal className={styles.splitIntro}><div><span className={styles.kicker}>Hecho para tu operación</span><LandingHeading id="operation-heading" text="Cada cosa, en su lugar."/></div><p>Tu equipo sabe qué puede hacer. Tus clientes saben qué pueden comprar. Tú puedes seguir lo que pasa.</p></div>
   <div className={styles.features}>
    <article data-feature><span className={styles.featureNumber}>Catálogo</span><h3>Productos que se entienden.</h3><div className={styles.featureBody}><p>Marcas, modelos, categorías y especificaciones. Organiza lo que vendes y facilita la búsqueda en tu tienda.</p><div className={styles.tags}><span>SSD</span><span>1 TB</span><span>NVMe</span></div></div></article>
    <article data-feature><span className={styles.featureNumber}>Inventario</span><h3>Stock con ubicación.</h3><div className={styles.featureBody}><p>Consulta existencias y reservas por sucursal. Registra entradas, ajustes y transferencias con historial.</p><div className={styles.tags}><span>Bodega web</span><span>Sucursales</span></div></div></article>
    <article data-feature><span className={styles.featureNumber}>Equipo</span><h3>El acceso que corresponde.</h3><div className={styles.featureBody}><p>Asigna agentes a sus ubicaciones y administra las cuentas desde un mismo espacio de configuración.</p><div className={styles.tags}><span>Propietario</span><span>Agente</span></div></div></article>
   </div>
  </section>
  <section id="planes" className={`${styles.section} ${styles.plansSection}`} aria-labelledby="plans-heading">
   <div data-story-reveal className={styles.sectionIntro}><span className={styles.kicker}>Dos formas de trabajar con Nexo</span><LandingHeading id="plans-heading" text="Elige cómo hacerlo tuyo."/><p>Un servicio por suscripción o una instalación permanente. El alcance se acuerda según tu empresa.</p></div>
   <div className={styles.planSwitch} role="group" aria-label="Modalidad de Nexo"><button aria-pressed={!permanent} onClick={()=>setMode('subscription')}>Suscripción</button><button aria-pressed={permanent} onClick={()=>setMode('permanent')}>Instalación permanente</button></div>
   <div data-story-reveal className={styles.plan}>
    <div className={styles.planLead}><span className={styles.planBadge}>En preparación</span><h3>{permanent?'Nexo, en tu entorno.':'Tu operación, mes a mes.'}</h3><p>{permanent?'Una instalación del producto en el servidor que acuerdes para tu empresa.':'La modalidad de servicio periódico para gestionar tu negocio con Nexo.'}</p><strong className={styles.price}>Precio por definir</strong><span className={styles.priceNote}>Sin cobros ni contratación durante esta beta.</span><a href={panel} data-magnetic className={styles.primary}>Explorar el prototipo </a></div>
    <div className={styles.planDetails}><h4>Lo que contempla la propuesta</h4><ul>{(permanent?['Instalación del producto para tu empresa','Servidor elegido y acordado con el cliente','Período de actualizaciones definido por contrato','Soporte y mantenimiento con alcance acordado']:['Uso del panel y de la tienda de tu empresa','Inventario para bodega web y sucursales','Gestión de productos, pedidos y agentes','Alojamiento y soporte por definir en la propuesta']).map(item=><li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul><p>Las condiciones finales, los plazos y el alcance del servicio se publicarán antes de habilitar la contratación.</p></div>
   </div>
  </section>
  <section id="preguntas" className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-heading">
   <div data-story-reveal><span className={styles.kicker}>Antes de empezar</span><LandingHeading id="faq-heading" text="Resolvamos las dudas."/><p className={styles.faqIntro}>Lo esencial sobre el producto y esta primera versión.</p></div>
   <div data-story-reveal className={styles.faq}>{faqs.map(([question,answer])=><details key={question} name="nexo-faq"><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div>
  </section>
  <section data-story-reveal className={styles.finalCta} aria-labelledby="start-heading"><span className={styles.kicker}>Un espacio para trabajar mejor</span><LandingHeading id="start-heading" text="Tu próxima venta. Todo lo demás, conectado."/><a href={panel} data-magnetic className={styles.primary}>Entrar a mi empresa </a><p>Nexo está en beta. Seguimos construyendo contigo.</p></section>
  <div className={styles.legalLinks} aria-label="Información de la beta"><span>Información clara, desde el inicio.</span><nav aria-label="Documentos de Nexo"><Link href="/legal/privacidad">Privacidad</Link><Link href="/legal/terminos">Términos y condiciones</Link><Link href="/legal/cookies">Cookies y almacenamiento</Link></nav></div>
 </div>;
}
