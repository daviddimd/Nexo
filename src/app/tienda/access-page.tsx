"use client";
import {useEffect,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import StoreAccess from './store-access';
import {accessCopy} from './store-access-copy';
import {storeLogo,storeTheme} from './store-identity';
import {storeAccessPath,storeReturnPath,storeHome,type AccessMode} from '../../catalog/store-access-paths';
import TechnologySignature from '../technology-signature';
import styles from './access-page.module.css';

type Props={
 company:{id:string;slug:string;name:string;logo_url:string|null;primary_color:string|null};
 mode:AccessMode;
 returnTo:string;
};

export default function StoreAccessPage({company,mode:initialMode,returnTo}:Props){
 const router=useRouter(),saving=useRef(false);
 const [mode,setMode]=useState<AccessMode>(initialMode);
 const content=useRef<HTMLDivElement>(null),first=useRef(true),pointerMotion=useRef(true),email=useRef('');

 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [noticeKind,setNoticeKind]=useState<'info'|'error'|'success'>('info');
 const [succeeded,setSucceeded]=useState(false);
 const [prismPaused,setPrismPaused]=useState(false);
 const exitAnimation=useRef<Animation|null>(null);
 useEffect(()=>()=>exitAnimation.current?.cancel(),[]);
 const copy=accessCopy[mode],target=storeReturnPath(returnTo,company.slug),logo=storeLogo(company.slug,company.logo_url);
 const isPrimary=mode==='login'||mode==='register';


 useEffect(()=>{setMode(initialMode);},[initialMode]);
 useEffect(()=>{
  const restore=()=>{
   const url=new URL(window.location.href),aux=url.searchParams.get('modo');
   setMode(url.pathname.endsWith('/crear-cuenta')?'register':
    ['forgot','resend','verify','reset'].includes(aux??'')?aux as AccessMode:'login');
  };
  window.addEventListener('popstate',restore);
  return ()=>window.removeEventListener('popstate',restore);
 },[]);
 useLayoutEffect(()=>{
  setNotice('');
  const field=content.current?.querySelector<HTMLInputElement>('input[name="email"]');
  if(field)field.value=email.current;
  if(first.current){first.current=false;return;}
  if(!pointerMotion.current||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const animation=content.current?.animate(
   [{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],
   {duration:220,easing:'cubic-bezier(.23,1,.32,1)'});
  return ()=>animation?.cancel();
 },[mode]);

 async function api(path:string,body:unknown){
  const response=await fetch('/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error?.message??'No se pudo completar la solicitud');
  return result;
 }

 async function finish(user:{company_id:string;role:string}){
  if(user.company_id!==company.id||user.role!=='CUSTOMER')throw Error('Para comprar necesitas una cuenta de cliente de esta tienda.');
  setSucceeded(true);setNoticeKind('success');setNotice('Sesión iniciada. Ya estás dentro.');
  router.prefetch(target);
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&content.current){
   exitAnimation.current=content.current.animate([{opacity:1},{opacity:.65}],{duration:220,easing:'cubic-bezier(.23,1,.32,1)'});
   try{await exitAnimation.current.finished;}catch{return;}
  }
  router.replace(target);
 }

 function navigate(next:string,fromSubmit=false){
  if((saving.current&&!fromSubmit)||next===mode)return;
  setNotice('');setMode(next as AccessMode);
  // Keep reloads and browser Back working without a server round trip.
  window.history.pushState(null,'',storeAccessPath(next as AccessMode,company.slug,target));
 }

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(saving.current)return;
  const data=new FormData(event.currentTarget);
  saving.current=true;setBusy(true);setNotice('');setSucceeded(false);setNoticeKind('info');
  try{
   const base={company:company.slug,email:data.get('email')};
   if(mode==='login'){await finish((await api('auth/login',{...base,password:data.get('password')})).user);return;}
   if(mode==='register'){
    const result=await api('auth/register',{...base,name:data.get('name'),password:data.get('password')});
    if(result.verificationRequired===false){await finish((await api('auth/login',{...base,password:data.get('password')})).user);return;}
    navigate('verify',true);return;
   }
   if(mode==='verify'){await api('auth/verify-email',{company:company.slug,token:data.get('token')});navigate('login',true);return;}
   if(mode==='reset'){await api('auth/reset-password',{company:company.slug,token:data.get('token'),newPassword:data.get('password')});navigate('login',true);return;}
   const result=await api(mode==='forgot'?'auth/forgot-password':'auth/resend-verification',base);
   setNotice(result.message??'Solicitud registrada. Revisa las instrucciones de recuperación.');
  }catch(error){setNoticeKind('error');setNotice((error as Error).message);}
  finally{saving.current=false;setBusy(false);}
 }

 return (
  <main className={`${styles.page} shop`} style={storeTheme(company.slug,company.primary_color)}>
   <header className={styles.header}>
    <Link href={storeHome(company.slug)} className={styles.brand} aria-label={`${company.name}, volver a la tienda`}>
     {logo?<img src={logo} alt={company.name} width={180} height={44}/>:company.name}
    </Link>
    <Link className={styles.back} href={target}>
     <span aria-hidden="true">←</span> Volver a la tienda
    </Link>
   </header>

   <div className={styles.shell} onPointerDownCapture={()=>{pointerMotion.current=true;}} onKeyDownCapture={()=>{pointerMotion.current=false;}}>
    <aside className={styles.welcome} aria-labelledby="access-welcome-title">
     <span className={styles.welcomeLabel}>{company.name}</span>
     <h2 id="access-welcome-title">Tu próximo equipo<br/><span>te espera.</span></h2>
     <p>Para trabajar, jugar o crear.<br/>Encuentra lo que necesitas en {company.name}.</p>
     <div className={styles.prismScene} data-paused={prismPaused}>
      <svg viewBox="0 0 420 250" fill="none" focusable="false" aria-hidden="true">
       <ellipse cx="210" cy="221" rx="103" ry="10" className={styles.prismShadow}/>
       <path d="m63 173 147-84 147 84-147 84Z" className={styles.prismOutline}/>
       <path d="m107 173 103-59 103 59-103 59Z" className={styles.prismOutline}/>
       <g className={styles.prismBase}>
        <path d="m142 150 68 39 68-39v30l-68 39-68-39Z" className={styles.prismSide}/>
        <path d="m142 150 68-39 68 39-68 39Z" className={styles.prismFace}/>
        <path d="m210 189 68-39v30l-68 39Z" className={styles.prismDark}/>
       </g>
       <g className={styles.prismMiddle}>
        <path d="m142 106 68 39 68-39v25l-68 39-68-39Z" className={styles.prismSide}/>
        <path d="m142 106 68-39 68 39-68 39Z" className={styles.prismFace}/>
        <path d="m210 145 68-39v25l-68 39Z" className={styles.prismDark}/>
       </g>
       <g className={styles.prismTop}>
        <path d="m142 61 68 39 68-39v25l-68 39-68-39Z" className={styles.prismSide}/>
        <path d="m142 61 68-39 68 39-68 39Z" className={styles.prismFace}/>
        <path d="m210 100 68-39v25l-68 39Z" className={styles.prismDark}/>
        <path d="m184 61 26-15 26 15-26 15Z" fill="white" fillOpacity=".9"/>
       </g>
      </svg>
      <button type="button" className={styles.prismControl} onClick={()=>setPrismPaused(value=>!value)}
       aria-label={prismPaused?'Reanudar animación del prisma':'Pausar animación del prisma'} aria-pressed={prismPaused}>
       <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        {prismPaused?<path d="m5 3 8 5-8 5Z"/>:<><rect x="4" y="3" width="2.5" height="10" rx=".7"/><rect x="9.5" y="3" width="2.5" height="10" rx=".7"/></>}
       </svg>
      </button>
     </div>
    </aside>
    <section className={styles.card} aria-labelledby="store-access-title">
     {isPrimary&&<nav className={styles.modes} aria-label="Acceso a tu cuenta">
      <span className={styles.indicator} data-register={mode==='register'} aria-hidden="true"/>
      {(['login','register'] as const).map(next=><button key={next} type="button"
       aria-pressed={mode===next} disabled={busy} onClick={()=>navigate(next)}>
       {next==='login'?'Iniciar sesión':'Crear cuenta'}
      </button>)}
     </nav>}
     <div ref={content} className={styles.content} onInputCapture={event=>{
      const field=event.target;if(field instanceof HTMLInputElement&&field.name==='email')email.current=field.value;
     }}>
     <h1 id="store-access-title" className={styles.title}>{isPrimary?'Tu cuenta':copy.title}</h1>
     <StoreAccess
      key={mode}
      showBrand={false}
      compact={isPrimary}
      inPlace
      company={company.name}
      slug={company.slug}
      busy={busy}
      notice={notice}
      noticeKind={noticeKind}
      succeeded={succeeded}
      mode={mode}
      copy={copy}
      onMode={navigate}
      modeHref={(next)=>storeAccessPath(next as AccessMode,company.slug,target)}
      onSubmit={submit}
     />
     </div>
    </section>
   </div>

   <footer className={styles.footer}>
    <span>{company.name}</span>
    <TechnologySignature/>
   </footer>
  </main>
 );
}
