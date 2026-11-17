'use client';


import type {Category} from '../../catalog/taxonomy';

import ProfileMenu from '../profile-menu';
import DashboardHome from './dashboard-home';
import LoginScreen from './login-screen';
import InventoryBrowser from './inventory-browser';
import MovementsWorkspace from './movements-workspace';
import type {InventoryMovement} from './inventory-browser';
import {emptyInventoryFilters} from '../../catalog/inventory-filters';
import PanelNavigation from './panel-navigation';
import usePanelMotion from './use-panel-motion';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import styles from './panel.module.css';
import CatalogManager,{type ManagedProduct,type ManagedLocation} from './catalog-manager';
import SalesOrders from './sales-orders';
import SettingsWorkspace from './settings-workspace';
import ReportsManager from './reports-manager';
import DeliveryManager from './delivery-manager';
type User={id:string;name:string;role:string};
type Location=ManagedLocation;
type Product=ManagedProduct;
type Movement={id:string;sku:string;product_name:string;location_name:string;kind:string;delta:number;reason:string;created_at:string};
async function api(path:string,options:RequestInit={}){
  const response=await fetch(`/api/${path}`,{...options,cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json',...options.headers}});
  const data=await response.json();if(!response.ok){if(response.status===401&&path!=='auth/login')window.dispatchEvent(new Event('nexo-session-expired'));throw Object.assign(new Error(data.error?.message??'No se pudo completar la solicitud'),{status:response.status,code:data.error?.code});}return data;
}
export default function Panel(){
  const [user,setUser]=useState<User|null>(null),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [movements,setMovements]=useState<Movement[]>([]),[products,setProducts]=useState<Product[]>([]),[locations,setLocations]=useState<Location[]>([]);
  const [productPage,setProductPage]=useState(0),[movementPage,setMovementPage]=useState(0),[kind,setKind]=useState('RECEIPT');
  const [openMovement,setOpenMovement]=useState(false);
  const [movementTarget,setMovementTarget]=useState<InventoryMovement>();
  const [view,setView]=useState<'home'|'inventory'|'products'|'locations'|'sales'|'orders'|'team'|'settings'|'shipping'|'reports'|'movements'>('home');
  const panelMotion=usePanelMotion(view,Boolean(user)&&!checking);
  const [productFilters,setProductFilters]=useState({q:'',status:'all',categoryId:''});
  const [categories,setCategories]=useState<Category[]>([]);
  const [catalogProducts,setCatalogProducts]=useState<Product[]>([]),[catalogPage,setCatalogPage]=useState(0);
  const pending=useRef<{body:string;key:string}|null>(null);
  function navigate(section:typeof view){
    setOpenMovement(false);setMovementTarget(undefined);setView(section);const url=new URL(window.location.href);url.searchParams.set('seccion',section);url.searchParams.delete('categoria');if(section!=='inventory')for(const key of Object.keys(emptyInventoryFilters))url.searchParams.delete(key);window.history.replaceState(null,'',url);
  }
  async function load(pp=productPage,mp=movementPage,cp=catalogPage,pf=productFilters){
    const [m,pr,l,filtered,categoriesResult]=await Promise.all([api(`inventory/movements?limit=50&offset=${mp*50}`),api(`products?limit=100&offset=${pp*100}`),api('locations'),api(`products?limit=100&offset=${cp*100}&${new URLSearchParams(pf)}`),api('categories')]);
    setCategories(categoriesResult.items);
    setCatalogProducts(filtered.items);setCatalogPage(cp);
    setMovements(m.items);setProducts(pr.items);setLocations(l.items);setProductPage(pp);setMovementPage(mp);
  }
  useEffect(()=>{const params=new URLSearchParams(window.location.search);const section=params.get('seccion');if(section==='home'||section==='inventory'||section==='products'||section==='locations'||section==='sales'||section==='orders'||section==='team'||section==='settings'||section==='shipping'||section==='reports'||section==='movements')setView(section);let active=true;const expired=()=>{setUser(null);setMovements([]);setProducts([]);setCatalogProducts([]);setLocations([]);pending.current=null;};window.addEventListener('nexo-session-expired',expired);
    api('auth/me').then(async data=>{
      if(!active)return;
      if(data.user.role==='CUSTOMER'){
        // Nexo is the staff entry. End the store session through the existing POST.
        await api('auth/logout',{method:'POST',body:'{}'});
        if(active){setUser(null);setMessage('La sesión de la tienda se cerró. Accede con tu cuenta de agente o propietario.');}
        return;
      }
      setUser(data.user);await load(0,0,0);
    }).catch(error=>{if(active&&error.status!==401)setMessage(error.message);}).finally(()=>{if(active)setChecking(false);});
    return()=>{active=false;window.removeEventListener('nexo-session-expired',expired);};},[]); // Initial session check only.
  async function login(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,f=new FormData(form);setBusy(true);setMessage('');
    try{const data=await api('auth/login',{method:'POST',body:JSON.stringify({email:f.get('email'),password:f.get('password')})});
      if(data.user.role==='CUSTOMER'){
        await api('auth/logout',{method:'POST',body:'{}'});
        setUser(null);setMessage('Este acceso es para agentes y propietarios. Usa la cuenta de tu equipo.');return;
      }
      form.reset();const current=new URL(window.location.href);window.location.replace(current.searchParams.get('seccion')==='inventory'?current.href:'/inicio');}
    catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
  }
  async function refresh(pp=productPage,mp=movementPage,cp=catalogPage){setBusy(true);setMessage('');try{await load(pp,mp,cp);}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  async function filterProducts(values: typeof productFilters) {
    setBusy(true);setMessage('');
    try { await load(productPage,movementPage,0,values);setProductFilters(values);return true; }
    catch(error){setMessage((error as Error).message);return false;}
    finally{setBusy(false);}
  }
  function openInventoryMovement(target?:InventoryMovement) {
    navigate('movements');
    setKind(target?.kind??'RECEIPT');
    setMovementTarget(target);
    setMessage('');
    setOpenMovement(true);
  }
  async function movement(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,f=new FormData(form);
    const body=JSON.stringify({kind,productId:f.get('product'),locationId:f.get('location'),quantity:Number(f.get('quantity')),reason:f.get('reason'),...(kind==='TRANSFER'?{destinationId:f.get('destination')}:{})});
    if(pending.current?.body!==body)pending.current={body,key:crypto.randomUUID()};
    const key=pending.current!.key;setBusy(true);setMessage('');
    try{await api('inventory/operations',{method:'POST',headers:{'idempotency-key':key},body});pending.current=null;form.reset();setMessage('Movimiento registrado.');
      try{await load(productPage,0);}catch{setMessage('Movimiento registrado. No se pudo actualizar la tabla; pulsa Actualizar.');}return true;}
    catch(error){setMessage(`${(error as Error).message}. Si hubo un corte de conexión, reintenta sin cambiar los datos.`);return false;}finally{setBusy(false);}
  }
  if(!user)return <LoginScreen busy={busy} checking={checking} message={message} onEdit={()=>setMessage('')} onSubmit={login}/>;
  return <main ref={panelMotion} className={`${styles.panel} ${styles.workspace} ${view!=='home'&&view!=='inventory'?styles.quietWorkspace:''} ${(['movements','products','locations','sales','orders','reports','shipping'].includes(view))&&user.role!=='CUSTOMER'?styles.boundedWorkspace:''}`}>{view!=='home'&&<h1 className={styles.srOnly}>Panel de gestión</h1>}
    <header className={styles.workspaceHeader}>
      <a className="brand-link" href="/panel?seccion=home" aria-label="Nexo, inicio del panel" aria-current={view==='home'?'page':undefined} aria-disabled={busy||undefined} onClick={event=>{
        if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
        event.preventDefault();if(!busy)navigate('home');
      }}>nexo<span className="brand-dot">.</span></a>
      {user.role!=='CUSTOMER'?<PanelNavigation selected={view} disabled={busy} onNavigate={navigate}/>:<span/>}
      <div className={styles.headerActions}>{user.role!=='CUSTOMER'&&<a className={styles.websiteLink} href="/mi-web" target="_blank" rel="noopener noreferrer">Ver tienda online<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg><span className={styles.srOnly}> (se abre en una pestaña nueva)</span></a>}<ProfileMenu name={user.name} role={user.role} disabled={busy} onSettings={()=>navigate('settings')}/></div>
    </header>
    {(checking||message)&&<p role="status" aria-live="polite">{checking?'Comprobando sesión…':message}</p>}
    {user&&<>
      {user.role==='CUSTOMER'?<p>Este panel requiere una cuenta de agente o propietario.</p>:<>
        {view==='home'&&<DashboardHome name={user.name} navigate={navigate} request={api} onMovement={kind=>{navigate('movements');setKind(kind);setMessage('');setOpenMovement(true);}}/>}

        {(view==='products'||view==='locations')&&<CatalogManager categories={categories} key={view} view={view} role={user.role} products={catalogProducts} locations={locations} busy={busy} group={catalogPage} request={api} reload={()=>refresh()} setBusy={setBusy} changeGroup={cp=>refresh(productPage,movementPage,cp)} filters={productFilters} onFilter={filterProducts}/>}
        <SalesOrders role={user.role} view={view==='sales'||view==='orders'?view:null} products={products} locations={locations} busy={busy} setBusy={setBusy} request={api} reload={()=>refresh()}/>
        {view==='reports'&&<ReportsManager role={user.role} busy={busy} setBusy={setBusy} request={api}/>}
        {view==='shipping'&&<DeliveryManager role={user.role} busy={busy} setBusy={setBusy} request={api}/>}
        {(view==='settings'||view==='team')&&<SettingsWorkspace key={view} initialTeam={view==='team'} user={user} locations={locations} busy={busy} setBusy={setBusy} request={api}/>}
        {view==='inventory'&&<InventoryBrowser userId={user.id} categories={categories} locations={locations} request={api} onMovement={openInventoryMovement}/>}
        {view==='movements'&&<MovementsWorkspace initiallyOpen={openMovement} target={movementTarget} movements={movements} products={products} locations={locations} page={movementPage} productPage={productPage} kind={kind} busy={busy} message={message} onKind={value=>{setKind(value);setMessage('');}} onSubmit={movement} onRefresh={()=>refresh()} onPage={mp=>refresh(productPage,mp)} onProductPage={pp=>refresh(pp)}/>}
      </> }</>}

  </main>;
}
