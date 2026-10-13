# Nexo · Identidad base

Nexo conecta productos, sucursales, inventario y clientes. La identidad busca transmitir claridad y control sin parecer una herramienta exclusiva de una tienda.

| Uso | Color |
| --- | --- |
| Principal: acciones y marca | Azul profundo #155A83 |
| Acento: indicadores, foco y detalles | Turquesa #087F82 |
| Texto | Azul tinta #132B46 |
| Fondo | Gris claro #F3F7FA |

Tipografía de sistema inspirada en San Francisco: -apple-system/BlinkMacSystemFont en Apple, Segoe UI Variable/Segoe UI en Windows y system-ui como alternativa. Títulos de peso600, espaciado proporcional y cifras tabulares en precios/tablas. Sin descarga de fuentes externas. Títulos claros, superficies blancas y formas suavemente redondeadas. Logo exclusivamente textual `nexo.`, en minúsculas y con punto; no se creó una imagen ni un logo externo. Variables CSS --nexo-primary, --nexo-accent, --nexo-ink y --nexo-surface. Esto es una base editable, no un manual definitivo ni una validación completa de accesibilidad.

Frase de marca: **Tecnología que conecta tu negocio**. Inicio: **Todo conectado. Todo bajo control.** Pie: **Impulsado con tecnología Nexo**, conservando la edición encontrada en el proyecto del usuario. Se reemplazó Powered by Nexo en las pantallas actuales. La identidad del producto y la personalización de cada empresa son conceptos separados; el catálogo muestra el nombre de la empresa y la base común, mientras el editor visual de marca empresarial queda pendiente.

## Entrada y primeros pasos

- `/`: catálogo público y acceso del equipo; muestra enlace de configuración si está disponible. Si hay una sola empresa, enlaza directamente su catálogo; si hay varias, solicita identificador sin publicar una lista global de empresas.
- `/configurar`: crea la primera empresa y OWNER, sin inventar una contraseña ni iniciar sesión automáticamente. Tras crear, explica las credenciales elegidas y enlaza el panel con identificador precargado.
- `/tienda?empresa=mi-tienda`: catálogo paginado de24 productos, precios CLP y disponibilidad por ubicación sin registro. No incluye carrito/checkout todavía ni carga/renderizado de imágenes en esta versión.
- `/panel`: acceso del equipo, navegación de inventario/productos/ubicaciones y orientación cuando faltan productos o ubicaciones.

## Configuración inicial local

`npm run dev` habilita NEXO_LOCAL_SETUP_ENABLED=true en sus procesos locales. Reiniciar el comando después de actualizarlo para obtener esa variable. La instalación debe tener cero empresas. Un bloqueo de tabla serializa la primera creación frente a solicitudes concurrentes y otras altas; una instalación existente responde SETUP_COMPLETE. La contraseña se almacena con el hash habitual, sin retornarla ni guardarla en el navegador. Los datos de empresa y OWNER se crean en una transacción; no se asignan condiciones comerciales, licencias ni cobros.

El acceso inicial sin credenciales solo está habilitado en desarrollo local y cuando se activa explícitamente esa variable. En NODE_ENV=production siempre se rechaza, incluso con flagtrue. No se ha implementado un asistente de instalación público de producción: requiere un mecanismo de autorización de operador antes de habilitarlo. El servidor dev se liga a loopback. Las mutaciones conservan la validación de origen de la API. No exponer ese modo a una red pública.

Pruebas: configuración concurrente, inicio de sesión de OWNER creado, rechazo en producción/flag apagado, rechazo de segunda empresa y validación estricta de credenciales/rol. Tipos y compilación de las páginas públicas comprobados. La revisión visual interactiva continúa pendiente por el bloqueo de la herramienta de navegador; no se presenta una captura antigua como prueba nueva.


Tipografía vigente: Inter4.1 variable normal, servida localmente mediante next/font/local con display swap. Archivo oficial WOFF2 de352240bytes (aprox344KiB), pesos100–900, sinCDN ni solicitudes aGoogle. LicenciaSILOFL1.1 original incluida en public/fonts/LICENSE.txt. Alternativas de sistema solo durante carga/fallo. El paquete incluye public para conservar licencia/recursos. Fuente oficial: https://github.com/rsms/inter/tree/v4.1; archivo sin modificaciones.


Ajuste de presencia empresarial: logo textual de76px en inicio (60px móvil) y48px en enlaces de marca. Inicio prioriza empresa/equipo, con hero compacto, bloque operativo y tarjetas de acceso a inventario/productos/ubicaciones; catálogo público queda como enlace secundario. Panel muestra resúmenes de datos cargados con alcance explícito por grupo/página, sin inventar totales globales.
