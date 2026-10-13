# Preparación de base de datos · 6A1

La herramienta db:permissions aplica un perfil SQL al esquema exclusivo de Nexo. No contrata hosting, no crea bases o contraseñas y no declara el producto listo para producción. Usar una base exclusiva, respaldar y aplicar durante mantenimiento: la revocación de ACL toma bloqueos y cambia permisos de todas las tablas y funciones del esquema. No apuntar a bases compartidas con otros proyectos.

## Tres conexiones

| Conexión | Uso | Permisos |
| --- | --- | --- |
| DATABASE_URL | Web, worker de reservas y herramientas operativas | Lecturas y escrituras operativas; registro comercial/licencias solo lectura |
| NEXO_MIGRATION_DATABASE_URL | Migraciones y perfil de permisos | Propietario del esquema y sus objetos, separado de los otros roles |
| NEXO_OPERATOR_DATABASE_URL | Alta de empresa, condiciones comerciales e importación de licencias | Alta y lecturas necesarias, bloqueo de empresas, escritura comercial y licencias, auditoría |

Los CLI db:migrate, company:create, company:onboard, commercial:record y license import exigen su conexión correspondiente: ya no utilizan DATABASE_URL como alternativa administrativa. El proceso web recibe únicamente DATABASE_URL y sus claves operativas; no debe recibir credenciales de migración/operador ni claves privadas de firma. Los comandos npm que usan --env-file requieren que exista .env; en despliegue pueden ejecutarse directamente con tsx y secretos de entorno gestionados. El comando license no carga .env.

## Preparación por el administrador PostgreSQL

Crear previamente tres roles LOGIN distintos, sin SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ni BYPASSRLS. Runtime y operador no deben tener membresías, miembros, propiedad de la base ni permiso CREATE sobre ella. Usar credenciales independientes, autenticación SCRAM, red privada/TLS según infraestructura y un gestor de secretos. El perfil no cambia contraseñas ni autenticación de PostgreSQL.

Asignar al rol de migración la propiedad de un esquema dedicado (por ejemplo nexo) y sus objetos. Fijar el search_path de las tres conexiones a ese esquema; la configuración NEXO_DATABASE_SCHEMA del perfil debe coincidir. El esquema public moderno suele pertenecer a pg_database_owner: no suponer que el usuario de conexión sea su propietario. Preferir un esquema dedicado con propietario explícito. La base debe permitir CONNECT a los tres roles; no dar CREATE a runtime u operador. El administrador debe revisar privilegios globales y otros esquemas por separado.

Ejemplo de estructura de variables (reemplazar marcadores con secretos fuera del repositorio):

```dotenv
DATABASE_URL=postgresql://nexo_web:CLAVE@servidor/nexo?options=-c%20search_path%3Dnexo
NEXO_MIGRATION_DATABASE_URL=postgresql://nexo_migrator:CLAVE@servidor/nexo?options=-c%20search_path%3Dnexo
NEXO_OPERATOR_DATABASE_URL=postgresql://nexo_operator:CLAVE@servidor/nexo?options=-c%20search_path%3Dnexo
NEXO_DATABASE_SCHEMA=nexo
NEXO_RUNTIME_ROLE=nexo_web
NEXO_OPERATOR_ROLE=nexo_operator
```

Estas variables administrativas son para el proceso de mantenimiento, no el servicio web. Runtime/operator pueden ser roles NOLOGIN en pruebas con SET ROLE; en producción se recomiendan logins dedicados sin membresías.

## Orden y comprobaciones

1. Crear base, roles y esquema exclusivos; respaldar antes de actualizar una instalación existente.
2. Ejecutar npm run db:migrate con NEXO_MIGRATION_DATABASE_URL.
3. Ejecutar npm run db:permissions con esa conexión, NEXO_DATABASE_SCHEMA, NEXO_RUNTIME_ROLE y NEXO_OPERATOR_ROLE.
4. Ejecutar las altas/comercial/licencias con la conexión de operador cuando corresponda.
5. Iniciar web y worker con DATABASE_URL restringida; comprobar /api/ready y una venta de prueba.

