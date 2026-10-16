// Pruebas de supabase/functions/notificacion/lectores.js: los avisos de los
// bancos convertidos en movimientos. Los textos son los de avisos reales
// (formato y redacción), con montos y comercios cambiados donde identificaban.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { leerAviso, fechaChile, esPropio } from '../supabase/functions/notificacion/lectores.js'

let ok = 0
const fallos = []
function prueba(nombre, fn) { try { fn(); ok++ } catch (e) { fallos.push(`✗ ${nombre}\n    ${e.message}`) } }

const MACH = 'cl.bci.sismo.mach'
const TENPO = 'com.krealo.tenpo'
// 2026-10-14 22:53 UTC = 19:53 en Chile (UTC-3 en octubre, con horario de verano).
const PUBLICADA = Date.UTC(2026, 9, 14, 22, 53, 30)
const leer = (paquete, titulo, texto, extra = {}) => leerAviso({ paquete, titulo, texto, texto_largo: '', publicada: PUBLICADA, recibida: PUBLICADA + 400, ...extra })

prueba('la hora se guarda en hora de Chile, no en UTC', () => {
  assert.equal(fechaChile(PUBLICADA), '2026-10-14 19:53')
  // En invierno austral el desfase es otro: no se puede restar tres horas fijas.
  assert.equal(fechaChile(Date.UTC(2026, 6, 1, 15, 0)), '2026-07-01 11:00')
})

prueba('MACH: compra con tarjeta de crédito virtual', () => {
  const r = leer(MACH, 'MACHBANK', 'Compra con Tarjeta de Crédito Virtual ***4009 en SKY AIRLINES BSP          por $85.112')
  assert.deepEqual(r.mov, {
    fecha: '2026-10-14 19:53', banco: 'MACH', producto: 'Tarjeta de crédito', tipo: 'gasto', monto: 85112,
    contraparte: 'SKY AIRLINES BSP', cuotas: 1, detalle: 'Tarjeta virtual',
  })
})

prueba('MACH: compra con tarjeta física y con débito', () => {
  const fisica = leer(MACH, 'MACHBANK', 'Compra con Tarjeta de Crédito Física ***1234 en UNIMARC PALOMA SANTIAGO CHL por $12.990').mov
  assert.equal(fisica.contraparte, 'UNIMARC PALOMA SANTIAGO')
  assert.equal(fisica.detalle, 'Tarjeta física')
  const debito = leer(MACH, 'MACHBANK', 'Compra con Tarjeta de Débito ***1234 en KIOSCO por $1.500').mov
  assert.equal(debito.producto, 'Cuenta')
  assert.equal(debito.cuotas, null)
})

prueba('MACH: transferencia recibida, sin inventar quién la envió', () => {
  const r = leer(MACH, 'MACHBANK', 'Has recibido una transferencia por $5.000. Ingresa para revisar tu saldo.')
  assert.deepEqual(r.mov, { fecha: '2026-10-14 19:53', banco: 'MACH', producto: 'Cuenta', tipo: 'ingreso', monto: 5000, contraparte: '', cuotas: null, detalle: '' })
})

prueba('Tenpo: compra con tarjeta de crédito, con la hora que dice el aviso', () => {
  const r = leer(TENPO, 'Tenpo', 'El 14-10-2026 19:04 se realizó una compra con tu tarjeta de crédito por $14.748 en Sta isabel sargento si puerto montt chl')
  assert.deepEqual(r.mov, {
    fecha: '2026-10-14 19:04', banco: 'Tenpo', producto: 'Tarjeta de crédito', tipo: 'gasto', monto: 14748,
    contraparte: 'Sta isabel sargento si puerto montt', cuotas: 1, detalle: '',
  })
})

prueba('Tenpo: transferencia enviada, sin destinatario', () => {
  const r = leer(TENPO, 'Tenpo', '¡Listo! Tu transferencia por $8.000 se realizo de manera exitosa.')
  assert.equal(r.mov.tipo, 'gasto')
  assert.equal(r.mov.monto, 8000)
  assert.equal(r.mov.contraparte, '')
})

