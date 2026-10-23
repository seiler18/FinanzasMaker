# 0003 — Transiciones e interacción: la página responde al tocarla

- **Fecha:** 2026-09-27
- **Estado:** completado
- **Commits:** el de este hito

## Contexto

Jesús pidió más transiciones y que la página fuera más interactiva. Hasta
aquí era un informe estático: todo aparecía de golpe y solo los filtros de
movimientos respondían a un clic.

## Qué se hizo

- **Aparecer al llegar** (`src/lib/movimiento.js`, `src/styles/movimiento.css`):
  cada sección entra al hacer scroll (IntersectionObserver); dentro, los
  mosaicos en cadena, las barras crecen desde cero y las columnas de
  dividendos suben. La cifra grande y los mosaicos cuentan hasta su valor.
- **Detalle de un activo** (`abrirActivo` en `main.js`): tocar una barra, una
  fila de la cartera, una del resultado por activo o una de movimientos abre
  el activo con su resultado, costo frente a valor de hoy, datos y todos sus
  movimientos. En el celular sale como hoja desde abajo.
- **Tabla de la cartera ordenable** por cualquier columna; las filas se
  deslizan a su lugar nuevo (View Transitions).
- **Mosaicos que llevan a su sección**, con un destello al llegar; «Invertido»
  y «Recibido por ventas» dejan los movimientos filtrados.
- **Dividendos**: tocar un mes muestra de qué activos vino.
- **Movimientos**: cada filtro dice cuántos hay, búsqueda por activo, filas
  que entran al cambiar el filtro.
- **Tema claro/oscuro con botón** (`src/lib/tema.js`, `ga_tema`): tokens.css
  ya tenía el oscuro por `data-theme`, pero nada lo ponía.

## Decisiones y alternativas descartadas

- **Todo sale del cálculo que ya había** (`calcularCartera`): el detalle no
  pide nada nuevo a la API, así que el contrato no cambia (regla 4).
- **El nombre de transición de cada fila sale de su índice, no del ticker:**
  «BRK.B» no es un identificador CSS válido y rompería la transición.
- **Chrome headless con `--screenshot` no sirve para revisar esto:** congela
  las animaciones y deja las secciones sin revelar. Se verificó con
  `playwright-core` desde el scratchpad, bajando la página y probando los
  clics (ver hito 0005 de FinanzasMaker, que dio con esto primero).

## Consecuencias

- Dos errores encontrados al probar y corregidos: la fila de filtros
  deslizable estiraba la página en el celular (faltaba `min-width: 0` en
  `.mov-controles`), y el botón de tema leía el tema antes de que la View
  Transition lo aplicara, así que mostraba el ícono equivocado.
- Con «menos movimiento» en el sistema los tokens de duración valen 0 y
  todo aparece de una vez.

## Pendiente

Ninguno.
