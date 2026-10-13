# Registro, verificación y recuperación · 4B1

Este bloque permite probar el flujo público completo mediante correo **local**. No envía mensajes, no comprueba entrega en un buzón real y no está habilitado en producción. El timestamp de verificación durante estas pruebas representa posesión del token local, no confirmación de recepción de correo real. Las cuentas existentes se conservan exentas de verificación; no se inventa una fecha para ellas.

## Configurar pruebas locales

En `.env`, `NEXO_LOCAL_MAIL_ENABLED=true` y `NEXO_LOCAL_MAIL_KEY` con 32 bytes aleatorios representados por 64 caracteres hexadecimales. Generar localmente con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` y guardar solo en configuración privada, nunca en código, tickets o logs. Conservar la clave: rotarla hace ilegibles los mensajes previos; solicitar mensajes nuevos. Clave inválida, flag apagado o NODE_ENV production produce MAIL_UNAVAILABLE/503. No se acepta transporte remoto ni fallback de correo silencioso.

Ejecutar migraciones y `npm run dev`. No hay pantallas de registro todavía: estas son rutas JSON del backend. Maximum cuerpo 64 KB, Origin validado, sin sesión para estos endpoints.

## Contratos públicos

| POST | Body | Resultado |
|---|---|---|
| `/api/auth/register` | `{ "company":"slug", "email":"cliente@example.test", "name":"Cliente", "password":"..." }` | 202 genérico |
| `/api/auth/resend-verification` | `{ "company":"slug", "email":"cliente@example.test" }` | 202 genérico |
| `/api/auth/verify-email` | `{ "company":"slug", "token":"..." }` | 200 ok; iniciar sesión |
| `/api/auth/forgot-password` | `{ "company":"slug", "email":"cliente@example.test" }` | 202 genérico |
| `/api/auth/reset-password` | `{ "company":"slug", "token":"...", "newPassword":"..." }` | 200 ok; sesiones revocadas y cookie borrada |

Correo normalizado en minúsculas, contraseña 12–128 caracteres, empresa identificada por slug público. Registro solo CUSTOMER, sin aceptar rol, estado, verificación, precio ni companyId. Duplicados no sobrescriben nombre/contraseña y no emiten un nuevo mensaje; usar reenvío explícito. Registro público no inicia sesión: login y operaciones autenticadas quedan bloqueados hasta verificar.

Solicitud inexistente, empresa inexistente, cuenta desactivada o no elegible devuelve el mismo cuerpo genérico 202 sin token ni IDs internos. No afirmar resistencia completa a diferencias de tiempo; faltan límites por IP y revisión antes de producción. Registro duplicado de personal no permite apropiarse de esa cuenta.

Verificación: vence a las 24 horas. Recuperación: vence a los 20 minutos y solo para cuenta activa ya verificada o administrada exenta. Reenvío invalida tokens pendientes anteriores de ese propósito. Token aleatorio de 256 bits, guardado como hash; uso único y empresa/propósito ligados. Una solicitud para otra empresa o usar token de verificación para reset falla con TOKEN_INVALID/400. No colocar tokens en rutas, query strings ni logs; consumir por POST body.

Cambio de correo, contraseña, rol o estado invalida tokens pendientes. Cambiar correo borra su verificación anterior. Reactivar no revive tokens. Restablecer contraseña revoca todas las sesiones, no inicia sesión automáticamente ni concede roles/activación/verificación. Un fallo comercial no consume un token válido ni confirma parcialmente una operación; consumo, cambio de cuenta y auditoría son transaccionales.

## Leer correo local

`npm run mail:local -- UUID_EMPRESA` lista hasta 50 mensajes utilizables con ID/destinatario/propósito/vencimiento; no imprime tokens.

`npm run mail:local -- UUID_EMPRESA UUID_MENSAJE` descifra y exporta exclusivamente a `.local-mail/UUID_MENSAJE.json`, sin sobrescribir un archivo existente. Contiene empresa, token, propósito y endpoint; construir el POST con los campos de la tabla, no enviar todo el archivo. El token es sensible: borrar la exportación después. Carpeta ignorada por Git; acceso al directorio debe restringirse al operador en Windows. No hay bandeja HTTP, endpoint OWNER ni ruta pública que entregue estos mensajes. La CLI requiere acceso a base y clave, y también está bloqueada en producción.

Mensaje cifrado AES-256-GCM con nonce aleatorio, autenticado a empresa e ID de mensaje. Token hash separado de payload cifrado. Registro y outbox se guardan juntos: un fallo al guardar correo revierte usuario/token/auditoría, evitando un registro sin posibilidad de verificar. No se registra SENT ni entrega falsa. La tabla es de prueba append-only; política de retención/purga de tokens y mensajes pendiente antes de producción.

## Límites y auditoría

Cinco solicitudes por buzón/empresa/acción cada 15 minutos; consumo por hash de token y acción con mismo límite, más 500 solicitudes por empresa/acción cada 15 minutos. Incluye solicitudes inexistentes y fallidas. Cinco intentos de cambio de contraseña autenticado por usuario/empresa en 15 minutos, incluidos errores de clave actual. Contadores persistidos separadamente para que un rollback comercial no borre el límite. El límite agregado puede bloquear temporalmente una empresa: afinar con límites por IP y carga antes de producción.

Auditoría registra CUSTOMER_REGISTERED, ACCOUNT_TOKEN_ISSUED (LOCAL_ONLY), EMAIL_VERIFIED y PASSWORD_RECOVERED sin contraseña/hash/token. Como son flujos públicos, actor_id es NULL y entity_id identifica la cuenta; no se atribuye una solicitud anónima a un administrador. Cuenta pendiente sigue active=true pero exige verificación; active=false sigue reservado para suspensión administrativa. GET users permite consultar email_verification_required y email_verified_at. Las altas CLI/OWNER anteriores permanecen administradas y exentas; no confundir exención con correo verificado.

## Fuera de este bloque

Invitaciones de personal implementadas en 4B2: ver INVITATIONS.md. El registro público no crea CUSTOMER si el correo está reservado por invitación vigente. Proveedor real de correo, dominios/remitentes, cola de envío/reintentos, páginas de enlaces/formularios, MFA y permisos de base separados antes de producción. El adaptador local no debe habilitarse por flag en producción ni reemplazar una comprobación real de correo. Compra invitada sigue pendiente.
