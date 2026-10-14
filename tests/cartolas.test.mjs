// Pruebas de src/lib/cartolas/: leer la tabla de un PDF, reconocer el formato,
// cuadrar con los totales, clasificar y cruzar con lo ya registrado.
//
// Los trozos son sintéticos: imitan la posición de los textos de las cartolas
// reales (septiembre de 2026) con nombres y montos inventados. Las cartolas
// reales se prueban aparte, solo en la máquina que las tiene
// (tests/cartolas-reales.test.mjs).
import assert from 'node:assert/strict'
import { monto, fecha, lineas, columnaDe } from '../src/lib/cartolas/tabla.js'
import { leerCartola, ErrorCartola } from '../src/lib/cartolas/formatos.js'
import { clasificar, esPropio, comercio } from '../src/lib/cartolas/clasificar.js'
import { cruzar } from '../src/lib/cartolas/cruzar.js'

let ok = 0
const fallos = []
function prueba(nombre, fn) { try { fn(); ok++ } catch (e) { fallos.push(`✗ ${nombre}\n    ${e.stack}`) } }

// Una línea de trozos: [[texto, x], ...] a la altura y. El ancho se estima.
const linea = (y, partes) => partes.map(([s, x]) => ({ s, x, y, w: s.length * 4.2 }))

/* Una cartola de cuenta MACH, con la forma de la real: totales bajo su
   título, columnas Egreso / Ingreso / Saldo y descripciones que siguen en la
   línea de abajo. */
function machCuenta({ abonos = '115.000', cargos = '115.000' } = {}) {
  const C = { fecha: 36, desc: 124.4, moneda: 355.5, egreso: 406.5, ingreso: 468, saldo: 529.5 }
  const fila = (y, f, d, eg, ing, saldo) => linea(y, [[f, C.fecha], [d, C.desc], ['CLP', C.moneda], ...(eg ? [[eg, C.egreso]] : []), ...(ing ? [[ing, C.ingreso]] : []), [saldo, C.saldo]])
  return [[
    ...linea(800, [['CARTOLA CUENTA MACHBANK', 214.5], ['Cartola n° 1', 519]]),
    ...linea(770, [['Periodo', 319], ['Desde 01/09/2026 a 01/10/2026', 426.1]]),
    ...linea(750, [['Saldo inicial del periodo', 36.7], ['Total ingresos del periodo', 178.5], ['Total egresos del periodo', 320.3], ['Saldo contable final del periodo', 436.4]]),
    ...linea(738, [['0', 36.7], [abonos, 178.5], [cargos, 320.3], ['0', 436.4]]),
    ...linea(720, [['Fecha operación', C.fecha], ['Descripción', C.desc], ['Cambio', 306], ['Moneda', C.moneda], ['Egreso', C.egreso], ['Ingreso', C.ingreso], ['Saldo', C.saldo]]),
    ...fila(705, '01/09/2026', 'Transferencia de Ana Prueba', '', '$100.000', '$100.000'),
    ...fila(690, '02/09/2026', 'Transferencia a Jesús Seiler Velasquez', '$60.000', '', '$40.000'),
    ...fila(675, '03/09/2026', 'Giro con tarjeta física MACH en cajero', '$10.000', '', '$30.000'),
    ...linea(665, [['automático - Cuenta MACH', C.desc]]),
    ...fila(650, '04/09/2026', 'Abono cashback - Equipo MACHBANK', '', '$15.000', '$45.000'),
    ...fila(635, '05/09/2026', 'Pago de Tarjeta de Crédito - Tarjeta de', '$45.000', '', '$0'),
    ...linea(625, [['Crédito', C.desc]]),
  ]]
}

// ---------- tabla.js ----------

prueba('monto: pesos con punto de miles, signo y $', () => {
  assert.equal(monto('$1.090.201'), 1090201)
  assert.equal(monto('$-100.000'), -100000)
  assert.equal(monto('-320.298'), -320298)
  assert.equal(monto('$ 771.265'), 771265)
  assert.equal(monto('0'), 0)
  assert.equal(monto('1.2345'), null)
  assert.equal(monto('CLP'), null)
  assert.equal(monto(''), null)
})

