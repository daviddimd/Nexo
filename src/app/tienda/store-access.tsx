"use client";
import {useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import Link from 'next/link';
import {storeLogo} from './store-identity';
import AnimatedAccessInput from './animated-access-input';
import styles from './store-account.module.css';

type Props={
 noticeKind?:'info'|'error'|'success';succeeded?:boolean;compact?:boolean;inPlace?:boolean;showBrand?:boolean;modeHref?:(mode:string)=>string;company:string;slug:string;busy:boolean;notice:string;mode:string;
 copy:{description:string;action:string};
 onMode:(mode:string)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
};
function Eye({visible}:{visible:boolean}){
 return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path className={styles.eyeSlash} data-visible={visible} pathLength="1" d="m3 3 18 18"/></svg>;
}
export default function StoreAccess({noticeKind='info',succeeded=false,compact=false,inPlace=false,showBrand=true,modeHref,company,slug,busy,notice,mode,copy,onMode,onSubmit}:Props){
 const [showPassword,setShowPassword]=useState(false);
 const form=useRef<HTMLFormElement>(null),noticeElement=useRef<HTMLParagraphElement>(null);
 const passwordInput=useRef<HTMLInputElement>(null);
 const passwordChanged=useRef(false),invalidFrame=useRef<number|null>(null);
 const motions=useRef(new Map<Element,Animation>());
 function motion(element:Element|null,frames:Keyframe[],duration:number){
  if(!element||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  motions.current.get(element)?.cancel();
  const animation=element.animate(frames,{duration,easing:'cubic-bezier(.23,1,.32,1)'});
  motions.current.set(element,animation);
  void animation.finished.then(()=>{if(motions.current.get(element)===animation)motions.current.delete(element);},()=>{});
 }
 useEffect(()=>()=>{motions.current.forEach(animation=>animation.cancel());if(invalidFrame.current!==null)cancelAnimationFrame(invalidFrame.current);},[]);
 useEffect(()=>{
  if(!notice)return;
  motion(noticeElement.current,[{opacity:0,transform:'translateY(-3px)'},{opacity:1,transform:'translateY(0)'}],180);
  if(noticeKind==='error')motion(form.current,[{transform:'translateX(0)'},{transform:'translateX(-4px)',offset:.25},{transform:'translateX(3px)',offset:.5},{transform:'translateX(-2px)',offset:.75},{transform:'translateX(0)'}],240);
 },[notice,noticeKind]);
 useLayoutEffect(()=>{
  if(!passwordChanged.current)return;
  // Reveal the native input without duplicating the password in a visual overlay.
  if(showPassword)motion(passwordInput.current,[{opacity:.15},{opacity:1}],280);
  else if(passwordInput.current)motions.current.get(passwordInput.current)?.cancel();
 },[showPassword]);
 function invalid(field:HTMLInputElement){
  field.setAttribute('aria-invalid','true');
  // Native validation still focuses the field and announces its precise error.
  if(invalidFrame.current!==null)return;
  invalidFrame.current=requestAnimationFrame(()=>{
   invalidFrame.current=null;
   motion(field,[{transform:'translateX(0)'},{transform:'translateX(-3px)',offset:.3},{transform:'translateX(2px)',offset:.65},{transform:'translateX(0)'}],200);
  });
 }
 const isLogin=mode==='login',isRegister=mode==='register',isAccess=isLogin||isRegister;
 const logo=storeLogo(slug);
 function ModeLink({next,children,className}:{next:string;children:ReactNode;className?:string}){
  return modeHref?<Link href={modeHref(next)} className={className} aria-disabled={busy||undefined} onClick={event=>{if(busy){event.preventDefault();return;}if(inPlace&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onMode(next);}}}>{children}</Link>:<button type="button" className={className} disabled={busy} onClick={()=>onMode(next)}>{children}</button>;
 }

 return <div className={styles.accessForm}>
  {showBrand&&<div className={styles.accessBrand}>{logo?<img src={logo} alt={company} width={146} height={36}/>:<span>{company}</span>}</div>}
  {!compact&&<p className={styles.accessIntro}>{copy.description}</p>}
  {notice&&<p ref={noticeElement} className={styles.accessNotice} data-kind={noticeKind} role={noticeKind==='error'?'alert':'status'} aria-live={noticeKind==='error'?'assertive':'polite'}>{notice}</p>}
  <form ref={form} onSubmit={onSubmit} aria-busy={busy}
   onInvalidCapture={event=>{if(event.target instanceof HTMLInputElement)invalid(event.target);}}
   onInputCapture={event=>{const field=event.target;if(field instanceof HTMLInputElement){field.dataset.filled=String(field.value.length>0);if(field.validity.valid)field.removeAttribute('aria-invalid');}}}>
   <fieldset disabled={busy}>
    {isRegister&&<label className={styles.accessField}>Nombre completo<AnimatedAccessInput name="name" required maxLength={200} autoComplete="name" placeholder="¿Cómo te llamas?"/></label>}
    {!['verify','reset'].includes(mode)&&<label className={styles.accessField}>Correo electrónico<AnimatedAccessInput name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="nombre@correo.cl"/></label>}
    {['verify','reset'].includes(mode)&&<label className={styles.accessField}>Código de verificación<AnimatedAccessInput name="token" required autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} placeholder="Ingresa tu código"/></label>}
    {(isAccess||mode==='reset')&&<div className={styles.passwordGroup}>
     <div className={styles.passwordCaption}><label htmlFor="store-access-password">{mode==='reset'?'Nueva contraseña':'Contraseña'}</label>{isLogin&&<ModeLink next="forgot">¿La olvidaste?</ModeLink>}</div>
     <div className={styles.passwordInput}><AnimatedAccessInput ref={passwordInput} id="store-access-password" name="password" type={showPassword?'text':'password'} minLength={isLogin?1:12} maxLength={128} required autoComplete={isLogin?'current-password':'new-password'} placeholder={isLogin?'Tu contraseña':'Al menos 12 caracteres'}/><button type="button" disabled={busy} onClick={()=>{passwordChanged.current=true;setShowPassword(value=>!value);}} aria-label={showPassword?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={showPassword}><Eye visible={showPassword}/></button></div>
     {!isLogin&&<small>Usa al menos 12 caracteres.</small>}
    </div>}
    <button type="submit" className={styles.accessSubmit} data-success={succeeded}>{succeeded?<><svg className={styles.accessCheck} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>Sesión iniciada</>:busy?<><span className={styles.accessSpinner} aria-hidden="true"/>Procesando…</>:copy.action}</button>
   </fieldset>
  </form>
  {isAccess?!compact&&<p className={styles.accessSwitch}>{isRegister?'¿Ya tienes una cuenta?':'¿Primera vez por aquí?'} <ModeLink next={isRegister?'login':'register'}>{isRegister?'Inicia sesión':'Crea tu cuenta'}</ModeLink></p>:<ModeLink className={styles.accessBack} next="login"><span aria-hidden="true">←</span> Volver a iniciar sesión</ModeLink>}
  <details className={styles.accessSupport} onToggle={event=>{
   if(event.currentTarget.open)motion(event.currentTarget.querySelector('div'),[{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],200);
  }}><summary>Ayuda con tu cuenta</summary><div>{[['verify','Ingresar código de verificación'],['resend','Reenviar código de verificación'],['reset','Restablecer con un código']].map(([value,label])=><ModeLink key={value} next={value}>{label}</ModeLink>)}</div></details>
 </div>;
}
