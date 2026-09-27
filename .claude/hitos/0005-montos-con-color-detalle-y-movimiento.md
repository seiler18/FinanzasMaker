# 0005 — Montos con signo y color, detalle de las tarjetas, transiciones, celular y tema

- **Fecha:** 2026-09-27
- **Estado:** completado
- **Commits:** el de este hito

## Contexto

Jesús pidió que los ingresos se vean en verde con «+» y los egresos en rojo
con «−», en negrita; que al tocar una tarjeta del resumen se vea su detalle;
transiciones entre las vistas; que la app funcione mejor en el celular, y
poder elegir modo claro u oscuro (hasta ahora solo seguía al sistema).

## Qué se hizo

- **Signo y color** (`SENTIDO`, `conSigno`, `sentidoDe` en `src/lib/formato.js`;
  tokens `--mas`/`--menos`): ingreso y rescate van en verde con «+», gasto e
  inversión en rojo con «−»; interna y pago de tarjeta siguen sin signo
  porque no suman. Se aplica en las tarjetas, Movimientos, «En qué se fue»,
  Por banco, la tabla del gráfico y los gastos más grandes.
- **Detalle de cada tarjeta** (`abrirDetalle` en `src/vistas/resumen.js`):
  Ingresos y Gastos muestran el reparto por categoría y por contraparte
  (`porContraparte`, nuevo en `analisis.js`, con prueba) y los más grandes;
  Ahorro muestra la cuenta entró − salió y la compara con el periodo
  anterior; Invertido neto separa aportes y rescates. Desde ahí, «Ver en
  Movimientos» abre la lista ya filtrada por tipo.
- **Transiciones** (`conTransicion` en `main.js`, `src/styles/movimiento.css`):
  View Transitions con dirección (adelante/atrás según el orden de las
  pestañas y de ‹ ›, zoom al tocar un día del gráfico); la raya de la pestaña
  activa se desliza. Sin la API, la vista nueva solo entra. Además: tarjetas
  que entran escalonadas, barras que crecen, cifras que cuentan hasta su valor
  (`src/lib/cuenta.js`), diálogos que entran y salen.
- **Celular** (`src/styles/movil.css`, hasta 720 px): las pestañas bajan a una
  barra fija inferior con íconos; tarjetas de a dos; periodo en dos filas;
  gráfico deslizable de lado; el detalle sale como hoja desde abajo.
- **Tema** (`src/lib/tema.js`, botón en la barra): claro u oscuro elegido a
  mano y guardado en `localStorage` (`fm_tema`); sin elección, sigue al sistema.

## Decisiones y alternativas descartadas

- **`--mas`/`--menos` propios y no `--ok`/`--error`.** Los de estado son para
  avisos; separarlos deja afinar el contraste de los montos (≥ 5:1 en claro y
  oscuro, también sobre `--surface-2`) sin mover los avisos.
- **La inversión va en rojo.** Es plata que sale de la cuenta; en la tarjeta
  «Invertido neto» la cifra queda neutra porque no es un gasto.
- **Detalle como `<dialog>` y no como vista nueva:** se abre y se cierra sin
  perder el periodo ni el scroll del resumen, y no hace otra llamada al
  backend: todo sale de los movimientos ya cargados.
- **La barra inferior obliga a quitar `backdrop-filter` de la cabecera en el
  celular:** crea un bloque contenedor para los hijos `fixed` y la barra se
  quedaba pegada a la cabecera.
- **Chrome headless con `--screenshot` no sirve para revisar esto:** congela
  las animaciones en el primer cuadro (las cifras salían «contando» y los
  paneles invisibles). Se verificó con `playwright-core` en el scratchpad,
  esperando a que terminen, y probando los clics.

## Consecuencias

- Un error encontrado al probar: el `animationend` del cierre animado quedaba
  colgado y cerraba el diálogo en la siguiente apertura. `cerrarDialogo`
  (`dom.js`) lo quita al cerrar.
- `prefers-reduced-motion` apaga todo: animaciones, View Transitions y conteo.

## Pendiente

Ninguno.
