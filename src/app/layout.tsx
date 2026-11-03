import type {ReactNode} from 'react';
import localFont from 'next/font/local';
import './styles.css';
const display=localFont({src:'../../public/fonts/SpaceGroteskVariable.ttf',weight:'300 700',style:'normal',display:'swap',variable:'--nexo-display'});
const inter=localFont({src:'../../public/fonts/InterVariable.woff2',weight:'100 900',style:'normal',display:'swap',variable:'--nexo-font'});
export const metadata={title:'Nexo · Tecnología que conecta',description:'Productos, sucursales y stock conectados con tecnología Nexo'};
export default function Layout({children}:{children:ReactNode}) {return <html lang="es" className={`${inter.variable} ${display.variable}`}><body>{children}</body></html>;}

