/* Leer una tabla de un PDF a partir de los trozos de texto que entrega pdf.js.

   Un PDF no tiene filas ni columnas: tiene trozos de texto con su posición
   ({ s, x, y, w }: texto, izquierda, base y ancho, con la y creciendo hacia
   arriba). Aquí se reconstruye la tabla así:

   1. Líneas: los trozos con casi la misma y.
   2. Columnas: los títulos de la cabecera de cada página (una cartola puede
      correr las columnas de una página a otra). Un trozo va a la columna cuyo
      título le queda más cerca por la izquierda, el centro o la derecha: así
      sirve tanto para montos alineados a la izquierda (MACH) como a la
      derecha (Copec Pay).
   3. Filas: una línea con fecha en la columna de fecha abre una fila. Lo que
      viene sin fecha y cae en la columna de descripción es la continuación de
      una descripción larga: se pega a la fila que tenga a menos de media
      línea (Tenpo escribe la descripción centrada, una parte arriba y otra
      abajo de la fila) o, si no, a la fila de arriba (MACH la sigue abajo).

   Todo es JavaScript plano: lo usa la página (con pdf.js en el navegador) y
   lo prueba Node con trozos sintéticos (tests/cartolas.test.mjs). */

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/* '$1.090.201', '1.090.201', '$-100.000', '-320.298', '$ 771.265', '0' →
   entero con signo. null si el texto no es un monto en pesos. */
export function monto(s) {
  const m = /^(-)?\$?(-)?(\d{1,3}(?:\.\d{3})+|\d+)$/.exec(String(s ?? '').replace(/\s+/g, ''))
  if (!m) return null
  const n = Number(m[3].replace(/\./g, ''))
  return m[1] || m[2] ? -n : n
}

/* '01/09/2026' o '01-09-2026' → '2026-09-01'. '' si no es fecha. */
export function fecha(s) {
  const m = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(String(s ?? '').trim())
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return ''
  return `${m[3]}-${m[2]}-${m[1]}`
}

// pdf.js deja «null» como texto en las celdas vacías de algunas cartolas (Tenpo).
const RUIDO = new Set(['', 'null', '$'])
export const utiles = (items) => items.filter((i) => !RUIDO.has(String(i.s).trim()))

/* Agrupa los trozos de una página en líneas, de arriba abajo y de izquierda a
   derecha. Dos trozos van en la misma línea si su y difiere en menos de 2. */
export function lineas(items) {
  const orden = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const out = []
  for (const it of orden) {
    const ult = out[out.length - 1]
    if (ult && Math.abs(ult.y - it.y) < 2) ult.items.push(it)
    else out.push({ y: it.y, items: [it] })
  }
  for (const l of out) {
    l.items.sort((a, b) => a.x - b.x)
    l.texto = l.items.map((i) => i.s).join(' ')
  }
  return out
}

export const textoPaginas = (paginas) => paginas.map((p) => lineas(utiles(p)).map((l) => l.texto).join('\n')).join('\n')

/* Busca la cabecera de la tabla en una página. `defs` es [{ k, re }]: cada
   columna con la expresión que calza su título (sobre el texto normalizado).
   La cabecera puede ocupar varias líneas: se buscan los títulos en una franja
   de ±14 alrededor del primero (`ancla`). Devuelve { columnas, abajo } o null
   si en la página no están todas las columnas. */
export function cabecera(items, defs, ancla = defs[0].k) {
  const def = defs.find((d) => d.k === ancla)
  const a = items.find((i) => def.re.test(norm(i.s)))
  if (!a) return null
  const franja = items.filter((i) => Math.abs(i.y - a.y) <= 14)
  const columnas = []
  for (const d of defs) {
    const t = franja.find((i) => d.re.test(norm(i.s)))
    if (!t) return null
    columnas.push({ k: d.k, x: t.x, w: t.w || 0 })
  }
  return { columnas, abajo: Math.min(...franja.map((i) => i.y)) }
}

