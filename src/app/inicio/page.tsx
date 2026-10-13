import {redirect} from 'next/navigation';
import {pageSession} from '../../server/page-session';
import {database} from '../../server/db';
import LogoutButton from './logout-button';
export default async function WorkspaceHome(){
  const user=await pageSession();
  if(!user)redirect('/panel');
  const company=(await database().query('SELECT name,slug FROM companies WHERE id=$1',[user.company_id])).rows[0];
  if(user.role==='CUSTOMER')redirect(`/tienda?empresa=${encodeURIComponent(company.slug)}`);
  const panel=(section:string)=>`/panel?seccion=${section}`;
  return <main className="welcome business-home">
    <header className="home-header"><a className="brand" href="/inicio" aria-label="Nexo, inicio">nexo<span className="brand-dot">.</span></a><div><span className="workspace-label">{company.name}</span><LogoutButton/></div></header>
    <section className="workspace-welcome"><span className="eyebrow">TU ESPACIO DE TRABAJO</span><h1>Hola, {user.name}.</h1><p className="lead">Todo listo para trabajar en {company.name}. ¿Por dónde comenzamos?</p></section>
    <div className="work-grid">
      <a className="work-card" href={panel('inventory')}><span className="card-number">01 / OPERACIÓN</span><h2>Inventario</h2><p>Consulta el stock por sucursal y registra entradas, ajustes o transferencias.</p><strong>Abrir inventario →</strong></a>
      <a className="work-card" href={panel('products')}><span className="card-number">02 / CATÁLOGO</span><h2>Productos y precios</h2><p>Organiza los productos y actualiza sus datos y precios.</p><strong>Administrar productos →</strong></a>
      <a className="work-card" href={panel('locations')}><span className="card-number">03 / UBICACIONES</span><h2>Sucursales y stock web</h2><p>Consulta tus ubicaciones y gestiona el envío desde tiendas.</p><strong>Ver ubicaciones →</strong></a>
    </div>
    <nav aria-label="Más herramientas"><a className="secondary" href={panel('sales')}>Nueva venta local →</a><a className="secondary" href={panel('orders')}>Pedidos y ventas →</a><a className="secondary" href={panel('reports')}>Reportes →</a><a className="secondary" href={panel('shipping')}>Cotizaciones de envío →</a>{user.role==='OWNER'&&<><a className="secondary" href={panel('team')}>Equipo y accesos →</a><a className="secondary" href={panel('settings')}>Configuración →</a></>}</nav>
    <footer className="business-footer"><span>Impulsado con tecnología <strong>Nexo</strong></span><a href={`/tienda?empresa=${encodeURIComponent(company.slug)}`}>Ver catálogo público →</a></footer>
  </main>;
}
