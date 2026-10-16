# Nexo · Primera beta · v0.20.0-beta.1

Plataforma para pymes de tecnología: inventario por empresa/ubicación, pedidos, pagos simulados, posventa, cuentas, invitaciones y registro comercial de suscripción/licencia permanente. Una misma base para futura suscripción e instalación independiente. Cerradas etapas 1, 2, 3A, 3B, 4A, 4B1, 4B2, 4C1, 4C2A y 4C2B; no lista para producción.

## Catálogo categorizado

Categorías, subcategorías y fichas técnicas por tipo de producto; guía en [docs/TAXONOMY.md](docs/TAXONOMY.md). La semilla incluye 114 productos y cubre todas las categorías finales. Para agregar los que falten sin borrar datos: `npm run demo:seed -- --fill`. En PrismaByte se puede reemplazar la demostración explícitamente con `npm run demo:seed -- --replace` (crea respaldo antes de reiniciar su catálogo y operaciones).

## Arranque local recomendado

Desde la carpeta nexo ejecutar `npm run dev`: prepara PostgreSQL local persistente, aplica migraciones y arranca web y worker. Abrir http://localhost:3000/panel. Ctrl+C detiene el entorno gestionado. Requiere PostgreSQL instalado y npm ci previamente. No copiar .env.example para este modo: se genera configuración local si falta. Guía en [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md).

## Tecnología y preparación manual (base externa)

Node.js 24+, TypeScript, Next.js/React, PostgreSQL y node-postgres. SQL explícito y migraciones versionadas. Panel empresarial y catálogo web con React y CSS. Consulta las funciones y límites de esta beta en [docs/BETA.md](docs/BETA.md).

1. `npm ci`.
2. Crear una base PostgreSQL exclusiva de Nexo y un usuario propio. No usar bases de otros proyectos ni superusuario para ejecutar la aplicación.
3. Copiar `.env.example` a `.env`; configurar `DATABASE_URL` para la aplicación, `NEXO_MIGRATION_DATABASE_URL` para migrar, `NEXO_OPERATOR_DATABASE_URL` para altas y `APP_ORIGIN=http://localhost:3000` para desarrollo. Abrir exactamente ese origen.
4. `npm run db:migrate`.
5. Para crear una empresa, agregar temporalmente `SETUP_COMPANY_SLUG`, `SETUP_COMPANY_NAME`, `SETUP_ADMIN_EMAIL` y `SETUP_ADMIN_PASSWORD` a `.env`; ejecutar `npm run company:create`. Clave mínima de 12 caracteres; retirarla del archivo después. No hay cuentas por defecto.
6. `npm run dev`. Producción: `npm run build` y `npm start`, detrás de proxy HTTPS. El arranque se liga a loopback.

Migraciones: 001 inventario, 002 pedidos, 003 cotizaciones/simulador, 004 posventa, 005 administración, 006 registro/recuperación, 007 invitaciones, 008 comercial, 009 importación de licencias y 010 imágenes de productos. No modificar migraciones aplicadas: el runner verifica checksum. Envíos antiguos aún sin pagar deben cancelarse/recrearse con cotización. Datos anteriores conservados; 008 no asigna licencias automáticamente ni modifica cuentas/stock.

## Permisos y stock

