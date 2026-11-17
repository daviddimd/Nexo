import Link from 'next/link';
import QuestionsDemo from './questions-demo';

import OpenLinkedQuestion from './open-linked-question';

import styles from '../landing-story.module.css';
import layout from './questions.module.css';

export const metadata = {
 title: 'Preguntas frecuentes · Nexo',
 description: 'Resuelve tus dudas sobre inventario, ventas, tienda online y planes de Nexo.',
};


const faqs = [
 {id:'contratar', question:'¿Puedo contratar Nexo hoy?', answer:'La contratación aún no está habilitada. Puedes comparar los planes y pedir una demo.', link:['/planes','Ver planes y precios']},
 {id:'sucursales', question:'¿Nexo sirve si tengo más de una sucursal?', answer:'Sí. Cada ubicación tiene su propio inventario. Puedes separar la bodega web de las sucursales, consultar existencias y registrar transferencias.'},
 {id:'ventas', question:'¿Puedo vender en mi local y en mi tienda online?', answer:'Sí. Las ventas del local y los pedidos de la tienda online usan el inventario de las ubicaciones correspondientes. Los pedidos pueden reservar unidades mientras se completa la compra.'},
 {id:'stock-en-sucursal', question:'¿Qué pasa si el producto solo tiene stock en una sucursal?', answer:'Puedes ofrecer retiro en esa sucursal o permitir envíos desde ella. El costo de envío se calcula según las tarifas configuradas para el destino.'},
 {id:'personalizacion', question:'¿Puedo personalizar mi tienda online con mi logo y colores?', answer:'Sí. Puedes configurar el logo, el color principal y los datos de contacto de tu empresa.'},
 {id:'cobros', question:'¿Cómo cobro los pedidos de mi tienda online?', answer:'Nexo registra y simula el flujo de pago. La tienda online todavía no procesa cobros con una pasarela de pago.'},
 {id:'permisos', question:'¿Mi equipo puede ver y modificar todo?', answer:'El propietario administra la empresa. Los agentes trabajan con los permisos y ubicaciones asignados. Tus clientes acceden a la tienda online.'},
 {id:'facturacion-sii', question:'¿Nexo se integra con la facturación electrónica del SII?', answer:'Nexo aún no emite documentos tributarios electrónicos del SII.'},
 {id:'respaldos', question:'¿Dónde se guardan mis datos y hay respaldos?', answer:'Los datos se guardan en PostgreSQL, en la infraestructura de la instalación. Nexo ofrece herramientas de respaldo y restauración para el operador. La frecuencia depende de cómo se configure ese entorno.'},
 {id:'soporte', question:'¿Cómo funciona el soporte?', answer:'El alcance y los canales de soporte se definen en las condiciones comerciales. Si estás evaluando Nexo, puedes consultar tus necesidades al pedir una demo.'},
];

export default function QuestionsPage() {
 const structuredData = {
  '@context':'https://schema.org',
  '@type':'FAQPage',
  mainEntity:faqs.map(({question,answer})=>({
   '@type':'Question',
   name:question,
   acceptedAnswer:{'@type':'Answer',text:answer},
  })),
 };
 return <QuestionsDemo>
   <OpenLinkedQuestion/>
   <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replace(/</g,'\\u003c')}}/>
   <section className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-heading">
    <div>
     <h1 id="faq-heading">Preguntas frecuentes</h1>
     <p className={styles.faqIntro}>Lo esencial sobre Nexo, en pocas palabras.</p>
    </div>
    <div className={styles.faq}>
     {faqs.map(({id,question,answer,link})=><details key={id} id={id} name="nexo-faq" open={id==='contratar'}>
      <summary>{question}<span aria-hidden="true" className={layout.mark}/></summary>
      <p>{answer}{link && <> <Link href={link[0]}>{link[1]}</Link></>}</p>
     </details>)}
    </div>
   </section>
 </QuestionsDemo>;
}
