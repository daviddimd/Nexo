'use client';
import Link from 'next/link';
import type {CustomerProfile,ShippingRate,ShippingEstimate} from './customer-types';
import {productLabel} from '../../catalog/product-label';
import {useEffect,useState,type FormEvent} from 'react';
import Modal from '../panel/modal';
import {ActionIcon} from '../action-icon';
import type {StoreProduct} from './cart-context';
import type {StoreLocation} from './store-catalog';
import styles from './store-cart.module.css';

type Line={product:StoreProduct;quantity:number};
type Props={profile:CustomerProfile|null;request:(path:string,options?:RequestInit)=>Promise<any>;onRegister:()=>void;onDeliveryChange:(value:'pickup'|'shipping')=>void;initialDelivery?:'pickup'|'shipping';slug:string;lines:Line[];locations:StoreLocation[];customer:boolean;busy:boolean;unknown:boolean;notice:string;onClose:()=>void;onQuantity:(id:string,quantity:number)=>void;onRemove:(id:string)=>void;onLogin:()=>void;onPickup:(event:FormEvent<HTMLFormElement>)=>void;onShipping:(event:FormEvent<HTMLFormElement>)=>void;onRetry:()=>void};
const money=(value:bigint|string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
function Bag(){return <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14l1 14H4L5 7Z M8 8V6a4 4 0 0 1 8 0v2"/></svg>}
export default function StoreCart({initialDelivery='pickup',profile,request,onRegister,onDeliveryChange,slug,lines,locations,customer,busy,unknown,notice,onClose,onQuantity,onRemove,onLogin,onPickup,onShipping,onRetry}:Props){
 const [delivery,setDelivery]=useState<'pickup'|'shipping'>(initialDelivery);
 const [estimateRevision,setEstimateRevision]=useState(0);
 const [rates,setRates]=useState<ShippingRate[]>([]),[rateId,setRateId]=useState(''),[estimate,setEstimate]=useState<(ShippingEstimate&{key:string})|null>(null),[calculating,setCalculating]=useState(false),[deliveryError,setDeliveryError]=useState('');
 const items=lines.map(line=>({productId:line.product.id,quantity:line.quantity})),itemsKey=JSON.stringify(items),estimateKey=rateId+':'+itemsKey;
 const selectedRate=rates.find(rate=>rate.id===rateId),currentEstimate=estimate?.key===estimateKey?estimate:null;
 const key=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 useEffect(()=>{const controller=new AbortController();void request(`public/${encodeURIComponent(slug)}/shipping-rates`,{signal:controller.signal}).then(result=>{if(controller.signal.aborted)return;setRates(result.items);const saved=profile?.defaultAddress;if(saved){const match=result.items.find((rate:ShippingRate)=>key(rate.city)===key(saved.commune)&&key(rate.region)===key(saved.region));if(match)setRateId(match.id);}}).catch(error=>{if(!controller.signal.aborted)setDeliveryError(error.message);});return()=>controller.abort();},[slug]);
 // The account may finish loading after returning from the access page.
 useEffect(()=>{if(rateId||!profile?.defaultAddress)return;const saved=profile.defaultAddress;const match=rates.find(rate=>key(rate.city)===key(saved.commune)&&key(rate.region)===key(saved.region));if(match)setRateId(match.id);},[rates,profile?.defaultAddress?.commune,profile?.defaultAddress?.region]);
 useEffect(()=>{
  setEstimate(null);if(delivery!=='shipping'||!rateId||!lines.length){setCalculating(false);return;}
  const controller=new AbortController();setCalculating(true);setDeliveryError('');
  void request(`public/${encodeURIComponent(slug)}/shipping-estimate`,{method:'POST',body:JSON.stringify({rateId,items:JSON.parse(itemsKey)}),signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setEstimate({...result,key:estimateKey});}).catch(error=>{if(!controller.signal.aborted)setDeliveryError(error.message);}).finally(()=>{if(!controller.signal.aborted)setCalculating(false);});return()=>controller.abort();
 },[slug,delivery,rateId,itemsKey,estimateRevision]);
 function changeDelivery(value:'pickup'|'shipping'){setDelivery(value);onDeliveryChange(value);}
 const locked=busy||unknown,units=lines.reduce((sum,line)=>sum+line.quantity,0);
 const subtotal=lines.reduce((sum,line)=>sum+BigInt(line.product.price_minor)*BigInt(line.quantity),0n);
 return <Modal title="Tu carrito" className={styles.dialog} busy={busy} onClose={onClose}>
  {notice&&<p className={styles.notice} role="status" aria-live="polite">{notice}</p>}
  {unknown&&<div className={styles.uncertain} role="alert"><strong>Estamos comprobando tu solicitud</strong><p>Antes de modificar la compra, confirma si se registró. Si recargas la página, revisa tus pedidos antes de repetirla.</p><button type="button" disabled={busy} onClick={onRetry}>Comprobar solicitud</button></div>}
  {!lines.length?<div className={styles.empty}><span><Bag/></span><h3>Tu próxima compra empieza aquí</h3><p>Agrega productos al carrito para revisar tu compra.</p><button type="button" disabled={busy} onClick={onClose}>Explorar productos <span aria-hidden="true">→</span></button></div>:<div className={styles.layout}>
   <div className={styles.products}><div className={styles.listHeading}><h3>Tus productos</h3><span>{units.toLocaleString('es-CL')} {units===1?'unidad':'unidades'}</span></div>
    <ul className={styles.lines}>{lines.map(line=>{
     const label=productLabel(line.product);
     const href=`/tienda/productos/${encodeURIComponent(line.product.id)}?empresa=${encodeURIComponent(slug)}`;
     return <li key={line.product.id} className={styles.line}>
      <Link className={styles.image} href={href} prefetch={false} aria-label={`Ver ${line.product.name}`} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault();}}>{line.product.image_url?<img src={line.product.image_url} alt="" width={100} height={100}/>:<Bag/>}</Link>
      <div className={styles.productInfo}>{label.brand&&<small>{label.brand}</small>}<Link href={href} prefetch={false} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault();}}>{label.title}</Link><span>{money(line.product.price_minor)} <small>por unidad</small></span></div>
      <div className={styles.lineActions}><div className={styles.quantity} role="group" aria-label={`Cantidad de ${line.product.name}`}><button type="button" aria-label={`Restar una unidad de ${line.product.name}`} disabled={locked||line.quantity<=1} onClick={()=>onQuantity(line.product.id,line.quantity-1)}>−</button><input aria-label={`Unidades de ${line.product.name}`} type="number" min={1} max={1000000} step={1} inputMode="numeric" value={line.quantity} disabled={locked} onChange={event=>{const next=Number(event.target.value);if(Number.isInteger(next)&&next>=1&&next<=1000000)onQuantity(line.product.id,next);}}/><button type="button" aria-label={`Sumar una unidad de ${line.product.name}`} disabled={locked||line.quantity>=1000000} onClick={()=>onQuantity(line.product.id,line.quantity+1)}>+</button></div><button type="button" className={styles.remove} disabled={locked} aria-label={`Quitar ${line.product.name} del carrito`} onClick={()=>onRemove(line.product.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>Quitar</button></div>
      <strong className={styles.lineTotal}>{money(BigInt(line.product.price_minor)*BigInt(line.quantity))}</strong>
     </li>;
    })}</ul>
    <button type="button" className={styles.continue} disabled={busy} onClick={onClose}>← Seguir comprando</button>
   </div>
   <aside className={styles.summary}><h3>Resumen de compra</h3><dl className={styles.totals}><div><dt>Productos ({units.toLocaleString('es-CL')})</dt><dd>{money(delivery==='shipping'&&currentEstimate?currentEstimate.goodsMinor:subtotal)}</dd></div><div><dt>{delivery==='shipping'?'Envío':'Retiro en sucursal'}</dt><dd>{delivery==='shipping'?(currentEstimate?money(currentEstimate.shippingMinor):calculating?'Calculando…':'Selecciona ciudad'):'Sin costo de envío'}</dd></div><div className={styles.subtotal}><dt>Total estimado</dt><dd>{delivery==='shipping'?(currentEstimate?money(currentEstimate.totalMinor):'—'):money(subtotal)}</dd></div></dl><p className={styles.priceNote}>Precios en pesos chilenos. Confirmaremos precio y disponibilidad al crear tu pedido.</p>
    <div className={styles.deliveryHeading}><h4>¿Cómo quieres recibirlo?</h4></div><div className={styles.delivery} role="group" aria-label="Método de entrega"><button type="button" disabled={locked} aria-pressed={delivery==='pickup'} onClick={()=>changeDelivery('pickup')}><ActionIcon name="company" size={19}/>Retiro</button><button type="button" disabled={locked} aria-pressed={delivery==='shipping'} onClick={()=>changeDelivery('shipping')}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 5h12v12H2V5ZM14 9h4l4 5v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>Envío</button></div>
    {!customer?<div className={styles.guest}><p>Identifícate o crea una cuenta para guardar tu pedido y continuar con la compra.</p><button type="button" className={styles.primary} disabled={locked} onClick={onLogin}>Iniciar sesión para continuar <span aria-hidden="true">→</span></button><button type="button" className={styles.continue} disabled={locked} onClick={onRegister}>Crear una cuenta</button></div>:<>
     <form hidden={delivery!=='pickup'} onSubmit={onPickup}><fieldset disabled={locked}><label>Sucursal de retiro<select name="location" required defaultValue=""><option value="">Elige una sucursal</option>{locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label><p className={styles.help}>Todos los productos deben estar disponibles en la sucursal elegida.</p>{!locations.length&&<p className={styles.help}>No hay sucursales de retiro disponibles.</p>}<button type="submit" className={styles.primary} disabled={!locations.length}>Crear pedido para retiro <span aria-hidden="true">→</span></button><p className={styles.nextStep}>Después podrás revisar el pedido y continuar al pago.</p></fieldset></form>
     <form hidden={delivery!=='shipping'} onSubmit={onShipping}><fieldset disabled={locked}>
      <label>Ciudad o comuna de entrega<select name="shippingRateId" value={rateId} onChange={event=>setRateId(event.target.value)} required><option value="">Selecciona tu destino</option>{rates.map(rate=><option key={rate.id} value={rate.id}>{rate.city} · {rate.region} — {money(rate.fee_minor)}</option>)}</select></label>
      <p className={styles.help}>{rates.length?'Solo realizamos envíos a los destinos del listado. El costo se calcula al seleccionar tu ciudad.':'Esta tienda aún no tiene destinos de envío habilitados.'}</p>
      {rateId&&<button type="button" className={styles.continue} disabled={locked||calculating} onClick={()=>setEstimateRevision(value=>value+1)}>Actualizar costo de envío</button>}
      {deliveryError&&<p className={styles.notice} role="alert">{deliveryError}</p>}
      <p className={styles.help} role="status" aria-live="polite">{calculating?'Comprobando precio y disponibilidad…':currentEstimate?`Envío: ${money(currentEstimate.shippingMinor)} · Total: ${money(currentEstimate.totalMinor)}`:''}</p>
      {[['recipient','Destinatario','name'],['phone','Teléfono','tel'],['line1','Dirección','street-address']].map(([name,label,autocomplete])=><label key={name}>{label}<input name={name} type={name==='phone'?'tel':'text'} autoComplete={autocomplete} defaultValue={profile?.defaultAddress?.[name as 'recipient'|'phone'|'line1']??(name==='recipient'?profile?.name:name==='phone'?profile?.phone:'')??''} required maxLength={name==='line1'?200:name==='phone'?30:100}/></label>)}
      <input type="hidden" name="commune" value={selectedRate?.city??''}/><input type="hidden" name="region" value={selectedRate?.region??''}/><input type="hidden" name="expectedTotalMinor" value={currentEstimate?.totalMinor??''}/>
      <label className={styles.remember}><input type="checkbox" name="saveAddress" defaultChecked/> Guardar esta dirección en mi cuenta</label>
      <button type="submit" className={styles.primary} disabled={!currentEstimate||calculating||!!deliveryError}>Continuar con envío <span aria-hidden="true">→</span></button><p className={styles.nextStep}>El costo ya está incluido. El siguiente paso es revisar tu pedido y pagar.</p>
     </fieldset></form>
    </>}
   </aside>
  </div>}
 </Modal>;
}
