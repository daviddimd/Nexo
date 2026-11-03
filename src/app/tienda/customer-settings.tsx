"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {AddressEntry,CardDetails,CustomerProfile,TestCard} from './customer-types';
import {testCardBrand} from '../../catalog/test-card';
import {cardExpiryValid,cardSecurityCodeValid} from '../../catalog/card-format';
import {ActionIcon} from '../action-icon';
import styles from './customer-settings.module.css';

type Request=(path:string,options?:RequestInit)=>Promise<any>;
type Props={section:'info'|'address'|'payments';profile:CustomerProfile;cards:TestCard[];request:Request;onUpdated:()=>Promise<void>};

function SavedCard({card,request,locked,onRemove}:{card:TestCard;request:Request;locked:boolean;onRemove:()=>void}){
 const [open,setOpen]=useState(false),[details,setDetails]=useState<CardDetails|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 useEffect(()=>{
  if(!details)return;
  const hide=()=>{setDetails(null);setOpen(false);};
  const timer=setTimeout(hide,Math.max(0,new Date(details.expiresAt).getTime()-Date.now()));
  const visibility=()=>{if(document.hidden)hide();};
  document.addEventListener('visibilitychange',visibility);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
 },[details]);
 async function unlock(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;
  const form=event.currentTarget,data=new FormData(form);
  pending.current=true;setBusy(true);setError('');
  try{
   const result=await request('customer/test-cards/'+card.id+'/reveal',{method:'POST',body:JSON.stringify({password:data.get('password')})});
   form.reset();setDetails(result);setOpen(false);
  }catch(error){setError((error as Error).message);}
  finally{pending.current=false;setBusy(false);}
 }
 return <li className={styles.cardTile}>
  <div className={styles.cardTop}><span className={styles.cardBrand}>{card.brand}</span><ActionIcon name="security" size={18}/></div>
  <strong className={styles.cardNumber}>•••• &nbsp;•••• &nbsp;•••• &nbsp;{card.last_four}</strong>
  <div className={styles.cardMeta}>
   <span><small>Titular</small><b>{details?.holder??'•••• ••••'}</b></span>
   <span><small>Vencimiento</small><b>{details?.expiryMonth?String(details.expiryMonth).padStart(2,'0')+'/'+String(details.expiryYear).slice(-2):'•• / ••'}</b></span>
  </div>
  <div className={styles.cardActions}><span>{card.label}</span>
   <button type="button" disabled={busy||locked} onClick={()=>{if(details){setDetails(null);setOpen(false);}else{setOpen(!open);setError('');}}}>{details?'Ocultar':open?'Cancelar':'Ver datos'}</button>
   <button type="button" disabled={busy||locked} onClick={onRemove} aria-label={'Quitar '+card.brand+' terminada en '+card.last_four}>Quitar</button>
  </div>
  {details&&<p className={styles.finePrint}>{details.holder?'Los datos se ocultarán en 30 segundos. El número permanece protegido.':'Completa el titular y el vencimiento añadiendo nuevamente esta tarjeta.'}</p>}
  {open&&<form className={styles.unlock} onSubmit={unlock}><fieldset disabled={busy||locked}><label>Confirma tu contraseña<input name="password" type="password" autoComplete="current-password" required maxLength={128} autoFocus/></label><p className={styles.finePrint}>Permite ver el titular y el vencimiento durante 30 segundos.</p>{error&&<p role="alert" className={styles.error}>{error}</p>}<button className={styles.secondary} type="submit">{busy?'Verificando…':'Desbloquear datos'}</button></fieldset></form>}
 </li>;
}

