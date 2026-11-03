'use client';
import AnimatedAmount from '../animated-amount';
import CapturesManager from './captures-manager';
import {IconButton} from '../action-icon';
import {useEffect,useState,type FormEvent} from 'react';
import styles from './management-workspace.module.css';
type Report={period:{from:string;to:string;threshold:number};sales:{id:string;name:string;orders:number;gross:string;refunds:string}[];lowStock:{id:string;sku:string;name:string;location:string;available:number}[];moreLowStock:boolean};
const money=(value:string|bigint)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
const dateLabel=(value:string)=>value.split('-').reverse().join('/');
export default function ReportsManager({role,busy,setBusy,request}:{role:string;busy:boolean;setBusy:(value:boolean)=>void;request:(path:string,options?:RequestInit)=>Promise<any>}){
 const today=new Date().toISOString().slice(0,10),month=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
 const [data,setData]=useState<Report|null>(null),[notice,setNotice]=useState(''),[tab,setTab]=useState<'summary'|'payments'>('summary');
 const [draft,setDraft]=useState({from:month,to:today,threshold:'5'});
 async function load(from:string,to:string,threshold:string){setBusy(true);setNotice('');try{setData(await request(`reports?${new URLSearchParams({from,to,threshold})}`));}catch(error){setData(null);setNotice((error as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load(month,today,'5');},[]);
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();void load(draft.from,draft.to,draft.threshold);}
 const totals=data?.sales.reduce((sum,row)=>({orders:sum.orders+Number(row.orders),gross:sum.gross+BigInt(row.gross),refunds:sum.refunds+BigInt(row.refunds)}),{orders:0,gross:0n,refunds:0n});
 const ranked=data?[...data.sales].sort((a,b)=>BigInt(a.gross)===BigInt(b.gross)?a.name.localeCompare(b.name):BigInt(a.gross)>BigInt(b.gross)?-1:1):[];
 const maximum=ranked.reduce((max,row)=>BigInt(row.gross)>max?BigInt(row.gross):max,0n);
 const activeLocations=ranked.filter(row=>Number(row.orders)>0).length;
 return <div className={styles.workspace}>
  <div data-panel-reveal="reports-manager-0" className={styles.heading}><div><h2>Reportes</h2><p>Revisa las ventas por ubicación y las alertas de stock.</p></div>{tab==='summary'&&<div className={styles.headingActions}><IconButton icon="refresh" label="Actualizar reporte" disabled={busy} onClick={()=>void load(data?.period.from??draft.from,data?.period.to??draft.to,String(data?.period.threshold??draft.threshold))}/></div>}</div>
  {role==='OWNER'&&<nav data-panel-reveal="reports-manager-1" className={styles.tabs} aria-label="Secciones de reportes"><button disabled={busy} aria-pressed={tab==='summary'} onClick={()=>setTab('summary')}>Resumen comercial</button><button disabled={busy} aria-pressed={tab==='payments'} onClick={()=>setTab('payments')}>Registros de pago</button></nav>}
  {tab==='summary'?<>
   <form data-panel-reveal="reports-manager-2" className={styles.filterForm} onSubmit={submit}><fieldset disabled={busy}><label>Desde<input name="from" type="date" value={draft.from} onChange={e=>setDraft(v=>({...v,from:e.target.value}))} required/></label><label>Hasta<input name="to" type="date" min={draft.from} value={draft.to} onChange={e=>setDraft(v=>({...v,to:e.target.value}))} required/></label><label>Alertar con stock hasta<input name="threshold" type="number" min={0} max={1000000} step={1} value={draft.threshold} onChange={e=>setDraft(v=>({...v,threshold:e.target.value}))} required/></label><button className={styles.primary}>Consultar</button></fieldset></form>
   {notice&&<p className={styles.notice} role="status">{notice}</p>}
   <div className={styles.reportBody} aria-busy={busy}>
    {data&&totals?<>
     <p className={styles.period}>{dateLabel(data.period.from)} — {dateLabel(data.period.to)} · Hora de Chile · Ubicaciones autorizadas</p>
     <div data-panel-reveal="reports-manager-3" className={styles.summary}><div><span>Ventas cobradas</span><strong>{totals.orders.toLocaleString('es-CL')}</strong><small>Según fecha de pago</small></div><div><span>Venta bruta</span><strong><AnimatedAmount value={totals.gross}/></strong><small>Total cobrado en el período</small></div><div><span>Reembolsos</span><strong><AnimatedAmount value={totals.refunds}/></strong><small>Según fecha de devolución</small></div><div><span>Neto del período</span><strong><AnimatedAmount value={totals.gross-totals.refunds}/></strong><small>Bruto menos reembolsos</small></div></div>
     <p className={styles.note}>El neto puede ser negativo y no representa utilidad. Los reembolsos se incluyen según la fecha de devolución del dinero.</p>
     <div data-panel-reveal="reports-distribution" className={styles.reportCard}>
      <div className={styles.panelHeading}><div><h3>Distribución de ventas</h3><p>Venta bruta por ubicación · {dateLabel(data.period.from)} al {dateLabel(data.period.to)}</p></div></div>
      <div className={styles.distribution}>
       <ol className={styles.barList} aria-label="Comparación de venta bruta por ubicación">
        {ranked.map(row=><li key={row.id}><div className={styles.barCaption}><span>{row.name}</span><strong>{money(row.gross)}</strong></div><div className={styles.barTrack} aria-hidden="true"><span style={{transform:`scaleX(${maximum>0n?Number(BigInt(row.gross)*10000n/maximum)/10000:0})`}}/></div><small>{Number(row.orders).toLocaleString('es-CL')} ventas · {totals.gross>0n?`${Number(BigInt(row.gross)*1000n/totals.gross)/10}% del bruto`:'Sin ventas cobradas'}</small></li>)}
        {!ranked.length&&<li>No hay ubicaciones autorizadas.</li>}
       </ol>
       <dl className={styles.reportInsights}><div><dt>Ticket promedio</dt><dd>{totals.orders?<AnimatedAmount value={totals.gross/BigInt(totals.orders)}/>: '—'}</dd><small>Venta bruta ÷ ventas cobradas · CLP redondeado hacia abajo</small></div><div><dt>Ubicaciones con ventas</dt><dd>{activeLocations} <span>de {ranked.length}</span></dd><small>Dentro de tus ubicaciones autorizadas</small></div><div><dt>Mayor venta bruta</dt><dd className={styles.insightLocation}>{maximum>0n?ranked[0]?.name:'Sin actividad'}</dd><small>{maximum>0n?money(maximum):'No hay ventas en el período'}</small></div></dl>
      </div>
     </div>
     <div data-panel-reveal="reports-manager-4" className={styles.reportCard}><div className={styles.panelHeading}><div><h3>Ventas por ubicación</h3><p>Importes en pesos chilenos.</p></div></div><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Reporte de ventas por ubicación"><table className={styles.table}><thead><tr><th scope="col">Ubicación</th><th scope="col" className={styles.amount}>Ventas</th><th scope="col" className={styles.amount}>Bruto</th><th scope="col" className={styles.amount}>Reembolsos</th><th scope="col" className={styles.amount}>Neto</th></tr></thead><tbody>{data.sales.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td className={styles.amount}>{row.orders}</td><td className={styles.amount}>{money(row.gross)}</td><td className={styles.amount}>{money(row.refunds)}</td><td className={styles.amount}>{money(BigInt(row.gross)-BigInt(row.refunds))}</td></tr>)}{!data.sales.length&&<tr><td colSpan={5}><div className={styles.empty}>Sin ubicaciones para este reporte.</div></td></tr>}</tbody></table></div></div>
     <div data-panel-reveal="reports-manager-5" className={styles.reportCard}><div className={styles.panelHeading}><div><h3>Stock bajo actual</h3><p>Disponible menor o igual a {data.period.threshold} unidades.</p></div><span>{data.lowStock.length}{data.moreLowStock?'+':''} alertas</span></div><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Alertas de stock"><table className={styles.table}><thead><tr><th scope="col">Producto</th><th scope="col">Ubicación</th><th scope="col" className={styles.amount}>Disponible</th></tr></thead><tbody>{data.lowStock.map(row=><tr key={`${row.id}-${row.location}`}><td><strong>{row.name}</strong><small>{row.sku}</small></td><td>{row.location}</td><td className={styles.amount}><span className={`${styles.badge} ${Number(row.available)===0?styles.negative:styles.warning}`}>{row.available}</span></td></tr>)}{!data.lowStock.length&&<tr><td colSpan={3}><div className={styles.empty}>No hay alertas con el umbral seleccionado.</div></td></tr>}</tbody></table></div>{data.moreLowStock&&<p className={styles.reportNote}>Se muestran las primeras 100 alertas. Consulta el inventario para revisar el resto.</p>}</div>
    </>:<div className={styles.empty}><h3>{busy?'Cargando reporte…':'No hay un reporte disponible'}</h3><p>Selecciona un período y pulsa Consultar.</p></div>}
   </div>
  </>:role==='OWNER'&&<CapturesManager busy={busy} setBusy={setBusy} request={request}/>}
 </div>;
}
