# Identidad y licencias firmadas · 4C2B

Esta entrega proporciona herramientas offline de operador e importación persistente mediante db/009-license-imports.sql. No agrega restricciones a las rutas de venta, stock o cuentas. Firmar un archivo no crea ni modifica una revisión comercial; importarlo exige que ya exista una revisión comercial con número y condiciones idénticas.

## Identidad persistente

Crear una carpeta privada `.nexo` en el despliegue y ejecutar desde el proyecto:

```powershell
npm run license -- init .nexo/installation.json
```

La identidad es un UUID aleatorio de instalación. Inicializar otra vez devuelve el mismo valor; llamadas simultáneas publican un archivo completo mediante enlace atómico sin reemplazar el existente. El sistema de archivos debe soportar enlaces duros. Un archivo corrupto falla sin regeneración automática. Conservar este archivo junto con los respaldos y restringir sus permisos mediante ACL del servidor; el modo POSIX no reemplaza las ACL de Windows. No colocarlo en carpetas públicas. Restaurar una copia de la identidad también copia su identidad lógica: no es una huella de hardware ni evita clonar una instalación.

## Emisión exclusiva del operador

Generar y custodiar un par Ed25519 fuera de las instalaciones de clientes. No se genera ni se distribuye una clave de producción en este repositorio. El servidor de cliente solo recibe las claves públicas confiables, en un JSON cuya forma es `{"operador-2026":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"}`. La lista debe provenir del operador y tener permisos de despliegue; no aceptar claves proporcionadas junto a una licencia.

El JSON de condiciones contiene exclusivamente estos campos; los UUID deben corresponder a la empresa real y al archivo de identidad. Las fechas siguientes son un ejemplo, no una duración comercial predeterminada:

```json
{
  "format": "nexo-license-v1",
  "licenseId": "00000000-0000-4000-8000-000000000001",
  "installationId": "00000000-0000-4000-8000-000000000002",
  "companyId": "00000000-0000-4000-8000-000000000003",
  "revision": 1,
  "issuedAt": "2026-10-12T00:00:00Z",
  "effectiveAt": "2026-10-12T00:00:00Z",
  "startsAt": "2026-10-12T00:00:00Z",
  "mode": "SUBSCRIPTION",
  "status": "ENABLED",
  "accessUntil": "2027-10-12T00:00:00Z",
  "updatesUntil": "2027-10-12T00:00:00Z",
  "supportUntil": "2027-10-12T00:00:00Z"
}
```

Para PERPETUAL, accessUntil debe ser null. Actualizaciones y soporte siguen teniendo plazos explícitos. Para firmar en el equipo del operador:

```powershell
$env:NEXO_LICENSE_PRIVATE_KEY_FILE='D:/secretos/nexo.private.pem'
$env:NEXO_LICENSE_KEY_ID='operador-2026'
npm run license -- sign condiciones.json licencia.json
```

La salida no reemplaza archivos existentes. La herramienta no imprime claves privadas. El comando `license` no carga `.env` automáticamente; requiere variables explícitas. Nunca distribuir la clave privada ni configurarla en el proceso de la tienda. `.nexo/` y `*.private.pem` están ignorados por Git, pero esto no protege archivos guardados bajo otros nombres o fuera de esa carpeta.

## Verificación en instalación

```powershell
$env:NEXO_LICENSE_TRUSTED_KEYS_FILE='D:/nexo-config/claves-publicas.json'
npm run license -- verify licencia.json .nexo/installation.json UUID_EMPRESA
```

Verifica Ed25519, identificador de clave firmado, esquema estricto, empresa e instalación. No descarga claves ni acepta algoritmos alternativos. La firma autentica el encabezado y los bytes del contenido; no cifra las condiciones. Una fecha de emisión futura se rechaza. Los estados ACTIVE, SCHEDULED, EXPIRED y CANCELLED son informativos; operationalRestriction siempre es NONE, billingEnabled siempre es false. Actualizaciones y soporte se evalúan de forma independiente.