prueba('el ruido se ignora: sesión, códigos, promociones y cashback acumulado', () => {
  const ruido = [
    [TENPO, 'Sesión Expirada', 'Para tu seguridad hemos cerrado tu sesión'],
    [TENPO, 'Tenpo', 'Tenpo: 000000 es tu código de validación'],
    [TENPO, '¡Evalúa nuestra atención de tu caso!', 'Evalúa nuestra atencion aqui'],
    [TENPO, 'Tenpo', 'Felicidades! Compraste en Supermercados y ganaste Tenpesos'],
    [MACH, 'Jesus, tus lucas crecen', 'Tu tasa preferencial en Ahorro 24/7 te espera 🤑📈 ¡Abona hoy y empieza a ganar!'],
    [MACH, '¡Tu compra tiene Cashback!', 'Te devolvimos $425 correspondiente a 0,5% por tu compra presencial en latam ndc dom- con tu Tarjeta de Crédito MACHBANK.'],
  ]
  for (const [p, t, x] of ruido) assert.deepEqual(leer(p, t, x), { ignorar: true }, t)
})

const BANCOESTADO = 'net.veritran.becl.prod'
const CTX = { titular: 'Jesus Seiler', externas: 'Mercado Pago' }
const transferenciaBE = (a, destino) => `Estimado(a) JESUS ENRIQUE SEILER VELASQUEZ, te informamos que con fecha 15/10/2026 16:55:21 has realizado una transferencia a ${a} por $180.840 a su Chequera Electrónica 000000000000 de ${destino}.`

prueba('BancoEstado: transferencia a una cuenta propia es interna y dice a qué banco fue', () => {
  const r = leerAviso({ paquete: BANCOESTADO, titulo: 'Transferencia', texto: transferenciaBE('Jesus Seiler', 'Bci/machbank'), texto_largo: '', publicada: PUBLICADA, recibida: PUBLICADA }, CTX)
  assert.deepEqual(r.mov, {
    fecha: '2026-10-15 16:55', banco: 'BancoEstado', producto: 'Cuenta', tipo: 'interna', monto: 180840,
    contraparte: 'Jesus Seiler', cuotas: null, detalle: 'Hacia MACH',
  })
})

prueba('BancoEstado: transferencia a otra persona es gasto; sin titular nada es propio', () => {
  const a = { paquete: BANCOESTADO, titulo: 'Transferencia', texto: transferenciaBE('Mario Demo', 'Banco Santander'), texto_largo: '', publicada: PUBLICADA, recibida: PUBLICADA }
  const r = leerAviso(a, CTX).mov
  assert.equal(r.tipo, 'gasto')
  assert.equal(r.contraparte, 'Mario Demo')
  assert.equal(r.detalle, '')
  const propia = { ...a, texto: transferenciaBE('Jesus Seiler', 'Tenpo') }
  assert.equal(leerAviso(propia).mov.tipo, 'gasto', 'sin ctx no se reconoce al titular')
  assert.equal(leerAviso(propia, { titular: 'Luis Seiler' }).mov.tipo, 'gasto')
})

prueba('BancoEstado: a tu cuenta externa (Mercado Pago) es gasto «Hacia Mercado Pago»', () => {
  const r = leerAviso({ paquete: BANCOESTADO, titulo: 'Transferencia', texto: transferenciaBE('Jesus Seiler', 'Mercado Pago'), texto_largo: '', publicada: PUBLICADA, recibida: PUBLICADA }, CTX).mov
  assert.equal(r.tipo, 'gasto')
  assert.equal(r.categoria, 'Hacia Mercado Pago')
})

prueba('esPropio: todas las palabras del titular, sin tildes ni mayúsculas', () => {
  const lectores = { si: ['JESUS ENRIQUE SEILER VELASQUEZ', 'Jesús Seiler', 'jesusseiler'], no: ['Luis Seiler', 'Jesus', ''] }
  for (const n of lectores.si) assert.ok(esPropio(n, 'Jesus Seiler'), n)
  for (const n of lectores.no) assert.ok(!esPropio(n, 'Jesus Seiler'), n)
  assert.ok(!esPropio('Jesus Seiler', ''))
})

