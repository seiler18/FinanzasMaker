/* Movimiento de la página: secciones que aparecen al llegar a ellas y cifras
   que cuentan hasta su valor.

   Todo parte visible si esto no corre: el HTML trae el valor final y la clase
   .revela solo la pone el propio JS que pinta. Con «menos movimiento» en el
   sistema, todo se muestra de una vez. */

import { fUsd, fUsdSigno, fClp } from './formato.js'

const FORMATOS = { usd: fUsd, usdSigno: fUsdSigno, clp: fClp }
const DURACION = 900 // igual que --dur-cuenta en tokens.css
const suave = (t) => 1 - (1 - t) ** 3
export const menosMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function contar(el) {
  const final = Number(el.dataset.cuenta)
  const f = FORMATOS[el.dataset.formato]
  if (!f || !isFinite(final) || menosMovimiento()) return
  delete el.dataset.cuenta // una sola vez, aunque la sección vuelva a entrar
  const t0 = performance.now()
  const paso = (ahora) => {
    if (!el.isConnected) return
    const t = Math.min(1, (ahora - t0) / DURACION)
    el.textContent = f(t < 1 ? final * suave(t) : final)
    if (t < 1) requestAnimationFrame(paso)
  }
  requestAnimationFrame(paso)
}

let observador
export function revelarAlVer(raiz) {
  const piezas = raiz.querySelectorAll('.revela')
  const mostrar = (el) => {
    el.classList.add('visible')
    el.querySelectorAll('[data-cuenta]').forEach(contar)
  }
  if (menosMovimiento() || !('IntersectionObserver' in window)) return piezas.forEach(mostrar)
  observador?.disconnect()
  observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue
      mostrar(e.target)
      observador.unobserve(e.target)
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
  piezas.forEach((el) => observador.observe(el))
}
