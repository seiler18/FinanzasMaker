# 0007 — Fecha contable y resumen tipo tablero

- **Fecha:** 2026-10-01
- **Estado:** completado en el código (falta redesplegar el backend y revisar el celular)
- **Commits:** sin commitear al escribir esto

## Contexto

Un sueldo de $3.000.000 correspondiente a octubre se depositó el 30 de
septiembre: septiembre mostraba el ingreso doble y octubre salía sin ingresos,
lo que falsea la tasa de ahorro y todo análisis de gastos. Jesús pidió además
un resumen más tecnológico, con mejores gráficos, animación e interacción.

## Qué se hizo

- **`fecha_contable`** (columna nueva al final de Movimientos, opcional,
  `AAAA-MM-DD`). Si existe, el movimiento cuenta en ese día; `fecha` sigue
  siendo cuándo ocurrió. `diaContable()` en `analisis.js` es el único punto
  que decide el periodo: `enRango`, `serie` y los consejos pasan por él.
- Se edita en Movimientos → «Contar en el día» (botones «Mes siguiente» y
  «Quitar»), para cualquier origen, no solo manuales. La lista agrupa por día
  contable y marca «llegó el vie 30 sep».
- `hoja_()` escribe el encabezado de columnas nuevas en planillas existentes
  (una vez por ejecución): sin eso la columna existiría sin nombre.
- Resumen: cabina oscura con anillo de ahorro, tarjetas con sparkline y
  variación vs el periodo anterior, gráfico de área (alterna con barras),
  dona de gastos enlazada con la lista, calendario de calor del mes.
  Código en `src/lib/tablero.js` y `src/styles/tablero.css`.
- Un mes sin ingresos pero con gastos muestra la pista de «Contar en el día».

## Decisiones y alternativas descartadas

- **Manual por movimiento, no automático.** Nada en el correo dice a qué mes
  corresponde un depósito; adivinar por «últimos días del mes» movería
  ingresos que sí eran de ese mes.
- **Gastos con la misma regla.** Una compra con tarjeta que se cobra después
  también puede fijarse; no hay lógica aparte.
- Sin librería de gráficos: SVG a mano, como el resto (CSP y peso).

## Pendiente

- Redesplegar `Code.gs` como versión nueva (skill `desplegar-backend`).
- La revisión en celular real no se hizo: Chrome headless no baja de ~500 px.
