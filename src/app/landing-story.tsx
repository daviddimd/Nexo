"use client";
import {useEffect,useRef,useState} from 'react';
import {PlaybackIcon, SsdIcon} from './landing-demo-icons';
import styles from './landing-story.module.css';
import LandingHeading from './landing-heading';

const demos=[
 {name:'Stock por sucursal',title:'Sabes cuántas unidades hay. Y dónde.',description:'Consulta lo disponible, lo reservado y los movimientos de cada ubicación.',steps:['Llega mercadería a la bodega','Registra una transferencia','Consulta el stock actualizado']},
 {name:'Una venta local',title:'Vendes. El inventario queda al día.',description:'Tu equipo registra la venta y el stock se descuenta de la sucursal que entrega el producto.',steps:['Selecciona el producto','Confirma el pago y la entrega','La venta queda registrada']},
 {name:'Tu tienda online',title:'Tu catálogo también trabaja en la web.',description:'Tus clientes ven los productos y su disponibilidad, y eligen retiro o calculan el envío según su comuna.',steps:['El cliente elige un producto','Selecciona retiro en sucursal','El pedido reserva sus unidades']},
];
function ProductDemo(){
 const root=useRef<HTMLDivElement>(null);
 const [demo,setDemo]=useState(0),[step,setStep]=useState(0),[playing,setPlaying]=useState(false),[visible,setVisible]=useState(false);
 const manual=useRef(false);
 const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const change=()=>setPlaying(!preference.matches&&!manual.current);
  change();preference.addEventListener('change',change);
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.25});
  if(root.current)observer.observe(root.current);
  return()=>{observer.disconnect();preference.removeEventListener('change',change);};
 },[]);
 useEffect(()=>{
  if(!playing||!visible||hovered||focused)return;
  let timer:ReturnType<typeof setInterval>|undefined;
  const update=()=>{clearInterval(timer);if(!document.hidden)timer=setInterval(()=>setStep(value=>(value+1)%3),2800);};
  update();document.addEventListener('visibilitychange',update);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};
 },[playing,visible,demo,hovered,focused]);
 const choose=(value:number)=>{manual.current=true;setPlaying(false);setDemo(value);setStep(0);};
 const stop=()=>{manual.current=true;setPlaying(false);};
 return <div ref={root} className={styles.demo} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}>
  <div className={styles.demoTabs} role="tablist" aria-label="Funciones del producto">{demos.map((item,index)=><button key={item.name} role="tab" id={`product-tab-${index}`} aria-controls={`product-panel-${index}`} aria-selected={demo===index} tabIndex={demo===index?0:-1} onClick={()=>choose(index)} onKeyDown={event=>{const next=event.key==='ArrowRight'?(index+1)%demos.length:event.key==='ArrowLeft'?(index+demos.length-1)%demos.length:event.key==='Home'?0:event.key==='End'?demos.length-1:null;if(next===null)return;event.preventDefault();choose(next);document.getElementById(`product-tab-${next}`)?.focus();}}>{item.name}</button>)}</div>
  {demos.map((item,index)=><div key={item.name} role="tabpanel" id={`product-panel-${index}`} aria-labelledby={`product-tab-${index}`} hidden={demo!==index} tabIndex={0}>{demo===index&&<>
  <div className={styles.demoLayout}>
   <div className={styles.demoCopy}><h3>{demos[demo].title}</h3><p>{demos[demo].description}</p><ol className={styles.steps}>{demos[demo].steps.map((label,index)=><li key={label} data-current={step===index}><span aria-hidden="true">{index<step?'✓':`0${index+1}`}</span>{label}</li>)}</ol></div>
   <figure data-demo-screen className={styles.screen} aria-label={`Flujo de trabajo: ${demos[demo].name}`}>
    <div className={styles.screenHeader}><strong>nexo<span>.</span></strong><span>{demos[demo].name}</span></div>
    <div className={styles.scene} key={demo}>
     <div className={styles.sceneTitle}><div><small>PrismaByte Tecnología</small><h4>{demo===0?'Inventario':demo===1?'Nueva venta':'Pedido online'}</h4></div><span className={styles.status}>{step===2?'Actualizado':demo===0?(step===1?'Transferencia en proceso':'Recepción registrada'):'En proceso'}</span></div>
     <div className={styles.product}><span className={styles.productSymbol} aria-hidden="true"><SsdIcon/></span><div><small>Kingston</small><strong>NV3 · SSD NVMe 1 TB</strong><span>SKU KIN-NV3-1000</span></div></div>
     {demo===0?<div className={styles.stockGrid}>{[['Bodega web',step<2?24:20],['Talca',step<2?8:12],['Concepción',6]].map(([label,quantity])=><div key={label}><span>{label}</span><strong>{quantity}</strong><small>disponibles</small></div>)}</div>:<div className={styles.receipt}><div><span>{demo===1?'Sucursal de venta':'Retiro en'}</span><strong>Talca</strong></div><div><span>Unidades</span><strong>1</strong></div><div><span>{demo===1?'Total':'Estado del pedido'}</span><strong>{demo===1?'$64.990':step===2?'Reservado':'Por confirmar'}</strong></div></div>}
     <div key={`${demo}-${step}`} className={styles.result} data-complete={step===2}><span aria-hidden="true">{step===2?'✓':'↗'}</span><div><strong>{demos[demo].steps[step]}</strong><small>{demo===0?(step===0?'24 unidades en bodega web':step===1?'4 unidades de bodega web a Talca':'Bodega web: 20 · Talca: 12'):demo===1?(step===2?'1 unidad descontada en Talca':'Una venta, una ubicación, un registro'):step===2?'1 unidad reservada para este pedido':'Disponibilidad por ubicación'}</small></div></div>
    </div>
    <figcaption><button data-play-control type="button" onClick={()=>{manual.current=true;setPlaying(value=>!value);}} aria-label="Pausar reproducción automática" aria-pressed={!playing}><PlaybackIcon playing={playing}/><span>{playing?'Pausar':'Reproducir'}</span></button></figcaption>
   </figure>
  </div>
  <div className={styles.demoControls} role="group" aria-label="Pasos del proceso">{[0,1,2].map(index=><button key={index} aria-label={`Mostrar paso ${index+1}`} aria-pressed={step===index} onClick={()=>{stop();setStep(index);}}><span/></button>)}</div>
  </>}</div>)}
 </div>;
}

