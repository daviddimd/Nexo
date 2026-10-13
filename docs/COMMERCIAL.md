# Registro comercial · 4C1

Registro interno de condiciones de uso y cobertura, sin cobros ni precios. No verifica pago, no firma una licencia instalable ni aprovisiona servidores. La modalidad comercial se registra explícitamente; no depende del rol del propietario de la pyme. Los derechos contractuales y las políticas comerciales reales se definirán antes de activar restricciones o vender el producto.

## Dos modalidades, tres plazos

- SUBSCRIPTION: inicio y vencimiento de uso obligatorios, vencimiento posterior al inicio.
- PERPETUAL: inicio obligatorio y accessUntil NULL. Uso sin vencimiento temporal en el modelo; actualizaciones/soporte tienen sus propias fechas.
- updatesUntil y supportUntil obligatorios, independientes, nunca anteriores al inicio. No se asumen 12 meses ni cobertura indefinida; el operador debe poner lo acordado. Al llegar exactamente a cada vencimiento, ese plazo está vencido.

Estados comerciales calculados con reloj PostgreSQL: UNCONFIGURED, SCHEDULED, ACTIVE, EXPIRED y CANCELLED. Todos devuelven operationalRestriction NONE y billingEnabled false. No bloquean ventas, reservas, login, catálogo ni acceso a datos. Cancelar el registro no cancela pedidos ni revierte stock. Una cobertura de soporte/actualizaciones puede seguir vigente aunque termine la suscripción si así se registró; son fechas independientes, no promesa de servicio automático.

## Herramienta de operador

Solo CLI local con conexión privada `NEXO_OPERATOR_DATABASE_URL`, sin fallback a DATABASE_URL. Es configuración del operador de Nexo, no una credencial que se entrega a la pyme ni se incluye en su despliegue. Roles PostgreSQL de ejecución/migración/operación todavía deben separarse antes de producción; la separación por variable no sustituye permisos SQL ni es protección contra un administrador de la base.

Crear archivo JSON privado con todos los campos, sin contraseñas. Ejemplo ilustrativo de fechas, no una tarifa ni un periodo comercial por defecto:

```json
{
  "mode":"SUBSCRIPTION",
  "status":"ENABLED",
  "effectiveAt":"2026-10-12T00:00:00Z",
  "startsAt":"2026-10-12T00:00:00Z",
  "accessUntil":"2026-11-12T00:00:00Z",
  "updatesUntil":"2026-11-12T00:00:00Z",
  "supportUntil":"2026-11-12T00:00:00Z",
  "operator":"Responsable comercial",
  "reference":"Acuerdo interno 001",
  "reason":"Alta acordada",
  "expectedRevision":0
}
```

Fechas ISO con zona obligatoria, normalizadas a UTC. Para PERPETUAL poner mode correspondiente y accessUntil null. status ENABLED o CANCELLED. operator es etiqueta manual de procedencia, no identidad autenticada criptográficamente; reference es referencia interna libre, no comprobante de pago/boleta fiscal ni un número de licencia firmado. No guardar secretos en esos campos.

`npm run commercial:record -- UUID_EMPRESA CLAVE_IDEMPOTENTE RUTA_JSON`

Clave segura 8–128 caracteres. Primera revisión expectedRevision 0. Para cambiar condiciones, consultar latestRevision y emitir snapshot completo con ese valor; actualizaciones simultáneas con versión vieja fallan COMMERCIAL_REVISION_CONFLICT. Misma clave y mismos datos devuelve registro original, sin nueva revisión/auditoría; otros datos producen 409. Repetir una revisión anterior no deshace las posteriores: respuesta incluye resumen actual separado.

No existe POST/PATCH comercial HTTP, ni un endpoint que una empresa pueda usar para auto-concederse licencia. El CLI imprime empresa/revisión/estado, sin contraseña ni conexión. Renovar, corregir o cancelar requiere una nueva revisión y motivo; registros anteriores no se editan/borran y PostgreSQL exige secuencia consecutiva.

## Fechas de aplicación y programación

effectiveAt define cuándo entra en aplicación el snapshot; startsAt es inicio de su periodo de uso. Se usa la revisión más alta entre las que ya son efectivas. Una renovación con effectiveAt futuro no sustituye antes la actual. scheduled muestra solo revisiones futuras con número mayor que la actual; no conceden cobertura todavía.

Una nueva revisión inmediata superior sustituye a las anteriores, incluidas programaciones de menor número: no se reactivan después. Para cancelar una programación, registrar nueva revisión inmediata con las condiciones vigentes que se desean conservar; no usar status CANCELLED si solo se desea quitar una renovación futura. Este es un registro por snapshots, no una cola de cobros ni prorrateo.

## Alta comercial atómica

En entorno privado del operador configurar SETUP_COMPANY_SLUG, SETUP_COMPANY_NAME, SETUP_ADMIN_EMAIL, SETUP_ADMIN_PASSWORD y NEXO_OPERATOR_DATABASE_URL. No pasar contraseña por argumentos. Ejecutar:

`npm run company:onboard -- CLAVE_IDEMPOTENTE RUTA_JSON`

Crea empresa, administrador inicial y revisión 1 en una transacción. JSON debe llevar expectedRevision 0. Si falla cualquier parte, no deja empresa/administrador sin registro comercial. La contraseña inicial se guarda con scrypt; retirar SETUP_ADMIN_PASSWORD después.

Alta de empresa no tiene un recibo idempotente global: repetir slug existente se rechaza sin duplicar, aunque se repita clave. Ante respuesta interrumpida consultar la empresa antes de reintentar; no crear otro slug como solución. La idempotencia del comando de revisión es por empresa. El CLI existente company:create continúa disponible para alta técnica sin contrato y deja UNCONFIGURED deliberadamente.

## Consulta privada y auditoría

OWNER de la empresa de sesión:

- GET /api/commercial: asOf, latestRevision, state, current, scheduled, operationalRestriction y billingEnabled. current puede ser NULL; cada snapshot proyecta effective, accessStatus, updatesActive y supportActive. No inferir configuración actual a partir de latestRevision si hay cambios programados.
- GET /api/commercial/history?limit=50&offset=0: historial paginado de snapshots, referencia/motivo/operador. No hash ni clave idempotente. AGENT/CUSTOMER no acceden. Ningún dato comercial aparece en public/settings ni catálogo.

COMMERCIAL_RECORDED en auditoría administrativa, actor_id NULL y source OPERATOR_CLI, con etiqueta operador/referencia/motivo/revisión. El operador no se representa falsamente como un usuario de la pyme. Stock, pedidos, sesiones, tokens y mensajes quedan intactos.

## Pendiente

Licencias firmadas e identidad de instalación para despliegues independientes, asignación de planes/capacidades y límites, políticas explícitas ante mora/expiración y datos, facturación/cobros recurrentes, renovaciones automáticas, alojamiento/provisión, periodos definitivos de actualizaciones/soporte y documentos comerciales. No llamar a este registro sistema de cobro ni mecanismo contra copias. No hay garantía jurídica, SLA, hosting ni soporte permanente implícito en estos campos.