prueba('fecha: dd/mm/aaaa y dd-mm-aaaa', () => {
  assert.equal(fecha('01/09/2026'), '2026-09-01')
  assert.equal(fecha('30-09-2026'), '2026-09-30')
  assert.equal(fecha('32/09/2026'), '')
  assert.equal(fecha('01/13/2026'), '')
  assert.equal(fecha('Septiembre 2026'), '')
})

prueba('lineas: agrupa por altura y ordena de arriba abajo e izquierda a derecha', () => {
  const ls = lineas([{ s: 'b', x: 50, y: 100 }, { s: 'a', x: 10, y: 100.8 }, { s: 'c', x: 10, y: 90 }])
  assert.deepEqual(ls.map((l) => l.texto), ['a b', 'c'])
})

prueba('columnaDe: «tramo» deja un monto corto en su columna aunque quede cerca de la de al lado', () => {
  const cols = [{ k: 'monto', x: 300, w: 30 }, { k: 'total', x: 360, w: 50 }]
  const chico = { s: '$150', x: 350, w: 18 }
  assert.equal(columnaDe(chico, cols, 'tramo'), 'monto')
  assert.equal(columnaDe(chico, cols), 'total')
})

// ---------- formatos.js ----------

prueba('MACH cuenta: reconoce, lee las filas con su descripción completa y cuadra', () => {
  const c = leerCartola(machCuenta())
  assert.equal(c.formato, 'mach-cuenta')
  assert.equal(c.banco, 'MACH')
  assert.equal(c.producto, 'Cuenta')
  assert.deepEqual(c.periodo, { desde: '2026-09-01', hasta: '2026-10-01' })
  assert.equal(c.filas.length, 5)
  assert.equal(c.filas[2].desc, 'Giro con tarjeta física MACH en cajero automático - Cuenta MACH')
  assert.deepEqual([c.filas[0].abono, c.filas[0].cargo, c.filas[0].saldo], [100000, 0, 100000])
  assert.equal(c.cuadre.ok, true)
})

prueba('el cuadre avisa si los totales de la cartola no calzan con lo leído', () => {
  const c = leerCartola(machCuenta({ abonos: '116.000' }))
  assert.equal(c.cuadre.ok, false)
  const item = c.cuadre.items.find((i) => i.que === 'Total abonos')
  assert.deepEqual([item.cartola, item.leido], [116000, 115000])
})

prueba('un PDF que no es cartola, o una que no se importa, se dice claro', () => {
  assert.throws(() => leerCartola([linea(800, [['Boleta de honorarios', 40]])]), (e) => e instanceof ErrorCartola && /No reconozco/.test(e.message))
  assert.throws(() => leerCartola([linea(800, [['Alpaca Securities LLC', 40], ['Monthly Statement', 300]])]), (e) => e instanceof ErrorCartola && /Inversiones/.test(e.message))
})

// ---------- clasificar.js ----------

const CONFIG = { config: { titular: 'Jesus Seiler', vendedores_cripto: 'Vendedor Falso' }, reglas: [] }

prueba('clasificar: cuenta, con los criterios de los lectores de correo', () => {
  const movs = clasificar(leerCartola(machCuenta()), CONFIG)
  assert.deepEqual(movs.map((m) => [m.tipo, m.monto, m.contraparte]), [
    ['ingreso', 100000, 'Ana Prueba'],
    ['interna', 60000, 'Jesús Seiler Velasquez'],
    ['gasto', 10000, 'Giro en cajero'],
    ['ingreso', 15000, 'Cashback MACH'],
    ['pago_tarjeta', 45000, 'Tarjeta de crédito MACH'],
  ])
  assert.ok(movs.every((m) => m.estado === 'nuevo' && m.banco === 'MACH' && m.producto === 'Cuenta' && m.cuotas === null))
  assert.equal(movs[0].detalle, 'Cartola MACH 2026-09: Transferencia de Ana Prueba')
  assert.equal(new Set(movs.map((m) => m.clave)).size, movs.length)
})

