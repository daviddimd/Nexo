# Compra, envío automático y cuenta de cliente

## Recorrido de compra

1. Explorar la tienda sin cuenta y agregar productos al carrito.
2. Iniciar sesión o crear una cuenta desde el carrito. Ambos formularios comparten el mismo panel, con URLs directas: `/tienda/iniciar-sesion?empresa=...` y `/tienda/crear-cuenta?empresa=...`. La navegación comparte el proveedor del carrito de `/tienda`, de modo que no se pierde al cambiar entre estas páginas. Al acceder se vuelve al catálogo o ficha de origen, y se reabre el carrito cuando corresponde. El retorno solo admite rutas de esta misma tienda. Con `npm run dev`, el registro inicia sesión automáticamente sin pedir código. Este acceso requiere NODE_ENV=development, NEXO_LOCAL_SETUP_ENABLED=true y NEXO_LOCAL_CUSTOMER_ACCESS=true, definidos por el arranque local. No marca el correo como verificado: fuera de este modo se mantiene la verificación. Las cuentas que ya quedaron pendientes pueden iniciar sesión con su contraseña en el entorno local y retomar el carrito.
3. Elegir retiro o envío. Para envío, seleccionar ciudad/comuna y región del listado y completar la dirección.
4. El servidor calcula mercadería, costo fijo de envío y total, y comprueba que alguna ubicación habilitada pueda completar el carrito.
5. Al confirmar, el servidor vuelve a comprobar precio, tarifa, cobertura, dirección y stock. Un cambio de total exige actualizar el resumen; no acepta precios enviados por el navegador. El pedido reserva stock y muestra su detalle para pagar.
6. Registrar el pago ficticio mediante transferencia o una tarjeta ficticia guardada. No hay contacto con redes de pago ni cargos reales.
7. El equipo registra el despacho en Nexo → Envíos. Despachado no significa entregado por un transportista.

## Tarifas por empresa

El propietario configura destinos en Configuración → Envíos y cobertura o Envíos → Tarifas y cobertura. Cada tarifa contiene ciudad/comuna, región, importe CLP y estado. Un destino inactivo o ausente no tiene envío disponible. Se permite tarifa cero.

El origen sigue siendo bodega web y, si no puede completar el carrito, una tienda habilitada para envío. El costo y la dirección quedan fijados en el pedido; editar tarifas no cambia compras existentes.

Las cotizaciones históricas se conservan para compatibilidad. La tienda no crea nuevas cotizaciones en el recorrido de compra; el panel muestra despachos, no una bandeja de aprobación de envíos.

## Mi cuenta

- Información personal: nombre, correo de lectura y teléfono.
- Mis direcciones: hasta veinte direcciones con nombre, edición, borrado y una predeterminada. El carrito permite elegir cualquiera de ellas; se mantiene la compatibilidad con la dirección guardada anterior.
- Métodos de pago: preferencia de tarjeta o transferencia y hasta ocho tarjetas ficticias.
- Mis pedidos: acceso al historial persistente de la cuenta; el historial completo conserva paginación.
- Seguridad: cambio de contraseña mediante la verificación existente.

Las cuentas y sus compras se aíslan por usuario y empresa. Los clientes no pueden usar tarjetas o pedidos ajenos.

## Tarjetas y pagos locales

La marca se reconoce por prefijos Visa, Mastercard y American Express; otros prefijos se muestran como Tarjeta. No se aplica validación bancaria ni de Luhn. Se aceptan números ficticios de 12 a 19 dígitos. Ejemplos para probar:

- Visa: 4000000000000010
- Mastercard: 5100000000000022

