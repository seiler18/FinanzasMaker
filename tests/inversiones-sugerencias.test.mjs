// Sugerencias de Inversiones (src/inversiones/lib/sugerencias.js, hito 0021).
// El caso de SCHD es el real del 2026-10-23: compró 4,603731058 acciones por
// US$ 159,32 y las vendió por US$ 162,10 (US$ 35,21 por acción, según Fintual).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCartera } from '../src/inversiones/lib/cartera.js'
import { sugerencias, precioPorAccion } from '../src/inversiones/lib/sugerencias.js'

const mov = (fecha, tipo, ticker, cantidad, usd) => ({ fecha, tipo, ticker, activo: ticker, cantidad, usd, clp: null, tipoCambio: null, comisionClp: null, fuente: 't' })
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`)
const HOY = new Date('2026-10-23T18:00:00Z')

const SCHD = [mov('2026-08-18', 'compra', 'SCHD', 4.603731058, 159.32), mov('2026-10-23', 'venta', 'SCHD', 4.603731058, 162.1)]
const con = (movimientos, precios, umbrales = { ventaPct: 5 }) => {
  const datos = { movimientos, precios: Object.entries(precios).map(([ticker, precio]) => ({ ticker, nombre: ticker, precio })), umbrales }
  return sugerencias(datos, calcularCartera(datos), { hoy: HOY })
}

test('el precio por acción de una venta es el del correo de Fintual', () => {
  assert.equal(precioPorAccion(SCHD[1]).toFixed(2), '35.21')
  assert.equal(precioPorAccion(mov('2026-09-28', 'dividendo', 'SCHD', null, 1.05)), null)
  assert.equal(precioPorAccion(mov('2026-09-28', 'compraUsd', 'USD', 100, 100)), null)
})

test('vendida a 35,21 y hoy más barata: sugiere recomprar, con cuántas acciones alcanza', () => {
  const s = con(SCHD, { SCHD: 34.8 })
  assert.equal(s.comprar.length, 1)
  const x = s.comprar[0]
  assert.equal(x.ticker, 'SCHD')
  cerca(x.precioVenta, 162.1 / 4.603731058, 'precio de venta')
  cerca(x.pct, 34.8 / (162.1 / 4.603731058) - 1, 'cuánto bajó')
  cerca(x.accionesHoy, 162.1 / 34.8, 'acciones con lo recibido')
  assert.ok(x.extra > 0, 'más acciones de las que vendió')
  assert.equal(s.espera.length, 0)
  assert.equal(s.vender.length, 0, 'la posición está cerrada')
})

test('vendida y hoy más cara: queda en espera, no se sugiere recomprar', () => {
  const s = con(SCHD, { SCHD: 35.5 })
  assert.equal(s.comprar.length, 0)
  assert.equal(s.espera.length, 1)
  assert.ok(s.espera[0].pct > 0)
})

test('una venta de hace más de 90 días ya no cuenta, y vale la última de cada activo', () => {
  assert.equal(con([mov('2026-01-02', 'compra', 'ABC', 1, 10), mov('2026-07-01', 'venta', 'ABC', 1, 12)], { ABC: 11 }).comprar.length, 0)
  const s = con([mov('2026-07-01', 'compra', 'ABC', 2, 20), mov('2026-08-01', 'venta', 'ABC', 1, 15), mov('2026-10-01', 'venta', 'ABC', 1, 11)], { ABC: 12 })
  assert.equal(s.comprar.length, 0, 'la última venta fue a 11: hoy, a 12, está más cara')
  cerca(s.espera[0].precioVenta, 11, 'cuenta la última')
})

test('posición abierta sobre su costo: sugiere vender, y marca las que pasan el umbral', () => {
  const movs = [mov('2026-06-01', 'compra', 'VOO', 1, 500), mov('2026-06-01', 'compra', 'GLD', 2, 100), mov('2026-06-01', 'compra', 'NVDA', 1, 200)]
  const s = con(movs, { VOO: 540, GLD: 51, NVDA: 190 })
  assert.deepEqual(s.vender.map((x) => x.ticker), ['VOO', 'GLD'], 'ordenadas de más a menos ganancia; NVDA está bajo su costo')
  cerca(s.vender[0].ganancia, 40, 'ganancia de VOO')
  assert.equal(s.vender[0].sobreUmbral, true, 'VOO +8 % pasa el 5 %')
  assert.equal(s.vender[1].sobreUmbral, false, 'GLD +2 % no')
})

test('sin precio no se sugiere nada', () => {
  const s = con([...SCHD, mov('2026-06-01', 'compra', 'VOO', 1, 500)], {})
  assert.deepEqual([s.vender.length, s.comprar.length, s.espera.length], [0, 0, 0])
})
