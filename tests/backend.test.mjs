// Pruebas de backend/Code.gs (+ Lectores.gs) con simulaciones mínimas de
// Apps Script: hoja en memoria, Gmail falso, caché, propiedades y tokeninfo.
//
// Lo que más importa proteger aquí es el orden «escribir → borrar»: un
// correo solo va a la papelera si su fila ya quedó en la hoja.
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'

const leerSrc = (f) => fs.readFileSync(new URL('../backend/' + f, import.meta.url), 'utf8')

/* ---------- simulaciones ---------- */
const firmar = (b) => [...b].map((x) => (x > 127 ? x - 256 : x))
const aBuf = (x) => (typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map((b) => (b + 256) % 256)))

class Hoja {
  constructor(n) { this.n = n; this.d = []; this.crudo = [] }
  getLastRow() { return this.d.length }
  getMaxRows() { return 1000 }
  getRange(r, c, nr = 1, nc = 1) {
    const h = this
    return {
      getValues() {
        const out = []
        for (let i = 0; i < nr; i++) { const f = []; for (let j = 0; j < nc; j++) f.push(h.d[r - 1 + i]?.[c - 1 + j] ?? ''); out.push(f) }
        return out
      },
      setValues(v) {
        if (h.falla) throw new Error('Sheets no responde')
        v.forEach((fila, i) => fila.forEach((x, j) => h.set(r + i, c + j, x))); return this
      },
      setValue(x) { h.set(r, c, x); return this },
      setNumberFormat() { return this }, setFontWeight() { return this },
    }
  }
  // Como Sheets: un texto con apóstrofo inicial se guarda como texto SIN
  // el apóstrofo; y un texto con forma de fecha, sin apóstrofo, se vuelve
  // Date (así se rompió «desde» en la primera instalación real).
  set(r, c, x) {
    while (this.d.length < r) { this.d.push([]); this.crudo.push([]) }
    const f = this.d[r - 1]; while (f.length < c) f.push('')
    this.crudo[r - 1][c - 1] = x
    if (typeof x === 'string' && x.startsWith("'")) f[c - 1] = x.slice(1)
    else if (typeof x === 'string' && /^\d{4}[/-]\d{2}[/-]\d{2}( \d{2}:\d{2})?$/.test(x)) f[c - 1] = new Date(x.replace(/\//g, '-').replace(' ', 'T') + (x.length > 10 ? ':00-03:00' : 'T00:00:00-03:00'))
    else f[c - 1] = x
  }
  deleteRows(i, n) { this.d.splice(i - 1, n); this.crudo.splice(i - 1, n) }
  clearContents() { this.d = []; this.crudo = [] }
  setFrozenRows() {}
}

let hojas, cache, props, correos, fetches, reloj, logs
const ss = {
  getSheetByName: (n) => hojas[n] || null,
  insertSheet: (n) => (hojas[n] = new Hoja(n)),
}

class Msg {
  constructor(o) { Object.assign(this, { papelera: false, ...o }) }
  getId() { return this.id }
  getFrom() { return this.de }
  getSubject() { return this.asunto }
  getDate() { return new Date(this.fecha) }
  getPlainBody() { this.abierto = true; return this.texto }
  getBody() { return this.html || '' }
  isDraft() { return false }
  isInTrash() { return this.papelera }
  moveToTrash() { this.orden.push('papelera:' + this.id); this.papelera = true }
}

const orden = []
const G = {
  console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) },
  SpreadsheetApp: { getActive: () => ss, flush: () => orden.push('flush') },
  CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'Duenio@Gmail.com' }) },
  ScriptApp: {
    getProjectTriggers: () => [], deleteTrigger() {},
    newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create() { G.ScriptApp.creado = fn + ' cada ' + n } }) }) }),
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (a, s) => firmar(crypto.createHash('sha256').update(aBuf(s)).digest()),
    base64DecodeWebSafe: (s) => firmar(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (b) => ({ getDataAsString: () => aBuf(b).toString('utf8') }),
    getUuid: () => crypto.randomUUID(),
    formatDate: (d, tz, f) => {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {})
      return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour === '24' ? '00' : p.hour).replace('mm', p.minute)
    },
  },
  UrlFetchApp: {
    fetch: (url) => {
      fetches++
      const t = decodeURIComponent(url.split('id_token=')[1])
      const carga = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString())
      const valida = t.split('.')[2] === 'firma-buena'
      return { getResponseCode: () => (valida ? 200 : 400), getContentText: () => JSON.stringify({ ...carga, iss: 'https://accounts.google.com', email_verified: 'true' }) }
    },
  },
  GmailApp: {
    search: (q, inicio, max) => {
      G.GmailApp.ultimaConsulta = q
      // Un hilo por correo, lo más nuevo primero, como Gmail.
      const hilos = [...correos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map((m) => ({ getMessages: () => [m] }))
      return hilos.slice(inicio, inicio + max)
    },
    getMessageById: (id) => correos.find((m) => m.id === id),
  },
}
const ctx = vm.createContext(G)
vm.runInContext(leerSrc('Lectores.gs') + '\n' + leerSrc('Code.gs') + '\n;globalThis.__ = { ACCIONES, HOJAS };', ctx)

