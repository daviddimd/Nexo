'use client';
import type {ReactNode} from 'react';
import {IconButton,ActionIcon} from '../action-icon';
import type {ManagedLocation} from './catalog-manager';
import RowActions from './row-actions';
import styles from './management-workspace.module.css';

export default function LocationsWorkspace({locations,owner,busy,onNew,onEdit,onRefresh,children}:{locations:ManagedLocation[];owner:boolean;busy:boolean;onNew:()=>void;onEdit:(location:ManagedLocation)=>void;onRefresh:()=>Promise<void>;children:ReactNode}){
 return <div className={styles.workspace}>
  <div className={styles.heading}><div><h2>Ubicaciones</h2><p>Organiza tus sucursales y el stock de la bodega web.</p></div><div className={styles.headingActions}><IconButton icon="refresh" label="Actualizar ubicaciones" disabled={busy} onClick={()=>void onRefresh()}/>{owner&&<button className={styles.primary} disabled={busy} onClick={onNew}><span aria-hidden="true">＋</span> Nueva ubicación</button>}</div></div>
  <div className={styles.panel}><div className={styles.panelHeading}><h3>Sucursales y bodega web</h3><span>{locations.length} {locations.length===1?'ubicación visible':'ubicaciones visibles'}</span></div>
   <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Ubicaciones de la empresa"><table className={styles.table}><thead><tr><th scope="col">Ubicación</th><th scope="col">Tipo</th><th scope="col">Envíos</th><th scope="col">Estado</th><th scope="col" className={styles.menuCell}><span className={styles.srOnly}>Opciones de ubicación</span></th></tr></thead><tbody>
    {locations.map(location=><tr key={location.id}><td><div className={styles.location}><span className={styles.locationIcon}><ActionIcon name="company"/></span><strong>{location.name}</strong></div></td><td><span className={`${styles.badge} ${location.kind==='WEB'?styles.info:styles.neutral}`}>{location.kind==='WEB'?'Bodega web':'Sucursal'}</span></td><td><span className={styles.muted}>{location.kind==='WEB'?'Origen de pedidos web':location.shipping_enabled?'Envío y retiro':'Solo retiro en sucursal'}</span></td><td><span className={`${styles.badge} ${location.active?styles.positive:styles.neutral}`}>{location.active?'Activa':'Inactiva'}</span></td><td className={styles.menuCell}>{(owner||location.active&&location.kind==='STORE')&&<RowActions name={location.name} disabled={busy} editLabel={owner?'Editar ubicación':'Configurar envíos'} onEdit={()=>onEdit(location)}/>}</td></tr>)}
    {!locations.length&&<tr><td colSpan={5}><div className={styles.empty}><ActionIcon name="company"/><h3>No hay ubicaciones disponibles</h3><p>{owner?'Crea una ubicación para comenzar a organizar tu stock.':'Aquí aparecerán las ubicaciones que tengas asignadas.'}</p></div></td></tr>}
   </tbody></table></div>
  </div>
  <p className={styles.note}>{owner?'La empresa puede tener una bodega web y varias sucursales. El tipo de ubicación se define al crearla.':'Puedes configurar el envío desde tus sucursales activas asignadas.'}</p>
  {children}
 </div>;
}