- OWNER administra su empresa. AGENT opera ubicaciones asignadas y puede administrar productos compartidos. CUSTOMER consulta y compra con su cuenta; no edita inventario ni marca pagos. Invitados consultan catálogo, sin compra invitada todavía.
- La empresa privada se determina por sesión, nunca por `companyId` recibido del navegador. Claves foráneas compuestas impiden cruces de empresas; lecturas filtradas por servidor. RLS pendiente de evaluar antes de producción.
- Una ubicación WEB y varias STORE por empresa. `disponible = físico - reservado`. Reserva no descuenta físico; pago consume ambos; cancelar/vencer libera reservado.
- RECEIPT suma, ADJUSTMENT aplica diferencia con signo, TRANSFER mueve atómicamente y SALE es un movimiento básico conservado por compatibilidad. Para ventas locales con líneas/total usar `/api/sales`; no enviar también SALE por la misma venta.
- Reservas, ventas y transferencias comparten bloqueo transaccional por empresa. No consumen unidades comprometidas a otro pedido. Desactivar producto/ubicación con reservas vigentes se bloquea.
- Libro de movimientos, eventos de pedidos y capturas de pago inmutables por triggers. Correcciones no reescriben historial. El usuario de aplicación no debe poder desactivar triggers.
- Montos CLP enteros, cálculos BigInt y respuestas monetarias como strings. Máximo 50 productos distintos por carrito; agrupar repetidos. Precios y totales siempre resueltos en servidor.
- Contraseñas scrypt con sal; sesiones opacas de 8 horas guardadas como hash; cookies HttpOnly/SameSite=Strict/Secure en producción. Origin validado para mutaciones del navegador, sin CORS abierto. Login limitado por empresa/correo; añadir límites por IP en el proxy.

## Cuentas y configuración (4A)

Contrato y límites en [docs/ACCOUNTS.md](docs/ACCOUNTS.md). OWNER edita usuarios/roles/asignaciones y configuración pública (nombre, logo HTTPS, color, contacto y descripción). Protección del último administrador activo, revocación de sesiones y auditoría inmutable. Datos preparados para la futura tienda, sin diseño nuevo. Registro/recuperación locales en 4B1; correo real, planes y licencias pendientes.

| Método | Ruta | Acceso / función |
|---|---|---|
| PATCH | `/api/users/{id}` | OWNER: nombre/correo/estado/rol/asignaciones y reason |
| POST | `/api/users/{id}/password` | OWNER: restablecimiento administrativo de otra cuenta y motivo |
| POST | `/api/auth/password` | Usuario: contraseña actual y nueva; cierra sesiones |
| GET, PATCH | `/api/settings/company` | OWNER: consultar/editar datos públicos; reason para editar |
| GET | `/api/public/{slug}/settings` | Público: identidad y contacto de la tienda; poweredBy Nexo |
| GET | `/api/administration/events` | OWNER: historial administrativo paginado |

## Registro y recuperación (4B1)

Contrato y configuración en [docs/REGISTRATION.md](docs/REGISTRATION.md). POST públicos: auth/register, auth/resend-verification, auth/verify-email, auth/forgot-password y auth/reset-password. Registro solo CUSTOMER; login exige verificación. Tokens con hash, uso único, empresa/propósito y vencimiento (24 horas para verificar, 20 minutos para recuperar). Cambios sensibles invalidan tokens; reset revoca sesiones. Respuestas de solicitud genéricas sin tokens, límites persistentes y auditoría sin secretos. Cambio de contraseña autenticado limitado a cinco intentos cada 15 minutos.

Correo local cifrado AES-256-GCM, flag apagado por defecto y siempre bloqueado en producción. No envía correos reales. Configurar NEXO_LOCAL_MAIL_ENABLED/NEXO_LOCAL_MAIL_KEY y usar `npm run mail:local -- UUID_EMPRESA` para listar metadatos o agregar UUID_MENSAJE para exportación sensible en .local-mail ignorada por Git. No hay bandeja HTTP ni tokens en respuesta pública. Verificación local prueba posesión del token, no entrega a buzón real. Invitaciones usan la misma herramienta; proveedor real de correo y frontend pendientes.

## Invitaciones de personal (4B2)

Contrato en [docs/INVITATIONS.md](docs/INVITATIONS.md). OWNER crea/lista invitaciones en `/api/invitations`, con rol AGENT/OWNER explícito y ubicaciones activas, clave idempotente y motivo. POST `/api/invitations/{id}/revoke` las revoca; POST público `/api/auth/accept-invitation` recibe empresa, token, nombre y contraseña, sin permisos elegibles por el destinatario. Token siete días, uso único y cuenta nueva; no reemplaza existentes ni registra sesión automática. Cambios de autoridad del creador revocan pendientes. Correo local cifrado, sin emails reales y bloqueado en producción. Migración 007 conserva correo/tokens anteriores. Renovar exige revocar y nueva clave. Registro CUSTOMER no ocupa correo reservado por invitación vigente.

