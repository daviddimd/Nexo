'use client';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {IconButton} from '../action-icon';
import DispatchDetail from './dispatch-detail';
import board from './management-workspace.module.css';
import styles from './dispatch-board.module.css';
import {ago, isLate, money, shortId, stageBadge, stageHints, stageLabels, type DispatchRow, type Stage} from './dispatch-shared';

type Props = {busy: boolean; setBusy: (value: boolean) => void; request: (path: string, options?: RequestInit) => Promise<any>};
type Filter = Stage | 'all';
type Data = {items: DispatchRow[]; counts: Record<Stage, number>; late: number};
const stages: Stage[] = ['prepare', 'preparing', 'dispatched', 'delivered'];
const PAGE = 25;
const actionLabel: Record<Stage, string> = {prepare: 'Preparar', preparing: 'Despachar', dispatched: 'Confirmar entrega', delivered: 'Ver'};

export default function DispatchBoard({busy, setBusy, request}: Props) {
 const [filter, setFilter] = useState<Filter>('prepare');
 const [page, setPage] = useState(0);
 const [query, setQuery] = useState('');
 const [draft, setDraft] = useState('');
 const [data, setData] = useState<Data | null>(null);
 const [notice, setNotice] = useState('');
 const [selected, setSelected] = useState<DispatchRow | null>(null);
 const [now, setNow] = useState(Date.now);
 const current = useRef({filter, page, query});

 async function load(next: Partial<{filter: Filter; page: number; query: string}> = {}) {
  const view = {...current.current, ...next};
  const params = new URLSearchParams({limit: String(PAGE), offset: String(view.page * PAGE), stage: view.filter, q: view.query});
  const result = await request(`dispatches?${params}`);
  current.current = view;
  setFilter(view.filter); setPage(view.page); setQuery(view.query);
  setData(result); setNow(Date.now());
 }
 async function run(work: () => Promise<void>) {
  if (busy) return;
  setBusy(true); setNotice('');
  try { await work(); } catch (error) { setNotice((error as Error).message); } finally { setBusy(false); }
 }
 useEffect(() => {
  setBusy(true);
  load().catch(error => setNotice((error as Error).message)).finally(() => setBusy(false));
 }, []);
 useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);

 const choose = (next: Filter) => void run(() => load({filter: next, page: 0}));
 const search = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void run(() => load({query: draft.trim(), page: 0})); };
 const items = data?.items ?? [];
 const loaded = data !== null;
 const total = loaded ? stages.reduce((sum, stage) => sum + data.counts[stage], 0) : 0;

 return <>
  {notice && <p className={board.notice} role="status">{notice}</p>}
  <ul className={styles.stages} aria-label="Etapas del despacho">
   {stages.map(stage => <li key={stage}><button type="button" className={styles.stage} aria-pressed={filter === stage} disabled={busy} onClick={() => choose(stage)}>
    <span className={styles.stageLabel}>{stageLabels[stage]}</span>
    <span className={styles.stageCount}>{loaded ? data.counts[stage] : '—'}</span>
    <span className={styles.stageHint}>{stageHints[stage]}</span>
   </button></li>)}
  </ul>
  {loaded && data.late > 0 && <p className={styles.alert} role="status"><span><strong>{data.late} {data.late === 1 ? 'pedido lleva' : 'pedidos llevan'} más de 24 horas pagados</strong> sin despachar. Aparecen primero en la lista.</span></p>}
  <div className={styles.toolbar}>
   <form className={styles.search} role="search" onSubmit={search}>
    <input type="search" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Buscar pedido, cliente o comuna" aria-label="Buscar envíos" maxLength={80}/>
    <button disabled={busy}>Buscar</button>
   </form>
   <div className={styles.toolbarEnd}>
    {query && <button type="button" className={styles.ghost} disabled={busy} onClick={() => { setDraft(''); void run(() => load({query: '', page: 0})); }}>Limpiar búsqueda</button>}
    <button type="button" className={styles.ghost} aria-pressed={filter === 'all'} disabled={busy} onClick={() => choose(filter === 'all' ? 'prepare' : 'all')}>Ver todos{loaded ? ` (${total})` : ''}</button>
    <IconButton icon="refresh" label="Actualizar envíos" disabled={busy} onClick={() => void run(() => load())}/>
   </div>
  </div>
  <div className={board.panel}>
   <div className={board.tableScroll} tabIndex={0} role="region" aria-label="Pedidos con envío a domicilio" aria-busy={busy}>
    <table className={`${board.table} ${styles.table}`}>
     <thead><tr><th scope="col">Pedido</th><th scope="col">Destino</th><th scope="col">Sale desde</th><th scope="col">Contenido</th><th scope="col">Estado</th><th scope="col" className={styles.actionCell}><span className={board.srOnly}>Acción</span></th></tr></thead>
     <tbody>
      {items.map(row => {
       const late = isLate(row, now);
       return <tr key={row.id}>
        <td><span className={styles.cellMain}>{shortId(row.id)}</span><span className={`${styles.cellSub} ${late ? styles.late : ''}`}>Pagado {ago(row.paid_at, now)}{late && ' · atrasado'}</span></td>
        <td data-label="Destino"><span className={styles.cellMain}>{row.shipping_address?.recipient ?? 'Sin destinatario'}</span><span className={styles.cellSub}>{row.shipping_address ? `${row.shipping_address.commune}, ${row.shipping_address.region}` : '—'}</span></td>
        <td data-label="Sale desde">{row.location_name}</td>
        <td data-label="Contenido"><span className={styles.cellMain}>{row.units} {row.units === 1 ? 'unidad' : 'unidades'}</span><span className={styles.cellSub}>{money(row.total_minor)}</span></td>
        <td data-label="Estado"><div className={styles.statusCell}>
         <span className={`${board.badge} ${board[stageBadge[row.stage]]}`}>{stageLabels[row.stage]}</span>
         {row.blocked && <span className={`${board.badge} ${board.negative}`}>Posventa pendiente</span>}
         {(row.stage === 'dispatched' || row.stage === 'delivered') && <span className={styles.cellSub}>{[row.carrier, row.tracking_code].filter(Boolean).join(' · ') || 'Sin datos del transportista'}</span>}
        </div></td>
        <td className={styles.actionCell}><button type="button" className={styles.rowAction} data-primary={row.stage === 'prepare' || row.stage === 'preparing'} disabled={busy} onClick={() => setSelected(row)} aria-label={`${row.blocked ? 'Revisar' : actionLabel[row.stage]} envío ${shortId(row.id)}`}>{row.blocked ? 'Revisar' : actionLabel[row.stage]}</button></td>
       </tr>;
      })}
      {!items.length && <tr><td colSpan={6}><div className={board.empty}>{!loaded ? 'Cargando envíos…' : query ? 'Ningún envío coincide con la búsqueda.' : filter === 'prepare' ? 'No hay pedidos por preparar. Los envíos pagados aparecerán aquí.' : 'No hay envíos en esta etapa.'}</div></td></tr>}
     </tbody>
    </table>
   </div>
   <div className={board.pagination}><span>Hasta {PAGE} envíos por página</span><nav aria-label="Páginas de envíos">
    <IconButton icon="previous" label="Envíos anteriores" disabled={busy || page === 0} onClick={() => void run(() => load({page: page - 1}))}/>
    <span>Página {page + 1}</span>
    <IconButton icon="next" label="Envíos siguientes" disabled={busy || items.length < PAGE} onClick={() => void run(() => load({page: page + 1}))}/>
   </nav></div>
  </div>
  <p className={board.note}>Pagar descuenta el stock; preparar y despachar no lo mueven otra vez. Un envío despachado no está entregado hasta que lo confirmes.</p>
  {selected && <DispatchDetail key={selected.id} row={selected} busy={busy} setBusy={setBusy} request={request} onChanged={() => void load().catch(error => setNotice((error as Error).message))} onClose={() => setSelected(null)}/>}
 </>;
}
