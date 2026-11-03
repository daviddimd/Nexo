import {testCardBrand} from './test-card';
/** Format checks only: no Luhn check, bank lookup or payment authorization. */
export function cardExpiryValid(month:number,year:number,now=new Date()){
 return Number.isInteger(month)&&month>=1&&month<=12&&Number.isInteger(year)&&year<=2199&&
  (year>now.getFullYear()||(year===now.getFullYear()&&month>=now.getMonth()+1));
}
export function cardSecurityCodeValid(number:string,cvv:string){
 const brand=testCardBrand(number);
 return brand==='American Express'?/^\d{4}$/.test(cvv):brand==='Visa'||brand==='Mastercard'?/^\d{3}$/.test(cvv):/^\d{3,4}$/.test(cvv);
}
