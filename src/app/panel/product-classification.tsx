'use client';
import {useState} from 'react';
import type {Category,Specifications} from '../../catalog/taxonomy';
export default function ProductClassification({categories,categoryId,specifications}:{categories:Category[];categoryId?:string|null;specifications?:Specifications}){
 const [selected,setSelected]=useState(categoryId??''),[values,setValues]=useState<Specifications>(specifications??{});
 const category=categories.find(c=>c.id===selected);
 return <>
  <label>Categoría<select name="categoryId" required value={selected} onChange={e=>{setSelected(e.target.value);setValues({});}}><option value="">Seleccionar categoría…</option>{categories.map(c=><option key={c.id} value={c.id}>{c.path}</option>)}</select></label>
  {category&&<div><h3>Especificaciones</h3><p style={{fontSize:12,color:'#61718a'}}>Completa los datos conocidos. Al cambiar de categoría debes revisar las especificaciones.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'0 16px'}}>
   {category.fields.map(field=><label key={`${selected}-${field.key}`}>{field.label}{field.unit?` (${field.unit})`:''}
    {field.type==='select'?<select name={`spec_${field.key}`} value={String(values[field.key]??'')} onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))}><option value="">Sin especificar</option>{field.options!.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:
     field.type==='boolean'?<select name={`spec_${field.key}`} value={values[field.key]===undefined?'':String(values[field.key])} onChange={e=>{const value=e.target.value;setValues(v=>{const next={...v};if(value==='')delete next[field.key];else next[field.key]=value==='true';return next;});}}><option value="">Sin especificar</option><option value="true">Sí</option><option value="false">No</option></select>:
     <input name={`spec_${field.key}`} type={field.type==='number'?'number':'text'} step={field.type==='number'?'any':undefined} min={field.min} max={field.max} maxLength={200} list={field.suggestions?`spec-options-${field.key}`:undefined} value={String(values[field.key]??'')} onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))}/>}
    {field.suggestions&&<datalist id={`spec-options-${field.key}`}>{field.suggestions.map(value=><option key={value} value={value}/>)}</datalist>}
    {field.key==='capacity_gb'&&<small style={{fontSize:11,color:'#61718a'}}>Capacidad comercial: 1 TB = 1000 GB. Conserva 500 GB y 512 GB como capacidades distintas.</small>}
   </label>)}
  </div></div>}
 </>;
}
