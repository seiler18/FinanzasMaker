/* Datos de DEMOSTRACIÓN — inventados. Es lo que ve quien entra sin sesión.

   Tienen la forma exacta del contrato (docs/contrato.md), así el dashboard
   se ejercita entero sin backend. Si el contrato cambia, esto cambia con él
   (lo comprueba tests/contrato.test.mjs).

   Tickers reales para que el ejemplo se lea natural; cantidades, montos y
   precios no corresponden a ninguna cartera. */

// [fecha, tipo, ticker, activo, cantidad, usd]
const OPERACIONES = [
  ['2025-08-04', 'compra', 'AAPL', 'Apple Inc', 0.21, 45],
  ['2025-08-04', 'compra', 'MSFT', 'Microsoft Corp', 0.08, 40],
  ['2025-08-18', 'compra', 'SCHD', 'Schwab US Dividend Equity ETF', 2.4, 66],
  ['2025-08-18', 'compra', 'JEPI', 'JPMorgan Equity Premium Income ETF', 1.1, 63],
  ['2025-09-02', 'compra', 'VOO', 'Vanguard S&P 500 ETF', 0.12, 70],
  ['2025-09-15', 'compra', 'NVDA', 'NVIDIA Corp', 0.3, 52],
  ['2025-09-15', 'compra', 'GLD', 'SPDR Gold Shares', 0.1, 33],
  ['2025-09-29', 'dividendo', 'SCHD', 'Schwab US Dividend Equity ETF', null, 0.58],
  ['2025-10-01', 'compra', 'QQQ', 'Invesco QQQ Trust Series 1', 0.09, 54],
  ['2025-10-08', 'dividendo', 'JEPI', 'JPMorgan Equity Premium Income ETF', null, 0.46],
  ['2025-10-20', 'venta', 'NVDA', 'NVIDIA Corp', 0.3, 58.9],
  ['2025-10-27', 'venta', 'AAPL', 'Apple Inc', 0.21, 52.1],
  ['2025-11-10', 'dividendo', 'JEPI', 'JPMorgan Equity Premium Income ETF', null, 0.44],
  ['2025-11-12', 'compra', 'VOO', 'Vanguard S&P 500 ETF', 0.1, 61],
  ['2025-11-14', 'dividendo', 'MSFT', 'Microsoft Corp', null, 0.07],
  ['2025-11-28', 'venta', 'GLD', 'SPDR Gold Shares', 0.1, 36.4],
  ['2025-12-09', 'dividendo', 'JEPI', 'JPMorgan Equity Premium Income ETF', null, 0.51],
  ['2025-12-11', 'venta', 'QQQ', 'Invesco QQQ Trust Series 1', 0.09, 51.2],
  ['2025-12-29', 'dividendo', 'SCHD', 'Schwab US Dividend Equity ETF', null, 0.62],
  ['2026-01-12', 'dividendo', 'JEPI', 'JPMorgan Equity Premium Income ETF', null, 0.43],
  ['2026-01-20', 'venta', 'MSFT', 'Microsoft Corp', 0.08, 38.1],
  ['2026-02-09', 'dividendo', 'JEPI', 'JPMorgan Equity Premium Income ETF', null, 0.42],
  ['2026-02-17', 'compra', 'VXUS', 'Vanguard Total International Stock ETF', 1.3, 88],
  ['2026-03-10', 'dividendo', 'JEPI', 'JPMorgan Equity Premium Income ETF', null, 0.47],
  ['2026-03-30', 'dividendo', 'SCHD', 'Schwab US Dividend Equity ETF', null, 0.6],
  ['2026-03-31', 'dividendo', 'VOO', 'Vanguard S&P 500 ETF', null, 0.39],
  ['2026-04-14', 'venta', 'JEPI', 'JPMorgan Equity Premium Income ETF', 1.1, 61.8],
  ['2026-05-05', 'compra', 'SCHD', 'Schwab US Dividend Equity ETF', 1.5, 43],
  ['2026-06-04', 'compra', 'VOO', 'Vanguard S&P 500 ETF', 0.18, 108],
  ['2026-06-29', 'dividendo', 'SCHD', 'Schwab US Dividend Equity ETF', null, 0.88],
  ['2026-06-30', 'dividendo', 'VOO', 'Vanguard S&P 500 ETF', null, 0.52],
  ['2026-07-21', 'compra', 'VXUS', 'Vanguard Total International Stock ETF', 0.9, 64],
  ['2026-08-12', 'venta', 'VXUS', 'Vanguard Total International Stock ETF', 0.6, 47.5],
  ['2026-09-22', 'dividendo', 'SCHD', 'Schwab US Dividend Equity ETF', null, 0.91],
]

