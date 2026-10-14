/* Cruzar la cartola con lo que ya está registrado (por correo, notificación,
   a mano o una cartola anterior).

   Un movimiento de la cartola ya está si hay uno del mismo banco y producto
   (cuenta o tarjeta), con el mismo monto, a 3 días o menos y en un sentido
   compatible: un gasto no calza con un abono. Una `interna` de la base no
   dice hacia dónde fue, así que calza con los dos sentidos. Cada registrado
   se usa una sola vez y se prefiere el más cercano en fecha y del mismo tipo.

   Devuelve los candidatos con `estado`:
   - 'registrado' (y `registrado`: el movimiento que ya estaba),
   - 'nuevo' (se ofrece marcado),
   - 'anterior' (una compra de antes del periodo: se ofrece sin marcar),
   - 'informativo' (no se agrega: el pago visto desde la tarjeta);
   y `soloApp`: lo registrado de ese banco en el periodo que la cartola no
   trae (un duplicado, o un movimiento anotado en otro banco). */
const SALE = new Set(['gasto', 'inversion', 'pago_tarjeta'])
const ENTRA = new Set(['ingreso', 'rescate'])
const grupo = (p) => (p === 'Tarjeta de crédito' ? 'tarjeta' : 'cuenta')
const dia = (f) => String(f || '').slice(0, 10)
const dias = (a, b) => Math.abs(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 864e5

export const VENTANA_DIAS = 3

export function cruzar(cartola, candidatos, existentes) {
  const pool = existentes.filter((m) => m.banco === cartola.banco && grupo(m.producto) === grupo(cartola.producto))
  const pares = []
  candidatos.forEach((c, i) => {
    pool.forEach((m, j) => {
      if (Number(m.monto) !== c.monto) return
      const d = dias(dia(m.fecha), c.fecha)
      if (d > VENTANA_DIAS) return
      if ((SALE.has(m.tipo) && c.sentido !== 'sale') || (ENTRA.has(m.tipo) && c.sentido !== 'entra')) return
      pares.push({ i, j, puntaje: d * 10 + (m.tipo === c.tipo ? 0 : 3) })
    })
  })
  pares.sort((a, b) => a.puntaje - b.puntaje || a.i - b.i)
  const deCand = new Map()
  const usados = new Set()
  for (const p of pares) {
    if (deCand.has(p.i) || usados.has(p.j)) continue
    deCand.set(p.i, pool[p.j])
    usados.add(p.j)
  }
  const movs = candidatos.map((c, i) => (deCand.has(i) ? { ...c, estado: 'registrado', registrado: deCand.get(i) } : c))
  const { desde, hasta } = cartola.periodo
  const soloApp = pool.filter((m, j) => !usados.has(j) && (!desde || dia(m.fecha) >= desde) && (!hasta || dia(m.fecha) <= hasta))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  return { movs, soloApp }
}
