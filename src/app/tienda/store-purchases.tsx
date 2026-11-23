'use client';
import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import {storePurchasesPath,storeHome,storeOrderPath} from '../../catalog/store-access-paths';
import type {TestCard} from './customer-types';
import {ActionIcon,IconButton} from '../action-icon';
import Modal from '../panel/modal';
import styles from './store-account.module.css';
export const purchaseStates:Record<string,string>={RESERVED:'Pendiente de pago',PAID:'Pagado',FULFILLED:'Entregado / despachado',EXPIRED:'Vencido',CANCELLED:'Cancelado',REQUESTED:'Por cotizar',APPROVED:'Aprobada',REJECTED:'Rechazada',USED:'Pedido creado'};
export const storeMoney=(value:string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
const date=(value:string|null,withTime=false)=>value?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',...(withTime?{timeStyle:'short' as const}:{}),timeZone:'America/Santiago'}).format(new Date(value)):'—';
export function PurchaseStatus({status}:{status:string}){return <span className={`${styles.status} ${['PAID','FULFILLED','APPROVED','USED'].includes(status)?styles.success:['EXPIRED','CANCELLED','REJECTED'].includes(status)?styles.closed:styles.pending}`}>{purchaseStates[status]||status}</span>}
function PurchaseFrame({page,title,busy,onClose,className,children}:{
 page?:boolean;title:string;busy:boolean;onClose:()=>void;className?:string;children:ReactNode;
}){
 if(page)return <section id="pedido" className={styles.purchasePage} aria-labelledby="purchase-page-title">
  <h1 id="purchase-page-title">{title}</h1>{children}
 </section>;
 return <Modal title={title} className={className} busy={busy} iconClose onClose={onClose}>{children}</Modal>;
}
export function StorePaymentConfirmation({slug,id,total,fulfillment}: {
 slug:string;id:string;total:string;fulfillment?:string;
}){
 return <section id="pedido" className={styles.purchasePage} aria-labelledby="purchase-page-title">
  <h1 id="purchase-page-title">Pedido confirmado</h1>
  <div className={styles.confirmationHero}>
   <div className={styles.confirmationMark} aria-hidden="true">✓</div>
   <h3>¡Gracias por tu compra!</h3>
   <p>Tu pedido <strong>#{id.slice(0,8).toUpperCase()}</strong> está confirmado.</p>
  </div>
  <div className={styles.confirmationReceipt}>
   <p><span>Total del pedido</span><strong>{storeMoney(total)}</strong></p>
   <p><span>Entrega</span><b>{fulfillment==='SHIP'?'Envío a domicilio':'Retiro en sucursal'}</b></p>
  </div>
  <p className={styles.confirmationNext}>{fulfillment==='SHIP'?'Consulta el estado de tu envío en Mis compras.':'Consulta en Mis compras cuándo podrás retirar tu pedido.'}</p>
  <div className={styles.confirmationActions}>
   <a className={styles.primary} href={storePurchasesPath(slug)}>Ir a Mis compras <span aria-hidden="true">→</span></a>
   <Link href={storeOrderPath(slug,id)}>Ver detalle del pedido</Link>
   <Link href={storeHome(slug)}>Seguir comprando</Link>
  </div>
 </section>;
}
type Purchase={id:string;status:string;created_at:string;fulfillment?:string;total_minor?:string;shipping_minor?:string|null;goods_minor?:string|null;expires_at?:string|null};
type Props={homeHref:string;orders:Purchase[];quotes:Purchase[];orderPage:number;quotePage:number;busy:boolean;onRefresh:()=>void;onPage:(orderPage:number,quotePage:number)=>void;onOpen:(kind:string,id:string)=>void};
export default function StorePurchases({homeHref,orders,quotes,orderPage,quotePage,busy,onRefresh,onPage,onOpen}:Props){
 const [tab,setTab]=useState<'orders'|'quotes'>('orders');
 const rows=tab==='orders'?orders:quotes,page=tab==='orders'?orderPage:quotePage;
 return <section id="mis-compras" className={styles.purchaseHistory}>
  <div className={styles.heading}><div><Link className={styles.historyBack} href={homeHref}>← Volver a la tienda</Link><h1>Mis compras</h1><p>Consulta tus compras, pagos y entregas anteriores.</p></div><IconButton icon="refresh" label="Actualizar mis compras" disabled={busy} onClick={onRefresh}/></div>
  {(quotes.length>0||quotePage>0)&&<div className={styles.switcher} role="group" aria-label="Tipo de actividad"><button type="button" aria-pressed={tab==='orders'} onClick={()=>setTab('orders')}><ActionIcon name="company" size={18}/>Pedidos</button>{(quotes.length>0||quotePage>0)&&<button type="button" aria-pressed={tab==='quotes'} onClick={()=>setTab('quotes')}><ActionIcon name="clock" size={18}/>Cotizaciones anteriores</button>}</div>}
  <div className={styles.purchaseList} aria-busy={busy}>{rows.map(row=><article key={row.id} className={styles.purchaseRow}><span className={styles.rowIcon}><ActionIcon name={tab==='orders'?'company':'clock'}/></span><div className={styles.purchaseName}><strong>{tab==='orders'?'Pedido':'Cotización'} #{row.id.slice(0,8).toUpperCase()}</strong><span>{date(row.created_at)} · {tab==='quotes'?'Envío a domicilio':row.fulfillment==='SHIP'?'Envío a domicilio':'Retiro en sucursal'}</span></div><PurchaseStatus status={row.status}/><div className={styles.amount}><strong>{tab==='orders'?storeMoney(row.total_minor!):row.shipping_minor!==null&&row.shipping_minor!==undefined?storeMoney(row.shipping_minor):'Por definir'}</strong><small>{tab==='orders'?'Total del pedido':'Costo de envío'}</small></div><button type="button" className={styles.detailButton} disabled={busy} onClick={()=>onOpen(tab==='orders'?'orders':'shipping/quotes',row.id)} aria-label={`Ver ${tab==='orders'?'pedido':'cotización'} ${row.id.slice(0,8)}`}>Ver detalle <span aria-hidden="true">→</span></button></article>)}
   {!rows.length&&<div className={styles.empty}><ActionIcon name={tab==='orders'?'company':'clock'} size={36}/><h3>{busy?'Cargando tu actividad…':tab==='orders'?'Tu primera compra está por llegar':'No tienes cotizaciones de envío'}</h3><p>{tab==='orders'?'Cuando crees un pedido, podrás seguirlo aquí.':'El costo de los nuevos envíos se calcula directamente en el carrito.'}</p></div>}
  </div>
  <nav className={styles.pagination} aria-label={tab==='orders'?'Páginas de mis pedidos':'Páginas de mis cotizaciones'}><IconButton icon="previous" label="Página anterior" disabled={busy||page===0} onClick={()=>onPage(tab==='orders'?page-1:orderPage,tab==='quotes'?page-1:quotePage)}/><span>Página {page+1}</span><IconButton icon="next" label="Página siguiente" disabled={busy||rows.length<10} onClick={()=>onPage(tab==='orders'?page+1:orderPage,tab==='quotes'?page+1:quotePage)}/></nav>
 </section>;
}

type DetailProps={page?:boolean;cards:TestCard[];preference:'CARD'|'TRANSFER'|null;onMethods:()=>void;detail:any;busy:boolean;unknown:boolean;notice:string;onClose:()=>void;onPay:(method:'CARD'|'TRANSFER',cardId?:string)=>void;onCancel:()=>void;onCreate:()=>void;onRetry:()=>void};
export function StorePurchaseDetail({page,cards,preference,onMethods,detail,busy,unknown,notice,onClose,onPay,onCancel,onCreate,onRetry}:DetailProps){
 const [method,setMethod]=useState<'CARD'|'TRANSFER'>(detail.testPayment?.method??preference??(cards.length?'CARD':'TRANSFER')),[cardId,setCardId]=useState(detail.testPayment?.card_id??cards[0]?.id??'');
 const order=detail.kind==='orders';
 const items=order?detail.items:detail.priced_items??detail.itemDetails??[];
 const expired=Boolean(detail.expires_at&&new Date(detail.expires_at).getTime()<=Date.now());
 const total=order?detail.total_minor:detail.goods_minor!==null&&detail.shipping_minor!==null?(BigInt(detail.goods_minor)+BigInt(detail.shipping_minor)).toString():null;
 if(order&&detail.status==='RESERVED'){
  const shipping=detail.shipping_address;
  const orderNumber=detail.id.slice(0,8).toUpperCase();
  return <PurchaseFrame page={page} title="Revisa tu pedido" className={styles.dialog+' '+styles.reviewDialog} busy={busy} onClose={onClose}>
   <p className={styles.reviewReference}>Pedido #{orderNumber} · Pendiente de pago</p>
   {notice&&notice!=='Pedido creado. Revisa el resumen y elige cómo pagar.'&&<p className={styles.notice} role="status">{notice}</p>}
   {unknown&&<div className={styles.notice} role="alert"><p>Comprueba si se registró la solicitud antes de continuar.</p><button type="button" disabled={busy} onClick={onRetry}>Comprobar solicitud</button></div>}
   <div className={styles.reviewGrid}>
    <div className={styles.reviewSummary}>
     <h3>Tu compra</h3>
     <ul className={styles.reviewItems}>{items.map((item:any)=>{
      const lineTotal=item.line_total_minor??item.lineTotal;
      return <li key={item.product_id??item.productId}><div><strong>{item.name}</strong><small>Cantidad: {item.quantity}</small></div>{lineTotal!=null&&<b>{storeMoney(lineTotal)}</b>}</li>;
     })}</ul>
     <div className={styles.reviewDelivery}>
      <h4>{shipping?'Envío a domicilio':'Retiro en sucursal'}</h4>
      {shipping&&<p>{shipping.recipient}<br/>{shipping.line1}<br/>{shipping.commune}, {shipping.region}</p>}
      {!shipping&&detail.location_name&&<p>{detail.location_name}</p>}
     </div>
     <dl className={styles.reviewTotals}>
      {detail.goods_minor!=null&&<div><dt>Productos</dt><dd>{storeMoney(detail.goods_minor)}</dd></div>}
      <div><dt>{shipping?'Envío':'Retiro'}</dt><dd>{shipping&&detail.shipping_minor!=null?storeMoney(detail.shipping_minor):'Sin costo'}</dd></div>
      <div><dt>Total</dt><dd>{storeMoney(detail.total_minor)}</dd></div>
     </dl>
    </div>
    <div className={styles.reviewPayment}><h3>Método de pago</h3><p>Tu reserva vence el {date(detail.expires_at,true)}.</p><label>Forma de pago<select disabled={busy||!!detail.testPayment} value={method} onChange={event=>setMethod(event.target.value as 'CARD'|'TRANSFER')}><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option></select></label>{method==='CARD'&&<><label>Tarjeta guardada<select value={cardId} disabled={busy||!!detail.testPayment} onChange={event=>setCardId(event.target.value)} required><option value="">Selecciona una tarjeta</option>{cards.map(card=><option key={card.id} value={card.id}>{card.brand} ···· {card.last_four} · {card.label}</option>)}</select></label>{!cards.length&&<button type="button" disabled={busy} onClick={onMethods}>Agregar tarjeta en Mi cuenta</button>}</>}<button type="button" className={styles.primary} disabled={busy||expired||unknown||(method==='CARD'&&!cardId)} onClick={()=>onPay(method,method==='CARD'?cardId:undefined)}>{busy?"Procesando…":"Registrar pago"} <span aria-hidden="true">→</span></button>{expired&&<p>La reserva venció. Actualiza tus compras antes de continuar.</p>}<details className={styles.cancel}><summary>Cancelar esta reserva</summary><p>Se liberarán los productos reservados.</p><button type="button" disabled={busy||unknown} onClick={onCancel}>Confirmar cancelación</button></details></div>
   </div>
  </PurchaseFrame>;
 }
 return <PurchaseFrame page={page} title={`${order?'Pedido':'Cotización'} #${detail.id.slice(0,8).toUpperCase()}`} className={styles.dialog} busy={busy} onClose={onClose}>
  <div className={styles.receiptTop}><div><PurchaseStatus status={detail.status}/><p>Creado el {date(detail.created_at,true)}</p></div>{total!==null&&<div className={styles.receiptTotal}><small>{order?'Total del pedido':'Total cotizado'}</small><strong>{storeMoney(total)}</strong></div>}</div>
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  <div className={styles.receiptItems}><h3>Productos</h3>{items.map((item:any)=><div key={item.product_id??item.productId}><span><strong>{item.name}</strong><small>{item.quantity} {item.quantity===1?'unidad':'unidades'}{item.sku?` · ${item.sku}`:''}</small></span>{(item.line_total_minor??item.lineTotal)!==undefined&&<b>{storeMoney(item.line_total_minor??item.lineTotal)}</b>}</div>)}</div>
  {!order&&<div className={styles.receiptInfo}><h3>Envío a domicilio</h3>{detail.shipping_minor!==null&&<p>Costo de envío: <strong>{storeMoney(detail.shipping_minor)}</strong></p>}{detail.note&&<p>{detail.note}</p>}{!detail.priced_items&&<p>Los precios de los productos son referenciales hasta que se apruebe la cotización.</p>}{detail.expires_at&&<p>Vigencia: {date(detail.expires_at,true)}</p>}</div>}
  {order&&detail.shipping_address&&<div className={styles.receiptInfo}><h3>Dirección de entrega</h3><p>{detail.shipping_address.recipient}<br/>{detail.shipping_address.line1}<br/>{detail.shipping_address.commune}, {detail.shipping_address.region}</p><p>Productos: {storeMoney(detail.goods_minor)} · Envío: {storeMoney(detail.shipping_minor)}</p></div>}
  {order&&detail.testPayment&&<div className={styles.receiptInfo}><h3>Método de pago</h3><p>{detail.testPayment.method==='CARD'?`${detail.testPayment.card_brand} ···· ${detail.testPayment.card_last_four} · ${detail.testPayment.card_label}`:'Transferencia'}</p></div>}

  {!order&&detail.status==='APPROVED'&&<div className={styles.receiptInfo}><button type="button" className={styles.primary} disabled={busy||unknown||expired} onClick={onCreate}>Crear pedido con este envío <span aria-hidden="true">→</span></button><p>{expired?'La vigencia terminó. Vuelve al carrito para calcular el envío y crear un pedido nuevo.':'Comprobaremos el stock al crear tu pedido. Después podrás continuar al pago.'}</p></div>}
  {unknown&&<div className={styles.notice} role="alert"><p>Comprueba la respuesta antes de volver a crear la solicitud.</p><button type="button" disabled={busy} onClick={onRetry}>Comprobar solicitud</button></div>}
 </PurchaseFrame>;
}