export default function LandingStory(){
 return <div className={styles.story}>
  <section id="producto" tabIndex={-1} className={styles.section} aria-labelledby="product-heading">
   <div data-story-reveal className={styles.sectionIntro}><LandingHeading id="product-heading" text="De la primera consulta a la última unidad."/></div>
   <ProductDemo/>
  </section>
  <section id="operacion" tabIndex={-1} className={`${styles.section} ${styles.operation}`} aria-labelledby="operation-heading">
   <div data-story-reveal className={styles.splitIntro}><div><LandingHeading id="operation-heading" text="Cada cosa, en su lugar."/></div></div>
   <div className={styles.features}>
    <article data-feature><span className={styles.featureNumber}>Catálogo</span><h3>Productos que se entienden.</h3><div className={styles.featureBody}><p>Marcas, modelos, categorías y especificaciones. Organiza lo que vendes y facilita la búsqueda en tu tienda.</p><div className={styles.tags}><span>SSD</span><span>1 TB</span><span>NVMe</span></div></div></article>
    <article data-feature><span className={styles.featureNumber}>Inventario</span><h3>Stock con ubicación.</h3><div className={styles.featureBody}><p>Consulta existencias y reservas por sucursal. Registra entradas, ajustes y transferencias con historial.</p><div className={styles.tags}><span>Bodega web</span><span>Sucursales</span></div></div></article>
    <article data-feature><span className={styles.featureNumber}>Equipo</span><h3>El acceso que corresponde.</h3><div className={styles.featureBody}><p>Configura los accesos del equipo por ubicación y administra las cuentas desde un mismo espacio de configuración.</p><div className={styles.tags}><span>Propietario</span><span>Acceso de equipo</span></div></div></article>
   </div>
  </section>
 </div>;
}
