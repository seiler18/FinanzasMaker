/* Las cifras de las tarjetas «cuentan» desde 0 hasta su valor al aparecer.

   El valor final ya está escrito en el HTML: si el script no corre o el
   usuario pidió menos movimiento, se ve el número correcto sin más. Solo
   textContent: la cifra es nuestra, pero no hay por qué abrir innerHTML. */

import { conSigno } from './formato.js'

const DURACION = 700 // igual que --cuenta en tokens.css
const suave = (t) => 1 - (1 - t) ** 3

export function contarCifras(raiz) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  raiz.querySelectorAll('[data-cuenta]').forEach((el) => {
    const final = Number(el.dataset.cuenta) || 0
    const sentido = el.dataset.sentido || ''
    const t0 = performance.now()
    const paso = (ahora) => {
      if (!el.isConnected) return
      const t = Math.min(1, (ahora - t0) / DURACION)
      el.textContent = conSigno(Math.round(final * suave(t)), sentido)
      if (t < 1) requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
  })
}