function reiniciar() {
  hojas = {}; cache = new Map(); props = new Map(); correos = []; fetches = 0; logs = []; orden.length = 0
  G.instalar()
  props.set('CLIENT_ID', 'cliente-123.apps.googleusercontent.com')
}
const filas = (n) => {
  const h = hojas[n]; if (!h || h.d.length < 2) return []
  const cab = h.d[0]; return h.d.slice(1).map((f) => Object.fromEntries(cab.map((k, i) => [k, f[i]])))
}
let seq = 0
function correo(de, asunto, texto, fecha = '2026-09-18T12:00:00Z') {
  const m = new Msg({ id: 'g' + (++seq), de: `Banco <${de}>`, asunto, texto, fecha, orden })
  correos.push(m); return m
}
const compraTenpo = (monto, comercio = 'FERRETERIA SUR SANTIAGO CHL', fecha) => correo('no-reply@tenpo.cl', 'Comprobante de compra con tu tarjeta de crédito',
  `La compra por $${monto} con tu tarjeta de crédito Tenpo fue exitosa. Monto transacción: $${monto} Comercio: ${comercio} Cuotas: 1`, fecha)
const token = (carga, firma = 'firma-buena') => [Buffer.from('{"alg":"RS256"}').toString('base64url'), Buffer.from(JSON.stringify(carga)).toString('base64url'), firma].join('.')
const valido = () => token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 })
const api = (accion, datos = {}, credencial = valido()) => G.doPost({ postData: { contents: JSON.stringify({ accion, credencial, ...datos }) } })

const HOJAS_N = G.__.HOJAS.movimientos.length
let ok = 0
const fallos = []
function prueba(nombre, fn) {
  reiniciar()
  try { fn(); ok++ } catch (e) { fallos.push(`✗ ${nombre}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`) }
}

/* ---------- instalación ---------- */
prueba('instalar crea las hojas, la config y las reglas base', () => {
  for (const n of ['Movimientos', 'Inversiones', 'Revisar', 'Correos', 'Reglas', 'Presupuestos', 'Config']) assert.ok(hojas[n], n)
  assert.equal(props.get('PROPIETARIO'), 'duenio@gmail.com')
  assert.ok(filas('Reglas').length > 50)
  assert.equal(filas('Config').find((c) => c.clave === 'borrar_correos').valor, 'si')
})

