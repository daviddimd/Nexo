# Invitaciones de personal · 4B2

Invitar no crea una cuenta ni entrega contraseña: solo reserva un correo para incorporarlo como personal de esa empresa. El destinatario crea su contraseña al aceptar el token. Funciona mediante correo local cifrado, sin enviar emails reales y bloqueado en producción. Requiere configuración de correo de REGISTRATION.md.

## Crear y consultar

Solo OWNER de la empresa de sesión:

`POST /api/invitations` con `Idempotency-Key` de 8–128 caracteres seguros:

```json
{
  "email":"agente@example.test",
  "role":"AGENT",
  "locationIds":["UUID-SUCURSAL"],
  "reason":"Incorporación al equipo"
}
```

role por defecto AGENT. OWNER debe solicitarse explícitamente y exige locationIds vacío: otorga todos los permisos administrativos, no un acceso limitado. Un AGENT sin ubicaciones no puede operar stock en ninguna. Ubicaciones deduplicadas y activas de la misma empresa. Correo normalizado en minúsculas. Rechaza cuentas existentes, incluso CUSTOMER o desactivadas; no convierte ni reemplaza credenciales de una cuenta. Para cuentas existentes usar administración normal. No editar invitación emitida: revocar y emitir otra.

Devuelve 201, o 200 al repetir misma clave y datos; cambiar datos con esa clave produce 409. Repetir una clave de invitación cerrada devuelve el registro histórico, no revive ni reenvía. Máximo una invitación PENDING por correo/empresa; se expiran pendientes vencidas al crear/listar/revocar. El token no está en respuestas, listados, logs ni auditoría.

`GET /api/invitations?limit=50&offset=0` lista historial privado: PENDING/ACCEPTED/REVOKED/EXPIRED, rol, ubicaciones, creador, fechas y cuenta aceptada. Nunca token/hash/request_hash. El correo público de registro reservado por una invitación pendiente vigente no crea CUSTOMER: devuelve respuesta genérica; evita que un registro público ocupe la dirección del personal invitado.

## Aceptar

`POST /api/auth/accept-invitation`, sin sesión:

```json
{
  "company":"slug-empresa",
  "token":"TOKEN_LOCAL",
  "name":"Nombre del integrante",
  "password":"CONTRASEÑA_ELEGIDA"
}
```

Contraseña 12–128 caracteres. No acepta role, locationIds, email, active ni companyId: todo permiso procede del snapshot privado. Token aleatorio de 256 bits, hash en base, siete días y un solo uso. Empresa ligada al token. Token desconocido, vencido, revocado, consumido o de otra empresa devuelve INVITATION_INVALID/400 sin crear cuenta. Un token de verificación/reset no funciona para invitar ni al revés.

Dentro del bloqueo de empresa vuelve a validar vencimiento con reloj actual, autoridad del creador y ubicaciones. Creador debe seguir activo OWNER y habilitado para iniciar sesión (verificado o administrado exento). Si una ubicación se desactivó, no se acepta ni se degrada silenciosamente el permiso: reactivar o revocar/emitir una nueva. Cuenta creada mientras estaba pendiente causa ACCOUNT_EXISTS, sin reemplazarla. Solo se crean usuarios nuevos.

Crear usuario, asignar ubicaciones, aceptar invitación y registrar auditoría son una transacción. Dos aceptaciones simultáneas crean una cuenta; competir con revocación produce un único resultado. Devuelve `{ "ok":true, "signInRequired":true }`, sin cookie ni sesión automática. El nuevo personal queda active=true, email_verification_required=true y timestamp de posesión del token LOCAL; esto prueba el flujo de correo simulado, no entrega real a buzón. Posteriormente, cambiar su correo exige verificarlo otra vez.

## Revocar o renovar

`POST /api/invitations/{id}/revoke`, OWNER, `{ "reason":"Motivo" }`. Solo pendientes. Repetir una ya revocada devuelve estado original sin duplicar auditoría ni sustituir el motivo original. Aceptadas/vencidas producen 409. Revocación no desactiva un usuario ya incorporado: administrar esa cuenta.

Para renovar o corregir: revocar la pendiente y crear otra con nueva Idempotency-Key. El token anterior queda inutilizable; la nueva tiene siete días y snapshot propio. No hay reenvío que reutilice tokens.

Desactivar o degradar al creador OWNER revoca permanentemente todas sus pendientes mediante trigger. Reactivarlo/promoverlo después no las revive. El evento USER_UPDATED conserva el cambio de autoridad y la invitación conserva REVOKED/closed_at; las revocaciones explícitas registran motivo en INVITATION_REVOKED.

## Correo, límites y auditoría

Misma outbox cifrada AES-256-GCM. CLI `npm run mail:local -- UUID_EMPRESA` lista mensajes disponibles de cuentas e invitaciones. Agregar UUID_MENSAJE exporta en .local-mail ignorada por Git, sin imprimir token ni sobrescribir. Vista available_local_mail excluye mensajes consumidos/revocados/vencidos. Token solo en exportación local sensible; eliminar después de probar. No existe bandeja HTTP. Correo real pendiente.

Veinte intentos de emisión por OWNER/empresa cada 15 minutos, incluidos conflictos y errores comerciales. Aceptación: cinco por hash de token/empresa y 500 agregados por slug cada 15 minutos, persistentes. Límites por IP y carga siguen pendientes. Listado/revocación autorizados permanecen disponibles con correo deshabilitado; crear/aceptar exige local habilitado y desarrollo.

Auditoría append-only: INVITATION_CREATED con actor OWNER, correo/rol/ubicaciones/motivo; INVITATION_REVOKED con actor y motivo; INVITATION_ACCEPTED actor NULL, entidad invitación y detalles de cuenta/rol/ubicaciones. Nunca token, contraseña o hash. La invitación original y sus permisos son inmutables en PostgreSQL; no se borra historial.

Migración 007 mantiene tokens/correos 006; un mensaje referencia exclusivamente token de cuenta o invitación. No cambia stock, pedidos ni sesiones existentes. Pendiente: transporte real de correo, pantallas de aceptación y retención/purga; las licencias y suscripciones corresponden a 4C.
