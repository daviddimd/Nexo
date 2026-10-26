import Link from 'next/link';
import {notFound} from 'next/navigation';
import TechnologySignature from '../../technology-signature';
import styles from '../legal.module.css';

const documents={
 privacidad:{title:'Privacidad',intro:'Qué información utiliza el prototipo de Nexo y para qué.',sections:[
  ['Información del sistema','Nexo utiliza los datos necesarios para operar las cuentas de una empresa, su catálogo, ubicaciones, inventario y pedidos. Según la función utilizada, esto puede incluir nombre, correo, datos de entrega e historial de operaciones.'],
  ['Finalidad y acceso','Estos datos permiten iniciar sesión, administrar el negocio y dar seguimiento a compras y movimientos. El acceso al panel depende del rol y de las ubicaciones autorizadas de cada cuenta.'],
  ['Datos de demostración','La beta incluye una empresa y un catálogo de ejemplo. Utiliza información ficticia para explorar el prototipo y evita introducir datos personales de terceros durante las pruebas.'],
  ['Antes de un servicio comercial','La identidad y los canales de contacto del responsable, los proveedores, los plazos de conservación y el procedimiento para solicitar acceso, corrección o eliminación de datos deben quedar definidos para cada despliegue antes de ofrecerlo comercialmente. Esta página todavía no establece una política comercial definitiva.'],
 ]},
 terminos:{title:'Términos y condiciones de la beta',intro:'Alcance de la versión de prueba y de las modalidades que estamos preparando.',sections:[
  ['Estado del producto','Nexo es un prototipo en beta para explorar la gestión de productos, stock, ventas y una tienda online. Sus funciones y diseño pueden cambiar durante el desarrollo. Los datos de ejemplo, precios y existencias no constituyen una oferta comercial.'],
  ['Uso de la demostración','Utiliza únicamente las cuentas y empresas a las que tienes acceso autorizado. Las operaciones realizadas en el prototipo pueden modificar sus datos de prueba. No uses esta demostración para procesar ventas reales de un negocio.'],
  ['Pagos y contratación','La suscripción y la instalación permanente se presentan como modalidades previstas. Esta web no activa contratos ni cobra suscripciones. Los pagos de la tienda se prueban con un simulador y no deben interpretarse como cobros reales.'],
  ['Condiciones por definir','El precio, alojamiento, licencia, límites de uso, actualizaciones, soporte, garantías y condiciones de término del servicio se acordarán y publicarán antes de contratar. Esta beta no promete plazos de servicio ni garantías permanentes.'],
  ['Documento provisional','Este texto explica el alcance del prototipo. Los términos del servicio comercial deberán identificar al proveedor, sus datos de contacto y las condiciones efectivamente ofrecidas antes del lanzamiento.'],
 ]},
 cookies:{title:'Cookies y almacenamiento',intro:'Información sobre la sesión y el estado de navegación de la beta.',sections:[
  ['Inicio de sesión','Nexo utiliza una cookie de sesión denominada nexo_session para reconocer una sesión autenticada. Las funciones de la cuenta dependen de esta sesión. Cerrar sesión permite finalizar el acceso desde el navegador.'],
  ['Estado de la interfaz','Durante la navegación, la aplicación conserva el estado necesario para sus formularios, filtros y carrito. Algunos filtros también aparecen en la dirección de la página para permitir compartir o volver a esa búsqueda.'],
  ['Esta página de presentación','La presentación no añade herramientas de analítica, píxeles publicitarios ni reproductores de vídeo externos. Sus demostraciones se ejecutan dentro de la propia página.'],
  ['Configuración del navegador','Puedes gestionar y eliminar cookies desde tu navegador. Bloquear la sesión puede impedir iniciar sesión o utilizar las funciones de cuenta. La información sobre tecnologías adicionales deberá actualizarse si se incorporan a una versión posterior.'],
 ]},
} as const;
type DocumentKey=keyof typeof documents;
export async function generateMetadata({params}:{params:Promise<{documento:string}>}){const {documento}=await params;return {title:documento in documents?`${documents[documento as DocumentKey].title} · Nexo`:'Documento no encontrado · Nexo'};}
export default async function LegalPage({params}:{params:Promise<{documento:string}>}){
 const {documento}=await params;if(!Object.hasOwn(documents,documento))notFound();
 const content=documents[documento as DocumentKey];
 return <main className={styles.page}><header className={styles.header}><Link className={styles.logo} href="/">nexo<span>.</span></Link><Link href="/">Volver a Nexo</Link></header><span className={styles.label}>INFORMACIÓN DE LA BETA · 24 OCTUBRE 2026</span><h1>{content.title}</h1><p className={styles.intro}>{content.intro}</p><p className={styles.notice}>Documento provisional de la versión de prueba. La contratación comercial aún no está habilitada.</p>{content.sections.map(([title,text])=><article key={title}><h2>{title}</h2><p>{text}</p></article>)}<nav className={styles.nav} aria-label="Documentos de la beta">{Object.entries(documents).map(([key,item])=><Link key={key} href={`/legal/${key}`} aria-current={key===documento?'page':undefined}>{item.title}</Link>)}</nav><footer><TechnologySignature/></footer></main>;
}
