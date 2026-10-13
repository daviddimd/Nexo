import {ZodError} from 'zod';
import {AppError,ensure} from './errors';

export async function rawJsonBody(request:Request):Promise<string> {
  ensure(request.headers.get('content-type')?.split(';')[0].trim()==='application/json',415,'JSON_REQUIRED','Usa application/json');
  const reader=request.body?.getReader();ensure(reader,400,'EMPTY_BODY','Se requiere contenido JSON');
  const decoder=new TextDecoder();let size=0,text='';
  try { while(true) { const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>65536){await reader.cancel();throw new AppError(413,'BODY_TOO_LARGE','Máximo 64 KB');} text+=decoder.decode(value,{stream:true}); }
    text+=decoder.decode();
  } finally {reader.releaseLock();}
  return text;
}
export async function body(request:Request):Promise<unknown> {
  const text=await rawJsonBody(request);
  try{return JSON.parse(text);}catch{throw new AppError(400,'INVALID_JSON','JSON inválido');}
}
export function sameOrigin(request:Request) {
  if(['GET','HEAD','OPTIONS'].includes(request.method))return;
  // Cookies are same-origin only; command line clients without Origin are supported.
  ensure(request.headers.get('sec-fetch-site')!=='cross-site',403,'ORIGIN_FORBIDDEN','Origen no permitido');
  const origin=request.headers.get('origin');
  if(origin) {
    const expected=process.env.APP_ORIGIN;
    ensure(expected,503,'ORIGIN_UNCONFIGURED','Configura APP_ORIGIN');
    let localAlias=false;
    if(process.env.NODE_ENV!=='production'){
      try{
        const source=new URL(origin),configured=new URL(expected),target=new URL(request.url);
        const loopback=(url:URL)=>['localhost','127.0.0.1'].includes(url.hostname);
        localAlias=origin===source.origin&&expected===configured.origin&&loopback(source)&&loopback(configured)&&loopback(target)
          &&source.protocol===configured.protocol&&target.protocol===configured.protocol
          &&source.port===configured.port&&target.port===configured.port;
      }catch{/* A malformed origin is rejected below. */}
    }
    ensure(origin===expected||localAlias,403,'ORIGIN_FORBIDDEN','La dirección de esta página no coincide con la configurada. Abre Nexo desde su dirección de inicio.');
  }
}
export function json(data:unknown,status=200,headers:Record<string,string>={}) {
  return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}
export function failure(error:unknown) {
  if(error instanceof ZodError)return json({error:{code:'VALIDATION_ERROR',message:'Datos inválidos',details:error.issues.map(v=>({path:v.path,message:v.message}))}},400);
  if(error instanceof AppError)return json({error:{code:error.code,message:error.message}},error.status);
  const code=(error as {code?:string})?.code;
  if(code==='23505')return json({error:{code:'DUPLICATE',message:'El registro ya existe'}},409);
  if(code==='23503'||code==='23514')return json({error:{code:'CONSTRAINT_VIOLATION',message:'La operación viola una regla de integridad'}},409);
  // Do not log request bodies, connection strings or database error details.
  console.error('Nexo request failed',{type:error instanceof Error?error.name:'Unknown',code});
  return json({error:{code:'INTERNAL_ERROR',message:'No se pudo completar la solicitud'}},500);
}
export function pagination(url:URL) {
  const limit=Number(url.searchParams.get('limit')??50),offset=Number(url.searchParams.get('offset')??0);
  ensure(Number.isInteger(limit)&&limit>=1&&limit<=100&&Number.isInteger(offset)&&offset>=0&&offset<=1000000,400,'INVALID_PAGINATION','Paginación inválida');
  return {limit,offset};
}
