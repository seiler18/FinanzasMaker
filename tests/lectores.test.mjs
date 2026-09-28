// Pruebas de backend/Lectores.gs.
//
// Dos fuentes de casos:
//  1. CASOS (abajo): correos SINTÉTICOS escritos sobre las plantillas de cada
//     banco, con nombres, montos y cuentas inventados.
//  2. tests/fixtures/*.json: correos reales anonimizados. Cada uno declara lo
//     que debe salir en `espera` ({ estado, tipo, monto, contraparte, … }).
import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const src = fs.readFileSync(new URL('../backend/Lectores.gs', import.meta.url), 'utf8')
const ctx = vm.createContext({ console })
vm.runInContext(src + '\n;globalThis.__ = { LECTORES, REGLAS_BASE, TIPOS };', ctx)
const L = ctx
const CTX = { titular: 'Jesus Seiler', dolar: 950 }

let ok = 0
const fallos = []
function prueba(nombre, fn) {
  try { fn(); ok++ } catch (e) { fallos.push(`✗ ${nombre}\n    ${e.message.split('\n').join('\n    ')}`) }
}
const leer = (de, asunto, texto, fecha = '2026-09-18 10:00') => L.leerCorreo_({ de, asunto, texto, fecha }, CTX)
function esperar(r, e) {
  assert.equal(r.estado, e.estado || 'ok', `estado (motivo: ${r.motivo || '-'})`)
  const m = r.mov || {}
  for (const k of ['tipo', 'monto', 'contraparte', 'banco', 'cuotas', 'fecha', 'producto', 'moneda', 'categoria']) {
    if (k in e) assert.equal(m[k], e[k], k)
  }
  if (e.inv) for (const [k, v] of Object.entries(e.inv)) assert.equal(r.inv?.[k], v, 'inv.' + k)
}

/* ---------- utilidades ---------- */
prueba('monto_', () => {
  assert.equal(L.monto_('$ 1.096.130'), 1096130)
  assert.equal(L.monto_('$1.500'), 1500)
  assert.equal(L.monto_('$2220'), 2220)
  assert.equal(L.monto_('745,30'), 745.3)
  assert.equal(L.monto_('0.41'), 0.41)
  assert.equal(L.monto_('100.000.'), 100000)
  assert.equal(L.monto_(''), null)
  assert.equal(L.monto_('0'), null)
})
prueba('fechaCuerpo_ en los tres formatos', () => {
  assert.equal(L.fechaCuerpo_('Fecha y hora: 2026-09-19 12:40:46'), '2026-09-19 12:40')
  assert.equal(L.fechaCuerpo_('Fecha: 09-12-2025 Hora: 21:09'), '2025-12-09 21:09')
  assert.equal(L.fechaCuerpo_('el día 08/04/2024 a las 17:12 hrs.'), '2024-04-08 17:12')
  assert.equal(L.fechaCuerpo_('Detalle Fecha 14/09/2026 - 20:38:40'), '2026-09-14 20:38')
  assert.equal(L.fechaCuerpo_('sin fecha'), '')
})
prueba('la fecha del cuerpo solo se cree si está cerca de la del correo', () => {
  const r = leer('no-reply@tenpo.cl', 'Comprobante de compra con tu tarjeta de crédito 🛍🍟',
    'La compra por $5.000 con tu tarjeta de crédito Tenpo fue exitosa. Monto transacción: $5.000 Comercio: KIOSKO SANTIAGO CHL Cuotas: 1 Fecha: 01-01-2026 Hora: 10:00', '2026-09-18 10:00')
  assert.equal(r.mov.fecha, '2026-09-18 10:00')
})
prueba('esPropio_', () => {
  assert.ok(L.esPropio_('JESUS ENRIQUE SEILER VELASQUEZ', 'Jesus Seiler'))
  assert.ok(L.esPropio_('Jesus EnriqueSeilerVelasquez', 'Jesus Seiler'))
  assert.ok(L.esPropio_('Jesús  Seiler Velasquez', 'Jesus Seiler'))
  assert.ok(!L.esPropio_('Luis Andres Seiler Velasquez', 'Jesus Seiler'))
  assert.ok(!L.esPropio_('Pedro', 'Jesus Seiler'))
  assert.ok(!L.esPropio_('', 'Jesus Seiler'))
})
prueba('plano_ quita el relleno invisible del preheader', () => {
  assert.equal(L.plano_('Monto: $͏ 1.000\n\n  Comercio'), 'Monto: $ 1.000 Comercio')
})

