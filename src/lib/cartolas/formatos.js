/* Los formatos de cartola y estado de cuenta que la página sabe leer.

   Cada uno se escribió contra un PDF real (septiembre de 2026, carpeta local
   `cartolas/`, ignorada por git) y se prueba con trozos sintéticos que imitan
   su forma (tests/cartolas.test.mjs). Un formato:

   - `es(texto)`: ¿es este? (sobre el texto normalizado de todas las páginas)
   - `leer(paginas, texto)`: { banco, producto, periodo, filas, totales }

   Las filas salen en una forma común:
   - cuenta: { fecha, desc, cargo, abono, saldo }
   - tarjeta: { fecha, desc, cargo (lo que se cobra este mes, negativo si es
     un pago), monto (el de la operación completa), cuota ('k/n'), seccion }

   `totales` son los que la misma cartola declara. `cuadre()` los compara con
   la suma de las filas leídas: si no calzan, se leyó mal y la página lo dice
   antes de agregar nada. */
import { norm, monto, fecha, filas, lineas, utiles, textoPaginas } from './tabla.js'

export class ErrorCartola extends Error {}

const montosDe = (l) => l.items.map((i) => monto(i.s)).filter((n) => n != null)

/* Los montos de la línea que viene justo debajo de la que calza `re`. */
function bajoDe(paginas, re) {
  for (const p of paginas) {
    const ls = lineas(utiles(p))
    const i = ls.findIndex((l) => re.test(norm(l.texto)))
    if (i !== -1 && ls[i + 1]) return montosDe(ls[i + 1])
  }
  return []
}

/* El último monto de la línea que calza `re` («1. Total Operaciones (B) $-334.673»). */
function alFinalDe(paginas, re) {
  for (const p of paginas) {
    for (const l of lineas(utiles(p))) {
      if (!re.test(norm(l.texto))) continue
      const ult = l.texto.trim().split(/\s+/).pop().replace(/^\(?[a-z]\)?/i, '')
      const n = monto(ult)
      if (n != null) return n
    }
  }
  return null
}

function periodo(texto) {
  const f = /\d{2}[/-]\d{2}[/-]\d{4}/.source
  const m = new RegExp(`periodo facturado (${f}) (${f})`).exec(texto)
    || new RegExp(`desde (${f}) (?:a|hasta) (${f})`).exec(texto)
    || new RegExp(`desde (${f})[\\s\\S]*?hasta (${f})`).exec(texto)
  return m ? { desde: fecha(m[1]), hasta: fecha(m[2]) } : { desde: '', hasta: '' }
}

const num = (s) => (s == null ? null : monto(String(s).replace(/\s+/g, '')))

/* ---------- cuentas ---------- */

function filasCuenta(paginas, defs, saltar) {
  return filas(paginas, { defs, saltar }).map((f) => ({
    fecha: f.fecha,
    desc: f.desc,
    cargo: Math.abs(num(f.celdas.cargo) || 0),
    abono: Math.abs(num(f.celdas.abono) || 0),
    saldo: num(f.celdas.saldo),
  }))
}

const MACH_CUENTA = {
  id: 'mach-cuenta',
  es: (t) => /cartola cuenta machbank/.test(t),
  leer(paginas, texto) {
    const defs = [
      { k: 'desc', re: /^descripcion$/ }, { k: 'fecha', re: /^fecha operacion$/ }, { k: 'cambio', re: /^cambio$/ },
      { k: 'moneda', re: /^moneda$/ }, { k: 'cargo', re: /^egreso$/ }, { k: 'abono', re: /^ingreso$/ }, { k: 'saldo', re: /^saldo$/ },
    ]
    const [inicial, abonos, cargos, final] = bajoDe(paginas, /total ingresos del periodo/)
    return {
      banco: 'MACH', producto: 'Cuenta', periodo: periodo(texto),
      filas: filasCuenta(paginas, defs, /^(informacion general|te recomendamos|cartola n)/),
      totales: { inicial, abonos, cargos, final },
    }
  },
}

