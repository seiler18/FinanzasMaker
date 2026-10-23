// Pruebas de backend/Code.gs + Supabase.gs + Migrar.gs (+ Lectores.gs) con un
// Apps Script y un Supabase de mentira (tests/apps-script-falso.mjs).
//
// Lo que más importa proteger aquí es el orden «escribir → borrar»: un correo
// solo va a la papelera si su fila ya quedó en la base. Y, desde que escribe
// con la clave secreta (que se salta la RLS), que toda consulta lleve el
// filtro del dueño.
import assert from 'node:assert/strict'
import { crearEntorno, planilla, USUARIO } from './apps-script-falso.mjs'

let e
function reiniciar() {
  e = crearEntorno()
  e.conectar()
  e.props.set('MIGRADO', 'si')
  e.G.instalar()
  e.props.set('CLIENT_ID', 'cliente-123.apps.googleusercontent.com')
}
const G = () => e.G
const cfg = (clave, valor) => { const f = e.filas('config').find((c) => c.clave === clave); if (f) f.valor = valor; else e.filas('config').push({ usuario: USUARIO, clave, valor }) }
const compraTenpo = (monto, comercio = 'FERRETERIA SUR SANTIAGO CHL', fecha) => e.correo('no-reply@tenpo.cl', 'Comprobante de compra con tu tarjeta de crédito',
  `La compra por $${monto} con tu tarjeta de crédito Tenpo fue exitosa. Monto transacción: $${monto} Comercio: ${comercio} Cuotas: 1`, fecha)
const token = (carga, firma = 'firma-buena') => [Buffer.from('{"alg":"RS256"}').toString('base64url'), Buffer.from(JSON.stringify(carga)).toString('base64url'), firma].join('.')
const valido = () => token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 })
const api = (accion, datos = {}, credencial = valido()) => e.G.doPost({ postData: { contents: JSON.stringify({ accion, credencial, ...datos }) } })

let ok = 0
const fallos = []
function prueba(nombre, fn) {
  reiniciar()
  try { fn(); ok++ } catch (err) { fallos.push(`✗ ${nombre}\n    ${err.stack.split('\n').slice(0, 3).join('\n    ')}`) }
}

/* ---------- instalación ---------- */
prueba('instalar siembra la configuración y las reglas base en la base, y deja los cuatro disparadores', () => {
  assert.equal(e.props.get('PROPIETARIO'), 'duenio@gmail.com')
  assert.ok(e.filas('reglas').length > 50)
  assert.equal(e.filas('config').find((c) => c.clave === 'borrar_correos').valor, 'si')
  assert.ok(e.filas('config').every((c) => c.usuario === USUARIO))
  assert.deepEqual(e.disparadores, ['procesarCorreos cada 30 min', 'actualizarAcciones cada 1 h', 'actualizarPrecios cada 5 min', 'alertasAcciones cada 4 h'])
})
prueba('instalar dos veces no duplica la configuración ni las reglas', () => {
  const n = e.filas('reglas').length
  G().instalar()
  assert.equal(e.filas('reglas').length, n)
})
prueba('sin las propiedades de Supabase, falla con un mensaje claro', () => {
  e.props.delete('SUPABASE_CLAVE')
  assert.throws(() => G().procesarCorreos(), /SUPABASE_CLAVE/)
})
prueba('sin migrar, el trabajador no procesa nada', () => {
  e.props.delete('MIGRADO')
  compraTenpo('12.000')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 0)
  assert.ok(!e.correos[0].papelera)
  assert.match(e.logs.join('\n'), /migrarASupabase/)
  assert.deepEqual(api('sincronizar').resumen, { ocupado: true })
})

