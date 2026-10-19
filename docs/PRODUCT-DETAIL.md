# Fichas individuales de producto

Desde Inventario y Productos, el nombre abre `/panel/productos/:id`. La imagen o el nombre en el catálogo público abre `/tienda/productos/:id?empresa=slug`.

La ficha muestra imagen (o un marcador si no existe), precio CLP, descripción, categoría, especificaciones tipadas y disponibilidad por ubicación. La versión interna requiere sesión de personal y filtra ubicaciones según permisos; incluye cantidades físicas y reservadas. La versión pública ofrece únicamente productos activos y ubicaciones activas, sin exponer las cantidades físicas o reservadas. Productos de otra empresa, inexistentes o inactivos en público responden 404.

Consultas:

- `GET /api/products/:id`: ficha del producto de la empresa de la sesión, solo personal.
- `GET /api/public/:slug/products/:id`: ficha pública del producto activo de esa empresa.

El catálogo y sus fichas comparten un carrito mediante el layout de la tienda. Los enlaces Next.js conservan la selección al ir a la ficha y volver. Desde la ficha pública se puede agregar al carrito y abrirlo en el catálogo. El carrito se mantiene durante esa navegación, pero no se guarda tras recargar o cerrar la página. Los pedidos siguen resolviendo precios, permisos y existencias en el servidor.

Validación: 195 pruebas completas aprobadas y compilación correcta. Comprobación HTTP local de fichas pública y privada, redirección sin sesión, 404 y separación de cantidades públicas/privadas. Pendiente revisión visual e interactiva en navegador.
