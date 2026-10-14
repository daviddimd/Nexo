import type {ButtonHTMLAttributes} from 'react';

type IconName='logout'|'previous'|'next'|'refresh'|'settings'|'profile'|'team'|'security'|'company'|'identity'|'clock';
export function ActionIcon({name,size=22}:{name:IconName;size?:number}){
  const paths:Record<IconName,string[]>={
    logout:['M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4','M10 12h10','m16 8 4 4-4 4'],
    previous:['m14 6-6 6 6 6'],
    next:['m10 6 6 6-6 6'],
    refresh:['M20 10a8 8 0 1 0-2.34 7.66','M20 4v6h-6'],
    profile:['M5 20v-1c0-3.3 3.1-6 7-6s7 2.7 7 6v1H5Z'],
    team:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M22 21v-2a4 4 0 0 0-3-3.87','M16 3.13a4 4 0 0 1 0 7.75'],
    security:['M12 3 4 6v6c0 4.5 4.5 7.5 8 9 3.5-1.5 8-4.5 8-9V6l-8-3Z','m8.5 12 2.5 2.5 4.5-5'],
    company:['M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16','M16 9h3a1 1 0 0 1 1 1v11','M2 21h20','M8 7h4M8 11h4M8 15h4','M9 21v-3h2v3'],
    identity:['M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4l-.4-.4a1.8 1.8 0 0 1 1.3-3.1H17a4 4 0 0 0 4-4c0-4-4-7.1-9-7.1Z','M7.5 10h.01M10 6.5h.01M14 6.5h.01M17 9.5h.01'],
    clock:['M12 7v5l3 2'],
    settings:['M9.5 4.5 10 2h4l.5 2.5 2 .9 2.4-.8 2 3.5-1.9 1.7v2.4l1.9 1.7-2 3.5-2.4-.8-2 .9L14 20h-4l-.5-2.5-2-.9-2.4.8-2-3.5L5 12.2V9.8L3.1 8.1l2-3.5 2.4.8 2-.9Z'],
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name].map((d,i)=><path key={i} d={d} fill={name==='profile'?'currentColor':'none'} fillOpacity={name==='profile'?0.12:undefined}/>)}{name==='profile'&&<circle cx="12" cy="7.5" r="3.5" fill="currentColor" fillOpacity="0.12"/>}{name==='team'&&<circle cx="9" cy="7" r="4"/>}{name==='clock'&&<circle cx="12" cy="12" r="9"/>}{name==='settings'&&<circle cx="12" cy="11" r="3"/>}</svg>;
}
export function IconButton({icon,label,className='',type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{icon:IconName;label:string}){
  return <button {...props} type={type} className={`icon-button ${className}`} aria-label={label} title={label}><ActionIcon name={icon}/></button>;
}
