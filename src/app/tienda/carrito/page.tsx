import type {Metadata} from 'next';
import Storefront from '../storefront';

export const metadata:Metadata={title:'Tu carrito',robots:{index:false,follow:false}};

export default function CartPage(){
 return <Storefront checkoutPage/>;
}
