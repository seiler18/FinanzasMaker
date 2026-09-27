/* Modo demo: un backend de mentira en memoria con datos INVENTADOS.

   Es lo que ve quien visita la página sin ser el dueño (y lo que se usa para
   desarrollar sin tocar la planilla). Debe contestar con la misma forma que
   backend/Code.gs: si allá cambia una acción, cambia aquí también.

   Los datos salen de un generador con semilla fija: se ven igual en cada
   carga, así una captura del portafolio no cambia sola. */

import { hoyISO } from './lib/analisis.js'

function semilla(s) {
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}
const dd = (n) => String(n).padStart(2, '0')

function generar() {
  const azar = semilla(20260101)
  const entre = (a, b) => Math.round(a + azar() * (b - a))
  const elegir = (xs) => xs[Math.floor(azar() * xs.length)]
  const movs = []
  let n = 0
  const hoy = hoyISO()
  const add = (fecha, o) => {
    if (fecha > hoy) return
    movs.push({ id: 'D' + (++n), fecha: `${fecha} ${dd(entre(8, 22))}:${dd(entre(0, 59))}`, producto: 'Cuenta', moneda: 'CLP', cuotas: '', detalle: '', nota: '', origen: 'correo', ...o })
  }
  const [aHoy, mHoy] = hoy.split('-').map(Number)
  for (let m = 1; m <= mHoy; m++) {
    const f = (d) => `${aHoy}-${dd(m)}-${dd(Math.min(d, 28))}`
    add(f(1), { banco: 'BancoEstado', tipo: 'ingreso', monto: 1450000, contraparte: 'Empresa Demo SpA', categoria: 'Sueldo' })
    add(f(2), { banco: 'BancoEstado', tipo: 'interna', monto: 600000, contraparte: 'Ana Demo', categoria: 'Entre mis cuentas', detalle: 'A Tenpo' })
    add(f(2), { banco: 'Tenpo', tipo: 'interna', monto: 600000, contraparte: 'Ana Demo', categoria: 'Entre mis cuentas' })
    add(f(3), { banco: 'Tenpo', tipo: 'gasto', monto: 380000, contraparte: 'Arriendos del Sur', categoria: 'Vivienda' })
    add(f(5), { banco: 'MACH', tipo: 'inversion', monto: 100000, contraparte: 'Fintual', categoria: 'Inversiones' })
    add(f(6), { banco: 'Tenpo', producto: 'Tarjeta de crédito', tipo: 'gasto', monto: 7990, contraparte: 'NETFLIX.COM', categoria: 'Suscripciones' })
    add(f(9), { banco: 'MACH', producto: 'Tarjeta de crédito', tipo: 'gasto', monto: 4990, contraparte: 'SPOTIFY', categoria: 'Suscripciones' })
    add(f(12), { banco: 'Mercado Pago', tipo: 'gasto', monto: entre(24000, 31000), contraparte: 'Sencillito Servicios', categoria: 'Servicios' })
    add(f(15), { banco: 'Tenpo', tipo: 'pago_tarjeta', monto: entre(250000, 330000), contraparte: 'Tarjeta de crédito Tenpo', categoria: 'Pago de tarjeta' })
    for (let s = 0; s < 4; s++) {
      add(f(4 + s * 7), { banco: elegir(['MACH', 'Tenpo']), producto: 'Tarjeta de crédito', tipo: 'gasto', monto: entre(28000, 72000), contraparte: elegir(['UNIMARC CENTRO', 'LIDER EXPRESS', 'JUMBO COSTANERA']), categoria: 'Supermercado' })
      add(f(6 + s * 7), { banco: 'Copec Pay', tipo: 'gasto', monto: entre(18000, 35000), contraparte: 'COPEC RUTA 5', categoria: 'Combustible' })
    }
    for (let k = 0; k < entre(6, 14); k++) {
      add(f(entre(1, 28)), { banco: elegir(['MACH', 'BancoEstado']), tipo: 'gasto', monto: entre(1200, 4800), contraparte: elegir(['CAFE MOLINO', 'KIOSKO LA ESQUINA', 'PANADERIA EL TRIGO']), categoria: 'Comida' })
    }
    for (let k = 0; k < entre(2, 5); k++) {
      add(f(entre(1, 28)), { banco: 'Tenpo', producto: 'Tarjeta de crédito', tipo: 'gasto', monto: entre(9000, 26000), contraparte: elegir(['PEDIDOSYA', 'RAPPI', 'UBER EATS']), categoria: 'Comida' })
    }
    add(f(entre(10, 25)), { banco: 'Copec Pay', tipo: 'gasto', monto: entre(5, 40) * 1000, contraparte: elegir(['Pedro Demo', 'Rosa Demo', 'Carla Demo']), categoria: 'Transferencias a personas' })
    if (azar() < 0.5) add(f(entre(10, 25)), { banco: 'Tenpo', tipo: 'ingreso', monto: entre(10, 60) * 1000, contraparte: elegir(['Mario Demo', 'Luis Demo']), categoria: 'Ingresos' })
    if (azar() < 0.4) add(f(entre(10, 25)), { banco: 'MACH', producto: 'Tarjeta de crédito', tipo: 'gasto', monto: entre(60, 190) * 1000, cuotas: 3, contraparte: elegir(['FALABELLA', 'DECATHLON', 'PARIS']), categoria: 'Compras' })
    if (azar() < 0.5) add(f(entre(5, 25)), { banco: 'BancoEstado', tipo: 'gasto', monto: 20000, contraparte: 'Giro en cajero', categoria: 'Efectivo' })
    add(f(20), { banco: 'MACH', tipo: 'ingreso', monto: entre(300, 900), contraparte: 'Cashback BCI Plus', categoria: 'Cashback' })
  }
  // El último mes con un gasto de comida alto, para que el consejo de
  // «categoría que subió» tenga algo que mostrar.
  add(`${aHoy}-${dd(mHoy)}-${dd(Math.max(1, Number(hoy.slice(8, 10)) - 2))}`, { banco: 'Tenpo', producto: 'Tarjeta de crédito', tipo: 'gasto', monto: 64000, contraparte: 'SUSHI DEMO', categoria: 'Comida' })

  const revisar = [
    { gmail_id: 'demo-r1', fecha: `${hoy} 09:14`, remitente: 'avisos@bancodemo.cl', asunto: 'Comprobante de transferencia', motivo: 'Correo bancario sin lector propio', tipo: 'gasto', monto: 45000, contraparte: '', banco: 'Bancodemo', extracto: 'Estimado cliente, se ha realizado una transferencia por $45.000 desde su cuenta corriente…', estado: 'pendiente' },
    { gmail_id: 'demo-r2', fecha: `${hoy} 11:02`, remitente: 'notificaciones@correo.bancoestado.cl', asunto: 'Comprobante de depósito', motivo: 'Formato nuevo de Bancoestado', tipo: 'ingreso', monto: 120000, contraparte: '', banco: 'Bancoestado', extracto: 'Se ha realizado un depósito por $120.000 en su CuentaRUT…', estado: 'pendiente' },
  ]
  const inversiones = movs.filter((m) => m.tipo === 'inversion').map((m, i) => ({ id: 'DI' + i, fecha: m.fecha, plataforma: 'Fintual', operacion: 'aporte', instrumento: 'Objetivo APV-A', monto: m.monto, moneda: 'CLP' }))
  return {
    movimientos: movs.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    inversiones, revisar,
    presupuestos: [{ categoria: 'Comida', monto_mensual: 90000 }, { categoria: 'Supermercado', monto_mensual: 220000 }],
    reglas: [],
    estado: { ultima: new Date().toISOString(), importando: false, borrar: true, titular: 'Ana Demo' },
  }
}

