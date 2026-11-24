// Contenido de los documentos legales de Nexo.
// Describe lo que el sistema hace hoy; si cambia el comportamiento (analítica, correo real,
// pagos reales, retención automática), este archivo debe actualizarse en el mismo cambio.

export type Block = string | {list: string[]} | {table: {head: string[]; rows: string[][]}};
export type Section = {id: string; title: string; blocks: Block[]};
export type LegalDocument = {title: string; intro: string; summary: string[]; sections: Section[]};
export type Operator = {name: string; taxId: string; address: string; email: string; complete: boolean};

export const UPDATED_AT = '23 de noviembre de 2026';

// La identidad del proveedor no se inventa: se configura por despliegue y solo se muestra lo configurado.
export function legalOperator(env: NodeJS.ProcessEnv = process.env): Operator {
 const name = env.NEXO_LEGAL_NAME?.trim() ?? '';
 const taxId = env.NEXO_LEGAL_TAX_ID?.trim() ?? '';
 const address = env.NEXO_LEGAL_ADDRESS?.trim() ?? '';
 const email = env.NEXO_LEGAL_EMAIL?.trim() ?? '';
 return {name, taxId, address, email, complete: Boolean(name && taxId && address && email)};
}

export function legalDocuments(operator: Operator): Record<'privacidad' | 'terminos' | 'cookies', LegalDocument> {
 const contact = operator.email || 'el formulario de contacto de la página principal de Nexo';
 const writeTo = operator.email ? `escribe a ${operator.email}` : `usa ${contact}`;
 const identityRows = [['Razón social', operator.name], ['RUT', operator.taxId], ['Domicilio', operator.address], ['Correo de contacto', operator.email]].filter(row => row[1]);
 const identity: Section = {
  id: 'proveedor', title: 'Quién es el proveedor', blocks: [
   'Nexo es un software para que pequeñas y medianas empresas controlen su inventario, vendan en sucursal y publiquen una tienda online.',
   ...(identityRows.length
    ? ['Nexo es provisto por:', {table: {head: ['Dato', 'Valor'], rows: identityRows}}]
    : [`Puedes comunicarte con el proveedor mediante ${contact}.`]),
  ],
 };
 return {
  privacidad: {
   title: 'Política de privacidad',
   intro: 'Qué datos personales trata Nexo, para qué los usa, quién es responsable de cada uno y cómo puedes ejercer tus derechos.',
   summary: [
    'Solo guardamos los datos que el sistema necesita para funcionar: cuentas, catálogo, inventario, pedidos y solicitudes de contacto.',
    'No usamos analítica, publicidad ni rastreadores de terceros, y no vendemos datos personales.',
    'Cada empresa decide qué hace con los datos de sus clientes; Nexo los procesa solo para prestarle el servicio.',
    'Puedes pedir acceso, corrección, eliminación u oposición escribiendo al correo de contacto.',
   ],
   sections: [
    identity,
    {id: 'roles', title: 'Quién es responsable de qué', blocks: [
     'En Nexo conviven dos situaciones distintas, y la responsabilidad cambia en cada una:',
     {list: [
      'Solicitudes de contacto y cotización de planes: el responsable es el proveedor de Nexo, que decide para qué se usan esos datos.',
      'Datos de una empresa que usa Nexo (su personal, sus clientes, sus pedidos y su inventario): el responsable es esa empresa. Nexo actúa por cuenta de ella, como encargado, y solo trata los datos para prestarle el servicio.',
     ]},
     'Si compras en la tienda de una empresa, esa empresa es quien te vende y quien decide sobre tus datos de compra. Debes dirigirte a ella para ejercer tus derechos; el proveedor de Nexo le facilita las herramientas para atenderte.',
    ]},
    {id: 'datos', title: 'Qué datos tratamos', blocks: [
     {table: {head: ['Quién', 'Datos', 'Para qué'], rows: [
      ['Quien solicita contacto o una cotización', 'Nombre o empresa, correo, plan de interés y fecha del consentimiento.', 'Responder la solicitud.'],
      ['Personal de una empresa', 'Nombre, correo, rol, ubicaciones asignadas, contraseña (guardada cifrada, nunca en texto legible) y registro de acciones administrativas.', 'Iniciar sesión, limitar el acceso según el rol y dejar trazabilidad.'],
      ['Clientes de la tienda', 'Nombre, correo, teléfono, direcciones de entrega, tarjetas guardadas (solo marca, primeros seis y últimos cuatro dígitos, titular y vencimiento), pedidos, pagos, envíos y devoluciones.', 'Completar compras, entregas y posventa.'],
      ['Operación de la empresa', 'Productos, stock, movimientos de inventario y ventas, vinculados a quien los registró mediante un identificador interno.', 'Controlar el inventario y auditar cambios.'],
      ['Seguridad del servicio', 'Intentos de acceso fallidos y contadores de límite de uso, almacenados como valores resumidos (hash), sin guardar tu dirección IP.', 'Evitar abusos y accesos no autorizados.'],
     ]}},
     'Nexo nunca almacena el número completo de una tarjeta ni su código de seguridad.',
    ]},
    {id: 'bases', title: 'Por qué podemos tratar tus datos', blocks: [
     {list: [
      'Tu consentimiento, cuando envías una solicitud de contacto. Puedes retirarlo en cualquier momento.',
      'La ejecución de un contrato o de tu solicitud, cuando creas una cuenta, compras o administras un negocio.',
      'El interés legítimo en mantener la seguridad del servicio y evitar fraudes o abusos.',
      'El cumplimiento de obligaciones legales aplicables a la empresa vendedora.',
     ]},
    ]},
    {id: 'comparticion', title: 'Con quién los compartimos', blocks: [
     'No vendemos ni cedemos datos personales con fines publicitarios. Los datos solo son visibles para:',
     {list: [
      'El personal de la empresa correspondiente, según su rol y sus ubicaciones asignadas. Una empresa nunca ve los datos de otra.',
      'Los proveedores de infraestructura que se contraten para alojar el servicio (servidor y base de datos), bajo obligación de confidencialidad.',
      'Autoridades, cuando una ley o una orden judicial lo exija.',
     ]},
     'Nexo no cobra pagos ni emite documentos tributarios por su cuenta. Si se integra una pasarela de pago, un proveedor de correo o un proveedor tributario, esta política se actualizará antes de usarlo e indicará qué datos recibe cada uno.',
    ]},
    {id: 'conservacion', title: 'Cuánto tiempo los conservamos', blocks: [
     {list: [
      'Cuentas, perfiles y direcciones: mientras la cuenta esté activa. Puedes borrar tus direcciones y medios de pago guardados desde tu cuenta.',
      'Solicitudes de contacto: el tiempo necesario para responderlas y hacer un seguimiento comercial razonable.',
      'Movimientos de inventario, pedidos y registros de auditoría: se conservan porque son un historial contable que el sistema no permite modificar ni borrar. Solo contienen identificadores internos de las cuentas, no datos personales de clientes finales más allá de lo necesario para el pedido.',
      'Sesiones: se eliminan al cerrar sesión o vencen a las 8 horas.',
     ]},
     'El sistema todavía no ejecuta borrados automáticos por antigüedad; las solicitudes de eliminación se atienden manualmente como se describe más abajo.',
    ]},
    {id: 'derechos', title: 'Tus derechos', blocks: [
     'Conforme a la Ley N° 19.628 y a la Ley N° 21.719 que la reemplaza, puedes pedir:',
     {list: ['Acceso: saber qué datos tuyos tratamos y recibir una copia.', 'Rectificación: corregir datos inexactos o incompletos.', 'Supresión: que eliminemos tus datos cuando ya no sean necesarios o retires tu consentimiento.', 'Oposición y bloqueo: que dejemos de usar tus datos para un fin o los suspendamos mientras se resuelve una reclamación.', 'Portabilidad: recibir tus datos en un formato estructurado y de uso común.']},
     `Para ejercerlos ${writeTo}, indicando tu nombre, el correo de tu cuenta y qué quieres hacer. Podemos pedirte que confirmes tu identidad. Responderemos dentro de los plazos que fije la ley. Si compraste en la tienda de una empresa, tu solicitud se coordina con ella. También puedes reclamar ante la Agencia de Protección de Datos Personales.`,
    ]},
    {id: 'seguridad', title: 'Cómo protegemos los datos', blocks: [
     {list: [
      'Las contraseñas se guardan con un algoritmo de cifrado de un solo sentido.',
      'La sesión usa una cookie protegida que el navegador no deja leer a los scripts de la página.',
      'Los cambios sensibles, como una nueva contraseña, cierran las demás sesiones abiertas.',
      'Los datos de cada empresa están aislados y el acceso del personal se limita por rol y ubicación.',
      'Los pedidos y las operaciones de inventario se registran con claves de idempotencia y un historial que no puede editarse.',
     ]},
     'Ningún sistema es infalible. Si ocurre una vulneración que afecte tus datos de forma relevante, la comunicaremos a los afectados y a la autoridad cuando la ley lo exija.',
    ]},
    {id: 'menores', title: 'Menores de edad', blocks: ['Nexo está dirigido a empresas y a personas que pueden contratar. No recopilamos a sabiendas datos de menores de edad; si crees que lo hicimos, escríbenos para eliminarlos.']},
    {id: 'cambios', title: 'Cambios a esta política', blocks: [`Actualizaremos este documento cuando cambie la forma en que se tratan los datos. La fecha de la última revisión aparece al inicio. Esta versión rige desde el ${UPDATED_AT}.`]},
   ],
  },
  cookies: {
   title: 'Cookies y almacenamiento',
   intro: 'Qué guarda Nexo en tu navegador, por qué y cuánto tiempo.',
   summary: [
    'Nexo usa una sola cookie, necesaria para mantener tu sesión iniciada.',
    'Además guarda en tu dispositivo el carrito de la tienda y tus preferencias de filtros del inventario.',
    'No hay cookies de analítica, publicidad ni de terceros, por eso no te pedimos aceptar un aviso de cookies.',
   ],
   sections: [
    {id: 'inventario', title: 'Qué se guarda en tu navegador', blocks: [
     {table: {head: ['Nombre', 'Tipo', 'Para qué sirve', 'Duración'], rows: [
      ['nexo_session', 'Cookie', 'Mantiene tu sesión iniciada en el panel o en tu cuenta de la tienda.', 'Hasta 8 horas, o hasta que cierres sesión.'],
      ['nexo:store-cart:(tienda)', 'Almacenamiento local', 'Recuerda los productos de tu carrito en cada tienda.', 'Hasta que vacíes el carrito, completes la compra o borres los datos del sitio.'],
      ['nexo:inventory:(usuario)', 'Almacenamiento local', 'Recuerda tus filtros, densidad de tabla, cantidad por página y si ves precios en el inventario del panel.', 'Hasta que borres los datos del sitio.'],
     ]}},
    ]},
    {id: 'sesion', title: 'La cookie de sesión', blocks: [
     'La cookie nexo_session es estrictamente necesaria: sin ella no podemos reconocer que ya iniciaste sesión. Está marcada como HttpOnly, por lo que los scripts de la página no pueden leerla; usa SameSite=Strict, de modo que solo se envía cuando navegas dentro de Nexo, y en producción solo viaja por conexiones seguras (HTTPS).',
     'Contiene un código aleatorio sin datos personales. En nuestros servidores solo guardamos una versión resumida de ese código.',
    ]},
    {id: 'local', title: 'Almacenamiento local del navegador', blocks: [
     'El carrito y las preferencias del inventario se guardan únicamente en tu dispositivo y no se usan para identificarte ni para elaborar perfiles. Son funciones que pediste al usar la tienda o el panel.',
     'Algunos filtros también aparecen en la dirección de la página para que puedas compartir o recuperar una búsqueda.',
    ]},
    {id: 'terceros', title: 'Lo que no usamos', blocks: [
     {list: ['Herramientas de analítica o medición de audiencia.', 'Píxeles o cookies publicitarias.', 'Reproductores o contenido incrustado de otros sitios.', 'Fuentes tipográficas cargadas desde servidores externos: se sirven desde el propio sitio.']},
     'Si algún día incorporamos alguna de estas tecnologías, te pediremos tu consentimiento antes de activarla y actualizaremos esta página.',
    ]},
    {id: 'control', title: 'Cómo controlarlas', blocks: [
     'Puedes borrar la cookie y los datos del sitio desde la configuración de tu navegador, o cerrar sesión desde Nexo. Si bloqueas la cookie de sesión no podrás iniciar sesión; si borras el almacenamiento local perderás tu carrito y tus filtros guardados, pero no tus pedidos ni tu cuenta.',
    ]},
   ],
  },
  terminos: {
   title: 'Términos y condiciones',
   intro: 'Las reglas para usar Nexo, tanto si administras una empresa como si compras en la tienda de una.',
   summary: [
    'Nexo es una herramienta de gestión: cada empresa es responsable de sus productos, precios, ventas y de los datos de sus clientes.',
    'Nexo no cobra pagos ni emite boletas o facturas tributarias; registra lo que la empresa gestiona por sus propios medios.',
    'La disponibilidad, el soporte y las garantías se pactan en el contrato de cada plan.',
    'Los planes y precios del sitio son referenciales hasta que se formalice una contratación por escrito.',
   ],
   sections: [
    identity,
    {id: 'alcance', title: 'Qué es Nexo y quién puede usarlo', blocks: [
     'Nexo permite administrar productos, ubicaciones, stock, ventas, pedidos, envíos y posventa, y publicar una tienda online. Estos términos se aplican a toda persona que use el sitio, el panel o una tienda creada con Nexo. Para contratar debes tener capacidad legal; si actúas por una empresa, declaras que puedes obligarla.',
     {list: ['Empresa: el negocio que usa Nexo para gestionar y vender.', 'Personal: usuarios que la empresa invita (administrador o agente de ubicaciones).', 'Cliente: persona que compra en la tienda de una empresa.']},
    ]},
    {id: 'cuentas', title: 'Cuentas y seguridad', blocks: [
     {list: [
      'Entrega información verdadera y mantenla actualizada. Las cuentas de clientes requieren verificar el correo.',
      'Eres responsable de la confidencialidad de tu contraseña y de lo que ocurra con tu sesión. Avísanos si sospechas un uso no autorizado.',
      'El administrador de una empresa gestiona al personal, sus roles y ubicaciones. Una empresa siempre conserva al menos un administrador activo.',
      'Hay límites de intentos de acceso y de solicitudes para proteger las cuentas. Las sesiones vencen a las 8 horas.',
      'No compartas tu cuenta ni intentes acceder a datos de otra empresa o de otra ubicación sin autorización.',
     ]},
    ]},
    {id: 'uso', title: 'Uso aceptable', blocks: [
     'No puedes usar Nexo para actividades ilegales, para vender productos prohibidos, para engañar a clientes, para vulnerar o sobrecargar el servicio, ni para extraer datos de forma masiva. Podemos suspender cuentas que incumplan estas reglas, avisando cuando sea posible.',
     'Las operaciones de inventario, ventas y pedidos quedan registradas en un historial que no puede modificarse. Revisa los datos antes de confirmar: los errores se corrigen con un movimiento nuevo, no editando el anterior.',
    ]},
    {id: 'tienda', title: 'Compras en una tienda', blocks: [
     {list: [
      'La empresa titular de la tienda es quien te vende. Nexo es la herramienta que usa; no es parte de la compra ni responde por los productos.',
      'Al iniciar una compra, el stock se reserva por un tiempo limitado (15 minutos de forma predeterminada, configurable por la empresa). Si no pagas a tiempo, la reserva vence y el stock vuelve a estar disponible.',
      'Los precios y el costo de envío se muestran antes de pagar. El envío solo está disponible en las comunas con cobertura que la empresa habilitó.',
      'Los reembolsos, cambios y devoluciones los gestiona la empresa vendedora. Tus derechos como consumidor bajo la Ley N° 19.496 no se limitan por estos términos.',
     ]},
    ]},
    {id: 'pagos', title: 'Pagos y comprobantes', blocks: [
     'Nexo no procesa cobros ni mueve dinero: el pago de una compra se acuerda y se recibe entre el cliente y la empresa vendedora, y el sistema registra ese pago para controlar el pedido, el stock y los reembolsos. Los comprobantes que emite Nexo son internos y no reemplazan una boleta ni una factura tributaria, que debe emitir la empresa.',
     'Si se integra una pasarela de pago o un proveedor tributario, se informará aquí y se te pedirá aceptar las condiciones correspondientes antes de usarlos.',
    ]},
    {id: 'planes', title: 'Planes, licencias y contratación', blocks: [
     'Nexo se ofrece en dos modalidades: suscripción e instalación permanente con licencia. Los precios y planes mostrados en el sitio son referenciales y esta web no activa contratos ni cobra suscripciones.',
     'La contratación se formaliza por escrito con el proveedor e incluye precio, alojamiento, límites de uso, actualizaciones, soporte, garantías y condiciones de término. Esas condiciones prevalecen sobre estos términos en lo que se refieran a la empresa contratante.',
    ]},
    {id: 'datos', title: 'Datos de la empresa', blocks: [
     'La información que carga una empresa (catálogo, clientes, pedidos, inventario) sigue siendo suya. Nos autoriza a tratarla solo para prestarle el servicio, según nuestra Política de privacidad. La empresa es responsable de tener derecho a usar esos datos y de informar a sus clientes sobre su uso.',
    ]},
    {id: 'garantias', title: 'Disponibilidad y límites de responsabilidad', blocks: [
     'Trabajamos para que Nexo esté disponible y funcione correctamente, pero ningún software está libre de interrupciones o errores. Salvo lo que pacte el contrato de cada plan, no garantizamos disponibilidad continua ni la ausencia de errores.',
     'En la medida que la ley lo permita, el proveedor no responde por pérdidas indirectas, lucro cesante ni por decisiones de negocio tomadas con información del sistema. Esto no limita las responsabilidades que la ley no permite excluir ni los derechos irrenunciables de los consumidores.',
    ]},
    {id: 'cambios', title: 'Cambios en el servicio y en estos términos', blocks: [
     `Podemos actualizar Nexo y estos términos. Publicaremos la versión nueva con su fecha (esta rige desde el ${UPDATED_AT}) y, si el cambio es relevante para una empresa con contrato, se lo informaremos con anticipación. Si sigues usando el servicio después del cambio, lo aceptas.`,
    ]},
    {id: 'ley', title: 'Ley aplicable y contacto', blocks: [
     `Estos términos se rigen por las leyes de la República de Chile. Cualquier controversia se someterá a los tribunales ordinarios de justicia de Chile, sin perjuicio de los derechos que la ley otorga a los consumidores. Para dudas o reclamos ${writeTo}.`,
    ]},
   ],
  },
 };
}
