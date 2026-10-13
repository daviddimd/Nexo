'use client';
import {useEffect,useState} from 'react';
export default function Home(){
 const [setup,setSetup]=useState(false),[store,setStore]=useState<{name:string;slug:string}|null>(null),[error,setError]=useState('');
 useEffect(()=>{Promise.all([fetch('/api/setup').then(r=>{if(!r.ok)throw new Error();return r.json();}),fetch('/api/public/start').then(r=>{if(!r.ok)throw new Error();return r.json();})]).then(([s,p])=>{setSetup(s.available);setStore(p.store);}).catch(()=>setError('No pudimos conectar con la empresa. Intenta de nuevo en unos momentos.'));},[]);
 const panel=()=>`/panel${store?`?empresa=${encodeURIComponent(store.slug)}`:''}`;
 return <main className="welcome business-home"><header className="home-header"><a className="brand" href="/" aria-label="Nexo, inicio">nexo<span className="brand-dot">.</span></a><div><span className="workspace-label">Espacio empresarial</span><a className="secondary" href={panel()}>Acceder al equipo →</a></div></header>
 <div className="business-hero"><div><span className="eyebrow">GESTIÓN PARA EMPRESAS DE TECNOLOGÍA</span><h1>Tu empresa,<br/><span>bien conectada.</span></h1><p className="lead">Controla productos, existencias y sucursales desde un espacio pensado para el trabajo diario de tu equipo.</p><div className="hero-actions"><a className="primary" href={panel()}>Entrar a mi empresa →</a>{setup&&<a className="secondary" href="/configurar">Configurar mi empresa</a>}</div>{error&&<p role="alert">{error}</p>}</div>
 <section className="operation-card"><span className="eyebrow">UN SOLO ESPACIO DE TRABAJO</span><h2>Lo importante, a mano.</h2><ul><li><span>01</span><div><strong>Stock que puedes seguir</strong><p>Físico, reservado y disponible por ubicación.</p></div></li><li><span>02</span><div><strong>Un catálogo organizado</strong><p>Productos, precios y disponibilidad para tu empresa.</p></div></li><li><span>03</span><div><strong>Tu equipo, coordinado</strong><p>Accesos y permisos según cada responsabilidad.</p></div></li></ul></section></div>
 {setup&&<section className="setup-callout"><div><h2>¿Es tu primera vez?</h2><p>Prepara tu empresa y crea el acceso de su administrador.</p></div><a className="primary" href="/configurar">Comenzar configuración →</a></section>}
 <footer className="business-footer"><span>Impulsado con tecnología <strong>Nexo</strong></span>{store&&<a href={`/tienda?empresa=${encodeURIComponent(store.slug)}`}>Ver catálogo público →</a>}</footer></main>;
}