/* Copec Pay no escribe su nombre en la cartola (va en el logo): se reconoce
   por la plantilla y por «Ganancia Copec Pay», que sale casi todos los días. */
const COPECPAY_CUENTA = {
  id: 'copecpay-cuenta',
  es: (t) => /cartola mensual de movimientos/.test(t) && /periodo cartola/.test(t),
  leer(paginas, texto) {
    const defs = [
      { k: 'desc', re: /^descripcion$/ }, { k: 'fecha', re: /^fecha$/ }, { k: 'cargo', re: /^cargos$/ },
      { k: 'abono', re: /^abonos$/ }, { k: 'saldo', re: /^saldo$/ },
    ]
    const [inicial] = bajoDe(paginas, /^saldo inicial$/)
    const [cargos, abonos, final] = bajoDe(paginas, /total cargos total abonos saldo final/)
    return {
      banco: /copec/.test(texto) ? 'Copec Pay' : '', producto: 'Cuenta', periodo: periodo(texto),
      filas: filasCuenta(paginas, defs, /^(\d+ de \d+|los movimientos incluidos|informese)/),
      totales: { inicial, abonos, cargos, final },
    }
  },
}

/* ---------- tarjetas de crédito ----------
   Los estados de cuenta siguen el formato de la CMF: «1. Total operaciones»
   (B: pagos y compras, por lo que se cobra este mes) y «3. Cargos,
   comisiones, impuestos y abonos» (D). */

const seccionTarjeta = (t) => {
  if (/^1\s*\.\s*total operaciones/.test(t)) return 'B'
  if (/^2\s*\.\s*productos o servicios/.test(t)) return 'C'
  if (/^3\s*\.\s*cargos, comisiones/.test(t)) return 'D'
  if (/^4\s*\.\s*informacion compras/.test(t)) return null
  return undefined
}
const SALTAR_TARJETA = /^(\d\s*\.\s*|total |infor[mn]ese|quienes se encuentran|cmf, en|\d+ de \d+$|ii?i?\.|iv\.)/

const esPago = (desc) => /pago de tarjeta|monto cancelado|^pago\b/.test(norm(desc))

function filasTarjeta(paginas, defs, ancla, modo) {
  return filas(paginas, { defs, ancla, modo, saltar: SALTAR_TARJETA, seccion: seccionTarjeta })
    .filter((f) => f.seccion === 'B' || f.seccion === 'D')
    .map((f) => {
      const op = num(f.celdas.monto) ?? 0
      let mes = num(f.celdas.valor) ?? op
      // MACH escribe el pago en positivo; en el total B resta igual.
      if (esPago(f.desc) && mes > 0) mes = -mes
      const cuota = /^(\d{2})\/(\d{2})$/.exec(String(f.celdas.cuota || '').trim())
      return { fecha: f.fecha, desc: f.desc, cargo: mes, monto: Math.abs(op), cuota: cuota ? `${+cuota[1]}/${+cuota[2]}` : '', seccion: f.seccion }
    })
}

const TENPO_TARJETA = {
  id: 'tenpo-tarjeta',
  es: (t) => /estado de cuenta de tarjeta de credito/.test(t) && /tenpo/.test(t),
  leer(paginas, texto) {
    const defs = [
      { k: 'desc', re: /^descripcion operacion o cobro$/ }, { k: 'lugar', re: /^lugar$/ }, { k: 'fecha', re: /^fecha$/ },
      { k: 'tipo', re: /^tipo de$/ }, { k: 'monto', re: /^monto operacion o$/ }, { k: 'total', re: /^monto total a$/ },
      { k: 'cuota', re: /^numero de$/ }, { k: 'valor', re: /^valor cuota$/ },
    ]
    return {
      banco: 'Tenpo', producto: 'Tarjeta de crédito', periodo: periodo(texto),
      filas: filasTarjeta(paginas, defs, 'desc'),
      totales: { B: alFinalDe(paginas, /^1\s*\.\s*total operaciones/), D: alFinalDe(paginas, /^3\s*\.\s*cargos, comisiones/) },
    }
  },
}

