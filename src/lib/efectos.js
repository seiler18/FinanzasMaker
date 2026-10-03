/*
 * Efectos de interacción pequeños: contadores, brillo que sigue al cursor,
 * botones magnéticos, chispas al pulsar y título que entra por palabras.
 *
 * Inspirados en React Bits (https://github.com/DavidHDev/react-bits,
 * Copyright (c) 2026 David Haz, MIT + Commons Clause: se usan DENTRO de un
 * sitio, no se redistribuyen). Aquí están reescritos en JS vanilla; la lógica
 * y los números son propios.
 *
 * Reglas comunes, que son las que separan un efecto de un tic:
 *   · prefers-reduced-motion → ningún efecto se activa (el contenido final
 *     queda tal cual, sin animar);
 *   · los que dependen del puntero solo se activan donde hay hover real
 *     (`(hover: hover)`): en un móvil el cursor no existe y el efecto se
 *     quedaría pegado en el último toque;
 *   · solo se anima `transform` y `opacity` (la excepción está justificada en
 *     el CSS, en el brillo del texto);
 *   · colores y duraciones salen de los tokens CSS, no se escriben aquí.
 *
 * Los estilos que acompañan viven en src/styles/efectos.css.
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

/* ------------------------------------------------------------------ */
/* 1. CONTADORES                                                       */
/* ------------------------------------------------------------------ */

/**
 * Hace subir desde 0 las cifras que empiezan por un número («10+», «40»,
 * «6»). Las que no encajan (texto, fechas) se dejan como están.
 *
 * El HTML ya trae el valor FINAL: sin JS, o con movimiento reducido, la cifra
 * es la correcta. Solo cuando se va a animar se pone a 0 en el momento de
 * enganchar —en el mismo hilo que inyectó el HTML, así que no llega a pintarse
 * el valor final y luego el cero— y se espera a que sea visible para contar.
 */
export function initContadores(selector) {
  if (reducido()) return
  const elementos = [...document.querySelectorAll(selector)]
  const observador = new IntersectionObserver(
    entradas => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue
        observador.unobserve(e.target)
        contar(e.target)
      }
    },
    { threshold: 0.6 }
  )

  for (const el of elementos) {
    const m = /^(\D*)(\d+)(.*)$/.exec(el.textContent.trim())
    if (!m) continue
    el.dataset.final = m[2]
    el.dataset.prefijo = m[1]
    el.dataset.sufijo = m[3]
    el.textContent = `${m[1]}0${m[3]}`
    observador.observe(el)
  }

  function contar(el) {
    const final = Number(el.dataset.final)
    const { prefijo, sufijo } = el.dataset
    // Más tiempo para cifras grandes, pero con tope: pasar de ~1,4 s se lee
    // como una página lenta, no como un efecto.
    const total = Math.min(900 + final * 6, 1400)
    const t0 = performance.now()
    const paso = t => {
      // El `t` que recibe rAF es el del inicio del fotograma y puede ser anterior
      // a `t0` (performance.now() al pedirlo): sin el tope inferior la primera
      // vuelta daba un progreso negativo y la cifra aparecía como «-1».
      const k = Math.min(Math.max((t - t0) / total, 0), 1)
      const suave = 1 - Math.pow(1 - k, 3) // sale rápido y aterriza despacio
      el.textContent = `${prefijo}${Math.round(final * suave)}${sufijo}`
      if (k < 1) requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
  }
}

/* ------------------------------------------------------------------ */
/* 2. BRILLO QUE SIGUE AL CURSOR                                       */
/* ------------------------------------------------------------------ */

/**
 * Marca en cada ficha dónde está el cursor (`--mx`, `--my`, en px relativos a
 * la ficha). El resplandor lo pinta el CSS con un ::before; aquí solo se
 * reparte la posición. Un único listener delegado en el documento: con
 * decenas de fichas, uno por ficha sería ruido.
 */
