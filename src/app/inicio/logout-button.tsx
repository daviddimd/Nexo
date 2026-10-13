'use client';
import AccountPassword from '../account-password';
import {useState} from 'react';
export default function LogoutButton(){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function logout(){
    setBusy(true);setError('');
    try{const response=await fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!response.ok&&response.status!==401)throw Error();window.location.replace('/');}
    catch{setError('No se pudo cerrar la sesión. Intenta nuevamente.');setBusy(false);}
  }
  return <div className="session-actions"><AccountPassword/><button className="secondary" disabled={busy} onClick={logout}>{busy?'Cerrando sesión…':'Cerrar sesión'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
