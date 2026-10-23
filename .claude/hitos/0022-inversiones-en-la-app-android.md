# 0022 — Inversiones también en la app Android

- **Fecha:** 2026-10-23
- **Estado:** app v0.5.0 publicada el 2026-10-23; falta verla en el celular
- **Commits:** el que añade este hito; en FinanzasMaker-android, el de la v0.5.0 (hito 0006 allá)
- **Sigue a:** [0021](0021-sugerencias-de-inversiones-y-precios-cada-5-min.md)

## Contexto

Jesús pidió el 2026-10-23 que lo que ve en la página de Inversiones también
esté en la app del celular, que hasta aquí solo mostraba las finanzas.
Se habló de dejarlo estándar, con el proveedor configurable (Fintual, BTG,
Zesty…) para que lo use cualquiera; se decidió hacerlo primero solo para
él, con Fintual.

## Qué se hizo

Aquí no cambió nada de la página ni de la base: la app lee las mismas tablas
con la sesión (la RLS ya las cubría) y copia la lógica:

- `src/inversiones/lib/cartera.js` → `nucleo/Cartera.kt`;
- `src/inversiones/lib/sugerencias.js` → `nucleo/Sugerencias.kt`;
- `src/inversiones/lib/formato.js` → `nucleo/FormatoInv.kt`;
- `cartera()` de `src/inversiones/lib/api.js` → `Tablero.inversiones`.

Las pruebas de allá repiten `tests/inversiones-cartera.test.mjs`,
`tests/inversiones-tablero.test.mjs` y `tests/inversiones-sugerencias.test.mjs`.
Qué muestra la app y cómo: hito 0006 de FinanzasMaker-android.

## Decisiones y alternativas descartadas

- **Proveedor configurable y multiusuario:** postergado (ver el hito 0006
  allá). Requiere guardar el proveedor de cada operación, un lector por
  proveedor y abrir el registro; y para terceros, revisar si las sugerencias
  cuentan como asesoría de inversión (Ley Fintec).

## Consecuencias

- Una gemela más en la regla 10: un cambio en cómo se calcula la cartera o
  en las sugerencias se copia en la app con su caso.

## Pendiente

- Instalar la app v0.5.0 (`PENDIENTES.md`).
