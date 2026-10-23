# 0021 — Sugerencias en Inversiones, precio por acción y precios cada 5 min

- **Fecha:** 2026-10-23
- **Estado:** página publicada; falta pegar `Acciones.gs` y `Code.gs` y correr `programarDisparador()` (`PENDIENTES.md`)
- **Commits:** el que añade este hito
- **Sigue a:** [0020](0020-inversiones-sin-precios-por-el-largo-de-la-url.md) (los precios volvieron a actualizarse)

## Contexto

Con el arreglo del 0020 pegado, Jesús pidió el 2026-10-23 una sección de
sugerencias en Inversiones, basada en los precios y en lo vendido
últimamente, que se actualice cada 5 minutos:

- que sugiera **vender** cuando el precio de una acción supera lo que costó;
- que sugiera **comprar** cuando el precio baja de lo que la vendió. Su
  ejemplo: vendió 4,6037 acciones de SCHD a US$ 35,21 (US$ 162,10).

Notó además que el **precio por acción** de una venta, que trae el correo de
Fintual, no se veía en la página.

## Qué se hizo

- **`src/inversiones/lib/sugerencias.js`** (sin DOM, probado en
  `tests/inversiones-sugerencias.test.mjs` con el caso real de SCHD):
  - *Podrías vender*: posiciones abiertas con el precio de hoy sobre el
    costo promedio móvil, de más a menos ganancia. Las que pasan
    `umbral_venta_pct` se marcan: son las del aviso «VENDER?» por correo.
  - *Podrías recomprar*: la última venta de cada activo en los últimos 90
    días, si hoy está más barato que el precio al que se vendió. Dice cuántas
    acciones se compran con lo recibido y cuántas más que las vendidas.
  - *En espera*: esas mismas ventas cuando el precio sigue sobre el de venta.
- **Precio por acción** = `usd / cantidad` de cada compra y venta: columna
  nueva en Movimientos y «0,6000 acc. a US$ 79,17» en el detalle del activo.
  Para la venta de SCHD da US$ 35,21, el del correo. No se guardó aparte:
  sale de lo que ya está en la base.
- **Precios cada 5 min**: `actualizarPrecios` (Acciones.gs), disparador
  `everyMinutes(5)`, sale enseguida fuera del horario de Nueva York
  (`bolsaAbierta_`: lunes a viernes, 9:30 a 16:05). `actualizarAcciones`
  sigue cada hora con los correos y los precios.
- **La página se repinta cada 5 min** (`refrescar` en main.js) mientras está
  a la vista y al volver a ella: sin animar (`revelarAlVer(…, { sinAnimar })`)
  y en la misma posición. Se salta si hay un diálogo abierto o se está
  escribiendo en la búsqueda.
- En la cinta del celular, «Alertas» pasó a «Ideas» (lleva a Sugerencias):
  caben seis botones y las alertas siguen a la vista más abajo.

## Decisiones y alternativas descartadas

- **Precios en Supabase con `pg_cron` y una función:** descartado por ahora.
  Sumaba una migración, una función y un secreto. Con la bolsa abierta son
  unas 80 corridas al día de pocos segundos, dentro de las cuotas de Apps
  Script (regla 11). Queda en «Más adelante» de `PENDIENTES.md`.
- **Sugerir vender solo sobre el umbral:** Jesús pidió «mayor a lo que la
  compré»; se muestran todas y el umbral solo se marca.
- **Una columna `precio` en `acciones_operaciones`:** innecesaria mientras la
  comisión de las acciones sea US$ 0 (`usd` es «Recibiste» y coincide con el
  «Total»).
- **El aviso por correo** (`alertasAcciones`) no cambió: la recompra bajo el
  precio de venta se ve en la página, no llega por correo.

## Consecuencias

- La demo cuenta «últimamente» desde su último movimiento, para no quedarse
  sin ventas recientes con el paso del tiempo.
- La G/P realizada de la venta de SCHD es la del costo móvil: 162,10 −
  159,32 = US$ 2,78.

## Pendiente

- Pegar `Acciones.gs` y `Code.gs` y correr `programarDisparador()` una vez,
  para que exista el disparador de 5 min.
