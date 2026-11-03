/** Branding only; these numbers are never validated or sent to a payment network. */
export function testCardBrand(prefix:string){
 if(/^4/.test(prefix))return 'Visa';
 const four=Number(prefix.slice(0,4));
 if(/^(5[1-5])/.test(prefix)||(four>=2221&&four<=2720))return 'Mastercard';
 if(/^(34|37)/.test(prefix))return 'American Express';
 return 'Tarjeta';
}
