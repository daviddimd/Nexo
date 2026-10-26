'use client';
import TechnologySignature from '../technology-signature';
import Link from 'next/link';
import type {Category} from '../../catalog/taxonomy';
import {IconButton} from '../action-icon';
import ProfileMenu from '../profile-menu';
import DashboardHome from './dashboard-home';
import LoginScreen from './login-screen';
import InventoryBrowser from './inventory-browser';
import MovementsWorkspace from './movements-workspace';
import {emptyInventoryFilters,type InventoryFilters} from '../../catalog/inventory-filters';
import PanelNavigation from './panel-navigation';
import usePanelMotion from './use-panel-motion';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import styles from './panel.module.css';
import CatalogManager,{type ManagedProduct,type ManagedLocation} from './catalog-manager';
import SalesOrders from './sales-orders';
import SettingsWorkspace from './settings-workspace';
import ReportsManager from './reports-manager';
import ShippingManager from './shipping-manager';
type User={id:string;name:string;role:string};
type Location=ManagedLocation;
type Product=ManagedProduct;
type Stock={product_id:string;location_id:string;sku:string;product_name:string;location_name:string;on_hand:number;reserved:number;available:number};
type Movement={id:string;sku:string;product_name:string;location_name:string;kind:string;delta:number;reason:string;created_at:string};
async function api(path:string,options:RequestInit={}){
  const response=await fetch(`/api/${path}`,{...options,cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json',...options.headers}});
  const data=await response.json();if(!response.ok){if(response.status===401&&path!=='auth/login')window.dispatchEvent(new Event('nexo-session-expired'));throw Object.assign(new Error(data.error?.message??'No se pudo completar la solicitud'),{status:response.status,code:data.error?.code});}return data;
}
export default function Panel(){
  const [user,setUser]=useState<User|null>(null),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [stock,setStock]=useState<Stock[]>([]),[movements,setMovements]=useState<Movement[]>([]),[products,setProducts]=useState<Product[]>([]),[locations,setLocations]=useState<Location[]>([]);
  const [page,setPage]=useState(0),[productPage,setProductPage]=useState(0),[movementPage,setMovementPage]=useState(0),[kind,setKind]=useState('RECEIPT');
  const [view,setView]=useState<'home'|'inventory'|'products'|'locations'|'sales'|'orders'|'team'|'settings'|'shipping'|'reports'|'movements'>('home');
  const panelMotion=usePanelMotion(view,Boolean(user)&&!checking);
  const [inventoryFilters,setInventoryFilters]=useState<InventoryFilters>({...emptyInventoryFilters}),[productFilters,setProductFilters]=useState({q:'',status:'all',categoryId:''});
  const [categories,setCategories]=useState<Category[]>([]);
  const [catalogProducts,setCatalogProducts]=useState<Product[]>([]),[catalogPage,setCatalogPage]=useState(0);
  const stockLocations=locations.filter(l=>!inventoryFilters.locationId||l.id===inventoryFilters.locationId);
  const [companyHint,setCompanyHint]=useState('');
  const [stockProductCount,setStockProductCount]=useState(0);
  const stockProducts=Array.from(new Map(stock.map(s=>[s.product_id,s])).values());
  const stockCells=new Map(stock.map(s=>[`${s.product_id}-${s.location_id}`,s]));
  const pending=useRef<{body:string;key:string}|null>(null);
  const inventoryScroll=useRef<HTMLDivElement>(null);
  useEffect(()=>{inventoryScroll.current?.scrollTo({top:0});},[page,inventoryFilters]);
  function navigate(section:typeof view){
    setView(section);const url=new URL(window.location.href);url.searchParams.set('seccion',section);url.searchParams.delete('categoria');window.history.replaceState(null,'',url);
  }
  async function load(p=page,pp=productPage,mp=movementPage,cp=catalogPage,inf=inventoryFilters,pf=productFilters){
    const [s,m,pr,l,filtered,categoriesResult]=await Promise.all([api(`inventory/matrix?limit=50&offset=${p*50}&${new URLSearchParams(inf)}`),api(`inventory/movements?limit=50&offset=${mp*50}`),api(`products?limit=100&offset=${pp*100}`),api('locations'),api(`products?limit=100&offset=${cp*100}&${new URLSearchParams(pf)}`),api('categories')]);
    setCategories(categoriesResult.items);
    setStockProductCount(s.productCount);setCatalogProducts(filtered.items);setCatalogPage(cp);
    setStock(s.items);setMovements(m.items);setProducts(pr.items);setLocations(l.items);setPage(p);setProductPage(pp);setMovementPage(mp);
  }
  useEffect(()=>{const params=new URLSearchParams(window.location.search);setCompanyHint(params.get('empresa')??'');const section=params.get('seccion');if(section==='home'||section==='inventory'||section==='products'||section==='locations'||section==='sales'||section==='orders'||section==='team'||section==='settings'||section==='shipping'||section==='reports'||section==='movements')setView(section);let active=true;const expired=()=>{setUser(null);setStock([]);setMovements([]);setProducts([]);setCatalogProducts([]);setLocations([]);pending.current=null;};window.addEventListener('nexo-session-expired',expired);
    api('auth/me').then(async data=>{if(!active)return;setUser(data.user);if(data.user.role!=='CUSTOMER')await load(0,0,0,0);}).catch(error=>{if(active&&error.status!==401)setMessage(error.message);}).finally(()=>{if(active)setChecking(false);});
    return()=>{active=false;window.removeEventListener('nexo-session-expired',expired);};},[]); // Initial session check only.
  async function login(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,f=new FormData(form);setBusy(true);setMessage('');
    try{const data=await api('auth/login',{method:'POST',body:JSON.stringify({company:f.get('company'),email:f.get('email'),password:f.get('password')})});form.reset();window.location.replace('/inicio');}
    catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
  }
  async function refresh(p=page,pp=productPage,mp=movementPage,cp=catalogPage){setBusy(true);setMessage('');try{await load(p,pp,mp,cp);}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  async function filter(kind:'inventory'|'products',values:typeof inventoryFilters|typeof productFilters){
    setBusy(true);setMessage('');try{
      if(kind==='inventory'){const next=values as typeof inventoryFilters;await load(0,productPage,movementPage,catalogPage,next,productFilters);setInventoryFilters(next);}
      else{const next=values as typeof productFilters;await load(page,productPage,movementPage,0,inventoryFilters,next);setProductFilters(next);}
      return true;
    }catch(error){setMessage((error as Error).message);return false;}finally{setBusy(false);}
  }
  async function movement(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,f=new FormData(form);
    const body=JSON.stringify({kind,productId:f.get('product'),locationId:f.get('location'),quantity:Number(f.get('quantity')),reason:f.get('reason'),...(kind==='TRANSFER'?{destinationId:f.get('destination')}:{})});
    if(pending.current?.body!==body)pending.current={body,key:crypto.randomUUID()};
    const key=pending.current!.key;setBusy(true);setMessage('');
    try{await api('inventory/operations',{method:'POST',headers:{'idempotency-key':key},body});pending.current=null;form.reset();setMessage('Movimiento registrado.');
      try{await load(page,productPage,0);}catch{setMessage('Movimiento registrado. No se pudo actualizar la tabla; pulsa Actualizar.');}return true;}
    catch(error){setMessage(`${(error as Error).message}. Si hubo un corte de conexión, reintenta sin cambiar los datos.`);return false;}finally{setBusy(false);}
  }
  if(!user)return <LoginScreen company={companyHint} busy={busy} checking={checking} message={message} onSubmit={login}/>;
  return <main ref={panelMotion} className={`${styles.panel} ${styles.workspace} ${(['home','inventory','movements','products','locations','sales','orders','reports','shipping'].includes(view))&&user.role!=='CUSTOMER'?styles.boundedWorkspace:''}`}>{view!=='home'&&<h1 className={styles.srOnly}>Panel de gestión</h1>}
    <header className={styles.workspaceHeader}>
      <a className="brand-link" href="/panel?seccion=home" aria-label="Nexo, inicio del panel" aria-current={view==='home'?'page':undefined} aria-disabled={busy||undefined} onClick={event=>{
        if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
        event.preventDefault();if(!busy)navigate('home');
      }}>nexo<span className="brand-dot">.</span></a>
      {user.role!=='CUSTOMER'?<PanelNavigation selected={view} disabled={busy} onNavigate={navigate}/>:<span/>}
      <div className={styles.headerActions}>{user.role!=='CUSTOMER'&&<a className={styles.websiteLink} href="/mi-web" target="_blank" rel="noopener noreferrer">Acceder a tu web<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg><span className={styles.srOnly}> (se abre en una pestaña nueva)</span></a>}<ProfileMenu name={user.name} role={user.role} disabled={busy} onSettings={()=>navigate('settings')}/></div>
    </header>
    {(checking||message)&&<p role="status" aria-live="polite">{checking?'Comprobando sesión…':message}</p>}
    {user&&<>
      {user.role==='CUSTOMER'?<p>Este panel requiere una cuenta de agente o propietario.</p>:<>
        {view==='home'&&<DashboardHome name={user.name} navigate={navigate} request={api}/>}

        {(view==='products'||view==='locations')&&<CatalogManager categories={categories} key={view} view={view} role={user.role} products={catalogProducts} locations={locations} busy={busy} group={catalogPage} request={api} reload={()=>refresh()} setBusy={setBusy} changeGroup={cp=>refresh(page,productPage,movementPage,cp)} filters={productFilters} onFilter={values=>filter('products',values)}/>}
        <SalesOrders role={user.role} view={view==='sales'||view==='orders'?view:null} products={products} locations={locations} busy={busy} setBusy={setBusy} request={api} reload={()=>refresh()}/>
        {view==='reports'&&<ReportsManager role={user.role} busy={busy} setBusy={setBusy} request={api}/>}
        {view==='shipping'&&<ShippingManager locations={locations} busy={busy} setBusy={setBusy} request={api}/>}
        {(view==='settings'||view==='team')&&<SettingsWorkspace key={view} initialTeam={view==='team'} user={user} locations={locations} busy={busy} setBusy={setBusy} request={api}/>}
        {view==='inventory'&&<>
        {page===0&&productPage===0&&(!products.length||!locations.length)&&<section><h2>Comencemos con tu inventario</h2><p>Primero crea una ubicación y agrega un producto. Después registra una entrada para cargar tus unidades.</p><div className={styles.bar}>{user.role==='OWNER'&&<button onClick={()=>navigate('locations')}>Configurar ubicaciones</button>}<button onClick={()=>navigate('products')}>Agregar productos</button></div></section>}
        <div data-panel-reveal="inventory-heading" className={styles.inventoryHeading}><h2>Inventario</h2><div className={styles.inventoryHeadingActions}>
          <details className={styles.inventoryHelp}><summary aria-label="Cómo leer el inventario" title="Cómo leer el inventario"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg></summary><div><strong>Stock disponible</strong><p>Las cifras descuentan las unidades reservadas, que se indican debajo.</p><p>Rojo: agotado. Ámbar: entre 1 y 5 unidades.</p><p>Al elegir todas las ubicaciones, un producto aparece si cumple el filtro en al menos una. El orden por stock suma las ubicaciones seleccionadas.</p></div></details>
          <IconButton icon="refresh" label="Actualizar inventario" onClick={()=>refresh()} disabled={busy}/>
        </div></div>
        <InventoryBrowser filters={inventoryFilters} categories={categories} locations={locations} busy={busy} request={api} onApply={values=>filter('inventory',values)}>
        <div ref={inventoryScroll} className={`${styles.scroll} ${styles.inventoryScroll}`} tabIndex={0} role="region" aria-label="Productos y stock por ubicación"><table className={styles.stockMatrix}><thead><tr><th scope="col">Producto</th>{stockLocations.map(l=><th scope="col" key={l.id}>{l.name.replace(/^Sucursal /,'')}</th>)}</tr></thead><tbody>
          {stockProducts.map(p=><tr key={p.product_id}><th scope="row"><Link className="product-name-link" prefetch={false} href={`/panel/productos/${p.product_id}`}>{p.product_name}<small>{p.sku}</small></Link></th>{stockLocations.map(l=>{const s=stockCells.get(`${p.product_id}-${l.id}`);return <td key={l.id}><span className={`${styles.stockValue} ${s?.available===0?styles.stockValueEmpty:s&&s.available<=5?styles.stockValueLow:''}`} title={s?.available===0?'Agotado':s&&s.available<=5?'Stock bajo':undefined}>{s?.available??'—'}</span>{!!s?.reserved&&<small className={styles.reservedValue}>{s.reserved} reservadas</small>}</td>;})}</tr>)}
          {!stock.length&&<tr><td colSpan={stockLocations.length+1}>No hay productos que coincidan con estos filtros en esta página.</td></tr>}</tbody></table></div>
        <nav aria-label="Páginas de existencias"><IconButton icon="previous" label="Página anterior" disabled={busy||page===0} onClick={()=>refresh(page-1)}/><span>Página {page+1}</span><IconButton icon="next" label="Página siguiente" disabled={busy||stockProductCount<50} onClick={()=>refresh(page+1)}/></nav>
        </InventoryBrowser>
        </>}
        {view==='movements'&&<MovementsWorkspace movements={movements} products={products} locations={locations} page={movementPage} productPage={productPage} kind={kind} busy={busy} message={message} onKind={value=>{setKind(value);setMessage('');}} onSubmit={movement} onRefresh={()=>refresh()} onPage={mp=>refresh(page,productPage,mp)} onProductPage={pp=>refresh(page,pp)}/>}
      </> }</>}
    <footer className={styles.workspaceFooter}><TechnologySignature/></footer>
  </main>;
}


