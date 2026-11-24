'use client';
import Link from 'next/link';
import type {CustomerProfile,ShippingRate,ShippingEstimate} from './customer-types';
import {storeCartPath,storeHome} from '../../catalog/store-access-paths';
import {productLabel} from '../../catalog/product-label';
import {useEffect,useId,useRef,useState,type CSSProperties,type FormEvent,type ReactNode} from 'react';
import {CheckoutPage,CheckoutSteps} from './checkout-steps';
import flow from './checkout-flow.module.css';
import SmoothMoney,{SwapText} from './smooth-money';
import useCartPopover from './use-cart-popover';
import {ActionIcon} from '../action-icon';
import type {StoreProduct} from './cart-context';
import {chileDestinationKey, findChileRegion} from '../../catalog/chile-destinations';
import {deliveryWindow, describeWindow} from '../../catalog/delivery-window';
import type {StoreLocation} from './store-catalog';
import styles from './store-cart.module.css';

type Line={product:StoreProduct;quantity:number};
type Props={fullPage?:boolean;profile:CustomerProfile|null;request:(path:string,options?:RequestInit)=>Promise<any>;onRegister:()=>void;onDeliveryChange:(value:'pickup'|'shipping')=>void;initialDelivery?:'pickup'|'shipping';slug:string;lines:Line[];locations:StoreLocation[];customer:boolean;busy:boolean;unknown:boolean;notice:string;onClose:()=>void;onQuantity:(id:string,quantity:number)=>void;onRemove:(id:string)=>void;onLogin:()=>void;onPickup:(event:FormEvent<HTMLFormElement>)=>void;onShipping:(event:FormEvent<HTMLFormElement>)=>void;onRetry:()=>void};
const money=(value:bigint|string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
function Bag(){return <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14l1 14H4L5 7Z M8 8V6a4 4 0 0 1 8 0v2"/></svg>}
export default function StoreCart({fullPage=false,initialDelivery='pickup',profile,request,onRegister,onDeliveryChange,slug,lines,locations,customer,busy,unknown,notice,onClose:onDismiss,onQuantity,onRemove,onLogin,onPickup,onShipping,onRetry}:Props){
 const heading=useId();
 const pickupForm=heading+"-pickup", shippingForm=heading+"-shipping";
 const [showAddresses,setShowAddresses]=useState(false);
 const [delivery,setDelivery]=useState<'pickup'|'shipping'>(initialDelivery);
 const [addressId,setAddressId]=useState(profile?.addresses?.find(entry=>entry.isDefault)?.id??'');
 const [addressTouched,setAddressTouched]=useState(false);
 const selectedAddress=profile?.addresses?.find(entry=>entry.id===addressId)?.address??(!addressTouched?profile?.defaultAddress:null);
 useEffect(()=>{if(!addressTouched&&profile?.addresses)setAddressId(profile.addresses.find(entry=>entry.isDefault)?.id??'');},[profile?.addresses,addressTouched]);
 const [estimateRevision,setEstimateRevision]=useState(0);
 const [coverageLoaded,setCoverageLoaded]=useState(false);
 const [coverageRevision,setCoverageRevision]=useState(0);
 const [coverageError,setCoverageError]=useState(false);
 const [rates,setRates]=useState<ShippingRate[]>([]),[rateId,setRateId]=useState(''),[estimate,setEstimate]=useState<(ShippingEstimate&{key:string})|null>(null),[calculating,setCalculating]=useState(false),[deliveryError,setDeliveryError]=useState('');
 const items=lines.map(line=>({productId:line.product.id,quantity:line.quantity})),itemsKey=JSON.stringify(items),estimateKey=rateId+':'+itemsKey;
 const selectedRate=rates.find(rate=>rate.id===rateId),currentEstimate=estimate?.key===estimateKey?estimate:null,arrival=describeWindow(currentEstimate?deliveryWindow(Date.now(),currentEstimate.deliveryDaysMin,currentEstimate.deliveryDaysMax):null);
 const regionName=(name:string)=>findChileRegion(name)?.name??name;
 const [regionOverride,setRegionOverride]=useState<string|null>(null);
 const selectedRegion=selectedRate?regionName(selectedRate.region):regionOverride??(selectedAddress?regionName(selectedAddress.region):'');
 const coveredRegions=[...new Set(rates.map(rate=>regionName(rate.region)))].sort((a,b)=>a.localeCompare(b,'es-CL'));
 const matchingRate=(rate:ShippingRate,saved:{commune:string;region:string})=>chileDestinationKey(rate.region,rate.city)===chileDestinationKey(saved.region,saved.commune);
 useEffect(()=>{
  if(!fullPage)return;
  const controller=new AbortController();
  setCoverageError(false);
  setCoverageLoaded(false);
  void request(`public/${encodeURIComponent(slug)}/shipping-rates`,{signal:controller.signal})
   .then(result=>{if(!controller.signal.aborted){setRates(result.items);setCoverageLoaded(true);}})
   .catch(()=>{if(!controller.signal.aborted)setCoverageError(true);});
  return()=>controller.abort();
 },[slug,fullPage,coverageRevision]);
 // The account may finish loading after returning from the access page.
 useEffect(()=>{if(!selectedAddress)return;const saved=selectedAddress;const match=rates.find(rate=>matchingRate(rate,saved));setRateId(match?.id??'');},[rates,selectedAddress?.commune,selectedAddress?.region]);
 useEffect(()=>{
  setEstimate(null);setDeliveryError('');if(!fullPage||delivery!=='shipping'||!rateId||!lines.length){setCalculating(false);return;}
  const controller=new AbortController();setCalculating(true);
  void request(`public/${encodeURIComponent(slug)}/shipping-estimate`,{method:'POST',body:JSON.stringify({rateId,items:JSON.parse(itemsKey)}),signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setEstimate({...result,key:estimateKey});}).catch(error=>{if(!controller.signal.aborted)setDeliveryError(error.message);}).finally(()=>{if(!controller.signal.aborted)setCalculating(false);});return()=>controller.abort();
 },[slug,fullPage,delivery,rateId,itemsKey,estimateRevision]);
 function changeDelivery(value:'pickup'|'shipping'){setDelivery(value);onDeliveryChange(value);}
 const savedDelivery=Boolean(selectedAddress);
 const locked=busy||unknown,units=lines.reduce((sum,line)=>sum+line.quantity,0);
 const subtotal=lines.reduce((sum,line)=>sum+BigInt(line.product.price_minor)*BigInt(line.quantity),0n);
 const [leaving,setLeaving]=useState<string[]>([]);
 const lastArrival=useRef('');
 const [submitted,setSubmitted]=useState(false);
 // En el mini carrito el aviso de "agregado" se muestra sobre el propio producto, no como un banner aparte.
 const addedSuffix=' agregado al carrito.';
 const addedName=!fullPage&&notice.endsWith(addedSuffix)?notice.slice(0,-addedSuffix.length):'';
 useEffect(()=>{if(!busy&&!unknown)setSubmitted(false);},[busy,unknown]);
 // Mientras se calcula el envío se mantiene el último total en pantalla, en vez de borrarlo.
 const lastTotal=useRef<bigint|null>(null);
 const totalValue:bigint|null=delivery==='shipping'?(currentEstimate?BigInt(currentEstimate.totalMinor):calculating?lastTotal.current:null):subtotal;
 if(totalValue!==null)lastTotal.current=totalValue;
 if(arrival)lastArrival.current=arrival;
 function leave(id:string){if(locked||leaving.includes(id))return;setLeaving(value=>[...value,id]);setTimeout(()=>{onRemove(id);setLeaving(value=>value.filter(item=>item!==id));},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:260);}
 const body=<>
  {notice&&<p className={addedName?styles.srOnly:styles.notice} role="status" aria-live="polite">{notice}</p>}
  {unknown&&<div className={styles.uncertain} role="alert"><strong>Estamos comprobando tu solicitud</strong><p>Antes de modificar la compra, confirma si se registró. Si recargas la página, revisa tus pedidos antes de repetirla.</p><button type="button" disabled={busy} onClick={onRetry}>Comprobar solicitud</button></div>}
  {!lines.length?<div className={styles.empty}><span><Bag/></span><h3>Tu próxima compra empieza aquí</h3><p>Agrega productos al carrito para revisar tu compra.</p>{fullPage?<Link className={styles.continue} href={storeHome(slug)}>Explorar productos →</Link>:<button type="button" disabled={busy} onClick={onDismiss}>Explorar productos <span aria-hidden="true">→</span></button>}</div>:<div className={styles.layout}>
   <div className={styles.checkoutMain}><div className={`${styles.products} ${fullPage?flow.reveal:''}`} style={{'--i':0} as CSSProperties}><div className={styles.listHeading}><h3>Tus productos</h3><span>{units.toLocaleString('es-CL')} {units===1?'unidad':'unidades'}</span></div>
    <ul className={styles.lines}>{lines.map((line,index)=>{
     const label=productLabel(line.product);
     const href=`/tienda/productos/${encodeURIComponent(line.product.id)}?empresa=${encodeURIComponent(slug)}`;
     return <li key={line.product.id} className={`${styles.line} ${fullPage?flow.reveal:''}`} data-leaving={leaving.includes(line.product.id)||undefined} data-added={(addedName&&line.product.name===addedName)||undefined} style={{'--i':index} as CSSProperties}>
      <Link className={styles.image} href={href} prefetch={false} aria-label={`Ver ${line.product.name}`} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault();}}>{line.product.image_url?<img src={line.product.image_url} alt="" width={100} height={100}/>:<Bag/>}</Link>
      <div className={styles.productInfo}>{addedName&&line.product.name===addedName&&<span className={styles.addedChip}>Agregado</span>}{label.brand&&<small>{label.brand}</small>}<Link href={href} prefetch={false} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault();}}>{label.title}</Link><span>{money(line.product.price_minor)} <small>por unidad</small></span></div>
      <div className={styles.lineActions}><div className={styles.quantity} role="group" aria-label={`Cantidad de ${line.product.name}`}><button type="button" aria-label={`Restar una unidad de ${line.product.name}`} disabled={locked||line.quantity<=1} onClick={()=>onQuantity(line.product.id,line.quantity-1)}>−</button><input aria-label={`Unidades de ${line.product.name}`} type="number" min={1} max={1000000} step={1} inputMode="numeric" value={line.quantity} disabled={locked} onChange={event=>{const next=Number(event.target.value);if(Number.isInteger(next)&&next>=1&&next<=1000000)onQuantity(line.product.id,next);}}/><button type="button" aria-label={`Sumar una unidad de ${line.product.name}`} disabled={locked||line.quantity>=1000000} onClick={()=>onQuantity(line.product.id,line.quantity+1)}>+</button></div><button type="button" className={styles.remove} disabled={locked} aria-label={`Quitar ${line.product.name} del carrito`} onClick={()=>leave(line.product.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>Quitar</button></div>
      <strong className={styles.lineTotal}><SmoothMoney value={BigInt(line.product.price_minor)*BigInt(line.quantity)}/></strong>
     </li>;
    })}</ul>
    {fullPage&&!locked&&<Link className={styles.continue} href={storeHome(slug)}>← Seguir comprando</Link>}
   </div>
   {fullPage&&<section className={`${styles.deliveryPanel} ${flow.reveal}`} style={{'--i':2} as CSSProperties}><h3>Entrega</h3>
    <div className={styles.deliveryHeading}><h4>¿Cómo quieres recibirlo?</h4></div><div className={styles.delivery} role="group" aria-label="Método de entrega"><button type="button" disabled={locked} aria-pressed={delivery==='pickup'} onClick={()=>changeDelivery('pickup')}><ActionIcon name="company" size={19}/>Retiro</button><button type="button" disabled={locked} aria-pressed={delivery==='shipping'} onClick={()=>changeDelivery('shipping')}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 5h12v12H2V5ZM14 9h4l4 5v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>Envío</button></div>
    {!customer?<div className={styles.guest}><p>Identifícate o crea una cuenta para guardar tu pedido y continuar con la compra.</p><button type="button" className={styles.continue} disabled={locked} onClick={onRegister}>Crear una cuenta</button></div>:<>
     <form id={pickupForm} hidden={delivery!=='pickup'} onSubmit={event=>{setSubmitted(true);onPickup(event);}}><fieldset disabled={locked}><label>Sucursal de retiro<select name="location" required defaultValue=""><option value="">Elige una sucursal</option>{locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label><p className={styles.help}>Todos los productos deben estar disponibles en la sucursal elegida.</p>{!locations.length&&<p className={styles.help}>No hay sucursales de retiro disponibles.</p>}</fieldset></form>
     <form id={shippingForm} hidden={delivery!=='shipping'} onSubmit={event=>{setSubmitted(true);onShipping(event);}}><fieldset disabled={locked}>
      {(savedDelivery||!!profile?.addresses?.length)&&<div className={styles.savedAddress}>
       {selectedAddress&&<div><strong>{selectedAddress.line1}</strong><p>{selectedAddress.commune}, {regionName(selectedAddress.region)}</p><p>{selectedAddress.recipient} · {selectedAddress.phone}</p></div>}
       <div className={styles.addressActions}>{!!profile?.addresses?.length&&<button type="button" onClick={()=>setShowAddresses(value=>!value)} aria-expanded={showAddresses}>{savedDelivery?"Cambiar":"Elegir dirección guardada"}</button>}{savedDelivery&&<button type="button" onClick={()=>{setAddressTouched(true);setAddressId("");setRateId("");setRegionOverride("");setShowAddresses(false);}}>Usar otra dirección</button>}</div>
      {showAddresses&&!!profile?.addresses?.length&&<label>Dirección guardada<select value={addressId} onChange={event=>{
       setAddressTouched(true);setAddressId(event.target.value);setRegionOverride(null);setShowAddresses(false);
       const entry=profile.addresses.find(item=>item.id===event.target.value);
       const match=entry?rates.find(rate=>matchingRate(rate,entry.address)):null;
       setRateId(match?.id??'');
      }}><option value="">Usar otra dirección</option>{profile.addresses.map(entry=><option key={entry.id} value={entry.id}>{entry.label} · {entry.address.commune}{entry.isDefault?' · Predeterminada':''}</option>)}</select></label>}</div>}
      {savedDelivery?<><input type="hidden" name="shippingRateId" value={rateId}/>{!rateId&&!coverageError&&<p className={styles.help}>{coverageLoaded?"Esta dirección no tiene cobertura. Cambia la dirección o elige retiro.":"Comprobando cobertura…"}</p>}</>:<>
      <div className={styles.destinationGrid}><label>Región de entrega<select value={coveredRegions.includes(selectedRegion)?selectedRegion:""} onChange={event=>{setRegionOverride(event.target.value);setRateId("");}} required><option value="">Selecciona una región con cobertura</option>{coveredRegions.map(region=><option key={region}>{region}</option>)}</select></label>
      <label>Ciudad o comuna de entrega<select name="shippingRateId" value={rateId} onChange={event=>setRateId(event.target.value)} required disabled={!coveredRegions.includes(selectedRegion)}><option value="">Selecciona una comuna</option>{rates.filter(rate=>regionName(rate.region)===selectedRegion).map(rate=><option key={rate.id} value={rate.id}>{rate.city}</option>)}</select></label></div>
      {!coverageError&&<p className={styles.help}>{rates.length?'El costo se calcula al elegir la comuna.':coverageLoaded?'Esta tienda aún no tiene destinos de envío habilitados.':'Cargando destinos…'}</p>}</>}
      {coverageError&&<p className={styles.help} role="alert">No pudimos cargar la cobertura. <button type="button" className={styles.continue} onClick={()=>setCoverageRevision(value=>value+1)}>Reintentar</button></p>}
      {rateId&&deliveryError&&<button type="button" className={styles.continue} disabled={locked||calculating} onClick={()=>setEstimateRevision(value=>value+1)}>Reintentar cálculo</button>}
      {deliveryError&&<p className={styles.notice} role="alert">{deliveryError}</p>}
      <p className={styles.help} role="status" aria-live="polite">{calculating?'Comprobando precio y disponibilidad…':''}</p>
      {selectedAddress?<>{(['recipient','phone','line1'] as const).map(name=><input key={name} type="hidden" name={name} value={selectedAddress[name]}/>)}</>:<div className={styles.destinationGrid}>{[['recipient','Destinatario','name'],['phone','Teléfono','tel'],['line1','Dirección','street-address']].map(([name,label,autocomplete])=><label key={addressId+name}>{label}<input name={name} type={name==='phone'?'tel':'text'} autoComplete={autocomplete} defaultValue={(name==='recipient'?profile?.name:name==='phone'?profile?.phone:'')??''} required maxLength={name==='line1'?200:name==='phone'?30:100}/></label>)}</div>}
      <input type="hidden" name="commune" value={selectedRate?.city??''}/><input type="hidden" name="region" value={selectedRate?.region??''}/><input type="hidden" name="expectedTotalMinor" value={currentEstimate?.totalMinor??''}/>
      {!savedDelivery&&<label className={styles.remember}><input type="checkbox" name="saveAddress"/> Guardar esta dirección en mi cuenta</label>}

     </fieldset></form>
    </>}
   </section>}
   </div>
   {fullPage&&<aside className={`${styles.summary} ${flow.reveal}`} style={{'--i':1} as CSSProperties}><h3>Resumen de compra</h3><dl className={styles.totals}><div><dt>Productos ({units.toLocaleString('es-CL')})</dt><dd><SmoothMoney value={delivery==='shipping'&&currentEstimate?BigInt(currentEstimate.goodsMinor):subtotal}/></dd></div><div><dt><SwapText text={delivery==='shipping'?'Envío':'Retiro en sucursal'}/></dt><dd><SmoothMoney value={delivery==='shipping'&&currentEstimate?BigInt(currentEstimate.shippingMinor):null} text={delivery==='shipping'?(calculating?'Calculando…':'Por calcular'):'Sin costo de envío'}/></dd></div><div className={styles.subtotal}><dt>Total estimado</dt><dd><SmoothMoney value={totalValue}/></dd></div></dl><div className={flow.collapse} data-open={delivery==='shipping'&&!!arrival}><div><p className={styles.arrival}><strong>Llega {lastArrival.current}</strong><span>Si pagas hoy · plazo en días hábiles</span></p></div></div>

    {customer?<button type="submit" form={delivery==="shipping"?shippingForm:pickupForm} className={styles.primary} disabled={locked||(delivery==="shipping"?(!currentEstimate||calculating||!!deliveryError):!locations.length)}>{submitted&&locked?'Reservando tus productos…':'Revisar pedido'} <span aria-hidden="true">→</span></button>:<button type="button" className={styles.primary} disabled={locked} onClick={onLogin}>Iniciar sesión para continuar <span aria-hidden="true">→</span></button>}
    <ul className={styles.assurances}><li>Revisas el pedido antes de pagar</li><li>Reservamos tus productos mientras pagas</li></ul>
   </aside>}
  </div>}
  {!fullPage&&lines.length>0&&<div className={styles.miniFooter}>
   <div className={styles.miniTotal}><span>Subtotal</span><strong><SmoothMoney value={subtotal}/></strong></div>
   {!locked&&<Link className={`${styles.primary} ${styles.openCart}`} href={storeCartPath(slug)} onClick={onDismiss}>Ir al carrito <span aria-hidden="true">→</span></Link>}
  </div>}
 </>;
 return fullPage
  ? <CheckoutPage><section id="carrito" className={styles.cartPage} aria-labelledby={heading}><CheckoutSteps current={1}/><h1 id={heading}>Tu carrito</h1>{body}</section></CheckoutPage>
  : <CartPopover heading={heading} units={units} busy={busy} onDismiss={onDismiss}>{body}</CartPopover>;
}

function CartPopover({heading,units,busy,onDismiss,children}:{heading:string;units:number;busy:boolean;onDismiss:()=>void;children:ReactNode}) {
 const {panel,close:onClose}=useCartPopover(busy,onDismiss);
 return <div ref={panel} id="store-cart-popover" popover="manual" role="dialog" aria-modal="false" aria-labelledby={heading} className={styles.popover}>
  <header className={styles.popoverHeader}><div><h2 id={heading}>Tu carrito</h2><span>{units} {units===1?'producto':'productos'}</span></div><button type="button" data-cart-close disabled={busy} onClick={onClose} aria-label="Cerrar carrito"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
  <div className={styles.popoverBody}>
  {children}
 </div></div>;
}
