// Serie mensual del tablero (evolucion en src/lib/cartera.js): el último mes
// tiene que cuadrar con calcularCartera, porque usa la misma aritmética.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCartera, evolucion } from '../src/inversiones/lib/cartera.js'
import { datosDemo } from '../src/inversiones/demo.js'

const mov = (fecha, tipo, ticker, cantidad, usd) => ({ fecha, tipo, ticker, activo: ticker, cantidad, usd, clp: null, tipoCambio: null, comisionClp: null, fuente: 't' })
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`)

test('el último mes cuadra con los totales de la cartera', () => {
  const datos = datosDemo(new Date('2026-10-02T12:00:00'))
  const c = calcularCartera(datos)
  const serie = evolucion(datos.movimientos)
  const u = serie[serie.length - 1]
  cerca(u.compras, c.totales.invertido, 'compras acumuladas')
  cerca(u.ventas, c.totales.ventas, 'ventas acumuladas')
  cerca(u.dividendos, c.totales.dividendos, 'dividendos acumulados')
  cerca(u.recibido, c.totales.ventas + c.totales.dividendos, 'recuperado')
  cerca(u.realizado, c.totales.gpRealizada, 'realizado')
  cerca(u.costo, c.abiertas.reduce((s, p) => s + p.costoAbierto, 0), 'costo de lo abierto')
})

test('meses continuos, sin saltos, y acumulados que nunca bajan', () => {
  const serie = evolucion([mov('2026-01-10', 'compra', 'A', 1, 10), mov('2026-04-02', 'venta', 'A', 1, 12), mov('2026-04-20', 'dividendo', 'A', null, 1)])
  assert.deepEqual(serie.map((d) => d.mes), ['2026-01', '2026-02', '2026-03', '2026-04'])
  for (let i = 1; i < serie.length; i++) {
    assert.ok(serie[i].compras >= serie[i - 1].compras)
    assert.ok(serie[i].recibido >= serie[i - 1].recibido)
  }
  cerca(serie[1].costo, 10, 'costo mientras sigue abierta')
  cerca(serie[3].costo, 0, 'costo al cerrar')
  cerca(serie[3].realizado, 2, 'realizado al vender')
  cerca(serie[0].compraMes, 10, 'compra del mes')
  cerca(serie[1].compraMes, 0, 'mes sin compras')
})

test('sin movimientos de acciones no hay serie', () => {
  assert.deepEqual(evolucion([]), [])
  assert.deepEqual(evolucion([mov('2026-01-01', 'compraUsd', 'USD', 100, 100)]), [])
})