/* ---------- casos sintéticos por lector ---------- */
const CASOS = [
  ['Tenpo compra con tarjeta de crédito en cuotas',
    ['no-reply@tenpo.cl', 'Comprobante de compra con tu tarjeta de crédito 🛍🍟',
      'Comprobante de Compra exitosa La compra por $93.180 con tu tarjeta de crédito Tenpo fue exitosa. Monto transacción: $93.180 Comercio: FERRETERIA EL SUR PUERTO MONTT CHL Cuotas: 3 Fecha: 17-09-2026 Hora: 20:05', '2026-09-17 20:06'],
    { tipo: 'gasto', monto: 93180, contraparte: 'FERRETERIA EL SUR PUERTO MONTT', cuotas: 3, banco: 'Tenpo', producto: 'Tarjeta de crédito', fecha: '2026-09-17 20:05' }],
  ['Tenpo (remitente antiguo tenpobank.cl)',
    ['no-reply@tenpobank.cl', 'Comprobante de compra con tu tarjeta de crédito 🛍🍟',
      'Comprobante de Compra exitosa La compra por $14.500 con tu tarjeta de crédito Tenpo fue exitosa. Monto transacción: $14.500 Comercio: PAGO ONLINE KUSHKI SANTIAGO CHL Cuotas: 1 Fecha: 17-09-2026 Hora: 23:41'],
    { tipo: 'gasto', monto: 14500, cuotas: 1 }],
  ['Tenpo: la carga de Mercado Pago con tarjeta es interna (regla base)',
    ['no-reply@tenpo.cl', 'Comprobante de compra con tu tarjeta de crédito 🛍🍟',
      'La compra por $100.000 con tu tarjeta de crédito Tenpo fue exitosa. Monto transacción: $100.000 Comercio: MERCADO PAGO SANTIAGO CHL Cuotas: 1 Fecha: 17-09-2026 Hora: 21:09'],
    { tipo: 'interna', monto: 100000, categoria: 'Carga de billetera' }, true],
  ['Tenpo transferencia enviada a un tercero',
    ['no-reply@tenpo.cl', 'Comprobante de transferencia exitoso - Tenpo',
      'Transferencia exitosa Has realizado una transferencia por $20.000 desde tu cuenta Tenpo. Monto transferencia: $ 20.000 Nombre del destinatario: Pedro Banco de destino: BANCO ESTADO Nº cuenta de destino: 12345678'],
    { tipo: 'gasto', monto: 20000, contraparte: 'Pedro', categoria: 'Transferencias a personas' }, true],
  ['Tenpo transferencia enviada a una cuenta propia',
    ['no-reply@tenpo.cl', 'Comprobante de transferencia exitoso - Tenpo',
      'Transferencia exitosa Has realizado una transferencia por $661.806 desde tu cuenta Tenpo. Monto transferencia: $ 661.806 Nombre del destinatario: JESUS ENRIQUE SEILER VELASQUEZ Banco de destino: BANCO DE CREDITO E INVERSIONES'],
    { tipo: 'interna', monto: 661806 }],
  ['Tenpo recibo de transferencia desde cuenta propia',
    ['no-reply@tenpo.cl', 'Comprobante de transferencia - Tenpo',
      'Comprobante de recibo transferencia La transferencia de Jesus Seiler por 20.000 a tu cuenta Tenpo fue exitosa Monto transferencia: $20.000 Origen transferencia: Jesus Seiler Banco de origen: Copec Pay'],
    { tipo: 'interna', monto: 20000, contraparte: 'Jesus Seiler' }],
  ['Tenpo recibo de transferencia de un tercero',
    ['no-reply@tenpo.cl', 'Comprobante de transferencia - Tenpo',
      'Comprobante de recibo transferencia La transferencia de Mario AndresSotoPerez por 5.520 a tu cuenta Tenpo fue exitosa Monto transferencia: $5.520 Origen transferencia: Mario Banco de origen: Banco Falabella'],
    { tipo: 'ingreso', monto: 5520, contraparte: 'Mario AndresSotoPerez' }],
  ['Tenpo copia de transferencia enviada (plantilla «a tu cuenta fue exitosa») se ignora',
    ['no-reply@tenpo.cl', 'Comprobante de transferencia - Tenpo',
      'Comprobante de transferencia exitosa La transferencia de JESUS ENRIQUE SEILER VELASQUEZ por $20.000 a tu cuenta fue exitosa. Monto transferencia: $ 20.000 Nombre del destinatario: JESUS ENRIQUE SEILER VELASQUEZ Banco de destino: TENPO'],
    { estado: 'ignorar' }],
  ['Tenpo pago recibido',
    ['no-reply@tenpo.cl', 'ROBERTO ANTONIO DIAZ MORA te ha enviado un pago por $34.319',
      'Comprobante de pago exitoso El pago de ROBERTO ANTONIO DIAZ MORA por $34.319 a tu cuenta Tenpo fue exitoso Enviado por: ROBERTO ANTONIO DIAZ MORA Monto pagado: $34.319'],
    { tipo: 'ingreso', monto: 34319, contraparte: 'ROBERTO ANTONIO DIAZ MORA' }],
  ['Tenpo pago de la tarjeta',
    ['no-reply@tenpo.cl', 'Recibimos con éxito el pago de tu Tarjeta de Crédito',
      'Comprobante pago de tarjeta de crédito El pago que realizaste por $782.336 a tu tarjeta de crédito Tenpo el mes de septiembre fue exitoso. Monto transacción: $782.336'],
    { tipo: 'pago_tarjeta', monto: 782336, categoria: 'Pago de tarjeta' }, true],
  ['Tenpo pago por nómina es sueldo',
    ['no-reply@tenpo.cl', 'Pago por nomina - Tenpo',
      'Comprobante de recibo transferencia La transferencia de UNIV DEMO por 91.765 a tu cuenta Tenpo fue exitosa Monto transferencia: $91.765 Origen transferencia: UNIV DEMO Banco de origen: BCI'],
    { tipo: 'ingreso', monto: 91765, contraparte: 'UNIV DEMO', categoria: 'Sueldo' }, true],
  ['Tenpo SOAP',
    ['no-reply@tenpo.cl', 'Comprobante de contratación de tu SOAP', 'Contrataste tu SOAP Monto: $8990 Patente: AA0000'],
    { tipo: 'gasto', monto: 8990, categoria: 'Seguros' }],
  ['MACH: comprar «COPEC PAY» con la tarjeta es cargar la billetera',
    ['contacto@mail.machbank.cl', 'Has hecho una compra con tu Tarjeta de Crédito MACHBANK',
      'Comercio COPEC PAY Monto pagado $12.500 Cantidad de cuotas 0 Tipo de tarjeta de crédito Virtual'],
    { tipo: 'interna', monto: 12500, categoria: 'Carga de billetera' }, true],
  ['MACH: comprar en la app de Copec sí es combustible',
    ['contacto@mail.machbank.cl', 'Has hecho una compra con tu Tarjeta de Crédito MACHBANK',
      'Comercio COPEC APP Monto pagado $53.809 Cantidad de cuotas 0'],
    { tipo: 'gasto', monto: 53809, categoria: 'Combustible' }, true],
  ['Fintual compra de dólares va solo a inversiones',
    ['hola@fintual.com', 'Compraste US $153,97', 'Hola Jesus con tus $141.207 pesos chilenos compraste US $ 153,97 a un tipo de cambio de $917,11'],
    { inv: { operacion: 'compra_dolares', monto: 141207 } }],
  ['un ingreso desde Fintual es rescate, no inversión',
    ['no-reply@tenpo.cl', 'Comprobante de transferencia - Tenpo',
      'Comprobante de recibo transferencia La transferencia de Fintual Administradora por 50.000 a tu cuenta Tenpo fue exitosa Monto transferencia: $50.000'],
    { tipo: 'rescate', monto: 50000 }, true],
  ['Tenpo estado de cuenta se ignora', ['no-reply@tenpo.cl', 'Estado de cuenta-Tarjeta de Crédito', 'Ya está disponible tu estado de cuenta'], { estado: 'ignorar' }],

  ['MACH compra con tarjeta de crédito',
    ['contacto@mail.machbank.cl', 'Has hecho una compra con tu Tarjeta de Crédito MACHBANK',
      'Comprobante de compra con tu Tarjeta de Crédito MACHBANK Detalle Comercio UNIMARC PALOMA Monto pagado $20.056 Cantidad de cuotas 0 Tipo de tarjeta de crédito Física Últimos 4 dígitos 1111'],
    { tipo: 'gasto', monto: 20056, contraparte: 'UNIMARC PALOMA', cuotas: 1, banco: 'MACH', categoria: 'Supermercado' }, true],
  ['MACH transferencia a Fintual es inversión',
    ['no-reply@mail.machbank.cl', 'Realizaste una transferencia a Fintual',
      'MACH Realizaste una transferencia Hola Jesus. Acabas de hacer una transferencia desde tu cuenta principal MACHBANK. Detalle Fecha 21/09/2026 - 07:42:58 Nombre destinatario Fintual Monto $40.000'],
    { tipo: 'inversion', monto: 40000, contraparte: 'Fintual', fecha: '2026-09-21 07:42', categoria: 'Inversiones' }, true],
  ['MACH transferencia a cuenta propia',
    ['no-reply@mail.machbank.cl', 'Realizaste una transferencia a Jesús  Seiler Velasquez',
      'Acabas de hacer una transferencia desde tu cuenta principal MACHBANK. Detalle Fecha 20/09/2026 - 13:32:21 Monto $15.000'],
    { tipo: 'interna', monto: 15000 }],
  ['MACH recibiste (dirigido a ti)',
    ['noreply@somosmach.com', 'Recibiste una transferencia de Carla Muñoz Rojas',
      'Recibiste una transferencia Hola Jesús. Acabas de recibir una transferencia de Carla Muñoz Rojas sin costo desde MACHBANK. Detalle Fecha 14/09/2026 - 20:38:40 Monto $12.000'],
    { tipo: 'ingreso', monto: 12000, contraparte: 'Carla Muñoz Rojas' }],
  ['MACH recibiste (copia dirigida al destinatario) se ignora',
    ['noreply@somosmach.com', 'Recibiste una transferencia de Jesus Enrique Seiler Velasquez',
      'Recibiste una transferencia Hola Fintual. Acabas de recibir una transferencia de Jesus Enrique Seiler Velasquez sin costo desde MACHBANK. Monto $40.000'],
    { estado: 'ignorar' }],
  ['MACH giro',
    ['noreply@somosmach.com', 'Realizaste un giro con tarjeta',
      'Realizaste un giro con tarjeta Hola Jesus. Acabas de realizar un giro con tarjeta en un cajero Redbanc, con cargo a tu cuenta principal MACH. Detalle Monto $10.000'],
    { tipo: 'gasto', monto: 10000, categoria: 'Efectivo' }, true],
  ['BCI Plus cashback',
    ['notificaciones@bciplus.cl', 'Has pedido el abono de tu cashback',
      'Hola JESUS ENRIQUE SEILER VELASQUEZ ¡Retiraste $446 de cashback acumulado! Monto: $446 ID de retiro: ABCD1234 Fecha: 25/09/2026 Hora: 22:27:21'],
    { tipo: 'ingreso', monto: 446, banco: 'MACH', categoria: 'Cashback' }, true],
  ['MACH cartola se ignora', ['contacto@mail.machbank.cl', 'Cartola Cuenta Corriente MACHBANK de Agosto, 2026', 'Te enviamos el detalle'], { estado: 'ignorar' }],

  ['Copec Pay retiro a cuenta propia',
    ['mensajeria@copecpay.cl', 'Tu retiro se realizó con éxito',
      '¡Listo! Tu retiro se realizó con éxito Monto $30.000 Cuenta destino: Jesus Seiler Cuenta Vista ****0000 Mercado Pago N° transacción: 000000 Fecha y hora: 2026-09-19 12:40:46 Infórmate sobre las entidades'],
    { tipo: 'interna', monto: 30000, contraparte: 'Jesus Seiler', fecha: '2026-09-19 12:40' }],
  ['Copec Pay transferencia a un tercero con comentario',
    ['mensajeria@copecpay.cl', 'Tu transferencia se realizó con éxito',
      '¡Listo! Tu transferencia se envió con éxito Monto $1.500 Cuenta destino: ana perez Cuenta Vista ****1111 Banco Estado N° transacción: 111111 Fecha y hora: 2026-09-06 09:25:55 Comentario: pago pan Infórmate sobre las'],
    { tipo: 'gasto', monto: 1500, contraparte: 'ana perez' }],
  ['Copec Pay carga de saldo',
    ['mensajeria@copecpay.cl', 'Cargaste dinero en tu cuenta',
      'Cargaste dinero con éxito en tu cuenta Monto $17.500 Cuenta origen: Tarjeta Bancaria MASTERCARD ****0000 N° transacción: 000000 Fecha y hora: 2026-09-01 08:01:32'],
    { tipo: 'interna', monto: 17500 }],

  ['Mercado Pago transferencia (plantilla nueva)',
    ['info@mercadopago.cl', '¡Enviamos tu transferencia!',
      '¡Enviamos tu transferencia! Mercado Pago Ya enviamos tu transferencia de $ 17.684 Datos del beneficiario Nombre y apellido: Jesus Seiler Velasquez Entidad: Copec Pay Número de cuenta: 00000000000'],
    { tipo: 'interna', monto: 17684, contraparte: 'Jesus Seiler Velasquez' }],
  ['Mercado Pago transferencia (plantilla antigua) a tercero',
    ['info@mercadopago.com', 'Tu transferencia fue enviada',
      'Mercado Pago Ya enviamos tu transferencia de $ 15.000. Datos del beneficiario Nombre y apellido: Rosa Entidad: Banco Estado Número de cuenta: 00000000'],
    { tipo: 'gasto', monto: 15000, contraparte: 'Rosa' }],
  ['Mercado Pago pago de un servicio',
    ['info@mercadopago.com', 'Se acreditó tu pago',
      'Jesus Enrique Seiler Velasquez Sencillito Servicios ya recibió tu pago Sencillito Servicios ya recibió tu pago Jesus Enrique, te compartimos los detalles: Dinero en mi cuenta de MercadoPago Total: $ 23.990'],
    { tipo: 'gasto', monto: 23990, contraparte: 'Sencillito Servicios', categoria: 'Servicios' }, true],
  ['Mercado Pago ingreso de dinero es interno',
    ['info@mercadopago.com', 'Se acreditó tu pago',
      'Jesus Enrique, Se acreditó tu pago por: Ingreso de dinero $ 100.000 con Ten en cuenta que, si corresponde, el banco puede aplicar intereses'],
    { tipo: 'interna', monto: 100000 }],
  ['Mercado Pago publicidad se ignora', ['novedades@a.mercadopago.com', '¡Gana con Mercado Pago!', 'Participa por premios'], { estado: 'ignorar' }],

  ['BancoEstado compra con débito',
    ['notificaciones@correo.bancoestado.cl', 'Notificación de compra - BancoEstado',
      'JESUS ENRIQUE SEILER Se ha realizado compra e-commerce por $ 5.850 en SII 11001SANTIAGOCL asociado a su tarjeta de Débito terminada en **** 0000 el día 17/09/2026 a las 17:12 hrs.'],
    { tipo: 'gasto', monto: 5850, contraparte: 'SII', producto: 'Cuenta', categoria: 'Impuestos' }, true],
  ['BancoEstado compra en dólares con crédito',
    ['notificaciones@correo.bancoestado.cl', 'Notificación de compra - BancoEstado',
      'JESUS ENRIQUE SEILER Se ha realizado una compra por USD 100,00 en COPA asociado a su tarjeta de crédito terminada en **** 0000 el día 17/09/2026 a las 15:40 hrs.'],
    { tipo: 'gasto', monto: 95000, moneda: 'USD', contraparte: 'COPA', producto: 'Tarjeta de crédito' }],
  ['BancoEstado Rutpay',
    ['notificaciones@correo.bancoestado.cl', 'Notificación de compra con Rutpay de BancoEstado',
      'Notificación de compra con Rutpay Estimado(a) JESUS ENRIQUE SEILER VELASQUEZ Se ha realizado una compra por $34.538 en Cugat asociado a su CuentaRUT ****0000, el día 17-09-2026 a las 19:02:08 hrs.'],
    { tipo: 'gasto', monto: 34538, contraparte: 'Cugat', producto: 'Rutpay', categoria: 'Supermercado' }, true],
  ['BancoEstado giro',
    ['notificaciones@correo.bancoestado.cl', 'Notificación de giro - BancoEstado',
      'JESUS ENRIQUE SEILER Se ha realizado un giro en CAJERO REDBANC por $20.000 asociado a su tarjeta terminada en ****0000 el día 17/09/2026 a las 13:20 hrs.'],
    { tipo: 'gasto', monto: 20000, categoria: 'Efectivo' }, true],
  ['BancoEstado entre mis cuentas',
    ['notificaciones@correo.bancoestado.cl', 'Aviso de transferencia de fondos entre mis cuentas',
      'Hola Jesus Enrique: Jesus, el pago se ha realizado correctamente Datos del pago que realizaste Monto Total $2220 Origen: Producto: PLAZO VIVIENDA GIRO N° de Cuenta: 00000000000'],
    { tipo: 'interna', monto: 2220 }],
  ['BancoEstado publicidad (remitente mensajeria) no es un movimiento',
    ['mensajeria@correobancoestado.cl', 'Jesus, ahorra un 20% adicional en UNIMARC 🛒', 'Con Rutpay obtén 20% de descuento. Anular su suscripción'],
    { estado: 'ignorar' }],

  ['Fintual aporte va solo a inversiones',
    ['hola@fintual.com', 'Invertimos tu plata en 👵 Objetivo de APV-A',
      'Hola Jesus Invertimos tus $40.000 El lunes 21 de septiembre a las 20:19 tus $40.000 pesos chilenos se invirtieron de la siguiente forma'],
    { inv: { operacion: 'aporte', monto: 40000, plataforma: 'Fintual' } }],
  ['Fintual retiro pagado es rescate + inversión',
    ['hola@fintual.com', 'Pagamos tu retiro de 👵 Objetivo de APV-A',
      'Hola Jesus Te transferimos $321.091 El martes 23 de diciembre a las 11:41 nos pediste un retiro'],
    { tipo: 'rescate', monto: 321091, inv: { operacion: 'retiro', monto: 321091 } }],
  ['Fintual venta de dólares',
    ['hola@fintual.com', 'Recibirás 55.478 pesos chilenos por la venta de tus 62,79 dólares',
      'Hola Jesus Convertimos los US $ 62,79 que nos pediste vender a $55.478 La conversión fue a una tasa de $883,55 CLP/USD. Te transferiremos los $55.478 a la cuenta 0000000000 del Mercado Pago'],
    { tipo: 'rescate', monto: 55478 }],
  ['Fintual compra de ETF en dólares',
    ['hola@fintual.com', 'Invertiste US $184,65 dólares en 2,148408866 acciones de Vanguard Total International Stock ETF',
      'Invertiste 184,65 de tus dólares Monto invertido US $ 184,65'],
    { inv: { operacion: 'compra', monto: 184.65, moneda: 'USD', instrumento: 'Vanguard Total International Stock ETF' } }],
  ['Fintual «Invertiremos» (aviso previo) se ignora', ['hola@fintual.com', 'Invertiremos tu plata en 👵 Objetivo', 'Invertiremos tus $40.000'], { estado: 'ignorar' }],

  ['Banco Falabella aviso de transferencia recibida',
    ['notificaciones@cl.bancofalabella.com', 'Aviso de transferencia de fondos recibida',
      'Jesus enrique seiler velasquez Le informamos que hoy, 14-09-2026, nuestro(a) cliente MARIO ANDRES SOTO ha instruido una transferencia de fondos a su cuenta con el siguiente detalle: Detalle Banco Tenpo Monto $5.520'],
    { tipo: 'ingreso', monto: 5520, contraparte: 'MARIO ANDRES SOTO' }],
]

