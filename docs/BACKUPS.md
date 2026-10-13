# Respaldos y ensayo de recuperación · 6B1

Las herramientas usan pg_dump/pg_restore instalados por separado. No programan tareas, no almacenan copias en la nube y no crean bases ni usuarios. Utilizar una versión de las herramientas compatible con el servidor. NEXO_PG_BIN puede apuntar a su carpeta, por ejemplo C:/Program Files/PostgreSQL/18/bin; si se omite, se buscan en PATH.

## Crear un respaldo

```powershell
$env:NEXO_BACKUP_DATABASE_URL='postgresql://usuario_respaldo:CLAVE@servidor/nexo'
$env:NEXO_DATABASE_SCHEMA='nexo'
$env:NEXO_PG_BIN='C:/Program Files/PostgreSQL/18/bin'
npm run backup -- create D:/respaldos/nexo-2026-10-12.dump
```

El directorio de salida debe existir. Se exporta un único esquema en formato PostgreSQL custom, sin propietarios ni ACL, usando el snapshot consistente de pg_dump. Elegir el esquema real; no es un respaldo global del clúster. El archivo se publica completo mediante enlace duro sin reemplazar uno existente; requiere soporte de enlaces duros. Un error elimina el archivo temporal. No se imprime la contraseña ni se pasa en argumentos del proceso: las herramientas la reciben en PGPASSWORD. No se propagan otras variables PG heredadas que pudieran cambiar el destino. Se admite sslmode en la URL; options se descarta, porque el esquema se selecciona explícitamente. Otras opciones de URL se rechazan.

La conexión de respaldo es explícita y no utiliza DATABASE_URL como alternativa. Debe tener lectura y acceso a todos los objetos del esquema; concederla y custodiarla mediante administración de PostgreSQL, fuera del proceso web. Esta entrega no configura el rol ni certifica TLS. En servidores remotos configurar y comprobar verificación del certificado con la infraestructura antes de usar el respaldo para datos reales.

El archivo contiene datos sensibles, incluidos hashes de contraseña, sesiones, direcciones y registros financieros internos. No está cifrado por esta herramienta. Guardarlo fuera de carpetas públicas y del repositorio, con ACL apropiadas, cifrado del almacenamiento y acceso limitado. .backups/ y *.dump están ignorados por Git; otros nombres no quedan protegidos. El modo POSIX del archivo no reemplaza ACL de Windows. Definir retención y copia externa antes de producción.

## Ensayar una restauración

Crear previamente una base exclusiva vacía cuyo nombre termine en _restore_test. Utilizar un administrador de recuperación independiente y detener cualquier acceso concurrente a esa base durante el ensayo.

```powershell
$env:NEXO_RESTORE_DATABASE_URL='postgresql://recuperacion:CLAVE@servidor/nexo_restore_test'
npm run backup -- restore-test D:/respaldos/nexo-2026-10-12.dump
```

Solo admite nombres de destino con sufijo _restore_test; rechaza una base con tablas, vistas, secuencias u otras relaciones o funciones de usuario. No usa --clean, no borra datos existentes ni crea la base. pg_restore usa una transacción única y exit-on-error. El control de vacío no bloquea otras conexiones: usar un destino privado y sin procesos concurrentes. No es una herramienta para sobrescribir producción.

Restaurar únicamente archivos generados y custodiados por el operador: un archivo PostgreSQL puede contener instrucciones SQL. No aceptar respaldos aportados por usuarios sin confianza. Los errores se muestran de forma genérica para evitar exposición de credenciales; revisar herramientas, versión, permisos y archivo en un entorno administrativo seguro.

## Verificación y recuperación completa

En el ensayo automatizado se comparan empresas, cuentas, productos, sucursales, stock, operaciones, movimientos y checksums de migraciones, se comprueba que el ledger no permite borrar movimientos y se vuelve a ejecutar el runner de migración. También se prueba un archivo corrupto, destino ocupado y respaldo existente. La comparación usa datos de prueba, no credenciales de producción.

Tras recuperar una instalación real hacen falta pasos adicionales: crear roles, reasignar propiedad al migrador, aplicar db:permissions, ejecutar doctor y probar una compra/reserva/cancelación. Como se omiten ACL/propietarios, no iniciar la web antes de restablecerlos. El ensayo automatizado usa un administrador temporal y no demuestra una recuperación con roles de producción.

Respaldar por separado identidad de instalación, claves públicas confiables, configuración/secrets, imágenes y demás archivos externos. No distribuir ni restaurar la clave privada del operador en la tienda. Restaurar un respaldo antiguo restaura también el máximo conocido de revisiones de licencia; no hay autoridad remota que detecte ese retroceso. No se implementan PITR/WAL, recuperación de clúster, scheduling, cifrado de archivos o restauración automática de infraestructura en este bloque.
