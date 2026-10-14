# Nexo · Primera beta

Versión: **v0.20.0-beta.1**. Publicación de código fuente para evaluación y pruebas.

## Funciones incluidas

- Empresas con catálogo, precios, imágenes y ubicaciones propias.
- Inventario separado entre bodega web y sucursales; unidades físicas, reservadas y disponibles.
- Entradas, ajustes, transferencias e historial de movimientos.
- Ventas locales, pedidos, retiro en sucursal y envío sujeto a cotización.
- Pagos simulados, cancelaciones, devoluciones y reembolsos.
- Cuentas y permisos por empresa y sucursal; configuración organizada por categorías.
- Panel con resumen de ventas, pedidos pendientes y alertas de stock.
- Búsqueda con autocompletado, filtros y ordenamiento de inventario.
- Portada e inicio de sesión renovados; identidad azul oscuro y turquesa.
- Arranque local de web, PostgreSQL y worker mediante `npm run dev`.

## Ejecutar

Requiere Node.js 24+ y PostgreSQL instalado. Después de clonar el repositorio:

```sh
npm ci
npm run dev
```

Abrir http://localhost:3000. En una instalación vacía, configurar la empresa y su administrador. Los datos y las credenciales de demostración de la máquina de desarrollo no se distribuyen con el repositorio.

## Estado de la beta

Esta versión permite evaluar los flujos de gestión. Los pagos y el correo de desarrollo son simulados/locales: no cobran dinero ni envían correos reales. Antes de operar comercialmente faltan integrar proveedores reales y preparar alojamiento, dominio, HTTPS, monitoreo y copias externas. No se incluye una instalación de producción ni una base de datos precargada.

## Validación

- 183 pruebas automatizadas aprobadas, sin fallos ni omisiones, con base PostgreSQL aislada.
- Compilación de producción y comprobación de TypeScript correctas.
- Pendiente una revisión visual e interactiva completa en distintos dispositivos.
