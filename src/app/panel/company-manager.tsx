'use client';
import {IconButton} from '../action-icon';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import styles from './panel.module.css';
type Company={name:string;slug:string;contact_email:string|null;contact_phone:string|null;about:string;primary_color:string;logo_url:string|null;reservation_minutes:number};
type Props={category:'details'|'identity'|'orders';busy:boolean;setBusy:(value:boolean)=>void;request:(path:string,options?:RequestInit)=>Promise<any>};
export default function CompanyManager({category:editor,busy,setBusy,request}:Props){
  const [company,setCompany]=useState<Company|null>(null),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
  const [color,setColor]=useState('#155A83'),[uncertain,setUncertain]=useState(false);
  const [subcategory,setSubcategory]=useState<'information'|'edit'>('information');
  const saving=useRef(false);
  async function load(){const data=await request('settings/company');setCompany(data);setColor(data.primary_color);setUncertain(false);setRevision(value=>value+1);}
  async function refresh(){setBusy(true);setNotice('');try{await load();}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{void refresh();},[]);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving.current||uncertain||!company)return;
    const form=new FormData(event.currentTarget);
    const payload=editor==='orders'?{reservationMinutes:Number(form.get('minutes'))}:editor==='identity'?{primaryColor:color,logoUrl:String(form.get('logo')??'').trim()||null,reason:form.get('reason')}:
      {name:form.get('name'),contactEmail:String(form.get('email')??'').trim()||null,contactPhone:String(form.get('phone')??'').trim()||null,about:form.get('about'),reason:form.get('reason')};
    saving.current=true;setBusy(true);setNotice('');
    try{
      const result=await request(editor==='orders'?'settings/orders':'settings/company',{method:'PATCH',body:JSON.stringify(payload)});
      setCompany(current=>current?editor==='orders'?{...current,reservation_minutes:result.reservationMinutes}:{...current,...result}:current);
      setRevision(value=>value+1);setNotice('Configuración guardada.');if(editor==='details')setSubcategory('information');
    }catch(error){const e=error as Error&{status?:number};if(!e.status)setUncertain(true);setNotice(e.status?e.message:'Se perdió la respuesta. Actualiza la configuración antes de repetir el cambio.');}
    finally{saving.current=false;setBusy(false);}
  }
  const title=editor==='details'?'Datos de la empresa':editor==='identity'?'Identidad visual':'Reservas de stock';
  return <section><div className="section-heading"><h2>{title}</h2><IconButton icon="refresh" label="Actualizar configuración" disabled={busy} onClick={refresh}/></div>
    {editor==='details'&&<nav className={styles.settingsSubnav} aria-label="Opciones de empresa"><button disabled={busy} aria-pressed={subcategory==='information'} onClick={()=>setSubcategory('information')}>Información</button><button disabled={busy} aria-pressed={subcategory==='edit'} onClick={()=>setSubcategory('edit')}>Editar datos</button></nav>}
    <p role="status" aria-live="polite">{notice}</p>
    {!company?<p>{busy?'Cargando configuración…':'Actualiza para cargar los datos de la empresa.'}</p>:<>
        {editor==='details'&&subcategory==='information'?<dl className={styles.settingsInformation}><div><dt>Nombre de empresa</dt><dd>{company.name}</dd></div><div><dt>Identificador</dt><dd>{company.slug}</dd></div><div><dt>Correo de contacto</dt><dd>{company.contact_email||'Sin registrar'}</dd></div><div><dt>Teléfono de contacto</dt><dd>{company.contact_phone||'Sin registrar'}</dd></div><div><dt>Descripción</dt><dd>{company.about||'Sin descripción'}</dd></div></dl>:<form key={revision} onSubmit={save}><fieldset disabled={busy||uncertain}>
          {editor==='details'&&<><label>Nombre de empresa<input name="name" required maxLength={200} defaultValue={company.name}/></label><label>Correo de contacto<input name="email" type="email" maxLength={254} defaultValue={company.contact_email??''}/></label><label>Teléfono de contacto<input name="phone" type="tel" maxLength={40} defaultValue={company.contact_phone??''}/></label><label>Descripción<textarea name="about" maxLength={2000} defaultValue={company.about}/></label><p>Identificador: {company.slug}. Se conserva para mantener los enlaces existentes.</p></>}
          {editor==='identity'&&<><label>Color principal<input name="color" type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><p>{color}</p><label>URL del logotipo<input name="logo" type="url" pattern="https://.*" defaultValue={company.logo_url??''} placeholder="https://…"/></label><p>Usa una imagen alojada en HTTPS. Deja el campo vacío para quitarla. La carga de archivos se incorporará en otro bloque.</p></>}
          {editor==='orders'?<><label>Minutos para pagar una reserva<input name="minutes" type="number" min={1} max={60} step={1} required defaultValue={company.reservation_minutes}/></label><p>Entre 1 y 60 minutos. El cambio se aplica a los pedidos que se creen después de guardarlo.</p></>:<label>Motivo del cambio<textarea name="reason" required minLength={3} maxLength={500}/></label>}
          <button>Guardar configuración</button>
        </fieldset></form>}
    </>}
  </section>;
}
