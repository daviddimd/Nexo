'use client';
import {useRef,useState,type FormEvent} from 'react';
import Modal from './modal';
import ProductClassification from './product-classification';
import LocationsWorkspace from './locations-workspace';
import managementStyles from './management-workspace.module.css';
import CategoryManager from './category-manager';
import ProductsWorkspace,{type ProductFilters} from './products-workspace';
import productStyles from './products-workspace.module.css';
import type {Category,Specifications} from '../../catalog/taxonomy';
export type ManagedProduct={id:string;sku:string;name:string;active:boolean;description:string;price_minor:string;image_url:string|null;category_id?:string|null;category_name?:string|null;specifications?:Specifications};
export type ManagedLocation={id:string;name:string;active:boolean;kind:'WEB'|'STORE';shipping_enabled:boolean};
type Props={categories:Category[];filters:ProductFilters;onFilter:(values:ProductFilters)=>Promise<boolean>;role:string;view:'products'|'locations';products:ManagedProduct[];locations:ManagedLocation[];busy:boolean;group:number;
  request:(path:string,options?:RequestInit)=>Promise<unknown>;reload:()=>Promise<void>;setBusy:(value:boolean)=>void;changeGroup:(page:number)=>Promise<void>};
export default function CatalogManager({categories,filters,onFilter,role,view,products,locations,busy,group,request,reload,setBusy,changeGroup}:Props){
  const [product,setProduct]=useState<ManagedProduct|null>(null),[location,setLocation]=useState<ManagedLocation|null>(null);
  const [revision,setRevision]=useState(0),[kind,setKind]=useState<'WEB'|'STORE'>('STORE'),[notice,setNotice]=useState('');
  const [editorOpen,setEditorOpen]=useState(false);
  const submitting=useRef(false),owner=role==='OWNER';
  async function save(event:FormEvent<HTMLFormElement>,entity:'products'|'locations'){
    event.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setNotice('');
    const data=new FormData(event.currentTarget),selected=entity==='products'?product:location;
    const category=categories.find(c=>c.id===data.get('categoryId'));
    const specifications:Specifications={};
    for(const field of category?.fields??[]){const value=String(data.get(`spec_${field.key}`)??'').trim();if(value!=='')specifications[field.key]=field.type==='number'?Number(value):field.type==='boolean'?value==='true':value;}
    const payload=entity==='products'?{categoryId:category?.id??null,specifications,sku:data.get('sku'),name:data.get('name'),description:data.get('description'),priceMinor:Number(data.get('price')),...(data.has('removeImage')?{imageUrl:null}:String(data.get('image')??'').trim()?{imageUrl:String(data.get('image')).trim()}:product?.image_url?.startsWith('/')?{}:{imageUrl:null}),...(product?{active:data.has('active')}:{})}:
      owner?{name:data.get('name'),...(location?{active:data.has('active')}:{kind}),...(kind==='STORE'?{shippingEnabled:data.has('shipping')}:{})}:{shippingEnabled:data.has('shipping')};
    try{
      await request(`${entity}${selected?`/${selected.id}`:''}`,{method:selected?'PATCH':'POST',body:JSON.stringify(payload)});
      setNotice(entity==='products'?'Producto guardado.':'Ubicación guardada.');
      if(entity==='products')setProduct(null);else{setLocation(null);setKind('STORE');}setRevision(r=>r+1);setEditorOpen(false);await reload();
    }catch(error){setNotice(`${(error as Error).message}. Si se cortó la conexión, actualiza el listado antes de repetir el alta.`);}
    finally{submitting.current=false;setBusy(false);}
  }
  return <>
    {notice&&<p role="status" aria-live="polite">{notice}</p>}
    {view==='products'&&<ProductsWorkspace products={products} categories={categories} filters={filters} busy={busy} page={group} request={request} onFilter={onFilter} onRefresh={reload} onPage={changeGroup} categoryControl={owner?<CategoryManager categories={categories} busy={busy} setBusy={setBusy} request={request} reload={reload}/>:null} onNew={()=>{setProduct(null);setRevision(r=>r+1);setNotice('');setEditorOpen(true);}} onEdit={selected=>{setProduct(selected);setNotice('');setEditorOpen(true);}}>
      {editorOpen&&<Modal title={product?`Editar ${product.sku}`:'Crear producto'} busy={busy} onClose={()=>setEditorOpen(false)}>{notice&&<p role="status" aria-live="polite">{notice}</p>}
      <form className={productStyles.editorForm} key={`product-${product?.id??'new'}-${revision}`} onSubmit={e=>save(e,'products')}><fieldset disabled={busy}>
        <div className={productStyles.editorBlock}><h3>Información del producto</h3><div className={productStyles.identityFields}><label>SKU<input name="sku" required maxLength={200} defaultValue={product?.sku??''}/></label>
        <label>Nombre del producto<input name="name" required maxLength={200} defaultValue={product?.name??''}/></label></div>
        <label>Precio CLP<input name="price" type="number" required min={0} max={1e12} step={1} defaultValue={product?.price_minor??''}/></label>
        </div><div className={productStyles.editorBlock}><h3>Clasificación y especificaciones</h3><ProductClassification categories={categories} categoryId={product?.category_id} specifications={product?.specifications}/></div>
        <div className={productStyles.editorBlock}><h3>Descripción e imagen</h3>
        <label>Descripción<textarea name="description" maxLength={5000} defaultValue={product?.description??''}/></label>
        {product?.image_url&&<div className={productStyles.editorPreview}><img src={product.image_url} alt={product.name}/><span>Imagen actual del producto</span></div>}
        <label>URL de imagen HTTPS<input name="image" type="url" pattern="https://.*" defaultValue={product?.image_url?.startsWith('/')?'':product?.image_url??''}/></label>
        {product&&<><label>Subir imagen (PNG, JPEG o WebP, hasta 2 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2097152){setNotice('Máximo 2 MB');return;}setBusy(true);try{const uploaded=await request(`products/${product.id}/image`,{method:'POST',headers:{'content-type':file.type},body:file}) as {image_url:string};setProduct(current=>current?{...current,image_url:uploaded.image_url}:current);setNotice('Imagen cargada.');await reload();}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}}/></label><label><input name="removeImage" type="checkbox"/> Quitar imagen al guardar</label></>}
        </div>{product&&<label><input name="active" type="checkbox" defaultChecked={product.active}/> Producto activo</label>}
        <div className={productStyles.save}><button type="button" onClick={()=>setEditorOpen(false)}>Cancelar</button><button type="submit">{product?'Guardar cambios':'Crear producto'}</button></div>
      </fieldset></form><p className={productStyles.editorNote}>Desactivar conserva el historial. No se permite si existen reservas pendientes.</p></Modal>}
    </ProductsWorkspace>}
    {view==='locations'&&<LocationsWorkspace locations={locations} owner={owner} busy={busy} onRefresh={reload} onNew={()=>{setLocation(null);setKind('STORE');setRevision(r=>r+1);setNotice('');setEditorOpen(true);}} onEdit={selected=>{setLocation(selected);setKind(selected.kind);setNotice('');setEditorOpen(true);}}>
      {editorOpen&&(owner||location)&&<Modal title={location?`Editar ${location.name}`:'Crear ubicación'} busy={busy} onClose={()=>setEditorOpen(false)}><div className={managementStyles.detail}>{notice&&<p role="status" aria-live="polite">{notice}</p>}<form key={`location-${location?.id??'new'}-${revision}`} onSubmit={e=>save(e,'locations')}><fieldset disabled={busy}>
        {owner&&<><label>Nombre de ubicación<input name="name" required maxLength={200} defaultValue={location?.name??''}/></label>
          <label>Tipo de ubicación<select value={kind} disabled={Boolean(location)} onChange={e=>setKind(e.target.value as 'WEB'|'STORE')}><option value="STORE">Sucursal</option><option value="WEB">Stock web</option></select></label></>}
        {kind==='STORE'&&<label><input name="shipping" type="checkbox" defaultChecked={location?.shipping_enabled??false}/> Permitir envío desde esta sucursal</label>}
        {owner&&location&&<label><input name="active" type="checkbox" defaultChecked={location.active}/> Ubicación activa</label>}
        <div className={managementStyles.formActions}><button type="button" onClick={()=>setEditorOpen(false)}>Cancelar</button><button type="submit">{location?'Guardar cambios':'Crear ubicación'}</button></div>
      </fieldset></form></div></Modal>}

    </LocationsWorkspace>}
  </>;
}
