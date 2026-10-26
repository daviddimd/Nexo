import type {Specifications} from './taxonomy';

// Keep the commercial name and variants; the model specification may be a part number.
export function productLabel(product:{name:string;specifications:Specifications}):{brand:string;title:string}{
 const brand=typeof product.specifications.brand==='string'?product.specifications.brand.trim():'';
 const name=product.name.trim();
 if(!brand||!name.toLocaleLowerCase('es').startsWith(brand.toLocaleLowerCase('es')))return {brand,title:name};
 const suffix=name.slice(brand.length);
 // Only remove a standalone leading brand, never a matching fragment inside a model.
 if(!/^[\s·:–—-]/u.test(suffix))return {brand,title:name};
 const title=suffix.replace(/^[\s·:–—-]+/u,'').trim();
 return {brand,title:title||name};
}