/* ---------- procesamiento ---------- */
prueba('registra, escribe y DESPUÉS borra', () => {
  compraTenpo('12.000')
  G().procesarCorreos()
  const movs = e.filas('movimientos')
  assert.equal(movs.length, 1)
  assert.equal(movs[0].monto, 12000)
  assert.equal(movs[0].origen, 'correo')
  assert.equal(movs[0].usuario, USUARIO)
  assert.equal(e.filas('correos')[0].resultado, 'registrado')
  assert.ok(e.correos[0].papelera)
  assert.ok(e.orden.indexOf('escribe:movimientos') < e.orden.indexOf('papelera:' + e.correos[0].id), 'la papelera antes de escribir')
  assert.ok(e.orden.indexOf('escribe:correos') < e.orden.indexOf('papelera:' + e.correos[0].id), 'la papelera antes de la bitácora')
})
prueba('si la base no confirma la escritura, no se borra nada', () => {
  compraTenpo('12.000')
  G().procesarCorreos()
  compraTenpo('13.000', 'OTRO SANTIAGO CHL', '2026-09-19T12:00:00Z')
  e.props.delete('PASADA')
  e.supabase.falla = (metodo, tabla) => metodo === 'post' && tabla === 'movimientos'
  assert.throws(() => G().procesarCorreos(), /Supabase POST movimientos → 500/)
  assert.ok(!e.correos[1].papelera)
  assert.equal(e.filas('correos').length, 1, 'el que falló no queda en la bitácora: se reintenta')
  e.supabase.falla = null
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 2)
  assert.ok(e.correos[1].papelera)
})
prueba('si falla la bitácora, tampoco se borra', () => {
  compraTenpo('12.000')
  e.supabase.falla = (metodo, tabla) => metodo === 'post' && tabla === 'correos'
  assert.throws(() => G().procesarCorreos())
  assert.ok(!e.correos[0].papelera)
})
prueba('toda consulta a una tabla del dueño lleva su filtro, y toda fila su usuario', () => {
  compraTenpo('12.000')
  e.correo('avisos@santander.cl', 'Comprobante de transferencia', 'Se ha realizado una transferencia por $45.000 a Pedro')
  G().procesarCorreos()
  G().reclasificarExternas()
  const globales = ['acciones_precios', 'acciones_mapa']
  for (const p of e.supabase.pedidos.filter((x) => x.metodo !== 'post' && !globales.includes(x.tabla))) {
    assert.equal(p.params.get('usuario'), 'eq.' + USUARIO, `${p.metodo} ${p.tabla} sin filtro de usuario`)
  }
  for (const t of ['movimientos', 'correos', 'revisar', 'config', 'reglas', 'estado_trabajador']) {
    assert.ok(e.filas(t).length > 0, t)
    assert.ok(e.filas(t).every((f) => f.usuario === USUARIO), `${t} con fila sin usuario`)
  }
})
prueba('un lote con filas de distinta forma entra igual (columns + missing=default)', () => {
  G().agregarFilas_('acciones_operaciones', [{ fecha: '2026-06-04', tipo: 'compraUsd', usd: 100 }, { fecha: '2026-06-05', tipo: 'compra', cantidad: 1, usd: 2, gmail_id: 'x' }])
  assert.equal(e.filas('acciones_operaciones').length, 2)
  const p = e.supabase.pedidos.at(-1)
  assert.match(p.params.get('columns'), /cantidad/)
})
prueba('con borrar_correos = no, el correo queda', () => {
  cfg('borrar_correos', 'no')
  compraTenpo('9.990')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 1)
  assert.ok(!e.correos[0].papelera)
})
prueba('lo que no se entiende va a revisar y NO se borra', () => {
  e.correo('avisos@santander.cl', 'Comprobante de transferencia', 'Se ha realizado una transferencia por $45.000 a Pedro')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 0)
  const r = e.filas('revisar')
  assert.equal(r.length, 1)
  assert.equal(r[0].estado, 'pendiente')
  assert.equal(r[0].monto, 45000)
  assert.ok(!e.correos[0].papelera)
})
prueba('publicidad e ignorados no dejan rastro ni se borran', () => {
  e.correo('mensajeria@correobancoestado.cl', 'Jesus, ahorra un 20%', 'Descuento con Rutpay. Anular su suscripción')
  e.correo('no-reply@tenpo.cl', 'Estado de cuenta-Tarjeta de Crédito', 'Ya está disponible')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length + e.filas('revisar').length + e.filas('correos').length, 0)
  assert.ok(e.correos.every((m) => !m.papelera))
})
prueba('un correo ya procesado no se registra dos veces', () => {
  compraTenpo('5.000')
  G().procesarCorreos()
  e.correos[0].papelera = true
  e.props.delete('PASADA')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 1)
  // Y lo ya visto se pregunta a la base solo por los ids de la página.
  const consulta = e.supabase.pedidos.filter((p) => p.tabla === 'correos' && p.metodo === 'get').at(-1)
  assert.match(consulta.params.get('gmail_id'), /^in\.\("g1"\)$/)
})
prueba('los correos anteriores a «desde» se saltan', () => {
  compraTenpo('5.000', 'VIEJO SANTIAGO CHL', '2025-12-31T02:00:00Z') // 30-12 23:00 en Chile
  compraTenpo('6.000', 'NUEVO SANTIAGO CHL', '2026-01-01T04:00:00Z')
  G().procesarCorreos()
  assert.deepEqual(e.filas('movimientos').map((m) => m.monto), [6000])
})
prueba('la consulta incluye la papelera y los bancos sin lector', () => {
  G().procesarCorreos()
  assert.match(G().GmailApp.ultimaConsulta, /in:anywhere/)
  assert.match(G().GmailApp.ultimaConsulta, /-in:spam/)
  assert.match(G().GmailApp.ultimaConsulta, /after:2026\/01\/01/)
  assert.match(G().GmailApp.ultimaConsulta, /subject:comprobante/)
})
prueba('pasada larga: continúa donde quedó, al terminar avanza el cursor y la página lo ve', () => {
  for (let i = 0; i < 90; i++) compraTenpo(`${1000 + i}`, `TIENDA ${i} SANTIAGO CHL`, new Date(Date.UTC(2026, 1, 1) + i * 3600e3).toISOString())
  G().procesar_({ presupuestoMs: -1 }) // sin tiempo: hace una vuelta y deja la pasada abierta
  const abierta = JSON.parse(e.props.get('PASADA'))
  assert.ok(abierta.inicio > 0)
  assert.equal(e.filas('estado_trabajador')[0].importando, true)
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 90)
  const cerrada = JSON.parse(e.props.get('PASADA'))
  assert.equal(cerrada.inicio, 0)
  assert.match(cerrada.desde, /^\d+$/)
  const est = e.filas('estado_trabajador')
  assert.equal(est.length, 1)
  assert.equal(est[0].importando, false)
  assert.match(est[0].ultima, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(typeof est[0].resumen.registrados, 'number')
})
prueba('duplicado entre bancos: se anota, no se suma, y el correo se borra', () => {
  e.correo('no-reply@tenpo.cl', 'Comprobante de transferencia - Tenpo',
    'Comprobante de recibo transferencia La transferencia de MARIO ANDRESSOTOPEREZ por 5.520 a tu cuenta Tenpo fue exitosa Monto transferencia: $5.520', '2026-09-14T12:30:00Z')
  e.correo('notificaciones@cl.bancofalabella.com', 'Aviso de transferencia de fondos recibida',
    'nuestro(a) cliente MARIO ANDRES SOTO ha instruido una transferencia de fondos a su cuenta con el siguiente detalle: Monto $5.520', '2026-09-14T12:28:00Z')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 1)
  assert.equal(e.filas('correos').filter((c) => c.resultado === 'duplicado').length, 1)
  assert.ok(e.correos.every((m) => m.papelera))
})
prueba('ensayo: informa en la hoja sin registrar, sin borrar y sin mover el cursor', () => {
  compraTenpo('7.000')
  e.correo('avisos@santander.cl', 'Comprobante de transferencia', 'Se ha realizado una transferencia por $45.000')
  G().ensayo()
  assert.equal(e.filas('movimientos').length, 0)
  assert.equal(e.filas('revisar').length, 0)
  assert.ok(e.correos.every((m) => !m.papelera))
  assert.equal(e.props.get('PASADA'), undefined)
  const h = e.ss.hojas.Ensayo
  const cab = h.d[0]
  assert.deepEqual(h.d.slice(1).map((f) => f[cab.indexOf('resultado')]).sort(), ['movimiento', 'revisar'])
})
prueba('en la hoja Ensayo, un asunto con fórmula queda neutralizado', () => {
  e.correo('avisos@santander.cl', '=IMPORTXML("http://x","//a") comprobante', 'Se ha realizado una transferencia por $1.000')
  G().ensayo()
  const h = e.ss.hojas.Ensayo
  assert.ok(String(h.crudo[1][h.d[0].indexOf('asunto')]).startsWith("'="))
})
prueba('una pasada vieja sin «base» se reinicia', () => {
  e.props.set('PASADA', JSON.stringify({ desde: String(Math.floor(Date.now() / 1000) - 3600), inicio: 0, comenzo: 0 }))
  compraTenpo('4.000', 'VIEJA SANTIAGO CHL', '2026-02-01T12:00:00Z')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 1)
  assert.match(G().GmailApp.ultimaConsulta, /after:2026\/01\/01 /)
})
prueba('cambiar «desde» en la configuración reimporta desde la fecha nueva', () => {
  G().procesarCorreos()
  cfg('desde', '2025/06/01')
  G().procesarCorreos()
  assert.match(G().GmailApp.ultimaConsulta, /after:2025\/06\/01 /)
})
prueba('correos que no son de bancos no se abren', () => {
  const m = e.correo('notifications@github.com', 'Aviso de pago de Actions', 'Pago de $5.000')
  G().procesarCorreos()
  assert.ok(!m.abierto)
  assert.ok(!m.papelera)
})
prueba('la fecha queda en el formato de la base y lo largo se recorta', () => {
  compraTenpo('4.000', 'X'.repeat(300) + ' SANTIAGO CHL')
  G().procesarCorreos()
  const m = e.filas('movimientos')[0]
  assert.match(m.fecha, /^2026-09-18 \d{2}:\d{2}$/)
  assert.equal(m.contraparte.length, 200)
  assert.equal(m.cuotas, 1)
  assert.equal(m.monto_original, null, "'' pasa a null en una columna numérica")
  assert.equal(typeof e.filas('correos')[0].gmail_id, 'string')
})
prueba('reiniciarImportacion borra el cursor', () => {
  G().procesarCorreos()
  assert.ok(e.props.get('PASADA'))
  G().reiniciarImportacion()
  assert.equal(e.props.get('PASADA'), undefined)
})

