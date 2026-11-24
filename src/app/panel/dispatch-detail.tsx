'use client';
import {useEffect, useState, type FormEvent} from 'react';
import Modal from './modal';
import board from './management-workspace.module.css';
import styles from './dispatch-board.module.css';
import {
 addressText, carriers, dateTime, dayLabel, eventLabels, money, shortId, stageBadge, stageLabels, stageOf,
 type DispatchRow, type OrderDetail, type Shipment,
} from './dispatch-shared';

type Props = {row: DispatchRow; busy: boolean; setBusy: (value: boolean) => void; request: (path: string, options?: RequestInit) => Promise<any>; onChanged: () => void; onClose: () => void};
const CARRIER_KEY = 'nexo:dispatch-carrier';
const reasonTypes = new Set(['SHIPMENT_UPDATED', 'REFUND_RECORDED', 'RETURN_RECEIVED', 'CAPTURE_RESOLVED', 'CANCELLED']);

function rememberedCarrier() {
 try { return localStorage.getItem(CARRIER_KEY) ?? ''; } catch { return ''; }
}
function rememberCarrier(value: string) {
 try { localStorage.setItem(CARRIER_KEY, value); } catch {}
}

function ShipmentFields({shipment, defaultCarrier}: {shipment: Shipment | null; defaultCarrier: string}) {
 const today = new Date().toISOString().slice(0, 10);
 return <div className={styles.fields}>
  <label>Transportista<input name="carrier" list="dispatch-carriers" defaultValue={defaultCarrier} required minLength={2} maxLength={80} autoComplete="off" placeholder="Ej.: Chilexpress"/></label>
  <label>Número de seguimiento (opcional)<input name="trackingCode" defaultValue={shipment?.tracking_code ?? ''} minLength={3} maxLength={80} autoComplete="off" placeholder="Código del transportista, si existe"/></label>
  <label>Entrega estimada (opcional)<input name="estimatedDelivery" type="date" min={today} defaultValue={shipment?.estimated_delivery ?? ''}/></label>
  <datalist id="dispatch-carriers">{carriers.map(name => <option key={name} value={name}/>)}</datalist>
 </div>;
}

