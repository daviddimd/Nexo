# Fotografías del catálogo de demostración

114 SKU tienen una fotografía de referencia. Los archivos WebP están incluidos en
`assets/` y se comparten cuando la imagen es idéntica. No hay descargas ni enlaces
remotos en tiempo de ejecución. `manifest.json` conserva la página de procedencia,
la URL original, el modelo de referencia y la huella SHA-256 de cada archivo.

Las imágenes proceden de galerías de fabricantes y fichas de producto de SoloTodo,
Dateks, Visunext y Novatech/Etilize. Las marcas y fotografías pertenecen a sus
respectivos titulares; este archivo registra procedencia, no otorga una licencia
de redistribución comercial. Son referencias del prototipo, reemplazables por las
fotos que suministre cada empresa. Las notas del manifiesto identifican las fotos
compartidas entre capacidades o longitudes de una misma familia.

## Cargar en la demostración local

Desde la raíz de Nexo, con la base de desarrollo iniciada:

```sh
npm run demo:images
```

El comando valida todos los archivos antes de escribir, realiza un respaldo y
añade únicamente fotos faltantes a los SKU de PrismaByte. Conserva imágenes
cargadas o enlazadas por el usuario y no crea productos ni modifica stock,
precios, pedidos o cuentas. Puede repetirse sin duplicar datos.

`npm run demo:seed -- --fill` y `--replace` también incorporan las fotos a la
semilla. `--replace` conserva su comportamiento de reemplazar la demo y sus datos
operativos; para añadir fotos a una instalación existente usar `demo:images`.

Las fotos se guardan en `products.image_data` y se sirven por el endpoint de
imágenes existente. Quedan incluidas en los respaldos de la base de datos y
respetan las reglas de visibilidad del producto.
