'use client';
import AnimatedAmount from '../animated-amount';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {IconButton} from '../action-icon';
import ProductSearch from './product-search';
import type {ManagedProduct,ManagedLocation} from './catalog-manager';
import type {SaleLine} from './sales-orders';
import styles from './new-sale-workspace.module.css';

type Props={visible:boolean;lines:SaleLine[];locations:ManagedLocation[];busy:boolean;uncertain:boolean;estimate:string;received:string|null;confirmed:boolean;sequence:number;notice:string;saleId:string;
 request:(path:string,options?:RequestInit)=>Promise<any>;onAdd:(product:ManagedProduct,quantity:number)=>boolean;onRemove:(id:string)=>void;onRefresh:()=>Promise<void>;onReceived:(value:string)=>void;onConfirmed:(value:boolean)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>Promise<void>;onRetry:()=>Promise<void>};
const money=(value:string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
function BoxIcon(){return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 10 9-5m-9 5L3 8m9 5v8M7.5 5.5l9 5"/></svg>;}
function Thumbnail({source}:{source:string|null}){const [failed,setFailed]=useState(false);return <span className={styles.thumbnail}>{source&&!failed?<img src={source} alt="" loading="lazy" width={44} height={44} onError={()=>setFailed(true)}/>:<BoxIcon/>}</span>;}
export default function NewSaleWorkspace({visible,lines,locations,busy,uncertain,estimate,received,confirmed,sequence,notice,saleId,request,onAdd,onRemove,onRefresh,onReceived,onConfirmed,onSubmit,onRetry}:Props){
 const [selected,setSelected]=useState<ManagedProduct|null>(null),[lookup,setLookup]=useState(false),[lookupError,setLookupError]=useState(''),[searchRevision,setSearchRevision]=useState(0);
 const lookupRequest=useRef<AbortController|null>(null);
 useEffect(()=>()=>lookupRequest.current?.abort(),[]);
 // A completed sale clears the product picker as well as the payment form.
 useEffect(()=>{lookupRequest.current?.abort();setSelected(null);setLookup(false);setLookupError('');setSearchRevision(value=>value+1);},[sequence]);
 const locked=busy||uncertain,stores=locations.filter(location=>location.active&&location.kind==='STORE');
 const units=lines.reduce((sum,line)=>sum+line.quantity,0);
 async function search(path:string,options?:RequestInit){return request(path+'&status=active',options);}
 function clearSelection(){lookupRequest.current?.abort();setSelected(null);setLookup(false);setLookupError('');}
 async function choose(id:string){
  lookupRequest.current?.abort();const controller=new AbortController();lookupRequest.current=controller;setLookup(true);setLookupError('');setSelected(null);
  try{const response=await request(`products/${id}`,{signal:controller.signal});if(controller.signal.aborted)return;const product=response.product as ManagedProduct;if(!product?.active)throw new Error('El producto ya no está disponible para agregar.');setSelected(product);}
  catch(error){if(!controller.signal.aborted)setLookupError((error as Error).message);}finally{if(!controller.signal.aborted)setLookup(false);}
 }
 function add(event:FormEvent<HTMLFormElement>){event.preventDefault();if(locked||lookup)return;if(!selected){setLookupError('Selecciona un producto de las sugerencias.');return;}const form=event.currentTarget,quantity=Number(new FormData(form).get('quantity'));if(onAdd(selected,quantity)){form.reset();setSelected(null);setSearchRevision(value=>value+1);setLookupError('');}}
 const mismatch=received!==null&&/^(0|[1-9][0-9]{0,15})$/.test(received)&&BigInt(received)!==BigInt(estimate);
 return <div hidden={!visible} className={styles.workspace}>
  <div data-panel-reveal="new-sale-workspace-0" className={styles.heading}><div><h2>Nueva venta</h2><p>Registra el pago recibido y los productos entregados en sucursal.</p></div><div className={styles.headingActions}><span className={styles.localBadge}>Venta local</span><IconButton icon="refresh" label="Actualizar precios del catálogo y la venta" disabled={locked} onClick={()=>void onRefresh()}/></div></div>
  {notice&&<div className={`${styles.notice} ${uncertain?styles.warning:''}`} role="status" aria-live="polite"><span>{notice}</span>{uncertain&&<button disabled={busy} onClick={()=>void onRetry()}>Reintentar comprobación</button>}</div>}
  <div className={styles.layout}>
   <div data-panel-reveal="new-sale-workspace-1" className={styles.cart}>
    <div className={styles.cardHeading}><h3>Productos de la venta</h3><span>{lines.length} {lines.length===1?'producto':'productos'} · {units.toLocaleString('es-CL')} {units===1?'unidad':'unidades'}</span></div>
    <form className={styles.picker} onSubmit={add}><fieldset disabled={locked||lookup}>
     <label className={styles.search}>Buscar producto<ProductSearch key={searchRevision} defaultValue="" request={search} onValueChange={clearSelection} onSelect={(_sku,_form,item)=>void choose(item.id)}/></label>
     <label>Unidades<input name="quantity" type="number" min={1} max={1000000} step={1} defaultValue={1} required/></label><button type="submit" className={styles.add} disabled={!selected||lookup}>Agregar <span aria-hidden="true">＋</span></button>
    </fieldset>{lookup&&<p className={styles.pickerMessage} role="status">Cargando producto…</p>}{lookupError&&<p className={styles.pickerError} role="alert">{lookupError}</p>}
    {selected&&<div className={styles.selection}><Thumbnail key={selected.image_url} source={selected.image_url}/><div><strong>{selected.name}</strong><small>{selected.sku}</small></div><span>{money(selected.price_minor)}<small>por unidad</small></span></div>}
    </form>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Productos incluidos en la venta"><table className={styles.table}><thead><tr><th scope="col">Producto</th><th scope="col" className={styles.quantity}>Unidades</th><th scope="col" className={styles.amount}>Precio unitario</th><th scope="col" className={styles.amount}>Subtotal</th><th scope="col" className={styles.removeCell}><span className={styles.srOnly}>Quitar producto</span></th></tr></thead><tbody>
     {lines.map(line=><tr key={line.product.id}><td><div className={styles.product}><Thumbnail key={line.product.image_url} source={line.product.image_url}/><div><strong>{line.product.name}</strong><small>{line.product.sku}</small></div></div></td><td className={styles.quantity}>{line.quantity.toLocaleString('es-CL')}</td><td className={styles.amount}>{money(line.product.price_minor)}</td><td className={`${styles.amount} ${styles.subtotal}`}>{money((BigInt(line.product.price_minor)*BigInt(line.quantity)).toString())}</td><td className={styles.removeCell}><button type="button" disabled={locked} onClick={()=>onRemove(line.product.id)} className={styles.remove} aria-label={`Quitar ${line.product.name}`} title="Quitar producto"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M7 17 17 7"/></svg></button></td></tr>)}
     {!lines.length&&<tr><td colSpan={5}><div className={styles.empty}><BoxIcon/><h3>{saleId?'Listo para una nueva venta':'Comienza con un producto'}</h3><p>Busca por nombre o SKU, elige las unidades y agrégalo a la venta.</p></div></td></tr>}
    </tbody></table></div>
    <p className={styles.cartNote}>Los precios y el stock se comprueban al registrar la venta.</p>
   </div>
   <aside data-panel-reveal="new-sale-workspace-2" className={styles.checkout} aria-label="Resumen y pago de la venta">
    <div className={styles.cardHeading}><h3>Resumen de la venta</h3><span>CLP</span></div>
    <div className={styles.total}><span>Total estimado</span><strong><AnimatedAmount value={estimate} active={visible}/></strong><small>{units.toLocaleString('es-CL')} {units===1?'unidad':'unidades'} en la venta</small></div>
    <form key={sequence} className={styles.checkoutForm} onSubmit={onSubmit}><fieldset disabled={locked}>
     <label>Sucursal de venta<select name="location" required><option value="">Selecciona una sucursal</option>{stores.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
     {!stores.length&&<p className={styles.pickerError}>Necesitas una sucursal activa asignada para registrar la venta.</p>}
     <h4>Pago recibido</h4>
     <label>Importe recibido (CLP)<input name="amount" type="text" inputMode="numeric" pattern="(0|[1-9][0-9]{0,15})" maxLength={16} required value={received??estimate} onChange={event=>onReceived(event.target.value)} aria-describedby={mismatch?'sale-amount-hint':undefined}/></label>
     {mismatch&&<p id="sale-amount-hint" className={styles.pickerError}>El importe debe coincidir con el total de la venta.</p>}
     <label>Medio de pago<select name="method"><option value="CASH">Efectivo</option><option value="CARD">Tarjeta · cobro externo</option><option value="TRANSFER">Transferencia</option></select></label>
     <label>Referencia del pago<input name="reference" required minLength={3} maxLength={120} placeholder="N.º de comprobante o referencia"/></label>
     <div className={styles.commit}><label className={styles.confirmation}><input type="checkbox" required checked={confirmed} onChange={event=>onConfirmed(event.target.checked)}/><span>Confirmo que recibí el pago y entregué los productos.</span></label><button className={styles.submit} type="submit" disabled={!lines.length||!stores.length||!confirmed||mismatch}>{busy?'Registrando…':'Registrar venta'}<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button><p>Este registro no realiza cargos al cliente.</p></div>
    </fieldset></form>
   </aside>
  </div>
 </div>;
}
