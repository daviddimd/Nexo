# Administración de empresas y cuentas · 4A

Cada comando usa empresa y actor de sesión; nunca acepta companyId del navegador. OWNER administra su empresa, AGENT opera sucursales asignadas y CUSTOMER compra/consulta. Un propietario tiene todos los permisos de su empresa; puede administrar a otros propietarios. Aún no hay permisos administrativos más finos.

## Usuarios

- `GET /api/users?limit=50&offset=0`: OWNER, lista campos públicos de cuenta y locationIds; no contraseñas/hashes. Incluye activos e inactivos.
- `POST /api/users`: OWNER, alta de AGENT/CUSTOMER existente; auditada. Nueva cuenta administrativa: crear AGENT y luego promover a OWNER, dos acciones deliberadas.
- `PATCH /api/users/{id}`: OWNER, `{ "name":"Nombre", "email":"correo@example.test", "active":true, "role":"AGENT", "locationIds":["UUID"], "reason":"Motivo del cambio" }`. Todos opcionales excepto reason y al menos un cambio. No enviar campos no necesarios.

El correo se normaliza a minúsculas, único dentro de la empresa. Cada usuario pertenece siempre a la misma empresa e identidad. No se convierten cuentas CUSTOMER a personal ni viceversa para conservar el vínculo comercial e historial. Roles AGENT/OWNER pueden cambiar. Solo AGENT tiene asignaciones: al promover se vacían automáticamente si no se especifican; al degradar OWNER a AGENT hay que indicar sucursales si debe operar en alguna. Un agente sin asignaciones no puede mover stock en ubicaciones.

locationIds reemplaza el conjunto completo, agrupa duplicados y solo admite ubicaciones activas de la misma empresa. Omitirlo conserva asignaciones en AGENT. OWNER/CUSTOMER con un conjunto no vacío se rechaza. La cuenta inactiva puede editarse o reactivarse. No hay borrado HTTP: desactivar mantiene ventas, movimientos e historial.

Nunca se desactiva/degrada al último OWNER activo. Protección transaccional por empresa y trigger PostgreSQL; dos cambios simultáneos no dejan la empresa sin administración. Si hay otro propietario, se admite desactivación/degradación propia y la sesión deja de servir.

Cambiar correo, estado, rol, contraseña o conjunto de sucursales revoca todas las sesiones afectadas. Cambiar solo nombre conserva sesiones. Repetir el mismo estado es un no-op sin auditoría duplicada. Los comandos vuelven a validar que el actor está activo y conserva su rol dentro de la transacción. Las altas de productos, sucursales y cuentas ahora comparten esa validación.

Desactivar un cliente no cancela ni reembolsa sus pedidos: permanecen auditables por administración y sus reservas vencen con las reglas existentes. Reactivar no recupera sesiones antiguas. No interpretar desactivar como anulación de ventas.

## Contraseñas

- `POST /api/auth/password`: cualquier usuario autenticado, `{ "currentPassword":"...", "newPassword":"..." }`. Exige contraseña actual válida, nueva distinta de 12–128 caracteres. Revoca todas las sesiones y borra cookie; volver a iniciar sesión.
- `POST /api/users/{id}/password`: OWNER para otra cuenta de su empresa, `{ "password":"...", "reason":"Restablecimiento autorizado" }`. Revoca sesiones. Para cambiar la propia usar la ruta anterior con contraseña actual. No verifica ni envía correos; es restablecimiento administrativo manual, no recuperación pública.

La aplicación no retorna contraseñas ni hashes y no los incluye en auditoría. No hay contraseña temporal ni obligación de cambio automático todavía. El administrador debe entregar credenciales por un canal apropiado fuera de Nexo. Login verifica que contraseña, estado y rol no hayan cambiado entre comprobación y creación de sesión; un reset concurrente no resucita una sesión con clave anterior.

## Empresa y personalización limitada

- `GET /api/settings/company`: OWNER.
- `PATCH /api/settings/company`: OWNER, `{ "name":"Mi tienda", "logoUrl":"https://example.test/logo.png", "primaryColor":"#2563eb", "contactEmail":"contacto@example.test", "contactPhone":"+56...", "about":"Descripción", "reason":"Configuración inicial" }`.
- `GET /api/public/{slug}/settings`: público, entrega nombre, logo, color, contacto, descripción, id/slug y poweredBy Nexo. Estos campos son deliberadamente públicos, no usar correo/teléfono privados.

reason obligatorio y al menos un campo; logoUrl y contactos admiten null para limpiar. Color hexadecimal de seis cifras, logo HTTPS. Solo guarda URL, no descarga ni almacena imágenes. No modifica slug, moneda, plan, ubicación WEB ni dominio. Sin CSS/HTML arbitrario, sin quitar Powered by Nexo. Datos preparados para la tienda futura; la página de estado no simula una tienda terminada ni aplica branding de una empresa arbitraria.

## Auditoría

`GET /api/administration/events?limit=50&offset=0`, solo OWNER. Registros append-only con actor, entidad, acción, fecha y detalles. Altas/cambios de cuentas, cambio/reset de contraseña, configuración de empresa, altas/cambios de ubicaciones y plazo de reserva. Cambios de cuentas/empresa conservan antes/después y motivo; contraseña solo acción/motivo, nunca clave/hash/token. Configuración de ubicaciones y pedidos usa el contrato existente sin motivo obligatorio. Productos, inventario, pedidos, pagos y posventa mantienen sus registros existentes; no afirmar que esta tabla cubre todos los accesos o eventos del sistema.

La API comprueba permisos y PostgreSQL protege historial, último administrador y revocación por cambios sensibles. Acceso directo con privilegios elevados no es un panel administrativo ni una API alternativa. Antes de producción separar roles SQL de ejecución/migración.

## Pendiente

4B1 agrega registro público de CUSTOMER, verificación/recuperación con tokens y correo local cifrado, y límite de cambio de contraseña; ver REGISTRATION.md. 4B2 agrega invitaciones de personal; ver INVITATIONS.md. Correo real, MFA, sesión por dispositivo/revocación selectiva, suscripciones/licencias y alta comercial automatizada pendientes. Pagos reales y proveedor tributario pendientes. La empresa se crea con CLI segura existente, no con endpoint público.
