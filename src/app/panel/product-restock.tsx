'use client';

import {useRef, useState, type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import styles from '../product-detail.module.css';

export default function ProductRestock({productId, locationId, locationName, needsRestock, initiallyOpen, sources}: {
 productId: string;
 locationId: string;
 locationName: string;
 needsRestock: boolean;
 initiallyOpen: boolean;
 sources: {id:string;name:string;available:number}[];
}) {
 const router = useRouter();
 const [sourceId,setSourceId]=useState('');
 const source=sources.find(location=>location.id===sourceId);
 const pending = useRef<{body: string; key: string} | null>(null);
 const submitting = useRef(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [success, setSuccess] = useState('');

 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (submitting.current) return;

  if (sourceId && !source) {
   setError('El origen ya no tiene stock disponible. Elige otra ubicación.');
   return;
  }

  const form = event.currentTarget;
  const fields = new FormData(form);
  const quantity = Number(fields.get('quantity'));
  const reason = fields.get('reason');
  const body = JSON.stringify(source
   ? {kind:'TRANSFER',productId,locationId:source.id,destinationId:locationId,quantity,reason}
   : {kind:'RECEIPT',productId,locationId,quantity,reason});
  if (pending.current?.body !== body) pending.current = {body, key: crypto.randomUUID()};

  submitting.current = true;
  setBusy(true);
  setError('');
  setSuccess('');
  try {
   const response = await fetch('/api/inventory/operations', {
    method: 'POST',
    headers: {'content-type': 'application/json', 'idempotency-key': pending.current.key},
    body,
   });
   if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message ?? 'No se pudo registrar la entrada.');
   }

   pending.current = null;
   form.reset();
   setSourceId('');
   setSuccess(source ? `Transferencia registrada desde ${source.name}.` : quantity === 1 ? 'Se registró la entrada de 1 unidad.' : `Se registró la entrada de ${quantity} unidades.`);
   router.refresh();
  } catch (error) {
   const message = error instanceof Error ? error.message : 'No se pudo registrar la entrada.';
   setError(`${message} Si hubo un corte de conexión, reintenta con los mismos datos.`);
  } finally {
   submitting.current = false;
   setBusy(false);
  }
 }

 if (!needsRestock && !success) return null;

 return <div id={`reponer-${locationId}`} className={styles.restock}>
  {needsRestock && <details open={initiallyOpen}>
   <summary aria-label={`Reponer stock en ${locationName}`}>Reponer</summary>
   <form onSubmit={submit}>
    <fieldset disabled={busy}>
     {sources.length>0&&<label>Origen<select value={sourceId} onChange={event=>setSourceId(event.target.value)}>
      <option value="">Entrada de mercadería</option>
      {sources.map(origin=><option key={origin.id} value={origin.id}>Transferir desde {origin.name} ({origin.available} disponibles)</option>)}
     </select></label>}
     <label>Unidades<input name="quantity" type="number" min={1} max={Math.min(source?.available??1000000,1000000)} step={1} required/></label>
     <label>Motivo<input name="reason" minLength={3} maxLength={500} required placeholder="Ej. Recepción de mercadería"/></label>
     <button type="submit" className="primary">{busy ? 'Registrando…' : source ? 'Registrar transferencia' : 'Registrar entrada'}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
   </form>
  </details>}
  <p role="status">{success}</p>
 </div>;
}
