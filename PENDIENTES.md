# Pendientes

Lo que queda por hacer a mano o por decidir (hitos 0013 a 0015). Se tacha y se
borra cuando esté hecho. El repo es público: aquí no van claves.

## 1. Desplegar la 0009 y releer los avisos crudos (hito 0016)

La 0008 y la función ya están desplegadas (2026-10-16). Falta la 0009 (la
función no cambia):

```
npx supabase db push
```

Después, releer los avisos crudos. El ensayo primero: los «nueva» se cruzan
con lo que trajo el correo antes de aplicar.

```
node scripts/releer-avisos.mjs                         # ensayo
node scripts/releer-avisos.mjs --aplicar --ignorar 11
```

Lo esperado:
- la transferencia BancoEstado → MACH del 2026-10-15 ($180.840) queda como
  «entre mis cuentas» en los dos bancos;
- MACH $319, $640 y $680 quedan como interna «Desde Copec Pay»;
- Tenpo $8.000 sale «ya-estaba»;
- la compra Tenpo de $14.748 del 14 de octubre entra (ningún correo la trajo);
- el #11 (MACH $5.000) se ignora: el correo ya lo trajo como «Bci».

`backend/Code.gs` cambió solo en `CONFIG_BASE` (la clave `bancos_por_aviso`):
el trabajador no la usa, así que se puede pegar en la próxima pasada de
`desplegar-backend`, sin apuro.

## 2. Instalar la app v0.2.0 (la página dentro de la app)

Publicada el 2026-10-16 (Release `v0.2.0`). `assetlinks.json` responde 200 y
la API de Digital Asset Links de Google ya lista el paquete con la huella de
la firma.

En el celular: instalar el APK **encima** desde Releases. Revisar:
   - el ícono abre la página, sin barra de URL;
   - mantener presionado el ícono → «Avisos» abre la pantalla propia;
   - en la página, Ajustes → Celular → «Estado de la app» también;
   - atrás desde la página cierra la app;
   - los avisos siguen llegando (Ajustes → Celular).

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