prueba('clasificar: dos filas idénticas tienen claves distintas (y estables)', () => {
  const c = { banco: 'MACH', producto: 'Cuenta', periodo: { desde: '2026-09-01', hasta: '2026-10-01' },
    filas: [1, 2].map(() => ({ fecha: '2026-09-03', desc: 'Compra KIOSCO', cargo: 1000, abono: 0, saldo: null })) }
  const a = clasificar(c, CONFIG).map((m) => m.clave)
  assert.notEqual(a[0], a[1])
  assert.deepEqual(clasificar(c, CONFIG).map((m) => m.clave), a)
})

prueba('clasificar: la devolución de una transferencia entre mis cuentas tampoco suma', () => {
  const c = { banco: 'MACH', producto: 'Cuenta', periodo: { desde: '2026-09-01', hasta: '2026-10-01' }, filas: [
    { fecha: '2026-09-14', desc: 'Transferencia a Jesús Seiler Velasquez', cargo: 100000, abono: 0 },
    { fecha: '2026-09-14', desc: 'Devolución transferencia a cuenta bancaria', cargo: 0, abono: 100000 },
    { fecha: '2026-09-15', desc: 'Devolución compra', cargo: 0, abono: 5000 },
  ] }
  const movs = clasificar(c, CONFIG)
  assert.deepEqual(movs.map((m) => m.tipo), ['interna', 'interna', 'ingreso'])
  assert.equal(movs[2].categoria, 'Devoluciones')
})

prueba('clasificar: la rentabilidad diaria se junta en un movimiento por mes', () => {
  const c = { banco: 'Copec Pay', producto: 'Cuenta', periodo: { desde: '2026-09-01', hasta: '2026-09-30' }, filas: [
    { fecha: '2026-09-01', desc: 'Ganancia Copec Pay', cargo: 0, abono: 300 },
    { fecha: '2026-09-02', desc: 'Compra COMERCIO', cargo: 5000, abono: 0 },
    { fecha: '2026-09-03', desc: 'Ganancia Copec Pay', cargo: 0, abono: 310 },
  ] }
  const movs = clasificar(c, CONFIG)
  assert.equal(movs.length, 2)
  const r = movs.find((m) => m.categoria === 'Rentabilidad')
  assert.deepEqual([r.monto, r.fecha, r.tipo], [610, '2026-09-03', 'ingreso'])
  assert.match(r.desc, /2 abonos del 01 al 03/)
})

prueba('clasificar: pagarle a un vendedor P2P es compra de cripto (no suma)', () => {
  const c = { banco: 'MACH', producto: 'Cuenta', periodo: { desde: '2026-09-01', hasta: '2026-10-01' },
    filas: [{ fecha: '2026-09-05', desc: 'Transferencia a Vendedor Falso SpA', cargo: 20000, abono: 0 }] }
  const [m] = clasificar(c, CONFIG)
  assert.deepEqual([m.tipo, m.categoria], ['interna', 'Compra de cripto'])
})

prueba('clasificar: tarjeta — compras con cuotas, impuesto, pago informativo y compras de antes', () => {
  const c = { banco: 'Tenpo', producto: 'Tarjeta de crédito', periodo: { desde: '2026-08-26', hasta: '2026-09-25' }, filas: [
    { fecha: '2026-09-02', desc: 'HIP LIDER PUERTO MONTT CH (0,00%)', cargo: 10000, monto: 30000, cuota: '1/3', seccion: 'B' },
    { fecha: '2026-09-10', desc: 'Pago de tarjeta', cargo: -50000, monto: 50000, cuota: '', seccion: 'B' },
    { fecha: '2026-06-15', desc: 'TIENDA VIEJA', cargo: 8000, monto: 24000, cuota: '3/3', seccion: 'B' },
    { fecha: '2026-09-02', desc: 'IMPUESTO DE TIMBRES Y ESTAMPILLAS', cargo: 240, monto: 240, cuota: '', seccion: 'D' },
  ] }
  const movs = clasificar(c, CONFIG)
  const [lider, pago, vieja, timbre] = movs
  assert.deepEqual([lider.tipo, lider.monto, lider.cuotas, lider.contraparte, lider.estado], ['gasto', 30000, 3, 'HIP LIDER PUERTO MONTT', 'nuevo'])
  assert.deepEqual([pago.tipo, pago.estado], ['pago_tarjeta', 'informativo'])
  assert.deepEqual([vieja.estado, vieja.monto], ['anterior', 24000])
  assert.match(vieja.motivo, /cuota 3 de 3/)
  assert.deepEqual([timbre.contraparte, timbre.categoria, timbre.monto], ['Impuesto de timbres', 'Impuestos', 240])
})

