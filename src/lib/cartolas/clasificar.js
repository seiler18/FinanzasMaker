/* De las filas de una cartola a movimientos, con los mismos criterios que
   los lectores de correo (backend/Lectores.gs):

   - entre tus cuentas (`titular`), Ahorro 24/7 y cargar una billetera con
     tarjeta → `interna`, no suma;
   - el pago de la tarjeta → `pago_tarjeta`; en el estado de cuenta de la
     tarjeta es solo informativo: el pago se registra desde la cuenta que paga;
   - vendedores de Binance P2P (`vendedores_cripto`) → «Compra de cripto»;
   - lo demás, por las reglas del dueño (`categorizar`, gemela de categorizar_).

   Lo que solo trae la cartola:
   - la rentabilidad diaria de una cuenta (Copec Pay, «Ganancia») se junta en
     un movimiento por mes, para no llenar la lista de abonos de $300;
   - el impuesto de timbres y los intereses de la tarjeta, como gastos;
   - una «Devolución» toma el tipo de la transferencia que devuelve.

   Cada movimiento lleva `clave`: banco, producto, fecha, monto, descripción y
   cuántas veces se repitió esa combinación. src/lib/datos.js arma con ella un
   id fijo, así subir la misma cartola dos veces no duplica nada. */
import { norm } from './tabla.js'
import { categorizar, clave as claveTexto } from '../reglas.js'

// Gemela de esPropio_ (Lectores.gs): el nombre contiene todas las palabras del titular.
export function esPropio(nombre, titular) {
  const n = claveTexto(nombre)
  const partes = norm(titular).split(/[^a-z0-9]+/).filter(Boolean)
  return partes.length > 0 && n.length > 0 && partes.every((p) => n.includes(p))
}

// «HIP LIDER PUERTO MONTT CH (0,00%)» → «HIP LIDER PUERTO MONTT».
export const comercio = (s) => String(s || '').replace(/\s*\(\d+[.,]\d+\s*%\)\s*$/, '').replace(/\s+(CH|CL|CHL|CHILE)$/i, '').replace(/\s+/g, ' ').trim()

