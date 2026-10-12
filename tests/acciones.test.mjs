// Pruebas de backend/Acciones.gs y de migrarAccionesASupabase (Migrar.gs):
// lo que hacía la hoja de gestor-acciones, ahora en el trabajador.
// Los correos son sintéticos, con la forma que leen las expresiones de
// gestor-acciones (probadas allá contra los correos reales de Fintual).
import assert from 'node:assert/strict'
import { crearEntorno, planilla, USUARIO } from './apps-script-falso.mjs'

let e
function reiniciar() {
  e = crearEntorno()
  e.conectar()
  e.props.set('MIGRADO', 'si')
  e.props.set('MIGRADO_ACCIONES', 'si')
  e.G.instalar()
  e.filas('acciones_mapa').push({ nombre: 'Vanguard S&P 500 ETF', ticker: 'VOO' })
}
const fintual = (asunto, texto, fecha = '2026-09-18T15:00:00Z') => e.correo('hola@fintual.com', asunto, texto, fecha)
const ops = () => e.filas('acciones_operaciones')

let ok = 0
const fallos = []
function prueba(nombre, fn) {
  reiniciar()
  try { fn(); ok++ } catch (err) { fallos.push(`✗ ${nombre}\n    ${err.stack.split('\n').slice(0, 3).join('\n    ')}`) }
}

/* ---------- correos de Fintual ---------- */
prueba('compra de acciones: monto y cantidad con coma decimal, ticker del mapa', () => {
  fintual('Invertiste US$ 120,50 dólares en 0,2 acciones de Vanguard S&P 500 ETF', 'Monto invertido US$ 120,50\nAcciones compradas 0,2\n')
  e.G.actualizarAcciones()
  assert.equal(ops().length, 1)
  const o = ops()[0]
  assert.equal(o.tipo, 'compra')
  assert.equal(o.ticker, 'VOO')
  assert.equal(o.usd, 120.5)
  assert.equal(o.cantidad, 0.2)
  assert.equal(o.fecha, '2026-09-18')
  assert.equal(o.usuario, USUARIO)
  assert.equal(o.gmail_id, e.correos[0].id)
  assert.match(e.filas('acciones_alertas')[0].detalle, /1 movimiento/)
  assert.match(e.filas('estado_trabajador')[0].ultima_acciones, /^\d{4}-/)
})
prueba('venta, dividendo y dólares', () => {
  fintual('Vendiste 0,1 acciones de Vanguard S&P 500 ETF', 'Cantidad de acciones 0,1\nRecibiste US$ 65,00\n', '2026-09-19T15:00:00Z')
  fintual('Recibiste un dividendo de VOO por 1,50 dólares', 'Recibiste un dividendo de Vanguard S&P 500 ETF por US$ 1,50', '2026-09-20T15:00:00Z')
  fintual('Compraste US$ 100 dólares', 'compraste US$ 100,00 con tus $ 95.000 pesos al tipo de cambio de $ 950,00', '2026-09-21T15:00:00Z')
  fintual('Confirmamos la venta de tus 50 dólares', 'Convertimos los US$ 50,00 a pesos. Los vamos a vender a $ 47.000 con una tasa de $ 940,00', '2026-09-22T15:00:00Z')
  e.G.actualizarAcciones()
  const por = Object.fromEntries(ops().map((o) => [o.tipo, o]))
  assert.deepEqual(Object.keys(por).sort(), ['compraUsd', 'dividendo', 'venta', 'ventaUsd'])
  assert.equal(por.venta.cantidad, 0.1)
  assert.equal(por.venta.usd, 65)
  assert.equal(por.dividendo.ticker, 'VOO')
  assert.equal(por.dividendo.cantidad, null)
  assert.equal(por.compraUsd.clp, 95000)
  assert.equal(por.compraUsd.tipo_cambio, 950)
  assert.equal(por.compraUsd.comision_clp, 400)
  assert.equal(por.ventaUsd.clp, 47000)
  assert.equal(por.ventaUsd.ticker, 'USD')
})
prueba('un mismo correo entra una vez, aunque esté en la papelera', () => {
  const m = fintual('Invertiste US$ 10 dólares en 0,02 acciones de Vanguard S&P 500 ETF', 'Monto invertido US$ 10\nAcciones compradas 0,02\n')
  e.G.actualizarAcciones()
  m.papelera = true
  e.G.actualizarAcciones()
  assert.equal(ops().length, 1)
})
prueba('activo nuevo: AUTO-MAPA busca el ticker en Yahoo, lo anota y avisa', () => {
  e.buscarYahoo['iShares Core MSCI EM'] = 'IEMG'
  fintual('Invertiste US$ 30 dólares en 0,5 acciones de iShares Core MSCI EM', 'Monto invertido US$ 30\nAcciones compradas 0,5\n')
  e.G.actualizarAcciones()
  assert.equal(ops()[0].ticker, 'IEMG')
  assert.ok(e.filas('acciones_mapa').some((m) => m.nombre === 'iShares Core MSCI EM' && m.ticker === 'IEMG'))
  assert.ok(e.filas('acciones_alertas').some((a) => a.tipo === 'AUTO-MAPA'))
  assert.equal(e.enviados.length, 1)
  assert.equal(e.enviados[0].a, 'duenio@gmail.com')
})
prueba('un correo de operación ilegible se avisa UNA vez', () => {
  fintual('Invertiste en acciones de Algo', 'sin montos')
  e.G.actualizarAcciones()
  e.G.actualizarAcciones()
  assert.equal(ops().length, 0)
  assert.equal(e.enviados.filter((x) => /no clasificados/.test(x.asunto)).length, 1)
  assert.equal(e.filas('acciones_alertas').filter((a) => a.tipo === 'REVISAR').length, 1)
})
prueba('un boletín de Fintual no es una operación y no avisa', () => {
  fintual('Novedades de octubre', 'Te contamos qué pasó en los mercados')
  e.G.actualizarAcciones()
  assert.equal(ops().length + e.enviados.length, 0)
})
prueba('sin migrar, no lee nada', () => {
  e.props.delete('MIGRADO_ACCIONES')
  fintual('Invertiste US$ 10 dólares en 0,02 acciones de Vanguard S&P 500 ETF', 'Monto invertido US$ 10\nAcciones compradas 0,02\n')
  e.G.actualizarAcciones()
  e.G.alertasAcciones()
  assert.equal(ops().length, 0)
  assert.match(e.logs.join('\n'), /migrarAccionesASupabase/)
})
prueba('empezarAccionesDeCero abre el paso', () => {
  e.props.delete('MIGRADO_ACCIONES')
  e.G.empezarAccionesDeCero()
  assert.equal(e.props.get('MIGRADO_ACCIONES'), 'si')
})

