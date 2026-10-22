# Plantilla base de la tienda

Acceso local: `http://127.0.0.1:3000/tienda?empresa=prismabyte`.

La página pública presenta la empresa, las categorías, el catálogo y las sucursales activas. Usa el nombre, presentación, logotipo, color principal y datos de contacto existentes. Nexo aparece como proveedor de tecnología en el pie. No se añadieron opciones de personalización: esta es la plantilla común sobre la que podrán incorporarse posteriormente.

Los productos enlazan con sus fichas individuales. El carrito, las cuentas de cliente, el retiro, las cotizaciones de envío y el pago con simulador conservan sus flujos existentes. Se puede consultar sin iniciar sesión; para comprar se requiere una cuenta de cliente de esa empresa.

`GET /api/public/:slug/catalog` acepta, además de `limit` y `offset`:

- `q`: nombre o SKU, sin distinguir mayúsculas.
- `categoryId`: categoría de esa empresa, incluyendo descendientes.
- `priceMin` y `priceMax`: pesos enteros, límites incluidos.
- `available`: `all` o `available` (existencias en ubicaciones activas).
- `sort`: `name_asc`, `price_asc` o `price_desc`.
- `specs`: objeto JSON con valores exactos de las características de la categoría seleccionada. Se conservan tipos: por ejemplo, `{"capacity_gb":1000,"dram":false}` en SSD.

Todos los filtros se validan y aplican en PostgreSQL antes de paginar. Solo se devuelven productos activos y disponibilidad de ubicaciones activas; no se publican existencias físicas ni reservas internas. Las ubicaciones se devuelven por separado para que el selector de retiro funcione incluso con un catálogo filtrado vacío. Los filtros no reservan unidades: el servidor vuelve a comprobar precios y stock al crear el pedido.

Verificación: TypeScript, compilación de producción y pruebas de catálogo público, fichas y pedidos. La revisión visual interactiva en navegador queda pendiente; se verificó la respuesta HTTP local de la tienda y de sus filtros.

## Revisión visual con las pautas de Emil Kowalski

La plantilla emplea una cabecera persistente, portada con una selección estable de productos reales, accesos por categoría y jerarquía tipográfica por tamaño, peso e interlineado. Las tarjetas muestran dos características de la categoría y confirman el agregado al carrito solo cuando se pudo realizar. Las etiquetas de filtros se pueden quitar individualmente.

Las interacciones usan transiciones cortas, propiedades explícitas y respuesta al pulsar. No se añadieron dependencias de animación. Se respetan movimiento reducido, transparencia reducida y contraste aumentado. Los estilos hover se limitan a dispositivos con puntero preciso; los campos táctiles tienen al menos 16 px y los controles 44 px de altura. El catálogo conserva paginación de 24 productos. La selección de productos de la portada permanece estable al filtrar.

Pautas consultadas: `emil-design-eng`, `apple-design` y `mobile-native`, de https://github.com/emilkowalski/skills. Las habilidades se instalaron en el perfil local de Codex, fuera del repositorio de Nexo.

La revisión de código y la compilación no equivalen a una revisión visual interactiva: quedan pendientes la inspección en navegador y la comprobación de tacto, teclado virtual y scroll en un teléfono físico.

### Carrusel de productos

La presentación se sustituyó por un carrusel de hasta cinco productos activos, con foto y stock disponible en la carga inicial. Se eligen categorías distintas para evitar repetir modelos similares. Cada anuncio usa su foto, nombre y precio existentes; no inventa descuentos, campañas ni promociones. La selección permanece estable al filtrar el catálogo.

Usa desplazamiento nativo con CSS scroll snap, controles anterior/siguiente, indicadores de posición, teclado (flechas, Inicio y Fin cuando el visor tiene foco) y deslizamiento táctil. La reproducción automática avanza cada cinco segundos e incluye pausa y navegación continua. Las acciones desde teclado y con movimiento reducido cambian de posición inmediatamente; el desplazamiento de los botones con ratón usa la animación nativa del navegador. No se instalaron dependencias adicionales. La comprobación visual y el tacto en teléfono físico siguen pendientes.

