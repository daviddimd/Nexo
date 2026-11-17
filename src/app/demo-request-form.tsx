"use client";
import {useState, type FormEvent} from 'react';
import {plans, type PlanId} from './planes/plans-data';
import styles from './planes/plans-page.module.css';

export type Interest = PlanId | 'a-medida';
export default function DemoRequestForm({interest, onInterestChange}: {interest: Interest | ''; onInterestChange: (interest: Interest) => void}) {
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState<{error:boolean; text:string}>();

 async function sendDemo(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if(busy)return;
  const form=event.currentTarget;
  const data=new FormData(form);
  setBusy(true);
  setFeedback(undefined);
  try{
   const response=await fetch('/api/public/demo-requests',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),name:data.get('name'),consent:data.has('consent'),website:data.get('website'),plan:interest}),
   });
   if(!response.ok){
    setFeedback({error:true,text:response.status===429?'Espera unos minutos antes de enviar otra solicitud.':'No pudimos guardar tu solicitud. Inténtalo de nuevo.'});
    return;
   }
   form.reset();
   setFeedback({error:false,text:'Tu solicitud quedó registrada.'});
  }catch{
   setFeedback({error:true,text:'No pudimos conectar con Nexo. Inténtalo de nuevo.'});
  }finally{setBusy(false);}
 }

 return     <form onSubmit={sendDemo}>
     <fieldset disabled={busy}>
      <label>Nombre o empresa<input name="name" autoComplete="name" maxLength={120} required/></label><label>Correo electrónico<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="tu@empresa.cl"/></label>
      <label>Plan de interés<select name="plan" required value={interest} onChange={event=>onInterestChange(event.target.value as Interest)}><option value="" disabled>Selecciona un plan</option>{plans.map(plan=><option key={plan.id} value={plan.id}>{plan.name}</option>)}<option value="a-medida">Cotización a medida</option></select></label>
      <div hidden><label>Sitio web<input name="website" tabIndex={-1} autoComplete="off"/></label></div><label className={styles.consent}><input name="consent" type="checkbox" required/><span>Acepto que Nexo use estos datos para responder mi solicitud. <a href="/legal/privacidad">Política de privacidad</a></span></label><button className={styles.primary} type="submit">{busy?'Enviando…':'Enviar solicitud'}</button>
     </fieldset>
     {feedback&&<p role={feedback.error?'alert':'status'}>{feedback.text}</p>}
    </form>
}
