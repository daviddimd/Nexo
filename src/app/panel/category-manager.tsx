'use client';
import {useState,type FormEvent} from 'react';
import type {Category,Attribute} from '../../catalog/taxonomy';
import Modal from './modal';

type Draft={key:string;label:string;type:Attribute['type'];unit:string;options:string};
export default function CategoryManager({categories,busy,setBusy,request,reload}:{categories:Category[];busy:boolean;setBusy:(v:boolean)=>void;request:(path:string,options?:RequestInit)=>Promise<unknown>;reload:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[notice,setNotice]=useState(''),[editing,setEditing]=useState<Category|null>(null),[drafts,setDrafts]=useState<Draft[]>([]);
 const slug=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;const f=new FormData(event.currentTarget);setBusy(true);setNotice('');
  const name=String(f.get('name')).trim();
  try{
   const attributes=drafts.map(d=>({key:d.key,label:d.label,type:d.type,...(d.unit?{unit:d.unit}:{}),...(d.type==='select'?{options:d.options.split(',').map(v=>v.trim()).filter(Boolean).map(value=>({value,label:value}))}:{})}));
   await request(`categories${editing?'/'+editing.id:''}`,{method:editing?'PATCH':'POST',body:JSON.stringify(editing?{name}:{name,slug:slug(name),parentId:f.get('parent')||null,attributes})});
   await reload();setEditing(null);setDrafts([]);setNotice('Categoría guardada.');
  }catch(error){setNotice((error as Error).message);}finally{setBusy(false);}
 }
 return <><button type="button" disabled={busy} onClick={()=>{setNotice('');setOpen(true);}}>Categorías</button>{open&&<Modal title="Categorías y especificaciones" busy={busy} onClose={()=>setOpen(false)}>
  <p>Las subcategorías heredan las especificaciones de su categoría superior. Marca y modelo están disponibles en todas.</p><p role="status">{notice}</p>
  <div style={{maxHeight:240,overflowY:'auto',borderBottom:'1px solid #e0e7f0'}}>{categories.map(c=><div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'8px 0 8px '+(c.depth*12)+'px'}}><span style={{fontSize:13}}>{c.path}<small style={{display:'block',color:'#61718a'}}>{c.fields.length} especificaciones</small></span><button type="button" disabled={busy} onClick={()=>{setEditing(c);setDrafts([]);setNotice('');}}>Editar</button></div>)}</div>
  <h3>{editing?'Editar nombre':'Nueva categoría'}</h3><form key={editing?.id??'new'} onSubmit={save}><fieldset disabled={busy}>
   <label>Nombre<input name="name" required maxLength={100} defaultValue={editing?.name??''}/></label>
   {!editing&&<><label>Categoría superior<select name="parent"><option value="">Ninguna · categoría principal</option>{categories.filter(c=>c.depth<4).map(c=><option key={c.id} value={c.id}>{c.path}</option>)}</select></label>
    {drafts.map((d,index)=><div key={index} style={{padding:14,border:'1px solid #dce6ed',borderRadius:10,marginBottom:12}}>
     <label>Nombre de especificación<input required maxLength={100} value={d.label} onChange={e=>{const label=e.target.value;setDrafts(v=>v.map((a,i)=>i===index?{...a,label,key:slug(label).replaceAll('-','_')}:a));}}/></label>
     <label>Identificador<input required pattern="[a-z][a-z0-9_]{0,39}" value={d.key} onChange={e=>setDrafts(v=>v.map((a,i)=>i===index?{...a,key:e.target.value}:a))}/></label>
     <label>Tipo<select value={d.type} onChange={e=>setDrafts(v=>v.map((a,i)=>i===index?{...a,type:e.target.value as Draft['type'],unit:''}:a))}><option value="text">Texto</option><option value="number">Número</option><option value="select">Lista de opciones</option><option value="boolean">Sí / No</option></select></label>
     {d.type==='number'&&<label>Unidad<input maxLength={20} value={d.unit} onChange={e=>setDrafts(v=>v.map((a,i)=>i===index?{...a,unit:e.target.value}:a))}/></label>}
     {d.type==='select'&&<label>Opciones separadas por coma<input required value={d.options} onChange={e=>setDrafts(v=>v.map((a,i)=>i===index?{...a,options:e.target.value}:a))}/></label>}
     <button type="button" onClick={()=>setDrafts(v=>v.filter((_,i)=>i!==index))}>Quitar especificación</button>
    </div>)}
    <button type="button" disabled={drafts.length>=20} onClick={()=>setDrafts(v=>[...v,{key:'',label:'',type:'text',unit:'',options:''}])}>Agregar especificación</button>
   </>}
   <div style={{display:'flex',gap:12,marginTop:20}}><button>{editing?'Guardar nombre':'Crear categoría'}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setDrafts([]);}}>Cancelar edición</button>}</div>
  </fieldset></form>
 </Modal>}</>;
}