const DOLARES = [
  ['2025-07-30', 'compraUsd', 400, 372400, 931],
  ['2026-01-26', 'ventaUsd', 120, 111000, 925],
  ['2026-05-28', 'compraUsd', 180, 167940, 933],
]

const PRECIOS = [
  ['AAPL', 'Apple Inc', 238.4, 0.0061],
  ['GLD', 'SPDR Gold Shares', 355.1, -0.0042],
  ['JEPI', 'JPMorgan Equity Premium Income ETF', 57.3, 0.0012],
  ['MSFT', 'Microsoft Corp', 505.2, 0.0133],
  ['NVDA', 'NVIDIA Corp', 181.6, -0.0319],
  ['QQQ', 'Invesco QQQ Trust Series 1', 598.7, 0.0074],
  ['SCHD', 'Schwab US Dividend Equity ETF', 27.9, -0.0021],
  ['VOO', 'Vanguard S&P 500 ETF', 612.5, 0.0048],
  ['VXUS', 'Vanguard Total International Stock ETF', 71.2, 0.0035],
]

export function datosDemo(ahora = new Date()) {
  // Hora local sin zona, como la manda la hoja (docs/contrato.md): con
  // toISOString() la demo decía «precios de hace 3 h» recién cargada.
  const dos = (n) => String(n).padStart(2, '0')
  const iso = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}T${dos(ahora.getHours())}:${dos(ahora.getMinutes())}:${dos(ahora.getSeconds())}`
  return {
    ok: true,
    version: 1,
    demo: true,
    generado: ahora.toISOString(),
    zona: 'America/Santiago',
    moneda: 'USD',
    dolar: { clp: 942.35, actualizado: iso },
    precios: PRECIOS.map(([ticker, nombre, precio, cambioDia]) => ({ ticker, nombre, precio, cambioDia, actualizado: iso })),
    movimientos: [
      ...OPERACIONES.map(([fecha, tipo, ticker, activo, cantidad, usd]) => ({
        fecha, tipo, activo, ticker, cantidad, usd, clp: null, tipoCambio: null, comisionClp: null, fuente: 'Demo',
      })),
      ...DOLARES.map(([fecha, tipo, usd, clp, tipoCambio]) => ({
        fecha, tipo, activo: 'Dólares (USD)', ticker: 'USD', cantidad: usd, usd, clp, tipoCambio,
        comisionClp: Math.round(usd * 4 * 100) / 100, fuente: 'Demo',
      })),
    ].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)),
    alertas: [
      { fecha: iso, tipo: '1 señal(es)', detalle: '🔻 COMPRAR? NVDA cae -3.2% hoy (actual US$181.60).' },
      { fecha: '2026-09-22T17:00:12', tipo: 'IMPORTACIÓN', detalle: '1 movimiento(s) nuevo(s) leído(s) de Gmail.' },
      { fecha: '2026-08-12T16:59:40', tipo: 'IMPORTACIÓN', detalle: '1 movimiento(s) nuevo(s) leído(s) de Gmail.' },
      { fecha: '2026-07-21T16:58:03', tipo: 'AUTO-MAPA', detalle: 'AUTO-MAPA: nuevo activo "Vanguard Total International Stock ETF" con ticker VXUS. Verifica que el ticker sea el correcto.' },
    ],
    umbrales: { ventaPct: 5, caidaPct: 3 },
    ultimaEjecucion: iso,
  }
}
