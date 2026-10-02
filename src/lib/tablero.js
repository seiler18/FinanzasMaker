import { esc } from './dom.js'
import { clp, compacto, porciento } from './formato.js'
import { escalaY } from './grafico.js'

/* Gráficos del resumen: área suave, anillo de ahorro, dona de gastos,
   calendario de calor y sparklines. SVG a mano, sin librería.

   Lo mismo que en grafico.js:
   - Los colores salen de clases (tokens.css), nunca literales: así el modo
     oscuro cambia solo.
   - Nada de style="" en el marcado (la CSP lo bloquea); lo dinámico va por
     atributos SVG o por CSSOM (setProperty).
   - Cada gráfico tiene su camino con teclado y sus mismos números en la
     tabla «Ver como tabla», así el tooltip nunca es la única vía a un valor.
   - Las animaciones de entrada están en tablero.css y solo corren con
     data-entra (al cambiar de vista), no cada vez que se recargan datos. */

const r1 = (n) => Math.round(n * 10) / 10

/* Curva que pasa por todos los puntos sin pasarse de ellos (monotónica,
   Fritsch–Carlson). Una spline normal «rebota» bajo el cero entre un día sin
   gasto y uno con gasto, y dibujaría plata negativa que nunca existió. */
function trazoSuave(P) {
  const n = P.length
  if (n === 1) return `M${r1(P[0][0])},${r1(P[0][1])}`
  const dx = [], m = []
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0]; m[i] = (P[i + 1][1] - P[i][1]) / dx[i] }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  t[n - 1] = m[n - 2]
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M${r1(P[0][0])},${r1(P[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${r1(P[i][0] + h)},${r1(P[i][1] + t[i] * h)} ${r1(P[i + 1][0] - h)},${r1(P[i + 1][1] - t[i + 1] * h)} ${r1(P[i + 1][0])},${r1(P[i + 1][1])}`
  }
  return d
}

// Tooltip compartido por los gráficos. textContent siempre: los nombres
// pueden venir de un correo.
function tooltip(lienzo) {
  const tip = document.createElement('div')
  tip.className = 'g-tip'
  tip.hidden = true
  lienzo.append(tip)
  return {
    mostrar(titulo, filas, centroX, arriba = 0) {
      tip.replaceChildren()
      const t = document.createElement('strong'); t.textContent = titulo
      tip.append(t)
      for (const [clase, nombre, valor] of filas) {
        const d = document.createElement('div')
        const k = document.createElement('i'); k.className = 'g-linea ' + clase
        const b = document.createElement('b'); b.textContent = valor
        d.append(k, b, document.createTextNode(' ' + nombre))
        tip.append(d)
      }
      tip.hidden = false
      const izq = Math.min(Math.max(0, centroX - tip.offsetWidth / 2), Math.max(0, lienzo.clientWidth - tip.offsetWidth))
      tip.style.setProperty('left', `${izq}px`)
      tip.style.setProperty('top', `${arriba}px`)
    },
    ocultar() { tip.hidden = true },
  }
}

/* ---------- Área: ingresos y gastos ---------- */

const W0 = 720, H = 260, M = { t: 14, r: 12, b: 26, l: 56 }

export function areaTendencia(contenedor, puntos, { alElegir } = {}) {
  const W = Math.max(W0, Math.round(contenedor.clientWidth)) // ver barrasPareadas
  const n = puntos.length
  const max = Math.max(0, ...puntos.map((p) => Math.max(p.ingresos, p.gastos)))
  const { tope, marcas } = escalaY(max)
  const paso = n > 1 ? (W - M.l - M.r) / (n - 1) : 0
  const x = (i) => (n > 1 ? M.l + i * paso : M.l + (W - M.l - M.r) / 2)
  const y = (v) => M.t + (H - M.t - M.b) * (1 - v / tope)
  const base = y(0)
  const cada = n > 16 ? 3 : 1

  const serie = (clave) => {
    const P = puntos.map((p, i) => [x(i), y(p[clave])])
    const linea = trazoSuave(P)
    return { linea, area: `${linea}L${r1(P[n - 1][0])},${r1(base)}L${r1(P[0][0])},${r1(base)}Z` }
  }
  const s1 = serie('ingresos'), s2 = serie('gastos')

  const rejilla = marcas.map((v) => `<line class="g-rejilla" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="g-eje" x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(compacto(v))}</text>`).join('')
  const etiquetas = puntos.map((p, i) => (i % cada === 0 ? `<text class="g-eje" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.etiqueta)}</text>` : '')).join('')

  contenedor.innerHTML = `
    <div class="g-leyenda" aria-hidden="true">
      <span><i class="g-clave g-clave-s1"></i>Ingresos</span>
      <span><i class="g-clave g-clave-s2"></i>Gastos</span>
    </div>
    <div class="g-lienzo">
      <svg viewBox="0 0 ${W} ${H}" class="g-svg a-svg" tabindex="0" role="group" aria-label="Ingresos y gastos. Con las flechas recorres los puntos y con Enter abres el elegido">
        <defs>
          <linearGradient id="a-rel-1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="a-par a-par-s1"/><stop offset="1" class="a-par a-par-fin"/></linearGradient>
          <linearGradient id="a-rel-2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="a-par a-par-s2"/><stop offset="1" class="a-par a-par-fin"/></linearGradient>
        </defs>
        ${rejilla}<line class="g-base" x1="${M.l}" x2="${W - M.r}" y1="${base}" y2="${base}"/>${etiquetas}
        <path class="a-relleno" d="${s1.area}" fill="url(#a-rel-1)"/>
        <path class="a-relleno a-relleno-2" d="${s2.area}" fill="url(#a-rel-2)"/>
        <path class="a-linea a-s1" d="${s1.linea}" pathLength="1"/>
        <path class="a-linea a-s2 a-linea-2" d="${s2.linea}" pathLength="1"/>
        <g class="a-cursor" aria-hidden="true">
          <line class="a-guia" y1="${M.t}" y2="${base}"/>
          <circle class="a-punto a-punto-s1" r="5"/><circle class="a-punto a-punto-s2" r="5"/>
        </g>
        <rect class="a-captura" x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}"/>
      </svg>
    </div>`

  const svg = contenedor.querySelector('svg')
  const lienzo = contenedor.querySelector('.g-lienzo')
  const guia = svg.querySelector('.a-guia')
  const p1 = svg.querySelector('.a-punto-s1'), p2 = svg.querySelector('.a-punto-s2')
  const tip = tooltip(lienzo)
  let actual = -1

  const ir = (i) => {
    actual = Math.max(0, Math.min(n - 1, i))
    const p = puntos[actual]
    guia.setAttribute('x1', x(actual)); guia.setAttribute('x2', x(actual))
    p1.setAttribute('cx', x(actual)); p1.setAttribute('cy', y(p.ingresos))
    p2.setAttribute('cx', x(actual)); p2.setAttribute('cy', y(p.gastos))
    svg.classList.add('a-activo')
    const k = lienzo.clientWidth / W
    tip.mostrar(p.largo, [['g-clave-s1', 'ingresos', clp(p.ingresos)], ['g-clave-s2', 'gastos', clp(p.gastos)]], x(actual) * k)
  }
  const salir = () => { actual = -1; svg.classList.remove('a-activo'); tip.ocultar() }
  const indiceDe = (ev) => {
    const r = svg.getBoundingClientRect()
    return Math.round((((ev.clientX - r.left) / r.width) * W - M.l) / (paso || 1))
  }
  svg.addEventListener('pointermove', (ev) => { const i = indiceDe(ev); if (i !== actual) ir(i) })
  svg.addEventListener('pointerleave', salir)
  svg.addEventListener('blur', salir)
  svg.addEventListener('focus', () => { if (actual < 0) ir(n - 1) })
  svg.addEventListener('click', (ev) => { if (alElegir) alElegir(puntos[Math.max(0, Math.min(n - 1, indiceDe(ev)))]) })
  svg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); ir(actual + 1) }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); ir(actual - 1) }
    else if (ev.key === 'Home') { ev.preventDefault(); ir(0) }
    else if (ev.key === 'End') { ev.preventDefault(); ir(n - 1) }
    else if ((ev.key === 'Enter' || ev.key === ' ') && actual >= 0 && alElegir) { ev.preventDefault(); alElegir(puntos[actual]) }
  })
}

/* ---------- Anillo de ahorro ---------- */

// tasa: 0–1 (o más), null si no hubo ingresos. Pasada del 100 % o negativa
// el arco se recorta: el número del centro es el que dice la verdad.
export function anillo(contenedor, tasa) {
  const sin = tasa == null
  const pct = sin ? 0 : Math.max(0, Math.min(1, tasa)) * 100
  const estado = sin ? 'sin' : tasa < 0 ? 'mal' : tasa < 0.1 ? 'ojo' : 'bien'
  contenedor.innerHTML = `
    <svg viewBox="0 0 120 120" class="an-svg" role="img" aria-label="${sin ? 'Sin ingresos en el periodo' : `Ahorro del ${porciento(tasa)} de lo que entró`}">
      <defs><linearGradient id="an-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="an-par an-par-1"/><stop offset="1" class="an-par an-par-2"/></linearGradient></defs>
      <circle class="an-pista" cx="60" cy="60" r="48" pathLength="100"/>
      <g transform="rotate(-90 60 60)">
        <circle class="an-arco an-${estado}" cx="60" cy="60" r="48" pathLength="100" stroke-dasharray="${r1(pct)} 100" ${estado === 'bien' ? 'stroke="url(#an-grad)"' : ''}/>
      </g>
    </svg>
    <div class="an-centro"><b>${sin ? '—' : esc(porciento(tasa))}</b><small>${sin ? 'sin ingresos' : tasa < 0 ? 'gastaste de más' : 'ahorrado'}</small></div>`
}

/* ---------- Dona de gastos ---------- */

const MAX_SEG = 7

// Clase de color de la categoría i (0 = la mayor). Del octavo lugar en
// adelante todo es «Otros», gris: más tonos no se distinguirían.
export const claseCat = (i) => 'c' + (Math.min(i, MAX_SEG) + 1)

/* filas: [{categoria, monto, n}] ya ordenadas de mayor a menor.
   Devuelve { resaltar(categoria|null) } para enlazar con la lista de al lado. */
export function dona(contenedor, filas, { total, alElegir } = {}) {
  const suma = filas.reduce((s, f) => s + f.monto, 0) || 1
  const segs = filas.slice(0, MAX_SEG).map((f, i) => ({ nombre: f.categoria, monto: f.monto, n: f.n, i, cats: [f.categoria] }))
  if (filas.length > MAX_SEG) {
    const resto = filas.slice(MAX_SEG)
    segs.push({ nombre: 'Otros', monto: resto.reduce((s, f) => s + f.monto, 0), n: resto.reduce((s, f) => s + f.n, 0), i: MAX_SEG, cats: resto.map((f) => f.categoria), otros: true })
  }
  const HUECO = segs.length > 1 ? 0.8 : 0
  let acum = 0
  const arcos = segs.map((s, k) => {
    const largo = (s.monto / suma) * 100
    const trazo = Math.max(0.1, largo - HUECO)
    const a = `<circle class="d-seg d-${claseCat(s.i)}" data-k="${k}" cx="60" cy="60" r="44" pathLength="100" stroke-dasharray="${r1(trazo)} ${r1(100 - trazo)}" stroke-dashoffset="${-r1(acum)}" tabindex="0" role="button" aria-label="${esc(`${s.nombre}: ${clp(s.monto)}, ${Math.round(largo)} % de los gastos`)}"/>`
    acum += largo
    return a
  }).join('')

  contenedor.innerHTML = `
    <svg viewBox="0 0 120 120" class="d-svg" role="group" aria-label="Reparto de los gastos por categoría">
      <circle class="d-pista" cx="60" cy="60" r="44"/>
      <g transform="rotate(-90 60 60)">${arcos}</g>
    </svg>
    <div class="d-centro" aria-live="polite"><small class="d-tit"></small><b class="d-monto"></b><small class="d-sub"></small></div>`

  const tit = contenedor.querySelector('.d-tit'), monto = contenedor.querySelector('.d-monto'), sub = contenedor.querySelector('.d-sub')
  const nodos = [...contenedor.querySelectorAll('.d-seg')]
  const reposo = () => {
    tit.textContent = 'Gastos'; monto.textContent = compacto(total ?? suma)
    sub.textContent = `${filas.length} categoría${filas.length === 1 ? '' : 's'}`
  }
  const resaltarSeg = (k) => {
    nodos.forEach((c, j) => { c.classList.toggle('d-apagado', k != null && j !== k); c.classList.toggle('d-activo', j === k) })
    if (k == null) return reposo()
    const s = segs[k]
    tit.textContent = s.nombre; monto.textContent = compacto(s.monto)
    sub.textContent = `${Math.round((s.monto / suma) * 100)} % · ${s.n} mov.`
  }
  nodos.forEach((c, k) => {
    c.addEventListener('pointerenter', () => resaltarSeg(k))
    c.addEventListener('focus', () => resaltarSeg(k))
    c.addEventListener('blur', () => resaltarSeg(null))
    if (alElegir) {
      c.addEventListener('click', () => alElegir(segs[k]))
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alElegir(segs[k]) } })
    }
  })
  contenedor.querySelector('svg').addEventListener('pointerleave', () => resaltarSeg(null))
  reposo()

  return {
    resaltar(categoria) {
      if (categoria == null) return resaltarSeg(null)
      const k = segs.findIndex((s) => s.cats.includes(categoria))
      resaltarSeg(k < 0 ? null : k)
    },
  }
}

/* ---------- Calendario de calor (un mes) ---------- */

const DIAS_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/* puntos: serie() del mes ({clave, gastos, ingresos, largo}). El color
   marca cuánto se gastó cada día frente al peor día del mes; el punto verde,
   que ese día entró plata. */
export function calor(contenedor, puntos, { alElegir, hoy } = {}) {
  const max = Math.max(0, ...puntos.map((p) => p.gastos))
  const [a, m] = puntos[0].clave.split('-').map(Number)
  const lunesPrimero = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7
  const nivel = (g) => (g <= 0 || max <= 0 ? 0 : Math.max(1, Math.ceil((g / max) * 4)))
  const vacios = Array.from({ length: lunesPrimero }, () => '<span class="ca-hueco" aria-hidden="true"></span>').join('')
  const dias = puntos.map((p, i) => `<button type="button" class="ca-dia ca-n${nivel(p.gastos)}${p.ingresos ? ' ca-entra' : ''}${p.clave === hoy ? ' ca-hoy' : ''}" data-i="${i}"
    aria-label="${esc(`${p.largo}: gastos ${clp(p.gastos)}${p.ingresos ? `, ingresos ${clp(p.ingresos)}` : ''}`)}"><span>${i + 1}</span></button>`).join('')
  contenedor.innerHTML = `
    <div class="ca-semana" aria-hidden="true">${DIAS_CORTOS.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="ca-rejilla">${vacios}${dias}</div>
    <div class="ca-leyenda" aria-hidden="true"><span>menos</span><i class="ca-n1"></i><i class="ca-n2"></i><i class="ca-n3"></i><i class="ca-n4"></i><span>más gasto</span><span class="ca-clave"><i class="ca-punto"></i>entró plata</span></div>`
  const rejilla = contenedor.querySelector('.ca-rejilla')
  const tip = tooltip(rejilla)
  const celdas = [...rejilla.querySelectorAll('.ca-dia')]
  celdas.forEach((c, i) => {
    c.style.setProperty('--i', String(i))
    const p = puntos[i]
    const mostrar = () => {
      const filas = [['g-clave-s2', 'gastos', clp(p.gastos)]]
      if (p.ingresos) filas.unshift(['g-clave-s1', 'ingresos', clp(p.ingresos)])
      tip.mostrar(p.largo, filas, c.offsetLeft + c.offsetWidth / 2, c.offsetTop + c.offsetHeight + 4)
    }
    c.addEventListener('pointerenter', mostrar)
    c.addEventListener('focus', mostrar)
    c.addEventListener('pointerleave', tip.ocultar)
    c.addEventListener('blur', tip.ocultar)
    if (alElegir) c.addEventListener('click', () => alElegir(p))
  })
}

/* ---------- Sparkline ---------- */

// Devuelve marcado SVG (para crudo()). Solo números: nada que escapar.
export function sparkline(valores, clase) {
  const n = valores.length
  if (n < 2) return ''
  const w = 100, h = 30, p = 3
  const max = Math.max(...valores), min = Math.min(0, ...valores)
  const rango = max - min || 1
  const P = valores.map((v, i) => [p + (i * (w - 2 * p)) / (n - 1), h - p - ((v - min) / rango) * (h - 2 * p)])
  const linea = trazoSuave(P)
  return `<svg viewBox="0 0 ${w} ${h}" class="sp ${clase}" aria-hidden="true" preserveAspectRatio="none">
    <path class="sp-area" d="${linea}L${r1(P[n - 1][0])},${h}L${r1(P[0][0])},${h}Z"/>
    <path class="sp-linea" d="${linea}" pathLength="1"/>
  </svg>`
}
