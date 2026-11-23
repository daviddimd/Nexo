export type AccessMode='login'|'register'|'forgot'|'resend'|'verify'|'reset';
export function storeHome(slug:string){return `/tienda?${new URLSearchParams({empresa:slug})}`;}
/** Only return to this tenant's catalog, products, cart or account page; never accept external redirects. */
export function storeReturnPath(raw:unknown,slug:string){
 const fallback=storeHome(slug);
 if(typeof raw!=='string'||raw.length>2048||!raw.startsWith('/')||raw.startsWith('//')||/[\\\r\n]/.test(raw))return fallback;
 try{
  const url=new URL(raw,'https://nexo.local');
  if(url.origin!=='https://nexo.local'||!(url.pathname==='/tienda'||url.pathname==='/tienda/configuracion'||url.pathname==='/tienda/carrito'||url.pathname==='/tienda/mis-compras'||/^\/tienda\/(productos|pedido)\/[0-9a-f-]{36}$/i.test(url.pathname)))return fallback;
  const company=url.searchParams.get('empresa');if(company&&company!==slug)return fallback;
  url.searchParams.set('empresa',slug);return url.pathname+url.search+url.hash;
 }catch{return fallback;}
}
export function storeAccessPath(mode:AccessMode,slug:string,returnTo?:string){
 const query=new URLSearchParams({empresa:slug,volver:storeReturnPath(returnTo,slug)});
 if(mode!=='login'&&mode!=='register')query.set('modo',mode);
 return `/tienda/${mode==='register'?'crear-cuenta':'iniciar-sesion'}?${query}`;
}

export type StoreAccountSection='info'|'address'|'payments'|'orders'|'security';
export function storeAccountSection(value:unknown):StoreAccountSection{
 return typeof value==='string'&&['info','address','payments','orders','security'].includes(value)?value as StoreAccountSection:'info';
}
export function storeAccountPath(slug:string,section:StoreAccountSection='info',order?:string){
 const query=new URLSearchParams({empresa:slug,seccion:section});
 if(order&&/^[0-9a-f-]{36}$/i.test(order))query.set('pedido',order);
 return '/tienda/configuracion?'+query;
}

export function storePurchasesPath(slug:string){
 return '/tienda/mis-compras?'+new URLSearchParams({empresa:slug});
}

export function storeCartPath(slug:string,delivery?:'pickup'|'shipping'){
 return '/tienda/carrito?'+new URLSearchParams({empresa:slug,...(delivery?{entrega:delivery}:{})});
}

export function storeOrderPath(slug:string,id:string,confirmation=false){
 return '/tienda/pedido/'+encodeURIComponent(id)+'?'+new URLSearchParams({empresa:slug,...(confirmation?{vista:'confirmacion'}:{})});
}
