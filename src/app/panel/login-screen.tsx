'use client';
import PublicHeader from '../public-header';
import landing from '../access-landing.module.css';
import NexoFooter from '../nexo-footer';
import {useEffect,useRef,useState,type FormEvent,type KeyboardEvent} from 'react';
import styles from './login.module.css';

export default function LoginScreen({busy,checking,message,onEdit,onSubmit}:{busy:boolean;checking:boolean;message:string;onEdit:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){
  const [visible,setVisible]=useState(false);
  const [capsLock,setCapsLock]=useState(false);
  const [recovery,setRecovery]=useState(false);
  const password = useRef<HTMLInputElement>(null);
  const invalidCredentials = message === 'Credenciales incorrectas o cuenta no habilitada';
  useEffect(()=>{
    if (!busy && invalidCredentials) {
      password.current?.focus({preventScroll:true});
      password.current?.select();
    }
  },[busy,invalidCredentials]);
  const checkCapsLock=(event:KeyboardEvent<HTMLInputElement>)=>setCapsLock(event.getModifierState('CapsLock'));
  return <div className={`${landing.page} ${styles.frame}`}>
    <PublicHeader compact/>
    <main className={styles.page}>
    <div className={`${styles.shell} ${landing.routeContent}`}>

      <section className={styles.card} aria-labelledby="login-title">
        <span className={styles.eyebrow}>ESPACIO EMPRESARIAL</span>
        <h1 id="login-title">Bienvenido de nuevo</h1>
        <p className={styles.intro}>Accede al espacio de trabajo de tu empresa.</p>
        {checking?<p role="status" className={styles.checking}>Comprobando tu sesión…</p>:<form onSubmit={onSubmit} onChange={onEdit}>
          <fieldset disabled={busy}>
            <label htmlFor="login-email">Correo electrónico</label>
            <input id="login-email" aria-invalid={invalidCredentials || undefined} aria-describedby={invalidCredentials ? "login-error" : undefined} name="email" type="email" required autoComplete="email" inputMode="email" placeholder="tu@empresa.cl" autoFocus/>
            <div className={styles.passwordCaption}>
              <label htmlFor="login-password">Contraseña</label>
              <button type="button" className={styles.forgot} aria-expanded={recovery} aria-controls="login-recovery" onClick={()=>setRecovery(open=>!open)}>¿Olvidaste tu contraseña?</button>
            </div>
            <p id="login-recovery" className={styles.recovery} hidden={!recovery}>Pide al administrador de tu empresa que restablezca tu contraseña. Si eres titular de la cuenta, contacta al equipo que configuró Nexo para tu empresa.</p>
            <div className={styles.password}>
              <input id="login-password" ref={password} aria-invalid={invalidCredentials || undefined} aria-describedby={invalidCredentials ? "login-error" : undefined} name="password" type={visible?'text':'password'} required autoComplete="current-password" maxLength={128} placeholder="Tu contraseña" onKeyDown={checkCapsLock} onKeyUp={checkCapsLock} onBlur={()=>setCapsLock(false)}/>
              <button type="button" className={styles.visibility} aria-label={visible?'Ocultar contraseña':'Mostrar contraseña'} title={visible?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible&&<path d="m3 3 18 18"/>}</svg>
              </button>
            </div>
            {capsLock && <p className={styles.help} role="status">Bloq Mayús está activado.</p>}{message&&<div id="login-error" className={styles.error} role="alert">
              <span className={styles.alertIcon} aria-hidden="true">!</span>
              <div>{message}{invalidCredentials && <span className={styles.errorHelp}>Revisa tus datos o contacta al administrador de tu empresa.</span>}</div>
            </div>}
            <button className={styles.submit} disabled={busy} aria-busy={busy}>{busy?'Entrando…':'Iniciar sesión'}{busy ? <span className={styles.spinner} aria-hidden="true"/> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>}</button>
          </fieldset>
        </form>}
      </section>
      <p className={styles.support}>¿Necesitas acceso? Contacta al administrador de tu empresa.</p>
      <NexoFooter className={styles.footer}/>
    </div>
  </main>
  </div>;
}