/* ---------- precios ---------- */
prueba('precios: Yahoo para cada ticker y el dólar; lo que falla conserva el anterior', () => {
  ops().push({ id: 1, usuario: USUARIO, fecha: '2026-06-03', tipo: 'compra', ticker: 'VOO', activo: 'Vanguard S&P 500 ETF', cantidad: 1, usd: 500 },
    { id: 2, usuario: USUARIO, fecha: '2026-06-03', tipo: 'compra', ticker: 'XYZ', activo: 'Otra', cantidad: 1, usd: 10 })
  e.filas('acciones_precios').push({ ticker: 'XYZ', nombre: 'Otra', precio: 9, cambio_dia: 0, actualizado: '2026-09-01T00:00:00Z' })
  e.yahoo.VOO = [606, 600]
  e.yahoo['CLP=X'] = [950, 950]
  e.G.actualizarAcciones()
  const p = Object.fromEntries(e.filas('acciones_precios').map((x) => [x.ticker, x]))
  assert.equal(p.VOO.precio, 606)
  assert.ok(Math.abs(p.VOO.cambio_dia - 0.01) < 1e-9)
  assert.equal(p.VOO.nombre, 'Vanguard S&P 500 ETF')
  assert.equal(p.USDCLP.precio, 950)
  assert.equal(p.XYZ.precio, 9, 'sin respuesta de Yahoo queda el último')
  assert.equal(p.XYZ.actualizado, '2026-09-01T00:00:00Z')
  assert.ok(!('usuario' in p.VOO), 'los precios son de todos: sin usuario')
})

