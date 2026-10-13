'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Modal from './modal';
type Company={name:string;slug:string;contact_email:string|null;contact_phone:string|null;about:string;primary_color:string;logo_url:string|null;reservation_minutes:number};
type Props={busy:boolean;setBusy:(value:boolean)=>void;request:(path:string,options?:RequestInit)=>Promise<any>};
export default function CompanyManager({busy,setBusy,request}:Props){
  const [company,setCompany]=useState<Company|null>(null),[editor,setEditor]=useState<'details'|'identity'|'orders'|null>(null),[notice,setNotice]=useState('');
  const [color,setColor]=useState('#155A83'),[uncertain,setUncertain]=useState(false);
  const saving=useRef(false);
  async function load(){const data=await request('settings/company');setCompany(data);setColor(data.primary_color);}
  async function refresh(){setBusy(true);setNotice('');try{await load();}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{void refresh();},[]);
  function edit(section:'details'|'identity'|'orders'){setColor(company!.primary_color);setUncertain(false);setNotice('');setEditor(section);}
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving.current||uncertain||!company)return;
    const form=new FormData(event.currentTarget);
    const payload=editor==='orders'?{reservationMinutes:Number(form.get('minutes'))}:editor==='identity'?{primaryColor:color,logoUrl:String(form.get('logo')??'').trim()||null,reason:form.get('reason')}:
      {name:form.get('name'),contactEmail:String(form.get('email')??'').trim()||null,contactPhone:String(form.get('phone')??'').trim()||null,about:form.get('about'),reason:form.get('reason')};
    saving.current=true;setBusy(true);setNotice('');
    try{
      const result=await request(editor==='orders'?'settings/orders':'settings/company',{method:'PATCH',body:JSON.stringify(payload)});
      setCompany(current=>current?editor==='orders'?{...current,reservation_minutes:result.reservationMinutes}:{...current,...result}:current);
      setEditor(null);setNotice('Configuración guardada.');
    }catch(error){const e=error as Error&{status?:number};if(!e.status)setUncertain(true);setNotice(e.status?e.message:'Se perdió la respuesta. Cierra la ventana y actualiza la configuración antes de repetir el cambio.');}
    finally{saving.current=false;setBusy(false);}
  }
  return <section><div className="section-heading"><h2>Configuración de empresa</h2><button disabled={busy} onClick={refresh}>Actualizar</button></div><p role="status" aria-live="polite">{notice}</p>
    {!company?<p>{busy?'Cargando configuración…':'Actualiza para cargar los datos de la empresa.'}</p>:<>
      <div className="entry-grid">
        <section><h3>Datos de la empresa</h3><p><strong>{company.name}</strong><br/>Identificador: {company.slug}</p><p>{company.contact_email||'Sin correo de contacto'}<br/>{company.contact_phone||'Sin teléfono de contacto'}</p><p>{company.about||'Sin descripción'}</p><button disabled={busy} onClick={()=>edit('details')}>Editar datos</button></section>
        <section><h3>Identidad visual</h3><p>Color principal: <strong>{company.primary_color}</strong></p><div style={{height:12,borderRadius:6,backgroundColor:company.primary_color}} aria-label={`Color ${company.primary_color}`}/><p>{company.logo_url?'Logotipo personalizado configurado':'Sin logotipo personalizado'}</p><p>Identidad guardada para la tienda de la empresa. El panel mantiene la identidad de Nexo.</p><button disabled={busy} onClick={()=>edit('identity')}>Editar identidad</button></section>
        <section><h3>Reservas de stock</h3><p><strong>{company.reservation_minutes} minutos</strong> para pagar un nuevo pedido reservado.</p><p>Al vencer, se liberan las unidades. Los pedidos ya creados conservan su vencimiento.</p><button disabled={busy} onClick={()=>edit('orders')}>Editar plazo</button></section>
      </div>
      {editor&&<Modal title={editor==='details'?'Datos de la empresa':editor==='identity'?'Identidad visual':'Plazo de reservas'} busy={busy} onClose={()=>setEditor(null)}>
        <p role="status" aria-live="polite">{notice}</p><form onSubmit={save}><fieldset disabled={busy||uncertain}>
          {editor==='details'&&<><label>Nombre de empresa<input name="name" required maxLength={200} defaultValue={company.name}/></label><label>Correo de contacto<input name="email" type="email" maxLength={254} defaultValue={company.contact_email??''}/></label><label>Teléfono de contacto<input name="phone" type="tel" maxLength={40} defaultValue={company.contact_phone??''}/></label><label>Descripción<textarea name="about" maxLength={2000} defaultValue={company.about}/></label><p>Identificador: {company.slug}. Se conserva para mantener los enlaces existentes.</p></>}
          {editor==='identity'&&<><label>Color principal<input name="color" type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><p>{color}</p><label>URL del logotipo<input name="logo" type="url" pattern="https://.*" defaultValue={company.logo_url??''} placeholder="https://…"/></label><p>Usa una imagen alojada en HTTPS. Deja el campo vacío para quitarla. La carga de archivos se incorporará en otro bloque.</p></>}
          {editor==='orders'?<><label>Minutos para pagar una reserva<input name="minutes" type="number" min={1} max={60} step={1} required defaultValue={company.reservation_minutes}/></label><p>Entre 1 y 60 minutos. El cambio se aplica a los pedidos que se creen después de guardarlo.</p></>:<label>Motivo del cambio<textarea name="reason" required minLength={3} maxLength={500}/></label>}
          <button>Guardar configuración</button>
        </fieldset></form>
      </Modal>}
    </>}
  </section>;
}
