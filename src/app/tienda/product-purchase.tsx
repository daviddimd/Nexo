'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useStoreCart,type StoreProduct} from './cart-context';
import styles from '../product-detail.module.css';
export default function ProductPurchase({slug,product}:{slug:string;product:StoreProduct}){
 const {cart,setCart}=useStoreCart(slug),[notice,setNotice]=useState('');
 const available=product.availability.some(l=>l.available>0);
 return <div className={styles.purchase}><button className={styles.buy} disabled={!available} onClick={()=>{
  if(cart.length>=50&&!cart.some(line=>line.product.id===product.id)){setNotice('El carrito admite hasta 50 productos distintos.');return;}
  if(cart.some(line=>line.product.id===product.id&&line.quantity>=1000000)){setNotice('Ya alcanzaste el límite de unidades.');return;}
  setCart(lines=>lines.some(line=>line.product.id===product.id)?lines.map(line=>line.product.id===product.id?{...line,quantity:line.quantity+1}:line):[...lines,{product,quantity:1}]);setNotice('Producto agregado al carrito.');
 }}>{available?'Agregar al carrito':'Sin stock disponible'}</button><Link href={`/tienda?empresa=${encodeURIComponent(slug)}&carrito=1`} prefetch={false}>Ver carrito ({cart.reduce((count,line)=>count+line.quantity,0)}) →</Link><p role="status" aria-live="polite">{notice}</p></div>;
}