/* MACH no escribe su nombre en el estado de cuenta (va en el logo): se
   reconoce por su columna «Código referencia». */
const MACH_TARJETA = {
  id: 'mach-tarjeta',
  es: (t) => /estado de cuenta nacional de tarjeta de credito/.test(t) && /codigo/.test(t) && /referencia/.test(t),
  leer(paginas, texto) {
    const defs = [
      { k: 'desc', re: /^descripcion operacion o cobro$/ }, { k: 'lugar', re: /^lugar de$/ }, { k: 'fecha', re: /^fecha$/ },
      { k: 'codigo', re: /^codigo$/ }, { k: 'monto', re: /^monto$/ }, { k: 'total', re: /^monto total$/ },
      { k: 'cuota', re: /^n°$/ }, { k: 'valor', re: /^valor cuota$/ },
    ]
    return {
      banco: 'MACH', producto: 'Tarjeta de crédito', periodo: periodo(texto),
      filas: filasTarjeta(paginas, defs, 'desc', 'tramo'),
      totales: { B: alFinalDe(paginas, /^1\s*\.\s*total operaciones/), D: alFinalDe(paginas, /^3\s*\.\s*cargos, comisiones/) },
    }
  },
}

// Se reconocen para decir qué son, pero no traen movimientos de una cuenta.
const NO_IMPORTABLES = [
  { re: /alpaca|monthly statement/, msg: 'Es el estado de cuenta de tus acciones (Fintual / Alpaca). Sus operaciones ya llegan por correo a Inversiones.' },
  { re: /fondos mutuos/, msg: 'Es una cartola de fondos mutuos: todavía no se importa.' },
]

export const FORMATOS = [MACH_CUENTA, COPECPAY_CUENTA, TENPO_TARJETA, MACH_TARJETA]

/* El cuadre: lo que la cartola dice de sí misma contra lo que se leyó. */
export function cuadre(c) {
  const t = c.totales
  const items = []
  const suma = (k) => c.filas.reduce((s, f) => s + (f[k] || 0), 0)
  if (c.producto === 'Cuenta') {
    items.push({ que: 'Total abonos', cartola: t.abonos, leido: suma('abono') })
    items.push({ que: 'Total cargos', cartola: t.cargos, leido: suma('cargo') })
    if (t.inicial != null && t.final != null) {
      // El saldo fila a fila: si una fila cayó en la columna equivocada, se ve aquí.
      let s = t.inicial
      let malas = 0
      for (const f of c.filas) {
        s += f.abono - f.cargo
        if (f.saldo != null && f.saldo !== s) { malas++; s = f.saldo }
      }
      items.push({ que: 'Saldo final', cartola: t.final, leido: t.inicial + suma('abono') - suma('cargo') })
      items.push({ que: 'Filas con saldo que no calza', cartola: 0, leido: malas })
    }
  } else {
    const de = (s) => c.filas.filter((f) => f.seccion === s).reduce((a, f) => a + f.cargo, 0)
    items.push({ que: 'Total operaciones del mes (B)', cartola: t.B, leido: de('B') })
    items.push({ que: 'Cargos, comisiones e impuestos (D)', cartola: t.D, leido: de('D') })
  }
  const validos = items.filter((i) => i.cartola != null)
  return { ok: validos.length > 0 && validos.every((i) => i.cartola === i.leido), items }
}

/* paginas: [[{ s, x, y, w }]] → la cartola leída, con su cuadre. */
export function leerCartola(paginas) {
  const texto = norm(textoPaginas(paginas))
  const f = FORMATOS.find((x) => x.es(texto))
  if (!f) {
    const otro = NO_IMPORTABLES.find((x) => x.re.test(texto))
    throw new ErrorCartola(otro ? otro.msg : 'No reconozco esta cartola. Por ahora leo MACH (cuenta y tarjeta), Copec Pay y la tarjeta de Tenpo.')
  }
  const c = { formato: f.id, ...f.leer(paginas, texto) }
  if (!c.filas.length) throw new ErrorCartola('La cartola no trae movimientos (o cambió su formato).')
  return { ...c, cuadre: cuadre(c) }
}
