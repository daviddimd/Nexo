# Desarrollo local con un comando

Desde la carpeta del proyecto ejecutar `npm run dev`. Requiere Node24, dependencias instaladas y PostgreSQL instalado. En Windows detecta PostgreSQL18/17/16 en Program Files; también admite NEXO_PG_BIN o herramientas en PATH.

La primera ejecución inicializa un clúster exclusivo en .nexo/postgres (loopback, puerto55440, autenticación SCRAM y contraseña aleatoria), crea nexo_dev, aplica migraciones y arranca Next y el worker de reservas. Las siguientes reutilizan datos y credenciales. No usa la base temporal de pruebas ni el servicio PostgreSQL de otros proyectos. No crea productos, sucursales ni usuarios automáticamente.

La web queda en http://localhost:3000/panel. PORT permite escoger otro puerto. Si ya hay un servidor abierto, detenerlo con Ctrl+C antes de ejecutar el nuevo comando. No detiene procesos ajenos ni el servidor anterior automáticamente. Ctrl+C detiene los procesos hijos y PostgreSQL si este comando lo inició; si ya estaba iniciado, lo conserva. Sin supervisión de producción ni reinicio automático ante fallos: si web o worker termina, se detiene el grupo.

Se guardan credenciales locales en .nexo/dev.json. Si .env no existe, se crea con conexiones locales y origen; nunca se reemplaza un .env existente. No compartir ni subir esos archivos. .nexo y .env están ignorados por Git; revisar ACL de Windows. Se usa un administrador exclusivo de este clúster para simplificar desarrollo; no es la separación de roles exigida para producción. No ejecutar en NODE_ENV=production.

Si existe DATABASE_URL apuntando a otra base, el comando integrado la rechaza y no la migra. Para conservar un entorno externo, usar `npm run dev:web`, que solo inicia Next; gestionar PostgreSQL, migraciones y worker separadamente. No borrar .nexo para solucionar un error: contiene los datos locales persistentes. Respaldar antes de mover o reinstalar.

Después del primer arranque, las herramientas administrativas del proyecto pueden leer .env y utilizar la base local; las cuentas iniciales se crean con company:create/company:onboard según sus instrucciones. El inicio integrado habilita pago simulado y correo cifrado local, sin cobros ni envío de correo reales. El origen del proceso se fija a localhost y el puerto elegido: abrir esa dirección, no una URL anterior del entorno de pruebas.

Actualización5A3: npm run dev habilita el asistente local de primera empresa en /configurar cuando la base está vacía. Permite elegir correo y contraseña desde la web; no hay cuenta predeterminada. Reiniciar procesos previos para activar esta opción. En producción está bloqueado.

Acceso local: en desarrollo se aceptan localhost y127.0.0.1 como alias únicamente con el mismo puerto/protocolo configurados y destino loopback. Otras direcciones/puertos y solicitudes cross-site siguen rechazadas. Producción conserva coincidencia exacta de origen. Usar http://localhost:3000/panel para la configuración por defecto, no el puerto3107 de pruebas anteriores.