/* ---------- procesamiento ---------- */
prueba('registra, escribe y DESPUÉS borra', () => {
  compraTenpo('12.000')
  G.procesarCorreos()
  const movs = filas('Movimientos')
  assert.equal(movs.length, 1)
  assert.equal(movs[0].monto, 12000)
  assert.equal(movs[0].origen, 'correo')
  assert.equal(filas('Correos')[0].resultado, 'registrado')
  assert.ok(correos[0].papelera)
  assert.ok(orden.indexOf('flush') < orden.indexOf('papelera:' + correos[0].id), 'la papelera antes del flush')
})
prueba('si falla la escritura, no se borra nada', () => {
  compraTenpo('12.000')
  G.procesar_({ presupuestoMs: 1000 }) // crea las hojas y deja el cursor
  hojas.Movimientos.falla = true
  compraTenpo('13.000', 'OTRO SANTIAGO CHL', '2026-09-19T12:00:00Z')
  props.delete('PASADA')
  hojas.Correos.d.splice(1) // que vuelva a mirar los dos
  assert.throws(() => G.procesarCorreos())
  assert.ok(correos.every((m) => !m.papelera || m.id === 'g' + (seq - 1)), 'solo el ya registrado antes está en la papelera')
  assert.ok(!correos[1].papelera)
})
prueba('con borrar_correos = no, el correo queda', () => {
  const cfg = hojas.Config.d.findIndex((f) => f[0] === 'borrar_correos')
  hojas.Config.d[cfg][1] = 'no'
  compraTenpo('9.990')
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length, 1)
  assert.ok(!correos[0].papelera)
})
prueba('lo que no se entiende va a Revisar y NO se borra', () => {
  correo('avisos@santander.cl', 'Comprobante de transferencia', 'Se ha realizado una transferencia por $45.000 a Pedro')
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length, 0)
  const r = filas('Revisar')
  assert.equal(r.length, 1)
  assert.equal(r[0].estado, 'pendiente')
  assert.equal(r[0].monto, 45000)
  assert.ok(!correos[0].papelera)
})
prueba('publicidad e ignorados no dejan rastro ni se borran', () => {
  correo('mensajeria@correobancoestado.cl', 'Jesus, ahorra un 20%', 'Descuento con Rutpay. Anular su suscripción')
  correo('no-reply@tenpo.cl', 'Estado de cuenta-Tarjeta de Crédito', 'Ya está disponible')
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length + filas('Revisar').length + filas('Correos').length, 0)
  assert.ok(correos.every((m) => !m.papelera))
})
prueba('un correo ya procesado no se registra dos veces', () => {
  compraTenpo('5.000')
  G.procesarCorreos()
  correos[0].papelera = true
  props.delete('PASADA')
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length, 1)
})
prueba('los correos anteriores a «desde» se saltan', () => {
  compraTenpo('5.000', 'VIEJO SANTIAGO CHL', '2025-12-31T02:00:00Z') // 30-12 23:00 en Chile
  compraTenpo('6.000', 'NUEVO SANTIAGO CHL', '2026-01-01T04:00:00Z')
  G.procesarCorreos()
  assert.deepEqual(filas('Movimientos').map((m) => m.monto), [6000])
})
prueba('la consulta incluye la papelera y los bancos sin lector', () => {
  G.procesarCorreos()
  assert.match(G.GmailApp.ultimaConsulta, /in:anywhere/)
  assert.match(G.GmailApp.ultimaConsulta, /-in:spam/)
  assert.match(G.GmailApp.ultimaConsulta, /after:2026\/01\/01/)
  assert.match(G.GmailApp.ultimaConsulta, /subject:comprobante/)
})
prueba('pasada larga: continúa donde quedó y al terminar avanza el cursor', () => {
  for (let i = 0; i < 90; i++) compraTenpo(`${1000 + i}`, `TIENDA ${i} SANTIAGO CHL`, new Date(Date.UTC(2026, 1, 1) + i * 3600e3).toISOString())
  G.procesar_({ presupuestoMs: -1 }) // sin tiempo: hace una vuelta y deja la pasada abierta
  const abierta = JSON.parse(props.get('PASADA'))
  assert.ok(abierta.inicio > 0)
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length, 90)
  const cerrada = JSON.parse(props.get('PASADA'))
  assert.equal(cerrada.inicio, 0)
  assert.match(cerrada.desde, /^\d+$/)
})
prueba('duplicado entre bancos: se anota, no se suma, y el correo se borra', () => {
  correo('no-reply@tenpo.cl', 'Comprobante de transferencia - Tenpo',
    'Comprobante de recibo transferencia La transferencia de MARIO ANDRESSOTOPEREZ por 5.520 a tu cuenta Tenpo fue exitosa Monto transferencia: $5.520', '2026-09-14T12:30:00Z')
  correo('notificaciones@cl.bancofalabella.com', 'Aviso de transferencia de fondos recibida',
    'nuestro(a) cliente MARIO ANDRES SOTO ha instruido una transferencia de fondos a su cuenta con el siguiente detalle: Monto $5.520', '2026-09-14T12:28:00Z')
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length, 1)
  assert.equal(filas('Correos').filter((c) => c.resultado === 'duplicado').length, 1)
  assert.ok(correos.every((m) => m.papelera))
})
prueba('ensayo: informa sin registrar, sin borrar y sin mover el cursor', () => {
  compraTenpo('7.000')
  correo('avisos@santander.cl', 'Comprobante de transferencia', 'Se ha realizado una transferencia por $45.000')
  G.ensayo()
  assert.equal(filas('Movimientos').length, 0)
  assert.equal(filas('Revisar').length, 0)
  assert.ok(correos.every((m) => !m.papelera))
  assert.equal(props.get('PASADA'), undefined)
  const e = filas('Ensayo')
  assert.deepEqual(e.map((f) => f.resultado).sort(), ['movimiento', 'revisar'])
})
prueba('un asunto con fórmula se guarda neutralizado', () => {
  correo('avisos@santander.cl', '=IMPORTXML("http://x","//a") comprobante', 'Se ha realizado una transferencia por $1.000')
  G.procesarCorreos()
  const col = hojas.Revisar.d[0].indexOf('asunto')
  assert.ok(String(hojas.Revisar.crudo[1][col]).startsWith("'="))
})