/* ---------- lo que decide la página ---------- */
prueba('lo marcado para borrar en revisar se va a la papelera en la pasada siguiente, una vez', () => {
  e.correo('avisos@santander.cl', 'Comprobante de transferencia', 'Se ha realizado una transferencia por $45.000')
  G().procesarCorreos()
  const r = e.filas('revisar')[0]
  assert.ok(!e.correos[0].papelera)
  Object.assign(r, { estado: 'descartado', borrar_correo: true })
  G().procesarCorreos()
  assert.ok(e.correos[0].papelera)
  assert.equal(r.correo_borrado, true)
  e.correos[0].papelera = false
  G().procesarCorreos()
  assert.ok(!e.correos[0].papelera, 'ya anotado: no se vuelve a tocar')
})
prueba('un correo marcado que ya no existe se anota igual y no traba la pasada', () => {
  e.filas('revisar').push({ usuario: USUARIO, gmail_id: 'no-existe', estado: 'registrado', borrar_correo: true, correo_borrado: false })
  compraTenpo('1.000')
  G().procesarCorreos()
  assert.equal(e.filas('revisar')[0].correo_borrado, true)
  assert.equal(e.filas('movimientos').length, 1)
})
prueba('eliminar en la página quita el movimiento pero la bitácora impide reimportarlo', () => {
  compraTenpo('1.000')
  G().procesarCorreos()
  e.supabase.tablas.movimientos = []
  e.correos[0].papelera = true
  e.props.delete('PASADA')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 0)
})

