/* Las cifras de las tarjetas «cuentan» desde 0 hasta su valor al aparecer.

   El valor final ya está escrito en el HTML: si el script no corre o el
   usuario pidió menos movimiento, se ve el número correcto sin más. Solo
   textContent: la cifra es nuestra, pero no hay por qué abrir innerHTML.

   DELTA FLOTANTE. Si la misma cifra (mismo periodo, misma clave) vuelve a
   pintarse con OTRO valor —típico: guardas un gasto en «Agregar» y vuelves al
   Resumen—, ya no cuenta desde 0: cuenta desde el valor que tenía y suelta un
   chip con la diferencia («+$25.000»), verde si el cambio es bueno para tus
   finanzas y rojo si es malo. Es la respuesta visible a «¿qué hizo lo que
   acabo de registrar?». Una cifra que no cambió se comporta como siempre.

   La memoria es solo del módulo (se pierde al recargar la página): no se
   guarda nada en el navegador y no se inventa ningún dato, la diferencia sale
   de dos valores que la página ya calculó. */

import { conSigno } from './formato.js'

const DURACION = 700 // igual que --cuenta en tokens.css
const suave = (t) => 1 - (1 - t) ** 3

// «periodo|clave» → último valor pintado.
const previos = new Map()

// data-sube: qué significa que la cifra suba. Los gastos suben = malo; los
// ingresos y el ahorro suben = bueno; lo invertido no es ni una cosa ni otra.
function claseDelta(delta, sube) {
  if (sube === 'neutro') return 'delta-neutro'
  return (delta > 0) === (sube === 'bueno') ? 'delta-bien' : 'delta-mal'
}

function soltarDelta(el, delta) {
  // Se ancla a la tarjeta o a la cabina (ambas son position:relative).
  const ancla = el.closest('.kpi, .cabina') || el.parentElement
  const chip = document.createElement('span')
  chip.className = `delta-flota ${claseDelta(delta, el.dataset.sube)}`
  chip.setAttribute('aria-hidden', 'true')
  chip.textContent = conSigno(Math.abs(delta), delta > 0 ? 'mas' : 'menos')
  chip.addEventListener('animationend', () => chip.remove())
  ancla.append(chip)
}

export function contarCifras(raiz, periodo = '') {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  raiz.querySelectorAll('[data-cuenta]').forEach((el) => {
    const final = Number(el.dataset.cuenta) || 0
    const sentido = el.dataset.sentido || ''
    const clave = el.dataset.clave ? `${periodo}|${el.dataset.clave}` : null
    const previo = clave && previos.has(clave) ? previos.get(clave) : null
    if (clave) previos.set(clave, final)

    const cambio = previo !== null && previo !== final
    const desde = cambio ? previo : 0
    if (cambio) soltarDelta(el, final - previo)

    const t0 = performance.now()
    const paso = (ahora) => {
      if (!el.isConnected) return
      // El `ahora` de rAF puede ser anterior a `t0`: sin el tope inferior la
      // primera vuelta daba progreso negativo y la cifra salía como «-1».
      const t = Math.min(1, Math.max(0, (ahora - t0) / DURACION))
      el.textContent = conSigno(Math.round(desde + (final - desde) * suave(t)), sentido)
      if (t < 1) requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
  })
}
