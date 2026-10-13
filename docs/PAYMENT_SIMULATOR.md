# Simulador de pagos · desarrollo exclusivamente

Protocolo propio de Nexo para probar el backend. No implementa Webpay ni Mercado Pago, no es una certificación y no realiza cargos reales. No copiar su firma como si fuera el protocolo de una pasarela futura.

## Habilitar localmente

En `.env`, después de configurar la base propia y migrarla:

```dotenv
NEXO_SIMULATOR_ENABLED=true
NEXO_SIMULATOR_SECRETS={"UUID-EMPRESA":"REEMPLAZAR-POR-SECRETO-ALEATORIO-DE-AL-MENOS-32-BYTES"}
```

Generar secretos aleatorios distintos por empresa y conservarlos solo en el servidor/gestor de secretos. Nunca enviarlos al navegador ni guardarlos en Git. El texto de ejemplo es un marcador, no una clave para utilizar. Reiniciar desarrollo tras cambiar configuración.

Ejecutar `npm run dev`; el simulador no funciona con `npm start` porque ese servidor utiliza modo producción, donde está bloqueado deliberadamente.

## Probar un pago

1. Crear un pedido con una cuenta cliente. En envío, requiere cotización aprobada.
2. `POST /api/payments/intents`, cookie de cliente, clave única y `{ "orderId":"UUID-PEDIDO" }`.
3. Desde el equipo del servidor: `npm run payments:simulate -- UUID-EMPRESA UUID-INTENTO SUCCEEDED`. Para fallo: sustituir SUCCEEDED por FAILED. IDs no son secretos; el secreto se toma del entorno, no de argumentos.
4. Consultar el pedido y el intento. La herramienta solo envía a loopback definido por APP_ORIGIN; no carga formularios de tarjeta ni retorna URL de pago real.

## Firma y recepción

Endpoint `POST /api/payments/simulator/{companyId}/webhook`. Cabeceras `Content-Type: application/json`, `X-Nexo-Timestamp` (segundos Unix) y `X-Nexo-Signature` (HMAC-SHA256 hexadecimal en minúsculas).

Cadena firmada: `companyId.timestamp.rawBody`. El cuerpo JSON exacto:

```json
{"eventId":"ID-UNICO-EVENTO","intentId":"UUID-INTENTO","transactionId":"ID-UNICO-TRANSACCION","status":"SUCCEEDED","amountMinor":"59990","currency":"CLP"}
```

eventId y transactionId: 8–128 caracteres alfanuméricos, `_` o `-`. La firma vincula también la empresa del path. Comparación en tiempo constante; tolerancia del timestamp ±5 minutos. Cambiar espacios o el cuerpo cambia la firma. Para reintentar después de cinco minutos, firmar el mismo cuerpo con timestamp nuevo. El hash de ese cuerpo debe coincidir si se conserva eventId.

La ruta no acepta una sesión como prueba de pago: exige firma. No usa Origin de navegador porque representa una llamada de servidor, sin conceder CORS. Si está deshabilitada devuelve 404; firma incorrecta o vencida, 401. Una empresa sin secreto válido no puede iniciar simulación.

## Resultados

- APPLIED: coincidieron importe/moneda, reserva vigente y pedido pendiente; descuento y ledger atómicos.
- IGNORED: transacción ya registrada o aviso de fallo. Un fallo no devuelve stock ni revierte un pago previo.
- REVIEW: confirmación con importe/moneda diferente, pedido vencido/cancelado/pagado o inconsistencia de reserva. Se registra la captura, sin nuevo descuento.
- Mismo eventId y cuerpo: mismo resultado con replayed true. Mismo eventId con otro cuerpo: 409. Misma transacción con datos distintos: 409.

Si llega una confirmación fallida y luego una exitosa firmada para el mismo intento, la exitosa se evalúa normalmente. Una confirmación con nueva transacción después de aplicar otra se registra como captura adicional para revisión. Nunca se sustituye ni descarta el primer registro.

`GET /api/payments/captures` permite revisar capturas a propietario/agentes de la ubicación. Agrega monto reembolsado y resolución auditada. 3B incorpora reembolsos simulados por OWNER y cierre de REVIEW tras devolver todo o comprobar monto cero; ver [AFTERSALES.md](AFTERSALES.md). PAID conserva historial de la confirmación aplicada; consultar posventa para reembolsos. Un intento REVIEW por sí solo no indica pedido pagado.

## Pasarela futura

Se deberá reemplazar la frontera de verificación y creación de transacción según la documentación del proveedor elegido, usar sus entornos de prueba y completar reconciliación/reembolsos antes de cobrar dinero. No se habilita producción cambiando un flag del simulador.