prueba('«desde» convertido en fecha por Sheets igual busca bien', () => {
  const i = hojas.Config.d.findIndex((f) => f[0] === 'desde')
  hojas.Config.d[i][1] = new Date('2026-01-01T00:00:00-03:00')
  compraTenpo('4.000')
  G.procesarCorreos()
  assert.match(G.GmailApp.ultimaConsulta, /after:2026\/01\/01 /)
  assert.equal(filas('Movimientos').length, 1)
})
prueba('una pasada vieja sin «base» (la de la instalación rota) se reinicia', () => {
  props.set('PASADA', JSON.stringify({ desde: String(Math.floor(Date.now() / 1000) - 3600), inicio: 0, comenzo: 0 }))
  compraTenpo('4.000', 'VIEJA SANTIAGO CHL', '2026-02-01T12:00:00Z')
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length, 1)
  assert.match(G.GmailApp.ultimaConsulta, /after:2026\/01\/01 /)
})
prueba('cambiar «desde» en Config reimporta desde la fecha nueva', () => {
  G.procesarCorreos()
  const i = hojas.Config.d.findIndex((f) => f[0] === 'desde')
  hojas.Config.d[i][1] = '2025/06/01'
  G.procesarCorreos()
  assert.match(G.GmailApp.ultimaConsulta, /after:2025\/06\/01 /)
})
prueba('correos que no son de bancos no se abren', () => {
  const m = correo('notifications@github.com', 'Aviso de pago de Actions', 'Pago de $5.000')
  G.procesarCorreos()
  assert.ok(!m.abierto)
  assert.ok(!m.papelera)
})
prueba('fechas e ids quedan como texto en la hoja', () => {
  compraTenpo('4.000')
  G.procesarCorreos()
  const m = filas('Movimientos')[0]
  assert.equal(typeof m.fecha, 'string')
  assert.match(m.fecha, /^2026-09-18 \d{2}:\d{2}$/)
  assert.equal(typeof filas('Correos')[0].gmail_id, 'string')
})
prueba('reiniciarImportacion borra el cursor', () => {
  G.procesarCorreos()
  assert.ok(props.get('PASADA'))
  G.reiniciarImportacion()
  assert.equal(props.get('PASADA'), undefined)
})

/* ---------- frecuencia y cuotas de Google ---------- */
prueba('el disparador queda cada 30 minutos', () => {
  assert.equal(G.ScriptApp.creado, 'procesarCorreos cada 30')
})
prueba('con el tope diario de disparador usado, la pasada espera a mañana', () => {
  compraTenpo('8.000')
  const hoy = G.Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd')
  props.set('USO', JSON.stringify({ dia: hoy, ms: 60 * 60 * 1000 }))
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length, 0)
  props.set('USO', JSON.stringify({ dia: '2000-01-01', ms: 60 * 60 * 1000 })) // otro día: vuelve a cero
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length, 1)
  assert.equal(JSON.parse(props.get('USO')).dia, hoy)
})
prueba('un correo ignorado no se vuelve a abrir en la pasada siguiente', () => {
  const m = correo('no-reply@tenpo.cl', 'Estado de cuenta-Tarjeta de Crédito', 'Ya está disponible')
  G.procesarCorreos()
  assert.ok(m.abierto)
  m.abierto = false
  props.delete('PASADA')
  G.procesarCorreos()
  assert.ok(!m.abierto, 'se abrió otra vez')
  assert.ok(!m.papelera)
})

