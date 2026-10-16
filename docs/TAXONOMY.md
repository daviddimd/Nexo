# Categorías y fichas técnicas

Cada empresa dispone de su propio árbol de categorías. La plantilla inicial tiene Componentes, Monitores, Accesorios y periféricos, Redes y Computadores, con subcategorías como Almacenamiento > SSD, Memorias RAM, Teclados y Routers. Los nombres se pueden editar y el propietario puede crear nuevas categorías y especificaciones desde **Productos > Categorías**.

## Fichas técnicas

En **Productos > Nuevo producto / Editar**, elegir una categoría muestra sus campos. Las subcategorías heredan los de sus antecesores. Marca y modelo están disponibles en todas. Los campos desconocidos se dejan vacíos; un dato ausente no equivale a «No» ni a cero.

- SSD: capacidad numérica en GB, interfaz, formato y DRAM.
- Monitor: pulgadas, resolución exacta, frecuencia en Hz, panel y curvatura.
- RAM: capacidad, DDR4/DDR5, velocidad en MT/s y formato.
- Procesadores, fuentes, periféricos y redes: campos propios de su tipo.

Las listas usan valores canónicos; los números y booleanos se guardan con su tipo. Capacidad comercial: 1000 GB = 1 TB. Se conservan 500 GB y 512 GB como valores diferentes. QHD se almacena como 2560x1440 (1440p); «2K» se evita como identificador porque es ambiguo. Frecuencia del monitor: máxima declarada, sujeta a la conexión utilizada; por ejemplo, Dell G2724D admite 165 Hz por DisplayPort y 144 Hz por HDMI.

El servidor rechaza especificaciones ajenas a la categoría y valores incompatibles. Cambiar categoría exige revisar explícitamente la ficha. Editar solo un precio conserva el resto de los datos.

La ficha se muestra en el catálogo público. Los filtros por especificaciones del comprador quedan para el siguiente paso: esta etapa deja los datos normalizados y un índice JSONB para implementarlos. En Productos ya se puede filtrar por categoría y sus descendientes. En Inventario hay un panel lateral desplegable con búsqueda, categoría, rango de precio, características, ubicación y disponibilidad. «Ordenar por» permanece independiente a la derecha. Selecciona la categoría para cargar características, combina sus opciones y pulsa Aplicar filtros. El precio se refiere al precio de venta CLP del producto; la capacidad se compara exactamente (500 GB no equivale a 512 GB). Limpiar filtros conserva el orden.

## API

- `GET /api/categories`: árbol y campos efectivos; personal de la empresa.
- `POST /api/categories`: nombre, slug, parentId y attributes; propietario.
- `PATCH /api/categories/:id`: cambiar nombre; propietario.
- Productos admiten `categoryId` y `specifications` al crear/editar.
- `GET /api/products?categoryId=UUID`: incluye descendientes de esa categoría.
- El catálogo público incluye categorías, `category_id` y `specifications`.

Los atributos personalizados permiten texto, número, lista de opciones y Sí/No. La interfaz de creación permite añadirlos; los campos heredados no se redefinen. No se puede mover una categoría existente ni cambiar los tipos usados por productos desde esta versión.

## Reemplazar la demostración local

```sh
npm run demo:seed -- --replace
```

Ejecutar con PostgreSQL local activo. El comando está limitado a `nexo_dev`, loopback, puerto 55440, usuario local de Nexo y PrismaByte identificada por su archivo privado de acceso. Se rechaza en producción. No se ejecuta al iniciar el programa.

Antes de modificar datos crea un respaldo PostgreSQL en `.nexo/backups/`. Aplica la migración 011 y reemplaza, en una transacción, productos, existencias y operaciones/pedidos de la antigua demostración de PrismaByte. Conserva empresa, usuarios, contraseñas, sucursales, asignaciones y configuración. Otras empresas no se modifican. El registro de auditoría conserva constancia del reinicio.

El reinicio de datos de demostración requiere la conexión privilegiada local: suspende solo en esa transacción los triggers de historial inmutable durante el borrado, los reactiva antes de cargar el catálogo y comprueba la consistencia del libro de stock antes del commit. No existe ruta web para esta operación ni se relajan los permisos de ejecución normal.

La semilla contiene 114 productos de modelos existentes y configuraciones admitidas por sus fabricantes, con especificaciones y fuentes declaradas en `scripts/demo-products.ts` y `scripts/demo-products-extra.ts`. Cubre las 23 categorías finales de la plantilla; precios y stock son ficticios. Precios, existencias y movimientos son ficticios. Se incluyen capacidades 128/256/512 GB y 1 TB, monitores Full HD/QHD/4K, 60/75/144/165 Hz, componentes, periféricos y redes. Los datos de productos no se descargan automáticamente de SoloTodo.

Inspiración de organización: [SSD SATA en SoloTodo](https://www.solotodo.cl/ssd-25-sata) y [Monitores en SoloTodo](https://www.solotodo.cl/monitores). Referencias de especificaciones: fichas de Transcend, Kingston, Dell, LG y fabricantes enlazados en la semilla. No se copian descripciones comerciales ni fotografías.

## Migración y permisos

La migración 011 conserva productos previos sin categoría y sin especificaciones. Crea la plantilla para empresas existentes; las nuevas la reciben al crearse. Después de migrar una instalación con roles separados, volver a ejecutar `db:permissions` como indica su guía para dar acceso a la nueva tabla `categories`.

## Consultas de inventario

`GET /api/inventory/matrix` admite `categoryId`, `priceMin`, `priceMax` (CLP enteros) y `specs` (objeto JSON codificado en la URL), además de búsqueda, ubicación, disponibilidad y orden. Ejemplo de specs: `{"capacity_gb":1000,"interface":"PCIe 4.0 NVMe"}`. Los campos se combinan con AND, mantienen tipos y se filtran antes de paginar. Una categoría incluye sus descendientes.

`GET /api/inventory/facets?categoryId=UUID` devuelve campos efectivos y valores distintos disponibles en el catálogo de la empresa, hasta 200 valores por campo. No depende de la página visible ni muestra categorías de otras empresas. Campos sin valor conocido no se ofrecen como opción. Estas consultas son privadas para personal; la interfaz pública de filtros técnicos sigue pendiente.

## Ampliar sin reiniciar datos

```sh
npm run demo:seed -- --fill
```

Este modo crea un respaldo e inserta únicamente los SKU que falten, junto con sus recepciones iniciales por ubicación. Conserva los productos existentes aunque sus precios o fichas se hayan editado, así como ventas, reservas y movimientos. Repetirlo no duplica productos ni suma existencias a los ya cargados. Usa las mismas restricciones de demostración local que el reinicio, pero no suspende triggers ni borra datos. `--replace` sigue siendo el reinicio explícito de la demo.

Cobertura: SSD SATA/NVMe; HDD; RAM DDR4/DDR5 y SO-DIMM; procesadores AM4/AM5/LGA1700; placas madre; GPU; fuentes; gabinetes; refrigeración por aire/líquida; monitores de escritorio/portátiles; teclados, mouse, audífonos, webcams y mousepads; cables; hubs; routers, switches y adaptadores Wi-Fi; notebooks y PC de escritorio. Se incluyen stock cero y stock bajo en algunas sucursales. Las capacidades exactas de cada fabricante se conservan, por ejemplo 960, 1000 y 1024 GB son valores distintos.
