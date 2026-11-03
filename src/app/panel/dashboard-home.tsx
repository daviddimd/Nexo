'use client';
import AnimatedAmount from '../animated-amount';
import {useEffect,useState} from 'react';
import {IconButton} from '../action-icon';
import styles from './dashboard-home.module.css';

type Summary={company:string;date:string;sales_count:number;sales_minor:string;awaiting_delivery:number;awaiting_quotes:number;low_stock_count:number;empty_stock_count:number;alerts:{sku:string;name:string;location:string;available:number}[]};
type Destination='reports'|'orders'|'shipping'|'inventory'|'sales';
function SummaryIcon({kind}:{kind:'sales'|'orders'|'shipping'|'stock'}){
 const paths={sales:'M7 3h10v18l-3-1-2 1-2-1-3 1V3ZM10 8h4m-4 4h4m-4 4h2',orders:'m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4m-8 4v10M8 5l8 4',shipping:'M3 5h12v12H3V5Zm12 5h4l3 4v3h-7M8 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',stock:'m12 3 10 18H2L12 3Zm0 6v5m0 3h.01'};
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
export default function DashboardHome({name,navigate,request}:{name:string;navigate:(view:Destination)=>void;request:(path:string)=>Promise<any>}){
 const [data,setData]=useState<Summary|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[updatedAt,setUpdatedAt]=useState('');
 async function load(){setBusy(true);setError('');try{setData(await request('dashboard'));setUpdatedAt(new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}).format(new Date()));}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 const date=data?new Date(`${data.date}T12:00:00Z`).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Santiago'}):'';
 return <div className={styles.workspace}>
  <div data-panel-reveal="home-welcome" className={styles.welcome}>
   <div><p className={styles.company}>{data?.company??'Tu espacio de trabajo'}</p><h1>Hola, {name}.</h1>{date&&<p className={styles.date}>{date}</p>}</div>
   <div className={styles.actions}><IconButton icon="refresh" label="Actualizar resumen" disabled={busy} onClick={()=>void load()}/><button type="button" className={styles.newSale} onClick={()=>navigate('sales')}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nueva venta</button></div>
  </div>
  <div className={styles.body} aria-busy={busy}>
   {error&&<div className={styles.error} role="alert"><span>{error}</span><button disabled={busy} onClick={()=>void load()}>Reintentar</button></div>}
   <div data-panel-reveal="home-summary-title" className={styles.sectionHeading}><h2>Resumen de tu operación</h2><span role="status" aria-live="polite">{busy?'Actualizando resumen…':updatedAt?`Actualizado a las ${updatedAt} · Chile`:''}</span></div>
   {data?<>
    <div className={styles.metrics} aria-label="Resumen de tus ubicaciones autorizadas">
     <button data-panel-reveal="home-sales" className={`${styles.metric} ${styles.salesMetric}`} onClick={()=>navigate('reports')}><div className={styles.metricLabel}><span>Ventas cobradas hoy</span><SummaryIcon kind="sales"/></div><strong><AnimatedAmount value={data.sales_minor}/></strong><div className={styles.metricFoot}><small>{data.sales_count.toLocaleString('es-CL')} {data.sales_count===1?'venta':'ventas'} · Bruto antes de reembolsos</small><span aria-hidden="true">↗</span></div></button>
     <button data-panel-reveal="home-orders" className={styles.metric} onClick={()=>navigate('orders')}><div className={styles.metricLabel}><span>Pedidos por entregar</span><SummaryIcon kind="orders"/></div><strong>{data.awaiting_delivery.toLocaleString('es-CL')}</strong><div className={styles.metricFoot}><small>Pagados y sin reembolsos aplicados</small><span aria-hidden="true">↗</span></div></button>
     <button data-panel-reveal="home-shipping" className={styles.metric} onClick={()=>navigate('shipping')}><div className={styles.metricLabel}><span>Envíos por cotizar</span><SummaryIcon kind="shipping"/></div><strong>{data.awaiting_quotes.toLocaleString('es-CL')}</strong><div className={styles.metricFoot}><small>Solicitudes pendientes de revisión</small><span aria-hidden="true">↗</span></div></button>
     <button data-panel-reveal="home-stock" className={styles.metric} onClick={()=>navigate('reports')}><div className={styles.metricLabel}><span>Alertas de stock</span><SummaryIcon kind="stock"/></div><strong>{data.low_stock_count.toLocaleString('es-CL')}</strong><div className={styles.metricFoot}><small>Hasta 5 unidades · {data.empty_stock_count} sin stock</small><span aria-hidden="true">↗</span></div></button>
    </div>
    <div data-panel-reveal="home-stock-list" className={styles.attention}>
     <div className={styles.attentionHeading}><div><h2>Stock a revisar</h2><p>{data.alerts.length?'Productos con menor disponibilidad en tus ubicaciones.':'Disponibilidad en tus ubicaciones autorizadas.'}</p></div><button className={styles.textAction} onClick={()=>navigate('inventory')}>Ver inventario <span aria-hidden="true">→</span></button></div>
     {data.alerts.length?<>
      <div className={styles.listHeading} aria-hidden="true"><span>Producto</span><span>Ubicación</span><span>Disponible</span></div>
      <ul className={styles.alerts}>{data.alerts.map(alert=><li key={`${alert.sku}-${alert.location}`}><div className={styles.product}><span className={`${styles.productIcon} ${alert.available===0?styles.emptyIcon:''}`}><SummaryIcon kind="stock"/></span><div><strong>{alert.name}</strong><small>{alert.sku}</small></div></div><span className={styles.location}>{alert.location}</span><span className={`${styles.stockBadge} ${alert.available===0?styles.emptyStock:styles.lowStock}`}>{alert.available===0?'Sin stock':`${alert.available} ${alert.available===1?'unidad':'unidades'}`}</span></li>)}</ul>
      <div className={styles.attentionFoot}><span>{data.alerts.length} de {data.low_stock_count} alertas · Se muestran las prioritarias.</span><span>Cada alerta corresponde a un producto en una ubicación.</span></div>
     </>:<div className={styles.allClear}><span aria-hidden="true">✓</span><div><h3>Sin alertas de stock</h3><p>No hay productos con 5 unidades o menos en tus ubicaciones.</p></div></div>}
    </div>
   </>:!error?<div className={styles.skeleton} aria-hidden="true">{[0,1,2,3].map(index=><div key={index}><span/><strong/><small/></div>)}</div>:null}
  </div>
 </div>;
}