## Modalidades comerciales (4C1)

Registro interno de SUBSCRIPTION y PERPETUAL con periodos independientes de uso/actualizaciones/soporte. Sin precios, cobros, licencias firmadas ni restricciones operativas. Solo escritura por CLI privado de operador; OWNER consulta GET `/api/commercial` y `/api/commercial/history`, sin poder auto-ampliar condiciones. Revisiones inmutables/idempotentes con control de versión y aplicación futura, alta comercial atómica por `company:onboard`. Nueva migración 008, sin afectar datos previos. Contrato y configuración en [docs/COMMERCIAL.md](docs/COMMERCIAL.md).

## API

JSON, máximo 64 KB. Respuestas `Cache-Control: no-store`. Errores `{ "error": { "code": "...", "message": "..." } }`. Listados paginados: `?limit=50&offset=0`, máximo 100, salvo ubicaciones. IDs UUID.

| Método | Ruta | Función / acceso |
|---|---|---|
| GET | `/api/health`, `/api/ready` | Proceso / conexión y esquema |
| GET | `/api/public/{slug}/catalog` | Catálogo público y disponibilidad |
| POST | `/api/auth/login` | `{company,email,password}`; cookie |
| GET | `/api/auth/me` | Sesión actual |
| POST | `/api/auth/logout` | Revocar sesión |
| GET, POST | `/api/products` | Agente/propietario; listar/crear |
| PATCH | `/api/products/{id}` | Editar/desactivar |
| GET, POST | `/api/locations` | Listar autorizadas / propietario crea |
| PATCH | `/api/locations/{id}` | Propietario edita; agente cambia shippingEnabled en asignadas |
| GET, POST | `/api/users` | Propietario lista/crea agentes o clientes |
| GET | `/api/inventory`, `/api/inventory/movements` | Stock / libro autorizados |
| POST | `/api/inventory/operations` | Agente; movimiento atómico |
| GET, POST | `/api/orders` | Listar autorizados / cliente crea |
| GET | `/api/orders/{id}` | Pedido, líneas y eventos autorizados |
| POST | `/api/orders/{id}/cancel` | Cliente dueño o agente; solo reserva pendiente |
| POST | `/api/orders/{id}/manual-payment` | Agente; pago verificado externamente por él |
| POST | `/api/orders/{id}/fulfill` | Agente; entregar/despachar pagado |
| POST | `/api/sales` | Agente; venta local multilínea |
| PATCH | `/api/settings/orders` | Propietario; reservationMinutes entre 1 y 60 |
| GET, POST | `/api/shipping/quotes` | Listar autorizadas / cliente solicita |
| GET | `/api/shipping/quotes/{id}` | Detalle autorizado con dirección |
| POST | `/api/shipping/quotes/{id}/approve` | Agente del origen / propietario |
| POST | `/api/shipping/quotes/{id}/reject` | Agente del origen / propietario |
| POST | `/api/payments/intents` | Cliente; iniciar pago simulado de su pedido |
| GET | `/api/payments/intents/{id}` | Estado, con permisos del pedido |
| GET | `/api/payments/captures` | Agente/propietario; capturas y casos para revisión |
| POST | `/api/payments/simulator/{companyId}/webhook` | Firma HMAC obligatoria; no usa sesión |

Creación de pedidos, ventas, cotizaciones e intentos de pago requiere `Idempotency-Key` de 8–128 caracteres alfanuméricos, `_` o `-`. Primera creación 201; replay 200. Cada módulo conserva su clave por empresa y la vincula a actor/datos. Reutilizarla con otros datos devuelve 409. Un pedido expirado reintentado sigue expirado, no reserva de nuevo.

## Ejemplos básicos

