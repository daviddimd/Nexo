'use client';
import {IconButton} from '../action-icon';
import ProfileMenu from '../profile-menu';
import DashboardHome from './dashboard-home';
import LoginScreen from './login-screen';
import ProductSearch from './product-search';
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
type Movement={id:string;sku:string;location_name:string;kind:string;delta:number;reason:string;created_at:string};
async function api(path:string,options:RequestInit={}){
  const response=await fetch(`/api/${path}`,{...options,cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json',...options.headers}});
  const data=await response.json();if(!response.ok){if(response.status===401&&path!=='auth/login')window.dispatchEvent(new Event('nexo-session-expired'));throw Object.assign(new Error(data.error?.message??'No se pudo completar la solicitud'),{status:response.status,code:data.error?.code});}return data;
}
export default function Panel(){
  const [user,setUser]=useState<User|null>(null),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [stock,setStock]=useState<Stock[]>([]),[movements,setMovements]=useState<Movement[]>([]),[products,setProducts]=useState<Product[]>([]),[locations,setLocations]=useState<Location[]>([]);
  const [page,setPage]=useState(0),[productPage,setProductPage]=useState(0),[movementPage,setMovementPage]=useState(0),[kind,setKind]=useState('RECEIPT');
  const [view,setView]=useState<'home'|'inventory'|'products'|'locations'|'sales'|'orders'|'team'|'settings'|'shipping'|'reports'|'movements'>('home');
  const [inventoryFilters,setInventoryFilters]=useState({q:'',locationId:'',availability:'all',sort:'name_asc'}),[productFilters,setProductFilters]=useState({q:'',status:'all'});
  const [catalogProducts,setCatalogProducts]=useState<Product[]>([]),[catalogPage,setCatalogPage]=useState(0);
  const stockLocations=locations.filter(l=>!inventoryFilters.locationId||l.id===inventoryFilters.locationId);
  const [companyHint,setCompanyHint]=useState('');
  const [stockProductCount,setStockProductCount]=useState(0);
  const stockProducts=Array.from(new Map(stock.map(s=>[s.product_id,s])).values());
  const stockCells=new Map(stock.map(s=>[`${s.product_id}-${s.location_id}`,s]));
  const pending=useRef<{body:string;key:string}|null>(null);
  function navigate(section:typeof view){
    setView(section);const url=new URL(window.location.href);url.searchParams.set('seccion',section);url.searchParams.delete('categoria');window.history.replaceState(null,'',url);
  }
  async function load(p=page,pp=productPage,mp=movementPage,cp=catalogPage,inf=inventoryFilters,pf=productFilters){
    const [s,m,pr,l,filtered]=await Promise.all([api(`inventory/matrix?limit=50&offset=${p*50}&${new URLSearchParams(inf)}`),api(`inventory/movements?limit=50&offset=${mp*50}`),api(`products?limit=100&offset=${pp*100}`),api('locations'),api(`products?limit=100&offset=${cp*100}&${new URLSearchParams(pf)}`)]);
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
    }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
  }
  function filterForm(event:FormEvent<HTMLFormElement>,kind:'inventory'|'products'){
    event.preventDefault();const f=new FormData(event.currentTarget);
    void filter(kind,kind==='inventory'?{q:String(f.get('q')??''),locationId:String(f.get('locationId')??''),availability:String(f.get('availability')??'all'),sort:String(f.get('sort')??'name_asc')}:{q:String(f.get('q')??''),status:String(f.get('status')??'all')});
  }
  async function movement(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,f=new FormData(form);
    const body=JSON.stringify({kind,productId:f.get('product'),locationId:f.get('location'),quantity:Number(f.get('quantity')),reason:f.get('reason'),...(kind==='TRANSFER'?{destinationId:f.get('destination')}:{})});
    if(pending.current?.body!==body)pending.current={body,key:crypto.randomUUID()};
    const key=pending.current!.key;setBusy(true);setMessage('');
    try{await api('inventory/operations',{method:'POST',headers:{'idempotency-key':key},body});pending.current=null;form.reset();setMessage('Movimiento registrado.');
      try{await load(page,productPage,0);}catch{setMessage('Movimiento registrado. No se pudo actualizar la tabla; pulsa Actualizar.');}}
    catch(error){setMessage(`${(error as Error).message}. Si hubo un corte de conexión, reintenta sin cambiar los datos.`);}finally{setBusy(false);}
  }
  if(!user)return <LoginScreen company={companyHint} busy={busy} checking={checking} message={message} onSubmit={login}/>;
  return <main className={`${styles.panel} ${styles.workspace}`}>{view!=='home'&&<h1 className={styles.srOnly}>Panel de gestión</h1>}
    <header className={styles.workspaceHeader}>
      <a className="brand-link" href="/panel?seccion=home" aria-label="Nexo, inicio del panel">nexo<span className="brand-dot">.</span></a>
      {user&&user.role!=='CUSTOMER'?        <nav className={styles.topNav} aria-label="Secciones del panel">
          <button disabled={busy} aria-pressed={view==='inventory'} onClick={()=>navigate('inventory')}>Inventario</button>
          <button disabled={busy} aria-pressed={view==='movements'} onClick={()=>navigate('movements')}>Movimientos</button>
          <button disabled={busy} aria-pressed={view==='products'} onClick={()=>navigate('products')}>Productos</button>
          <button disabled={busy} aria-pressed={view==='locations'} onClick={()=>navigate('locations')}>Ubicaciones</button>
          <button disabled={busy} aria-pressed={view==='orders'} onClick={()=>navigate('orders')}>Pedidos</button>
          <button disabled={busy} aria-pressed={view==='reports'} onClick={()=>navigate('reports')}>Reportes</button>
          <button disabled={busy} aria-pressed={view==='shipping'} onClick={()=>navigate('shipping')}>Envíos</button>
        </nav>:<span/>}
      {user&&<ProfileMenu name={user.name} role={user.role} disabled={busy} onSettings={()=>navigate('settings')}/>}
    </header>
    {(checking||message)&&<p role="status" aria-live="polite">{checking?'Comprobando sesión…':message}</p>}
    {user&&<>
      {user.role==='CUSTOMER'?<p>Este panel requiere una cuenta de agente o propietario.</p>:<>
        {view==='home'&&<DashboardHome name={user.name} navigate={navigate} request={api}/>}

        {(view==='products'||view==='locations')&&<CatalogManager key={view} view={view} role={user.role} products={catalogProducts} locations={locations} busy={busy} group={catalogPage} request={api} reload={()=>refresh()} setBusy={setBusy} changeGroup={cp=>refresh(page,productPage,movementPage,cp)} filterControls={<form className={styles.filters} key={JSON.stringify(productFilters)} onSubmit={e=>filterForm(e,'products')}><fieldset disabled={busy}><label>Nombre o SKU<input name="q" maxLength={200} defaultValue={productFilters.q} placeholder="Buscar producto…"/></label><label>Estado<select name="status" defaultValue={productFilters.status}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label><button>Filtrar</button><button type="button" onClick={()=>filter('products',{q:'',status:'all'})}>Limpiar</button></fieldset></form>}/>}
        <SalesOrders role={user.role} view={view==='sales'||view==='orders'?view:null} products={products} locations={locations} group={productPage} busy={busy} setBusy={setBusy} request={api} reload={()=>refresh()} changeGroup={p=>refresh(page,p)}/>
        {view==='reports'&&<ReportsManager role={user.role} busy={busy} setBusy={setBusy} request={api}/>}
        {view==='shipping'&&<ShippingManager locations={locations} busy={busy} setBusy={setBusy} request={api}/>}
        {(view==='settings'||view==='team')&&<SettingsWorkspace key={view} initialTeam={view==='team'} user={user} locations={locations} busy={busy} setBusy={setBusy} request={api}/>}
        {view==='inventory'&&<>
        {page===0&&productPage===0&&(!products.length||!locations.length)&&<section><h2>Comencemos con tu inventario</h2><p>Primero crea una ubicación y agrega un producto. Después registra una entrada para cargar tus unidades.</p><div className={styles.bar}>{user.role==='OWNER'&&<button onClick={()=>navigate('locations')}>Configurar ubicaciones</button>}<button onClick={()=>navigate('products')}>Agregar productos</button></div></section>}
        <div className={styles.inventoryHeading}><h2>Inventario</h2><div className={styles.inventoryHeadingActions}>
          <details className={styles.inventoryHelp}><summary aria-label="Cómo leer el inventario" title="Cómo leer el inventario"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg></summary><div><strong>Stock disponible</strong><p>Las cifras descuentan las unidades reservadas, que se indican debajo.</p><p>Rojo: agotado. Ámbar: entre 1 y 5 unidades.</p><p>Al elegir todas las ubicaciones, un producto aparece si cumple el filtro en al menos una. El orden por stock suma las ubicaciones seleccionadas.</p></div></details>
          <IconButton icon="refresh" label="Actualizar inventario" onClick={()=>refresh()} disabled={busy}/>
        </div></div>
        <form className={`${styles.filters} ${styles.inventoryToolbar}`} key={JSON.stringify(inventoryFilters)} onSubmit={e=>filterForm(e,'inventory')}><fieldset disabled={busy}>
          <label className={styles.searchFilter}>Buscar producto<ProductSearch defaultValue={inventoryFilters.q} request={api} onSelect={(q,form)=>{const f=new FormData(form);void filter('inventory',{q,locationId:String(f.get('locationId')??''),availability:String(f.get('availability')??'all'),sort:String(f.get('sort')??'name_asc')});}}/></label>
          <label>Ubicación<select name="locationId" defaultValue={inventoryFilters.locationId}><option value="">Todas las ubicaciones</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label>Disponibilidad<select name="availability" defaultValue={inventoryFilters.availability}><option value="all">Todo el stock</option><option value="available">Con stock</option><option value="empty">Sin stock</option><option value="low">Stock bajo (1 a 5)</option></select></label>
          <label>Ordenar por<select name="sort" defaultValue={inventoryFilters.sort}><option value="name_asc">Nombre: A–Z</option><option value="name_desc">Nombre: Z–A</option><option value="sku_asc">SKU: A–Z</option><option value="sku_desc">SKU: Z–A</option><option value="stock_asc">Stock: menor a mayor</option><option value="stock_desc">Stock: mayor a menor</option></select></label>
          <div className={styles.filterActions}><button className={styles.applyFilters}>Aplicar</button><button type="button" className={styles.clearFilters} title="Limpiar filtros" aria-label="Limpiar filtros" onClick={()=>filter('inventory',{q:'',locationId:'',availability:'all',sort:'name_asc'})}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></div>
        </fieldset></form>
        <div className={styles.scroll}><table className={styles.stockMatrix}><thead><tr><th scope="col">Producto</th>{stockLocations.map(l=><th scope="col" key={l.id}>{l.name.replace(/^Sucursal /,'')}</th>)}</tr></thead><tbody>
          {stockProducts.map(p=><tr key={p.product_id}><th scope="row">{p.product_name}<small>{p.sku}</small></th>{stockLocations.map(l=>{const s=stockCells.get(`${p.product_id}-${l.id}`);return <td key={l.id}><span className={`${styles.stockValue} ${s?.available===0?styles.stockValueEmpty:s&&s.available<=5?styles.stockValueLow:''}`} title={s?.available===0?'Agotado':s&&s.available<=5?'Stock bajo':undefined}>{s?.available??'—'}</span>{!!s?.reserved&&<small className={styles.reservedValue}>{s.reserved} reservadas</small>}</td>;})}</tr>)}
          {!stock.length&&<tr><td colSpan={stockLocations.length+1}>No hay productos que coincidan con estos filtros en esta página.</td></tr>}</tbody></table></div>
        <nav aria-label="Páginas de existencias"><IconButton icon="previous" label="Página anterior" disabled={busy||page===0} onClick={()=>refresh(page-1)}/><span>Página {page+1}</span><IconButton icon="next" label="Página siguiente" disabled={busy||stockProductCount<50} onClick={()=>refresh(page+1)}/></nav>
        </>}
        {view==='movements'&&<>
        <div className={styles.bar}><h2>Movimientos de stock</h2><IconButton icon="refresh" label="Actualizar movimientos" onClick={()=>refresh()} disabled={busy}/></div>
        <section><h2>Registrar movimiento</h2><p>Registra entradas, ajustes y transferencias. Para registrar una venta utiliza Nueva venta.</p>
          <form onSubmit={movement}><fieldset disabled={busy}>
            <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value)}><option value="RECEIPT">Entrada</option><option value="ADJUSTMENT">Ajuste (+ / −)</option><option value="TRANSFER">Transferencia</option></select></label>
            <label>Producto<select name="product" required key={`products-${productPage}`}><option value="">Selecciona un producto</option>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label>
            <div className={styles.bar}><IconButton icon="previous" label="Productos anteriores" type="button" disabled={productPage===0} onClick={()=>refresh(page,productPage-1)}/><span>Grupo {productPage+1}</span><IconButton icon="next" label="Más productos" type="button" disabled={products.length<100} onClick={()=>refresh(page,productPage+1)}/></div>
            <label>Ubicación de origen<select name="location" required><option value="">Selecciona ubicación</option>{locations.filter(l=>l.active).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            {kind==='TRANSFER'&&<label>Destino<select name="destination" required><option value="">Selecciona destino</option>{locations.filter(l=>l.active).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
            <label>Cantidad{kind==='ADJUSTMENT'?' (diferencia con signo)':''}<input name="quantity" type="number" required step={1} min={kind==='ADJUSTMENT'?-1000000:1} max={1000000}/></label>
            <label>Motivo<textarea name="reason" required minLength={3} maxLength={500}/></label><button>Registrar movimiento</button>
          </fieldset></form></section>
        <section><h2>Historial de movimientos</h2><div className={styles.scroll}><table><thead><tr><th>Fecha</th><th>SKU</th><th>Ubicación</th><th>Tipo</th><th>Unidades</th><th>Motivo</th></tr></thead><tbody>
          {movements.map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString('es-CL')}</td><td>{m.sku}</td><td>{m.location_name}</td><td>{{RECEIPT:'Entrada',ADJUSTMENT:'Ajuste',TRANSFER:'Transferencia',SALE:'Venta',RETURN:'Devolución'}[m.kind]??m.kind}</td><td>{m.delta>0?'+':''}{m.delta}</td><td>{m.reason}</td></tr>)}
          {!movements.length&&<tr><td colSpan={6}>Sin movimientos en esta página.</td></tr>}</tbody></table></div>
          <nav aria-label="Páginas del historial de movimientos"><IconButton icon="previous" label="Movimientos anteriores" disabled={busy||movementPage===0} onClick={()=>refresh(page,productPage,movementPage-1)}/><span>Página {movementPage+1}</span><IconButton icon="next" label="Movimientos siguientes" disabled={busy||movements.length<50} onClick={()=>refresh(page,productPage,movementPage+1)}/></nav>
        </section>
        </>}
      </> }</>}
    <footer>Impulsado con tecnología Nexo</footer>
  </main>;
}


