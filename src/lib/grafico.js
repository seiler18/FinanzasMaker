import { esc } from './dom.js'
import { compacto, clp } from './formato.js'

/* Barras agrupadas ingresos/gastos por mes o por día.

   SVG a mano, sin librería: son dos series y un eje. Reglas de la guía de
   visualización que se aplican aquí:
   - azul = ingresos, naranja = gastos (slots 1 y 2 del orden validado; los
     colores viven en tokens.css con su versión para modo oscuro).
   - Un solo eje Y, rejilla tenue, barras con la punta redondeada de 4px y
     2px de aire entre barras vecinas.
   - Leyenda siempre (hay dos series) y tooltip al pasar el puntero o al
     enfocar con teclado; los mismos números están en la tabla de abajo, así
     el tooltip no es el único camino a un valor. */

const W0 = 720, H = 240, M = { t: 12, r: 8, b: 26, l: 56 }

export function escalaY(max) {
  if (max <= 0) return { tope: 1, marcas: [0] }
  const paso0 = max / 4
  const mag = 10 ** Math.floor(Math.log10(paso0))
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= paso0)
  const tope = Math.ceil(max / paso) * paso
  const marcas = []
  for (let v = 0; v <= tope + 1e-9; v += paso) marcas.push(v)
  return { tope, marcas }
}

// Barra con las esquinas de arriba redondeadas y la base plana en el eje.
function barra(x, y, w, h) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export function barrasPareadas(contenedor, puntos, { alElegir } = {}) {
  // Al ancho real del contenedor (con piso W0): con un viewBox fijo el navegador
  // escala también el texto y en un monitor ancho los ejes salen enormes.
  const W = Math.max(W0, Math.round(contenedor.clientWidth))
  const max = Math.max(0, ...puntos.map((p) => Math.max(p.ingresos, p.gastos)))
  const { tope, marcas } = escalaY(max)
  const ancho = (W - M.l - M.r) / puntos.length
  const y = (v) => M.t + (H - M.t - M.b) * (1 - v / tope)
  const grupo = Math.min(ancho * 0.72, 44)
  const bw = Math.max(1, (grupo - 2) / 2)
  const cadaEtiqueta = puntos.length > 16 ? 3 : 1

  const rejilla = marcas.map((v) => `<line class="g-rejilla" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="g-eje" x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(compacto(v))}</text>`).join('')

  const columnas = puntos.map((p, i) => {
    const x0 = M.l + i * ancho + (ancho - grupo) / 2
    const etiqueta = i % cadaEtiqueta === 0 ? `<text class="g-eje" x="${M.l + i * ancho + ancho / 2}" y="${H - 8}" text-anchor="middle">${esc(p.etiqueta)}</text>` : ''
    return `<g class="g-col" data-i="${i}" tabindex="0" role="button" aria-label="${esc(`${p.largo}: ingresos ${clp(p.ingresos)}, gastos ${clp(p.gastos)}`)}">
      <rect class="g-blanco" x="${M.l + i * ancho}" y="${M.t}" width="${ancho}" height="${H - M.t - M.b}"/>
      <path class="g-s1" d="${barra(x0, y(p.ingresos), bw, y(0) - y(p.ingresos))}"/>
      <path class="g-s2" d="${barra(x0 + bw + 2, y(p.gastos), bw, y(0) - y(p.gastos))}"/>
      ${etiqueta}
    </g>`
  }).join('')

  // Todo lo interpolado aquí son números o texto que pasó por esc().
  contenedor.innerHTML = `
    <div class="g-leyenda" aria-hidden="true">
      <span><i class="g-clave g-clave-s1"></i>Ingresos</span>
      <span><i class="g-clave g-clave-s2"></i>Gastos</span>
    </div>
    <div class="g-lienzo">
      <svg viewBox="0 0 ${W} ${H}" class="g-svg" role="group" aria-label="Ingresos y gastos">
        ${rejilla}<line class="g-base" x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}"/>${columnas}
      </svg>
      <div class="g-tip" hidden></div>
    </div>`
  const svg = contenedor.querySelector('svg')

  const tip = contenedor.querySelector('.g-tip')
  const lienzo = contenedor.querySelector('.g-lienzo')
  const mostrar = (g) => {
    const p = puntos[Number(g.dataset.i)]
    tip.replaceChildren()
    const t = document.createElement('strong'); t.textContent = p.largo
    const fila = (clase, nombre, v) => {
      const d = document.createElement('div')
      const k = document.createElement('i'); k.className = 'g-linea ' + clase
      const b = document.createElement('b'); b.textContent = clp(v)
      d.append(k, b, document.createTextNode(' ' + nombre))
      return d
    }
    tip.append(t, fila('g-clave-s1', 'ingresos', p.ingresos), fila('g-clave-s2', 'gastos', p.gastos))
    tip.hidden = false
    const r = g.getBoundingClientRect(), base = lienzo.getBoundingClientRect()
    const izq = Math.min(Math.max(0, r.left - base.left + r.width / 2 - tip.offsetWidth / 2), base.width - tip.offsetWidth)
    tip.style.setProperty('left', `${izq}px`)
    svg.querySelectorAll('.g-col').forEach((c) => c.classList.toggle('g-apagada', c !== g))
  }
  const ocultar = () => { tip.hidden = true; svg.querySelectorAll('.g-col').forEach((c) => c.classList.remove('g-apagada')) }
  svg.querySelectorAll('.g-col').forEach((g) => {
    g.addEventListener('pointerenter', () => mostrar(g))
    g.addEventListener('focus', () => mostrar(g))
    g.addEventListener('blur', ocultar)
    if (alElegir) {
      g.addEventListener('click', () => alElegir(puntos[Number(g.dataset.i)]))
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alElegir(puntos[Number(g.dataset.i)]) } })
    }
  })
  svg.addEventListener('pointerleave', ocultar)
}

/* Barras horizontales de una sola serie (gasto por categoría). El ancho se
   pone por CSSOM (--p), porque la CSP no deja style="" en el marcado. */
export function pintarBarrasHorizontales(raiz) {
  raiz.querySelectorAll('[data-p]').forEach((el) => el.style.setProperty('--p', el.dataset.p))
}