/* ---------- Binance ---------- */
prueba('remesa por Binance: la compra P2P no suma y el envío de USDT es el gasto', () => {
  correo('mensajeria@copecpay.cl', 'Tu transferencia se realizó con éxito',
    '¡Listo! Tu transferencia se envió con éxito Monto $25.000 Cuenta destino: Leveltech SPA Cuenta Corriente ****0000 BCI/MACHBANK N° transacción: 000000 Comentario: pago', '2026-09-28T17:22:50Z')
  correo('do-not-reply@ses.binance.com', '[Binance]Payment Transaction Detail - 2026-09-28 17:27:48 (UTC)',
    'Payment Transaction Detail You made the following payment: Time: 2026-09-28 17:27:48(UTC) Amount: 40 USDT', '2026-09-28T17:27:49Z')
  G.procesarCorreos()
  const movs = filas('Movimientos')
  const compra = movs.find((m) => m.banco === 'Copec Pay')
  const envio = movs.find((m) => m.banco === 'Binance')
  assert.equal(compra.tipo, 'interna')
  assert.equal(compra.categoria, 'Compra de cripto')
  assert.equal(envio.tipo, 'gasto')
  assert.equal(envio.monto, 38000)
  assert.equal(envio.categoria, 'Remesas')
  assert.equal(envio.fecha, '2026-09-28 14:27', 'hora de Chile, no la UTC del cuerpo')
  assert.ok(correos.every((m) => m.papelera))
})
prueba('reclasificarCripto corrige una compra P2P que entró como gasto', () => {
  correo('mensajeria@copecpay.cl', 'Tu transferencia se realizó con éxito',
    '¡Listo! Tu transferencia se envió con éxito Monto $25.000 Cuenta destino: Leveltech SPA Cuenta Corriente ****0000 BCI/MACHBANK N° transacción: 000000')
  const i = hojas.Config.d.findIndex((f) => f[0] === 'vendedores_cripto')
  hojas.Config.d[i][1] = ''
  G.procesarCorreos()
  assert.equal(filas('Movimientos')[0].tipo, 'gasto')
  hojas.Config.d[i][1] = 'Leveltech'
  G.reclasificarCripto()
  assert.equal(filas('Movimientos')[0].tipo, 'interna')
  assert.equal(filas('Movimientos')[0].categoria, 'Compra de cripto')
})

prueba('sueldo que pasa de Mercado Pago a Copec Pay entra como ingreso', () => {
  correo('info@mercadopago.cl', '¡Enviamos tu transferencia!',
    'Ya enviamos tu transferencia de $ 1.096.130 Datos del beneficiario Nombre y apellido: Jesus Seiler Velasquez Entidad: Copec Pay Número de cuenta: 000')
  G.procesarCorreos()
  const m = filas('Movimientos')[0]
  assert.equal(m.tipo, 'ingreso')
  assert.equal(m.categoria, 'Desde Mercado Pago')
})
prueba('reclasificarExternas corrige lo registrado antes como interno', () => {
  const i = hojas.Config.d.findIndex((f) => f[0] === 'cuentas_externas')
  if (i === -1) hojas.Config.d.push(['cuentas_externas', ''])
  else hojas.Config.d[i][1] = ''
  correo('info@mercadopago.cl', '¡Enviamos tu transferencia!',
    'Ya enviamos tu transferencia de $ 900.000 Datos del beneficiario Nombre y apellido: Jesus Seiler Entidad: MACHBANK/BCI')
  G.procesarCorreos()
  assert.equal(filas('Movimientos')[0].tipo, 'interna')
  const j = hojas.Config.d.findIndex((f) => f[0] === 'cuentas_externas')
  hojas.Config.d[j][1] = 'Mercado Pago'
  G.reclasificarExternas()
  assert.equal(filas('Movimientos')[0].tipo, 'ingreso')
  G.reclasificarExternas()
  assert.equal(filas('Movimientos')[0].tipo, 'ingreso')
})

