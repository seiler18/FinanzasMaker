// Pruebas de src/lib/analisis.js (totales, periodos, series y consejos).
import assert from 'node:assert/strict'
import { rango, mover, enRango, diaContable, timbreCuotas, comprasEnCuotas, timbrePorMes, totales, porCategoria, porContraparte, serie, suscripciones, consejos, ritmoGasto, proyeccionMes } from '../src/lib/analisis.js'
import { conSigno, sentidoDe, SENTIDO } from '../src/lib/formato.js'

let ok = 0
const fallos = []
function prueba(nombre, fn) { try { fn(); ok++ } catch (e) { fallos.push(`✗ ${nombre}\n    ${e.message}`) } }

const m = (fecha, tipo, monto, extra = {}) => ({ fecha: fecha.length === 10 ? fecha + ' 12:00' : fecha, tipo, monto, banco: 'Tenpo', categoria: 'Otros', contraparte: '', ...extra })

prueba('rango y mover', () => {
  assert.deepEqual(rango('mes', '2026-02-10'), { desde: '2026-02-01', hasta: '2026-02-28', etiqueta: 'febrero 2026' })
  assert.equal(rango('año', '2026-02-10').hasta, '2026-12-31')
  assert.equal(rango('dia', '2026-02-10').desde, '2026-02-10')
  assert.equal(mover('mes', '2026-01-31', 1), '2026-02-01')
  assert.equal(mover('dia', '2026-03-01', -1), '2026-02-28')
  assert.equal(mover('año', '2026-05-05', -1), '2025-01-01')
})

prueba('totales: internas y pago de tarjeta no suman', () => {
  const t = totales([m('2026-09-01', 'ingreso', 1000000), m('2026-09-02', 'gasto', 300000), m('2026-09-03', 'interna', 500000),
    m('2026-09-04', 'pago_tarjeta', 200000), m('2026-09-05', 'inversion', 100000), m('2026-09-06', 'rescate', 40000)])
  assert.equal(t.ingresos, 1000000)
  assert.equal(t.gastos, 300000)
  assert.equal(t.ahorro, 700000)
  assert.equal(t.tasa, 0.7)
  assert.equal(t.inversionNeta, 60000)
})

prueba('porContraparte agrupa por nombre y nombra lo anónimo por su tipo', () => {
  const g = porContraparte([m('2026-09-01', 'ingreso', 1000, { contraparte: 'Empresa' }), m('2026-09-02', 'ingreso', 500, { contraparte: 'Empresa ' }),
    m('2026-09-03', 'ingreso', 2000), m('2026-09-04', 'gasto', 999, { contraparte: 'Empresa' })], 'ingreso')
  assert.deepEqual(g, [{ nombre: 'Ingreso', monto: 2000, n: 1 }, { nombre: 'Empresa', monto: 1500, n: 2 }])
})

prueba('conSigno: + lo que entra, − lo que sale, nada lo que no suma', () => {
  const sin = (x) => x.replace(/\s/g, ' ')
  assert.equal(sin(conSigno(12000, SENTIDO.ingreso)), '+$12.000')
  assert.equal(sin(conSigno(8500, SENTIDO.gasto)), '−$8.500')
  assert.equal(sin(conSigno(-8500, sentidoDe(-8500))), '−$8.500')
  assert.equal(SENTIDO.interna, undefined)
  assert.equal(sin(conSigno(3000, SENTIDO.interna)), '$3.000')
})

prueba('enRango incluye los extremos del día', () => {
  const r = rango('mes', '2026-09-01')
  const movs = [m('2026-08-31 23:59', 'gasto', 1), m('2026-09-01 00:00', 'gasto', 2), m('2026-09-30 23:59', 'gasto', 3), m('2026-10-01 00:00', 'gasto', 4)]
  assert.deepEqual(enRango(movs, r).map((x) => x.monto), [2, 3])
})

prueba('porCategoria ordena de mayor a menor y solo gastos', () => {
  const c = porCategoria([m('2026-09-01', 'gasto', 10, { categoria: 'A' }), m('2026-09-01', 'gasto', 30, { categoria: 'B' }), m('2026-09-01', 'ingreso', 99, { categoria: 'A' })])
  assert.deepEqual(c.map((x) => [x.categoria, x.monto]), [['B', 30], ['A', 10]])
})

