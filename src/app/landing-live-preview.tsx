"use client";
import {useEffect,useRef,useState} from 'react';
import styles from './landing-live-preview.module.css';
const phases=['Todo conectado','Entra un pedido','Se reserva una unidad','Venta confirmada'];
export default function LandingLivePreview(){
 const root=useRef<HTMLElement>(null);
 const [phase,setPhase]=useState(0),[playing,setPlaying]=useState(false),[visible,setVisible]=useState(false);
 const manual=useRef(false);
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>{if(preference.matches){setPlaying(false);setPhase(3);}else if(!manual.current)setPlaying(true);};
  update();preference.addEventListener('change',update);
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.25});
  if(root.current)observer.observe(root.current);
  return()=>{observer.disconnect();preference.removeEventListener('change',update);};
 },[]);
 useEffect(()=>{
  if(!playing||!visible)return;
  let timer:ReturnType<typeof setInterval>|undefined;
  const schedule=()=>{clearInterval(timer);if(!document.hidden)timer=setInterval(()=>setPhase(value=>(value+1)%4),2200);};
  schedule();document.addEventListener('visibilitychange',schedule);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',schedule);};
 },[playing,visible]);
 const pause=()=>{manual.current=true;setPlaying(false);};
 const reserved=phase===2,sold=phase===3;
 return <figure ref={root} className={styles.stage} data-phase={phase} data-running={playing&&visible} aria-label="Demostración animada: un pedido reserva una unidad de bodega y una venta confirmada la descuenta" onFocusCapture={event=>{if(!(event.target as HTMLElement).closest('[data-play-control]'))pause();}}>
  <div className={styles.atmosphere} aria-hidden="true"><div/><div/></div>
  <div className={styles.orbit} aria-hidden="true"><span/><span/><span/></div>
  <div className={styles.connection} aria-hidden="true"><span/><span/><span/></div>
  <div className={styles.board}>
   <div className={styles.topbar}><strong>nexo<span>.</span></strong><span>Inventario</span><i aria-hidden="true"/></div>
   <div className={styles.boardBody}><div className={styles.title}><div><small>Prismabyte</small><p className={styles.heading}>Tu stock. En tiempo real.</p></div><span className={styles.live}><i/>Conectado</span></div>
    <div className={styles.product}><span className={styles.chip} aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="10" y="14" width="28" height="20" rx="3"/><rect x="16" y="19" width="10" height="10" rx="1"/><path d="M30 20h3m-3 4h3m-3 4h3M14 10v4m7-4v4m7-4v4m7-4v4M14 34v4m7-4v4m7-4v4m7-4v4"/></svg></span><div><small>Kingston</small><strong>NV3 · SSD 1 TB</strong><span>Bodega web</span></div><span className={styles.productTag}>NVMe</span></div>
    <div className={styles.numbers}>
     <div><span>Físico</span><strong><span className={styles.rolling}><span data-shift={sold}><span>24</span><span>23</span></span></span></strong><small>en bodega</small></div>
     <div data-highlight={reserved}><span>Reservado</span><strong><span className={styles.rolling}><span data-shift={reserved}><span>0</span><span>1</span></span></span></strong><small>para pedidos</small></div>
     <div className={styles.available}><span>Disponible</span><strong><span className={styles.rolling}><span data-shift={reserved||sold}><span>24</span><span>23</span></span></span></strong><small>para vender</small></div>
    </div>
    <div className={styles.ledger}><span className={styles.ledgerDot}/><span>{sold?'Salida por venta confirmada':reserved?'Reserva de pedido online':'Inventario sincronizado'}</span><strong>{sold?'−1 unidad':reserved?'1 reservada':'Al día'}</strong></div>
   </div>
  </div>
  <div className={styles.order} aria-hidden="true"><span className={styles.orderIcon}>↗</span><div><small>Tu tienda online</small><strong>Nuevo pedido</strong><span>SSD NV3 · 1 unidad</span></div><b>01</b></div>
  <div className={styles.reservation} aria-hidden="true"><span>↗</span><div><strong>Unidad reservada</strong><small>Disponible: 24 → 23</small></div></div>
  <div className={styles.confirmation} aria-hidden="true"><span className={styles.confirmIcon}>✓</span><div><small>Pago y venta confirmados</small><strong>Todo quedó registrado.</strong><span>Stock físico: 23 · Reservas: 0</span></div><svg viewBox="0 0 40 25" fill="none"><path d="m1 22 8-6 7 3 8-12 6 3 9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
  <figcaption className={styles.caption}><div className={styles.timeline} role="group" aria-label="Secuencia de la demostración">{phases.map((label,index)=><button key={label} title={label} aria-label={label} aria-pressed={phase===index} onClick={()=>{pause();setPhase(index);}}><span/></button>)}</div><span className={styles.phaseLabel}>{phases[phase]}</span><button data-play-control className={styles.play} aria-label={playing?'Pausar animación':'Reproducir animación'} onClick={()=>{manual.current=true;setPlaying(value=>!value);}}>{playing?'Ⅱ':'▷'}</button></figcaption>
  <span className={styles.disclaimer}>Demostración visual · Datos de ejemplo</span>
 </figure>;
}
