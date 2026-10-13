# Ventas y pedidos empresariales · 5B1

Entrar al panel con OWNER o AGENT. Nuevas secciones **Nueva venta** y **Pedidos y ventas**, también accesibles mediante ?seccion=sales/orders. El servidor conserva el aislamiento de empresa y ubicaciones asignadas. CUSTOMER no recibe estas pantallas.

## Venta local

Seleccionar productos activos del grupo del catálogo, agregar cantidades y elegir una sucursal STORE activa asignada. Repetir un producto agrupa unidades; quitar una línea permite corregirla. Hasta50 productos y un millón de unidades por producto, sujeto a stock y límites del servidor. No se usa el movimiento básico SALE ni se registra otro movimiento después de vender.

El total mostrado es estimado con precios cargados, calculado con enteros BigInt. Actualizar precios y stock actualiza las líneas que pertenezcan al grupo cargado; líneas de otros grupos conservan su última información hasta volver a cargarlas. El servidor resuelve precios/stock y exige que el importe aplicado coincida con su total. Si cambia el total estimado, se desmarca la confirmación. El importe aplicado es el total de la venta, no el efectivo entregado antes de dar vuelto. Gestión de vuelto/caja no incluida.

Registrar solo después de recibir pago y entregar productos: método CASH/CARD/TRANSFER, referencia y confirmación explícita. La API crea pedido LOCAL, registra pago, descuenta stock y completa entrega en una transacción. No cobra tarjeta/transferencia ni emite documento tributario.

El envío usa Idempotency-Key. Si se pierde la respuesta sin estado HTTP, se congelan los campos y aparece Reintentar comprobación de venta: vuelve a usar exactamente el documento y clave anteriores. El componente conserva esta operación al cambiar entre secciones del panel, pero no tras recargar/cerrar sesión/pestaña. En esos casos consultar Pedidos y ventas antes de repetir una venta incierta. No hay cola offline ni borrador persistente. Un rechazo HTTP permite corregir datos. El servidor sigue impidiendo sobreventa y duplicación por clave/referencia.

## Pedidos y ventas

Lista paginada de25 registros, con fecha, origen, ubicación, estado y total. Detalle con productos, precios capturados, flete, referencia de pago e historial de eventos. Posventa se consulta aparte: muestra reembolso parcial/completo y retiro, sin reescribir el estado histórico.

Reservado: registrar pago manual recibido con importe/referencia y confirmación, o cancelar con motivo para liberar unidades. Pagado: marcar entregado/despachado con confirmación, siempre que la consulta de posventa esté disponible y no haya reembolso/retiro. Las reglas finales, vencimiento y permisos se vuelven a validar en el servidor. Si una acción se registra pero falla refrescar, la pantalla lo informa y pide actualizar antes de repetir.

No crea pedidos online desde una cuenta de personal: el checkout requiere CUSTOMER según el backend existente. Reembolsos/devoluciones, cotizaciones de despacho, boletas, conciliación y administración de usuarios todavía necesitan sus propias pantallas. No presentar este bloque como toda la operación comercial terminada.

## Verificación

175 pruebas de backend aprobadas, tipos y compilación correctos. Contratos HTTP comprobados en base temporal: venta completada, reintento mismoID sin otro descuento, reserva/pago/entrega, cancelación sin descontar físico, listado y posventa. No se modificó nexo_dev ni la empresa de demostración del usuario. La revisión visual interactiva sigue pendiente por el bloqueo previo de la herramienta de navegador.
