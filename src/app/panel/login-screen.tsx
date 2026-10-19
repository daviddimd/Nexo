'use client';
import TechnologySignature from '../technology-signature';
import {useState,type FormEvent} from 'react';
import styles from './login.module.css';

export default function LoginScreen({company,busy,checking,message,onSubmit}:{company:string;busy:boolean;checking:boolean;message:string;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){
  const [visible,setVisible]=useState(false);
  return <main className={styles.page}>
    <div className={styles.shell}>
      <a className={styles.brand} href="/" aria-label="Nexo, inicio">nexo<span>.</span></a>
      <section className={styles.card} aria-labelledby="login-title">
        <span className={styles.eyebrow}>ESPACIO EMPRESARIAL</span>
        <h1 id="login-title">Bienvenido de nuevo</h1>
        <p className={styles.intro}>Accede al espacio de trabajo de tu empresa.</p>
        {checking?<p role="status" className={styles.checking}>Comprobando tu sesión…</p>:<form onSubmit={onSubmit}>
          <fieldset disabled={busy}>
            <label htmlFor="login-company">Empresa</label>
            <input id="login-company" name="company" required autoComplete="organization" maxLength={63} defaultValue={company} placeholder="Identificador de tu empresa" aria-describedby="company-help" autoFocus={!company}/>
            <small id="company-help" className={styles.help}>El identificador que utiliza tu equipo para acceder.</small>
            <label htmlFor="login-email">Correo electrónico</label>
            <input id="login-email" name="email" type="email" required autoComplete="username" placeholder="tu@empresa.cl" autoFocus={Boolean(company)}/>
            <label htmlFor="login-password">Contraseña</label>
            <div className={styles.password}>
              <input id="login-password" name="password" type={visible?'text':'password'} required autoComplete="current-password" maxLength={128} placeholder="Tu contraseña"/>
              <button type="button" className={styles.visibility} aria-label={visible?'Ocultar contraseña':'Mostrar contraseña'} title={visible?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible&&<path d="m3 3 18 18"/>}</svg>
              </button>
            </div>
            {message&&<p className={styles.error} role="alert">{message}</p>}
            <button className={styles.submit} disabled={busy} aria-busy={busy}>{busy?'Entrando…':'Iniciar sesión'}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
          </fieldset>
        </form>}
      </section>
      <p className={styles.support}>¿Necesitas acceso? Contacta al administrador de tu empresa.</p>
      <footer className={styles.footer}><TechnologySignature/></footer>
    </div>
  </main>;
}
