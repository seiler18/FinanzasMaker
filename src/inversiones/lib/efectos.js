/*
 * Efectos de puntero para los botones: imán y chispas.
 *
 * Inspirados en React Bits (https://github.com/DavidHDev/react-bits,
 * Copyright (c) 2026 David Haz, MIT + Commons Clause: se usan DENTRO de un
 * sitio, no se redistribuyen). Reescritos aquí en JS vanilla; la lógica y los
 * números son propios.
 *
 * ES UN SUBCONJUNTO del módulo del mismo nombre de Curriculo y el hub: aquí ya
 * existen los contadores (lib/movimiento.js) y la luz que sigue al puntero en
 * los mosaicos (main.js), así que no se copian para no tener dos sistemas que
 * hacen lo mismo. Cambios respecto al original:
 *   · el imán busca los botones en cada movimiento, no una vez al arrancar: el
 *     botón «Mostrar los N movimientos» se vuelve a pintar al filtrar, y una
 *     lista fija se quedaría apuntando a un elemento que ya no existe.
 *
 * Reglas comunes: todo se apaga con prefers-reduced-motion; el imán solo donde
 * hay hover real; colores y duraciones salen de los tokens CSS.
 */

const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const conHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

/** Lee un token de duración (`420ms` o `0.4s`) y lo devuelve en milisegundos. */
function duracionToken(nombre, porDefecto) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim()
  if (v.endsWith('ms')) return parseFloat(v)
  if (v.endsWith('s')) return parseFloat(v) * 1000
  return porDefecto
}

/**
 * El botón se acerca un poco al cursor cuando este está cerca. Se mueve con la
 * propiedad `translate` (independiente de `transform`), así no pisa el
 * `translateY` que el botón ya tenga. El CSS debe incluir `translate` en su
 * lista de transiciones: si no, el desplazamiento sería a saltos.
 */
export function initMagnetico(selector, { alcance = 90, fuerza = 0.22, maximo = 9 } = {}) {
  if (reducido() || !conHover()) return
  document.addEventListener(
    'pointermove',
    e => {
      for (const b of document.querySelectorAll(selector)) {
        if (b.hidden) continue
        const r = b.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        // Distancia al BORDE, no al centro: un botón ancho empezaría a moverse
        // demasiado tarde si se midiera desde el centro.
        const fueraX = Math.max(Math.abs(dx) - r.width / 2, 0)
        const fueraY = Math.max(Math.abs(dy) - r.height / 2, 0)
        if (Math.hypot(fueraX, fueraY) > alcance) {
          b.style.removeProperty('--mag-x')
          b.style.removeProperty('--mag-y')
          continue
        }
        const tope = v => Math.max(-maximo, Math.min(maximo, v * fuerza))
        b.style.setProperty('--mag-x', `${tope(dx)}px`)
        b.style.setProperty('--mag-y', `${tope(dy)}px`)
      }
    },
    { passive: true }
  )
}

/**
 * Un puñado de puntos que salen del clic y se apagan. Solo en los botones que
 * se le pasan. Funciona también en táctil (el toque es un clic).
 */
export function initChispas(selector, { cantidad = 8, radio = 38 } = {}) {
  if (reducido()) return
  document.addEventListener('click', e => {
    const boton = e.target.closest?.(selector)
    if (!boton) return
    // Un clic con teclado (Enter) llega con coordenadas 0,0: se centra en el botón.
    const r = boton.getBoundingClientRect()
    const x = e.detail === 0 ? r.left + r.width / 2 : e.clientX
    const y = e.detail === 0 ? r.top + r.height / 2 : e.clientY
    const duracion = duracionToken('--dur-entra', 560)

    for (let i = 0; i < cantidad; i++) {
      const chispa = document.createElement('span')
      chispa.className = 'chispa'
      chispa.setAttribute('aria-hidden', 'true')
      chispa.style.left = `${x}px`
      chispa.style.top = `${y}px`
      document.body.appendChild(chispa)
      const ang = (Math.PI * 2 * i) / cantidad + Math.random() * 0.5
      const dist = radio * (0.6 + Math.random() * 0.6)
      chispa
        .animate(
          [
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(0.2)`, opacity: 0 },
          ],
          { duration: duracion, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' }
        )
        .finished.then(() => chispa.remove())
        .catch(() => chispa.remove())
    }
  })
}