for (const [nombre, args, e, categorizar] of CASOS) {
  prueba(nombre, () => {
    const r = leer(...args)
    if (categorizar && r.mov) L.categorizar_(r.mov, [])
    esperar(r, e)
  })
}

/* ---------- red genérica ---------- */
prueba('red genérica: un banco sin lector propio va a revisar', () => {
  const r = leer('avisos@santander.cl', 'Comprobante de transferencia', 'Estimado cliente, se ha realizado una transferencia por $45.000 a la cuenta de Pedro')
  assert.equal(r.estado, 'revisar')
  assert.equal(r.sugerido.monto, 45000)
  assert.equal(r.sugerido.tipo, 'gasto')
  assert.equal(r.sugerido.banco, 'Santander')
})
prueba('red genérica: abono detectado como ingreso', () => {
  const r = leer('notificaciones@bancochile.cl', 'Aviso de abono', 'Has recibido un abono de $120.000 en tu cuenta')
  assert.equal(r.estado, 'revisar')
  assert.equal(r.sugerido.tipo, 'ingreso')
})
prueba('red genérica: publicidad de un banco no entra', () => {
  assert.equal(leer('ofertas@mkt.bancoripley.cl', '¡Compra con 30% de descuento!', 'Compra por $10.000 y participa').estado, 'nada')
})
prueba('red genérica: un comercio no es un banco', () => {
  assert.equal(leer('noreply@paris.cl', 'Confirmamos tu compra', 'Tu compra por $25.990 fue confirmada').estado, 'nada')
})
prueba('lector de un banco conocido que falla → revisar con motivo', () => {
  const r = leer('no-reply@tenpo.cl', 'Comprobante de compra con tu tarjeta de crédito', 'Un formato totalmente nuevo sin etiquetas')
  assert.equal(r.estado, 'revisar')
  assert.match(r.motivo, /formato cambió/)
})
prueba('un comprobante nuevo de un banco conocido no se lo traga el «-otros»', () => {
  const r = leer('no-reply@tenpo.cl', 'Comprobante de depósito', 'Se ha realizado un depósito por $50.000 en tu cuenta')
  assert.equal(r.estado, 'revisar')
})

