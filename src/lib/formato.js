const PESOS = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

export const clp = (n) => PESOS.format(Math.round(Number(n) || 0))

// Para ejes y cifras chicas: $1,2 M · $350 mil · $900
export function compacto(n) {
  const v = Math.abs(Number(n) || 0)
  const s = n < 0 ? '−' : ''
  if (v >= 1e6) return `${s}$${(v / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M`
  if (v >= 1e3) return `${s}$${Math.round(v / 1e3).toLocaleString('es-CL')} mil`
  return `${s}$${Math.round(v)}`
}

export const porciento = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`)

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// '2026-09-18 00:57' → 'vie 18 sep · 00:57'
export function fechaCorta(f) {
  const s = String(f || '')
  const [a, m, d] = s.slice(0, 10).split('-').map(Number)
  if (!a) return s
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
  const hora = s.slice(11, 16)
  return `${dia} ${d} ${MESES[m - 1]}${hora && hora !== '00:00' ? ' · ' + hora : ''}`
}

/* Hacia dónde va la plata de cada tipo. Lo que no está (interna,
   pago_tarjeta) no suma, y por eso no lleva signo ni color. */
export const SENTIDO = { ingreso: 'mas', rescate: 'mas', gasto: 'menos', inversion: 'menos' }

// +$12.000 · −$8.500 · $3.000 (sin sentido, el número tal cual). El signo va aparte del número: Intl pone un
// guion corto para los negativos, y aquí el signo lo decide el tipo.
export function conSigno(n, sentido) {
  if (!sentido) return clp(n)
  const v = clp(Math.abs(Number(n) || 0))
  return sentido === 'mas' ? `+${v}` : `−${v}`
}

// El ahorro decide su signo por el valor, no por un tipo.
export const sentidoDe = (n) => (n > 0 ? 'mas' : n < 0 ? 'menos' : '')
