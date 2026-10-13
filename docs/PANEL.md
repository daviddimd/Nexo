# Panel operativo · 5A2

Abrir /panel, o usar el enlace de la página inicial. Ingresar identificador de empresa, correo y contraseña de una cuenta OWNER/AGENT creada previamente. CUSTOMER puede iniciar sesión pero recibe un aviso de que el panel requiere personal. No hay cuentas de muestra en producción ni contraseña almacenada en localStorage. Se usa la cookie HttpOnly de la API.

Permite consultar físico, reservado y disponible por ubicación, ingresar unidades, ajustar una diferencia con signo y transferir entre ubicaciones habilitadas. Motivo obligatorio, cantidades enteras. El backend vuelve a comprobar empresa, permisos, stock comprometido y estado de producto/ubicación. El agente solo ve ubicaciones asignadas. Incluye altas y edición de productos y ubicaciones en las secciones correspondientes; la administración de cuentas está disponible para propietarios en Equipo y accesos. Tampoco registra ventas básicas SALE; las ventas con pedido requieren su propio flujo.

Existencias e historial comparten navegación de páginas de 50 registros, cada consulta ordenada por el servidor. Los productos del selector se cargan en grupos de 100, con botones para recorrerlos; cambiar de grupo reinicia la selección. Solo aparecen productos y ubicaciones activos en el formulario. La tabla de existencias es una matriz: una fila por producto y una columna por ubicación autorizada, con disponible y reservas. La API inventory/matrix pagina por productos completos (50), incluyendo ubicaciones sin stock como cero; conserva inventory para consumidores existentes.

Los movimientos usan Idempotency-Key. Mientras se mantiene la página, reintentar exactamente los mismos datos después de un error reutiliza la clave; al confirmar, se limpia el formulario y se actualizan tablas. Si falla solo la actualización de tablas, se indica que el movimiento ya fue registrado. Tras una recarga o cierre de pestaña se pierde la clave: comprobar el historial antes de repetir una operación cuyo resultado no se conozca. No se guardan borradores ni una cola offline. El panel no reemplaza reservas por un descuento manual para vender.

Cerrar sesión revoca la sesión actual en PostgreSQL y elimina su cookie; otras sesiones del usuario permanecen. Una respuesta 401 en consultas/operaciones limpia los datos del panel y vuelve al acceso. El servidor sigue siendo quien autoriza; ocultar controles no constituye el control de permisos.

Plantilla sencilla responsive con tablas desplazables, labels, foco visible y mensajes de estado. Marca/personalización avanzada y diseño final pendientes. Probado manualmente en navegador con una empresa descartable de nexo_test: entrada10+2, transferencia3 hacia web y ajuste-2 en sucursal, saldo final7 sucursal/3web; historial y cierre de sesión comprobados. No se configuró una base permanente ni se dejó el servicio iniciado.

## Catálogo y ubicaciones (5A2)

El panel se divide en Inventario, Productos y Ubicaciones. OWNER y AGENT pueden crear/editar productos compartidos de su empresa: SKU, nombre, precio CLP entero, descripción, URL HTTPS de imagen y estado activo al editar. No se implementa carga de archivos ni categorías. Las listas muestran también inactivos, pero el selector de movimientos solo activos. Precios y reglas se validan en el servidor.

OWNER crea sucursales o stock web, edita nombre, envío desde sucursal y estado. El tipo queda fijado al crear; la API permite un único origen WEB por empresa. AGENT solo puede cambiar envío en las sucursales activas asignadas, sin renombrar, crear o desactivar ubicaciones. Para WEB no se muestra control de envío de tienda: es el origen web, con su política existente de selección de stock.

Crear un producto o ubicación no ingresa unidades: usar una entrada de inventario después. Desactivar conserva datos e historial; la API bloquea desactivación si existen reservas. Los formularios conservan datos ante error y deshabilitan acciones mientras guardan. Los borradores no se conservan al cambiar sección o cerrar la página. Las altas de catálogo/ubicaciones no tienen idempotencia de API; después de un corte de conexión comprobar el listado antes de repetirlas.

La versión5A2 pasó tipos, compilación,168pruebas y comprobaciones API con datos temporales: creación/edición producto, precio, desactivación, SKUduplicado409, alta/ediciónsucursal y permisosAGENT403/200. La revisión interactiva de5A2 quedó pendiente porque la herramienta de navegador bloqueó la apertura; no se eludió ese bloqueo ni se reutilizó la captura5A1 como prueba nueva.


## Equipo y accesos

Sección exclusiva de OWNER. Lista cuentas en páginas de 25 con nombre, correo, rol, estado y ubicaciones. Permite crear agentes con contraseña inicial confirmada (mínimo 12 caracteres), editar nombre/correo/estado y asignaciones de agentes, y restablecer contraseñas de otras cuentas con motivo obligatorio. La pantalla no envía correos. No cambia roles ni convierte clientes en personal; las protecciones del último propietario permanecen en el backend. La edición propia se limita al nombre para conservar la sesión actual.