/* ---------- categorías y duplicados ---------- */
prueba('categorizar_: la regla más específica primero y tipo desde la regla', () => {
  const m = L.categorizar_({ tipo: 'gasto', contraparte: 'COPEC PUERTO MONTT', producto: 'Tarjeta de crédito' }, [])
  assert.equal(m.categoria, 'Combustible')
  const r = L.categorizar_({ tipo: 'gasto', contraparte: 'Algo Raro SPA', producto: 'Cuenta' }, [{ patron: 'algo raro', categoria: 'Hobby', tipo: '' }])
  assert.equal(r.categoria, 'Hobby')
})
prueba('categorizar_: las internas no cambian de tipo por una regla', () => {
  const m = L.categorizar_({ tipo: 'interna', contraparte: 'Jesus Seiler Fintual' }, [])
  assert.equal(m.tipo, 'interna')
})
prueba('esDuplicado_: aviso de Falabella + recibo de Tenpo', () => {
  const tenpo = { id: 'M1', tipo: 'ingreso', monto: 5520, banco: 'Tenpo', fecha: '2026-09-14 09:30', contraparte: 'MARIO ANDRESSOTOPEREZ' }
  const fala = { tipo: 'ingreso', monto: 5520, banco: 'Falabella', fecha: '2026-09-14 09:28', contraparte: 'MARIO ANDRES SOTO' }
  assert.equal(L.esDuplicado_(fala, [tenpo])?.id, 'M1')
  assert.equal(L.esDuplicado_({ ...fala, monto: 5521 }, [tenpo]), null)
  assert.equal(L.esDuplicado_({ ...fala, fecha: '2026-09-20 09:28' }, [tenpo]), null)
  assert.equal(L.esDuplicado_({ ...fala, banco: 'Tenpo' }, [tenpo]), null)
})
/* ---------- cuentas externas (Mercado Pago) ---------- */
const EXT = { ...CTX, externas: 'Mercado Pago' }
const conExterna = (args, lector) => { const r = leer(...args); L.categorizar_(r.mov, []); return L.externa_(r.mov, EXT, r.lector || lector) }
prueba('externa: de Mercado Pago a una cuenta tuya es ingreso', () => {
  const m = conExterna(['info@mercadopago.cl', '¡Enviamos tu transferencia!',
    'Ya enviamos tu transferencia de $ 1.096.130 Datos del beneficiario Nombre y apellido: Jesus Seiler Velasquez Entidad: Copec Pay Número de cuenta: 000'])
  assert.equal(m.tipo, 'ingreso')
  assert.equal(m.categoria, 'Desde Mercado Pago')
})
prueba('externa: de Copec Pay hacia tu Mercado Pago es gasto', () => {
  const m = conExterna(['mensajeria@copecpay.cl', 'Tu retiro se realizó con éxito',
    '¡Listo! Tu retiro se realizó con éxito Monto $30.000 Cuenta destino: Jesus Seiler Cuenta Vista ****0000 Mercado Pago N° transacción: 000000 Fecha y hora: 2026-09-19 12:40:46'])
  assert.equal(m.tipo, 'gasto')
  assert.equal(m.categoria, 'Hacia Mercado Pago')
})
prueba('externa: el «recibiste» del otro lado sigue interno (no se cuenta dos veces)', () => {
  const m = conExterna(['no-reply@tenpo.cl', 'Comprobante de transferencia - Tenpo',
    'Comprobante de recibo transferencia La transferencia de Jesus Seiler por 20.000 a tu cuenta Tenpo fue exitosa Monto transferencia: $20.000 Origen transferencia: Jesus Seiler Banco de origen: Mercado Pago'])
  assert.equal(m.tipo, 'interna')
})
prueba('externa: cargar Mercado Pago con la tarjeta es gasto; cargar Copec Pay sigue interno', () => {
  const mp = conExterna(['no-reply@tenpo.cl', 'Comprobante de compra con tu tarjeta de crédito',
    'La compra por $100.000 con tu tarjeta de crédito Tenpo fue exitosa. Monto transacción: $100.000 Comercio: MERCADO PAGO SANTIAGO CHL Cuotas: 1'])
  assert.equal(mp.tipo, 'gasto')
  const cp = conExterna(['contacto@mail.machbank.cl', 'Has hecho una compra con tu Tarjeta de Crédito MACHBANK', 'Comercio COPEC PAY Monto pagado $12.500 Cantidad de cuotas 0'])
  assert.equal(cp.tipo, 'interna')
})
prueba('externa: sin cuentas externas en Config todo queda como antes', () => {
  const r = leer('info@mercadopago.cl', '¡Enviamos tu transferencia!', 'Ya enviamos tu transferencia de $ 5.000 Datos del beneficiario Nombre y apellido: Jesus Seiler Entidad: Tenpo')
  assert.equal(L.externa_(r.mov, CTX, r.lector).tipo, 'interna')
})
prueba('externa: una transferencia a un tercero no cambia', () => {
  const m = conExterna(['info@mercadopago.cl', '¡Enviamos tu transferencia!', 'Ya enviamos tu transferencia de $ 5.000 Datos del beneficiario Nombre y apellido: Rosa Perez Entidad: Banco Estado'])
  assert.equal(m.tipo, 'gasto')
  assert.notEqual(m.categoria, 'Desde Mercado Pago')
})