Reaplicar el perfil después de cada migración. Los objetos nuevos no reciben automáticamente permisos operativos: el inventario explícito del perfil debe actualizarse y verificarse antes del despliegue. El perfil es transaccional e idempotente y exige exactamente las tablas y vista conocidas de la versión actual; objetos ajenos o migraciones faltantes lo hacen fallar antes de cambiar ACL. Exige propiedad de objetos y rechaza funciones SECURITY DEFINER en el esquema. No modifica roles del clúster ni borra objetos.

Revoca permisos directos de PUBLIC/runtime/operador sobre el esquema, tablas, secuencias y funciones; retira concesiones predeterminadas para objetos futuros creados por el propietario actual. Runtime no recibe CREATE, TRUNCATE, propiedad, permiso de desactivar triggers ni escritura en schema_migrations/commercial_revisions/installation_identity/license_imports. En libros inmutables recibe SELECT/INSERT según necesidades. Operador puede insertar empresas/usuarios iniciales, condiciones/licencias/auditoría y actualizar empresas para los bloqueos compartidos; no recibe acceso a stock o sesiones. No es un rol de atención al cliente y debe permanecer fuera de la web.

## Límites y trabajo pendiente

Esto separa funciones SQL, no empresas: runtime todavía puede leer datos de varias empresas mediante SQL directo. El servidor aplica el aislamiento por sesión y filtros; RLS no está implementado. El operador puede crear usuarios iniciales con privilegios de empresa; custodiar sus credenciales. La herramienta revisa el esquema objetivo y privilegios de creación de esquemas, pero no sustituye una auditoría de otras bases, extensiones, funciones o privilegios globales. No prueba automáticamente que tres cadenas de conexión configuradas utilicen identidades distintas: verificar sus usuarios efectivos en el despliegue.

Quedan comprobaciones de configuración de producción, imagen/paquete reproducible, proxy HTTPS, backups con restauración comprobada, monitoreo, carga y transporte real de correo. Simuladores y correo local continúan bloqueados en producción. No se han provisionado servidores ni alterado bases ajenas. La entrega se verifica con roles y esquemas temporales en nexo_test; se eliminan al terminar.

## Diagnóstico previo (6A2)

Ejecutar `npm run doctor` en el mismo entorno del proceso web. No carga .env automáticamente: inyectar las variables mediante el entorno o ejecutar `node --env-file=.env --import tsx scripts/doctor.ts` con un archivo exclusivamente de runtime. Para comprobar las tres conexiones desde un entorno privado de mantenimiento, ejecutar `npm run doctor -- --maintenance` con sus variables administrativas. Nunca trasladar ese entorno al servicio web.

Devuelve JSON con ok, códigos de incidencias y usuarios efectivos/base/esquema. No imprime contraseñas, cadenas de conexión, claves ni mensajes originales de PostgreSQL. Código de salida 0 si las comprobaciones pasan, 1 si fallan. Solo usa consultas y transacciones READ ONLY: no cambia permisos ni datos y no inicia servicios.

Valida origen HTTP(S) sin credenciales/rutas/query/fragmento; en NODE_ENV=production exige HTTPS y flags explícitos false para simulador/correo local, prohíbe clave privada de firma y secretos administrativos en runtime. Una configuración de licencias parcialmente definida falla; no comprueba contenido de esos archivos. Mantenimiento permite las conexiones administrativas, nunca la clave privada de firma en producción.

Inspecciona usuario efectivo, search_path, autoridad excesiva, membresías, propiedad de esquema de migración, existencia de tablas críticas y una selección de permisos de lectura/escritura operativos/comerciales. En mantenimiento exige tres usuarios distintos y el mismo nombre de base. El nombre por sí solo no prueba que los servidores sean el mismo: revisar los endpoints de conexión durante despliegue. No verifica todos los permisos del perfil ni checksums de migraciones, TLS de la conexión, proxy, DNS, certificados, secretos de terceros o salud de backups. No sustituye db:permissions ni una prueba de venta. No se ejecuta automáticamente al arrancar ni declara la instalación lista para producción.