let db
const espera = () => new Promise((r) => setTimeout(r, 150))

export async function demoLlamar(accion, d) {
  db ??= generar()
  await espera()
  const buscar = (id) => db.movimientos.find((m) => m.id === id)
  switch (accion) {
    case 'datos': return { ok: true, ...structuredClone(db), demo: true }
    case 'agregar': {
      const m = { id: 'D' + Date.now(), producto: 'Cuenta', moneda: 'CLP', origen: 'manual', cuotas: '', detalle: '', nota: '', categoria: 'Otros', ...d.mov, monto: Number(d.mov.monto) }
      if (!/^\d{4}-\d{2}-\d{2}/.test(m.fecha)) throw new Error('Fecha no válida (AAAA-MM-DD)')
      if (!(m.monto > 0)) throw new Error('Monto no válido')
      if (m.fecha.length === 10) m.fecha += ' 12:00'
      db.movimientos.push(m)
      return { ok: true, mov: m }
    }
    case 'editar': {
      const m = buscar(d.id)
      if (!m) throw new Error('No existe ese movimiento')
      let aplicados = 0
      if (d.regla && d.categoria) {
        for (const x of db.movimientos) if (x !== m && x.contraparte === m.contraparte) { x.categoria = d.categoria; if (d.tipo) x.tipo = d.tipo; aplicados++ }
      }
      for (const k of ['tipo', 'categoria', 'nota']) if (d[k] != null) m[k] = d[k]
      if (m.origen === 'manual') for (const k of ['monto', 'contraparte', 'fecha']) if (d[k] != null) m[k] = k === 'monto' ? Number(d[k]) : d[k]
      return { ok: true, aplicados }
    }
    case 'eliminar': db.movimientos = db.movimientos.filter((m) => m.id !== d.id); return { ok: true }
    case 'revisar': {
      const r = db.revisar.find((x) => x.gmail_id === d.gmail_id)
      if (!r) throw new Error('Ya no está pendiente')
      db.revisar = db.revisar.filter((x) => x !== r)
      if (d.decision === 'registrar') db.movimientos.push({ id: 'D' + Date.now(), fecha: r.fecha, banco: r.banco, producto: 'Cuenta', moneda: 'CLP', origen: 'correo', categoria: 'Otros', cuotas: '', detalle: '', nota: '', tipo: r.tipo, monto: r.monto, contraparte: r.contraparte, ...d.mov })
      return { ok: true, borrado: d.decision === 'registrar' || d.borrar === true }
    }
    case 'presupuesto': {
      db.presupuestos = db.presupuestos.filter((p) => p.categoria !== d.categoria)
      if (Number(d.monto) > 0) db.presupuestos.push({ categoria: d.categoria, monto_mensual: Number(d.monto) })
      return { ok: true }
    }
    case 'sincronizar': return { ok: true, resumen: { registrados: 0, revisar: 0, duplicados: 0, borrados: 0, completa: true }, estado: db.estado }
    default: throw new Error('Acción no válida')
  }
}
