'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import styles from './panel.module.css';
import CatalogManager,{type ManagedProduct,type ManagedLocation} from './catalog-manager';
import SalesOrders from './sales-orders';
import TeamManager from './team-manager';
import CompanyManager from './company-manager';
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
  const [page,setPage]=useState(0),[productPage,setProductPage]=useState(0),[kind,setKind]=useState('RECEIPT');
  const [view,setView]=useState<'inventory'|'products'|'locations'|'sales'|'orders'|'team'|'settings'|'shipping'|'reports'>('inventory');
  const [companyHint,setCompanyHint]=useState('');
  const [stockProductCount,setStockProductCount]=useState(0);
  const stockProducts=Array.from(new Map(stock.map(s=>[s.product_id,s])).values());
  const stockCells=new Map(stock.map(s=>[`${s.product_id}-${s.location_id}`,s]));
  const pending=useRef<{body:string;key:string}|null>(null);
  async function load(p=page,pp=productPage){
    const [s,m,pr,l]=await Promise.all([api(`inventory/matrix?limit=50&offset=${p*50}`),api(`inventory/movements?limit=50&offset=${p*50}`),api(`products?limit=100&offset=${pp*100}`),api('locations')]);
    setStockProductCount(s.productCount);
    setStock(s.items);setMovements(m.items);setProducts(pr.items);setLocations(l.items);setPage(p);setProductPage(pp);
  }
  useEffect(()=>{const params=new URLSearchParams(window.location.search);setCompanyHint(params.get('empresa')??'');const section=params.get('seccion');if(section==='products'||section==='locations'||section==='sales'||section==='orders'||section==='team'||section==='settings'||section==='shipping'||section==='reports')setView(section);let active=true;const expired=()=>{setUser(null);setStock([]);setMovements([]);setProducts([]);setLocations([]);pending.current=null;};window.addEventListener('nexo-session-expired',expired);
    api('auth/me').then(async data=>{if(!active)return;if(data.user.role!=='CUSTOMER'&&!params.get('seccion')){window.location.replace('/inicio');return;}setUser(data.user);if(data.user.role!=='CUSTOMER')await load(0,0);}).catch(error=>{if(active)setMessage(error.message);}).finally(()=>{if(active)setChecking(false);});
    return()=>{active=false;window.removeEventListener('nexo-session-expired',expired);};},[]); // Initial session check only.
  async function login(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,f=new FormData(form);setBusy(true);setMessage('');
    try{const data=await api('auth/login',{method:'POST',body:JSON.stringify({company:f.get('company'),email:f.get('email'),password:f.get('password')})});form.reset();window.location.replace('/inicio');}
    catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
  }
  async function refresh(p=page,pp=productPage){setBusy(true);setMessage('');try{await load(p,pp);}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  async function movement(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,f=new FormData(form);
    const body=JSON.stringify({kind,productId:f.get('product'),locationId:f.get('location'),quantity:Number(f.get('quantity')),reason:f.get('reason'),...(kind==='TRANSFER'?{destinationId:f.get('destination')}:{})});
    if(pending.current?.body!==body)pending.current={body,key:crypto.randomUUID()};
    const key=pending.current!.key;setBusy(true);setMessage('');
    try{await api('inventory/operations',{method:'POST',headers:{'idempotency-key':key},body});pending.current=null;form.reset();setMessage('Movimiento registrado.');
      try{await load();}catch{setMessage('Movimiento registrado. No se pudo actualizar la tabla; pulsa Actualizar.');}}
    catch(error){setMessage(`${(error as Error).message}. Si hubo un corte de conexión, reintenta sin cambiar los datos.`);}finally{setBusy(false);}
  }
  async function logout(){setBusy(true);try{await api('auth/logout',{method:'POST',body:'{}'});setUser(null);setStock([]);setMovements([]);setProducts([]);setLocations([]);pending.current=null;setMessage('Sesión cerrada.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  return <main className={styles.panel}>
    <header><a className="brand-link" href="/">nexo.</a><a href="/inicio">Inicio</a><h1>Espacio de trabajo</h1><p>Stock por ubicación y movimientos del equipo.</p></header>
    <p role="status" aria-live="polite">{checking?'Comprobando sesión…':message}</p>
    {!checking&&!user&&<section><h2>Acceso del equipo</h2><form onSubmit={login}>
      <label>Empresa (identificador)<input name="company" required autoComplete="organization" maxLength={63} defaultValue={companyHint}/></label>
      <label>Correo<input name="email" type="email" required autoComplete="username"/></label>
      <label>Contraseña<input name="password" type="password" required autoComplete="current-password" maxLength={128}/></label>
      <button disabled={busy}>Iniciar sesión</button></form></section>}
    {user&&<><div className={styles.bar}><span>{user.name} · {user.role==='OWNER'?'Propietario':user.role==='AGENT'?'Agente':'Cliente'}</span><button onClick={logout} disabled={busy}>Cerrar sesión</button></div>
      {user.role==='CUSTOMER'?<p>Este panel requiere una cuenta de agente o propietario.</p>:<>
        <div className="overview-grid" aria-label="Resumen de los datos cargados"><div className="overview-card"><span>Productos cargados</span><strong>{products.length}</strong><small>Grupo {productPage+1} del catálogo</small></div><div className="overview-card"><span>Ubicaciones visibles</span><strong>{locations.length}</strong><small>Según tus permisos</small></div><div className="overview-card"><span>Unidades disponibles</span><strong>{stock.reduce((sum,item)=>sum+item.available,0)}</strong><small>Página {page+1} del inventario</small></div></div>
        <nav aria-label="Secciones del panel">
          <button disabled={busy} aria-pressed={view==='inventory'} onClick={()=>setView('inventory')}>Inventario</button>
          <button disabled={busy} aria-pressed={view==='products'} onClick={()=>setView('products')}>Productos</button>
          <button disabled={busy} aria-pressed={view==='locations'} onClick={()=>setView('locations')}>Ubicaciones</button>
          <button disabled={busy} aria-pressed={view==='sales'} onClick={()=>setView('sales')}>Nueva venta</button>
          <button disabled={busy} aria-pressed={view==='orders'} onClick={()=>setView('orders')}>Pedidos y ventas</button>
          <button disabled={busy} aria-pressed={view==='reports'} onClick={()=>setView('reports')}>Reportes</button>
          <button disabled={busy} aria-pressed={view==='shipping'} onClick={()=>setView('shipping')}>Cotizaciones de envío</button>
          {user.role==='OWNER'&&<button disabled={busy} aria-pressed={view==='team'} onClick={()=>setView('team')}>Equipo y accesos</button>}
          {user.role==='OWNER'&&<button disabled={busy} aria-pressed={view==='settings'} onClick={()=>setView('settings')}>Configuración</button>}
        </nav>
        {(view==='products'||view==='locations')&&<CatalogManager key={view} view={view} role={user.role} products={products} locations={locations} busy={busy} group={productPage} request={api} reload={()=>refresh()} setBusy={setBusy} changeGroup={p=>refresh(page,p)}/>}
        <SalesOrders role={user.role} view={view==='sales'||view==='orders'?view:null} products={products} locations={locations} group={productPage} busy={busy} setBusy={setBusy} request={api} reload={()=>refresh()} changeGroup={p=>refresh(page,p)}/>
        {view==='team'&&user.role==='OWNER'&&<TeamManager viewerId={user.id} locations={locations} busy={busy} setBusy={setBusy} request={api}/>}
        {view==='reports'&&<ReportsManager role={user.role} busy={busy} setBusy={setBusy} request={api}/>}
        {view==='shipping'&&<ShippingManager locations={locations} busy={busy} setBusy={setBusy} request={api}/>}
        {view==='settings'&&user.role==='OWNER'&&<CompanyManager busy={busy} setBusy={setBusy} request={api}/>}
        {view==='inventory'&&<>
        {page===0&&productPage===0&&(!products.length||!locations.length)&&<section><h2>Comencemos con tu inventario</h2><p>Primero crea una ubicación y agrega un producto. Después registra una entrada para cargar tus unidades.</p><div className={styles.bar}>{user.role==='OWNER'&&<button onClick={()=>setView('locations')}>Configurar ubicaciones</button>}<button onClick={()=>setView('products')}>Agregar productos</button></div></section>}
        <div className={styles.bar}><h2>Existencias</h2><button onClick={()=>refresh()} disabled={busy}>Actualizar</button></div>
        <p>Stock disponible por ubicación. Las unidades reservadas se indican debajo.</p>
        <div className={styles.scroll}><table className={styles.stockMatrix}><thead><tr><th scope="col">Producto</th>{locations.map(l=><th scope="col" key={l.id}>{l.name.replace(/^Sucursal /,'')}</th>)}</tr></thead><tbody>
          {stockProducts.map(p=><tr key={p.product_id}><th scope="row">{p.product_name}<small>{p.sku}</small></th>{locations.map(l=>{const s=stockCells.get(`${p.product_id}-${l.id}`);return <td key={l.id}><strong>{s?.available??'—'}</strong>{!!s?.reserved&&<small>{s.reserved} reservadas</small>}</td>;})}</tr>)}
          {!stock.length&&<tr><td colSpan={locations.length+1}>Sin productos en esta página.</td></tr>}</tbody></table></div>
        <nav aria-label="Páginas de existencias e historial"><button disabled={busy||page===0} onClick={()=>refresh(page-1)}>Anterior</button><span>Página {page+1}</span><button disabled={busy||(stockProductCount<50&&movements.length<50)} onClick={()=>refresh(page+1)}>Siguiente</button></nav>
        <section><h2>Registrar movimiento</h2><p>Las ventas con pedido se registrarán desde su propio flujo. Aquí puedes ingresar, ajustar y transferir unidades.</p>
          <form onSubmit={movement}><fieldset disabled={busy}>
            <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value)}><option value="RECEIPT">Entrada</option><option value="ADJUSTMENT">Ajuste (+ / −)</option><option value="TRANSFER">Transferencia</option></select></label>
            <label>Producto<select name="product" required key={`products-${productPage}`}><option value="">Selecciona un producto</option>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label>
            <div className={styles.bar}><button type="button" disabled={productPage===0} onClick={()=>refresh(page,productPage-1)}>Productos anteriores</button><span>Grupo {productPage+1}</span><button type="button" disabled={products.length<100} onClick={()=>refresh(page,productPage+1)}>Más productos</button></div>
            <label>Ubicación de origen<select name="location" required><option value="">Selecciona ubicación</option>{locations.filter(l=>l.active).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            {kind==='TRANSFER'&&<label>Destino<select name="destination" required><option value="">Selecciona destino</option>{locations.filter(l=>l.active).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
            <label>Cantidad{kind==='ADJUSTMENT'?' (diferencia con signo)':''}<input name="quantity" type="number" required step={1} min={kind==='ADJUSTMENT'?-1000000:1} max={1000000}/></label>
            <label>Motivo<textarea name="reason" required minLength={3} maxLength={500}/></label><button>Registrar movimiento</button>
          </fieldset></form></section>
        <section><h2>Historial de movimientos</h2><div className={styles.scroll}><table><thead><tr><th>Fecha</th><th>SKU</th><th>Ubicación</th><th>Tipo</th><th>Unidades</th><th>Motivo</th></tr></thead><tbody>
          {movements.map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString('es-CL')}</td><td>{m.sku}</td><td>{m.location_name}</td><td>{{RECEIPT:'Entrada',ADJUSTMENT:'Ajuste',TRANSFER:'Transferencia',SALE:'Venta',RETURN:'Devolución'}[m.kind]??m.kind}</td><td>{m.delta>0?'+':''}{m.delta}</td><td>{m.reason}</td></tr>)}
          {!movements.length&&<tr><td colSpan={6}>Sin movimientos en esta página.</td></tr>}</tbody></table></div></section>
        </>}
      </> }</>}
    <footer>Impulsado con tecnología Nexo</footer>
  </main>;
}