La navegación superior muestra cada categoría como desplegable nativo (Popover API), con sus subcategorías anidadas y una opción para ver la categoría completa. Se cierra al seleccionar, pulsar Escape o hacer clic fuera. El logo aparece a la izquierda, tanto en el catálogo como en las fichas públicas.

### Carrito visual

El carrito utiliza un diálogo amplio con fotos enlazadas a las fichas, precio por unidad, cantidades con botones y entrada directa, quitar producto y subtotales enteros con BigInt. Un panel separado resume la compra y permite elegir retiro o envío; ambos formularios conservan sus campos al alternar. En móvil se apilan productos y resumen. El estado vacío tiene un acceso para seguir explorando.

Se mantienen el inicio de sesión de cliente, la validación de precio y stock en el servidor, las claves de idempotencia y el bloqueo durante solicitudes de resultado incierto. Al reabrir una solicitud de envío pendiente, se conserva ese método de entrega. Si una solicitud se confirma y luego falla la actualización de la vista, se informa como registrada en lugar de sugerir repetirla. El envío continúa sujeto a cotización antes del pago.

Verificación del cambio: compilación de producción y 44 pruebas funcionales de pedidos, reservas, cotización, simulador y catálogo. La revisión visual interactiva sigue pendiente.

### Compras y cuenta de cliente

Mis compras separa pedidos y cotizaciones mediante selectores, con paginación independiente de diez registros, fechas en horario de Chile, estados e importes. El detalle conserva los productos e importes históricos del pedido y muestra por separado los costos y vigencia de una cotización. La cancelación de reserva está un nivel más adentro; el pago sigue siendo simulado. Las acciones de pedidos y cotizaciones se bloquean mientras una solicitud tiene resultado incierto.

La configuración de cuenta tiene navegación entre información personal y seguridad. No muestra formularios para cambiar credenciales al entrar. El cambio de contraseña conserva su validación actual y retorna a la tienda al cerrar sesiones. Las pantallas de acceso, registro, verificación y recuperación usan el tema de la empresa. No se añadieron campos de usuario que la API no entregue ni se modificaron permisos o almacenamiento.

Verificación: compilación de producción y TypeScript. La revisión visual interactiva sigue pendiente.

El carrusel ahora rota cada cinco segundos y enlaza ambos extremos mediante copias visuales inertes de la primera y última diapositiva. Al completar el desplazamiento se reajusta la posición al original equivalente. Se pausa al pasar el ratón, salir de pantalla, ocultar la pestaña o bloquear la tienda; el foco de teclado y la interacción táctil detienen la rotación hasta pulsar Reanudar. Incluye un control explícito de pausa. Movimiento reducido desactiva la reproducción inicial. Los clones no se anuncian ni reciben foco. La transición visual del bucle queda pendiente de verificar en navegador.

### Marca, modelo y opciones reales

`GET /api/public/:slug/facets?categoryId=...&brand=...&modelQ=...` devuelve las características del catálogo activo de esa empresa y categoría (incluye descendientes). Las marcas se mantienen completas al seleccionar una; modelos y las demás características se restringen a esa marca. El buscador de modelos admite coincidencias parciales sin distinguir mayúsculas. Los filtros definitivos siguen usando valores exactos tipados al elegir una sugerencia. Se limitan las respuestas a 200 opciones por característica, sin depender de la página del catálogo.

Los selectores numéricos y booleanos usan valores existentes y conservan su tipo: no convierten `false` en texto ni ofrecen capacidades ausentes en la categoría. La selección de otra marca limpia las especificaciones anteriores. Las consultas de sugerencias se cancelan al cambiar categoría, marca o texto. Las pruebas verifican aislamiento por empresa, exclusión de productos inactivos y diferenciación de marcas y modelos.

Publicación de esta etapa: compilación aprobada, 202 pruebas verificadas (la de copia y restauración se repitió con `NEXO_PG_BIN` apuntando a PostgreSQL 18) y comprobación HTTP de marcas, modelos y DPI de Mouse en la semilla local.