Producto: `{ "sku":"SSD-001", "name":"SSD 1 TB", "priceMinor":59990 }`.

Ubicación: `{ "name":"Centro", "kind":"STORE", "shippingEnabled":true }`.

Agente: `{ "name":"Agente", "email":"agente@empresa.cl", "password":"REEMPLAZAR-POR-CLAVE-SEGURA", "role":"AGENT", "locationIds":["UUID-SUCURSAL"] }`.

Entrada de stock, con clave: `{ "kind":"RECEIPT", "productId":"UUID-PRODUCTO", "locationId":"UUID-SUCURSAL", "quantity":10, "reason":"Recepción proveedor" }`.

Retiro: `POST /api/orders`, cookie de cliente y clave:
```json
{"fulfillment":"PICKUP","locationId":"UUID-SUCURSAL","items":[{"productId":"UUID-PRODUCTO","quantity":2}]}
```

Pago manual: `POST /api/orders/{id}/manual-payment`, cookie de agente:
```json
{"amountMinor":"119980","method":"TRANSFER","reference":"referencia-unica-del-pago"}
```
Métodos CASH, CARD o TRANSFER. Monto exacto y referencia única por empresa. No realiza ni verifica un cargo con un proveedor. Repetir mismos datos no descuenta otra vez; datos diferentes devuelven conflicto. Prefijo `simulator:` reservado.

Cancelar: `POST /api/orders/{id}/cancel`, `{ "reason":"Cambio de opinión" }`. Solo antes del pago; repetir el mismo motivo es idempotente. Entregar/despachar: `POST /api/orders/{id}/fulfill`, sin cuerpo. Requiere pago; repetir no descuenta. FULFILLED en envío significa despachado, no entrega confirmada por transportista.

Venta local, cookie de agente y clave:
```json
{"locationId":"UUID-SUCURSAL","items":[{"productId":"UUID-PRODUCTO","quantity":2}],"payment":{"amountMinor":"119980","method":"CASH","reference":"referencia-unica-de-caja"}}
```
Todas las líneas, pago y entrega se guardan en una transacción. Fallos revierten todo. No emite boleta fiscal.

## Despacho con cotización previa

1. Cliente solicita `POST /api/shipping/quotes`, con clave:
```json
{"items":[{"productId":"UUID-PRODUCTO","quantity":2}],"address":{"recipient":"Nombre del destinatario","phone":"+56912345678","line1":"Calle y número","commune":"Santiago","region":"Metropolitana","country":"CL"}}
```
2. Se selecciona un origen que tenga todo: WEB primero; si no, STORE habilitada. Sin división ni transferencias implícitas. No se reserva ni cobra. Máximo cinco solicitudes/aprobaciones pendientes por cliente; el agente puede rechazar solicitudes fuera de cobertura con `{ "reason":"Fuera de cobertura" }`.
3. Agente autorizado aprueba con `{ "shippingMinor":"3500", "note":"Despacho cotizado" }`. Se capturan precios actuales y costo de envío, válidos 30 minutos, sin reservar. El origen queda fijado desde la solicitud; no se reasigna silenciosamente después.
4. Cliente crea el pedido con el mismo carrito, cookie y una nueva clave:
```json
{"fulfillment":"SHIP","shippingQuoteId":"UUID-COTIZACION","items":[{"productId":"UUID-PRODUCTO","quantity":2}]}
```
5. Se vuelve a validar stock, productos activos y permiso de envío del origen. Se reserva por el plazo de pedidos y se copia dirección, precios y flete. Total = mercadería + envío. La cotización se usa una vez; fallos revierten pedido, reserva y consumo de cotización.

La reserva empieza al crear pedido, **no al pedir cotización**. Cotización aprobada no garantiza stock. Si el cliente cambia carrito/dirección, pedir otra cotización. Cambiar el catálogo después de aprobar no altera los precios cotizados durante esos 30 minutos. Solo direcciones de Chile en esta versión; sin conexión a transportista, tarifas automáticas ni promociones.

## Pagos simulados