/* ---------- identidad ---------- */
prueba('sin credencial o con una ajena no hay datos', () => {
  assert.equal(api('datos', {}, '').sesion, false)
  assert.equal(api('datos', {}, 'no-es-un-jwt').sesion, false)
  const otro = token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'intruso@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 })
  assert.equal(api('datos', {}, otro).sesion, false)
  const otraApp = token({ aud: 'otra.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 })
  assert.equal(api('datos', {}, otraApp).sesion, false)
  const vencido = token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) - 10 })
  assert.equal(api('datos', {}, vencido).sesion, false)
  assert.equal(fetches, 0, 'lo que se descarta localmente no gasta llamadas a Google')
})
prueba('firma inválida: Google la rechaza', () => {
  const falso = token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 }, 'firma-mala')
  assert.equal(api('datos', {}, falso).sesion, false)
  assert.equal(fetches, 1)
})
prueba('token válido: una sola verificación y luego caché', () => {
  const t = valido()
  assert.equal(api('datos', {}, t).ok, true)
  assert.equal(api('datos', {}, t).ok, true)
  assert.equal(fetches, 1)
})
prueba('freno: más de 30 verificaciones por minuto se cortan', () => {
  for (let i = 0; i < 35; i++) {
    api('datos', {}, token({ aud: 'cliente-123.apps.googleusercontent.com', email: 'duenio@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600, n: i }, 'firma-mala'))
  }
  assert.equal(fetches, 30)
})
prueba('acción desconocida', () => {
  assert.equal(api('borrarTodo').error, 'Acción no válida')
})

/* ---------- acciones ---------- */
prueba('agregar un movimiento manual y categorizarlo', () => {
  const r = api('agregar', { mov: { fecha: '2026-09-20', tipo: 'gasto', monto: 4500, contraparte: 'Feria Copec', banco: 'Efectivo' } })
  assert.equal(r.ok, true, r.error)
  const m = filas('Movimientos')[0]
  assert.equal(m.origen, 'manual')
  assert.equal(m.categoria, 'Combustible')
  assert.equal(m.fecha, '2026-09-20 12:00')
})
prueba('agregar valida monto, fecha y tipo', () => {
  assert.equal(api('agregar', { mov: { fecha: '2026-09-20', tipo: 'gasto', monto: -1 } }).error, 'Monto no válido')
  assert.match(api('agregar', { mov: { fecha: 'ayer', tipo: 'gasto', monto: 1 } }).error, /Fecha/)
  assert.equal(api('agregar', { mov: { fecha: '2026-09-20', tipo: 'robo', monto: 1 } }).error, 'Tipo no válido')
})
prueba('editar con regla recategoriza los de la misma contraparte', () => {
  compraTenpo('1.000', 'DON PEPE SANTIAGO CHL', '2026-09-01T12:00:00Z')
  compraTenpo('2.000', 'DON PEPE SANTIAGO CHL', '2026-09-02T12:00:00Z')
  compraTenpo('3.000', 'OTRA COSA SANTIAGO CHL', '2026-09-03T12:00:00Z')
  G.procesarCorreos()
  const id = filas('Movimientos').find((m) => m.monto === 1000).id
  const r = api('editar', { id, categoria: 'Comida', regla: true })
  assert.equal(r.aplicados, 1)
  assert.deepEqual(filas('Movimientos').map((m) => m.categoria).sort(), ['Comida', 'Comida', 'Otros'])
  assert.ok(filas('Reglas').some((x) => x.patron === 'DON PEPE SANTIAGO' && x.categoria === 'Comida'))
})
prueba('un movimiento de correo no deja cambiar su monto', () => {
  compraTenpo('1.000')
  G.procesarCorreos()
  api('editar', { id: filas('Movimientos')[0].id, monto: 999999 })
  assert.equal(filas('Movimientos')[0].monto, 1000)
})
prueba('fecha contable: un movimiento de correo puede contar en otro día, y se puede quitar', () => {
  compraTenpo('1.000')
  G.procesarCorreos()
  const id = filas('Movimientos')[0].id
  assert.equal(api('editar', { id, fecha_contable: '2026-10-01' }).ok, true)
  assert.equal(filas('Movimientos')[0].fecha_contable, '2026-10-01')
  assert.match(filas('Movimientos')[0].fecha, /^2026-09-18/, 'la fecha real no se toca')
  assert.equal(api('datos').movimientos[0].fecha_contable, '2026-10-01')
  assert.equal(api('editar', { id, fecha_contable: '' }).ok, true)
  assert.equal(api('datos').movimientos[0].fecha_contable, '')
  assert.match(api('editar', { id, fecha_contable: 'ayer' }).error, /Fecha/)
})
prueba('fecha contable: una planilla anterior a la columna recibe su encabezado', () => {
  compraTenpo('1.000')
  G.procesarCorreos()
  hojas['Movimientos'].d[0].length = HOJAS_N - 1
  vm.runInContext('Object.keys(cabeceraAlDia_).forEach((k) => delete cabeceraAlDia_[k])', ctx)
  assert.equal(api('datos').ok, true)
  assert.equal(hojas['Movimientos'].d[0][HOJAS_N - 1], 'fecha_contable')
})
prueba('revisar → registrar: crea el movimiento y borra el correo', () => {
  correo('avisos@santander.cl', 'Comprobante de transferencia', 'Se ha realizado una transferencia por $45.000 a Pedro')
  G.procesarCorreos()
  const gid = filas('Revisar')[0].gmail_id
  const r = api('revisar', { gmail_id: gid, decision: 'registrar', mov: { contraparte: 'Pedro', tipo: 'gasto', monto: 45000 } })
  assert.equal(r.ok, true, r.error)
  assert.equal(r.borrado, true)
  assert.equal(filas('Movimientos')[0].contraparte, 'Pedro')
  assert.equal(filas('Revisar')[0].estado, 'registrado')
  assert.equal(filas('Correos')[0].resultado, 'registrado')
  assert.ok(correos[0].papelera)
  assert.equal(api('datos').revisar.length, 0)
})
prueba('revisar → descartar deja el correo salvo que se pida borrar', () => {
  correo('avisos@santander.cl', 'Comprobante de transferencia', 'Se ha realizado una transferencia por $45.000')
  correo('avisos@santander.cl', 'Comprobante de pago', 'Se ha realizado un pago por $10.000', '2026-09-17T12:00:00Z')
  G.procesarCorreos()
  const [a, b] = filas('Revisar')
  api('revisar', { gmail_id: a.gmail_id, decision: 'descartar' })
  api('revisar', { gmail_id: b.gmail_id, decision: 'descartar', borrar: true })
  assert.equal(correos.find((m) => m.id === a.gmail_id).papelera, false)
  assert.equal(correos.find((m) => m.id === b.gmail_id).papelera, true)
  assert.equal(filas('Movimientos').length, 0)
})
prueba('presupuesto: crear, cambiar y quitar', () => {
  api('presupuesto', { categoria: 'Comida', monto: 100000 })
  api('presupuesto', { categoria: 'Comida', monto: 80000 })
  assert.deepEqual(filas('Presupuestos').map((p) => p.monto_mensual), [80000])
  api('presupuesto', { categoria: 'Comida', monto: 0 })
  assert.equal(filas('Presupuestos').length, 0)
})
prueba('datos no expone el id de Gmail de los movimientos', () => {
  compraTenpo('1.000')
  G.procesarCorreos()
  const d = api('datos')
  assert.equal(d.movimientos.length, 1)
  assert.equal(d.movimientos[0].gmail_id, undefined)
  assert.equal(d.estado.borrar, true)
})
prueba('eliminar quita el movimiento pero la bitácora impide reimportarlo', () => {
  compraTenpo('1.000')
  G.procesarCorreos()
  api('eliminar', { id: filas('Movimientos')[0].id })
  correos[0].papelera = true
  props.delete('PASADA')
  G.procesarCorreos()
  assert.equal(filas('Movimientos').length, 0)
})
prueba('sincronizar desde la página', () => {
  compraTenpo('1.000')
  const r = api('sincronizar')
  assert.equal(r.resumen.registrados, 1)
  assert.equal(r.resumen.completa, true)
})

console.log(`backend: ${ok} pruebas ok`)
if (fallos.length) { console.error(fallos.join('\n')); process.exit(1) }
