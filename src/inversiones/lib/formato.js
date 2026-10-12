/* Formatos es-CL. Los Intl se crean una vez: construirlos en cada celda de
   una tabla de cien filas se nota. */

const usd = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const usdCompacto = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
const num = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })
const acciones = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
const pct = new Intl.NumberFormat('es-CL', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fecha = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const fechaHora = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const mes = new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'UTC' })

const vacio = '—'
const ok = (v) => typeof v === 'number' && isFinite(v)

// Signo explícito con menos tipográfico: un "-" pegado al número se pierde.
const signo = (v, s) => (v > 0 ? `+${s}` : v < 0 ? `−${s.replace('-', '')}` : s)

export const fUsd = (v) => (ok(v) ? usd.format(v) : vacio)
export const fUsdSigno = (v) => (ok(v) ? signo(Math.round(v * 100), usd.format(v)) : vacio)
export const fUsdCompacto = (v) => (ok(v) ? usdCompacto.format(v) : vacio)
export const fClp = (v) => (ok(v) ? clp.format(v) : vacio)
export const fClpSigno = (v) => (ok(v) ? signo(Math.round(v), clp.format(v)) : vacio)
export const fNum = (v) => (ok(v) ? num.format(v) : vacio)
export const fAcciones = (v) => (ok(v) ? acciones.format(v) : vacio)
export const fPct = (v) => (ok(v) ? pct.format(v) : vacio)
export const fPctSigno = (v) => (ok(v) ? signo(Math.round(v * 1000), pct.format(v)) : vacio)

// Las fechas del contrato son locales de la hoja (sin huso): se leen como UTC
// para que el navegador no las corra un día.
export const fFecha = (iso) => (iso ? fecha.format(new Date(iso.slice(0, 10) + 'T00:00:00Z')) : vacio)
export const fFechaHora = (iso) => (iso ? fechaHora.format(new Date(iso + 'Z')) : vacio)
export const fMes = (aaaamm) => {
  const d = new Date(aaaamm + '-01T00:00:00Z')
  return `${mes.format(d).replace('.', '')} ${String(d.getUTCFullYear()).slice(2)}`
}

/* Clase de dirección para cifras con signo: el color acompaña al signo, no lo
   reemplaza. */
export const dir = (v) => (!ok(v) || Math.abs(v) < 0.005 ? 'neutro' : v > 0 ? 'sube' : 'baja')