Leer `docs/PAYMENT_SIMULATOR.md`. Deshabilitados por defecto y bloqueados si `NODE_ENV=production`, aunque exista configuración. No se movió dinero real ni se implementó una pasarela externa.

El cliente crea el intento con `{ "orderId":"UUID-PEDIDO" }` y clave. El monto incluye el flete aprobado. La respuesta marca `simulated:true` y `checkoutUrl:null`; jamás contiene secretos. Un intento por pedido; reintentar con la clave original. La ruta de simulación requiere firma por empresa, timestamp reciente y payload exacto.

Éxito válido consume reservado y físico una vez y registra fuente SIMULATOR sin inventar un agente. Fallos posteriores no revierten pagos. Eventos repetidos no duplican descuentos; una nueva transacción para un pedido pagado se registra como REVIEW. Montos/monedas incorrectos, pedidos cancelados o reservas vencidas se conservan como capturas para revisión, sin reclamar stock ni marcar pagado.

Los casos REVIEW se cierran al completar su reembolso simulado; una captura cero admite cierre sin fondos. No se permite cancelar un pedido pagado por la ruta de reservas: usar reembolso y reversión antes de entregar, o devolución física después.

## Posventa (3B)

Contrato y ejemplos en [docs/AFTERSALES.md](docs/AFTERSALES.md).

| Método | Ruta | Función / acceso |
|---|---|---|
| POST | `/api/payments/captures/{id}/refunds` | OWNER: reembolso simulado parcial/total; Idempotency-Key |
| POST | `/api/payments/captures/{id}/resolve` | OWNER: cerrar captura REVIEW de monto cero con motivo |
| POST | `/api/orders/{id}/refunds` | OWNER: registrar reembolso de pago MANUAL ya realizado fuera de Nexo; clave y referencia |
| POST | `/api/orders/{id}/returns` | Agente autorizado: recibir unidades aptas/dañadas de pedido entregado; clave |
| POST | `/api/orders/{id}/withdrawal` | Agente autorizado: revertir todo el stock antes de entregar, tras reembolso completo; clave |
| GET | `/api/orders/{id}/aftersales` | Consulta autorizada: reembolsos, recepciones, refundState y withdrawn |

Reembolsar no repone; recibir no reembolsa. Dañados no entran al catálogo. Cantidades devueltas acumuladas no superan las vendidas y reembolsos acumulados no superan cada pago/captura. Reembolsar pago aplicado antes de entregar bloquea despacho; el cierre requiere reembolso completo y reversión al origen. PAID/FULFILLED conservan historial; consultar la situación de posventa por separado. Reembolsar una captura extra REVIEW no afecta la entrega de la compra correctamente pagada.

## Vencimientos y pruebas

Reserva inicial: 15 minutos, configurable por empresa de 1 a 60 para pedidos nuevos; máximo cinco pendientes por cliente. `npm run orders:expire` procesa una pasada; `npm run orders:worker` repite cada cinco segundos. No instalado como servicio. Catálogo, inventario y comandos también liberan reservas vencidas y expiran cotizaciones aprobadas. El reloj se consulta después de adquirir el bloqueo. Savepoints conservan expiraciones aunque falle el comando comercial.

`npm run typecheck` y `npm run build`. Para integración, configurar `TEST_DATABASE_URL` apuntando a otra base cuyo nombre contenga `test`, y ejecutar `npm test`. Sin variable, las pruebas se omiten: no confundir eso con verificación real. Cada suite crea y elimina solo un esquema aleatorio propio. Las pruebas no necesitan credenciales de otras aplicaciones.

Incluye concurrencia, permisos, expiración, firmas, reintentos, revisión de pagos y migración sobre datos anteriores. PostgreSQL temporal de pruebas separado de bases reales. Consultar HANDOFF para evidencia de la última ejecución.

## Pendiente

