"use client";
import {useRef,useState,type FormEvent} from 'react';
import type {CustomerProfile,TestCard} from './customer-types';
import {testCardBrand} from '../../catalog/test-card';
import styles from './store-account.module.css';
type Props={section:'info'|'address'|'payments';profile:CustomerProfile;cards:TestCard[];request:(path:string,options?:RequestInit)=>Promise<any>;onUpdated:()=>Promise<void>};
export default function CustomerSettings({section,profile,cards,request,onUpdated}:Props){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[prefix,setPrefix]=useState('');const saving=useRef(false);
 async function work(action:()=>Promise<void>){if(saving.current)return;saving.current=true;setBusy(true);setNotice('');try{await action();await onUpdated();setNotice('Cambios guardados.');}catch(error){setNotice((error as Error).message);}finally{saving.current=false;setBusy(false);}}
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);await work(async()=>{
  const next={name:profile.name,phone:profile.phone,defaultAddress:profile.defaultAddress,paymentPreference:profile.paymentPreference};
  if(section==='info'){next.name=String(data.get('name'));next.phone=String(data.get('phone'));}
  if(section==='address')next.defaultAddress=data.get('removeAddress')?null:{recipient:String(data.get('recipient')),phone:String(data.get('phone')),line1:String(data.get('line1')),commune:String(data.get('commune')),region:String(data.get('region')),country:'CL'};
  if(section==='payments')next.paymentPreference=data.get('paymentPreference') as 'CARD'|'TRANSFER';
  await request('customer/profile',{method:'PATCH',body:JSON.stringify(next)});
 });}
 async function addCard(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);await work(async()=>{await request('customer/test-cards',{method:'POST',body:JSON.stringify({label:data.get('label'),number:data.get('number')})});form.reset();setPrefix('');});}
 const [removeAddress,setRemoveAddress]=useState(false);
 return <div className={styles.customerSettings}><p role="status" aria-live="polite">{notice}</p>
 {section==='info'?<><span className={styles.eyebrow}>TU PERFIL</span><h3>Información personal</h3><form onSubmit={save}><fieldset disabled={busy}><label>Nombre<input name="name" defaultValue={profile.name} autoComplete="name" required maxLength={200}/></label><label>Correo<input value={profile.email} readOnly type="email"/></label><label>Teléfono<input name="phone" defaultValue={profile.phone} type="tel" autoComplete="tel" maxLength={30}/></label><button className={styles.primary}>Guardar información</button></fieldset></form></>:
 section==='address'?<><span className={styles.eyebrow}>ENTREGA</span><h3>Mi dirección</h3><p className={styles.intro}>Se completará automáticamente en tu próxima compra. La cobertura y el costo se comprueban al seleccionar el destino en el carrito.</p><form onSubmit={save}><fieldset disabled={busy}>
 {profile.defaultAddress&&<label className={styles.checkLabel}><input type="checkbox" name="removeAddress" checked={removeAddress} onChange={e=>setRemoveAddress(e.target.checked)}/> Quitar mi dirección guardada</label>}
 <fieldset disabled={removeAddress}>{[['recipient','Destinatario','name'],['phone','Teléfono','tel'],['line1','Dirección','street-address'],['commune','Ciudad o comuna','address-level2'],['region','Región','address-level1']].map(([name,label,autoComplete])=><label key={name}>{label}<input name={name} autoComplete={autoComplete} defaultValue={(profile.defaultAddress as any)?.[name]??(name==='recipient'?profile.name:name==='phone'?profile.phone:'')} required={!removeAddress} maxLength={name==='line1'?200:name==='phone'?30:100}/></label>)}</fieldset><button className={styles.primary}>{removeAddress?'Quitar dirección':'Guardar dirección'}</button></fieldset></form></>:
 <><span className={styles.eyebrow}>PAGO LOCAL</span><h3>Mis métodos de pago</h3><p className={styles.intro}>Estas tarjetas son ficticias y los pagos no realizan cargos. No ingreses datos de una tarjeta real.</p>
 <form onSubmit={save}><fieldset disabled={busy}><label>Método preferido<select name="paymentPreference" defaultValue={profile.paymentPreference??'TRANSFER'}><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta de prueba</option></select></label><button>Guardar preferencia</button></fieldset></form>
 <ul className={styles.savedCards}>{cards.map(card=><li key={card.id}><div><strong>{card.brand} ···· {card.last_four}</strong><small>{card.label}</small></div><button type="button" disabled={busy} onClick={()=>void work(async()=>{await request(`customer/test-cards/${card.id}`,{method:'PATCH',body:'{}'});})} aria-label={`Quitar ${card.label}, terminada en ${card.last_four}`}>Quitar</button></li>)}</ul>
 {!cards.length&&<p>No tienes tarjetas guardadas.</p>}
 <details className={styles.securityCard}><summary>Agregar tarjeta de prueba</summary><form onSubmit={addCard}><fieldset disabled={busy}><label>Nombre para identificarla<input name="label" placeholder="Mi tarjeta de pruebas" maxLength={80} required/></label><label>Número ficticio<input name="number" inputMode="numeric" autoComplete="off" placeholder="4000000000000010" minLength={12} maxLength={23} pattern="[0-9 -]{12,23}" onChange={e=>setPrefix(e.target.value.replace(/[^0-9]/g,'').slice(0,6))} required/></label><p className={styles.intro}>{prefix?`Marca: ${testCardBrand(prefix)}. `:''}Solo se guardan el prefijo, la marca y los últimos cuatro dígitos. No pedimos CVV.</p><button className={styles.primary} disabled={cards.length>=8}>Guardar tarjeta ficticia</button></fieldset></form></details>
 </>}
 </div>;
}