prueba('todas las reglas base usan tipos válidos', () => {
  for (const r of L.__.REGLAS_BASE) if (r[2]) assert.ok(L.__.TIPOS.includes(r[2]), r.join(','))
})

/* ---------- correos reales anonimizados ---------- */
/* ---------- Binance y compra de cripto por P2P ---------- */
prueba('binance: un pago en BTC no se inventa en pesos → revisar', () => {
  const r = leer('do-not-reply@ses.binance.com', '[Binance]Payment Transaction Detail - 2026-09-28 17:27:48 (UTC)',
    'Payment Transaction Detail You made the following payment: Time: 2026-09-28 17:27:48(UTC) Amount: 0.0005 BTC')
  assert.equal(r.estado, 'revisar')
})
prueba('binance: un pago recibido con el mismo asunto no es gasto', () => {
  const r = leer('do-not-reply@ses.binance.com', '[Binance]Payment Transaction Detail - 2026-09-28 17:27:48 (UTC)',
    'Payment Transaction Detail You received the following payment: Amount: 10 USDT')
  assert.equal(r.estado, 'revisar')
})
prueba('binance: montos en formato inglés con miles', () => {
  const r = leer('do-not-reply@ses.binance.com', '[Binance]Payment Transaction Detail',
    'You made the following payment: Time: 2026-09-28 17:27:48(UTC) Amount: 1,250.50 USDC')
  assert.equal(r.mov.monto, Math.round(1250.5 * 950))
  assert.equal(r.mov.monto_original, 1250.5)
  assert.equal(r.mov.fecha, '2026-09-18 10:00', 'la hora UTC del cuerpo no reemplaza la del correo')
})
prueba('binance: un depósito sin lector va a revisar; alertas y publicidad se ignoran', () => {
  assert.equal(leer('do-not-reply@ses.binance.com', '[Binance] Deposit Successful', 'Your deposit of 100 USDT is now available').estado, 'revisar')
  assert.equal(leer('do-not-reply@ses.binance.com', '[Binance] Login Attempted from New IP address 0.0.0.0', 'We noticed your Binance account was accessed').estado, 'ignorar')
  assert.equal(leer('do_not_reply@smailer2.binance.com', 'Importante: Transacciones con ciertas plataformas', 'Hola Binancians').estado, 'ignorar')
  assert.equal(leer('do_not_reply@smailer1.binance.com', 'Reclama un cupón de $1 en cripto', 'compra $10 en Spot').estado, 'ignorar')
})
const P2P = { ...CTX, vendedores: 'Leveltech' }
const transferenciaCopec = (dest, monto) => leer('mensajeria@copecpay.cl', 'Tu transferencia se realizó con éxito',
  `¡Listo! Tu transferencia se envió con éxito Monto $${monto} Cuenta destino: ${dest} Cuenta Corriente ****0000 BCI/MACHBANK N° transacción: 000000 Fecha y hora: 2026-09-18 09:22:46 Comentario: pago`)