prueba('serie del año tiene 12 meses y la del mes sus días', () => {
  const movs = [m('2026-02-03', 'gasto', 100), m('2026-02-03', 'ingreso', 50), m('2026-11-20', 'gasto', 7)]
  const a = serie(movs, 'año', '2026-06-01')
  assert.equal(a.length, 12)
  assert.equal(a[1].gastos, 100)
  assert.equal(a[10].gastos, 7)
  const d = serie(movs, 'mes', '2026-02-01')
  assert.equal(d.length, 28)
  assert.equal(d[2].ingresos, 50)
})

prueba('suscripciones: mismo comercio y monto parecido en 2+ meses', () => {
  const movs = [
    m('2026-07-06', 'gasto', 7990, { contraparte: 'NETFLIX.COM' }), m('2026-08-06', 'gasto', 7990, { contraparte: 'NETFLIX.COM' }),
    m('2026-09-06', 'gasto', 8290, { contraparte: 'Netflix.com' }),
    m('2026-08-10', 'gasto', 5000, { contraparte: 'TIENDA X' }), m('2026-09-10', 'gasto', 25000, { contraparte: 'TIENDA X' }),
    m('2026-08-01', 'gasto', 20000, { contraparte: 'Pedro', categoria: 'Transferencias a personas' }), m('2026-09-01', 'gasto', 20000, { contraparte: 'Pedro', categoria: 'Transferencias a personas' }),
  ]
  const s = suscripciones(movs, '2026-09')
  assert.equal(s.length, 1)
  assert.equal(s[0].meses, 3)
  assert.equal(s[0].monto, 8290)
})

prueba('consejos: presupuesto excedido primero, y ahorro bajo', () => {
  const movs = [m('2026-09-01', 'ingreso', 1000000), m('2026-09-03', 'gasto', 950000, { categoria: 'Comida' })]
  const c = consejos(movs, [{ categoria: 'Comida', monto_mensual: 100000 }], '2026-09', '2026-09-30')
  assert.equal(c[0].nivel, 'alerta')
  assert.match(c[0].titulo, /Comida/)
  assert.ok(c.some((x) => /ahorrando el 5 %/.test(x.titulo)))
})

prueba('consejos: categoría que sube frente a los 3 meses anteriores', () => {
  const movs = []
  for (const mes of ['06', '07', '08']) movs.push(m(`2026-${mes}-10`, 'gasto', 50000, { categoria: 'Comida' }))
  movs.push(m('2026-09-10', 'gasto', 90000, { categoria: 'Comida' }))
  const c = consejos(movs, [], '2026-09', '2026-09-30')
  assert.ok(c.some((x) => x.titulo === 'Comida subió 80 %'))
})

prueba('consejos: gastos hormiga, cuotas y efectivo', () => {
  const movs = []
  for (let i = 1; i <= 12; i++) movs.push(m(`2026-09-${String(i).padStart(2, '0')}`, 'gasto', 2500))
  movs.push(m('2026-09-15', 'gasto', 90000, { cuotas: 3 }))
  movs.push(m('2026-09-16', 'gasto', 20000, { categoria: 'Efectivo' }))
  const t = consejos(movs, [], '2026-09', '2026-09-30').map((x) => x.titulo)
  assert.ok(t.includes('12 compras chicas'))
  assert.ok(t.some((x) => /en cuotas/.test(x)))
  assert.ok(t.some((x) => /efectivo/.test(x)))
})

prueba('consejos: proyección solo para el mes en curso', () => {
  const movs = [m('2026-09-02', 'gasto', 100000)]
  assert.ok(consejos(movs, [], '2026-09', '2026-09-10').some((x) => x.titulo === 'Proyección del mes'))
  assert.ok(!consejos(movs, [], '2026-09', '2026-10-10').some((x) => x.titulo === 'Proyección del mes'))
})

prueba('fecha contable: el depósito del 30 de septiembre cuenta en octubre', () => {
  const sueldo = m('2026-09-30 09:00', 'ingreso', 3000000, { fecha_contable: '2026-10-01' })
  const movs = [sueldo, m('2026-09-10', 'ingreso', 100000), m('2026-10-05', 'gasto', 500000)]
  assert.equal(diaContable(sueldo), '2026-10-01')
  assert.equal(diaContable(m('2026-09-10', 'gasto', 1)), '2026-09-10')
  assert.equal(totales(enRango(movs, rango('mes', '2026-09-15'))).ingresos, 100000)
  const oct = totales(enRango(movs, rango('mes', '2026-10-15')))
  assert.equal(oct.ingresos, 3000000)
  assert.equal(oct.ahorro, 2500000)
  // la serie del año y la del mes también lo mueven
  const anio = serie(movs, 'año', '2026-10-15')
  assert.equal(anio[8].ingresos, 100000)
  assert.equal(anio[9].ingresos, 3000000)
  assert.equal(serie(movs, 'mes', '2026-10-15')[0].ingresos, 3000000)
  // sin fecha_contable (vacía) cuenta en su fecha real
  assert.equal(diaContable({ ...sueldo, fecha_contable: '' }), '2026-09-30')
})

