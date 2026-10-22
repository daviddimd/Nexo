import type {CSSProperties} from 'react';

// A demo tenant identity; other companies keep the shared template and their settings.
export function storeLogo(slug:string,configured?:string|null){return configured||(slug==='prismabyte'?'/brands/prismabyte.svg':null);}
export function storeTheme(slug:string,configured?:string|null):CSSProperties{
 if(slug!=='prismabyte')return {'--nexo-primary':configured||'#155A83'} as CSSProperties;
 return {
  '--nexo-ink':'#241c32','--nexo-primary':configured&&configured.toLowerCase()!=='#155a83'?configured:'#6d28d9',
  '--nexo-accent':'#a63c65','--nexo-surface':'#faf8fc',
  '--store-line':'rgb(61 34 86 / .1)','--store-muted':'#71627d','--store-soft':'#f0eafa',
  '--store-chrome':'rgb(250 248 252 / .94)','--store-banner':'#eee7f8',
  '--store-banner-alt':'#f5e8ed','--store-banner-third':'#e9e3f4','--store-ink-hover':'#49325f',
  '--store-chip':'#eee3f6','--store-chip-ink':'#64348c'
 } as CSSProperties;
}
