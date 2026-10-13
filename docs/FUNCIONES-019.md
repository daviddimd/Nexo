# Nexo 0.19 · Funciones incorporadas

Reinicia el proceso actual con Ctrl+C y después ejecuta `npm run dev` desde la carpeta del proyecto. El arranque único aplica migraciones y habilita pago simulado y correo local. Conserva las empresas y los datos existentes.

## Empresa

- Inicio autenticado con accesos a inventario, productos, ubicaciones, ventas, pedidos, equipo, configuración, cotizaciones y reportes.
- Inventario compacto: producto por fila, sucursales y bodega web por columna; disponible y reservas diferenciados.
- Alta y edición de productos y sucursales, venta local, pago recibido, entrega/despacho y cancelación de reserva.
- Equipo: agentes, asignaciones, activación/desactivación y restablecimiento de contraseñas. Cambio de contraseña propia desde Inicio.
- Configuración: contacto, nombre, descripción, logotipo por URL y color; plazo de reservas de 1 a 60 minutos.
- Envíos: solicitudes, detalle, aprobación con costo y condiciones o rechazo con motivo. La aprobación dura 30 minutos y no reserva stock ni cobra.
- Posventa en el detalle del pedido: reembolsos, devoluciones aptas/dañadas y reposición íntegra de pedidos no entregados tras el reembolso completo. Dinero y recepción física se registran por separado.
- Reportes por período: ventas cobradas, reembolsos y neto por ubicación, con fechas de Chile; alertas de stock bajo actuales. No representan utilidad.
- Revisión de capturas simuladas y resolución de excepciones en Reportes, solo para el propietario.
- Carga directa de imágenes al editar un producto: PNG, JPEG o WebP hasta 2 MB. Se normalizan a WebP, hasta 1600 × 1600 y sin metadatos de origen. Se guardan en PostgreSQL y se incluyen en los respaldos de la base.

## Tienda

[Tienda PrismaByte](http://localhost:3000/tienda?empresa=prismabyte)

- Catálogo público con imágenes, identidad de empresa y disponibilidad por ubicación.
- Carrito con cantidades y subtotal estimado, accesible sin registro.
- Acceso, registro, verificación y recuperación de cuentas de cliente.
- Retiro: selección de sucursal y creación de pedido con reserva de stock.
- Envío: solicitud de cotización, consulta de aprobación y creación de pedido con el costo aprobado.
- Mis compras: pedidos y cotizaciones paginados, detalle y cancelación de reservas.
- Pago simulado desde el pedido, sin dinero real; repetir la comprobación no descuenta stock dos veces.

Para comprar usa una cuenta CUSTOMER. El propietario y los agentes utilizan el panel empresarial. Si ya tienes el entorno PrismaByte local, sus cuentas de demostración están en el archivo privado `.nexo/prismabyte-access.json`. Los datos de demostración y las credenciales no se distribuyen en el repositorio.

## Correo de demostración

Los mensajes no se envían por Internet: permanecen cifrados en el buzón local. El operador puede consultarlos con:

```powershell
npm run mail:local -- ID_EMPRESA
npm run mail:local -- ID_EMPRESA ID_MENSAJE
```

El ID de empresa aparece en la respuesta privada `/api/settings/company`; no es el identificador `prismabyte`. El segundo comando exporta el mensaje con su código sensible a `.local-mail`, ignorado por Git. Introduce el código en “Mi cuenta → Verificar correo” o “Cambiar contraseña con código”. No publiques ese archivo.

Las claves del entorno demo se conservan en `.nexo/demo-runtime.json`; no se incorporan al repositorio. El simulador y el correo local están bloqueados en producción.

## Validación y límites

Tipos y compilación correctos. Suite de 179 pruebas sin fallos y recorrido HTTP completo sobre un esquema aislado: imagen, registro/verificación, retiro, pago repetido, entrega, devolución apta/dañada, reembolso, envío cotizado y reportes.

Los formularios conservan las claves de reintento mientras permanecen montados. Si recargas tras perder una respuesta, consulta pedidos/cotizaciones/historial antes de repetir. El carrito no se conserva después de recargar.

La revisión visual interactiva de las nuevas pantallas sigue pendiente. Para operar comercialmente faltan escoger y conectar proveedores reales de pago/correo, preparar dominio y alojamiento, y validar la instalación de producción. Esta entrega completa el conjunto funcional local descrito arriba; no constituye un despliegue comercial.
