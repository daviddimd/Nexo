'use client';
import {useState} from 'react';
import DispatchBoard from './dispatch-board';
import ShippingRatesManager from './shipping-rates-manager';
import styles from './management-workspace.module.css';

type Props = {role: string; busy: boolean; setBusy: (value: boolean) => void; request: (path: string, options?: RequestInit) => Promise<any>};

export default function DeliveryManager({role, busy, setBusy, request}: Props) {
 const [tab, setTab] = useState<'deliveries' | 'rates'>('deliveries');
 return <div className={styles.workspace}>
  <div data-panel-reveal="delivery-heading" className={styles.heading}>
   <div><h2>Envíos</h2><p>Prepara cada pedido pagado, regístralo al despacharlo y confirma cuando el cliente lo recibe.</p></div>
  </div>
  {role === 'OWNER' && <nav className={styles.tabs} aria-label="Secciones de envío">
   <button disabled={busy} aria-pressed={tab === 'deliveries'} onClick={() => setTab('deliveries')}>Despachos</button>
   <button disabled={busy} aria-pressed={tab === 'rates'} onClick={() => setTab('rates')}>Tarifas y cobertura</button>
  </nav>}
  {tab === 'rates' && role === 'OWNER'
   ? <ShippingRatesManager busy={busy} setBusy={setBusy} request={request}/>
   : <DispatchBoard busy={busy} setBusy={setBusy} request={request}/>}
 </div>;
}
