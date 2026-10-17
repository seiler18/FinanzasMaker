# Pendientes

Lo que queda por hacer a mano o por decidir (hitos 0013 a 0015). Se tacha y se
borra cuando esté hecho. El repo es público: aquí no van claves.

## 1. Al pegar el Apps Script la próxima vez

La 0008, la 0009 y la función están desplegadas, y los avisos crudos se
releyeron (2026-10-16, hito 0016). Solo quedan crudos el cashback depositado
de MACH (a propósito) y la prueba de conexión de la app.

`backend/Code.gs` cambió solo en `CONFIG_BASE` (la clave `bancos_por_aviso`):
el trabajador no la usa, así que se puede pegar en la próxima pasada de
`desplegar-backend`, sin apuro.

## 2. La app v0.3.0: pantallas propias (hito 0017)

Escrita y probada en el PC el 2026-10-17; no publicada. La v0.2.0 abría
esta página en el navegador (Edge en el celular); la v0.3.0 entra con Google
de forma nativa y dibuja el resumen, los movimientos y los consejos.

1. **Google Cloud, una vez:** en el proyecto del cliente web, crear un «ID de
   cliente de OAuth» tipo **Android**, paquete
   `io.github.seiler18.finanzasmaker`, SHA-1
   `04:17:6E:0E:31:FC:B1:6A:CF:D0:2B:24:F9:0D:52:BD:FD:14:93:CC` (la firma de
   Releases). Sin esto la app no puede entrar. Detalle en el README de la app.
2. Publicar la v0.3.0 (skill `publicar-version` de la app) e instalarla
   **encima** desde Releases.
3. En el celular:
   - «Continuar con Google» abre la hoja de cuentas y entra;
   - el resumen de octubre da las mismas cifras que esta página;
   - Movimientos, Consejos y el detalle de cada tarjeta;
   - Ajustes: los pasos en verde; si la clave falta, «Vincular este celular»;
   - mantener presionado el ícono → «Avisos» abre Ajustes;
   - los avisos siguen llegando (aquí, Ajustes → Celular).

## 3. Apagar el correo, banco por banco

En Ajustes → Celular, «Qué llega por el celular» dice por banco cuánto llegó
por aviso y cuánto solo por correo. Cuando un banco lleve un tiempo sin nada
«solo por correo», agregarlo en Configuración → `bancos por aviso`. Desde ahí
su correo solo completa lo que trajo el aviso; lo que llegue sin aviso aparece
en «Por revisar» con el motivo «Llegó por correo y no por el celular».

Para eso faltan formatos de aviso. Cada uno necesita un aviso real; cuando
llegue, queda crudo y se ve en Ajustes → Celular:

- MACH: transferencia enviada, pago de la tarjeta, cashback depositado (este
  se dejó crudo a propósito, hito 0014);
- Tenpo: transferencia recibida, pago de la tarjeta;
- BancoEstado: transferencia recibida, compras;
- Copec Pay y Mercado Pago: todavía no mandaron ningún aviso de movimiento.

Al sumar uno: lector y fixture (`lectores.js`, `tests/avisos.test.mjs`),
desplegar la función y releer los crudos (punto 1).

Fintual sigue por correo (sus avisos no traen el monto).

## 4. Probar las cartolas de septiembre en la página publicada

Los estados de cuenta de las tarjetas MACH y Tenpo ya se probaron contra los
PDF reales de `estados-de-cuenta/` (cuadran al peso). Faltan las dos
**cartolas de cuenta** (MACH y Copec Pay), que no están en este PC.

En Agregar → Subir una cartola, subirlas y revisar:

- que diga «Cuadra al peso»;
- que lo marcado como faltante de verdad falte;
- que lo ya registrado aparezca como «Ya registrados».

Lo marcado se agrega a la base de verdad: se puede ensayar antes en la demo
(`?demo`). Para repetir la prueba automática, dejarlas en `cartolas/`.

## 5. Más adelante

- **Salir de Apps Script salvo para Fintual.** Con los bancos por aviso, al
  trabajador le quedan los correos de Fintual, los precios (Yahoo) y las
  alertas. Precios y alertas podrían pasar a funciones de Supabase con
  `pg_cron`; Fintual sigue necesitando leer Gmail.
- **No guardar los códigos de validación** que llegan en avisos (Tenpo): hoy
  quedan en `notificaciones`, marcados ignorados.
- **Otras cartolas** vistas en el correo: Santander, Prex y Tenpo Inversiones.
  Dejar el PDF en `cartolas/` y su clave en `.env`, y pedir que se agregue
  el formato (skill `agregar-banco`).
- **Gradle 9.x de la app, junto con AGP 9.** La app ya está en Gradle 8.14.6
  (la última de la línea 8). La 9.6 o posterior no funciona con AGP 8.x, y el
  plugin de Kotlin actual solo declara compatibilidad hasta Gradle 9.0: se suben
  juntos y verificando, en un cambio aparte.
- **Play Protect** bloquea la app (firma propia, fuera de Play Store). Hoy está
  apagado el análisis de apps; la salida definitiva es publicarla en Play
  Store (pista interna).
- **Auditoría de ciberseguridad completa.**
