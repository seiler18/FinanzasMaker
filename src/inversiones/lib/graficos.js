import { html } from './dom.js'

/* Gráficos sin librería: HTML para barras horizontales, SVG para columnas.

   CSP: no hay style="" en el marcado (la CSP lo bloquea). Los largos de barra
   viajan en data-w y aplicarMedidas() los pasa a una variable CSS por CSSOM,
   que la CSP sí permite.

   Especificación (skill dataviz): barras ≤ 24 px con punta redondeada de
   4 px y base recta; cada marca con tooltip y un blanco de hover más grande
   que la marca; el texto nunca va del color de la serie. */

/* Barras de una sola serie, de 0 al máximo. filas: [{id, etiqueta, detalle, valor, texto, tip}] */
export function barras(filas) {
  const max = Math.max(...filas.map((f) => f.valor), 0) || 1
  return html`<ul class="barras" role="list">
    ${filas.map((f) => html`<li class="barra-fila" tabindex="0" data-tip="${f.tip}" ${f.ticker ? html`data-ticker="${f.ticker}" role="button"` : ''}>
      <span class="barra-etq"><b>${f.etiqueta}</b>${f.detalle ? html`<small>${f.detalle}</small>` : ''}</span>
      <span class="barra-pista"><span class="barra serie-1" data-w="${(f.valor / max).toFixed(4)}"></span></span>
      <span class="barra-val">${f.texto}</span>
    </li>`)}
  </ul>`
}

/* Barras divergentes desde un eje central: positivo a la derecha (azul),
   negativo a la izquierda (rojo). La escala es simétrica — el mismo largo
   vale lo mismo a los dos lados — para no exagerar las pérdidas pequeñas. */
export function divergentes(filas) {
  const max = Math.max(...filas.map((f) => Math.abs(f.valor)), 0) || 1
  return html`<ul class="barras divergentes" role="list">
    ${filas.map((f) => {
      const lado = f.valor < 0 ? 'neg' : 'pos'
      return html`<li class="barra-fila" tabindex="0" data-tip="${f.tip}" ${f.ticker ? html`data-ticker="${f.ticker}" role="button"` : ''}>
        <span class="barra-etq"><b>${f.etiqueta}</b>${f.detalle ? html`<small>${f.detalle}</small>` : ''}</span>
        <span class="barra-pista pista-div">
          <span class="mitad mitad-neg">${lado === 'neg' ? html`<span class="barra barra-neg" data-w="${(Math.abs(f.valor) / max).toFixed(4)}"></span>` : ''}</span>
          <span class="mitad mitad-pos">${lado === 'pos' ? html`<span class="barra barra-pos" data-w="${(Math.abs(f.valor) / max).toFixed(4)}"></span>` : ''}</span>
        </span>
        <span class="barra-val ${f.clase || ''}">${f.texto}</span>
      </li>`
    })}
  </ul>`
}

/* Columnas por período, SVG. serie: [{etiqueta, valor, tip}]; destacar: índice a rotular. */
export function columnas(serie, { formato, destacar = -1, alto = 200, ancho = 640 } = {}) {
  const m = { arriba: 22, abajo: 26, izq: 60, der: 8 }
  const areaAlto = alto - m.arriba - m.abajo
  const areaAncho = ancho - m.izq - m.der
  const max = Math.max(...serie.map((d) => d.valor), 0)
  const escalaMax = redondeoLimpio(max || 1)
  const y = (v) => m.arriba + areaAlto - (v / escalaMax) * areaAlto
  const paso = areaAncho / Math.max(serie.length, 1)
  const grosor = Math.min(24, paso * 0.62)
  const marcas = [0, escalaMax / 2, escalaMax]
  // Rotular un mes de cada n para que las etiquetas no choquen (~56 px por etiqueta).
  const cada = Math.max(1, Math.ceil(serie.length / Math.floor(areaAncho / 56)))

  return html`<svg class="columnas" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Gráfico de columnas; el detalle está en la tabla y en el tooltip de cada columna">
    ${marcas.map((v) => html`<line class="rejilla" x1="${m.izq}" x2="${ancho - m.der}" y1="${y(v)}" y2="${y(v)}"></line>
      <text class="eje" x="${m.izq - 6}" y="${y(v) + 4}" text-anchor="end">${formato(v)}</text>`)}
    ${serie.map((d, i) => {
      const cx = m.izq + paso * i + paso / 2
      const h = y(0) - y(d.valor)
      // data-i: el clic en una columna abre su detalle (main.js, dividendos).
      return html`<g class="col" tabindex="0" role="button" data-i="${i}" data-tip="${d.tip}">
        <rect class="col-hit" x="${m.izq + paso * i}" y="${m.arriba}" width="${paso}" height="${areaAlto}"></rect>
        ${d.valor > 0 ? html`<path class="serie-1-fill" d="${columnaRedondeada(cx - grosor / 2, y(d.valor), grosor, h)}"></path>` : ''}
        ${i === destacar && d.valor > 0 ? html`<text class="col-etq" x="${cx}" y="${y(d.valor) - 6}" text-anchor="middle">${formato(d.valor)}</text>` : ''}
        ${i % cada === 0 ? html`<text class="eje" x="${cx}" y="${alto - 8}" text-anchor="middle">${d.etiqueta}</text>` : ''}
      </g>`
    })}
    <line class="base" x1="${m.izq}" x2="${ancho - m.der}" y1="${y(0)}" y2="${y(0)}"></line>
  </svg>`
}

// Punta redondeada de 4 px arriba, base recta sobre el eje.
function columnaRedondeada(x, yTop, w, h) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + h}Z`
}

// 0,33 → 0,4 · 1,2 → 1,5 · 47 → 50: el tope del eje en un número que se lee.
export function redondeoLimpio(v) {
  const e = 10 ** Math.floor(Math.log10(v))
  for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= f * e) return f * e
  return 10 * e
}

export function aplicarMedidas(raiz) {
  for (const el of raiz.querySelectorAll('[data-w]')) el.style.setProperty('--w', el.dataset.w)
}

/* Un tooltip para toda la página. textContent: el texto puede traer nombres
   de activos escritos en la hoja. */
export function activarTooltip(raiz, tip) {
  const mostrar = (el, x, y) => {
    tip.textContent = el.dataset.tip
    tip.hidden = false
    const r = tip.getBoundingClientRect()
    const izq = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8)
    const arriba = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12
    tip.style.setProperty('--x', `${izq}px`)
    tip.style.setProperty('--y', `${arriba}px`)
  }
  const ocultar = () => { tip.hidden = true }
  raiz.addEventListener('pointermove', (e) => {
    const el = e.target.closest('[data-tip]')
    if (el && el.dataset.tip) mostrar(el, e.clientX, e.clientY)
    else ocultar()
  })
  raiz.addEventListener('pointerleave', ocultar)
  raiz.addEventListener('focusin', (e) => {
    const el = e.target.closest('[data-tip]')
    if (!el || !el.dataset.tip) return
    const r = el.getBoundingClientRect()
    mostrar(el, r.left + r.width / 2, r.top)
  })
  raiz.addEventListener('focusout', ocultar)
  window.addEventListener('scroll', ocultar, { passive: true })
}
