'use client';
import {createContext,useContext,useState,type Dispatch,type SetStateAction,type ReactNode} from 'react';
import type {Specifications} from '../../catalog/taxonomy';
export type StoreProduct={id:string;sku:string;name:string;description:string;image_url:string|null;price_minor:string;category_id:string|null;category_name:string|null;specifications:Specifications;availability:{locationId:string;name:string;kind:string;available:number;shippingEnabled:boolean}[]};
type Line={product:StoreProduct;quantity:number};
type State={slug:string;cart:Line[]};
const CartContext=createContext<{state:State;setState:Dispatch<SetStateAction<State>>}|null>(null);
export default function StoreCartProvider({children}:{children:ReactNode}){
 const [state,setState]=useState<State>({slug:'',cart:[]});
 return <CartContext.Provider value={{state,setState}}>{children}</CartContext.Provider>;
}
export function useStoreCart(slug:string){
 const context=useContext(CartContext);if(!context)throw new Error('Store cart provider missing');
 const cart=context.state.slug===slug?context.state.cart:[];
 const setCart:Dispatch<SetStateAction<Line[]>>=action=>context.setState(previous=>({slug,cart:typeof action==='function'?action(previous.slug===slug?previous.cart:[]):action}));
 return {cart,setCart};
}
