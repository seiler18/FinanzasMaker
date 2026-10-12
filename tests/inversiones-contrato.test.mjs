// El modo demo debe tener la misma forma que lo que entrega la API: si no,
// la demo funciona y los datos reales rompen (o al revés).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosDemo } from '../src/inversiones/demo.js'
import { calcularCartera } from '../src/inversiones/lib/cartera.js'

const CLAVES = ['version', 'generado', 'zona', 'moneda', 'dolar', 'precios', 'movimientos', 'alertas', 'umbrales', 'ultimaEjecucion']
const MOV = ['fecha', 'tipo', 'activo', 'ticker', 'cantidad', 'usd', 'clp', 'tipoCambio', 'comisionClp', 'fuente']
const TIPOS = new Set(['compra', 'venta', 'dividendo', 'compraUsd', 'ventaUsd'])

test('la demo cumple el contrato v1', () => {
  const d = datosDemo(new Date('2026-09-27T12:00:00Z'))
  for (const k of CLAVES) assert.ok(k in d, `falta ${k}`)
  assert.equal(d.version, 1)
  for (const m of d.movimientos) {
    assert.deepEqual(Object.keys(m).sort(), [...MOV].sort())
    assert.match(m.fecha, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(TIPOS.has(m.tipo), m.tipo)
  }
  const fechas = d.movimientos.map((m) => m.fecha)
  assert.deepEqual(fechas, [...fechas].sort(), 'orden cronológico')
  for (const p of d.precios) assert.deepEqual(Object.keys(p).sort(), ['actualizado', 'cambioDia', 'nombre', 'precio', 'ticker'])
})

test('la demo no vende más de lo que compró y tiene posiciones abiertas y cerradas', () => {
  const c = calcularCartera(datosDemo())
  for (const p of c.posiciones) assert.ok(p.vendido <= p.comprado + 1e-9, `${p.ticker} vende de más`)
  assert.ok(c.abiertas.length >= 2)
  assert.ok(c.cerradas.length >= 2)
  assert.ok(c.posiciones.some((p) => p.resultado < 0), 'alguna pérdida, para que se vea el lado rojo')
  for (const p of c.abiertas) assert.notEqual(p.precio, null, `${p.ticker} sin precio en la demo`)
})
