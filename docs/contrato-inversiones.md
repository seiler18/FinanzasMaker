# Contrato de datos de Inversiones — v1

Viene de `docs/contrato.md` de gestor-acciones (proyecto retirado, hito
0023). Es la costura entre los datos y quien los muestra: la base entrega
**hechos** (lo que pasó y lo que vale hoy); los cálculos (posiciones, costo
promedio, G/P, sugerencias) los hace quien muestra, con la aritmética de
`src/inversiones/lib/cartera.js` y `sugerencias.js`.

## De dónde sale

En gestor-acciones lo servía un Apps Script (`POST /exec` con
`{"accion":"cartera"}`). Desde la v2 (hito 0011) lo arma `cartera()` de
`src/inversiones/lib/api.js` leyendo Supabase con la sesión del dueño:

| Campo | Tabla |
|---|---|
| `movimientos` | `acciones_operaciones` (de a 1000, `order=fecha,id`) |
| `precios`, `dolar` | `acciones_precios` (de todos; USDCLP es el dólar) |
| `alertas` | `acciones_alertas` (las 30 últimas) |
| `umbrales` | `config`: `umbral_venta_pct`, `umbral_caida_pct` |
| `ultimaEjecucion` | `estado_trabajador.ultima_acciones` |

Lo leen tres: la página (`src/inversiones/main.js`), su demo
(`src/inversiones/demo.js`, misma forma, lo comprueba
`tests/inversiones-contrato.test.mjs`) y la app Android
(`Tablero.inversiones`, que arma lo mismo en Kotlin: `DatosInv`).

## Forma

```jsonc
{
  "ok": true,
  "version": 1,                       // sube si cambia la forma
  "generado": "2026-09-27T12:00:00.000Z",   // ISO con huso: cuándo se armó
  "zona": "America/Santiago",         // las fechas de abajo son locales a esta zona
  "moneda": "USD",
  "dolar": { "clp": 950.0, "actualizado": "2026-09-27T08:59:03" },   // o null
  "precios": [                        // solo los activos que alguna vez se tuvieron
    { "ticker": "VOO", "nombre": "Vanguard S&P 500 ETF",
      "precio": 600.0,                // USD; null si Yahoo no lo trajo
      "cambioDia": 0.0048,            // fracción: 0.0048 = +0,48 %; null si falta
      "actualizado": "2026-09-27T08:59:03" }
  ],
  "movimientos": [                    // orden cronológico
    { "fecha": "2026-06-03",          // aaaa-mm-dd
      "tipo": "compra",               // compra | venta | dividendo | compraUsd | ventaUsd
      "activo": "Vanguard S&P 500 ETF",
      "ticker": "VOO",                // "USD" en compraUsd/ventaUsd
      "cantidad": 0.2,                // acciones; en USD, los dólares; null en dividendo
      "usd": 120.0,                   // monto en USD; en una venta, «Recibiste» del correo
      "clp": null,                    // solo compraUsd/ventaUsd
      "tipoCambio": null,             // solo compraUsd/ventaUsd
      "comisionClp": null,            // solo compraUsd/ventaUsd (estimada: usd × 4)
      "fuente": "Correo Gmail" }
  ],
  "alertas": [                        // las 30 más recientes, la última primero
    { "fecha": "2026-09-27T08:59:43", "tipo": "1 señal(es)", "detalle": "🟢 VENDER? …" }
  ],
  "umbrales": { "ventaPct": 5, "caidaPct": 3 },
  "ultimaEjecucion": "2026-09-27T08:59:43"   // última pasada de actualizarAcciones
}
```

El precio por acción de una compra o venta no viaja: es `usd / cantidad`
(`precioPorAccion` en `sugerencias.js`, hito 0021).

## Lo que no sale, a propósito

- El **id del correo de Gmail** (`gmail_id`): identifica el buzón y quien
  muestra no lo necesita.
- El **correo de alertas** de Config.

## Cambiar el contrato

1. Una migración nueva si cambia una tabla (regla 8 de `CLAUDE.md`).
2. `cartera()` en `src/inversiones/lib/api.js`, este documento y
   `src/inversiones/demo.js` (`npm test` comprueba que la demo calce).
3. En la app Android, `Tablero.inversiones` y `Operacion.COLUMNAS`, en el
   mismo cambio (regla 10).
