import {simulateCheckout} from '../../../server/demo-checkout';
import {uploadProductImage,publicProductImage} from '../../../server/product-images';
import {businessReport} from '../../../server/reports';
import {dashboardSummary} from '../../../server/dashboard';
import {database} from '../../../server/db';
import {authenticate,login,digest,staff,owner} from '../../../server/auth';
import {applyOperation} from '../../../server/inventory';
import {publicCatalog,inventory,inventoryMatrix,managedProducts,history} from '../../../server/catalog';
import {createProduct,patchProduct,createLocation,patchLocation,createUser} from '../../../server/manage';
import {body,rawJsonBody,sameOrigin,json,failure,pagination} from '../../../server/http';
import {loginSchema,operationSchema,uuid} from '../../../server/schemas';
import {AppError} from '../../../server/errors';
import {createOnlineOrder,createLocalSale,getOrder,listOrders,cancelOrder,confirmManualPayment,fulfillOrder,updateOrderSettings} from '../../../server/orders';
import {requestShippingQuote,approveShippingQuote,rejectShippingQuote,getShippingQuote,listShippingQuotes} from '../../../server/shipping';
import {createPaymentIntent,getPaymentIntent,listPaymentCaptures,processSimulatorWebhook} from '../../../server/payments';
import {refundPayment,resolveZeroCapture,receiveReturn,aftersalesSummary} from '../../../server/aftersales';
import {listUsers,patchUser,resetUserPassword,changePassword,companySettings,publicSettings,patchCompanySettings,listAdministrativeEvents} from '../../../server/accounts';
import {registerCustomer,requestAccountMail,consumeAccountToken} from '../../../server/recovery';
import {createInvitation,listInvitations,revokeInvitation,acceptInvitation} from '../../../server/invitations';
import {commercialSummary,commercialHistory} from '../../../server/commercial';
import {initialSetup,initialSetupStatus} from '../../../server/initial-setup';
import {licenseSummary,licenseHistory,runtimeLicenseContext} from '../../../server/license-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
const cookieName='nexo_session';
function sessionToken(request:Request) {
  return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
}
function cookie(value:string,maxAge:number) {
  return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
async function handle(request:Request,context:Context) {
  try {
    const {path}=await context.params;const route=path.join('/'),method=request.method;
    if(route==='health'&&method==='GET')return json({service:'nexo',stage:'license-imports',status:'ok'});
    if(path.length===4&&path[0]==='payments'&&path[1]==='simulator'&&path[3]==='webhook'&&method==='POST') {
      return json(await processSimulatorWebhook(database(),uuid.parse(path[2]),await rawJsonBody(request),
        request.headers.get('x-nexo-timestamp'),request.headers.get('x-nexo-signature')));
    }
    sameOrigin(request);
    const pool=database();
    if(route==='setup'&&method==='GET')return json(await initialSetupStatus(pool));
    if(route==='setup'&&method==='POST')return json(await initialSetup(pool,await body(request)),201);
    if(route==='public/start'&&method==='GET'){
      const {rows}=await pool.query('SELECT name,slug FROM companies ORDER BY slug LIMIT 2');return json({store:rows.length===1?rows[0]:null});
    }
    if(route==='ready'&&method==='GET'){await pool.query('SELECT 1 FROM license_imports LIMIT 1');return json({status:'ready'});}
    if(path.length===3&&path[0]==='public'&&path[2]==='settings'&&method==='GET')return json(await publicSettings(pool,path[1]));
    if(path.length===3&&path[0]==='public'&&path[2]==='catalog'&&method==='GET') {
      const {limit,offset}=pagination(new URL(request.url));return json(await publicCatalog(pool,path[1],limit,offset));
    }
    if(path.length===5&&path[0]==='public'&&path[2]==='products'&&path[4]==='image'&&method==='GET')return publicProductImage(pool,path[1],uuid.parse(path[3]));
    if(route==='auth/login'&&method==='POST') {
      const result=await login(pool,loginSchema.parse(await body(request)));
      return json({user:result.user},200,{'Set-Cookie':cookie(result.token,28800)});
    }
    if(route==='auth/register'&&method==='POST')return json(await registerCustomer(pool,await body(request)),202);
    if(route==='auth/accept-invitation'&&method==='POST')return json(await acceptInvitation(pool,await body(request)));
    if(route==='auth/resend-verification'&&method==='POST')return json(await requestAccountMail(pool,'VERIFY_EMAIL',await body(request)),202);
    if(route==='auth/forgot-password'&&method==='POST')return json(await requestAccountMail(pool,'RESET_PASSWORD',await body(request)),202);
    if(route==='auth/verify-email'&&method==='POST')return json(await consumeAccountToken(pool,'VERIFY_EMAIL',await body(request)));
    if(route==='auth/reset-password'&&method==='POST')return json(await consumeAccountToken(pool,'RESET_PASSWORD',await body(request)),200,{'Set-Cookie':cookie('',0)});
    const actor=await authenticate(pool,sessionToken(request));
    if(route==='auth/logout'&&method==='POST'){
      await pool.query('DELETE FROM sessions WHERE token_hash=$1 AND user_id=$2',[digest(sessionToken(request)!),actor.id]);
      return json({loggedOut:true},200,{'Set-Cookie':cookie('',0)});
    }
    if(route==='dashboard'&&method==='GET')return json(await dashboardSummary(pool,actor));
    if(route==='reports'&&method==='GET')return json(await businessReport(pool,actor,Object.fromEntries(new URL(request.url).searchParams)));
    if(route==='auth/me'&&method==='GET')return json({user:actor});
    if(route==='licenses'&&method==='GET'){
      owner(actor);return json(await licenseSummary(pool,actor,await runtimeLicenseContext()));
    }
    if(route==='licenses/history'&&method==='GET'){
      const p=pagination(new URL(request.url));return json(await licenseHistory(pool,actor,p.limit,p.offset));
    }
    if(route==='commercial'&&method==='GET')return json(await commercialSummary(pool,actor));
    if(route==='commercial/history'&&method==='GET'){
      const p=pagination(new URL(request.url));return json(await commercialHistory(pool,actor,p.limit,p.offset));
    }
    if(route==='invitations'&&method==='POST'){
      const result=await createInvitation(pool,actor,request.headers.get('idempotency-key')??'',await body(request));return json(result,result.replayed?200:201);
    }
    if(route==='invitations'&&method==='GET'){
      const p=pagination(new URL(request.url));return json(await listInvitations(pool,actor,p.limit,p.offset));
    }
    if(path[0]==='invitations'&&path.length===3&&path[2]==='revoke'&&method==='POST')return json(await revokeInvitation(pool,actor,uuid.parse(path[1]),await body(request)));
    if(route==='auth/password'&&method==='POST')return json(await changePassword(pool,actor,await body(request)),200,{'Set-Cookie':cookie('',0)});
    if(route==='settings/company'&&method==='GET')return json(await companySettings(pool,actor));
    if(route==='settings/company'&&method==='PATCH')return json(await patchCompanySettings(pool,actor,await body(request)));
    if(route==='administration/events'&&method==='GET'){
      const p=pagination(new URL(request.url));return json(await listAdministrativeEvents(pool,actor,p.limit,p.offset));
    }
    if(route==='auth/logout'&&method==='POST') {
      await pool.query('DELETE FROM sessions WHERE token_hash=$1',[digest(sessionToken(request)!)]);
      return json({ok:true},200,{'Set-Cookie':cookie('',0)});
    }
    if(route==='shipping/quotes'&&method==='POST') {
      const quote=await requestShippingQuote(pool,actor,request.headers.get('idempotency-key')??'',await body(request));return json(quote,quote.replayed?200:201);
    }
    if(route==='shipping/quotes'&&method==='GET') {
      const p=pagination(new URL(request.url));return json(await listShippingQuotes(pool,actor,p.limit,p.offset));
    }
    if(path[0]==='shipping'&&path[1]==='quotes'&&path.length===3&&method==='GET')return json(await getShippingQuote(pool,actor,uuid.parse(path[2])));
    if(path[0]==='shipping'&&path[1]==='quotes'&&path.length===4&&method==='POST') {
      const id=uuid.parse(path[2]);
      if(path[3]==='approve')return json(await approveShippingQuote(pool,actor,id,await body(request)));
      if(path[3]==='reject')return json(await rejectShippingQuote(pool,actor,id,await body(request)));
    }
    if(path.length===4&&path[0]==='payments'&&path[1]==='intents'&&path[3]==='simulate'&&method==='POST')return json(await simulateCheckout(pool,actor,uuid.parse(path[2])));
    if(route==='payments/intents'&&method==='POST') {
      const intent=await createPaymentIntent(pool,actor,request.headers.get('idempotency-key')??'',await body(request));return json(intent,intent.replayed?200:201);
    }
    if(path[0]==='payments'&&path[1]==='intents'&&path.length===3&&method==='GET')return json(await getPaymentIntent(pool,actor,uuid.parse(path[2])));
    if(route==='payments/captures'&&method==='GET') {
      const p=pagination(new URL(request.url));return json(await listPaymentCaptures(pool,actor,p.limit,p.offset));
    }
    if(path[0]==='payments'&&path[1]==='captures'&&path.length===4&&method==='POST'){
      const id=uuid.parse(path[2]);
      if(path[3]==='refunds')return json(await refundPayment(pool,actor,request.headers.get('idempotency-key')??'',{captureId:id},await body(request)));
      if(path[3]==='resolve')return json(await resolveZeroCapture(pool,actor,id,await body(request)));
    }
    if(route==='orders'&&method==='POST') {
      const order=await createOnlineOrder(pool,actor,request.headers.get('idempotency-key')??'',await body(request));
      return json(order,order.replayed?200:201);
    }
    if(route==='orders'&&method==='GET') {
      const p=pagination(new URL(request.url));return json(await listOrders(pool,actor,p.limit,p.offset));
    }
    if(path[0]==='orders'&&path.length===2&&method==='GET')return json(await getOrder(pool,actor,uuid.parse(path[1])));
    if(path[0]==='orders'&&path.length===3&&path[2]==='aftersales'&&method==='GET')return json(await aftersalesSummary(pool,actor,uuid.parse(path[1])));
    if(path[0]==='orders'&&path.length===3&&method==='POST') {
      const id=uuid.parse(path[1]);
      if(path[2]==='refunds')return json(await refundPayment(pool,actor,request.headers.get('idempotency-key')??'',{orderId:id},await body(request)));
      if(path[2]==='returns')return json(await receiveReturn(pool,actor,id,request.headers.get('idempotency-key')??'',await body(request)));
      if(path[2]==='withdrawal')return json(await receiveReturn(pool,actor,id,request.headers.get('idempotency-key')??'',await body(request),'WITHDRAWAL'));
      if(path[2]==='cancel')return json(await cancelOrder(pool,actor,id,await body(request)));
      if(path[2]==='manual-payment')return json(await confirmManualPayment(pool,actor,id,await body(request)));
      if(path[2]==='fulfill')return json(await fulfillOrder(pool,actor,id));
    }
    if(route==='sales'&&method==='POST') {
      const sale=await createLocalSale(pool,actor,request.headers.get('idempotency-key')??'',await body(request));
      return json(sale,sale.replayed?200:201);
    }
    if(route==='settings/orders'&&method==='PATCH')return json(await updateOrderSettings(pool,actor,await body(request)));
    if(route==='inventory'&&method==='GET'){const p=pagination(new URL(request.url));return json(await inventory(pool,actor,p.limit,p.offset));}
    if(route==='inventory/matrix'&&method==='GET'){const url=new URL(request.url),p=pagination(url);return json(await inventoryMatrix(pool,actor,p.limit,p.offset,{q:url.searchParams.get('q')??'',locationId:url.searchParams.get('locationId')??'',availability:url.searchParams.get('availability')??'all',sort:url.searchParams.get('sort')??'name_asc'}));}
    if(route==='inventory/movements'&&method==='GET'){const p=pagination(new URL(request.url));return json(await history(pool,actor,p.limit,p.offset));}
    if(route==='inventory/operations'&&method==='POST')return json(await applyOperation(pool,actor,request.headers.get('idempotency-key')??'',operationSchema.parse(await body(request))));
    if(path.length===3&&path[0]==='products'&&path[2]==='image'&&method==='POST')return json(await uploadProductImage(pool,actor,uuid.parse(path[1]),request));
    if(route==='products'&&method==='POST')return json(await createProduct(pool,actor,await body(request)),201);
    if(path[0]==='products'&&path.length===2&&method==='PATCH')return json(await patchProduct(pool,actor,uuid.parse(path[1]),await body(request)));
    if(route==='products'&&method==='GET'){const url=new URL(request.url),p=pagination(url);return json(await managedProducts(pool,actor,p.limit,p.offset,{q:url.searchParams.get('q')??'',status:url.searchParams.get('status')??'all'}));}
    if(route==='locations'&&method==='POST')return json(await createLocation(pool,actor,await body(request)),201);
    if(path[0]==='locations'&&path.length===2&&method==='PATCH')return json(await patchLocation(pool,actor,uuid.parse(path[1]),await body(request)));
    if(route==='locations'&&method==='GET') {
      staff(actor);const {rows}=await pool.query(`SELECT id,name,kind,shipping_enabled,active FROM locations l WHERE company_id=$1
        AND ($2='OWNER' OR EXISTS(SELECT 1 FROM agent_locations a WHERE a.company_id=l.company_id AND a.location_id=l.id AND a.user_id=$3)) ORDER BY name`,[actor.company_id,actor.role,actor.id]);return json({items:rows});
    }
    if(route==='users'&&method==='POST')return json(await createUser(pool,actor,await body(request)),201);
    if(path[0]==='users'&&path.length===2&&method==='PATCH')return json(await patchUser(pool,actor,uuid.parse(path[1]),await body(request)));
    if(path[0]==='users'&&path.length===3&&path[2]==='password'&&method==='POST')return json(await resetUserPassword(pool,actor,uuid.parse(path[1]),await body(request)));
    if(route==='users'&&method==='GET') {
      const {limit,offset}=pagination(new URL(request.url));return json(await listUsers(pool,actor,limit,offset));
    }
    throw new AppError(404,'NOT_FOUND','Ruta inexistente');
  }catch(error){return failure(error);}
}
export {handle as GET,handle as POST,handle as PATCH};
