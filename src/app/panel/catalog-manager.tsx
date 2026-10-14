'use client';
import {IconButton} from '../action-icon';
import {useRef,useState,type FormEvent,type ReactNode} from 'react';
import Modal from './modal';
export type ManagedProduct={id:string;sku:string;name:string;active:boolean;description:string;price_minor:string;image_url:string|null};
export type ManagedLocation={id:string;name:string;active:boolean;kind:'WEB'|'STORE';shipping_enabled:boolean};
type Props={filterControls?:ReactNode;role:string;view:'products'|'locations';products:ManagedProduct[];locations:ManagedLocation[];busy:boolean;group:number;
  request:(path:string,options?:RequestInit)=>Promise<unknown>;reload:()=>Promise<void>;setBusy:(value:boolean)=>void;changeGroup:(page:number)=>Promise<void>};
export default function CatalogManager({filterControls,role,view,products,locations,busy,group,request,reload,setBusy,changeGroup}:Props){
  const [product,setProduct]=useState<ManagedProduct|null>(null),[location,setLocation]=useState<ManagedLocation|null>(null);
  const [revision,setRevision]=useState(0),[kind,setKind]=useState<'WEB'|'STORE'>('STORE'),[notice,setNotice]=useState('');
  const [editorOpen,setEditorOpen]=useState(false);
  const submitting=useRef(false),owner=role==='OWNER';
  async function save(event:FormEvent<HTMLFormElement>,entity:'products'|'locations'){
    event.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setNotice('');
    const data=new FormData(event.currentTarget),selected=entity==='products'?product:location;
    const payload=entity==='products'?{sku:data.get('sku'),name:data.get('name'),description:data.get('description'),priceMinor:Number(data.get('price')),...(data.has('removeImage')?{imageUrl:null}:String(data.get('image')??'').trim()?{imageUrl:String(data.get('image')).trim()}:product?.image_url?.startsWith('/')?{}:{imageUrl:null}),...(product?{active:data.has('active')}:{})}:
      owner?{name:data.get('name'),...(location?{active:data.has('active')}:{kind}),...(kind==='STORE'?{shippingEnabled:data.has('shipping')}:{})}:{shippingEnabled:data.has('shipping')};
    try{
      await request(`${entity}${selected?`/${selected.id}`:''}`,{method:selected?'PATCH':'POST',body:JSON.stringify(payload)});
      setNotice(entity==='products'?'Producto guardado.':'Ubicación guardada.');
      if(entity==='products')setProduct(null);else{setLocation(null);setKind('STORE');}setRevision(r=>r+1);setEditorOpen(false);await reload();
    }catch(error){setNotice(`${(error as Error).message}. Si se cortó la conexión, actualiza el listado antes de repetir el alta.`);}
    finally{submitting.current=false;setBusy(false);}
  }
  return <>
    <p role="status" aria-live="polite">{notice}</p>
    {view==='products'&&<section><h2>Productos</h2><p>Grupo {group+1}. Los precios se expresan en pesos chilenos enteros.</p>{filterControls}
      <div style={{overflowX:'auto'}}><table><thead><tr><th>SKU</th><th>Nombre</th><th>Precio CLP</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
        {products.map(p=><tr key={p.id}><td>{p.sku}</td><td>{p.name}</td><td>{p.price_minor}</td><td>{p.active?'Activo':'Inactivo'}</td><td><button disabled={busy} aria-label={`Editar ${p.name}`} onClick={()=>{setProduct(p);setNotice('');setEditorOpen(true);}}>Editar</button></td></tr>)}
        {!products.length&&<tr><td colSpan={5}>No hay productos que coincidan con los filtros en esta página.</td></tr>}</tbody></table></div>
      <nav aria-label="Grupos del catálogo"><IconButton icon="previous" label="Grupo anterior" disabled={busy||group===0} onClick={()=>changeGroup(group-1)}/><IconButton icon="next" label="Grupo siguiente" disabled={busy||products.length<100} onClick={()=>changeGroup(group+1)}/></nav>
      <button disabled={busy} onClick={()=>{setProduct(null);setRevision(r=>r+1);setNotice('');setEditorOpen(true);}}>Nuevo producto</button>
      {editorOpen&&<Modal title={product?`Editar ${product.sku}`:'Crear producto'} busy={busy} onClose={()=>setEditorOpen(false)}><p role="status" aria-live="polite">{notice}</p>
      <form key={`product-${product?.id??'new'}-${revision}`} onSubmit={e=>save(e,'products')}><fieldset disabled={busy}>
        <label>SKU<input name="sku" required maxLength={200} defaultValue={product?.sku??''}/></label>
        <label>Nombre del producto<input name="name" required maxLength={200} defaultValue={product?.name??''}/></label>
        <label>Precio CLP<input name="price" type="number" required min={0} max={1e12} step={1} defaultValue={product?.price_minor??''}/></label>
        <label>Descripción<textarea name="description" maxLength={5000} defaultValue={product?.description??''}/></label>
        <label>URL de imagen HTTPS<input name="image" type="url" pattern="https://.*" defaultValue={product?.image_url?.startsWith('/')?'':product?.image_url??''}/></label>
        {product&&<><label>Subir imagen (PNG, JPEG o WebP, hasta 2 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2097152){setNotice('Máximo 2 MB');return;}setBusy(true);try{const uploaded=await request(`products/${product.id}/image`,{method:'POST',headers:{'content-type':file.type},body:file}) as {image_url:string};setProduct(current=>current?{...current,image_url:uploaded.image_url}:current);setNotice('Imagen cargada.');await reload();}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}}/></label><label><input name="removeImage" type="checkbox"/> Quitar imagen al guardar</label></>}
        {product&&<label><input name="active" type="checkbox" defaultChecked={product.active}/> Producto activo</label>}
        <button>{product?'Guardar producto':'Crear producto'}</button>
      </fieldset></form><p>Desactivar conserva el historial. No se permite si existen reservas pendientes.</p></Modal>}
    </section>}
    {view==='locations'&&<section><h2>Sucursales y stock web</h2><div style={{overflowX:'auto'}}><table><thead><tr><th>Ubicación</th><th>Tipo</th><th>Estado</th><th>Envío desde tienda</th><th>Acción</th></tr></thead><tbody>
      {locations.map(l=><tr key={l.id}><td>{l.name}</td><td>{l.kind==='WEB'?'Stock web':'Sucursal'}</td><td>{l.active?'Activa':'Inactiva'}</td><td>{l.kind==='WEB'?'Origen web':l.shipping_enabled?'Permitido':'Solo retiro'}</td><td>
        {(owner||(l.active&&l.kind==='STORE'))&&<button disabled={busy} aria-label={`Editar ${l.name}`} onClick={()=>{setLocation(l);setKind(l.kind);setNotice('');setEditorOpen(true);}}>Editar</button>}</td></tr>)}
      {!locations.length&&<tr><td colSpan={5}>Sin ubicaciones asignadas o creadas.</td></tr>}</tbody></table></div>
      {owner&&<button disabled={busy} onClick={()=>{setLocation(null);setKind('STORE');setRevision(r=>r+1);setNotice('');setEditorOpen(true);}}>Nueva ubicación</button>}
      {editorOpen&&(owner||location)&&<Modal title={location?`Editar ${location.name}`:'Crear ubicación'} busy={busy} onClose={()=>setEditorOpen(false)}><p role="status" aria-live="polite">{notice}</p><form key={`location-${location?.id??'new'}-${revision}`} onSubmit={e=>save(e,'locations')}><fieldset disabled={busy}>
        {owner&&<><label>Nombre de ubicación<input name="name" required maxLength={200} defaultValue={location?.name??''}/></label>
          <label>Tipo de ubicación<select value={kind} disabled={Boolean(location)} onChange={e=>setKind(e.target.value as 'WEB'|'STORE')}><option value="STORE">Sucursal</option><option value="WEB">Stock web</option></select></label></>}
        {kind==='STORE'&&<label><input name="shipping" type="checkbox" defaultChecked={location?.shipping_enabled??false}/> Permitir envío desde esta sucursal</label>}
        {owner&&location&&<label><input name="active" type="checkbox" defaultChecked={location.active}/> Ubicación activa</label>}
        <button>{location?'Guardar ubicación':'Crear ubicación'}</button>
      </fieldset></form></Modal>}
      <p>{owner?'Solo puede existir una ubicación de stock web por empresa. El tipo no se cambia tras crearla.':'Puedes modificar la disponibilidad de envío de las sucursales activas que tengas asignadas.'}</p>
    </section>}
  </>;
}
