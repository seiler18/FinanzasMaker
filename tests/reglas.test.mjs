// La página y el trabajador deben categorizar igual y tener la misma
// configuración de fábrica: src/lib/reglas.js ↔ categorizar_ (Lectores.gs),
// src/lib/config-base.js ↔ CONFIG_BASE (Code.gs). Y la validación de lo que
// la página escribe (src/lib/validar.js).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { categorizar } from '../src/lib/reglas.js'
import { CONFIG_BASE, conBase } from '../src/lib/config-base.js'
import { validarMov, fechaValida, ahoraChile } from '../src/lib/validar.js'
import { esPropio } from '../supabase/functions/notificacion/lectores.js'

const ctx = vm.createContext({ console })
vm.runInContext(['Lectores.gs', 'Code.gs'].map((f) => fs.readFileSync(new URL('../backend/' + f, import.meta.url), 'utf8')).join('\n') + '\n;globalThis.__ = { categorizar_, CONFIG_BASE, REGLAS_BASE, esPropio_ };', ctx)
const gs = ctx.__

let ok = 0
const fallos = []
function prueba(nombre, fn) { try { fn(); ok++ } catch (e) { fallos.push(`✗ ${nombre}\n    ${e.message}`) } }

const reglas = gs.REGLAS_BASE.map((r) => ({ patron: r[0], categoria: r[1], tipo: r[2] || '' }))
  .concat([{ patron: 'don pepe', categoria: 'Comida', tipo: '' }])

prueba('categorizar: la página y el trabajador deciden igual', () => {
  const casos = [
    { tipo: 'gasto', contraparte: 'JUMBO COSTANERA', producto: 'Tarjeta de crédito' },
    { tipo: 'gasto', contraparte: 'Fintual', producto: 'Cuenta' },
    { tipo: 'ingreso', contraparte: 'Fintual Administradora', producto: 'Cuenta' },
    { tipo: 'gasto', contraparte: 'MERCADO PAGO SANTIAGO', producto: 'Tarjeta de crédito' },
    { tipo: 'ingreso', contraparte: 'COPEC PAY', producto: 'Cuenta' },
    { tipo: 'gasto', contraparte: 'Carolina Guzmán', producto: 'Cuenta' },
    { tipo: 'gasto', contraparte: 'SERVICIOS SPA', producto: 'Cuenta' },
    { tipo: 'gasto', contraparte: 'Don Pepé', producto: 'Cuenta' },
    { tipo: 'interna', contraparte: 'Jesus Seiler', producto: 'Cuenta' },
    { tipo: 'pago_tarjeta', contraparte: '', producto: 'Cuenta' },
    { tipo: 'rescate', contraparte: 'x', producto: 'Cuenta' },
    { tipo: 'ingreso', contraparte: 'Empresa Demo', producto: 'Cuenta' },
    { tipo: 'gasto', contraparte: 'algo raro 123', producto: 'Cuenta' },
    { tipo: 'gasto', contraparte: 'UBER EATS', producto: 'Tarjeta de crédito', categoria: 'Ya puesta' },
  ]
  for (const c of casos) {
    const web = categorizar({ ...c }, reglas)
    const trabajador = JSON.parse(JSON.stringify(gs.categorizar_({ ...c }, reglas)))
    assert.deepEqual({ tipo: web.tipo, categoria: web.categoria }, { tipo: trabajador.tipo, categoria: trabajador.categoria }, JSON.stringify(c))
  }
})

// El aviso del celular (lectores.js) y el correo (Lectores.gs) tienen que
// reconocer al titular igual: si no, la misma transferencia sería interna por
// un lado y gasto por el otro.
prueba('esPropio: el aviso y el correo reconocen al titular igual', () => {
  const nombres = ['JESUS ENRIQUE SEILER VELASQUEZ', 'Jesús Seiler', 'jesusseiler', 'Jesus EnriqueSeilerVelasquez', 'Luis Seiler', 'Jesus', '', 'Seiler Jesus']
  for (const titular of ['Jesus Seiler', 'Jesús Seiler', '']) {
    for (const n of nombres) assert.equal(esPropio(n, titular), gs.esPropio_(n, titular), `${n} / ${titular}`)
  }
})

prueba('la configuración de fábrica es la misma en los dos lados', () => {
  assert.deepEqual(CONFIG_BASE, JSON.parse(JSON.stringify(gs.CONFIG_BASE)))
  assert.equal(conBase([{ clave: 'titular', valor: 'Ana' }]).titular, 'Ana')
  assert.equal(conBase([]).borrar_correos, 'si')
})

prueba('validarMov: fecha sin hora a las 12:00, categoría deducida, textos recortados', () => {
  const m = validarMov({ fecha: '2026-09-20', tipo: 'gasto', monto: '4500', contraparte: 'Feria Copec', banco: '' }, reglas)
  assert.equal(m.fecha, '2026-09-20 12:00')
  assert.equal(m.monto, 4500)
  assert.equal(m.categoria, 'Combustible')
  assert.equal(m.banco, 'Efectivo')
  assert.equal(validarMov({ fecha: '2026-09-20 08:05', tipo: 'gasto', monto: 1, contraparte: 'x'.repeat(200) }, []).contraparte.length, 80)
})

prueba('validarMov rechaza monto, fecha y tipo inválidos', () => {
  assert.throws(() => validarMov({ fecha: '2026-09-20', tipo: 'gasto', monto: -1 }, []), /Monto no válido/)
  assert.throws(() => validarMov({ fecha: 'ayer', tipo: 'gasto', monto: 1 }, []), /Fecha/)
  assert.throws(() => validarMov({ fecha: '2026-13-01', tipo: 'gasto', monto: 1 }, []), /Fecha no válida/)
  assert.throws(() => validarMov({ fecha: '2026-09-20', tipo: 'robo', monto: 1 }, []), /Tipo no válido/)
  assert.throws(() => fechaValida('2026-09-20T25'), /Fecha/)
})

prueba('ahoraChile da la hora de Chile en el formato de la base', () => {
  assert.equal(ahoraChile(new Date('2026-09-28T17:27:00Z')), '2026-09-28 14:27')
  assert.equal(ahoraChile(new Date('2026-07-01T03:30:00Z')), '2026-06-30 23:30')
})

console.log(`reglas: ${ok} pruebas ok`)
if (fallos.length) { console.error(fallos.join('\n')); process.exit(1) }
