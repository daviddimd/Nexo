# Etapas de Nexo

Cada etapa debe cerrar con pruebas y un estado documentado; no iniciar la siguiente si corresponde pausar.

1. **Inventario base (terminada):** empresas, usuarios iniciales, sesiones, productos, ubicaciones, movimientos y transferencias.
2. **Pedidos y reservas (terminada):** carrito validado, precios capturados, reserva configurable, cancelación/vencimiento, un origen por pedido, retiro y envío, venta local multilínea, registro manual de pago y entrega/despacho.
3. **Pagos y cumplimiento, dividido en bloques:**
   - **3A (terminada):** cotización de despacho antes del pago, dirección, precios/flete capturados, simulador firmado por empresa, confirmación idempotente y registro de capturas para revisión. Sin dinero real.
   - **3B (terminada):** resolución auditada de capturas, reembolsos simulados, registro de reembolsos manuales externos, recepción de unidades aptas/dañadas y reversión antes de entrega tras reembolso completo. Dinero y stock separados, límites acumulados e idempotencia.
   - **3C (pendiente de proveedor):** elegir pasarela y proveedor tributario, integrar APIs/webhooks reales y entornos de prueba, reconciliación/reembolsos y emisión tributaria. Nunca presentar comprobante interno como boleta fiscal.
4. **Operación de empresas, por bloques:**
   - **4A (terminada):** usuarios/roles/asignaciones, protección último administrador, revocación de sesiones, cambio/reset administrativo de contraseña, identidad pública configurable y auditoría administrativa.
   - **4B1 (terminada):** registro CUSTOMER, verificación/recuperación por tokens, límites persistentes, correo local cifrado sin envío real y CLI de pruebas; bloqueado en producción.
   - **4B2 (terminada):** invitaciones de personal con permisos fijados, expiración, revocación y aceptación segura; correo local. Transporte real requiere infraestructura/remitente antes de enviar mensajes reales.
   - **4C1 (terminada):** registro comercial de suscripción/licencia permanente, plazos independientes, revisiones de operador y alta atómica. Sin cobros ni bloqueo operativo.
   - **4C2A (terminada):** identidad persistente y firma/verificación offline Ed25519, vínculo empresa/instalación y CLI. Sin restricciones operativas.
   - **4C2B (terminada):** importación de licencias en historial inmutable, vínculo con condiciones comerciales, protección contra retroceso y consultas OWNER. Planes/capacidades y política explícita de vencimientos pendientes; cobros automáticos requieren proveedor.
5. **Tienda y panel:** React con plantilla común, personalización limitada y Powered by Nexo. Reportes, imágenes, categorías, promociones. Backend primero.
6. **Producción:** despliegue reproducible, roles de migración y ejecución separados, TLS, límites por IP, gestión de secretos, tareas de vencimiento/limpieza, backups y prueba de restauración, monitoreo, pruebas de carga y revisión de seguridad.

## Decisiones que faltan

- Pasarela real y proveedor tributario. El usuario eligió simulador por ahora.
- Un origen por pedido se conserva. El usuario eligió cotización previa al pago; se implementó flete manual aprobado, sin envío dividido ni tarifas automáticas.
- Reservas de 15 minutos configurables. Las confirmaciones simuladas tardías se registran para revisión sin descuento y se cierran con reembolso simulado auditado; falta conectar pasarela real. La cotización aprobada dura 30 minutos y no reserva stock.
- Quién paga y administra infraestructura de cada instalación permanente.
- Hosting SaaS, dominio e infraestructura de imágenes/correos.
- Auditoría y permisos finos para precios, ajustes y altas de producto.



## Preparación de producción por bloques

- 6A1 (terminada): perfil SQL para migración, operador y runtime; CLI administrativos sin fallback, probado con roles temporales restringidos. Guía de despliegue. No provisiona infraestructura.
- 6A2 (terminada): diagnóstico manual de configuración y permisos efectivos, solo lectura. No es un gate automático de arranque ni una revisión completa de producción.
- Backups/restauración, empaquetado reproducible, HTTPS, correo real, monitoreo y carga pendientes.



- 6B1 (terminada): respaldo de esquema PostgreSQL custom y ensayo de restauración transaccional en base exclusiva vacía; conservación de datos y ledger comprobada. Retención, cifrado, scheduling, copia externa y PITR pendientes.

- 6C1 (terminada): paquete Next standalone y worker compilado, manifiesto de integridad y guía de arranque; probado en Windows. Supervisión de servicios y validación Linux/Docker pendientes.

- 5A1 (terminada): primer panel funcional /panel con acceso, existencias, historial y entrada/ajuste/transferencia. Plantilla común sin personalización final. Próximo 5A2: altas y edición de productos y sucursales mediante panel.

- 5A2 (terminada): crear/editar productos y ubicaciones desde panel; política de envíos de tienda para agentes asignados. Próximo5B1: ventas locales y pedidos desde panel, usando flujos existentes de pago/reserva.

- 5A3 (terminada): identidad base azul/turquesa, inicio público, catálogo sin registro y primer administrador desde asistente local. Checkout visual y personalización de marca empresarial pendientes.

- 5B1 (terminada): venta local multilínea, listado y detalle de pedidos, registro manual de pago, entrega/despacho y cancelación de reservas desde panel. Reintento idempotente de venta, posventa informativa. Próximo: usuarios/permisos y configuración empresarial; luego cotizaciones/posventa/reportes.


## Estado vigente 0.19

Completados los bloques de UI para equipo/accesos, configuración, cotizaciones, posventa, reportes e imágenes. Tienda con marca empresarial, carrito, registro/verificación/recuperación, pedidos para retiro o envío cotizado y pago simulado. Esto reemplaza los pendientes de UI de las entradas históricas anteriores.

Pendiente comercial: integración a proveedores reales de pago/correo (no seleccionados), infraestructura/dominio/HTTPS, supervisión y respaldo externo, carga y revisión visual integral. No hay cobros reales ni envío de correos reales. No hay persistencia de carrito/borradores tras recarga; revisar resultados antes de repetir operaciones inciertas. No se agregaron categorías, búsqueda avanzada, variantes ni exportación de reportes; no formaban parte del conjunto funcional cerrado en 0.19.