El formulario recibe titular, número, mes/año de vencimiento y CVV. Comprueba formato, vencimiento y código de 4 dígitos para American Express o 3 para Visa/Mastercard. No valida el número con bancos ni con Luhn. Se persisten etiqueta, marca, seis dígitos iniciales, últimos cuatro, titular y vencimiento. No se persiste el número completo ni el CVV. El listado no entrega titular ni vencimiento; se consultan mediante POST con la contraseña actual. La consulta limita intentos por cuenta y devuelve Cache-Control: no-store. La interfaz los oculta después de 30 segundos, al cambiar de pestaña o al salir de la sección. El número continúa enmascarado. Las tarjetas anteriores sin esos datos se conservan y se pueden volver a añadir para completarlos. Quitar una tarjeta la desactiva; no borra la identificación de pagos anteriores. El recibo de selección se conserva de forma inmutable. Reintentos con el mismo intento y tarjeta no duplican el pago o el descuento de stock; cambiar el método de un intento ya seleccionado produce conflicto.

Estos endpoints solo funcionan fuera de producción con `NEXO_SIMULATOR_ENABLED=true`. No equivalen a una integración con una pasarela ni permiten guardar o cobrar tarjetas reales.

## API

- GET /api/public/:empresa/shipping-rates
- POST /api/public/:empresa/shipping-estimate: rateId e items. No reserva ni crea cotizaciones.
- POST /api/orders: fulfillment SHIP, shippingRateId, address, expectedTotalMinor e items. El camino de retiro sigue usando locationId.
- GET/PATCH /api/customer/profile: datos de la cuenta autenticada y libreta de direcciones. PATCH admite cambios parciales sin reemplazar la libreta.
- POST /api/customer/addresses; PATCH/DELETE /api/customer/addresses/:id: direcciones propias, con etiqueta y opción predeterminada.
- GET/POST /api/customer/test-cards; PATCH /api/customer/test-cards/:id para quitar.
- POST /api/customer/test-cards/:id/reveal: contraseña actual para consultar temporalmente titular y vencimiento.
- POST /api/payments/intents/:id/simulate: method CARD con cardId, o method TRANSFER.
- GET/POST /api/settings/shipping-rates; PATCH /api/settings/shipping-rates/:id. Solo OWNER.
- GET /api/orders?fulfillment=SHIP: despachos dentro de las ubicaciones autorizadas.

Las rutas de pago existentes no cambian a un proveedor real. Un perfil almacena la preferencia; el método concreto queda asociado al intento y visible en el detalle del pedido.

## Migraciones y datos locales

012 agrega tarifas, perfiles y referencia a la tarifa en el pedido. 013 agrega identificadores de tarjetas ficticias y recibos de selección del método. 014 añade la libreta de direcciones y metadatos de tarjetas; convierte la dirección existente en «Principal» sin inventar titular ni vencimiento para tarjetas antiguas. No reescriben migraciones anteriores ni pedidos históricos. Reaplicar el perfil de permisos de base de datos después de migrar entornos con roles separados.

El comando `node --import tsx scripts/seed-store-checkout.ts --apply` prepara únicamente la instalación local existente de PrismaByte, crea un respaldo antes de migrar y agrega siete destinos y tarjetas ficticias a tres clientes existentes. Solo se ejecuta una vez; no elimina catálogo ni pedidos. Las tarifas iniciales de 2990, 3990 y 4990 CLP son editables y no representan precios de un transportista contratado.

Una instalación nueva usa `npm run dev`, aplica las migraciones y configura sus propios destinos desde el panel.

## Verificación

`tests/direct-checkout.test.ts` cubre cálculo sin reservas, cobertura y permisos, creación sin cotización, idempotencia, snapshot, cambios de total, dirección incompatible, stock insuficiente, origen tienda, perfiles privados, persistencia enmascarada, pagos repetidos, despacho, historial y recorrido HTTP. Las pruebas requieren TEST_DATABASE_URL separado de la base de desarrollo. El resto de la suite conserva los contratos de cotizaciones históricas.

Las pruebas customer-wallet.test.ts verifican múltiples direcciones, predeterminadas y privacidad entre cuentas/empresas, validación de tarjetas, ausencia de número completo y CVV en almacenamiento, revelado con contraseña, límites de intentos y las rutas HTTP de edición y borrado.
