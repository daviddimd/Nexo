export type AccessMode='login'|'register'|'forgot'|'resend'|'verify'|'reset';
export function storeHome(slug:string){return `/tienda?${new URLSearchParams({empresa:slug})}`;}
/** Only return to this tenant's catalog or product pages; never accept external redirects. */
export function storeReturnPath(raw:unknown,slug:string){
 const fallback=storeHome(slug);
 if(typeof raw!=='string'||raw.length>2048||!raw.startsWith('/')||raw.startsWith('//')||/[\\\r\n]/.test(raw))return fallback;
 try{
  const url=new URL(raw,'https://nexo.local');
  if(url.origin!=='https://nexo.local'||!(url.pathname==='/tienda'||/^\/tienda\/productos\/[0-9a-f-]{36}$/i.test(url.pathname)))return fallback;
  const company=url.searchParams.get('empresa');if(company&&company!==slug)return fallback;
  url.searchParams.set('empresa',slug);return url.pathname+url.search+url.hash;
 }catch{return fallback;}
}
export function storeAccessPath(mode:AccessMode,slug:string,returnTo?:string){
 const query=new URLSearchParams({empresa:slug,volver:storeReturnPath(returnTo,slug)});
 if(mode!=='login'&&mode!=='register')query.set('modo',mode);
 return `/tienda/${mode==='register'?'crear-cuenta':'iniciar-sesion'}?${query}`;
}
