# Despacho de envíos

Pestaña **Envíos → Despachos** del panel (OWNER y AGENT de la ubicación de origen). Solo trata pedidos online con envío a domicilio ya pagados; los pedidos sin pagar siguen en Pedidos y no aparecen aquí.

## Etapas

| Etapa | Cómo se llega | Qué ocurre |
|---|---|---|
| Por preparar | Pedido `PAID` sin ficha de despacho | Está pagado y el stock ya se descontó al pagar. |
| En preparación | **Empezar a preparar** | Se crea la ficha (`shipments`, estado `PREPARING`). El pedido sigue `PAID`. |
| Despachado | **Registrar despacho** (transportista, seguimiento y fecha estimada opcionales) | La ficha pasa a `DISPATCHED` y el pedido a `FULFILLED` en la misma transacción. |
| Entregado | **Confirmar entrega** | La ficha pasa a `DELIVERED`. Es un registro manual del equipo; no hay integración con transportistas. |

Se puede despachar directamente desde "Por preparar": la ficha se crea y se despacha en un solo paso. Los datos de un despacho se pueden corregir mientras no figure entregado; cada corrección queda en el historial. Reparto propio no necesita número de seguimiento.

Los pedidos despachados antes de esta función no tienen ficha: se listan como despachados "sin datos del transportista".

## Reglas

- Preparar y despachar usan las mismas reglas de posventa que `fulfill`: un reembolso aplicado o un retiro de stock registrado bloquean el pedido (`REFUNDED_ORDER`, `WITHDRAWN_ORDER`). El tablero lo marca como "Posventa pendiente".
- Preparar, despachar y entregar no mueven stock. Todas las acciones son idempotentes: repetirlas con los mismos datos devuelve el estado actual (`replayed: true`); repetir el despacho con otros datos responde `SHIPMENT_CONFLICT`.
- Un pedido pagado hace más de 24 horas sin despachar se marca como atrasado y aparece primero.
- El AGENT solo ve y opera pedidos de sus ubicaciones asignadas.
- PostgreSQL impide fichas para pedidos sin pagar o que no son envíos, borrar fichas, saltar etapas y modificar una ficha entregada.

## API

- `GET /api/dispatches?stage=all|prepare|preparing|dispatched|delivered&q=...&limit=&offset=`: devuelve `items`, `counts` por etapa (de todo el alcance, no de la página) y `late`.
- `POST /api/orders/{id}/shipment/prepare`
- `POST /api/orders/{id}/shipment/dispatch`: `{ "carrier": "Chilexpress", "trackingCode": "CX-123", "estimatedDelivery": "2026-11-27" }`; solo `carrier` es obligatorio.
- `PATCH /api/orders/{id}/shipment`: mismos campos, para corregir un despacho.
- `POST /api/orders/{id}/shipment/deliver`
- `GET /api/orders/{id}` incluye `shipment`. El cliente ve estado, transportista, seguimiento y fecha estimada en su pedido.

`POST /api/orders/{id}/fulfill` sigue funcionando para pedidos con envío, pero no crea ficha: para despachar usa el flujo de arriba.

Migración `db/021-shipments.sql`. Pruebas: `tests/dispatch.test.ts` (requieren `TEST_DATABASE_URL` con "test" en el nombre).

## Plazo de entrega por comuna

Cada tarifa (Envíos → Tarifas y cobertura) puede tener un plazo opcional en **días hábiles** (mínimo y máximo, 0 a 60; lunes a viernes, sin feriados). Con plazo, la tienda muestra "Llega entre el mié 25 nov y el vie 27 nov" en el resumen del carrito, en la revisión del pedido, en la confirmación y en el detalle; sin plazo no promete fecha. La cuenta parte desde hoy si el pedido no está pagado y desde la fecha de pago después. Si el equipo registra una fecha estimada al despachar, esa reemplaza a la ventana.

El pedido guarda una copia del plazo vigente al comprar (`orders.delivery_days_min/max`), así que cambiar la tarifa después no altera lo prometido. Migración `db/022-delivery-days.sql`; la API de tarifas acepta `deliveryDaysMin` y `deliveryDaysMax` (ambos o ninguno).

## Compra del cliente

El carrito se conserva hasta que el pago se confirma: si el cliente cancela la reserva o esta vence, no pierde sus productos. Repetir "Revisar pedido" con el mismo carrito reabre el pedido pendiente en vez de reservar el stock otra vez; con un carrito distinto, la reserva anterior se cancela. Mis compras muestra la etapa del envío de cada pedido (`shipment_status` en `GET /api/orders`).