prueba('fecha contable: los consejos miden el mes contable', () => {
  const movs = [m('2026-09-30', 'ingreso', 1000000, { fecha_contable: '2026-10-01' }), m('2026-10-03', 'gasto', 1500000)]
  assert.ok(consejos(movs, [], '2026-10', '2026-10-31').some((x) => x.titulo === 'Gastaste más de lo que entró') === true)
  assert.ok(!consejos(movs, [], '2026-09', '2026-10-31').some((x) => x.titulo === 'Gastaste más de lo que entró'))
})

prueba('timbre de cuotas: 0,066 % por mes de plazo con tope de 0,8 %', () => {
  assert.equal(timbreCuotas(1000000, 1), 0, 'una cuota no es crédito')
  assert.equal(timbreCuotas(1000000, 3), 1980)
  assert.equal(timbreCuotas(1000000, 6), 3960)
  assert.equal(timbreCuotas(1000000, 12), 7920)
  assert.equal(timbreCuotas(1000000, 13), 8000, 'desde las 13 cuotas topa en 0,8 %')
  assert.equal(timbreCuotas(1000000, 48), 8000)
  assert.equal(timbreCuotas(1000000, ''), 0)
})

prueba('timbre de cuotas: redondea al peso y cobra también las de 3 cuotas sin interés', () => {
  // Montos inventados; la regla (monto × 0,066 % × cuotas, al peso) calzó con cargos reales de Tenpo.
  assert.equal(timbreCuotas(250000, 3), 495)
  assert.equal(timbreCuotas(123456, 3), 244, '244,44 → 244')
  assert.equal(timbreCuotas(123500, 3), 245, '244,53 → 245')
})

prueba('compras en cuotas: solo gastos del mes contable', () => {
  const movs = [
    m('2026-10-02', 'gasto', 600000, { cuotas: 12, contraparte: 'Paris' }),
    m('2026-10-05', 'gasto', 90000, { cuotas: 3 }),
    m('2026-10-06', 'gasto', 50000, { cuotas: 1 }),
    m('2026-10-07', 'ingreso', 70000, { cuotas: 6 }),
    m('2026-09-30', 'gasto', 100000, { cuotas: 6, fecha_contable: '2026-10-01' }),
    m('2026-09-10', 'gasto', 200000, { cuotas: 6 }),
  ]
  const oct = comprasEnCuotas(movs, '2026-10')
  assert.equal(oct.compras.length, 3)
  assert.equal(oct.total, 790000)
  assert.equal(oct.impuesto, 4752 + 178 + 396)
  const seis = timbrePorMes(movs, '2026-10', 6)
  assert.equal(seis.length, 6)
  assert.equal(seis[5].mes, '2026-10')
  assert.equal(seis[4].impuesto, 792)
  assert.equal(seis[0].impuesto, 0)
})

console.log(`analisis: ${ok} pruebas ok`)
if (fallos.length) { console.error(fallos.join('\n')); process.exit(1) }

prueba('proyección: un gasto grande al inicio del mes no se multiplica por los días', () => {
  // Caso real: ~$690.000 en 5 días daba «$137.630 por día» y una proyección de $4,2 millones.
  const movs = [
    m('2026-10-01', 'gasto', 500000), // arriendo / abono: puntual
    ...[3000, 4000, 2500, 5000, 3500, 4500, 2000, 6000, 3000, 4000].map((n, i) => m(`2026-09-${10 + i}`, 'gasto', n)),
    m('2026-10-02', 'gasto', 8000), m('2026-10-03', 'gasto', 6000), m('2026-10-04', 'gasto', 4000), m('2026-10-05', 'gasto', 7000),
  ]
  const g = ritmoGasto(movs, '2026-10-01', '2026-10-31', '2026-10-05')
  assert.equal(g.grandes, 1)
  assert.ok(g.porDia < 10000, `por día ${g.porDia}`)
  const p = proyeccionMes(movs, '2026-10', '2026-10-05')
  assert.ok(p.proy < 800000, `proyección ${p.proy}`)
  assert.ok(p.proy > 500000 + 25000)
  assert.equal(proyeccionMes(movs, '2026-09', '2026-10-05'), null)
})