/* ---------- frecuencia y cuotas de Google ---------- */
prueba('con el tope diario de disparador usado, la pasada espera a mañana', () => {
  compraTenpo('8.000')
  const hoy = G().Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd')
  e.props.set('USO', JSON.stringify({ dia: hoy, ms: 60 * 60 * 1000 }))
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 0)
  e.props.set('USO', JSON.stringify({ dia: '2000-01-01', ms: 60 * 60 * 1000 })) // otro día: vuelve a cero
  G().procesarCorreos()
  assert.equal(e.filas('movimientos').length, 1)
  assert.equal(JSON.parse(e.props.get('USO')).dia, hoy)
})
prueba('un correo ignorado no se vuelve a abrir en la pasada siguiente', () => {
  const m = e.correo('no-reply@tenpo.cl', 'Estado de cuenta-Tarjeta de Crédito', 'Ya está disponible')
  G().procesarCorreos()
  assert.ok(m.abierto)
  m.abierto = false
  e.props.delete('PASADA')
  G().procesarCorreos()
  assert.ok(!m.abierto, 'se abrió otra vez')
  assert.ok(!m.papelera)
})

/* ---------- Binance y cuentas externas ---------- */
prueba('remesa por Binance: la compra P2P no suma y el envío de USDT es el gasto', () => {
  e.correo('mensajeria@copecpay.cl', 'Tu transferencia se realizó con éxito',
    '¡Listo! Tu transferencia se envió con éxito Monto $25.000 Cuenta destino: Leveltech SPA Cuenta Corriente ****0000 BCI/MACHBANK N° transacción: 000000 Comentario: pago', '2026-09-28T17:22:50Z')
  e.correo('do-not-reply@ses.binance.com', '[Binance]Payment Transaction Detail - 2026-09-28 17:27:48 (UTC)',
    'Payment Transaction Detail You made the following payment: Time: 2026-09-28 17:27:48(UTC) Amount: 40 USDT', '2026-09-28T17:27:49Z')
  G().procesarCorreos()
  const movs = e.filas('movimientos')
  const compra = movs.find((m) => m.banco === 'Copec Pay')
  const envio = movs.find((m) => m.banco === 'Binance')
  assert.equal(compra.tipo, 'interna')
  assert.equal(compra.categoria, 'Compra de cripto')
  assert.equal(envio.tipo, 'gasto')
  assert.equal(envio.monto, 38000)
  assert.equal(envio.categoria, 'Remesas')
  assert.equal(envio.fecha, '2026-09-28 14:27', 'hora de Chile, no la UTC del cuerpo')
  assert.ok(e.correos.every((m) => m.papelera))
})
prueba('reclasificarCripto corrige una compra P2P que entró como gasto', () => {
  e.correo('mensajeria@copecpay.cl', 'Tu transferencia se realizó con éxito',
    '¡Listo! Tu transferencia se envió con éxito Monto $25.000 Cuenta destino: Leveltech SPA Cuenta Corriente ****0000 BCI/MACHBANK N° transacción: 000000')
  cfg('vendedores_cripto', '')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos')[0].tipo, 'gasto')
  cfg('vendedores_cripto', 'Leveltech')
  G().reclasificarCripto()
  assert.equal(e.filas('movimientos')[0].tipo, 'interna')
  assert.equal(e.filas('movimientos')[0].categoria, 'Compra de cripto')
})
prueba('sueldo que pasa de Mercado Pago a Copec Pay entra como ingreso', () => {
  e.correo('info@mercadopago.cl', '¡Enviamos tu transferencia!',
    'Ya enviamos tu transferencia de $ 1.096.130 Datos del beneficiario Nombre y apellido: Jesus Seiler Velasquez Entidad: Copec Pay Número de cuenta: 000')
  G().procesarCorreos()
  const m = e.filas('movimientos')[0]
  assert.equal(m.tipo, 'ingreso')
  assert.equal(m.categoria, 'Desde Mercado Pago')
})
prueba('reclasificarExternas corrige lo registrado antes como interno', () => {
  cfg('cuentas_externas', '')
  e.correo('info@mercadopago.cl', '¡Enviamos tu transferencia!',
    'Ya enviamos tu transferencia de $ 900.000 Datos del beneficiario Nombre y apellido: Jesus Seiler Entidad: MACHBANK/BCI')
  G().procesarCorreos()
  assert.equal(e.filas('movimientos')[0].tipo, 'interna')
  cfg('cuentas_externas', 'Mercado Pago')
  G().reclasificarExternas()
  assert.equal(e.filas('movimientos')[0].tipo, 'ingreso')
  G().reclasificarExternas()
  assert.equal(e.filas('movimientos')[0].tipo, 'ingreso')
})

