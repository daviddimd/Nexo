'use client';
import {useEffect,useState} from 'react';
import CompanyManager from './company-manager';
import TeamManager from './team-manager';
import AccountSettings from './account-settings';
import type {ManagedLocation} from './catalog-manager';
import styles from './panel.module.css';
import {ActionIcon} from '../action-icon';
type Category='account'|'details'|'identity'|'orders'|'team';
export default function SettingsWorkspace({user,locations,busy,setBusy,request,initialTeam=false}:{user:{id:string;name:string;role:string};locations:ManagedLocation[];busy:boolean;setBusy:(v:boolean)=>void;request:(p:string,o?:RequestInit)=>Promise<any>;initialTeam?:boolean}){
  const owner=user.role==='OWNER';
  const [category,setCategory]=useState<Category>(initialTeam&&owner?'team':'account');
  useEffect(()=>{const value=new URLSearchParams(window.location.search).get('categoria');if(value==='account'||owner&&(value==='details'||value==='identity'||value==='orders'||value==='team'))setCategory(value as Category);},[]);
  function select(next:Category){setCategory(next);const url=new URL(window.location.href);url.searchParams.set('seccion','settings');url.searchParams.set('categoria',next);window.history.replaceState(null,'',url);}
  const categories:[Category,string][]=[['account','Mi cuenta y seguridad'],...(owner?[['details','Empresa'],['identity','Identidad visual'],['orders','Reservas'],['team','Equipo y accesos']] as [Category,string][]:[])];
  return <div className={styles.settingsLayout}>
    <aside className={styles.settingsSidebar}><h2>Configuración</h2><nav aria-label="Categorías de configuración">{categories.map(([id,label])=><button key={id} disabled={busy} aria-pressed={category===id} onClick={()=>select(id)}><ActionIcon name={id==='account'?'security':id==='details'?'company':id==='identity'?'identity':id==='orders'?'clock':'team'} size={20}/><span>{label}</span></button>)}</nav></aside>
    <div className={styles.settingsContent}>
      {category==='account'&&<AccountSettings name={user.name} role={user.role} busy={busy} setBusy={setBusy} request={request}/>}
      {owner&&category==='team'&&<TeamManager viewerId={user.id} locations={locations} busy={busy} setBusy={setBusy} request={request}/>}
      {owner&&(category==='details'||category==='identity'||category==='orders')&&<CompanyManager key={category} category={category} busy={busy} setBusy={setBusy} request={request}/>}
    </div>
  </div>;
}
