# Posventa · etapa 3B

Dinero y mercadería tienen registros independientes. No hay pasarela real. Reembolsar nunca repone stock; recibir mercadería nunca registra un reembolso. Todo comando escribe auditoría y usa el mismo bloqueo por empresa que pagos, reservas y movimientos. Registros financieros, resoluciones, recepciones y líneas son inmutables.

## Reembolsos

Solo OWNER. POST con `Idempotency-Key` de 8–128 caracteres seguros. Repetir la misma clave y datos devuelve el registro; cambiar datos produce 409. La referencia manual no puede repetirse en una empresa.

- `/api/payments/captures/{id}/refunds`: `{ "amountMinor":"5000", "reason":"Reembolso acordado" }`. Se reembolsa la captura simulada identificada, usando SU moneda y máximo SU monto, no el total del pedido. El simulador genera referencia y exige estar habilitado con secreto de empresa; bloqueado en producción. Este registro simula una devolución exitosa, sin interacción bancaria. Admite pagos aplicados y capturas REVIEW, incluidos pagos adicionales o tardíos.
- `/api/orders/{id}/refunds`: `{ "amountMinor":"5000", "reference":"TRANSFERENCIA-123", "reason":"Reembolso realizado" }`. Solo para pago fuente MANUAL y pedido PAID/FULFILLED. Registra una devolución de dinero **ya efectuada fuera de Nexo**. No ejecuta transferencia, reversa tarjeta ni valida un comprobante bancario. El administrador responde por la referencia. Incluye flete en el máximo, sin cálculo automático de política comercial.

Montos positivos como strings. Reembolsos parciales permitidos; suma nunca superior a captura/pago, incluso con solicitudes simultáneas. No hay conversión de moneda. Los triggers verifican balance, moneda y relación captura/pedido además del servidor.

## Resolver capturas REVIEW

La captura original conserva disposition REVIEW y su motivo histórico. `GET /api/payments/captures` agrega `refunded_minor`, `resolution` y `resolved_at`; resolución NULL significa pendiente.

- Reembolso parcial: permanece pendiente.
- Reembolso completo: crea automáticamente una resolución REFUNDED y evento de auditoría en la misma transacción.
- Captura cero: OWNER puede POST `/api/payments/captures/{id}/resolve` con `{ "reason":"No se recibieron fondos" }`; deja NO_FUNDS. Repetir motivo es idempotente.
- No existe un botón para descartar dinero ni aplicar capturas tardías a stock vendido. Una captura con fondos necesita reembolso completo para cerrarse. PostgreSQL exige evidencia del resultado financiero.

El estado del intento SUCCEEDED/REVIEW conserva la historia de cobro; no representa saldo ni resolución. Una confirmación duplicada posterior no deshace reembolsos ni vuelve a descontar stock.

## Recepción de devoluciones

POST `/api/orders/{id}/returns`, con `Idempotency-Key`:

```json
{
  "locationId":"UUID-UBICACION",
  "reason":"Recepción e inspección verificadas",
  "items":[{"productId":"UUID-PRODUCTO","restockQuantity":1,"damagedQuantity":1}]
}
```

Solo OWNER o AGENT autorizado tanto para el pedido de origen como para el lugar de recepción activo. CUSTOMER consulta, no recibe stock. Admite pedidos FULFILLED (entregados o despachados), productos vendidos aunque estén inactivos, recepción parcial y varias recepciones hasta la cantidad vendida. Cada línea separa unidades aptas de dañadas. No admite duplicar producto en el payload. Límites acumulados también protegidos en PostgreSQL.

Unidades aptas suman físico en el lugar de recepción con operación RETURN y movimientos auditados. No modifican reservas. Unidades dañadas quedan en la recepción como mercadería no vendible, sin aumentar el catálogo. Si todas están dañadas, no se inventa un movimiento de cantidad cero. El sistema aún no gestiona reparación, descarte ni reincorporación posterior de esas unidades: no contarlas manualmente como una nueva devolución del mismo pedido.

## Pedido pagado aún sin entregar

No usar una devolución ficticia. Después de registrar **reembolso completo del pago aplicado**, POST `/api/orders/{id}/withdrawal` con el mismo formato: todo el carrito, restockQuantity igual a cada cantidad vendida, damagedQuantity cero y ubicación original. Restaura stock una sola vez y registra recepción tipo WITHDRAWAL. Reembolso y reversión siguen siendo dos acciones deliberadas: un fallo en la segunda no borra la evidencia del dinero devuelto. Se puede reintentar con la misma clave.

Un reembolso parcial o total del pago aplicado bloquea el primer despacho/entrega. Para cerrar un pedido aún no entregado, completar reembolso y reversión. Reembolsar una captura adicional REVIEW no bloquea entrega de una compra cuyo pago aplicado sigue íntegro. Repetir una entrega FULFILLED devuelve la confirmación histórica; no es una nueva entrega.

## Consulta e historial

`GET /api/orders/{id}/aftersales`: datos del pedido autorizado, `orderPaymentRefundedMinor`, `refundState` NONE/PARTIAL/FULL, `withdrawn`, reembolsos y recepciones. El saldo suma solo reembolsos del pago manual/aplicado, excluye pagos extra REVIEW. CUSTOMER ve reembolsos de su compra y recepciones; excepciones financieras REVIEW se muestran al personal.

El pedido conserva PAID/FULFILLED y sus importes originales como historia comercial. La situación de posventa se obtiene de este endpoint; no interpretar PAID como saldo actual. No sumar monedas distintas del listado de capturas. No generar boletas ni notas de crédito con estos recibos internos.

Pendientes: solicitudes de devolución del cliente, logística inversa, reparación/garantía, reemplazos, reanudar compra parcialmente reembolsada, conciliación bancaria, reembolso real asíncrono y documentos tributarios. Para proveedor real harán falta estados solicitados/pendientes/fallidos y confirmación firmada; no reutilizar el éxito inmediato del simulador.