/* ---------- identidad («Revisar correos ahora») ---------- */
prueba('sin credencial o con una ajena no se procesa nada', () => {
  assert.equal(api('sincronizar', {}, '').sesion, false)
  assert.equal(api('sincronizar', {}, 'no-es-un-jwt').sesion, false)
  const otro = token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'intruso@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 })
  assert.equal(api('sincronizar', {}, otro).sesion, false)
  const otraApp = token({ aud: 'otra.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 })
  assert.equal(api('sincronizar', {}, otraApp).sesion, false)
  const vencido = token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) - 10 })
  assert.equal(api('sincronizar', {}, vencido).sesion, false)
  assert.equal(e.fetchesGoogle, 0, 'lo que se descarta localmente no gasta llamadas a Google')
})
prueba('firma inválida: Google la rechaza', () => {
  const falso = token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 }, 'firma-mala')
  assert.equal(api('sincronizar', {}, falso).sesion, false)
  assert.equal(e.fetchesGoogle, 1)
})
prueba('token válido: una sola verificación y luego caché', () => {
  const t = valido()
  assert.equal(api('sincronizar', {}, t).ok, true)
  assert.equal(api('sincronizar', {}, t).ok, true)
  assert.equal(e.fetchesGoogle, 1)
})
prueba('freno: más de 30 verificaciones por minuto se cortan', () => {
  for (let i = 0; i < 35; i++) {
    api('sincronizar', {}, token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600, n: i }, 'firma-mala'))
  }
  assert.equal(e.fetchesGoogle, 30)
})
prueba('la API ya no entrega datos: eso es Supabase', () => {
  for (const accion of ['datos', 'agregar', 'editar', 'eliminar', 'revisar', 'presupuesto', 'borrarTodo']) {
    assert.equal(api(accion).error, 'Acción no válida', accion)
  }
})
prueba('sincronizar desde la página', () => {
  compraTenpo('1.000')
  const r = api('sincronizar')
  assert.equal(r.resumen.registrados, 1)
  assert.equal(r.resumen.completa, true)
})

