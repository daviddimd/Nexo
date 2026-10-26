'use client';
import {useState,type FormEvent} from 'react';
import {IconButton} from '../action-icon';
import Modal from './modal';
import type {ManagedProduct,ManagedLocation} from './catalog-manager';
import styles from './movements-workspace.module.css';

type Movement={id:string;sku:string;product_name:string;location_name:string;kind:string;delta:number;reason:string;created_at:string};
type Props={movements:Movement[];products:ManagedProduct[];locations:ManagedLocation[];page:number;productPage:number;kind:string;busy:boolean;message:string;
 onKind:(kind:string)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>Promise<boolean>;onRefresh:()=>void;onPage:(page:number)=>void;onProductPage:(page:number)=>void};
const labels:Record<string,string>={RECEIPT:'Entrada',ADJUSTMENT:'Ajuste',TRANSFER:'Transferencia',SALE:'Venta',RETURN:'Devolución'};
const descriptions:Record<string,string>={RECEIPT:'Añadir unidades recibidas.',ADJUSTMENT:'Corregir una diferencia de stock.',TRANSFER:'Mover unidades entre ubicaciones.'};
function MovementSymbol({kind}:{kind:string}){
 const paths:Record<string,string>={RECEIPT:'M12 4v14m-5-5 5 5 5-5M5 21h14',ADJUSTMENT:'M4 8h16M4 16h16M8 5v6m8 2v6',TRANSFER:'M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4',SALE:'M12 20V6m-5 5 5-5 5 5',RETURN:'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12'};
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]??paths.ADJUSTMENT}/></svg>;
}
export default function MovementsWorkspace({movements,products,locations,page,productPage,kind,busy,message,onKind,onSubmit,onRefresh,onPage,onProductPage}:Props){
 const [open,setOpen]=useState(false),[source,setSource]=useState('');
 const activeLocations=locations.filter(l=>l.active);
 async function submit(event:FormEvent<HTMLFormElement>){if(await onSubmit(event))setOpen(false);}
 return <div className={styles.view}>
  <div data-panel-reveal="movements-workspace-0" className={styles.heading}>
   <div><h2>Movimientos</h2><p>El registro de lo que entra, sale y se mueve entre ubicaciones.</p></div>
   <div className={styles.headingActions}><IconButton icon="refresh" label="Actualizar movimientos" onClick={onRefresh} disabled={busy}/><button className={styles.primary} disabled={busy} onClick={()=>{onKind('RECEIPT');setSource('');setOpen(true);}}><span aria-hidden="true">＋</span> Registrar movimiento</button></div>
  </div>
  <div data-panel-reveal="movements-workspace-1" className={styles.history} aria-busy={busy}>
   <div className={styles.historyHeading}><h3>Historial de movimientos</h3><span>{movements.length} {movements.length===1?'registro':'registros'} en esta página</span></div>
   {movements.length?<div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Historial de movimientos"><table className={styles.table}>
    <thead><tr><th scope="col">Fecha y hora</th><th scope="col">Producto</th><th scope="col">Ubicación</th><th scope="col">Tipo</th><th scope="col" className={styles.units}>Unidades</th><th scope="col">Motivo</th></tr></thead>
    <tbody>{movements.map(m=>{const date=new Date(m.created_at);return <tr key={m.id}>
     <td className={styles.date}><time dateTime={m.created_at}>{date.toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'})}<small>{date.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</small></time></td>
     <td className={styles.product}><strong>{m.product_name??m.sku}</strong>{m.product_name&&<small>{m.sku}</small>}</td>
     <td className={styles.location}>{m.location_name}</td>
     <td><span className={`${styles.typeBadge} ${m.kind==='RECEIPT'||m.kind==='RETURN'?styles.receipt:m.kind==='TRANSFER'?styles.transfer:m.kind==='ADJUSTMENT'?styles.adjustment:styles.sale}`}><MovementSymbol kind={m.kind}/>{labels[m.kind]??m.kind}</span></td>
     <td className={`${styles.units} ${m.delta>0?styles.positive:styles.negative}`}>{m.delta>0?'+':''}{m.delta.toLocaleString('es-CL')}</td>
     <td className={styles.reason}>{m.reason}</td>
    </tr>;})}</tbody>
   </table></div>:<div className={styles.empty}><MovementSymbol kind="TRANSFER"/><h3>{page===0?'Tu historial comienza aquí':'No hay más movimientos'}</h3><p>{page===0?'Las entradas, ajustes, transferencias y ventas registradas aparecerán en este espacio.':'Vuelve a la página anterior para consultar los registros.'}</p>{page>0&&<button disabled={busy} onClick={()=>onPage(page-1)}>Volver a la página anterior</button>}</div>}
   <div className={styles.pagination}><span>Hasta 50 registros por página</span><nav aria-label="Páginas del historial de movimientos"><IconButton icon="previous" label="Movimientos anteriores" disabled={busy||page===0} onClick={()=>onPage(page-1)}/><span>Página {page+1}</span><IconButton icon="next" label="Movimientos siguientes" disabled={busy||movements.length<50} onClick={()=>onPage(page+1)}/></nav></div>
  </div>
  {open&&<Modal title="Registrar movimiento" busy={busy} onClose={()=>setOpen(false)}>
   <form className={styles.form} onSubmit={submit}><fieldset disabled={busy}>
    <fieldset className={styles.types}><legend>¿Qué necesitas registrar?</legend><div>{['RECEIPT','ADJUSTMENT','TRANSFER'].map(value=><button key={value} type="button" className={styles.typeOption} aria-pressed={kind===value} onClick={()=>onKind(value)}><MovementSymbol kind={value}/><strong>{labels[value]}</strong><small>{descriptions[value]}</small></button>)}</div></fieldset>
    <div className={styles.formFields}>
     <div className={styles.full}><label>Producto<select name="product" required key={productPage}><option value="">Selecciona un producto</option>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label>
      {(productPage>0||products.length===100)&&<div className={styles.productPages}><span>Grupo {productPage+1} de productos</span><div><IconButton icon="previous" label="Productos anteriores" disabled={busy||productPage===0} onClick={()=>onProductPage(productPage-1)}/><IconButton icon="next" label="Más productos" disabled={busy||products.length<100} onClick={()=>onProductPage(productPage+1)}/></div></div>}
     </div>
     <label>{kind==='TRANSFER'?'Ubicación de origen':'Ubicación'}<select name="location" required value={source} onChange={e=>setSource(e.target.value)}><option value="">Selecciona ubicación</option>{activeLocations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
     {kind==='TRANSFER'?<label>Ubicación de destino<select name="destination" required key={source}><option value="">Selecciona destino</option>{activeLocations.filter(l=>l.id!==source).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>:<label>Cantidad{kind==='ADJUSTMENT'?' (+ / −)':''}<input name="quantity" type="number" required step={1} min={kind==='ADJUSTMENT'?-1000000:1} max={1000000}/></label>}
     {kind==='TRANSFER'&&<label className={styles.full}>Unidades a transferir<input name="quantity" type="number" required min={1} max={1000000} step={1}/></label>}
     {kind==='ADJUSTMENT'&&<p className={styles.fieldHint}>Usa un valor positivo para sumar unidades o negativo para restarlas.</p>}
     <label className={styles.full}>Motivo<textarea name="reason" required minLength={3} maxLength={500} rows={3} placeholder={kind==='RECEIPT'?'Ej.: recepción de mercadería del proveedor':kind==='TRANSFER'?'Ej.: reposición de stock en sucursal':'Ej.: diferencia detectada en conteo físico'}/></label>
    </div>
    <p className={styles.formNote}>Para registrar una venta, utiliza Nueva venta desde el inicio.</p>
    {message&&<p className={styles.formMessage} role="status" aria-live="polite">{message}</p>}
    <div className={styles.formActions}><button type="button" onClick={()=>setOpen(false)}>Cancelar</button><button className={styles.primary}>{busy?'Registrando…':'Confirmar movimiento'}</button></div>
   </fieldset></form>
  </Modal>}
 </div>;
}
