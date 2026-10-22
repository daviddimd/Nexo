'use client';
import {IconButton} from '../action-icon';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Modal from './modal';
import AftersalesManager from './aftersales-manager';
import OrdersWorkspace from './orders-workspace';
import NewSaleWorkspace from './new-sale-workspace';
import managementStyles from './management-workspace.module.css';
import type {ManagedProduct,ManagedLocation} from './catalog-manager';
export type Order={id:string;status:string;channel:string;fulfillment:string;location_id:string;total_minor:string;created_at:string;expires_at:string;goods_minor?:string;shipping_minor?:string;payment_reference?:string;items?:{product_id:string;name:string;sku:string;quantity:number;line_total_minor:string}[];events?:{id:string;type:string;reason:string;created_at:string}[]};
type After={refundState:string;withdrawn:boolean;orderPaymentRefundedMinor:string};
export type SaleLine={product:ManagedProduct;quantity:number};
type Props={role:string;view:'sales'|'orders'|null;products:ManagedProduct[];locations:ManagedLocation[];busy:boolean;setBusy:(v:boolean)=>void;
 request:(path:string,options?:RequestInit)=>Promise<any>;reload:()=>Promise<void>};
const labels:Record<string,string>={RESERVED:'Reservado',PAID:'Pagado',FULFILLED:'Completado',CANCELLED:'Cancelado',EXPIRED:'Vencido'};
const money=(v:string|number)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(v));
export default function SalesOrders({role,view,products,locations,busy,setBusy,request,reload}:Props){
 const [lines,setLines]=useState<SaleLine[]>([]),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false),[saleId,setSaleId]=useState(''),[sequence,setSequence]=useState(0);
 const [orders,setOrders]=useState<Order[]>([]),[page,setPage]=useState(0),[selected,setSelected]=useState<Order|null>(null),[after,setAfter]=useState<After|null>(null);
 const [received,setReceived]=useState<string|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const pending=useRef<{body:string;key:string}|null>(null),saving=useRef(false);
 const estimate=lines.reduce((sum,line)=>sum+BigInt(line.product.price_minor)*BigInt(line.quantity),0n).toString();
 useEffect(()=>{if(!uncertain)setLines(current=>current.map(line=>({...line,product:products.find(p=>p.id===line.product.id)??line.product})));},[products,uncertain]);
 useEffect(()=>{setConfirmed(false);},[estimate]);
 async function list(p=page){const v=await request(`orders?limit=25&offset=${p*25}`);setOrders(v.items);setPage(p);}
 async function detail(id:string){const order=await request(`orders/${id}`);setSelected(order);setAfter(null);try{setAfter(await request(`orders/${id}/aftersales`));}catch{setNotice('Pedido cargado. No se pudo consultar su posventa; actualiza antes de entregarlo.');}}
 async function refreshOrders(p=page){setBusy(true);setNotice('');try{await list(p);}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{if(view==='orders')void refreshOrders();},[view]);
 function addProduct(product:ManagedProduct,quantity:number){
  if(busy||uncertain||saving.current)return false;
  if(!product.active||!Number.isInteger(quantity)||quantity<1){setNotice('Selecciona un producto activo y una cantidad válida.');return false;}
  const old=lines.find(line=>line.product.id===product.id);
  if((old?.quantity??0)+quantity>1000000){setNotice('Máximo un millón de unidades por producto.');return false;}
  if(!old&&lines.length>=50){setNotice('Máximo 50 productos por venta.');return false;}
  setLines(current=>old?current.map(line=>line.product.id===product.id?{...line,product,quantity:line.quantity+quantity}:line):[...current,{product,quantity}]);setConfirmed(false);setNotice('');return true;
 }
 async function refreshSale(){
  if(busy||uncertain||saving.current)return;setBusy(true);setNotice('');
  try{
   const refreshed=await Promise.all(lines.map(async line=>{const detail=await request(`products/${line.product.id}`);return detail.product as ManagedProduct;}));
   const current=new Map(refreshed.map(product=>[product.id,product]));
   setLines(previous=>previous.map(line=>({...line,product:current.get(line.product.id)??line.product})));setConfirmed(false);await reload();
  }catch(error){setNotice((error as Error).message);}finally{setBusy(false);}
 }
 async function sendSale(){if(saving.current||!pending.current)return;saving.current=true;setBusy(true);setNotice('');
  try{const result=await request('sales',{method:'POST',headers:{'idempotency-key':pending.current.key},body:pending.current.body});setSaleId(result.id);pending.current=null;setUncertain(false);setLines([]);setReceived(null);setSequence(s=>s+1);setConfirmed(false);setNotice(`Venta registrada: ${result.id}. Pago y entrega confirmados.`);try{await reload();}catch{setNotice(`Venta registrada: ${result.id}. Actualiza el catálogo para consultar las existencias.`);}}
  catch(error){const e=error as Error&{status?:number};setUncertain(!e.status);setNotice(e.status?e.message:'Se perdió la respuesta. No cambies la venta: reintenta con la misma clave para comprobarla sin duplicar stock.');}
  finally{saving.current=false;setBusy(false);}
 }
 async function sale(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy||uncertain||saving.current)return;const f=new FormData(event.currentTarget);if(!lines.length){setNotice('Agrega al menos un producto.');return;}
  const body=JSON.stringify({locationId:f.get('location'),items:lines.map(l=>({productId:l.product.id,quantity:l.quantity})),payment:{amountMinor:String(f.get('amount')),method:f.get('method'),reference:f.get('reference')}});
  if(pending.current?.body!==body)pending.current={body,key:crypto.randomUUID()};await sendSale();
 }
 async function open(id:string){setBusy(true);setNotice('');try{await detail(id);}catch(error){setSelected(null);setAfter(null);setNotice((error as Error).message);}finally{setBusy(false);}}
 async function act(event:FormEvent<HTMLFormElement>,action:'manual-payment'|'cancel'|'fulfill'){
  event.preventDefault();if(!selected||saving.current)return;const f=new FormData(event.currentTarget),id=selected.id;
  const body=action==='manual-payment'?{amountMinor:f.get('amount'),method:f.get('method'),reference:f.get('reference')}:action==='cancel'?{reason:f.get('reason')}:{};
  saving.current=true;setBusy(true);setNotice('');let applied=false;
  try{await request(`orders/${id}/${action}`,{method:'POST',body:JSON.stringify(body)});applied=true;setNotice('Cambio registrado.');await detail(id);await list();await reload();}
  catch(error){setNotice(applied?'Cambio registrado, pero no se pudo actualizar la pantalla. Actualiza el pedido antes de repetir.':`${(error as Error).message}. Consulta el estado del pedido antes de reintentar.`);}
  finally{saving.current=false;setBusy(false);}
 }
 return <div hidden={view===null} className={`sales-workspace ${view==='orders'||view==='sales'?managementStyles.workspace:''}`}>{notice&&view!=='sales'&&<p className={managementStyles.notice} role="status" aria-live="polite">{notice}</p>}
 <NewSaleWorkspace visible={view==='sales'} lines={lines} locations={locations} busy={busy} uncertain={uncertain} estimate={estimate} received={received} confirmed={confirmed} sequence={sequence} notice={notice} saleId={saleId} request={request} onAdd={addProduct} onRemove={id=>{if(busy||uncertain||saving.current)return;setLines(current=>current.filter(line=>line.product.id!==id));setConfirmed(false);}} onRefresh={refreshSale} onReceived={setReceived} onConfirmed={setConfirmed} onSubmit={sale} onRetry={sendSale}/>
 <div hidden={view!=='orders'} className={managementStyles.workspace}><OrdersWorkspace orders={orders} locations={locations} page={page} busy={busy} onRefresh={()=>refreshOrders()} onPage={refreshOrders} onOpen={open}>
 {selected&&view==='orders'&&<Modal title={`Pedido ${selected.id.slice(0,8)}`} busy={busy} onClose={()=>{setSelected(null);setAfter(null);}}><div className={managementStyles.detail}><p role="status" aria-live="polite">{notice}</p><div className="section-heading"><IconButton icon="refresh" label="Actualizar detalle" disabled={busy} onClick={()=>open(selected.id)}/></div><div className={managementStyles.detailSummary}><div><span className={`${managementStyles.badge} ${selected.status==='PAID'?managementStyles.info:selected.status==='FULFILLED'?managementStyles.positive:managementStyles.neutral}`}>{labels[selected.status]??selected.status}</span><small>{selected.id}</small></div><strong>{money(selected.total_minor)}</strong></div><p>Posventa: {after?`${after.refundState==='NONE'?'Sin reembolsos':after.refundState==='FULL'?'Reembolso completo':'Reembolso parcial'}${after.withdrawn?' · Retiro registrado':''}`:'No disponible'}</p>
 <ul>{selected.items?.map(l=><li key={l.product_id}>{l.sku} · {l.name} × {l.quantity} — {money(l.line_total_minor)}</li>)}</ul><p>Productos: {money(selected.goods_minor??selected.total_minor)} · Envío: {money(selected.shipping_minor??'0')}</p>{selected.payment_reference&&<p>Referencia de pago: {selected.payment_reference}</p>}
 {selected.status==='RESERVED'&&<><p>Reserva hasta {new Date(selected.expires_at).toLocaleString('es-CL')}. Actualiza antes de confirmar el pago si ha pasado ese plazo.</p><h3>Registrar pago recibido</h3><form onSubmit={e=>act(e,'manual-payment')}><fieldset disabled={busy}><label>Monto recibido CLP<input name="amount" inputMode="numeric" pattern="(0|[1-9][0-9]{0,15})" defaultValue={selected.total_minor} required/></label><label>Medio de pago<select name="method"><option value="CASH">Efectivo</option><option value="CARD">Tarjeta</option><option value="TRANSFER">Transferencia</option></select></label><label>Referencia del pago<input name="reference" minLength={3} maxLength={120} required/></label><label><input type="checkbox" required/> Confirmo que el pago ya fue recibido.</label><button>Registrar pago recibido</button></fieldset></form><details><summary>Cancelar reserva</summary><form onSubmit={e=>act(e,'cancel')}><fieldset disabled={busy}><label>Motivo de cancelación<textarea name="reason" required minLength={3} maxLength={500}/></label><button>Cancelar reserva y liberar unidades</button></fieldset></form></details></>}
 {selected.status==='PAID'&&after?.refundState==='NONE'&&!after.withdrawn&&<form onSubmit={e=>act(e,'fulfill')}><fieldset disabled={busy}><label><input type="checkbox" required/> Confirmo que el pedido fue {selected.fulfillment==='SHIP'?'despachado':'entregado'}.</label><button>{selected.fulfillment==='SHIP'?'Marcar despachado':'Marcar entregado'}</button></fieldset></form>}
 {after&&<AftersalesManager key={selected.id} order={selected} summary={after} role={role} locations={locations} busy={busy} setBusy={setBusy} request={request} reload={async()=>{await detail(selected.id);await list();await reload();}}/>}
 <h3>Historial del pedido</h3><ul>{selected.events?.map(e=><li key={e.id}>{new Date(e.created_at).toLocaleString('es-CL')} · {labels[e.type]??e.type}{e.reason?` · ${e.reason}`:''}</li>)}</ul></div></Modal>}</OrdersWorkspace></div>
 </div>;
}