Reembolsos/devoluciones, pasarela real, emisión tributaria, administración completa de cuentas, tienda/panel visual y cierre operativo de producción. No se calcula desglose fiscal ni se presenta un comprobante interno como boleta. Antes de producción: secretos, roles DB separados, TLS, límites IP, backups/restauración, supervisión de tareas, monitoreo, pruebas de carga y revisión de seguridad. Ver ROADMAP.

## Licencias firmadas (4C2B)

Identidad persistente, firma/verificación Ed25519 e importación mediante CLI del operador. Historial inmutable, protección contra retroceso de revisión y consultas OWNER en /api/licenses y /api/licenses/history. Aplicar db/009-license-imports.sql. Consulta [docs/LICENSES.md](docs/LICENSES.md) para claves, configuración y límites. Sin restricciones operativas.



## Permisos de despliegue (6A1)

Guía en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). db:migrate exige conexión de migración; company:create exige conexión de operador. db:permissions aplica un perfil explícito a roles existentes y un esquema exclusivo de Nexo, separando operaciones, registro comercial/licencias y propiedad del esquema. Reaplicar después de migraciones. No hay provisionamiento ni credenciales de producción creadas.


## Diagnóstico previo (6A2)

Ejecutar npm run doctor en entorno runtime, o npm run doctor -- --maintenance en entorno privado con las tres conexiones. Solo lectura, JSON y salida distinta de cero ante incidencias. No carga .env automáticamente. Alcance y límites en docs/DEPLOYMENT.md; no constituye autorización de producción.


## Respaldos y recuperación (6B1)

Herramientas npm run backup -- create ARCHIVO y npm run backup -- restore-test ARCHIVO. Conexiones explícitas de respaldo y restauración; esta última solo acepta una base exclusiva vacía terminada en _restore_test. Guía y límites en [docs/BACKUPS.md](docs/BACKUPS.md). No hay tareas programadas ni cifrado automático.


## Paquete de ejecución (6C1)

Ejecutar npm run release para generar la web standalone y el worker compilado con manifiesto de integridad. Arranque: node server.js y node worker/scripts/expire-orders.js --watch, en procesos separados. Guía en [docs/RELEASES.md](docs/RELEASES.md). El paquete no configura PostgreSQL, secretos ni servicios del servidor.


## Panel operativo (5A2)

Abrir /panel para ingresar con empresa, correo y contraseña del equipo. Consulta stock, historial, entradas, ajustes y transferencias; respeta ubicaciones asignadas. Guía en [docs/PANEL.md](docs/PANEL.md). Incluye altas/edición de productos y ubicaciones, con permisos por rol. La pantalla de ventas con pedido queda pendiente.




## Inicio e identidad (5A3)

Inicio público en /, catálogo sin cuenta en /tienda y configuración inicial local en /configurar. Al actualizar, reiniciar npm run dev para habilitar el asistente si la base está vacía. Identidad azul profundo/turquesa y pie Impulsado con tecnología Nexo. Contrato y límites en [docs/IDENTITY.md](docs/IDENTITY.md). Configuración inicial pública bloqueada en producción.


## Ventas y pedidos desde el panel (5B1)

Nueva venta registra venta local cobrada y entregada, con carrito multilínea y reintento idempotente. Pedidos y ventas permite consultar detalle/posventa, registrar pagos recibidos, cancelar reservas y confirmar entrega/despacho. Guía y límites en [docs/PANEL-SALES.md](docs/PANEL-SALES.md). Usuarios, cotizaciones, posventa editable y reportes siguen pendientes.



## Versión 0.19: operación empresarial y compra local

Posventa operativa (dinero y stock separados), reportes por sucursal/fechas de Chile, alertas de stock bajo, resolución de capturas simuladas, imágenes de producto en PostgreSQL, carrito y checkout de retiro/envío cotizado, registro/verificación/recuperación y cambio de contraseña. La tienda aplica nombre, contacto, color y logotipo de empresa. Guía: [Funciones 0.19](docs/FUNCIONES-019.md). Reiniciar npm run dev para habilitar simulador y correo cifrado local; jamás son proveedores de producción.
