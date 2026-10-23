# 0006 — Tablero: anillo, área, dona, calendario de calor y sparklines

- **Fecha:** 2026-10-02
- **Estado:** completado en el código (sin commitear ni publicar al escribir esto)

## Qué se hizo

Mismo tratamiento que recibió el resumen de FinanzasMaker (hito 0007 de ese proyecto):

- `evolucion()` en `src/lib/cartera.js`: serie mensual acumulada (compras, ventas,
  dividendos, costo de lo abierto, realizado) con `costoPromedioMovil`, así el
  último mes cuadra con `calcularCartera` (`tests/tablero.test.mjs`).
- `src/lib/tablero.js` + `src/styles/tablero.css`: anillo de posiciones en
  ganancia, área «lo puesto y lo recuperado» con tooltip y teclado, dona de
  composición enlazada a su leyenda, calendario de calor por mes (compras, punto
  = dividendo) y sparklines en los mosaicos de invertido, ventas y dividendos.
- Tokens nuevos: `--serie-2`, `--cat-1…8`, `--dur-crece`. Paleta de la skill
  `dataviz`, validada en claro y oscuro (el aviso de contraste en claro lo cubre
  la leyenda rotulada).

## Decisiones

- El área no muestra «valor de la cartera en el tiempo»: el contrato no trae
  precios históricos, y inventarlos sería falsear. Se muestra lo que sí se sabe.
- Sin librería de gráficos: SVG a mano, por la CSP y el peso.

## Pendiente

- Publicar (skill `desplegar`). Revisar en celular real.
