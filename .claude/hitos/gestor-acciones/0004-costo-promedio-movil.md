# 0004 — Costo promedio móvil (como Fintual) y correos leídos también en la papelera

- **Fecha:** 2026-09-27
- **Estado:** completado en el repo; falta pegar `backend/Code.gs` en la hoja
- **Commits:** el de este hito

## Contexto

Jesús vio que un activo salía con pérdida realizada en el dashboard donde
Fintual le muestra ganancia realizada, y con la no realizada también
distinta. También pidió que el resultado total se leyera
mejor, con animaciones e interacción como en FinanzasMaker.

## Qué se encontró

Con los correos de Fintual de ese activo (leídos para el diagnóstico en el
scratchpad; los montos no van al repo, regla 1): se vendieron todas las
acciones y meses después se volvió a comprar, más caro.

- **El costo promedio era el de TODAS las compras**, en `cartera.js` y en las
  fórmulas SUMIFS de `buildPosiciones`. La compra de 2026 encarecía el costo
  de las acciones vendidas en 2025: la venta aparecía con pérdida y la
  posición nueva con ganancia. El total era el mismo; el reparto entre
  realizado y no realizado no.
- Con **costo promedio móvil** (el costo que tenías el día de cada venta) da
  exactamente lo de Fintual, al centavo: realizado, no realizado, sus
  porcentajes y el costo promedio.
- **FinanzasMaker manda a la papelera los correos de Fintual** («Invertiste»,
  «Vendiste», «Recibiste un dividendo») tras anotarlos, y el gestor los
  buscaba sin mirar la papelera. FinanzasMaker corre cada hora y el gestor
  cada 8: una compra nueva podía no llegar nunca al gestor. La compra más
  reciente de ese activo ya estaba en la papelera; el gestor la tenía porque
  la importó antes de que existiera FinanzasMaker.
- **Los precios**: la hoja los trae de Yahoo Finance solo cuando corre (cada
  8 h por defecto), así que pueden ir horas detrás del que muestra Fintual.

## Qué se hizo

- `src/lib/cartera.js` — `costoPromedioMovil()`: recorre compras y ventas en
  orden; cada venta sale al costo promedio de ese momento. `costoAbierto` es
  el costo de lo que se tiene hoy.
- `backend/Code.gs` — `costoPromedioMovil_()` con la misma cuenta;
  `buildPosiciones` escribe H (precio prom.) y K (G/P realizada) como valores.
  La búsqueda de correos pasa a `in:anywhere`.
- `tests/cartera.test.mjs` — el caso de cerrar y reabrir, el orden
  cronológico, y una prueba que **ejecuta `Code.gs` en Node** y compara con
  `cartera.js`: la regla 3 del CLAUDE.md ya no depende de la memoria.
- `src/demo.js` — la hora de los precios va en hora local sin zona, como la
  manda la hoja (el contrato); con `toISOString()` la demo aparentaba precios
  de hace 3 h.
- **Resultado total** (`resumen()` en `main.js`, `movimiento.css`): la línea
  «realizado · no realizado · dividendos» pasó a ser tres tarjetas unidas por
  «+», cada una con su barra y abierta en un desglose por activo (del que se
  entra al detalle de cada uno); porcentaje sobre lo invertido; halo del color
  del resultado; «Precios de hace N h» con un punto que late.

## Decisiones y alternativas descartadas

- **Costo móvil y no FIFO.** Es el promedio ponderado que ya usaba la hoja,
  bien aplicado en el tiempo, y cuadra con Fintual en el caso real. FIFO da lo
  mismo cuando se vende todo, pero no en ventas parciales.
- **H y K como valores y no fórmulas:** el costo móvil necesita recorrer los
  movimientos en orden, y eso no se expresa con SUMIFS. Se recalculan cada vez
  que corre la tarea; una fila cargada a mano se refleja en la siguiente
  pasada.
- **Arreglar en el gestor (`in:anywhere`) y no en FinanzasMaker.** Que
  FinanzasMaker deje de borrar los correos de Fintual llenaría la bandeja que
  el dueño eligió limpiar. La papelera guarda 30 días y el gestor corre cada
  8 h. Queda anotado en `FinanzasMaker/backend/Lectores.gs`.
- **Los precios no se piden en vivo desde la página:** la CSP y CORS no dejan
  llamar a Yahoo desde el navegador, y pedirlos en cada llamada a la API
  la haría lenta. Se muestra su antigüedad; si hace falta más frescura, se
  baja «Trigger cada (horas)» en Configuración.

## Consecuencias

- La página muestra ese activo como Fintual apenas se publica: el front calcula
  con los movimientos que ya entrega la API.
- La hoja (pestañas Posiciones, Resultados y Dashboard) sigue con la fórmula
  vieja hasta que se pegue `Code.gs`.

## Pendiente

- Pegar `backend/Code.gs` en la hoja (skill `desplegar-backend`). No hace
  falta nueva versión de la aplicación web: `Api.gs` no cambió.
- Luego, menú Fintual → Actualizar, para que rehaga Posiciones y lea los
  correos que estaban en la papelera.
