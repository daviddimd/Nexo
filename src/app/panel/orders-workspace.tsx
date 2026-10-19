'use client';
import type {ReactNode} from 'react';
import {IconButton} from '../action-icon';
import RowActions from './row-actions';
import type {ManagedLocation} from './catalog-manager';
import type {Order} from './sales-orders';
import styles from './management-workspace.module.css';
const labels:Record<string,string>={RESERVED:'Reservado',PAID:'Pagado',FULFILLED:'Completado',CANCELLED:'Cancelado',EXPIRED:'Vencido'};
const money=(v:string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(v));
export default function OrdersWorkspace({orders,locations,page,busy,onRefresh,onPage,onOpen,children}:{orders:Order[];locations:ManagedLocation[];page:number;busy:boolean;onRefresh:()=>Promise<void>;onPage:(page:number)=>Promise<void>;onOpen:(id:string)=>Promise<void>;children:ReactNode}){
 return <div className={styles.workspace}>
  <div className={styles.heading}><div><h2>Pedidos y ventas</h2><p>Consulta los pagos, entregas y el seguimiento de cada pedido.</p></div><div className={styles.headingActions}><IconButton icon="refresh" label="Actualizar pedidos" disabled={busy} onClick={()=>void onRefresh()}/></div></div>
  <div className={styles.panel}><div className={styles.panelHeading}><h3>Registro de pedidos</h3><span>{orders.length} {orders.length===1?'pedido':'pedidos'} en esta página</span></div>
   <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Pedidos y ventas" aria-busy={busy}><table className={styles.table}><thead><tr><th scope="col">Pedido</th><th scope="col">Origen</th><th scope="col">Ubicación</th><th scope="col">Estado</th><th scope="col" className={styles.amount}>Total</th><th scope="col" className={styles.menuCell}><span className={styles.srOnly}>Opciones del pedido</span></th></tr></thead><tbody>
    {orders.map(order=><tr key={order.id}><td><span className={styles.record}>#{order.id.slice(0,8)}</span><small>{new Date(order.created_at).toLocaleString('es-CL',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small></td><td><span className={styles.muted}>{order.channel==='LOCAL'?'Venta local':order.fulfillment==='SHIP'?'Web · Envío':'Web · Retiro'}</span></td><td><strong>{locations.find(l=>l.id===order.location_id)?.name??'Ubicación del pedido'}</strong></td><td><span className={`${styles.badge} ${order.status==='FULFILLED'?styles.positive:order.status==='PAID'?styles.info:order.status==='RESERVED'?styles.warning:styles.neutral}`}>{labels[order.status]??order.status}</span></td><td className={styles.amount}>{money(order.total_minor)}</td><td className={styles.menuCell}><RowActions name={`pedido ${order.id.slice(0,8)}`} editLabel="Ver pedido" disabled={busy} onEdit={()=>void onOpen(order.id)}/></td></tr>)}
    {!orders.length&&<tr><td colSpan={6}><div className={styles.empty}><h3>No hay pedidos en esta página</h3><p>Las ventas locales y los pedidos de la web aparecerán aquí.</p></div></td></tr>}
   </tbody></table></div>
   <div className={styles.pagination}><span>Hasta 25 pedidos por página</span><nav aria-label="Páginas de pedidos"><IconButton icon="previous" label="Pedidos anteriores" disabled={busy||page===0} onClick={()=>void onPage(page-1)}/><span>Página {page+1}</span><IconButton icon="next" label="Pedidos siguientes" disabled={busy||orders.length<25} onClick={()=>void onPage(page+1)}/></nav></div>
  </div>
  <p className={styles.note}>El estado del pedido es histórico. El detalle incluye reembolsos y retiros posteriores.</p>
  {children}
 </div>;
}