prueba('p2p: pagarle a un vendedor de Binance es compra de cripto (interna), no gasto', () => {
  const r = transferenciaCopec('Leveltech SPA', '25.000')
  const m = L.p2p_(L.categorizar_(r.mov, []), P2P)
  assert.equal(m.tipo, 'interna')
  assert.equal(m.categoria, 'Compra de cripto')
  assert.equal(m.monto, 25000)
})
prueba('p2p: lo que paga un vendedor al venderle USDT es venta de cripto (interna)', () => {
  const m = L.p2p_({ tipo: 'ingreso', contraparte: 'LEVELTECH SPA', monto: 30000, categoria: 'Ingresos' }, P2P)
  assert.equal(m.tipo, 'interna')
  assert.equal(m.categoria, 'Venta de cripto')
})
prueba('p2p: otras transferencias y Config vacío no cambian', () => {
  const otra = L.p2p_(L.categorizar_(transferenciaCopec('Pedro Demo', '20.000').mov, []), P2P)
  assert.equal(otra.tipo, 'gasto')
  assert.equal(L.p2p_(L.categorizar_(transferenciaCopec('Leveltech SPA', '25.000').mov, []), CTX).tipo, 'gasto')
})

const dir = new URL('./fixtures/', import.meta.url)
const reales = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []
let conEspera = 0
for (const f of reales) {
  const c = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'))
  if (!c.espera) continue
  conEspera++
  prueba(`fixture ${f}`, () => {
    const fecha = String(c.date).replace('T', ' ').slice(0, 16)
    const r = L.leerCorreo_({ de: c.from, asunto: c.subject, texto: L.textoCorreo_(c.body, c.htmlEncabezado || ''), fecha }, CTX)
    if (r.mov) L.categorizar_(r.mov, [])
    esperar(r, c.espera)
  })
}

console.log(`lectores: ${ok} pruebas ok${reales.length ? ` (${conEspera}/${reales.length} fixtures reales con espera)` : ''}`)
if (fallos.length) { console.error(fallos.join('\n')); process.exit(1) }