/* La columna de un trozo.
   - 'cercano' (por defecto): la de distancia mínima entre bordes izquierdos,
     centros o bordes derechos.
   - 'tramo': la última cuyo título empieza antes que el trozo. Para tablas
     con montos alineados a la derecha DENTRO de su columna (la tarjeta MACH):
     un monto corto queda lejos de su título y cerca del de al lado. */
export function columnaDe(it, columnas, modo = 'cercano') {
  if (modo === 'tramo') {
    const antes = columnas.filter((c) => c.x - 4 <= it.x).sort((a, b) => b.x - a.x)[0]
    return (antes || columnas.reduce((a, b) => (a.x < b.x ? a : b))).k
  }
  let mejor = null
  let dist = Infinity
  const w = it.w || 0
  for (const c of columnas) {
    const d = Math.min(Math.abs(it.x - c.x), Math.abs(it.x + w / 2 - (c.x + c.w / 2)), Math.abs(it.x + w - (c.x + c.w)))
    if (d < dist) { dist = d; mejor = c.k }
  }
  return mejor
}

/* Las filas de la tabla en todas las páginas.

   opciones:
   - defs, ancla: columnas (ver `cabecera`).
   - modo: cómo se asigna la columna (ver `columnaDe`).
   - fecha: la columna que abre una fila (por defecto 'fecha').
   - desc: la columna de la descripción (por defecto 'desc').
   - saltar: expresión de líneas que no son filas ni continuación (totales,
     pies de página); se mira sobre el texto normalizado de la línea.
   - seccion: (textoNormalizado) → nombre de sección o undefined; las filas
     llevan la última sección vista (los estados de cuenta separan compras de
     impuestos y comisiones).

   Cada fila: { fecha, desc, celdas: { columna: 'texto' }, seccion, pagina }. */
export function filas(paginas, { defs, ancla, modo, fecha: colFecha = 'fecha', desc = 'desc', saltar = /^$/, seccion = () => undefined }) {
  const out = []
  let columnas = null
  let sec
  paginas.forEach((pag, n) => {
    const items = utiles(pag)
    const cab = cabecera(items, defs, ancla)
    // Sin cabecera la página sigue la tabla de la anterior (Tenpo pone los
    // impuestos en otra página sin repetir los títulos).
    if (cab) columnas = cab.columnas
    if (!columnas) return
    const bajo = cab ? items.filter((i) => i.y < cab.abajo - 1) : items
    const anclas = []
    const sueltas = []
    for (const l of lineas(bajo)) {
      const t = norm(l.texto)
      const s = seccion(t)
      if (s !== undefined) sec = s
      if (saltar.test(t)) continue
      const celdas = {}
      for (const it of l.items) {
        const k = columnaDe(it, columnas, modo)
        celdas[k] = celdas[k] ? `${celdas[k]} ${it.s}` : String(it.s)
      }
      const f = fecha(celdas[colFecha])
      if (f) {
        const fila = { fecha: f, desc: [], celdas, seccion: sec, pagina: n + 1, y: l.y }
        if (celdas[desc]) fila.desc.push({ y: l.y, s: celdas[desc] })
        anclas.push(fila)
      } else if (celdas[desc] && Object.keys(celdas).length === 1) {
        sueltas.push({ y: l.y, s: celdas[desc] })
      }
    }
    for (const s of sueltas) {
      const cerca = anclas.filter((f) => Math.abs(f.y - s.y) <= 6).sort((a, b) => Math.abs(a.y - s.y) - Math.abs(b.y - s.y))[0]
      const arriba = anclas.filter((f) => f.y > s.y).sort((a, b) => a.y - b.y)[0]
      const dueña = cerca || arriba
      if (dueña) dueña.desc.push(s)
    }
    for (const f of anclas) {
      f.desc = f.desc.sort((a, b) => b.y - a.y).map((d) => d.s).join(' ').replace(/\s+/g, ' ').trim()
      delete f.y
      out.push(f)
    }
  })
  return out
}