prueba('esPropio y comercio', () => {
  assert.equal(esPropio('Jesús Enrique Seiler Velasquez', 'Jesus Seiler'), true)
  assert.equal(esPropio('Jesús Pérez', 'Jesus Seiler'), false)
  assert.equal(esPropio('Cualquiera', ''), false)
  assert.equal(comercio('HIP LIDER PUERTO MONTT CH (0,00%)'), 'HIP LIDER PUERTO MONTT')
})

// ---------- cruzar.js ----------

prueba('cruzar: lo ya registrado calza por banco, monto, fecha cercana y sentido', () => {
  const c = leerCartola(machCuenta())
  const movs = clasificar(c, CONFIG)
  const existentes = [
    // El correo del ingreso, un día después: calza.
    { id: 'M1', banco: 'MACH', producto: 'Cuenta', tipo: 'ingreso', monto: 100000, fecha: '2026-09-02 10:00', contraparte: 'Ana Prueba' },
    // Mismo monto que el giro pero es un ingreso: no calza con un cargo.
    { id: 'M2', banco: 'MACH', producto: 'Cuenta', tipo: 'ingreso', monto: 10000, fecha: '2026-09-03 09:00' },
    // Otro banco: no se mira.
    { id: 'M3', banco: 'Tenpo', producto: 'Cuenta', tipo: 'gasto', monto: 15000, fecha: '2026-09-04 12:00' },
    // Una interna de la base calza con los dos sentidos.
    { id: 'M4', banco: 'MACH', producto: 'Cuenta', tipo: 'interna', monto: 60000, fecha: '2026-09-02 12:00' },
  ]
  const { movs: r, soloApp } = cruzar(c, movs, existentes)
  assert.deepEqual(r.map((m) => m.estado), ['registrado', 'registrado', 'nuevo', 'nuevo', 'nuevo'])
  assert.equal(r[0].registrado.id, 'M1')
  assert.equal(r[1].registrado.id, 'M4')
  assert.deepEqual(soloApp.map((m) => m.id), ['M2'])
})

prueba('cruzar: a más de 3 días ya no calza, y cada registrado se usa una vez', () => {
  const c = { banco: 'MACH', producto: 'Cuenta', periodo: { desde: '2026-09-01', hasta: '2026-09-30' } }
  const cand = [
    { fecha: '2026-09-10', monto: 5000, sentido: 'sale', tipo: 'gasto', estado: 'nuevo' },
    { fecha: '2026-09-10', monto: 5000, sentido: 'sale', tipo: 'gasto', estado: 'nuevo' },
    { fecha: '2026-09-20', monto: 7000, sentido: 'sale', tipo: 'gasto', estado: 'nuevo' },
  ]
  const ex = [
    { id: 'A', banco: 'MACH', producto: 'Cuenta', tipo: 'gasto', monto: 5000, fecha: '2026-09-11 08:00' },
    { id: 'B', banco: 'MACH', producto: 'Cuenta', tipo: 'gasto', monto: 7000, fecha: '2026-09-25 08:00' },
  ]
  const { movs } = cruzar(c, cand, ex)
  assert.deepEqual(movs.map((m) => m.estado), ['registrado', 'nuevo', 'nuevo'])
})

if (fallos.length) {
  console.error(fallos.join('\n'))
  process.exit(1)
}
console.log(`cartolas: ${ok} pruebas ok`)
