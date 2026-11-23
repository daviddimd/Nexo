'use client';
import Link from 'next/link';
import AnimatedAmount from '../animated-amount';
import {useEffect,useState} from 'react';
import {IconButton} from '../action-icon';
import styles from './dashboard-home.module.css';

type AlertFilter='all'|'empty'|'low';
type QuickMovement='RECEIPT'|'TRANSFER'|'ADJUSTMENT';
type Summary={company:string;date:string;sales_count:number;sales_minor:string;awaiting_pickup:number;yesterday_sales_minor:string;filtered_count:number;inactive_stock_count:number;alert_locations:{id:string;name:string}[];awaiting_quotes:number;awaiting_shipments:number;low_stock_count:number;empty_stock_count:number;alerts:{product_id:string;location_id:string;sku:string;name:string;location:string;available:number;minimum_stock:number;physical:number;reserved:number}[]};
type Destination='reports'|'orders'|'shipping'|'inventory'|'sales';
function SummaryIcon({kind}:{kind:'sales'|'orders'|'shipping'|'stock'}){
 const paths={sales:'M7 3h10v18l-3-1-2 1-2-1-3 1V3ZM10 8h4m-4 4h4m-4 4h2',orders:'m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4m-8 4v10M8 5l8 4',shipping:'M3 5h12v12H3V5Zm12 5h4l3 4v3h-7M8 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',stock:'m12 3 10 18H2L12 3Zm0 6v5m0 3h.01'};
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
export default function DashboardHome({name,navigate,request,onMovement}:{onMovement:(kind:QuickMovement)=>void;name:string;navigate:(view:Destination)=>void;request:(path:string)=>Promise<any>}){
 const [data,setData]=useState<Summary|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[updatedAt,setUpdatedAt]=useState('');
 const [status, setStatus] = useState<AlertFilter>('all');
 const [locationId, setLocationId] = useState('');
 const [offset, setOffset] = useState(0);
 async function load(filter = status, location = locationId, nextOffset = offset) {
  setBusy(true);
  setError('');
  try {
   const query = new URLSearchParams({status: filter, locationId: location, offset: String(nextOffset)});
      let result: Summary = await request(`dashboard?${query}`);
   if (nextOffset >= result.filtered_count && nextOffset > 0) {
    nextOffset = Math.max(0, Math.floor((result.filtered_count-1)/8)*8);
    query.set('offset', String(nextOffset));
    result = await request(`dashboard?${query}`);
   }
   setData(result);
   setStatus(filter);
   setLocationId(location);
   setOffset(nextOffset);
   setUpdatedAt(new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/Santiago'}).format(new Date()));
  } catch (error) {
   setError((error as Error).message);
  } finally {
   setBusy(false);
  }
 }
 useEffect(()=>{void load();},[]);
 const money = new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP'});
 const date=data?new Date(`${data.date}T12:00:00Z`).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Santiago'}):'';
 return <div className={styles.workspace}>
  <div data-panel-reveal="home-welcome" className={styles.welcome}>
   <div className={styles.identity}><h1>{name.trim()==='Administrador'?'Hola.':`Hola, ${name}.`}</h1><p className={styles.date}>{data?.company??'Tu espacio de trabajo'}{date&&` · ${date}`}</p></div>
   <div className={styles.actions}><span className={styles.updated} role="status">{busy?'Actualizando…':updatedAt&&`Actualizado a las ${updatedAt}`}</span><IconButton icon="refresh" label="Actualizar resumen" disabled={busy} onClick={()=>void load()}/><details className={styles.quick}><summary>Registrar movimiento</summary><div>
     <button type="button" onClick={()=>onMovement('RECEIPT')}>Entrada</button>
     <button type="button" onClick={()=>onMovement('TRANSFER')}>Transferencia</button>
     <button type="button" onClick={()=>onMovement('ADJUSTMENT')}>Ajuste</button>
    </div></details><button type="button" className={styles.newSale} onClick={()=>navigate('sales')}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Nueva venta</button></div>
  </div>
  <div className={styles.body} aria-busy={busy}>
   {error&&<div className={styles.error} role="alert"><span>{error}</span><button disabled={busy} onClick={()=>void load()}>Reintentar</button></div>}
   <div data-panel-reveal="home-summary-title" className={styles.sectionHeading}><h2>Resumen de tu operación</h2></div>
   {data?<>
    <div className={styles.metrics} aria-label="Resumen de tus ubicaciones autorizadas">
     <button data-panel-reveal="home-sales" className={styles.metric} onClick={()=>navigate('reports')}><div className={styles.metricLabel}><span>Ventas cobradas hoy</span><SummaryIcon kind="sales"/></div><strong><AnimatedAmount value={data.sales_minor}/></strong><div className={styles.metricFoot}><small>{data.sales_count.toLocaleString('es-CL')} {data.sales_count===1?'venta':'ventas'} · Ayer: {money.format(BigInt(data.yesterday_sales_minor))} bruto</small><span aria-hidden="true">→</span></div></button>
     <button data-panel-reveal="home-orders" className={styles.metric} onClick={()=>navigate('orders')}><div className={styles.metricLabel}><span>Retiros por entregar</span><SummaryIcon kind="orders"/></div><strong>{data.awaiting_pickup.toLocaleString('es-CL')}</strong><div className={styles.metricFoot}><small>Pedidos pagados con retiro en sucursal</small><span aria-hidden="true">→</span></div></button>
     <button data-panel-reveal="home-shipping" className={styles.metric} onClick={()=>navigate('shipping')}><div className={styles.metricLabel}><span>Envíos por despachar</span><SummaryIcon kind="shipping"/></div><strong>{data.awaiting_shipments.toLocaleString('es-CL')}</strong><div className={styles.metricFoot}><small>Pedidos pagados con envío a domicilio</small><span aria-hidden="true">→</span></div></button>
     <button data-panel-reveal="home-stock" className={styles.metric} disabled={busy} onClick={()=>{void load('empty','',0);document.getElementById('stock-a-revisar')?.scrollIntoView({block:'start'});}}><div className={styles.metricLabel}><span>Alertas sin stock</span><SummaryIcon kind="stock"/></div><strong className={data.empty_stock_count?styles.critical:undefined}>{data.empty_stock_count.toLocaleString('es-CL')}</strong><div className={styles.metricFoot}><small>{(data.low_stock_count-data.empty_stock_count).toLocaleString('es-CL')} alertas adicionales de stock bajo</small><span aria-hidden="true">→</span></div></button>
    </div>
    <p className={styles.stockContext}><strong>{data.inactive_stock_count.toLocaleString('es-CL')}</strong> productos por ubicación con unidades disponibles y sin movimientos en 30 días.</p>
    <div role="region" aria-labelledby="stock-a-revisar-title" id="stock-a-revisar" data-panel-reveal="home-stock-list" className={styles.attention}>
     <div className={styles.attentionHeading}>
      <div><h2 id="stock-a-revisar-title">Stock a revisar</h2><p>De menor a mayor disponibilidad. Cada alerta corresponde a un producto por ubicación.</p></div>
      <button type="button" className={styles.textAction} disabled={busy} onClick={()=>void load('all','',0)}>Ver {data.low_stock_count? `las ${data.low_stock_count.toLocaleString('es-CL')} alertas`:'todas las alertas'} <span aria-hidden="true">→</span></button>
     </div>
     <fieldset className={styles.alertFilters} disabled={busy} aria-label="Filtros de alertas">
      <div role="group" aria-label="Disponibilidad">{([['all','Todas'],['empty','Sin stock'],['low','Stock bajo']] as const).map(([filter,label])=><button key={filter} type="button" aria-pressed={status===filter} onClick={()=>void load(filter,locationId,0)}>{label}</button>)}</div>
      <label>Ubicación<select value={locationId} onChange={event=>void load(status,event.target.value,0)}><option value="">Todas las ubicaciones</option>{data.alert_locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
     </fieldset>
     {data.alerts.length>0?<div className={styles.alertTable} tabIndex={0} role="region" aria-label="Tabla de alertas de stock">
      <table>
       <thead><tr><th scope="col">Producto</th><th scope="col">Ubicación</th><th scope="col">Físico</th><th scope="col">Reservado</th><th scope="col">Disponible / mín.</th><th scope="col">Acción</th></tr></thead>
       <tbody>{data.alerts.map(alert=>{
        const href=`/panel/productos/${alert.product_id}?desde=home`;
        return <tr key={`${alert.product_id}-${alert.location_id}`}>
         <th scope="row"><Link className={styles.productLink} href={href} prefetch={false}>{alert.name}</Link><small>{alert.sku}</small></th>
         <td><Link className={styles.productLink} href={`/panel?seccion=inventory&locationId=${alert.location_id}&availability=${alert.available===0?'empty':'low'}`} prefetch={false}>{alert.location}</Link></td><td>{alert.physical.toLocaleString('es-CL')}</td><td>{alert.reserved.toLocaleString('es-CL')}</td>
         <td><span className={`${styles.stockBadge} ${alert.available===0?styles.emptyStock:styles.lowStock}`}>{alert.available} / {alert.minimum_stock}</span></td>
         <td><Link className={styles.replenish} href={`${href}&reponer=${alert.location_id}#reponer-${alert.location_id}`} prefetch={false} aria-label={`Reponer ${alert.name} en ${alert.location}`}><span aria-hidden="true">+</span> Reponer</Link></td>
        </tr>;
       })}</tbody>
      </table>
     </div>:<p className={styles.noAlerts}>No hay alertas que coincidan con los filtros.</p>}
     {data.filtered_count>0&&<div className={styles.attentionFoot}>
      <span>{offset+1}–{offset+data.alerts.length} de {data.filtered_count.toLocaleString('es-CL')} alertas</span>
      <nav aria-label="Páginas de alertas"><IconButton icon="previous" label="Alertas anteriores" disabled={busy||offset===0} onClick={()=>void load(status,locationId,offset-8)}/><IconButton icon="next" label="Alertas siguientes" disabled={busy||offset+8>=data.filtered_count} onClick={()=>void load(status,locationId,offset+8)}/></nav>
     </div>}
    </div>
   </>:!error?<div className={styles.skeleton} aria-hidden="true">{[0,1,2,3].map(index=><div key={index}><span/><strong/><small/></div>)}</div>:null}
  </div>
 </div>;
}
