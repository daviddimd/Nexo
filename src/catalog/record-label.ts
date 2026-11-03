/** Human-readable legacy system labels; stored audit records remain intact. */
export function recordLabel(value:string){
 return value.replace(/^DEMO:\s*/i,'')
  .replace(/^Pago simulado de pedido /,'Registro de pago de pedido ')
  .replace('Pago del simulador firmado; no se movió dinero real','Registro de pago; sin transferencia de dinero');
}
