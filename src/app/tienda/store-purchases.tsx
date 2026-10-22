'use client';
import {useState} from 'react';
import {ActionIcon,IconButton} from '../action-icon';
import Modal from '../panel/modal';
import styles from './store-account.module.css';
export const purchaseStates:Record<string,string>={RESERVED:'Pendiente de pago',PAID:'Pagado',FULFILLED:'Entregado / despachado',EXPIRED:'Vencido',CANCELLED:'Cancelado',REQUESTED:'Por cotizar',APPROVED:'Aprobada',REJECTED:'Rechazada',USED:'Pedido creado'};
export const storeMoney=(value:string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
const date=(value:string|null,withTime=false)=>value?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',...(withTime?{timeStyle:'short' as const}:{}),timeZone:'America/Santiago'}).format(new Date(value)):'—';
export function PurchaseStatus({status}:{status:string}){return <span className={`${styles.status} ${['PAID','FULFILLED','APPROVED','USED'].includes(status)?styles.success:['EXPIRED','CANCELLED','REJECTED'].includes(status)?styles.closed:styles.pending}`}>{purchaseStates[status]||status}</span>}
type Purchase={id:string;status:string;created_at:string;fulfillment?:string;total_minor?:string;shipping_minor?:string|null;goods_minor?:string|null;expires_at:string|null};
type Props={orders:Purchase[];quotes:Purchase[];orderPage:number;quotePage:number;busy:boolean;onRefresh:()=>void;onPage:(orderPage:number,quotePage:number)=>void;onOpen:(kind:string,id:string)=>void};
export default function StorePurchases({orders,quotes,orderPage,quotePage,busy,onRefresh,onPage,onOpen}:Props){
 const [tab,setTab]=useState<'orders'|'quotes'>('orders');
 const rows=tab==='orders'?orders:quotes,page=tab==='orders'?orderPage:quotePage;
 return <section id="mis-compras" className={styles.purchases}>
  <div className={styles.heading}><div><span className={styles.eyebrow}>TU ACTIVIDAD EN LA TIENDA</span><h2>Mis compras</h2><p>Revisa tus pedidos y las cotizaciones de envío.</p></div><IconButton icon="refresh" label="Actualizar mis compras" disabled={busy} onClick={onRefresh}/></div>
  <div className={styles.switcher} role="group" aria-label="Tipo de actividad"><button type="button" aria-pressed={tab==='orders'} onClick={()=>setTab('orders')}><ActionIcon name="company" size={18}/>Pedidos</button><button type="button" aria-pressed={tab==='quotes'} onClick={()=>setTab('quotes')}><ActionIcon name="clock" size={18}/>Cotizaciones de envío</button></div>
  <div className={styles.purchaseList} aria-busy={busy}>{rows.map(row=><article key={row.id} className={styles.purchaseRow}><span className={styles.rowIcon}><ActionIcon name={tab==='orders'?'company':'clock'}/></span><div className={styles.purchaseName}><strong>{tab==='orders'?'Pedido':'Cotización'} #{row.id.slice(0,8).toUpperCase()}</strong><span>{date(row.created_at)} · {tab==='quotes'?'Envío a domicilio':row.fulfillment==='SHIP'?'Envío a domicilio':'Retiro en sucursal'}</span></div><PurchaseStatus status={row.status}/><div className={styles.amount}><strong>{tab==='orders'?storeMoney(row.total_minor!):row.shipping_minor!==null&&row.shipping_minor!==undefined?storeMoney(row.shipping_minor):'Por definir'}</strong><small>{tab==='orders'?'Total del pedido':'Costo de envío'}</small></div><button type="button" className={styles.detailButton} disabled={busy} onClick={()=>onOpen(tab==='orders'?'orders':'shipping/quotes',row.id)} aria-label={`Ver ${tab==='orders'?'pedido':'cotización'} ${row.id.slice(0,8)}`}>Ver detalle <span aria-hidden="true">↗</span></button></article>)}
   {!rows.length&&<div className={styles.empty}><ActionIcon name={tab==='orders'?'company':'clock'} size={36}/><h3>{busy?'Cargando tu actividad…':tab==='orders'?'Tu primera compra está por llegar':'No tienes cotizaciones de envío'}</h3><p>{tab==='orders'?'Cuando crees un pedido, podrás seguirlo aquí.':'Solicita una cotización desde el carrito para conocer el costo de despacho.'}</p><a href="#catalogo">Explorar catálogo →</a></div>}
  </div>
  <nav className={styles.pagination} aria-label={tab==='orders'?'Páginas de mis pedidos':'Páginas de mis cotizaciones'}><IconButton icon="previous" label="Página anterior" disabled={busy||page===0} onClick={()=>onPage(tab==='orders'?page-1:orderPage,tab==='quotes'?page-1:quotePage)}/><span>Página {page+1}</span><IconButton icon="next" label="Página siguiente" disabled={busy||rows.length<10} onClick={()=>onPage(tab==='orders'?page+1:orderPage,tab==='quotes'?page+1:quotePage)}/></nav>
 </section>;
}

type DetailProps={detail:any;busy:boolean;unknown:boolean;notice:string;onClose:()=>void;onPay:()=>void;onCancel:()=>void;onCreate:()=>void;onRetry:()=>void};
export function StorePurchaseDetail({detail,busy,unknown,notice,onClose,onPay,onCancel,onCreate,onRetry}:DetailProps){
 const order=detail.kind==='orders';
 const items=order?detail.items:detail.priced_items??detail.itemDetails??[];
 const expired=Boolean(detail.expires_at&&new Date(detail.expires_at).getTime()<=Date.now());
 const total=order?detail.total_minor:detail.goods_minor!==null&&detail.shipping_minor!==null?(BigInt(detail.goods_minor)+BigInt(detail.shipping_minor)).toString():null;
 return <Modal title={`${order?'Pedido':'Cotización'} #${detail.id.slice(0,8).toUpperCase()}`} className={styles.dialog} busy={busy} onClose={onClose}>
  <div className={styles.receiptTop}><div><PurchaseStatus status={detail.status}/><p>Creado el {date(detail.created_at,true)}</p></div>{total!==null&&<div className={styles.receiptTotal}><small>{order?'Total del pedido':'Total cotizado'}</small><strong>{storeMoney(total)}</strong></div>}</div>
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  <div className={styles.receiptItems}><h3>Productos</h3>{items.map((item:any)=><div key={item.product_id??item.productId}><span><strong>{item.name}</strong><small>{item.quantity} {item.quantity===1?'unidad':'unidades'}{item.sku?` · ${item.sku}`:''}</small></span>{(item.line_total_minor??item.lineTotal)!==undefined&&<b>{storeMoney(item.line_total_minor??item.lineTotal)}</b>}</div>)}</div>
  {!order&&<div className={styles.receiptInfo}><h3>Envío a domicilio</h3>{detail.shipping_minor!==null&&<p>Costo de envío: <strong>{storeMoney(detail.shipping_minor)}</strong></p>}{detail.note&&<p>{detail.note}</p>}{!detail.priced_items&&<p>Los precios de los productos son referenciales hasta que se apruebe la cotización.</p>}{detail.expires_at&&<p>Vigencia: {date(detail.expires_at,true)}</p>}</div>}
  {order&&detail.status==='RESERVED'&&<div className={styles.receiptInfo}><h3>Completa tu pedido</h3><p>Tu reserva vence el {date(detail.expires_at,true)}.</p><button type="button" className={styles.primary} disabled={busy||expired||unknown} onClick={onPay}>Pagar con simulador <span aria-hidden="true">→</span></button><small className={styles.muted}>Pago de demostración. No se cobra dinero real.</small>{expired&&<p>La reserva venció. Actualiza tus compras antes de continuar.</p>}<details className={styles.cancel}><summary>Cancelar esta reserva</summary><p>Se liberarán los productos reservados.</p><button type="button" disabled={busy||unknown} onClick={onCancel}>Confirmar cancelación</button></details></div>}
  {!order&&detail.status==='APPROVED'&&<div className={styles.receiptInfo}><button type="button" className={styles.primary} disabled={busy||unknown||expired} onClick={onCreate}>Crear pedido con este envío <span aria-hidden="true">→</span></button><p>{expired?'La vigencia terminó. Solicita una nueva cotización.':'Comprobaremos el stock al crear tu pedido. Después podrás continuar al pago.'}</p></div>}
  {unknown&&<div className={styles.notice} role="alert"><p>Comprueba la respuesta antes de volver a crear la solicitud.</p><button type="button" disabled={busy} onClick={onRetry}>Comprobar solicitud</button></div>}
 </Modal>;
}
