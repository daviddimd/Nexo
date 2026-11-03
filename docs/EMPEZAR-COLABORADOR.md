# Descargar y ejecutar Nexo en Windows

## 1. Recibir acceso al repositorio privado

David debe abrir https://github.com/daviddimd/Nexo, entrar en **Settings → Collaborators → Add people** e invitar tu usuario de GitHub. Acepta la invitación con tu propia cuenta. Para descargar basta acceso de lectura; para subir cambios necesitas permiso de escritura.

## 2. Instalar los requisitos

- Node.js **24**: https://nodejs.org/en/download
- Git para Windows: https://git-scm.com/downloads/win
- PostgreSQL **18** con sus herramientas de línea de comandos: https://www.postgresql.org/download/windows/

Reinicia la terminal después de instalarlos. Comprueba:

```powershell
node --version
npm --version
git --version
Test-Path 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe'
```

Node debe indicar `v24...` y la última comprobación debe devolver `True` si usaste la carpeta habitual. No necesitas crear una base de datos manualmente ni usar la contraseña del usuario postgres del servicio instalado: Nexo crea su instancia local independiente en el puerto 55440.

## 3. Descargar el código

En PowerShell, desde la carpeta donde quieras guardar el proyecto:

```powershell
git clone https://github.com/daviddimd/Nexo.git
cd Nexo
npm ci
npm run dev
```

Git puede abrir el navegador para autenticarte. Usa la cuenta invitada al repositorio. No pegues contraseñas ni tokens en el comando.

`npm ci` instala las versiones del archivo de dependencias. Solo hace falta en la primera instalación y cuando cambien las dependencias.

`npm run dev` crea la base local, aplica migraciones e inicia la web y el proceso de reservas. Mantén abierta esa terminal. Usa **Ctrl+C** para detenerlo.

## 4. Crear tu acceso local

Abre **http://localhost:3000/configurar** y completa:

- Nombre de empresa.
- Identificador en minúsculas, números y guiones, por ejemplo `mi-tienda`.
- Tu correo de administrador.
- Una contraseña de al menos 12 caracteres.

Después entra en **http://localhost:3000/panel** con el identificador, correo y contraseña que elegiste.

La portada está en http://localhost:3000/ y la tienda puede abrirse desde el panel o mediante `http://localhost:3000/tienda?empresa=mi-tienda`, sustituyendo el identificador.

## 5. Datos locales y PrismaByte

**Clonar GitHub copia el código, no la base de datos de David.** Tu primera instalación estará vacía. Crea tus ubicaciones, productos y ventas desde el panel para trabajar con tus propios datos locales.

Las cuentas, contraseñas, productos cargados en PostgreSQL, pedidos, cotizaciones e importes actuales de PrismaByte no se publican en GitHub. No copies `.env` ni `.nexo` de otro equipo. Los comandos de semilla del repositorio están restringidos a una instalación local de PrismaByte ya preparada; no sustituyen el asistente de configuración de una instalación nueva.

## 6. Recibir cambios posteriores

Detén el servidor con Ctrl+C. Desde la carpeta del proyecto:

```powershell
git pull --ff-only
npm ci
npm run dev
```

Si tienes modificaciones locales, guárdalas en tu rama antes de actualizar. No uses `reset --hard` para resolver un aviso de Git.

Para aportar cambios con permiso de escritura:

```powershell
git switch -c mejora-mi-cambio
# Edita y comprueba tu cambio.
git add src
# Agrega también otros archivos concretos que hayas modificado, si corresponde.
git commit -m "Describe el cambio"
git push -u origin mejora-mi-cambio
```

Abre una pull request en GitHub. No subas `.env`, `.nexo`, contraseñas, respaldos o `node_modules`.

## Problemas habituales

- **Repository not found:** confirma que aceptaste la invitación y Git está usando la cuenta correcta.
- **No se reconoce npm o git:** reinstala o abre una terminal nueva para actualizar PATH.
- **No encuentra PostgreSQL:** comprueba la instalación. Si usaste otra carpeta, antes de arrancar define `$env:NEXO_PG_BIN='D:\PostgreSQL\18\bin'` con tu ruta real.
- **Puerto 3000 ocupado:** detén el proceso anterior o ejecuta `$env:PORT='3001'` y luego `npm run dev`; usa `http://localhost:3001` en todos los enlaces.
- **Origen no permitido:** usa `localhost` y el puerto que imprime el arranque; evita mezclarlo con `127.0.0.1`.
- **Configuración inicial no disponible:** la base ya tiene una empresa. Usa sus credenciales; no borres `.nexo` para intentar recuperar acceso.

Este procedimiento es para desarrollo local, no para publicar un servidor de producción.
