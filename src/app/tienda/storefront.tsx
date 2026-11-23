'use client';
import TechnologySignature from '../technology-signature';
import {useRouter} from 'next/navigation';
import {storeAccessPath,storeAccountPath,storeCartPath,storeOrderPath,storePurchasesPath,storeHome,type StoreAccountSection} from '../../catalog/store-access-paths';
import StoreHeader from './store-header';
import type {ReactNode} from 'react';
import {storeTheme} from './store-identity';
import StoreProfileMenu from './store-profile-menu';
import StoreCart from './store-cart';
import StorePurchases,{StorePaymentConfirmation,StorePurchaseDetail} from './store-purchases';
import StoreAccount from './store-account';
import type {CustomerProfile,TestCard} from './customer-types';
import StoreCatalog,{emptyStoreFilters,type StoreFilters,type StoreLocation} from './store-catalog';
import styles from './storefront.module.css';
import {animateProductToCart,useStoreCart,type StoreProduct} from './cart-context';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {type Category} from '../../catalog/taxonomy';
type Product=StoreProduct;
export default function Storefront({children,initialCompany,initialCategories=[],initialCategoryId='',checkoutPage=false,purchasesPage=false,settingsPage=false,settingsSection='info',returnOrder,orderId,confirmationPage=false}:{checkoutPage?:boolean;purchasesPage?:boolean;settingsPage?:boolean;settingsSection?:StoreAccountSection;returnOrder?:string;orderId?:string;confirmationPage?:boolean;children?:ReactNode;initialCompany?:{id:string;slug:string;name:string;logo_url:string|null;primary_color:string|null};initialCategories?:Category[];initialCategoryId?:string}={}){
 const router=useRouter();
 const [categories,setCategories]=useState<Category[]>(initialCategories),[storeLocations,setStoreLocations]=useState<StoreLocation[]>([]),[filters,setFilters]=useState<StoreFilters>({...emptyStoreFilters,categoryId:initialCategoryId});
 const [slug,setSlug]=useState(initialCompany?.slug??''),[company,setCompany]=useState<any>(initialCompany??null),[products,setProducts]=useState<Product[]>([]),[page,setPage]=useState(0),[catalogTotal,setCatalogTotal]=useState(0),[user,setUser]=useState<any>(null);
 const {cart,setCart,hydrated:cartHydrated}=useStoreCart(slug);
 const [profileData,setProfileData]=useState<CustomerProfile|null>(null),[cards,setCards]=useState<TestCard[]>([]),[checkoutDelivery,setCheckoutDelivery]=useState<'pickup'|'shipping'>('pickup');
 const rememberAddress=useRef(false);
 const [orders,setOrders]=useState<any[]>([]),[quotes,setQuotes]=useState<any[]>([]),[orderPage,setOrderPage]=useState(0),[quotePage,setQuotePage]=useState(0),[detail,setDetail]=useState<any>(null);
 const [busy,setBusy]=useState(true),[notice,setNotice]=useState(''),[modal,setModal]=useState<'cart'|'detail'|null>(null),[unknown,setUnknown]=useState(false);
 const pending=useRef<{path:string;body:string;key:string}|null>(null),saving=useRef(false);
 async function api(path:string,options:RequestInit={}){const r=await fetch(`/api/${path}`,{cache:'no-store',...options,headers:{'content-type':'application/json',...options.headers}});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error?.message??'No se pudo completar'),{status:r.status});return d;}
 async function catalog(s=slug,p=page,f=filters){const query=new URLSearchParams({limit:'24',offset:String(p*24),...f,specs:JSON.stringify(f.specs)});const v=await api(`public/${encodeURIComponent(s)}/catalog?${query}`);setProducts(v.products);setCatalogTotal(v.total);setCategories(v.categories);setStoreLocations(v.locations);setPage(p);setFilters(f);return v.company;}
 async function personal(op=orderPage,qp=quotePage){const [o,q,profile,methods]=await Promise.all([api(`orders?limit=10&offset=${op*10}`),api(`shipping/quotes?limit=10&offset=${qp*10}`),api('customer/profile'),api('customer/test-cards').catch(error=>{if(error.status===404)return {items:[]};throw error;})]);setOrders(o.items);setQuotes(q.items);setProfileData(profile);setCards(methods.items);setUser((current:any)=>current?{...current,name:profile.name}:current);setOrderPage(op);setQuotePage(qp);}
 function navigateAccess(mode:'login'|'register',fromCart=false){
  const target=new URL(window.location.href);target.searchParams.set('empresa',slug);
  target.searchParams.delete('carrito');target.searchParams.delete('entrega');
  setModal(null);router.push(storeAccessPath(mode,slug,fromCart?storeCartPath(slug,checkoutDelivery):target.pathname+target.search+target.hash));
 }
 function checkoutAccount(mode:'login'|'register'){navigateAccess(mode,true);}


 useEffect(()=>{const s=initialCompany?.slug??new URLSearchParams(location.search).get('empresa')??'';setSlug(s);const checkoutQuery=new URLSearchParams(location.search);if(checkoutQuery.get('entrega')==='shipping')setCheckoutDelivery('shipping');if(!checkoutPage&&s&&checkoutQuery.get('carrito')==='1'){router.replace(storeCartPath(s,checkoutQuery.get('entrega')==='shipping'?'shipping':undefined));return;}if(!s){setNotice('Abre la tienda con el identificador de la empresa.');setBusy(false);return;}setBusy(true);(async()=>{try{const categoryId=new URLSearchParams(location.search).get('categoria')??initialCategoryId;const c=await catalog(s,0,{...emptyStoreFilters,categoryId,brand:new URLSearchParams(location.search).get('marca')??'',q:new URLSearchParams(location.search).get('q')??''}),settings=await api(`public/${encodeURIComponent(s)}/settings`);setCompany({...c,...settings});try{const me=await api('auth/me');setUser(me.user);if(me.user.role==='CUSTOMER'&&me.user.company_id===c.id){
 if(orderId){
  const order=await api('orders/'+orderId);
  if(order.status==='RESERVED')try{await personal(0,0);}catch(error){setNotice((error as Error).message);}
  setDetail({...order,kind:'orders'});
  return;
 }
 await personal(0,0);
 const requestedOrder=new URLSearchParams(location.search).get('pedido');
 if(!settingsPage&&requestedOrder&&/^[0-9a-f-]{36}$/i.test(requestedOrder)){
  router.replace(storeOrderPath(s,requestedOrder));
 }
}}catch(e){if((e as any).status!==401)throw e;}}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}})();},[]);
 const customer=user?.role==='CUSTOMER'&&user.company_id===company?.id;
 async function run(work:()=>Promise<void>){if(saving.current)return;saving.current=true;setBusy(true);setNotice('');try{await work();}catch(e){setNotice((e as Error).message);}finally{saving.current=false;setBusy(false);}}
 async function logout(){await run(async()=>{try{await api('auth/logout',{method:'POST',body:'{}'});}catch(error){if((error as {status?:number}).status!==401)throw error;}setUser(null);setProfileData(null);setCards([]);setOrders([]);setQuotes([]);setDetail(null);pending.current=null;setUnknown(false);setModal(null);setNotice('Sesión cerrada. Puedes seguir explorando la tienda.');if(settingsPage||orderId||purchasesPage)router.replace('/tienda?'+new URLSearchParams({empresa:slug}));});}

 async function sendPending(){if(!pending.current)return;await run(async()=>{const p=pending.current;if(!p)return;let result:any;try{result=await api(p.path,{method:'POST',headers:{'idempotency-key':p.key},body:p.body});}catch(error){setUnknown(!(error as {status?:number}).status);throw error;}pending.current=null;setUnknown(false);setCart([]);
  const payload=JSON.parse(p.body);
  if(rememberAddress.current&&payload.address&&profileData){try{await api('customer/profile',{method:'PATCH',body:JSON.stringify({phone:payload.address.phone,defaultAddress:payload.address})});}catch{setNotice('Pedido creado. No se pudo guardar la dirección en tu cuenta.');}}rememberAddress.current=false;
  if(p.path==='orders'){router.push(storeOrderPath(slug,result.id));return;}
  setDetail({...result,kind:'shipping/quotes'});setModal('detail');
  try{await personal(0,0);await catalog();}catch{setNotice('Pedido registrado. No se pudo actualizar la vista; revisa tus pedidos antes de repetirlo.');}
 });}


 function prepare(path:string,body:any){const serialized=JSON.stringify(body);if(pending.current?.path!==path||pending.current.body!==serialized)pending.current={path,body:serialized,key:crypto.randomUUID()};void sendPending();}
 function checkout(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);prepare('orders',{fulfillment:'PICKUP',locationId:f.get('location'),items:cart.map(l=>({productId:l.product.id,quantity:l.quantity}))});}
 function shipping(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);rememberAddress.current=Boolean(f.get('saveAddress'));prepare('orders',{fulfillment:'SHIP',shippingRateId:f.get('shippingRateId'),expectedTotalMinor:f.get('expectedTotalMinor'),items:cart.map(l=>({productId:l.product.id,quantity:l.quantity})),address:{recipient:f.get('recipient'),phone:f.get('phone'),line1:f.get('line1'),commune:f.get('commune'),region:f.get('region'),country:'CL'}});}

 async function open(kind:string,id:string){if(kind==='orders'){router.push(storeOrderPath(slug,id));return;}await run(async()=>{const value=await api(`${kind}/${id}`);setDetail({...value,kind});setModal('detail');});}
 async function pay(order:any,method:'CARD'|'TRANSFER'='TRANSFER',cardId?:string){await run(async()=>{const intent=await api('payments/intents',{method:'POST',headers:{'idempotency-key':`customer-pay-${order.id}`},body:JSON.stringify({orderId:order.id})});await api(`payments/intents/${intent.id}/simulate`,{method:'POST',body:JSON.stringify({method,...(method==='CARD'?{cardId}:{})})});const updated=await api(`orders/${order.id}`);setDetail({...updated,kind:'orders'});if(['PAID','FULFILLED'].includes(updated.status)){router.replace(storeOrderPath(slug,updated.id,true));return;}else{setNotice('El pago aún no se ha confirmado.');}await personal();await catalog();});}
 const locations=storeLocations.filter(location=>location.kind==='STORE');
 function addProduct(product:Product,source?:HTMLElement){if(busy||unknown||!cartHydrated)return false;if(cart.length>=50&&!cart.some(line=>line.product.id===product.id)){setNotice('Máximo 50 productos por carrito');return false;}if(cart.some(line=>line.product.id===product.id&&line.quantity>=1000000)){setNotice('Ya alcanzaste el límite de unidades.');return false;}setCart(rows=>rows.some(line=>line.product.id===product.id)?rows.map(line=>line.product.id===product.id?{...line,quantity:line.quantity+1}:line):[...rows,{product,quantity:1}]);animateProductToCart(source??null,product.image_url);setNotice(`${product.name} agregado al carrito.`);return true;}
 const profile=<StoreProfileMenu user={user} disabled={busy||unknown} onSettings={()=>router.push(storeAccountPath(slug))} onLogin={()=>navigateAccess('login')} onRegister={()=>navigateAccess('register')} onLogout={()=>void logout()} purchasesHref={customer?storePurchasesPath(slug):undefined}/>;
 function browse(categoryId:string,q=''){router.push(`/tienda?${new URLSearchParams({empresa:slug,...(categoryId?{categoria:categoryId}:{}),...(q?{q}: {})})}#catalogo`);}
 const accountPage=user&&profileData?<StoreAccount key={settingsSection} initialSection={settingsSection} returnOrder={returnOrder} profile={profileData} cards={cards} request={api} onUpdated={()=>personal()} onLogout={()=>void logout()} user={user} company={company?.name??'Tu tienda'} slug={slug} customer={customer} busy={busy||unknown} notice=""/>:<section id="mi-cuenta" className={styles.empty}><h1>Mi cuenta</h1><p role="status">{busy?'Cargando tu cuenta…':notice||'No pudimos cargar tu cuenta.'}</p>{!busy&&<button type="button" onClick={()=>location.reload()}>Volver a intentar</button>}</section>;
 return <main className={`${styles.page} shop`} style={storeTheme(slug,company?.primary_color)}>
 {company&&(children||settingsPage||checkoutPage||orderId||purchasesPage)?<><StoreHeader slug={slug} company={company} categories={categories} categoryId={settingsPage||purchasesPage?'__account':filters.categoryId} query={filters.q} disabled={busy||unknown} busy={busy} cartCount={cart.reduce((sum,line)=>sum+line.quantity,0)} account={profile} onCart={()=>{if(checkoutPage)document.getElementById('carrito')?.scrollIntoView({block:'start'});else setModal('cart');}} onQuery={q=>setFilters({...filters,q})} onSearch={()=>browse('',filters.q)} onCategory={id=>browse(id)} contentTarget={purchasesPage?'mis-compras':orderId?'pedido':checkoutPage?'carrito':settingsPage?'mi-cuenta':'producto'} accountPage={settingsPage}/>{notice&&!checkoutPage&&!orderId&&<p className={styles.notice} role="status">{notice}</p>}{checkoutPage||orderId||purchasesPage?null:settingsPage?accountPage:<fieldset disabled={busy||unknown}>{children}</fieldset>}</>:company?<StoreCatalog slug={slug} company={company} products={products} categories={categories} locations={storeLocations} busy={busy} locked={unknown} notice={notice} page={page} total={catalogTotal} filters={filters} cartCount={cart.reduce((sum,line)=>sum+line.quantity,0)} account={profile} onCart={()=>setModal('cart')} onFilter={values=>{if(!busy&&!unknown)void run(async()=>{await catalog(slug,0,values);});}} onPage={value=>{if(!busy&&!unknown)void run(async()=>{await catalog(slug,value);document.getElementById('catalogo')?.scrollIntoView({behavior:'smooth'});});}} onAdd={addProduct}/>:<div className={styles.empty}><h1>{busy?'Preparando tu tienda…':'No pudimos abrir la tienda'}</h1><p role="status">{notice}</p>{!busy&&<><button onClick={()=>location.reload()}>Volver a intentar</button><a href="/">Volver al inicio de Nexo</a></>}</div>}

 {company&&(checkoutPage||modal==='cart')&&<StoreCart fullPage={checkoutPage} profile={profileData} request={api} onRegister={()=>checkoutAccount('register')} onDeliveryChange={setCheckoutDelivery} initialDelivery={checkoutDelivery} slug={slug} lines={cart} locations={locations} customer={customer} busy={busy} unknown={unknown} notice={notice} onClose={()=>setModal(null)} onQuantity={(id,quantity)=>{if(!busy&&!unknown&&Number.isInteger(quantity)&&quantity>=1&&quantity<=1000000)setCart(rows=>rows.map(line=>line.product.id===id?{...line,quantity}:line));}} onRemove={id=>{if(!busy&&!unknown)setCart(rows=>rows.filter(line=>line.product.id!==id));}} onLogin={()=>checkoutAccount('login')} onPickup={checkout} onShipping={shipping} onRetry={()=>void sendPending()}/>}
 {purchasesPage&&customer&&<StorePurchases homeHref={storeHome(slug)} orders={orders} quotes={quotes} orderPage={orderPage} quotePage={quotePage} busy={busy||unknown} onRefresh={()=>void run(()=>personal())} onPage={(op,qp)=>void run(()=>personal(op,qp))} onOpen={(kind,id)=>void open(kind,id)}/>}
 {orderId&&!detail&&<section id="pedido" className={styles.empty}><h1>Tu pedido</h1><p role="status">{busy?'Cargando tu pedido…':notice||'Inicia sesión para consultar este pedido.'}</p>{!busy&&!customer&&slug&&<a href={storeAccessPath('login',slug,storeOrderPath(slug,orderId,confirmationPage))}>Iniciar sesión</a>}{!busy&&slug&&<a href={storePurchasesPath(slug)}>Volver a Mis compras</a>}</section>}
 {orderId&&detail&&confirmationPage&&['PAID','FULFILLED'].includes(detail.status)&&<StorePaymentConfirmation slug={slug} id={detail.id} total={detail.total_minor} fulfillment={detail.fulfillment}/>}
 {(modal==='detail'||(orderId&&!(confirmationPage&&['PAID','FULFILLED'].includes(detail?.status))))&&detail&&<StorePurchaseDetail page={!!orderId} key={detail.id} cards={cards} preference={profileData?.paymentPreference??null} onMethods={()=>router.push(storeAccountPath(slug,'payments',detail.id))} detail={detail} busy={busy} unknown={unknown} notice={notice} onClose={()=>setModal(null)} onPay={(method,cardId)=>void pay(detail,method,cardId)} onCancel={()=>void run(async()=>{await api(`orders/${detail.id}/cancel`,{method:'POST',body:JSON.stringify({reason:'Cancelación solicitada por el cliente'})});setDetail({...await api(`orders/${detail.id}`),kind:'orders'});await personal();await catalog();})} onCreate={()=>prepare('orders',{fulfillment:'SHIP',shippingQuoteId:detail.id,items:detail.items})} onRetry={()=>void sendPending()}/>}
 <footer className={styles.footer}><div className={styles.contact}>{company&&<strong>{company.name}</strong>}{company?.contact_email&&!company.contact_email.toLowerCase().endsWith('.example')&&<a href={`mailto:${company.contact_email}`}>{company.contact_email}</a>}{company?.contact_phone&&<span>{company.contact_phone}</span>}</div><TechnologySignature/></footer></main>;
}