export function initBrillo(selector) {
  if (reducido() || !conHover()) return
  document.addEventListener(
    'pointermove',
    e => {
      const ficha = e.target.closest?.(selector)
      if (!ficha) return
      const r = ficha.getBoundingClientRect()
      ficha.style.setProperty('--mx', `${e.clientX - r.left}px`)
      ficha.style.setProperty('--my', `${e.clientY - r.top}px`)
    },
    { passive: true }
  )
}

/* ------------------------------------------------------------------ */
/* 3. BOTONES MAGNÉTICOS                                               */
/* ------------------------------------------------------------------ */

/**
 * El botón se acerca un poco al cursor cuando este está cerca. Se mueve con la
 * propiedad `translate` (independiente de `transform`), así no pisa el
 * `translateY` del hover que el botón ya tenga.
 */
export function initMagnetico(selector, { alcance = 90, fuerza = 0.22, maximo = 9 } = {}) {
  if (reducido() || !conHover()) return
  const botones = [...document.querySelectorAll(selector)]
  if (!botones.length) return

  const alMover = e => {
    // La pantalla de ingreso se vuelve a pintar (p. ej. al caducar la sesión):
    // sin esto cada vez quedaría un listener mirando botones que ya no existen.
    if (!botones.some(b => b.isConnected)) return document.removeEventListener('pointermove', alMover)
    for (const b of botones) {
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
  }
  document.addEventListener('pointermove', alMover, { passive: true })
}

/* ------------------------------------------------------------------ */
/* 4. CHISPAS AL PULSAR                                                */
/* ------------------------------------------------------------------ */

/**
 * Un puñado de puntos que salen del clic y se apagan. Solo en los botones
 * que se le pasan: en toda la página sería ruido. Funciona también en táctil
 * (el toque es un clic), así que no pide hover.
 */
export function initChispas(selector, opciones) {
  if (reducido()) return
  document.addEventListener('click', e => {
    const boton = e.target.closest?.(selector)
    if (!boton) return
    // Un clic con teclado (Enter) llega con coordenadas 0,0: se centra en el botón.
    const r = boton.getBoundingClientRect()
    const x = e.detail === 0 ? r.left + r.width / 2 : e.clientX
    const y = e.detail === 0 ? r.top + r.height / 2 : e.clientY
    soltarChispas(x, y, opciones)
  })
}

/**
 * Suelta las chispas en unas coordenadas. Se exporta aparte para dispararlas
 * desde un RESULTADO («movimiento guardado») y no desde el clic: pulsar
 * «Guardar» con el formulario inválido no debe celebrar nada.
 */
export function soltarChispas(x, y, { cantidad = 8, radio = 38 } = {}) {
  if (reducido()) return
  const duracion = duracionToken('--lento', 420)
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
}

/* ------------------------------------------------------------------ */
/* 5. TÍTULO QUE ENTRA POR PALABRAS                                    */
/* ------------------------------------------------------------------ */

/**
 * Parte el texto en palabras y las deja entrar una a una (la animación está en
 * efectos.css, escalonada con `--i`). El título conserva su texto completo en
 * `aria-label`, y las palabras sueltas se ocultan al lector de pantalla: sin
 * eso lo leería partido.
 */
export function initTituloPalabras(selector) {
  if (reducido()) return
  for (const el of document.querySelectorAll(selector)) {
    const texto = el.textContent.trim()
    el.setAttribute('aria-label', texto)
    // Se construye con el DOM, no con innerHTML: el texto vuelve a entrar como
    // texto y nunca se interpreta como marcado.
    el.replaceChildren()
    texto.split(/\s+/).forEach((palabra, i) => {
      const s = document.createElement('span')
      s.className = 'pal'
      s.style.setProperty('--i', i)
      s.setAttribute('aria-hidden', 'true')
      s.textContent = palabra
      if (i) el.append(' ')
      el.append(s)
    })
  }
}
