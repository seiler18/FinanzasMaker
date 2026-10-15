# Pendientes

Lo que queda por hacer a mano o por decidir (hito 0013). Se tacha y se borra
cuando esté hecho. El repo es público: aquí no van claves.

## 1. Probar las cartolas de septiembre en la página publicada

Los estados de cuenta de las tarjetas MACH y Tenpo ya se probaron contra los
PDF reales de `estados-de-cuenta/` (cuadran al peso). Faltan las dos
**cartolas de cuenta** (MACH y Copec Pay), que no están en este PC.

En Agregar → Subir una cartola, subirlas y revisar:

- que diga «Cuadra al peso»;
- que lo marcado como faltante de verdad falte;
- que lo ya registrado aparezca como «Ya registrados».

Lo marcado se agrega a la base de verdad: se puede ensayar antes en la demo
(`?demo`). Para repetir la prueba automática, dejarlas en `cartolas/`.

## 2. Comprobar los lectores de avisos con una compra real (hito 0014)

La migración 0007 y la función `notificacion` (versión 4) ya están desplegadas
(2026-10-14). Falta verlas funcionar:

1. Hacer una compra chica con MACH o Tenpo, o recibir una transferencia en MACH.
2. En la página debe aparecer como movimiento a los segundos, con su categoría.
3. Cuando llegue el correo (hasta 30 min), **no** debe aparecer una segunda
   fila: la existente se completa con el comercio y las cuotas.
4. Pedirle a Claude que revise en la base el aviso y el movimiento
   (`notificaciones.estado`, `movimientos.origen`).

Si un aviso queda `cruda`, es un formato que aún no se lee: dejar su texto
como fixture en `tests/avisos.test.mjs` y sumar el lector.

## 2b. Más formatos de aviso

Faltan las transferencias enviadas de MACH, Copec Pay, Mercado Pago y
BancoEstado; hace falta un aviso real de cada uno. También el cashback
depositado de MACH, que se dejó crudo a propósito (hito 0014).

## 3. Más adelante

- **Salir del todo de Apps Script**, por fases y cuando la anterior esté probada:
  1. los avisos cubren compras y transferencias (hecho, falta verlo con datos reales);
  2. Fintual, precios (Yahoo) y alertas pasan a funciones de Supabase con
     programación (`pg_cron`);
  3. apagar los disparadores y el correo.
- **No guardar los códigos de validación** que llegan en avisos (Tenpo): hoy
  quedan crudos en `notificaciones`.
- **Otras cartolas** vistas en el correo: Santander, Prex y Tenpo Inversiones.
  Dejar el PDF en `cartolas/` y su clave en `.env`, y pedir que se agregue
  el formato (skill `agregar-banco`).
- **Gradle 8.14.3** de la app: GitHub avisa que está desactualizado. Va en un
  cambio aparte.
- **Play Protect** bloquea la app (firma propia, fuera de Play Store). Hoy está
  apagado el análisis de apps; la salida definitiva es publicarla en Play
  Store (pista interna).
- **Auditoría de ciberseguridad completa.**
