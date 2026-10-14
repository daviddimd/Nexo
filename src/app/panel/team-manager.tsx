'use client';
import {IconButton} from '../action-icon';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Modal from './modal';
import RowActions from './row-actions';
import styles from './panel.module.css';
import type {ManagedLocation} from './catalog-manager';

type Account={id:string;name:string;email:string;role:'OWNER'|'AGENT'|'CUSTOMER';active:boolean;locationIds:string[]};
type Props={viewerId:string;locations:ManagedLocation[];busy:boolean;setBusy:(value:boolean)=>void;request:(path:string,options?:RequestInit)=>Promise<any>};
const roleNames={OWNER:'Propietario',AGENT:'Agente',CUSTOMER:'Cliente'};
export default function TeamManager({viewerId,locations,busy,setBusy,request}:Props){
  const [accounts,setAccounts]=useState<Account[]>([]),[page,setPage]=useState(0),[loaded,setLoaded]=useState(false),[notice,setNotice]=useState('');
  const [editor,setEditor]=useState<'account'|'password'|null>(null),[selected,setSelected]=useState<Account|null>(null);
  const [assignments,setAssignments]=useState<string[]>([]),[uncertain,setUncertain]=useState(false);
  const saving=useRef(false);
  async function load(p=page){const data=await request(`users?limit=25&offset=${p*25}`);setAccounts(data.items);setPage(p);setLoaded(true);}
  async function refresh(p=page){setBusy(true);setNotice('');try{await load(p);}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{void refresh(0);},[]);
  function edit(account:Account|null,mode:'account'|'password'='account'){
    setSelected(account);setAssignments(account?.locationIds??[]);setUncertain(false);setNotice('');setEditor(mode);
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving.current||uncertain)return;
    const form=new FormData(event.currentTarget),password=String(form.get('password')??'');
    if((!selected||editor==='password')&&password!==form.get('confirmation')){setNotice('Las contraseñas no coinciden.');return;}
    const assignmentChanged=selected&&JSON.stringify([...assignments].sort())!==JSON.stringify([...selected.locationIds].sort());
    const self=selected?.id===viewerId;
    const payload=editor==='password'?{password,reason:form.get('reason')}:
      selected?{name:form.get('name'),...(!self?{email:form.get('email'),active:form.has('active')}:{}),...(selected.role==='AGENT'&&assignmentChanged?{locationIds:assignments}:{}),reason:form.get('reason')}:
      {name:form.get('name'),email:form.get('email'),password,role:'AGENT',locationIds:assignments};
    saving.current=true;setBusy(true);setNotice('');let applied=false;
    try{
      await request(selected?`users/${selected.id}${editor==='password'?'/password':''}`:'users',{method:selected&&editor!=='password'?'PATCH':'POST',body:JSON.stringify(payload)});
      applied=true;setEditor(null);setNotice(editor==='password'?'Contraseña restablecida. Las sesiones anteriores se cerraron.':selected?'Cuenta actualizada.':'Agente creado.');
      try{await load(selected?page:0);}catch{setNotice('Cambio guardado. Pulsa Actualizar para recargar el listado.');}
    }catch(error){
      const e=error as Error&{status?:number};
      if(!e.status&&!applied)setUncertain(true);
      setNotice(e.status?e.message:'Se perdió la respuesta. Cierra esta ventana y actualiza el listado antes de repetir el cambio.');
    }finally{saving.current=false;setBusy(false);}
  }
  return <section><div className="section-heading"><h2>Equipo y accesos</h2><div className={styles.teamToolbar}><IconButton icon="refresh" label="Actualizar equipo" disabled={busy} onClick={()=>refresh()}/><button disabled={busy} onClick={()=>edit(null)}>Nuevo agente</button></div></div>
    <p>Administra las cuentas de tu empresa y las ubicaciones en las que puede operar cada agente.</p>
    <p role="status" aria-live="polite">{notice}</p>
    <div className="table-scroll"><table className={styles.teamTable}><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Ubicaciones</th><th>Estado</th><th className={styles.rowMenuCell}><span className={styles.srOnly}>Opciones de cuenta</span></th></tr></thead><tbody>
      {accounts.map(account=><tr key={account.id}><td>{account.name}{account.id===viewerId&&<small> · Tú</small>}</td><td>{account.email}</td><td>{roleNames[account.role]}</td><td>{account.role==='OWNER'?'Todas':account.role==='CUSTOMER'?'Sin acceso al panel':account.locationIds.map(id=>locations.find(l=>l.id===id)?.name??'Ubicación no disponible').join(', ')||'Sin asignar'}</td><td>{account.active?'Activa':'Inactiva'}</td><td className={styles.rowMenuCell}><RowActions name={account.name} disabled={busy} onEdit={()=>edit(account)} onPassword={account.id!==viewerId?()=>edit(account,'password'):undefined}/></td></tr>)}
      {!accounts.length&&<tr><td colSpan={6}>{loaded?'No hay cuentas en esta página.':'Cargando cuentas…'}</td></tr>}
    </tbody></table></div>
    <nav aria-label="Páginas del equipo"><IconButton icon="previous" label="Página anterior" disabled={busy||page===0} onClick={()=>refresh(page-1)}/><span>Página {page+1}</span><IconButton icon="next" label="Página siguiente" disabled={busy||accounts.length<25} onClick={()=>refresh(page+1)}/></nav>
    {editor&&<Modal title={editor==='password'?`Restablecer contraseña · ${selected?.name}`:selected?`Editar cuenta · ${selected.name}`:'Crear agente'} busy={busy} onClose={()=>setEditor(null)}>
      <p role="status" aria-live="polite">{notice}</p>
      <form onSubmit={save}><fieldset disabled={busy||uncertain}>
        {editor==='account'&&<><label>Nombre<input name="name" required maxLength={200} defaultValue={selected?.name??''}/></label><label>Correo<input name="email" type="email" required maxLength={254} autoComplete="off" defaultValue={selected?.email??''} disabled={selected?.id===viewerId}/></label>
          {selected&&<><p>Rol: {roleNames[selected.role]}</p><label><input type="checkbox" name="active" defaultChecked={selected.active} disabled={selected.id===viewerId}/> Cuenta activa</label></>}
          {(!selected||selected.role==='AGENT')&&<><h3>Ubicaciones asignadas</h3><p>El agente solo podrá operar en estas ubicaciones.</p>{locations.filter(l=>l.active||assignments.includes(l.id)).map(location=><label key={location.id}><input type="checkbox" checked={assignments.includes(location.id)} onChange={e=>setAssignments(current=>e.target.checked?[...current,location.id]:current.filter(id=>id!==location.id))}/>{location.name}{!location.active?' (inactiva; quita esta asignación si necesitas modificar ubicaciones)':''}</label>)}{!assignments.length&&<p>Sin ubicaciones asignadas, el agente no podrá realizar operaciones de stock.</p>}</>}
          {selected?.id===viewerId&&<p>Desde aquí puedes cambiar tu nombre. Tu acceso de propietario se conserva.</p>}
        </>}
        {(!selected||editor==='password')&&<><label>{selected?'Nueva contraseña':'Contraseña inicial'}<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><label>Confirmar contraseña<input name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><p>Usa al menos 12 caracteres. Esta pantalla no envía correos.</p></>}
        {selected&&<label>Motivo del cambio<textarea name="reason" required minLength={3} maxLength={500}/></label>}
        {editor==='password'&&<p>Se cerrarán las sesiones abiertas de esta cuenta.</p>}
        <button>{editor==='password'?'Restablecer contraseña':selected?'Guardar cuenta':'Crear agente'}</button>
      </fieldset></form>
    </Modal>}
  </section>;
}
