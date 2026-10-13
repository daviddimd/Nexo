# Paquete de ejecución · 6C1

En el sistema y arquitectura de destino, con Node.js 24 y las dependencias instaladas mediante npm ci, ejecutar npm run release. Requiere dependencias de desarrollo durante compilación. Genera .releases/nexo-VERSION-UUID con Next standalone, recursos estáticos, dependencias trazadas, worker JavaScript compilado y manifiesto SHA-256. No requiere tsx ni TypeScript para ejecutar el paquete. No es un instalador de PostgreSQL ni incluye herramientas administrativas de migración, licencias, respaldos o doctor: esas se ejecutan desde un checkout administrativo privado de la misma versión.

La compilación usa el lockfile, pero no promete archivos idénticos byte a byte entre compilaciones: identificadores y dependencias nativas pueden cambiar. Generar y validar el paquete en el sistema/arquitectura donde se ejecutará. La entrega actual se probó en Windows, no en Linux o Docker. No se instaló Docker ni se provisionaron servicios.

## Validar y arrancar

Desde la carpeta del paquete:

```powershell
node verify-release.mjs .
$env:NODE_ENV='production'
$env:DATABASE_URL='CONEXION_RUNTIME_RESTRINGIDA'
$env:APP_ORIGIN='https://tienda.ejemplo.cl'
$env:NEXO_SIMULATOR_ENABLED='false'
$env:NEXO_LOCAL_MAIL_ENABLED='false'
$env:HOSTNAME='127.0.0.1'
$env:PORT='3000'
node server.js
```

El verificador exige sistema y arquitectura compatibles y comprueba contenido y lista de archivos. No autentica el origen del paquete: el manifiesto no está firmado. Transportar el paquete por un canal controlado. No verifica la versión de Node; usar Node24 y comprobarla en despliegue. Verificar antes del primer arranque, porque Next puede generar caché que aparezca después como archivos adicionales.

El proceso web recibe solo credenciales runtime y configuración pública/operativa. No incluir claves privadas, conexiones administrativas ni SETUP_ADMIN_PASSWORD. Configurar los archivos de identidad/claves públicas externamente si se desea consultar licencias. No colocar .env ni secretos dentro del paquete. El empaquetador rechaza nombres privados conocidos y enlaces simbólicos en la salida; esto no equivale a un escáner de secretos incrustados en código o variables públicas de compilación. Compilar desde un entorno limpio, sin secretos administrativos ni NEXT_PUBLIC confidenciales.

Fijar HOSTNAME explícitamente: el servidor standalone no utiliza el script npm start del proyecto, y su valor por defecto puede exponer todas las interfaces. Configurar proxy HTTPS delante de loopback y hacer coincidir APP_ORIGIN con la URL externa. No iniciar con npm start en el paquete: usar node server.js.

## Worker como proceso separado

Desde otra consola o servicio con la misma conexión runtime y directorio de trabajo:

```powershell
node worker/scripts/expire-orders.js --watch
```

Sin --watch ejecuta una pasada y termina. El worker consulta cada cinco segundos y maneja SIGINT/SIGTERM para detenerse y cerrar conexiones. La web no lo inicia automáticamente. Configurar reinicio supervisado y logs con el gestor de procesos del servidor; esta entrega no instala servicios Windows/systemd ni programas de inicio. La web puede seguir respondiendo aunque el worker haya fallado: monitorizar ambos procesos. Los comandos antiguos orders:expire/orders:worker siguen disponibles desde el checkout de desarrollo.

## Actualización y regreso a versión previa

Respaldar base e identidad/configuración, preparar y verificar un nuevo paquete, detener web/worker, aplicar migraciones y perfil SQL con conexiones administrativas, ejecutar doctor desde mantenimiento y arrancar ambos procesos. Comprobar /api/health, /api/ready y un flujo de stock/pedido. Mantener los paquetes previos en almacenamiento protegido. Volver al ejecutable anterior solo si es compatible con el esquema actual; no hay migraciones inversas automáticas. Un regreso que necesite restaurar datos exige un procedimiento revisado y puede perder operaciones posteriores al respaldo.

El paquete no contiene base, imágenes externas, configuración, claves, certificados o respaldos. Quedan TLS/proxy, credenciales reales, supervisión, logs/alertas, almacenamiento y pruebas de carga antes de producción.