/* ---------- alertas ---------- */
prueba('alertas: ganancia sobre el umbral y caída del día, sin repetir el mismo aviso', () => {
  ops().push({ id: 1, usuario: USUARIO, fecha: '2026-06-03', tipo: 'compra', ticker: 'VOO', cantidad: 1, usd: 500 },
    { id: 2, usuario: USUARIO, fecha: '2026-06-03', tipo: 'compra', ticker: 'QQQ', cantidad: 1, usd: 400 })
  e.filas('acciones_precios').push({ ticker: 'VOO', precio: 530, cambio_dia: 0.001 }, { ticker: 'QQQ', precio: 395, cambio_dia: -0.04 })
  e.G.alertasAcciones()
  assert.equal(e.enviados.length, 1)
  assert.match(e.enviados[0].texto, /VENDER\? VOO va \+6\.0%/)
  assert.match(e.enviados[0].texto, /COMPRAR\? QQQ cae -4\.0%/)
  assert.equal(e.filas('acciones_alertas').at(-1).tipo, '2 señal(es)')
  e.G.alertasAcciones()
  assert.equal(e.enviados.length, 1, 'mismas señales: no se repite')
  e.filas('acciones_precios').find((x) => x.ticker === 'QQQ').cambio_dia = 0
  e.G.alertasAcciones()
  assert.equal(e.enviados.length, 2, 'cambiaron las señales: avisa')
})
prueba('alertas: el umbral sale de la configuración y el correo de email_alertas', () => {
  ops().push({ id: 1, usuario: USUARIO, fecha: '2026-06-03', tipo: 'compra', ticker: 'VOO', cantidad: 1, usd: 500 })
  e.filas('acciones_precios').push({ ticker: 'VOO', precio: 530, cambio_dia: 0 })
  e.filas('config').push({ usuario: USUARIO, clave: 'umbral_venta_pct', valor: '10' }, { usuario: USUARIO, clave: 'email_alertas', valor: 'otro@correo.cl' })
  e.G.alertasAcciones()
  assert.equal(e.enviados.length, 0, '+6 % no llega a 10 %')
  e.filas('acciones_precios')[0].precio = 560
  e.G.alertasAcciones()
  assert.equal(e.enviados[0].a, 'otro@correo.cl')
})