Cambiar de clave se hace agregando una clave pública confiable y emitiendo con su identificador. Retirar una clave de la lista invalida todas las licencias firmadas por ella, incluidas las históricas. El archivo no dispone de consulta de revocación remota.

## Importación persistente (4C2B)

Aplicar `npm run db:migrate` antes de importar. En el equipo autorizado para administrar la instalación, configurar conexión de operador, claves públicas confiables e identidad. La conexión no usa DATABASE_URL como alternativa:

```powershell
$env:NEXO_OPERATOR_DATABASE_URL='postgresql://operador:CLAVE@servidor/base'
$env:NEXO_LICENSE_TRUSTED_KEYS_FILE='D:/nexo-config/claves-publicas.json'
npm run license -- import licencia.json .nexo/installation.json UUID_EMPRESA
```

La firma se verifica con reloj de PostgreSQL después de bloquear la empresa. Empresa e instalación deben coincidir. El número de revisión debe existir en commercial_revisions, con modalidad, estado y todas las fechas iguales. El importador no modifica las condiciones comerciales. Es posible omitir revisiones comerciales al importar, pero nunca introducir una revisión inferior a la mayor importada. Repetir el documento idéntico de una revisión ya importada devuelve el original y la revisión máxima actual, sin volver a activarlo ni duplicar auditoría. Otro documento para el mismo número se rechaza incluso si sus condiciones coinciden. Refirmar requiere una nueva revisión comercial.

La primera importación válida vincula toda la base a un UUID de instalación; varias empresas SaaS pueden compartirlo. El vínculo es inmutable. Un archivo de identidad distinto requiere un procedimiento de migración de instalación aún no implementado. Respaldar juntos base e identidad. La migración no crea identidades ni importa licencias automáticamente.

`license_imports` conserva el documento firmado, referencia comercial y auditoría LICENSE_IMPORTED. El historial no admite actualización ni eliminación. Un trigger también impide retroceso de revisión y cruce de empresas al insertar. La comprobación criptográfica y de todas las condiciones ocurre en la aplicación; la separación real de roles SQL sigue siendo requisito de despliegue.

Para consultar estado por HTTP, configurar en el proceso web NEXO_INSTALLATION_FILE y NEXO_LICENSE_TRUSTED_KEYS_FILE. Nunca configurar allí la clave privada. Un OWNER autenticado puede consultar GET /api/licenses y GET /api/licenses/history (limit/offset); AGENT y CUSTOMER no tienen acceso. No existen POST/PATCH de importación. Sin configuración válida, la consulta de estado responde 503 LICENSE_CONFIGURATION_REQUIRED; el historial sigue disponible al propietario. Estos errores no afectan rutas de inventario o venta.

El estado selecciona la mayor revisión ya efectiva; las futuras mayores quedan programadas. Una revisión inmediata superior supera futuras inferiores. Cada consulta vuelve a verificar las firmas con las claves confiables actuales. Una clave retirada produce INVALID_SIGNATURE cuando esa revisión corresponde, sin volver a una revisión anterior. El historial HTTP omite documentos, firmas y hashes. El estado devuelve las condiciones solo si su firma sigue siendo válida. Una cancelación también requiere nueva revisión comercial y licencia firmada importada; no hay revocación remota automática.

## Límites y próximo bloque

El comando verify sigue siendo una comprobación aislada: no consulta el historial ni garantiza que el documento sea la revisión más reciente. El importador sí impide retroceso respecto de la base actual. Restaurar una copia antigua de la base también restaura su máximo conocido; no hay autoridad remota que detecte esa restauración. Tampoco se impide cambiar el reloj, copiar la identidad o modificar el código y las claves públicas en un servidor controlado por un cliente. No afirmar protección contra manipulación del anfitrión. Las políticas de expiración, planes y capacidades requieren definición explícita antes de imponer restricciones. No hay cobros, licencias automáticas ni límite de stock en esta entrega. Próximo trabajo: operación reproducible y seguridad del despliegue; los proveedores reales continúan pendientes.