export default function CustomerSettings({section,profile,cards,request,onUpdated}:Props){
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false);
 const [editor,setEditor]=useState<AddressEntry|null|undefined>(undefined);
 const [addCard,setAddCard]=useState(false),[prefix,setPrefix]=useState(''),[removeId,setRemoveId]=useState('');
 const saving=useRef(false);
 const addresses=profile.addresses??[];
 const brand=prefix?testCardBrand(prefix):'Tarjeta';
 async function work(action:()=>Promise<void>){
  if(saving.current)return;
  saving.current=true;setBusy(true);setNotice('');setFailed(false);
  try{await action();await onUpdated();setNotice('Cambios guardados.');}
  catch(error){setFailed(true);setNotice((error as Error).message);}
  finally{saving.current=false;setBusy(false);}
 }
 async function saveInfo(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const data=new FormData(event.currentTarget);
  await work(async()=>{await request('customer/profile',{method:'PATCH',body:JSON.stringify({name:data.get('name'),phone:data.get('phone')})});});
 }
 async function saveAddress(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const data=new FormData(event.currentTarget);
  const address={recipient:data.get('recipient'),phone:data.get('phone'),line1:data.get('line1'),commune:data.get('commune'),region:data.get('region'),country:'CL'};
  await work(async()=>{
   await request('customer/addresses'+(editor?'/'+editor.id:''),{method:editor?'PATCH':'POST',body:JSON.stringify({label:data.get('label'),address,isDefault:!!data.get('isDefault')})});
   setEditor(undefined);
  });
 }
 async function saveCard(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,data=new FormData(form);
  const number=String(data.get('number')).replace(/[ -]/g,''),expiry=String(data.get('expiry')).split('/');
  const expiryMonth=Number(expiry[0]),expiryYear=2000+Number(expiry[1]),cvv=String(data.get('cvv'));
  if(!cardExpiryValid(expiryMonth,expiryYear)||!cardSecurityCodeValid(number,cvv)){
   setFailed(true);setNotice('Revisa el vencimiento y el código de seguridad de la tarjeta.');return;
  }
  await work(async()=>{
   await request('customer/test-cards',{method:'POST',body:JSON.stringify({label:String(data.get('label')??'').trim()||testCardBrand(number),holder:data.get('holder'),number,expiryMonth,expiryYear,cvv})});
   form.reset();setPrefix('');setAddCard(false);
  });
 }
 const titles={info:['Información personal','Los datos que usas en tus compras.'],address:['Mis direcciones','Elige dónde quieres recibir tu próxima compra.'],payments:['Métodos de pago','Tus tarjetas y tu forma de pago preferida.']} as const;
 return <section className={styles.settings}>
  <header className={styles.heading}><div><h3>{titles[section][0]}</h3><p>{titles[section][1]}</p></div>
   {section==='address'&&editor===undefined&&<button type="button" className={styles.secondary} disabled={busy||addresses.length>=20} onClick={()=>{setEditor(null);setNotice('');}}>+ Añadir dirección</button>}
   {section==='payments'&&!addCard&&<button type="button" className={styles.secondary} disabled={busy||cards.length>=8} onClick={()=>{setAddCard(true);setNotice('');}}>+ Añadir tarjeta</button>}
  </header>
  {notice&&<p className={failed?styles.error:styles.notice} role={failed?'alert':'status'}>{notice}</p>}
  {section==='info'&&<form className={styles.form} onSubmit={saveInfo}><fieldset disabled={busy}>
   <div className={styles.fields}><label>Nombre completo<input name="name" defaultValue={profile.name} autoComplete="name" required maxLength={200}/></label><label>Teléfono<input name="phone" defaultValue={profile.phone} type="tel" autoComplete="tel" maxLength={30}/></label><label className={styles.full}>Correo electrónico<input value={profile.email} readOnly type="email" aria-describedby="profile-email-help"/><small id="profile-email-help">Es el correo con el que inicias sesión.</small></label></div>
   <div className={styles.formActions}><button className={styles.primary}>{busy?'Guardando…':'Guardar cambios'}</button></div>
  </fieldset></form>}
  {section==='address'&&<>
   {editor!==undefined?<form className={styles.form} key={editor?.id??'new'} onSubmit={saveAddress}><fieldset disabled={busy}>
    <h4>{editor?'Editar dirección':'Nueva dirección'}</h4>
    <div className={styles.fields}>
     <label className={styles.full}>Nombre de la dirección<input name="label" defaultValue={editor?.label??''} placeholder="Casa, trabajo…" required maxLength={60}/></label>
     {[['recipient','Destinatario','name'],['phone','Teléfono','tel'],['line1','Calle, número y departamento','street-address'],['commune','Ciudad o comuna','address-level2'],['region','Región','address-level1']].map(([name,label,autoComplete])=><label key={name} className={name==='line1'?styles.full:undefined}>{label}<input name={name} type={name==='phone'?'tel':'text'} autoComplete={autoComplete} defaultValue={(editor?.address as any)?.[name]??(name==='recipient'?profile.name:name==='phone'?profile.phone:'')} required minLength={name==='line1'?5:name==='recipient'?3:undefined} maxLength={name==='line1'?200:name==='phone'?30:100} pattern={name==='phone'?'[+0-9 ()-]{7,30}':undefined}/></label>)}
    </div>
    <label className={styles.check}><input name="isDefault" type="checkbox" defaultChecked={!addresses.length||editor?.isDefault} disabled={editor?.isDefault}/> Usar como dirección predeterminada</label>
    <div className={styles.formActions}><button className={styles.primary}>{busy?'Guardando…':'Guardar dirección'}</button><button type="button" className={styles.textButton} onClick={()=>setEditor(undefined)}>Cancelar</button></div>
   </fieldset></form>:<>
    <ul className={styles.addressList}>{addresses.map(entry=><li key={entry.id} className={styles.addressTile}>
     <div className={styles.addressTop}><span className={styles.locationIcon}><ActionIcon name="company" size={20}/></span><strong>{entry.label}</strong>{entry.isDefault&&<span className={styles.badge}>Predeterminada</span>}</div>
     <p>{entry.address.line1}<br/>{entry.address.commune}, {entry.address.region}</p><small>{entry.address.recipient} · {entry.address.phone}</small>
     <div className={styles.rowActions}><button type="button" disabled={busy} onClick={()=>setEditor(entry)}>Editar</button>{!entry.isDefault&&<button type="button" disabled={busy} onClick={()=>void work(async()=>{await request('customer/addresses/'+entry.id,{method:'PATCH',body:JSON.stringify({label:entry.label,address:entry.address,isDefault:true})});})}>Usar por defecto</button>}<button type="button" disabled={busy} onClick={()=>setRemoveId(entry.id)}>Eliminar</button></div>
     {removeId===entry.id&&<div className={styles.confirm}><span>¿Eliminar esta dirección?</span><button type="button" disabled={busy} onClick={()=>void work(async()=>{await request('customer/addresses/'+entry.id,{method:'DELETE'});setRemoveId('');})}>Eliminar</button><button type="button" disabled={busy} onClick={()=>setRemoveId('')}>Cancelar</button></div>}
    </li>)}</ul>
    {!addresses.length&&<div className={styles.empty}><ActionIcon name="company" size={28}/><h4>Aún no tienes direcciones</h4><p>Añade tu casa o tu lugar de trabajo.</p></div>}
   </>}
  </>}
  {section==='payments'&&<>
   <div className={styles.preference}><span>Pago preferido</span><div role="group" aria-label="Método de pago preferido">{(['CARD','TRANSFER'] as const).map(method=><button type="button" key={method} disabled={busy} aria-pressed={(profile.paymentPreference??'TRANSFER')===method} onClick={()=>void work(async()=>{await request('customer/profile',{method:'PATCH',body:JSON.stringify({paymentPreference:method})});})}>{method==='CARD'?'Tarjeta':'Transferencia'}</button>)}</div></div>
   {addCard&&<form className={styles.form} onSubmit={saveCard}><fieldset disabled={busy}><div className={styles.formHeading}><h4>Nueva tarjeta</h4><span className={styles.brandPreview} aria-live="polite">{brand}</span></div>
    <div className={styles.fields}>
     <label className={styles.full}>Número de tarjeta<input name="number" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" required minLength={12} maxLength={23} pattern="[0-9 -]{12,23}" onChange={event=>setPrefix(event.target.value.replace(/[^0-9]/g,'').slice(0,6))}/></label>
     <label className={styles.full}>Nombre del titular<input name="holder" autoComplete="cc-name" defaultValue={profile.name} required minLength={2} maxLength={100}/></label>
     <label>Vencimiento<input name="expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" required maxLength={5} pattern="(0[1-9]|1[0-2])/[0-9]{2}" onChange={event=>{const digits=event.target.value.replace(/\D/g,'').slice(0,4);event.target.value=digits.length>2?digits.slice(0,2)+'/'+digits.slice(2):digits;}}/></label>
     <label>CVV<input name="cvv" type="password" inputMode="numeric" autoComplete="off" placeholder={brand==='American Express'?'4 dígitos':'3 dígitos'} required minLength={brand==='American Express'?4:3} maxLength={brand==='American Express'?4:brand==='Tarjeta'?4:3} pattern={brand==='American Express'?'[0-9]{4}':brand==='Tarjeta'?'[0-9]{3,4}':'[0-9]{3}'}/></label>
     <label className={styles.full}>Nombre para identificarla <small>Opcional</small><input name="label" placeholder="Mi tarjeta" maxLength={80}/></label>
    </div>
    <p className={styles.finePrint}>El CVV no se guarda. El número se conserva únicamente como identificador enmascarado.</p>
    <div className={styles.formActions}><button className={styles.primary}>{busy?'Guardando…':'Guardar tarjeta'}</button><button className={styles.textButton} type="button" onClick={()=>{setAddCard(false);setPrefix('');}}>Cancelar</button></div>
   </fieldset></form>}
   <ul className={styles.cards}>{cards.map(card=><SavedCard key={card.id} card={card} request={request} locked={busy} onRemove={()=>setRemoveId(card.id)}/>)}</ul>
   {removeId&&<div className={styles.confirm}><span>¿Quitar esta tarjeta de tu cuenta?</span><button type="button" disabled={busy} onClick={()=>void work(async()=>{await request('customer/test-cards/'+removeId,{method:'PATCH',body:'{}'});setRemoveId('');})}>Quitar tarjeta</button><button type="button" disabled={busy} onClick={()=>setRemoveId('')}>Cancelar</button></div>}
   {!cards.length&&!addCard&&<div className={styles.empty}><ActionIcon name="security" size={28}/><h4>Aún no tienes tarjetas</h4><p>Añade una para seleccionarla en tu próxima compra.</p></div>}
   <p className={styles.paymentNote}>Los pagos de esta instalación son simulados; no se realizan cargos.</p>
  </>}
 </section>;
}