/* ---------- migración desde la hoja de gestor-acciones ---------- */
function hojaGestor() {
  return planilla({
    Movimientos: [
      ['Fecha', 'Tipo', 'Activo', 'Ticker', 'Cantidad', 'Monto USD', 'Monto CLP', 'Tipo cambio', 'Comision CLP', 'Fuente', 'ID Correo'],
      ['04/06/2026', 'Compra USD', 'Dólares (USD)', 'USD', 200, 200, 190000, 950, 800, 'Manual', ''],
      [new Date('2026-06-05T15:00:00Z'), 'Compra acción', 'Vanguard S&P 500 ETF', 'VOO', '0,3', 150, '', '', '', 'Correo Gmail', 'x-1'],
      ['05/06/2026', 'Compra acción', 'Otra', 'ABC', 1, 20, '', '', '', 'Manual', ''],
      ['', '', '', '', '', '', '', '', '', '', ''],
      ['06/06/2026', 'Algo raro', '', '', '', '', '', '', '', '', ''],
    ],
    Mapa: [['Nombre', 'Ticker'], ['Vanguard S&P 500 ETF', 'VOO'], ['Otra', 'ABC']],
    Alertas: [['Fecha', 'Tipo', 'Detalle'], [new Date('2026-07-01T12:00:00Z'), 'IMPORTACIÓN', '1 movimiento']],
    Precios: [['Ticker', 'Nombre', 'Precio', 'Cambio', 'Actualizado'], ['VOO', 'Vanguard', 600, 0.01, new Date('2026-10-01T12:00:00Z')], ['ABC', 'Otra', 'sin dato', '', '']],
    Configuración: [['CONFIGURACIÓN', ''], ['', ''], ['Parámetro', 'Valor'], ['Email', 'yo@gmail.com'], ['Vender', 7], ['Comprar', 2],
      ['Horas', 1], ['Desde', '04/06/2026'], ['Última', ''], ['Leídos', 0], ['Alertas', 4]],
  })
}
prueba('migrarAccionesASupabase trae operaciones (en orden), mapa, alertas, precios y umbrales', () => {
  e.props.delete('MIGRADO_ACCIONES')
  e.externas['https://hoja/gestor'] = hojaGestor()
  e.props.set('PLANILLA_ACCIONES', 'https://hoja/gestor')
  assert.throws(() => { e.props.delete('PLANILLA_ACCIONES'); e.G.migrarAccionesASupabase() }, /PLANILLA_ACCIONES/)
  e.props.set('PLANILLA_ACCIONES', 'https://hoja/gestor')
  e.G.migrarAccionesASupabase()
  assert.deepEqual(ops().map((o) => [o.fecha, o.tipo, o.ticker]), [['2026-06-04', 'compraUsd', 'USD'], ['2026-06-05', 'compra', 'VOO'], ['2026-06-05', 'compra', 'ABC']])
  assert.equal(ops()[1].cantidad, 0.3)
  assert.equal(ops()[1].gmail_id, 'x-1')
  assert.equal(ops()[0].gmail_id, null, 'sin correo: null, para que el unique no choque')
  assert.ok(e.filas('acciones_mapa').some((m) => m.nombre === 'Otra' && m.ticker === 'ABC'))
  assert.equal(e.filas('acciones_alertas').length, 1)
  assert.deepEqual(e.filas('acciones_precios').map((p) => p.ticker), ['VOO'], '«sin dato» no se trae')
  const cfg = Object.fromEntries(e.filas('config').map((c) => [c.clave, c.valor]))
  assert.equal(cfg.umbral_venta_pct, '7')
  assert.equal(cfg.umbral_caida_pct, '2')
  assert.equal(cfg.email_alertas, 'yo@gmail.com')
  assert.equal(cfg.acciones_desde, '2026/06/04')
  assert.equal(e.props.get('MIGRADO_ACCIONES'), 'si')
  assert.match(e.logs.join('\n'), /1 fila\(s\) saltada\(s\)/)
  assert.throws(() => e.G.migrarAccionesASupabase(), /Ya se migró/)
})
prueba('migrarAccionesASupabase se puede repetir tras un corte: no duplica operaciones ni alertas y completa el resto', () => {
  e.props.delete('MIGRADO_ACCIONES')
  const hoja = hojaGestor()
  // La hoja Mapa con un nombre repetido: lo que hizo fallar la primera corrida real.
  hoja.hojas.Mapa.set(4, 1, 'Otra'); hoja.hojas.Mapa.set(4, 2, 'ABC2')
  e.externas['https://hoja/gestor'] = hoja
  e.props.set('PLANILLA_ACCIONES', 'https://hoja/gestor')
  ops().push({ id: 1, usuario: USUARIO, fecha: '2026-06-04', tipo: 'compraUsd', ticker: 'USD' })
  e.G.migrarAccionesASupabase()
  assert.equal(ops().length, 1, 'las operaciones que ya estaban no se tocan')
  assert.equal(e.filas('acciones_mapa').filter((m) => m.nombre === 'Otra').length, 1)
  assert.equal(e.filas('acciones_mapa').find((m) => m.nombre === 'Otra').ticker, 'ABC2', 'gana la última')
  assert.equal(e.filas('acciones_alertas').length, 1)
  assert.equal(e.props.get('MIGRADO_ACCIONES'), 'si')
})
prueba('un envío con la misma clave repetida entra igual (la última gana)', () => {
  e.G.agregarFilas_('acciones_mapa', [{ nombre: 'X', ticker: 'A' }, { nombre: 'X', ticker: 'B' }], { conflicto: 'nombre' })
  assert.deepEqual(e.filas('acciones_mapa').filter((m) => m.nombre === 'X').map((m) => m.ticker), ['B'])
})

console.log(`acciones: ${ok} pruebas ok`)
if (fallos.length) { console.error(fallos.join('\n')); process.exit(1) }