Los formularios y detalles de productos, ubicaciones, pedidos y cuentas aparecen en ventanas nativas dialog, con foco contenido, fondo bloqueado y cierre por botón, Escape o clic exterior. Mientras se guarda no se permite cerrar. Los errores mantienen el formulario; ante respuesta desconocida de una operación de cuentas, se bloquea reenvío y se indica cerrar y actualizar antes de repetir. No se guardan borradores al cerrar.

Verificación del bloque: typecheck y build aislada .next-team-check correctas; API local comprobada con PrismaByte: propietario ve 10 cuentas/6 agentes, cada agente con una asignación; AGENT recibe 403 al consultar users. No se modificaron cuentas reales como prueba ni se realizó revisión interactiva del navegador.


## Inicio separado del acceso

La portada / es pública y ya no incluye tarjetas de herramientas. Si existe una sesión válida, redirige en servidor a /inicio. /inicio exige autenticación, muestra empresa y nombre de usuario y centraliza Inventario, Productos y Ubicaciones, junto con ventas/pedidos y Equipo solo OWNER. Clientes son dirigidos al catálogo de su empresa. No se usa el identificador de una URL para elegir la empresa autenticada.

/panel sin seccion sirve como acceso; si ya hay sesión de equipo, redirige a Inicio. Después del login exitoso se navega a /inicio. Los accesos de herramientas usan /panel?seccion=... y el logo vuelve a Inicio mediante /. Cerrar sesión desde Inicio revoca su token y vuelve a la portada. Cookies vencidas o inválidas se tratan como ausencia de sesión; errores de base de datos no se ocultan como una desconexión del usuario.

Verificado HTTP: portada anónima sin tarjetas, /inicio anónimo307 a /panel, raíz autenticada307 a /inicio, inicio200 con empresa/herramientas y sin invitación a login, tras logout /inicio307; tipos y compilación aislada correctos.


## Configuración de empresa completada

CompanyManager, accesible en navegación OWNER y desde Inicio con seccion=settings. Tres apartados/modal: datos nombre/contactEmail/contactPhone/about con motivo; identidad primaryColor/logoUrl HTTPS nullable con motivo; plazo reservas1–60 minutos. Guarda cada apartado mediante su API existente (sin guardado parcial entre endpoints). Datos se conservan ante errores; respuesta desconocida bloquea reenvío hasta cerrar y actualizar. Identidad se almacena para personalización de la tienda; el panel conserva marca Nexo, tienda visual aún no aplica logo/color. No subida de archivos. reservation_minutes añadido solo al GET privado companySettings; publicSettings sigue sin exponerlo. El plazo afecta nuevos pedidos, no vencimientos existentes.

Typecheck/build aislada .next-team-check correctas; 16 pruebas accounts.test.ts pasan, incluida lectura15->37 y permisos OWNER, aislamiento público. Primer arranque PG temporal falló restrictedtokenWindows, se inició con escalación y pruebas pasaron; PostgreSQLtemporal55439 detenido después. Base local usuario55440 no alterada. Sin revisión interactiva del navegador. Siguiente bloque: cotizaciones de envío en panel, después posventa/reportes.


## Cotizaciones de envío en panel

ShippingManager accesible desde Inicio y navegación con seccion=shipping, para OWNER/AGENT según ubicaciones asignadas. Lista25 con origen, estado, costo y vencimiento, sin direcciones en listado. Ver abre modal con destinatario/dirección/teléfono, productos y montos; REQUESTED permite aprobar con shippingMinor CLP y nota, o rechazar con motivo. Aprobación30min, no reserva ni cobro; solo checkout reserva. priced_items aprobado se prioriza sobre precios actuales para no alterar importes históricos. Backend result agrega itemDetails con nombres/SKU/precios actuales, preservando items original y permisos/contratos. Respuesta desconocida congela formularios; reintentar comprobación usa mismo id/action/body, replay existente del backend. Actualizar detalle permite conocer estado antes de nuevas decisiones.

14 pruebas checkout.test.ts pass, incluyendo comprobación nueva de detalleactual24000 vs snapshotaprobado20000; permisos por empresa/asignación, noreserva al aprobar, stock vendido durantecotización rechaza checkout. Typecheck ya pasó y build aislada .next-team-check correcta. No se crearon cotizaciones artificiales en PrismaByte; listado vacío hasta solicitudescliente porAPI (checkoutvisual siguependiente). No navegadorinteractivo. PGtemporal55439 detenido, usuario3000/55440 conservados. Siguiente bloque empresarial: posventa (devoluciones físicas y reembolsos separados) y reportes.