// Publicidad real de cada app (redacción de avisos vistos en octubre de 2026).
prueba('la publicidad de los bancos y los recordatorios de pago se ignoran', () => {
  const publicidad = [
    ['cl.copec.PagoClick', '¡Consigue $100/lt dcto con MACH! 💜⛽', 'Todos los sábados en combustible pagando con MACH. ¡Carga con el mejor dcto! 🚗🎉'],
    ['com.cencosud.cencopay', '¡El cashback Club Easy Pro se agotó! 💸', 'El 15% de cashback ya se agotó. Sigue usando Saldo CencoPay y atento a los próximos beneficios. 💙'],
    ['com.mercadopago.wallet', 'Llegó una cuenta que vence el 24 de octubre', 'Ya puedes programar o hacer tu pago de $ 15.987 a Movistar Hogar.'],
    [BANCOESTADO, 'MAÑANA VIERNES 40% de descuento 😍', 'Aprovecha y ahorra pagando con Rutpay en Farmacias Ahumada presencial o desde la Mini app. Tope $20.000.'],
    [BANCOESTADO, 'Solicita tu Avance en Cuotas', 'Obtén un abono inmediato y paga de 4 a 48 cuotas con tus Tarjetas de Crédito BancoEstado.'],
    [BANCOESTADO, 'Hasta 40% dto. en Cinépolis 🍿', 'Todos los viernes, sábados y domingos, compra hasta 4 entradas 2D por día, pagando con tus Tarjetas BancoEstado.'],
    [BANCOESTADO, 'Beneficios en Farmacias Ahumada 💊', 'Obtén 30% de dto. en medicamentos pagando con Tarjetas BancoEstado. Tope de $20.000.'],
    [BANCOESTADO, '🔥 El sonido de Pixies llega a Frutillar', 'Aprovecha un 20% dto. en PuntoTicket con tus Tarjetas BancoEstado, hasta agotar stock.'],
    ['cl.fintual.fintualapp', 'En vivo: Main Character', '¿Por qué creamos Fintual Sans? Entra al streaming y participa por un objeto de colección.'],
  ]
  for (const [p, t, x] of publicidad) assert.deepEqual(leer(p, t, x), { ignorar: true }, t)
})

prueba('Fintual se lee por correo: su aviso de depósito no trae monto y se ignora', () => {
  assert.deepEqual(leer('cl.fintual.fintualapp', 'Recibimos tu depósito', 'Se invertirá en Objetivo X'), { ignorar: true })
})

prueba('un lector del banco va antes que la publicidad', () => {
  const r = leer(MACH, 'MACHBANK', 'Compra con Tarjeta de Débito ***1234 en FARMACIA DESCUENTO por $1.500')
  assert.equal(r.mov.monto, 1500)
})

prueba('lo que no se conoce devuelve null: queda crudo, no se pierde ni se inventa', () => {
  assert.equal(leer(MACH, '¡Tu cashback ya está en tu cuenta!', 'Hemos depositado $946 en tu cuenta corriente. ¡Que los disfrutes!'), null)
  assert.equal(leer(BANCOESTADO, 'Transferencia recibida', 'Recibiste una transferencia de Mario Demo por $5.000'), null)
  assert.equal(leer(MACH, 'MACHBANK', ''), null)
  assert.equal(leer('com.otra.app', 'Compra', 'Compraste $1.000 en X'), null)
})

prueba("un monto ilegible no produce un movimiento: queda crudo", () => {
  assert.equal(leer(MACH, "MACHBANK", "Has recibido una transferencia por $0. Ingresa"), null)
})

prueba('con el reloj del celular absurdo se usa la hora de llegada', () => {
  const futuro = Date.UTC(2027, 0, 1)
  const r = leer(MACH, 'MACHBANK', 'Has recibido una transferencia por $5.000. Ingresa para revisar tu saldo.', { publicada: futuro })
  assert.equal(r.mov.fecha, fechaChile(PUBLICADA + 400))
})

// Gemela: la función no puede importar de ../src, así que lleva su copia.
prueba('reglas.js de la función es idéntico al de la página', () => {
  const raiz = join(import.meta.dirname, '..')
  const leerTexto = (r) => readFileSync(join(raiz, r), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(leerTexto('supabase/functions/notificacion/reglas.js'), leerTexto('src/lib/reglas.js'))
})

if (fallos.length) {
  console.error(fallos.join('\n'))
  process.exit(1)
}
console.log(`avisos: ${ok} pruebas ok`)
