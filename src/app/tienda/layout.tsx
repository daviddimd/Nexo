import type {ReactNode} from 'react';
import StoreCartProvider from './cart-context';
export default function StoreLayout({children}:{children:ReactNode}){return <StoreCartProvider>{children}</StoreCartProvider>;}
