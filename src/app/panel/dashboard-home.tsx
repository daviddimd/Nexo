'use client';
import {useEffect,useState} from 'react';
import {IconButton} from '../action-icon';
import styles from './panel.module.css';
type Summary={company:string;date:string;sales_count:number;sales_minor:string;awaiting_delivery:number;awaiting_quotes:number;low_stock_count:number;empty_stock_count:number;alerts:{sku:string;name:string;location:string;available:number}[]};
export default function DashboardHome({name,navigate,request}:{name:string;navigate:(view:'reports'|'orders'|'shipping'|'inventory'|'sales')=>void;request:(path:string)=>Promise<any>}){
  const [data,setData]=useState<Summary|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){setBusy(true);setError('');try{setData(await request('dashboard'));}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{void load();},[]);
  const money=(value:string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
  return <>
    <section className={styles.greeting}><div className={styles.bar}><h1>Hola, {name}.</h1><div className={styles.greetingActions}><button type="button" className={styles.primarySale} onClick={()=>navigate('sales')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nueva venta</button><IconButton icon="refresh" label="Actualizar resumen" disabled={busy} onClick={load}/></div></div>{data&&<p className={styles.greetingDate}>{data.company} · {new Date(`${data.date}T12:00:00Z`).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})}</p>}</section>
    <p role="status" aria-live="polite">{error||(busy?'Actualizando resumen…':'')}</p>
    {data&&<>
      <div className={styles.summaryGrid} aria-label="Resumen de tus ubicaciones autorizadas">
        <button className={styles.summaryCard} onClick={()=>navigate('reports')}><span>Ventas cobradas hoy</span><strong>{money(data.sales_minor)}</strong><small>{data.sales_count} {data.sales_count===1?'venta':'ventas'} · Bruto antes de reembolsos</small></button>
        <button className={styles.summaryCard} onClick={()=>navigate('orders')}><span>Pedidos por entregar</span><strong>{data.awaiting_delivery}</strong><small>Pagados y sin reembolsos aplicados</small></button>
        <button className={styles.summaryCard} onClick={()=>navigate('shipping')}><span>Envíos por cotizar</span><strong>{data.awaiting_quotes}</strong><small>Solicitudes pendientes de revisión</small></button>
        <button className={styles.summaryCard} onClick={()=>navigate('reports')}><span>Alertas de stock</span><strong>{data.low_stock_count}</strong><small>Hasta 5 unidades · {data.empty_stock_count} sin stock</small></button>
      </div>
      <section><div className={styles.bar}><h2>Atención al stock</h2><button onClick={()=>navigate('inventory')}>Ver inventario</button></div>{data.alerts.length?<ul className={styles.alertList}>{data.alerts.map(alert=><li key={`${alert.sku}-${alert.location}`}><div><strong>{alert.name}</strong><small>{alert.sku} · {alert.location}</small></div><span className={alert.available===0?styles.stockEmpty:styles.stockLow}>{alert.available===0?'Agotado':`${alert.available} disponibles`}</span></li>)}</ul>:<p>No hay alertas de stock en tus ubicaciones.</p>}<p className={styles.summaryNote}>Hasta cinco alertas prioritarias. Cada alerta corresponde a un producto en una ubicación.</p></section>
    </>}
  </>;
}