export default function DispatchDetail({row, busy, setBusy, request, onChanged, onClose}: Props) {
 const [order, setOrder] = useState<OrderDetail | null>(null);
 const [message, setMessage] = useState('');
 const [picked, setPicked] = useState<Set<string>>(new Set());
 const [firstCarrier] = useState(() => row.carrier ?? rememberedCarrier());
 const [copied, setCopied] = useState(false);
 useEffect(() => {
  let active = true;
  setBusy(true);
  request(`orders/${row.id}`).then(result => { if (active) setOrder(result); }).catch(error => { if (active) setMessage((error as Error).message); }).finally(() => { if (active) setBusy(false); });
  return () => { active = false; };
 }, [row.id]);

 const stage = order ? stageOf(order) : row.stage;
 const shipment = order?.shipment ?? null;
 const blocked = row.blocked && stage !== 'dispatched' && stage !== 'delivered';
 const address = order?.shipping_address ?? row.shipping_address;
 const items = order?.items ?? [];
 const allPicked = items.length > 0 && items.every(item => picked.has(item.product_id));

 async function act(path: string, options: RequestInit, done: string) {
  if (busy) return;
  setBusy(true);
  setMessage('');
  try {
   setOrder(await request(`orders/${row.id}/shipment${path}`, options));
   setMessage(done);
   onChanged();
  } catch (error) {
   setMessage((error as Error).message);
  } finally {
   setBusy(false);
  }
 }
 const data = (form: HTMLFormElement) => {
  const fields = new FormData(form);
  return JSON.stringify({carrier: String(fields.get('carrier') ?? '').trim(), trackingCode: String(fields.get('trackingCode') ?? '').trim(), estimatedDelivery: String(fields.get('estimatedDelivery') ?? '')});
 };
 function dispatch(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const body = data(event.currentTarget);
  rememberCarrier(String(new FormData(event.currentTarget).get('carrier') ?? '').trim());
  void act('/dispatch', {method: 'POST', body}, 'Despacho registrado. El cliente ya puede ver el seguimiento en su cuenta.');
 }
 function correct(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  void act('', {method: 'PATCH', body: data(event.currentTarget)}, 'Datos del despacho corregidos.');
 }
 async function copy() {
  if (!address) return;
  try { await navigator.clipboard.writeText(addressText(address)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setMessage('No se pudo copiar. Selecciona la dirección y cópiala manualmente.'); }
 }

 const steps = [
  {key: 'paid', label: 'Pagado', at: row.paid_at, done: true},
  {key: 'prepare', label: 'En preparación', at: shipment?.prepared_at ?? row.prepared_at, done: stage !== 'prepare'},
  {key: 'dispatch', label: 'Despachado', at: shipment?.dispatched_at ?? row.dispatched_at ?? row.fulfilled_at, done: stage === 'dispatched' || stage === 'delivered'},
  {key: 'deliver', label: 'Entregado', at: shipment?.delivered_at ?? row.delivered_at, done: stage === 'delivered'},
 ];
 const current = steps.findIndex(step => !step.done);

 return <Modal title={`Envío ${shortId(row.id)}`} busy={busy} onClose={onClose}>
  <div className={`${board.detail} ${styles.root}`}>
   <p className={styles.status} role="status" aria-live="polite">{message}</p>
   <ol className={styles.steps} aria-label="Etapas del envío">
    {steps.map((step, index) => <li key={step.key} className={styles.step} data-state={step.done ? 'done' : index === current ? 'current' : 'todo'} aria-current={index === current ? 'step' : undefined}>
     <strong>{step.label}</strong><time dateTime={step.at ?? undefined}>{step.at ? dateTime(step.at) : index === current ? 'Siguiente paso' : 'Pendiente'}</time>
    </li>)}
   </ol>
   {blocked && <p className={`${styles.alert} ${styles.alertBad}`} role="alert"><span><strong>Posventa pendiente.</strong> Este pedido tiene un reembolso o un retiro registrado, así que no se puede preparar ni despachar hasta resolverlo en Pedidos.</span></p>}
   <div className={styles.cards}>
    <section className={styles.card} aria-labelledby="dispatch-recipient">
     <h3 id="dispatch-recipient">Destinatario</h3>
     {address ? <p>{address.recipient}<br/>{address.line1}<br/>{address.commune}, {address.region}{address.postalCode && <><br/>CP {address.postalCode}</>}<br/><a href={`tel:${address.phone.replace(/[^+\d]/g, '')}`}>{address.phone}</a></p> : <p>Sin dirección registrada.</p>}
     {address && <button type="button" className={styles.cardAction} onClick={() => void copy()}>{copied ? 'Dirección copiada' : 'Copiar dirección'}</button>}
    </section>
    <section className={styles.card} aria-labelledby="dispatch-order">
     <h3 id="dispatch-order">Pedido</h3>
     <dl className={styles.facts}>
      <dt>Sale desde</dt><dd>{row.location_name}</dd>
      <dt>Productos</dt><dd>{row.units} {row.units === 1 ? 'unidad' : 'unidades'}</dd>
      <dt>Envío</dt><dd>{order ? money(order.shipping_minor) : '—'}</dd>
      <dt>Total pagado</dt><dd>{money(row.total_minor)}</dd>
      <dt>Estado</dt><dd><span className={`${board.badge} ${board[stageBadge[stage]]}`}>{stageLabels[stage]}</span></dd>
     </dl>
    </section>
   </div>

   {items.length > 0 && <section className={styles.section} aria-labelledby="dispatch-items">
    <h3 id="dispatch-items">{stage === 'prepare' || stage === 'preparing' ? 'Qué armar' : 'Productos del envío'}</h3>
    <ul className={styles.picking}>
     {items.map(item => <li key={item.product_id}><label>
      {(stage === 'prepare' || stage === 'preparing') && <input type="checkbox" checked={picked.has(item.product_id)} onChange={event => setPicked(previous => { const next = new Set(previous); if (event.target.checked) next.add(item.product_id); else next.delete(item.product_id); return next; })}/>}
      <span>{item.name}<span className={styles.sku}>{item.sku}</span></span><span className={styles.qty}>× {item.quantity}</span>
     </label></li>)}
    </ul>
    {(stage === 'prepare' || stage === 'preparing') && <p className={styles.progress}>{picked.size} de {items.length} {items.length === 1 ? 'producto separado' : 'productos separados'}. Es una ayuda para armar el paquete; no cambia el stock.</p>}
   </section>}

   <section className={styles.section} aria-label="Siguiente paso">
    {stage === 'prepare' && <div className={styles.form}>
     <h3>Empieza a preparar el pedido</h3>
     <p>Avisa al equipo que este paquete ya se está armando. El stock ya está reservado y descontado al pagar.</p>
     <button type="button" className={styles.submit} disabled={busy || blocked || !order} onClick={() => void act('/prepare', {method: 'POST', body: '{}'}, 'Pedido en preparación.')}>Empezar a preparar</button>
    </div>}
    {stage === 'preparing' && <form className={styles.form} onSubmit={dispatch}>
     <h3>Registrar el despacho</h3>
     <p>Completa los datos cuando entregues el paquete al transportista. Con esto el pedido pasa a despachado.</p>
     <fieldset disabled={busy || blocked}>
      <ShipmentFields shipment={null} defaultCarrier={firstCarrier}/>
      <label className={styles.confirm}><input type="checkbox" required/> Confirmo que el paquete ya fue entregado al transportista.</label>
      <button className={styles.submit}>Registrar despacho</button>
     </fieldset>
    </form>}
    {stage === 'dispatched' && <>
     <dl className={`${styles.card} ${styles.facts}`}>
      <dt>Transportista</dt><dd>{shipment?.carrier ?? 'Sin registrar'}</dd>
      <dt>Seguimiento</dt><dd>{shipment?.tracking_code ?? '—'}</dd>
      <dt>Entrega estimada</dt><dd>{dayLabel(shipment?.estimated_delivery ?? null)}</dd>
      <dt>Despachado</dt><dd>{dateTime(shipment?.dispatched_at ?? row.fulfilled_at)}</dd>
     </dl>
     {shipment ? <>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void act('/deliver', {method: 'POST', body: '{}'}, 'Entrega confirmada.'); }} style={{marginTop: 12}}>
       <h3>Confirmar la entrega</h3>
       <p>Despachado no significa entregado. Márcalo cuando sepas que el cliente recibió el pedido.</p>
       <fieldset disabled={busy}>
        <label className={styles.confirm}><input type="checkbox" required/> Confirmo que el cliente recibió el pedido.</label>
        <button className={styles.submit}>Confirmar entrega</button>
       </fieldset>
      </form>
      <details className={styles.edit}><summary>Corregir datos del despacho</summary>
       <form className={styles.form} onSubmit={correct}><fieldset disabled={busy}>
        <ShipmentFields shipment={shipment} defaultCarrier={shipment.carrier ?? ''}/>
        <button className={`${styles.submit} ${styles.submitSoft}`}>Guardar correcciones</button>
       </fieldset></form>
      </details>
     </> : <p className={styles.alert}>Este pedido se despachó antes de que existiera el seguimiento, por eso no tiene datos del transportista.</p>}
    </>}
    {stage === 'delivered' && <>
     <p className={styles.done}>Entrega confirmada el {dateTime(shipment?.delivered_at ?? row.delivered_at)}.</p>
     <dl className={`${styles.card} ${styles.facts}`} style={{marginTop: 12}}>
      <dt>Transportista</dt><dd>{shipment?.carrier ?? '—'}</dd>
      <dt>Seguimiento</dt><dd>{shipment?.tracking_code ?? '—'}</dd>
      <dt>Despachado</dt><dd>{dateTime(shipment?.dispatched_at ?? null)}</dd>
     </dl>
    </>}
   </section>

   {order && order.events.length > 0 && <section className={styles.section} aria-labelledby="dispatch-history">
    <h3 id="dispatch-history">Historial</h3>
    <ol className={styles.history}>
     {[...order.events].reverse().map(event => <li key={event.id}><time dateTime={event.created_at}>{dateTime(event.created_at)}</time><div><strong>{eventLabels[event.type] ?? event.type}</strong>{event.reason && reasonTypes.has(event.type) && <span> · {event.reason}</span>}</div></li>)}
    </ol>
   </section>}
  </div>
 </Modal>;
}
