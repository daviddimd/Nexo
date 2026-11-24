'use client';
import {useEffect,useState,type CSSProperties,type ReactNode} from 'react';
import {CheckoutBackLink,CheckoutPage,CheckoutSteps} from './checkout-steps';
import flow from './checkout-flow.module.css';
import {deliveryWindow,describeWindow} from '../../catalog/delivery-window';
import Link from 'next/link';
import {storePurchasesPath,storeHome,storeOrderPath} from '../../catalog/store-access-paths';
import type {TestCard} from './customer-types';
import {ActionIcon,IconButton} from '../action-icon';
import Modal from '../panel/modal';
import styles from './store-account.module.css';
export const purchaseStates:Record<string,string>={RESERVED:'Pendiente de pago',PAID:'Pagado',FULFILLED:'Entregado / despachado',EXPIRED:'Vencido',CANCELLED:'Cancelado',REQUESTED:'Por cotizar',APPROVED:'Aprobada',REJECTED:'Rechazada',USED:'Pedido creado'};
export const storeMoney=(value:string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
const date=(value:string|null,withTime=false)=>value?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',...(withTime?{timeStyle:'short' as const}:{}),timeZone:'America/Santiago'}).format(new Date(value)):'—';
export function shipmentLabel(fulfillment:string|undefined,status:string,shipmentStatus?:string|null){
 if(fulfillment!=='SHIP')return null;
 if(shipmentStatus==='DELIVERED')return 'Entregado';
 if(status==='FULFILLED')return 'Despachado';
 if(status==='PAID')return shipmentStatus==='PREPARING'?'En preparación':'Por preparar';
 return null;
}
export function PurchaseStatus({status,label}:{status:string;label?:string|null}){return <span className={`${styles.status} ${['PAID','FULFILLED','APPROVED','USED'].includes(status)?styles.success:['EXPIRED','CANCELLED','REJECTED'].includes(status)?styles.closed:styles.pending}`}>{label||purchaseStates[status]||status}</span>}
function PurchaseFrame({page,title,busy,onClose,className,children,back,backLabel='Volver a Mis compras',stepBack,step}:{
 page?:boolean;back?:string;backLabel?:string;stepBack?:Partial<Record<1|2,string>>;step?:1|2|3;title:string;busy:boolean;onClose:()=>void;className?:string;children:ReactNode;
}){
 if(page)return <CheckoutPage><section id="pedido" className={styles.purchasePage} aria-labelledby="purchase-page-title">
  {step&&<CheckoutSteps current={step} back={stepBack}/>}{back&&(step?<CheckoutBackLink href={back}>{backLabel}</CheckoutBackLink>:<Link className={styles.historyBack} href={back}>← {backLabel}</Link>)}<h1 id="purchase-page-title">{title}</h1>{children}
 </section></CheckoutPage>;
 return <Modal title={title} className={className} busy={busy} iconClose onClose={onClose}>{children}</Modal>;
}
export function StorePaymentConfirmation({slug,detail}:{slug:string;detail:any}){
 const id=detail.id as string,ship=detail.fulfillment==='SHIP',address=detail.shipping_address;
 const arrival=ship?describeWindow(deliveryWindow(detail.paid_at??Date.now(),detail.delivery_days_min,detail.delivery_days_max)):'';
 const payment=detail.testPayment?(detail.testPayment.method==='CARD'?`${detail.testPayment.card_brand} ···· ${detail.testPayment.card_last_four}`:'Transferencia'):null;
 const items:{product_id:string;name:string;quantity:number}[]=detail.items??[];
 const delay=(index:number)=>({'--i':index} as CSSProperties);
 const next=ship
  ?[['Preparamos tu pedido','Lo armamos con cuidado para despacharlo.'],['Lo despachamos',arrival?`Verás el avance en Mis compras. Llega ${arrival}.`:'Verás el transportista y el seguimiento en Mis compras.'],['Llega a tu dirección',address?`${address.line1}, ${address.commune}`:'A la dirección que elegiste.']]
  :[['Preparamos tu pedido','Lo dejamos listo para retirar.'],['Retíralo en la sucursal',detail.location_name??'En la sucursal que elegiste.']];
 return <CheckoutPage><section id="pedido" className={`${styles.purchasePage} ${styles.confirmationPage}`} aria-labelledby="purchase-page-title">
  <CheckoutSteps current={3} complete/>
  <h1 id="purchase-page-title" className={flow.srOnly}>Pedido confirmado</h1>
  <div className={flow.confirmGrid}>
  <div>
  <div className={flow.success}>
   <div className={flow.successMark} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
   <h2>¡Gracias por tu compra!</h2>
   <p>Tu pedido <strong>#{id.slice(0,8).toUpperCase()}</strong> está confirmado.</p>
  </div>
  <dl className={`${flow.receipt} ${flow.reveal}`} style={delay(1)}>
   <div className={flow.total}><dt>Total del pedido</dt><dd>{storeMoney(detail.total_minor)}</dd></div>
   {payment&&<div><dt>Pago</dt><dd>{payment}</dd></div>}
   <div><dt>Entrega</dt><dd>{ship?'Envío a domicilio':'Retiro en sucursal'}</dd></div>
   {ship&&address&&<div><dt>Dirección</dt><dd>{address.line1}, {address.commune}</dd></div>}
   {!ship&&detail.location_name&&<div><dt>Retiro en</dt><dd>{detail.location_name}</dd></div>}
   {arrival&&<div><dt>Llegada estimada</dt><dd>{arrival}</dd></div>}
  </dl>
  {items.length>0&&<ul className={`${flow.itemsList} ${flow.reveal}`} style={delay(2)} aria-label="Productos del pedido">{items.map(item=><li key={item.product_id}><span>{item.name}</span><b>× {item.quantity}</b></li>)}</ul>}
  </div>
  <div className={flow.confirmSide}>
  <ol className={`${flow.next} ${flow.reveal}`} style={delay(3)} aria-label="Qué sigue">
   <li data-done="true"><span className={flow.nextDot}>✓</span><div><strong>Pago recibido</strong><span>Tu pedido quedó confirmado.</span></div></li>
   {next.map(([title,text],index)=><li key={title}><span className={flow.nextDot}>{index+2}</span><div><strong>{title}</strong><span>{text}</span></div></li>)}
  </ol>
  <div className={`${styles.confirmationActions} ${flow.reveal}`} style={delay(4)}>
   <a className={styles.primary} href={storePurchasesPath(slug)}>Ir a Mis compras <span aria-hidden="true">→</span></a>
   <Link href={storeOrderPath(slug,id)}>Ver detalle del pedido</Link>
   <Link href={storeHome(slug)}>Seguir comprando</Link>
  </div>
  </div>
  </div>
 </section></CheckoutPage>;
}
type Purchase={id:string;status:string;created_at:string;fulfillment?:string;shipment_status?:string|null;total_minor?:string;shipping_minor?:string|null;goods_minor?:string|null;expires_at?:string|null};
type Props={homeHref:string;orders:Purchase[];quotes:Purchase[];orderPage:number;quotePage:number;busy:boolean;onRefresh:()=>void;onPage:(orderPage:number,quotePage:number)=>void;onOpen:(kind:string,id:string)=>void};
export default function StorePurchases({homeHref,orders,quotes,orderPage,quotePage,busy,onRefresh,onPage,onOpen}:Props){
 const [tab,setTab]=useState<'orders'|'quotes'>('orders');
 const rows=tab==='orders'?orders:quotes,page=tab==='orders'?orderPage:quotePage;
 return <section id="mis-compras" className={styles.purchaseHistory}>
  <div className={styles.heading}><div><Link className={styles.historyBack} href={homeHref}>← Volver a la tienda</Link><h1>Mis compras</h1><p>Consulta tus compras, pagos y entregas anteriores.</p></div><IconButton icon="refresh" label="Actualizar mis compras" disabled={busy} onClick={onRefresh}/></div>
  {(quotes.length>0||quotePage>0)&&<div className={styles.switcher} role="group" aria-label="Tipo de actividad"><button type="button" aria-pressed={tab==='orders'} onClick={()=>setTab('orders')}><ActionIcon name="company" size={18}/>Pedidos</button>{(quotes.length>0||quotePage>0)&&<button type="button" aria-pressed={tab==='quotes'} onClick={()=>setTab('quotes')}><ActionIcon name="clock" size={18}/>Cotizaciones anteriores</button>}</div>}
  <div className={styles.purchaseList} aria-busy={busy}>{rows.map(row=><article key={row.id} className={styles.purchaseRow}><span className={styles.rowIcon}><ActionIcon name={tab==='orders'?'company':'clock'}/></span><div className={styles.purchaseName}><strong>{tab==='orders'?'Pedido':'Cotización'} #{row.id.slice(0,8).toUpperCase()}</strong><span>{date(row.created_at)} · {tab==='quotes'?'Envío a domicilio':row.fulfillment==='SHIP'?'Envío a domicilio':'Retiro en sucursal'}</span></div><PurchaseStatus status={row.status} label={tab==='orders'?shipmentLabel(row.fulfillment,row.status,row.shipment_status):null}/><div className={styles.amount}><strong>{tab==='orders'?storeMoney(row.total_minor!):row.shipping_minor!==null&&row.shipping_minor!==undefined?storeMoney(row.shipping_minor):'Por definir'}</strong><small>{tab==='orders'?'Total del pedido':'Costo de envío'}</small></div><button type="button" className={styles.detailButton} disabled={busy} onClick={()=>onOpen(tab==='orders'?'orders':'shipping/quotes',row.id)} aria-label={`Ver ${tab==='orders'?'pedido':'cotización'} ${row.id.slice(0,8)}`}>Ver detalle <span aria-hidden="true">→</span></button></article>)}
   {!rows.length&&<div className={styles.empty}><ActionIcon name={tab==='orders'?'company':'clock'} size={36}/><h3>{busy?'Cargando tu actividad…':tab==='orders'?'Tu primera compra está por llegar':'No tienes cotizaciones de envío'}</h3><p>{tab==='orders'?'Cuando crees un pedido, podrás seguirlo aquí.':'El costo de los nuevos envíos se calcula directamente en el carrito.'}</p></div>}
  </div>
  <nav className={styles.pagination} aria-label={tab==='orders'?'Páginas de mis pedidos':'Páginas de mis cotizaciones'}><IconButton icon="previous" label="Página anterior" disabled={busy||page===0} onClick={()=>onPage(tab==='orders'?page-1:orderPage,tab==='quotes'?page-1:quotePage)}/><span>Página {page+1}</span><IconButton icon="next" label="Página siguiente" disabled={busy||rows.length<10} onClick={()=>onPage(tab==='orders'?page+1:orderPage,tab==='quotes'?page+1:quotePage)}/></nav>
 </section>;
}

type DetailProps={page?:boolean;backHref?:string;cartHref?:string;cards:TestCard[];preference:'CARD'|'TRANSFER'|null;onMethods:()=>void;detail:any;busy:boolean;unknown:boolean;notice:string;onClose:()=>void;onPay:(method:'CARD'|'TRANSFER',cardId?:string)=>void;onCancel:()=>void;onCreate:()=>void;onRetry:()=>void};
function ShipmentProgress({detail}:{detail:any}){
 const shipment=detail.shipment as {status:string;carrier:string|null;tracking_code:string|null;estimated_delivery:string|null;dispatched_at:string|null;delivered_at:string|null}|null;
 const delivered=shipment?.status==='DELIVERED',sent=detail.status==='FULFILLED',window=deliveryWindow(detail.paid_at??Date.now(),detail.delivery_days_min,detail.delivery_days_max);
 const title=delivered?'Pedido entregado':sent?'Pedido despachado':shipment?'Estamos preparando tu pedido':'Pago recibido';
 const text=delivered?`Entregado el ${date(shipment!.delivered_at,true)}.`:sent?(shipment?.carrier?`Despachado el ${date(shipment.dispatched_at,true)} con ${shipment.carrier}.`:'Tu pedido ya salió de la tienda.'):shipment?'Lo estamos armando para despacharlo pronto.':'Recibimos tu pago. En breve empezaremos a preparar tu envío.';
 return <div className={styles.receiptInfo} aria-live="polite"><h3>Seguimiento del envío</h3><p><strong>{title}</strong><br/>{text}</p>
  {sent&&shipment?.tracking_code&&<p>Número de seguimiento: <strong>{shipment.tracking_code}</strong></p>}
  {!delivered&&(sent&&shipment?.estimated_delivery?<p>Entrega estimada: <strong>{date(shipment.estimated_delivery+'T12:00:00')}</strong></p>:window?<p>Llegada estimada: <strong>{describeWindow(window)}</strong></p>:null)}</div>;
}
export function StorePurchaseDetail({page,backHref,cartHref,cards,preference,onMethods,detail,busy,unknown,notice,onClose,onPay,onCancel,onCreate,onRetry}:DetailProps){
 const [method,setMethod]=useState<'CARD'|'TRANSFER'>(detail.testPayment?.method??preference??(cards.length?'CARD':'TRANSFER')),[cardId,setCardId]=useState(detail.testPayment?.card_id??cards[0]?.id??'');
 const order=detail.kind==='orders';
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(detail.status!=='RESERVED')return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[detail.status]);
 const secondsLeft=detail.expires_at?Math.max(0,Math.ceil((new Date(detail.expires_at).getTime()-now)/1000)):0;
 const lapsed=order&&detail.status==='RESERVED'&&secondsLeft===0;
 const clock=`${Math.floor(secondsLeft/60)}:${String(secondsLeft%60).padStart(2,'0')}`;
 const reviewArrival=order&&detail.fulfillment==='SHIP'?describeWindow(deliveryWindow(Date.now(),detail.delivery_days_min,detail.delivery_days_max)):'';
 const items=order?detail.items:detail.priced_items??detail.itemDetails??[];
 const expired=Boolean(detail.expires_at&&new Date(detail.expires_at).getTime()<=Date.now());
 const total=order?detail.total_minor:detail.goods_minor!==null&&detail.shipping_minor!==null?(BigInt(detail.goods_minor)+BigInt(detail.shipping_minor)).toString():null;
 if(order&&detail.status==='RESERVED'){
  const shipping=detail.shipping_address;
  const orderNumber=detail.id.slice(0,8).toUpperCase();
  const lifetime=detail.created_at&&detail.expires_at?Math.max(1,(new Date(detail.expires_at).getTime()-new Date(detail.created_at).getTime())/1000):900;
  const ratio=Math.min(1,secondsLeft/lifetime);
  const locked=busy||!!detail.testPayment;
  const cardIcon=<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>;
  const bankIcon=<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 9 9-5 9 5M5 10v7M10 10v7M14 10v7M19 10v7M3 20h18"/></svg>;
  return <PurchaseFrame page={page} step={2} back={cartHref??backHref} backLabel={cartHref?'Volver al carrito':'Volver a Mis compras'} stepBack={cartHref?{1:cartHref}:undefined} title="Revisa tu pedido" className={styles.dialog+' '+styles.reviewDialog} busy={busy} onClose={onClose}>
   <p className={styles.reviewReference}>Pedido #{orderNumber} · Pendiente de pago</p>
   {notice&&notice!=='Pedido creado. Revisa el resumen y elige cómo pagar.'&&<p className={styles.notice} role="status">{notice}</p>}
   {unknown&&<div className={styles.notice} role="alert"><p>Comprueba si se registró la solicitud antes de continuar.</p><button type="button" disabled={busy} onClick={onRetry}>Comprobar solicitud</button></div>}
   <div className={styles.reviewGrid}>
    <div className={`${styles.reviewSummary} ${flow.reveal}`} style={{'--i':0} as CSSProperties}>
     <h3>Tu compra</h3>
     <ul className={styles.reviewItems}>{items.map((item:any)=>{
      const lineTotal=item.line_total_minor??item.lineTotal;
      return <li key={item.product_id??item.productId}><div><strong>{item.name}</strong><small>Cantidad: {item.quantity}</small></div>{lineTotal!=null&&<b>{storeMoney(lineTotal)}</b>}</li>;
     })}</ul>
     <div className={styles.reviewDelivery}>
      <h4>{shipping?'Envío a domicilio':'Retiro en sucursal'}</h4>
      {shipping&&<p>{shipping.recipient}<br/>{shipping.line1}<br/>{shipping.commune}, {shipping.region}</p>}
      {shipping&&reviewArrival&&<p className={styles.arrivalNote}><strong>Llegada estimada {reviewArrival}</strong> si pagas ahora (días hábiles).</p>}
      {!shipping&&detail.location_name&&<p>{detail.location_name}</p>}
     </div>
     <dl className={styles.reviewTotals}>
      {detail.goods_minor!=null&&<div><dt>Productos</dt><dd>{storeMoney(detail.goods_minor)}</dd></div>}
      <div><dt>{shipping?'Envío':'Retiro'}</dt><dd>{shipping&&detail.shipping_minor!=null?storeMoney(detail.shipping_minor):'Sin costo'}</dd></div>
      <div><dt>Total</dt><dd>{storeMoney(detail.total_minor)}</dd></div>
     </dl>
    </div>
    <div className={`${styles.reviewPayment} ${flow.reveal}`} style={{'--i':1} as CSSProperties}>
     <div className={flow.timer} role="timer" aria-live="off" data-urgent={(secondsLeft>0&&secondsLeft<=120)||undefined} data-lapsed={lapsed||undefined}>
      <div className={flow.timerRow}><span>{lapsed?'La reserva venció':'Reserva de tus productos'}</span>{!lapsed&&<strong>{clock}</strong>}</div>
      {!lapsed&&<div className={flow.bar}><i style={{transform:`scaleX(${ratio})`}}/></div>}
      {!lapsed&&<div className={flow.timerRow}><span>Vence a las {new Intl.DateTimeFormat('es-CL',{timeStyle:'short',timeZone:'America/Santiago'}).format(new Date(detail.expires_at))}</span></div>}
     </div>
     <fieldset className={flow.methods} disabled={locked}>
      <legend>Forma de pago</legend>
      <label className={flow.method}><input type="radio" name="payment-method" value="CARD" checked={method==='CARD'} onChange={()=>setMethod('CARD')}/><span className={flow.methodIcon}>{cardIcon}</span><span><b>Tarjeta</b><small>Con una tarjeta guardada</small></span></label>
      <label className={flow.method}><input type="radio" name="payment-method" value="TRANSFER" checked={method==='TRANSFER'} onChange={()=>setMethod('TRANSFER')}/><span className={flow.methodIcon}>{bankIcon}</span><span><b>Transferencia</b><small>Desde tu banco</small></span></label>
     </fieldset>
     <div className={flow.expand} data-open={method==='CARD'} inert={method!=='CARD'}><div>
      {cards.length>0?<fieldset className={flow.cards} disabled={locked}><legend>Elige tu tarjeta</legend>{cards.map(card=><label key={card.id} className={flow.cardOption}><input type="radio" name="payment-card" value={card.id} checked={cardId===card.id} onChange={()=>setCardId(card.id)}/><span>{card.brand} ···· {card.last_four}<small>{card.label}</small></span>{card.is_default?<em>Predeterminada</em>:<span/>}</label>)}</fieldset>:<button type="button" className={flow.addCard} disabled={busy} onClick={onMethods}>Agregar una tarjeta en Mi cuenta</button>}
     </div></div>
     <button type="button" className={styles.primary} disabled={busy||expired||lapsed||unknown||(method==='CARD'&&!cardId)} onClick={()=>onPay(method,method==='CARD'?cardId:undefined)}>{busy?"Procesando…":`Pagar ${storeMoney(detail.total_minor)}`} <span aria-hidden="true">→</span></button>
     {(expired||lapsed)&&<p className={styles.reservation}>La reserva venció y los productos volvieron a estar disponibles. {cartHref?<Link href={cartHref}>Vuelve al carrito</Link>:'Vuelve al carrito'} para crear el pedido otra vez.</p>}
     <details className={styles.cancel}><summary>Cancelar esta reserva</summary><p>Se liberarán los productos reservados.</p><button type="button" disabled={busy||unknown} onClick={onCancel}>Confirmar cancelación</button></details>
    </div>
   </div>
  </PurchaseFrame>;
 }
 return <PurchaseFrame page={page} back={backHref} title={`${order?'Pedido':'Cotización'} #${detail.id.slice(0,8).toUpperCase()}`} className={styles.dialog} busy={busy} onClose={onClose}>
  <div className={styles.receiptTop}><div><PurchaseStatus status={detail.status} label={order?shipmentLabel(detail.fulfillment,detail.status,detail.shipment?.status):null}/><p>Creado el {date(detail.created_at,true)}</p></div>{total!==null&&<div className={styles.receiptTotal}><small>{order?'Total del pedido':'Total cotizado'}</small><strong>{storeMoney(total)}</strong></div>}</div>
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  <div className={styles.receiptItems}><h3>Productos</h3>{items.map((item:any)=><div key={item.product_id??item.productId}><span><strong>{item.name}</strong><small>{item.quantity} {item.quantity===1?'unidad':'unidades'}{item.sku?` · ${item.sku}`:''}</small></span>{(item.line_total_minor??item.lineTotal)!==undefined&&<b>{storeMoney(item.line_total_minor??item.lineTotal)}</b>}</div>)}</div>
  {!order&&<div className={styles.receiptInfo}><h3>Envío a domicilio</h3>{detail.shipping_minor!==null&&<p>Costo de envío: <strong>{storeMoney(detail.shipping_minor)}</strong></p>}{detail.note&&<p>{detail.note}</p>}{!detail.priced_items&&<p>Los precios de los productos son referenciales hasta que se apruebe la cotización.</p>}{detail.expires_at&&<p>Vigencia: {date(detail.expires_at,true)}</p>}</div>}
  {order&&detail.shipping_address&&<div className={styles.receiptInfo}><h3>Dirección de entrega</h3><p>{detail.shipping_address.recipient}<br/>{detail.shipping_address.line1}<br/>{detail.shipping_address.commune}, {detail.shipping_address.region}</p><p>Productos: {storeMoney(detail.goods_minor)} · Envío: {storeMoney(detail.shipping_minor)}</p></div>}
  {order&&detail.shipping_address&&['PAID','FULFILLED'].includes(detail.status)&&<ShipmentProgress detail={detail}/>}
  {order&&detail.testPayment&&<div className={styles.receiptInfo}><h3>Método de pago</h3><p>{detail.testPayment.method==='CARD'?`${detail.testPayment.card_brand} ···· ${detail.testPayment.card_last_four} · ${detail.testPayment.card_label}`:'Transferencia'}</p></div>}

  {!order&&detail.status==='APPROVED'&&<div className={styles.receiptInfo}><button type="button" className={styles.primary} disabled={busy||unknown||expired} onClick={onCreate}>Crear pedido con este envío <span aria-hidden="true">→</span></button><p>{expired?'La vigencia terminó. Vuelve al carrito para calcular el envío y crear un pedido nuevo.':'Comprobaremos el stock al crear tu pedido. Después podrás continuar al pago.'}</p></div>}
  {unknown&&<div className={styles.notice} role="alert"><p>Comprueba la respuesta antes de volver a crear la solicitud.</p><button type="button" disabled={busy} onClick={onRetry}>Comprobar solicitud</button></div>}
 </PurchaseFrame>;
}
