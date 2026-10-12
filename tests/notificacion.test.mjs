// Pruebas de supabase/functions/notificacion/cuerpo.js: cómo se lee lo que
// manda MacroDroid desde el celular.
import assert from 'node:assert/strict'
import { leerCuerpo } from '../supabase/functions/notificacion/cuerpo.js'

let ok = 0
const fallos = []
function prueba(nombre, fn) { try { fn(); ok++ } catch (e) { fallos.push(`✗ ${nombre}\n    ${e.message}`) } }

prueba('texto: paquete, título y texto en líneas', () => {
  assert.deepEqual(leerCuerpo('com.tenpo.app\nCompra aprobada\nCompraste $5.990 en JUMBO'), {
    paquete: 'com.tenpo.app', titulo: 'Compra aprobada', texto: 'Compraste $5.990 en JUMBO', texto_largo: '',
  })
})

prueba('texto: comillas y saltos de línea del banco no rompen nada', () => {
  const r = leerCuerpo('cl.bancoestado.app\r\nAviso "importante"\r\nTransferiste $10.000\r\na "Juan Pérez"')
  assert.equal(r.titulo, 'Aviso "importante"')
  assert.equal(r.texto, 'Transferiste $10.000\na "Juan Pérez"')
})

prueba('texto: «--» separa el texto expandido', () => {
  const r = leerCuerpo('com.mercadopago.wallet\nPagaste\nPagaste $3.000\n--\nPagaste $3.000 en KIOSCO con QR\nSaldo $12.000')
  assert.equal(r.texto, 'Pagaste $3.000')
  assert.equal(r.texto_largo, 'Pagaste $3.000 en KIOSCO con QR\nSaldo $12.000')
})

prueba('texto: una variable de MacroDroid sin reemplazar no se guarda como contenido', () => {
  const r = leerCuerpo('com.tenpo.app\n{not_title}\nCompraste $1\n--\n{not_text_big}')
  assert.equal(r.titulo, '')
  assert.equal(r.texto_largo, '')
})

prueba('json: la forma de una app propia', () => {
  const r = leerCuerpo(JSON.stringify({ paquete: 'com.tenpo.app', titulo: 'T', texto: 'X', texto_largo: 'Y', otro: 1 }), 'application/json; charset=utf-8')
  assert.deepEqual(r, { paquete: 'com.tenpo.app', titulo: 'T', texto: 'X', texto_largo: 'Y' })
})

prueba('limpia caracteres de control y recorta a los límites de la tabla', () => {
  const r = leerCuerpo(`com.tenpo.app\nA\u0000B\u0007C\n${'x'.repeat(5000)}`)
  assert.equal(r.titulo, 'ABC')
  assert.equal(r.texto.length, 4000)
})

prueba('sin paquete válido, no se acepta', () => {
  assert.throws(() => leerCuerpo(''))
  assert.throws(() => leerCuerpo('\nTítulo\nTexto'))
  assert.throws(() => leerCuerpo('com tenpo; drop\nT\nX'))
  assert.throws(() => leerCuerpo('{"paquete":', 'application/json'))
  assert.throws(() => leerCuerpo('[1,2]', 'application/json'))
})

if (fallos.length) {
  console.error(fallos.join('\n'))
  process.exit(1)
}
console.log(`notificacion: ${ok} pruebas ok`)