const dias = (a, b) => (Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 864e5

function deCuenta(f, banco, titular) {
  const d = norm(f.desc)
  const sale = f.cargo > 0
  const b = { fecha: f.fecha, desc: f.desc, monto: sale ? f.cargo : f.abono, sentido: sale ? 'sale' : 'entra' }
  if (/ahorro 24\/7/.test(d)) return { ...b, tipo: 'interna', contraparte: 'Ahorro 24/7', categoria: 'Entre mis cuentas' }
  if (/pago de tarjeta/.test(d)) return { ...b, tipo: 'pago_tarjeta', contraparte: `Tarjeta de crédito ${banco}`, categoria: 'Pago de tarjeta' }
  if (/^giro\b/.test(d)) return { ...b, tipo: 'gasto', contraparte: 'Giro en cajero', categoria: 'Efectivo' }
  if (/cashback/.test(d)) return { ...b, tipo: 'ingreso', contraparte: `Cashback ${banco}`, categoria: 'Cashback' }
  if (/^ganancia\b|^intereses? (ganados|abonados)|^rentabilidad/.test(d)) return { ...b, tipo: 'ingreso', contraparte: `Rentabilidad ${banco}`, categoria: 'Rentabilidad', agrupar: true }
  if (/^carga con tarjeta/.test(d)) return { ...b, tipo: 'interna', contraparte: 'Carga de saldo', categoria: 'Carga de billetera' }
  if (/^devolucion\b/.test(d)) return { ...b, tipo: 'ingreso', contraparte: 'Devolución', categoria: 'Devoluciones', devolucion: true }
  const t = /^(?:transferencia|retiro|traspaso)\s+(?:a|de|desde|hacia)\s+(.+)$/i.exec(f.desc)
  if (t) {
    const quien = t[1].trim()
    return { ...b, tipo: esPropio(quien, titular) ? 'interna' : sale ? 'gasto' : 'ingreso', contraparte: quien }
  }
  return { ...b, tipo: sale ? 'gasto' : 'ingreso', contraparte: f.desc }
}

function deTarjeta(f, banco, desde) {
  const d = norm(f.desc)
  const b = { fecha: f.fecha, desc: f.desc, sentido: 'sale' }
  if (f.cargo < 0 || /pago de tarjeta|monto cancelado|^pago\b/.test(d)) {
    return { ...b, sentido: 'entra', monto: Math.abs(f.cargo), tipo: 'pago_tarjeta', contraparte: `Tarjeta de crédito ${banco}`, categoria: 'Pago de tarjeta',
      estado: 'informativo', motivo: 'El pago se registra desde la cuenta que paga' }
  }
  if (!f.cargo && !f.monto) return null
  if (/impuesto/.test(d)) return { ...b, monto: f.cargo, tipo: 'gasto', contraparte: 'Impuesto de timbres', categoria: 'Impuestos', cuotas: 1 }
  if (/interes/.test(d)) return { ...b, monto: f.cargo, tipo: 'gasto', contraparte: `Intereses tarjeta ${banco}`, categoria: 'Intereses y comisiones', cuotas: 1 }
  if (/comision|mantencion|^cobro de/.test(d)) return f.cargo ? { ...b, monto: f.cargo, tipo: 'gasto', contraparte: `Comisión tarjeta ${banco}`, categoria: 'Intereses y comisiones', cuotas: 1 } : null
  const [k, n] = String(f.cuota || '').split('/').map(Number)
  const mov = { ...b, monto: f.monto || f.cargo, tipo: 'gasto', contraparte: comercio(f.desc), cuotas: n > 0 ? n : 1 }
  // Una cuota de una compra de antes del periodo: la compra entró el día en
  // que se hizo, con su monto completo. Se ofrece, pero sin marcar.
  if (desde && dias(desde, f.fecha) > 3) Object.assign(mov, { estado: 'anterior', motivo: `Compra de antes del periodo${n > 1 ? ` (cuota ${k} de ${n})` : ''}` })
  return mov
}

/* Binance P2P: la plata pasa a tu cuenta de Binance (gemela de p2p_). */
function p2p(m, vendedores) {
  const lista = String(vendedores || '').split(',').map(claveTexto).filter(Boolean)
  if (!lista.length || (m.tipo !== 'gasto' && m.tipo !== 'ingreso')) return
  const k = claveTexto(m.contraparte)
  if (!k || !lista.some((v) => k.includes(v))) return
  m.categoria = m.tipo === 'gasto' ? 'Compra de cripto' : 'Venta de cripto'
  m.tipo = 'interna'
}

/* La rentabilidad diaria, un movimiento por mes y concepto. */
function agrupar(movs) {
  const out = []
  const grupos = new Map()
  for (const m of movs) {
    if (!m.agrupar) { out.push(m); continue }
    const k = `${m.contraparte}|${m.fecha.slice(0, 7)}`
    if (!grupos.has(k)) { grupos.set(k, { ...m, monto: 0, n: 0, primera: m.fecha }); out.push(grupos.get(k)) }
    const g = grupos.get(k)
    g.monto += m.monto
    g.n++
    g.fecha = m.fecha > g.fecha ? m.fecha : g.fecha
  }
  for (const g of grupos.values()) {
    g.desc = `${g.contraparte}: ${g.n} abono${g.n === 1 ? '' : 's'} del ${g.primera.slice(8)} al ${g.fecha.slice(8)}`
    delete g.n; delete g.primera; delete g.agrupar
  }
  return out
}

/* cartola (de leerCartola) + config y reglas del dueño → movimientos candidatos. */
export function clasificar(cartola, { config = {}, reglas = [] } = {}) {
  const { banco, producto, periodo } = cartola
  const titular = config.titular || ''
  const tarjeta = producto === 'Tarjeta de crédito'
  let movs = cartola.filas
    .map((f) => (tarjeta ? deTarjeta(f, banco, periodo.desde) : deCuenta(f, banco, titular)))
    .filter((m) => m && m.monto > 0)

  // La devolución toma el tipo de la transferencia que devuelve: si esa era
  // entre tus cuentas, la devolución también.
  const usadas = new Set()
  movs.forEach((m, i) => {
    if (!m.devolucion) return
    for (let j = i - 1; j >= 0; j--) {
      const o = movs[j]
      if (o.sentido === 'sale' && o.monto === m.monto && !usadas.has(j)) {
        usadas.add(j)
        if (o.tipo === 'interna') Object.assign(m, { tipo: 'interna', categoria: 'Entre mis cuentas' })
        break
      }
    }
    delete m.devolucion
  })

  movs = agrupar(movs)
  const vistas = new Map()
  // El mes de la cartola: el del día antes del cierre (MACH cierra el 01 del
  // mes siguiente: «Desde 01/09 a 01/10» es septiembre).
  const antes = periodo.hasta ? new Date(Date.UTC(+periodo.hasta.slice(0, 4), +periodo.hasta.slice(5, 7) - 1, +periodo.hasta.slice(8, 10) - 1)) : null
  const mes = antes ? antes.toISOString().slice(0, 7) : movs[0]?.fecha.slice(0, 7)
  for (const m of movs) {
    m.banco = banco
    m.producto = producto
    m.estado = m.estado || 'nuevo'
    if (!tarjeta) m.cuotas = null
    p2p(m, config.vendedores_cripto)
    if (!m.categoria) categorizar(m, reglas)
    m.detalle = `Cartola ${banco}${tarjeta ? ' tarjeta' : ''} ${mes}: ${m.desc}`.slice(0, 200)
    const base = `${banco}|${producto}|${m.fecha}|${m.monto}|${m.desc}`
    const n = (vistas.get(base) || 0) + 1
    vistas.set(base, n)
    m.clave = `${base}|${n}`
  }
  return movs
}