/* ---------- migración desde la planilla ---------- */
function planillaVieja() {
  return planilla({
    Movimientos: [
      ['id', 'fecha', 'banco', 'producto', 'tipo', 'monto', 'moneda', 'monto_original', 'contraparte', 'categoria', 'cuotas', 'detalle', 'nota', 'origen', 'gmail_id', 'registrado', 'fecha_contable'],
      ['M1', '2026-09-01 10:00', 'Tenpo', 'Cuenta', 'gasto', 5000, 'CLP', '', 'JUMBO', 'Supermercado', '', '', '', 'correo', 'g-a', '2026-09-01 10:05', ''],
      ['M2', new Date('2026-09-02T15:30:00Z'), 'MACH', 'Tarjeta de crédito', 'gasto', 90000, 'CLP', '', 'PARIS', 'Compras', 3, '', 'regalo', 'correo', 'g-b', '', '2026-10-01'],
      ['M3', '2026-09-03', 'Efectivo', 'Cuenta', 'gasto', 1200, 'CLP', '', 'Feria', 'Comida', '', '', '', 'manual', '', '', ''],
      ['', 'mal', '', '', 'gasto', 1, '', '', '', '', '', '', '', '', '', '', ''],
      ['M5', '2026-09-04 09:00', 'Tenpo', 'Cuenta', 'regalo', 1, 'CLP', '', '', '', '', '', '', 'correo', '', '', ''],
    ],
    Inversiones: [['id', 'fecha', 'plataforma', 'operacion', 'instrumento', 'monto', 'moneda', 'detalle', 'gmail_id', 'registrado'],
      ['I1', '2026-09-05 11:00', 'Fintual', 'aporte', 'Objetivo', 100000, 'CLP', '', 'g-c', '']],
    Revisar: [['gmail_id', 'fecha', 'remitente', 'asunto', 'motivo', 'tipo', 'monto', 'contraparte', 'banco', 'extracto', 'estado'],
      ['g-d', '2026-09-06 08:00', 'avisos@x.cl', 'Comprobante', 'Sin lector', 'gasto', 45000, '', 'X', '...', 'pendiente']],
    Correos: [['gmail_id', 'fecha', 'remitente', 'asunto', 'resultado', 'lector', 'referencia', 'procesado'],
      ['g-a', '2026-09-01 10:00', 'no-reply@tenpo.cl', 'Compra', 'registrado', 'tenpo-compra', 'M1', '2026-09-01 10:05'],
      [18012345678, '2026-09-02 12:30', 'mach', 'Compra', 'registrado', 'mach-compra', 'M2', '']],
    Reglas: [['patron', 'categoria', 'tipo'], ['don pepe', 'Comida', ''], ['fintual', 'Inversiones', 'inversion']],
    Presupuestos: [['categoria', 'monto_mensual'], ['Comida', 90000], ['Nada', 0]],
    Config: [['clave', 'valor'], ['titular', 'Jesus Seiler'], ['desde', new Date('2026-01-01T03:00:00Z')], ['borrar_correos', 'si']],
  })
}
prueba('migrarASupabase pasa las hojas a la base, salta lo ilegible y abre el paso al trabajador', () => {
  e = crearEntorno()
  e.conectar()
  e.ss = planillaVieja()
  e.G.SpreadsheetApp.getActive = () => e.ss
  e.props.set('ULTIMA', '2026-09-30T12:00:00.000Z')
  compraTenpo('1.000')
  e.G.procesarCorreos()
  assert.equal(e.filas('movimientos').length, 0, 'antes de migrar no se procesa')

  e.G.migrarASupabase()
  assert.equal(e.props.get('MIGRADO'), 'si')
  const movs = e.filas('movimientos')
  assert.deepEqual(movs.map((m) => m.id), ['M1', 'M2', 'M3'])
  // 15:30 UTC del 2 de septiembre: Chile aún no pasa al horario de verano (UTC−4).
  assert.equal(movs[1].fecha, '2026-09-02 11:30', 'la Date de la hoja, en hora de Chile')
  assert.equal(movs[1].cuotas, 3)
  assert.equal(movs[1].fecha_contable, '2026-10-01')
  assert.equal(movs[2].fecha, '2026-09-03 12:00')
  assert.ok(movs.every((m) => m.usuario === USUARIO))
  assert.equal(e.filas('inversiones').length, 1)
  assert.equal(e.filas('revisar')[0].monto, 45000)
  assert.deepEqual(e.filas('correos').map((c) => c.gmail_id), ['g-a', '18012345678'], 'un id que Sheets volvió número, de vuelta a texto')
  assert.deepEqual(e.filas('reglas').map((r) => r.patron), ['don pepe', 'fintual'], 'en su orden')
  assert.deepEqual(e.filas('presupuestos').map((p) => p.categoria), ['Comida'])
  assert.equal(e.filas('config').find((c) => c.clave === 'desde').valor, '2026/01/01')
  assert.equal(e.filas('estado_trabajador')[0].ultima, '2026-09-30T12:00:00.000Z')
  assert.match(e.logs.join('\n'), /2 fila\(s\) saltada\(s\)/)
  assert.throws(() => e.G.migrarASupabase(), /Ya se migró/)
})
prueba('migrarASupabase no duplica las reglas si la base ya tenía', () => {
  e = crearEntorno()
  e.conectar()
  e.ss = planillaVieja()
  e.G.SpreadsheetApp.getActive = () => e.ss
  e.filas('reglas').push({ id: 1, usuario: USUARIO, patron: 'jumbo', categoria: 'Supermercado', tipo: '' })
  e.G.migrarASupabase()
  assert.deepEqual(e.filas('reglas').map((r) => r.patron), ['jumbo'])
})
prueba('empezarDeCero abre el paso sin traer nada y siembra lo base', () => {
  e = crearEntorno()
  e.conectar()
  e.G.empezarDeCero()
  assert.equal(e.props.get('MIGRADO'), 'si')
  assert.ok(e.filas('reglas').length > 50)
})

console.log(`backend: ${ok} pruebas ok`)
if (fallos.length) { console.error(fallos.join('\n')); process.exit(1) }
