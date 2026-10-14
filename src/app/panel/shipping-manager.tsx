'use client';
import {IconButton} from '../action-icon';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Modal from './modal';
import type {ManagedLocation} from './catalog-manager';
type Item={productId:string;name:string;sku:string;quantity:number;unitPrice:string;lineTotal:string};
type Quote={id:string;status:'REQUESTED'|'APPROVED'|'REJECTED'|'USED'|'EXPIRED';location_id:string;shipping_minor:string|null;goods_minor:string|null;created_at:string;expires_at:string|null;note?:string|null;itemDetails?:Item[];priced_items?:Item[]|null;address?:{recipient:string;phone:string;line1:string;commune:string;region:string;country:string;postalCode?:string}};
type Props={locations:ManagedLocation[];busy:boolean;setBusy:(v:boolean)=>void;request:(path:string,options?:RequestInit)=>Promise<any>};
const labels={REQUESTED:'Por cotizar',APPROVED:'Aprobada',REJECTED:'Rechazada',USED:'Pedido creado',EXPIRED:'Vencida'};
const money=(value:string)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(BigInt(value));
export default function ShippingManager({locations,busy,setBusy,request}:Props){
  const [quotes,setQuotes]=useState<Quote[]>([]),[selected,setSelected]=useState<Quote|null>(null),[page,setPage]=useState(0),[notice,setNotice]=useState(''),[loaded,setLoaded]=useState(false),[uncertain,setUncertain]=useState(false);
  const saving=useRef(false),pending=useRef<{id:string;action:'approve'|'reject';body:string}|null>(null);
  async function load(p=page){const result=await request(`shipping/quotes?limit=25&offset=${p*25}`);setQuotes(result.items);setPage(p);setLoaded(true);}
  async function refresh(p=page){setBusy(true);setNotice('');try{await load(p);}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{void refresh(0);},[]);
  async function open(id:string){setBusy(true);setNotice('');try{const quote=await request(`shipping/quotes/${id}`);setSelected(quote);setUncertain(false);pending.current=null;}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
  async function send(){
    if(saving.current||!pending.current)return;
    const operation=pending.current;saving.current=true;setBusy(true);setNotice('');
    try{
      const result=await request(`shipping/quotes/${operation.id}/${operation.action}`,{method:'POST',body:operation.body});
      setSelected(result);setUncertain(false);pending.current=null;setNotice(operation.action==='approve'?'Cotización aprobada. El cliente puede crear su pedido durante los próximos 30 minutos.':'Cotización rechazada.');
      try{await load();}catch{setNotice('Cambio guardado. Actualiza el listado para ver su estado.');}
    }catch(error){const e=error as Error&{status?:number};setUncertain(!e.status);setNotice(e.status?`${e.message}. Actualiza el detalle antes de intentar otro cambio.`:'Se perdió la respuesta. Reintenta la comprobación con los mismos datos o actualiza el detalle antes de continuar.');}
    finally{saving.current=false;setBusy(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>,action:'approve'|'reject'){
    event.preventDefault();if(!selected||saving.current||uncertain)return;
    const form=new FormData(event.currentTarget);
    pending.current={id:selected.id,action,body:JSON.stringify(action==='approve'?{shippingMinor:form.get('amount'),note:form.get('note')}:{reason:form.get('reason')})};await send();
  }
  const items=selected?.priced_items??selected?.itemDetails??[];
  const subtotal=items.reduce((sum,item)=>sum+BigInt(item.lineTotal),0n).toString();
  return <section><div className="section-heading"><h2>Cotizaciones de envío</h2><IconButton icon="refresh" label="Actualizar" disabled={busy} onClick={()=>refresh()}/></div>
    <p>Revisa el destino y los productos antes de definir el costo del envío. Cotizar no reserva stock ni realiza cobros.</p><p role="status" aria-live="polite">{notice}</p>
    <div className="table-scroll"><table><thead><tr><th>Solicitud / Fecha</th><th>Origen</th><th>Estado</th><th>Envío</th><th>Vigencia</th><th>Detalle</th></tr></thead><tbody>
      {quotes.map(quote=><tr key={quote.id}><td>{quote.id.slice(0,8)}<br/>{new Date(quote.created_at).toLocaleString('es-CL')}</td><td>{locations.find(l=>l.id===quote.location_id)?.name??'Ubicación de origen'}</td><td>{labels[quote.status]}</td><td>{quote.shipping_minor===null?'Por cotizar':money(quote.shipping_minor)}</td><td>{quote.expires_at?new Date(quote.expires_at).toLocaleString('es-CL'):'—'}</td><td><button disabled={busy} aria-label={`Ver cotización ${quote.id.slice(0,8)}`} onClick={()=>open(quote.id)}>Ver</button></td></tr>)}
      {!quotes.length&&<tr><td colSpan={6}>{loaded?'No hay solicitudes de envío en esta página.':'Cargando solicitudes…'}</td></tr>}
    </tbody></table></div><nav aria-label="Páginas de cotizaciones"><IconButton icon="previous" label="Página anterior" disabled={busy||page===0} onClick={()=>refresh(page-1)}/><span>Página {page+1}</span><IconButton icon="next" label="Página siguiente" disabled={busy||quotes.length<25} onClick={()=>refresh(page+1)}/></nav>
    {selected&&<Modal title={`Cotización ${selected.id.slice(0,8)}`} busy={busy} onClose={()=>{setSelected(null);setUncertain(false);pending.current=null;}}>
      <p role="status" aria-live="polite">{notice}</p><IconButton icon="refresh" label="Actualizar detalle" disabled={busy} onClick={()=>open(selected.id)}/><p><strong>{labels[selected.status]}</strong> · {locations.find(l=>l.id===selected.location_id)?.name??'Origen seleccionado'}</p>
      {selected.address&&<><h3>Destino</h3><p>{selected.address.recipient}<br/>{selected.address.line1}<br/>{selected.address.commune}, {selected.address.region}, Chile{selected.address.postalCode&&<><br/>Código postal: {selected.address.postalCode}</>}</p><p>Teléfono: {selected.address.phone}</p></>}
      <h3>Productos</h3><ul>{items.map(item=><li key={item.productId}>{item.sku} · {item.name} × {item.quantity} — {money(item.lineTotal)}</li>)}</ul>
      <p>{selected.goods_minor===null?'Subtotal referencial actual':'Productos cotizados'}: <strong>{money(selected.goods_minor??subtotal)}</strong></p>
      {selected.shipping_minor!==null&&<p>Envío: {money(selected.shipping_minor)} · Total: <strong>{money((BigInt(selected.goods_minor??subtotal)+BigInt(selected.shipping_minor)).toString())}</strong></p>}
      {selected.note&&<p>Nota: {selected.note}</p>}{selected.expires_at&&<p>Vigencia: {new Date(selected.expires_at).toLocaleString('es-CL')}</p>}
      {selected.status==='REQUESTED'&&<><h3>Aprobar envío</h3><p>El precio de productos se fija al aprobar. La cotización aprobada dura 30 minutos; el stock se comprueba y reserva al crear el pedido.</p><form onSubmit={e=>submit(e,'approve')}><fieldset disabled={busy||uncertain}><label>Costo de envío en CLP<input name="amount" inputMode="numeric" pattern="(0|[1-9][0-9]{0,12})" type="text" required maxLength={13}/></label><label>Condiciones del envío<textarea name="note" minLength={3} maxLength={500} required/></label><label><input type="checkbox" required/> Confirmo el costo y la cobertura del envío.</label><button>Aprobar cotización</button></fieldset></form>
        <h3>Rechazar solicitud</h3><form onSubmit={e=>submit(e,'reject')}><fieldset disabled={busy||uncertain}><label>Motivo<textarea name="reason" minLength={3} maxLength={500} required/></label><button>Rechazar solicitud</button></fieldset></form></>}
      {uncertain&&<button disabled={busy} onClick={send}>Reintentar comprobación</button>}
    </Modal>}
  </section>;
}
