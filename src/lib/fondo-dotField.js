/*
 * Fondo «DotField» — matriz de puntos tipo placa que se abomba alrededor del
 * cursor y, opcionalmente, ondula muy suave.
 *
 * Adaptado de React Bits (https://github.com/DavidHDev/react-bits),
 * Copyright (c) 2026 David Haz, licencia MIT + Commons Clause.
 * Se usa AQUÍ, dentro de un sitio; la licencia prohíbe redistribuir el
 * componente en sí, así que este archivo no debe copiarse a plantillas ni
 * publicarse como librería. Conservar este aviso.
 *
 * Es canvas 2D: no necesita WebGL ni ninguna librería. Cambios respecto al
 * original, que es React y redibuja a 60 fps pase lo que pase:
 *   · solo se anima mientras hay algo que mover (el cursor está activo, los
 *     puntos aún no han vuelto a su sitio, o hay ondulación). En reposo y sin
 *     `ondulacion` no gasta ni un fotograma;
 *   · pausa fuera de pantalla y con la pestaña oculta;
 *   · prefers-reduced-motion → una sola imagen fija, sin ondulación ni cursor;
 *   · se quita el halo SVG del original (un círculo oscuro bajo el cursor).
 */

/**
 * Monta la matriz dentro de `contenedor` (que debe tener tamaño propio). El
 * cursor se escucha en `window` y no en el contenedor porque el canvas va
 * detrás del texto con pointer-events:none.
 *
 * @param {HTMLElement} contenedor
 * @param {Object} [o]
 * @param {number} [o.radio=1.5]        radio de cada punto, en px
 * @param {number} [o.separacion=14]    hueco entre puntos, en px
 * @param {number} [o.alcance=500]      distancia a la que el cursor afecta
 * @param {number} [o.abombado=67]      cuánto se apartan los puntos
 * @param {number} [o.ondulacion=0]     amplitud de la onda ambiente, en px
 * @param {string} [o.colorA]  extremo superior izquierdo del degradado
 * @param {string} [o.colorB]  extremo inferior derecho
 * @param {number} [o.opacidad=0.35]
 * @returns {{destruir: () => void} | null}  null si no hay canvas 2D.
 */
export function montarDotField(contenedor, o = {}) {
  const op = {
    radio: 1.5,
    separacion: 14,
    alcance: 500,
    abombado: 67,
    ondulacion: 0,
    colorA: '#a855f7',
    colorB: '#b497cf',
    opacidad: 0.35,
    ...o,
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) return null
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  contenedor.appendChild(canvas)

  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const ondulacion = reducido ? 0 : op.ondulacion
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  let w = 0
  let h = 0
  let puntos = []
  const raton = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, velocidad: 0 }
  let implicacion = 0 // 0..1: cuánto «agarra» el cursor, según lo rápido que se mueve
  let fotograma = 0

  function construir() {
    const paso = op.radio + op.separacion
    const cols = Math.floor(w / paso)
    const filas = Math.floor(h / paso)
    const margenX = (w % paso) / 2
    const margenY = (h % paso) / 2
    puntos = new Array(cols * filas)
    let i = 0
    for (let f = 0; f < filas; f++) {
      for (let c = 0; c < cols; c++) {
        const ax = margenX + c * paso + paso / 2
        const ay = margenY + f * paso + paso / 2
        puntos[i++] = { ax, ay, sx: ax, sy: ay }
      }
    }
  }

  function redimensionar() {
    const { clientWidth, clientHeight } = contenedor
    if (!clientWidth || !clientHeight) return
    w = clientWidth
    h = clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    construir()
    pintar()
  }

  /** Dibuja y devuelve true si algo sigue en movimiento (hay que seguir). */
  function pintar() {
    fotograma++
    const t = fotograma * 0.02
    const alcance2 = op.alcance * op.alcance
    const r = op.radio / 2

    const objetivo = Math.min(raton.velocidad / 5, 1)
    implicacion += (objetivo - implicacion) * 0.06
    if (implicacion < 0.001) implicacion = 0

    ctx.clearRect(0, 0, w, h)
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, op.colorA)
    grad.addColorStop(1, op.colorB)
    ctx.globalAlpha = op.opacidad
    ctx.fillStyle = grad
    ctx.beginPath()

    let enMovimiento = implicacion > 0 || ondulacion > 0
    for (const p of puntos) {
      const dx = raton.x - p.ax
      const dy = raton.y - p.ay
      const d2 = dx * dx + dy * dy
      if (d2 < alcance2 && implicacion > 0.01) {
        const k = 1 - Math.sqrt(d2) / op.alcance
        const empuje = k * k * op.abombado * implicacion
        const ang = Math.atan2(dy, dx)
        p.sx += (p.ax - Math.cos(ang) * empuje - p.sx) * 0.15
        p.sy += (p.ay - Math.sin(ang) * empuje - p.sy) * 0.15
      } else {
        p.sx += (p.ax - p.sx) * 0.1
        p.sy += (p.ay - p.sy) * 0.1
      }
      if (!enMovimiento && (Math.abs(p.sx - p.ax) > 0.05 || Math.abs(p.sy - p.ay) > 0.05)) enMovimiento = true

      let x = p.sx
      let y = p.sy
      if (ondulacion > 0) {
        y += Math.sin(p.ax * 0.03 + t) * ondulacion
        x += Math.cos(p.ay * 0.03 + t * 0.7) * ondulacion * 0.5
      }
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
    }
    ctx.fill()
    ctx.globalAlpha = 1
    return enMovimiento
  }

  let raf = 0
  let visible = true
  const bucle = () => {
    raf = 0
    const sigue = pintar()
    if (sigue && visible && !document.hidden) raf = requestAnimationFrame(bucle)
  }
  const despertar = () => {
    if (!raf && visible && !document.hidden && !reducido) raf = requestAnimationFrame(bucle)
  }
  const parar = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }

  // La velocidad del cursor se mide a intervalo fijo, como en el original: lo
  // que importa no es dónde está, sino si se está moviendo.
  const alMover = e => {
    const r = contenedor.getBoundingClientRect()
    raton.x = e.clientX - r.left
    raton.y = e.clientY - r.top
    despertar()
  }
  const medidor = setInterval(() => {
    // Las vistas de este sitio se vuelven a pintar enteras al cambiar de periodo:
    // si el contenedor ya salió del documento, el fondo se retira solo. Sin esto
    // cada render dejaría un intervalo y varios listeners vivos para siempre.
    if (!canvas.isConnected) return destruir()
    const dx = raton.prevX - raton.x
    const dy = raton.prevY - raton.y
    raton.velocidad += (Math.hypot(dx, dy) - raton.velocidad) * 0.5
    if (raton.velocidad < 0.001) raton.velocidad = 0
    raton.prevX = raton.x
    raton.prevY = raton.y
  }, 20)
  if (!reducido) window.addEventListener('pointermove', alMover, { passive: true })

  let temporizador = 0
  const alRedimensionar = () => {
    clearTimeout(temporizador)
    temporizador = setTimeout(redimensionar, 100)
  }
  window.addEventListener('resize', alRedimensionar)

  const observador = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    visible ? despertar() : parar()
  })
  observador.observe(contenedor)
  const alCambiarVisibilidad = () => (document.hidden ? parar() : despertar())
  document.addEventListener('visibilitychange', alCambiarVisibilidad)

  redimensionar()
  if (ondulacion > 0) despertar()

  let destruido = false
  function destruir() {
    if (destruido) return
    destruido = true
    parar()
    clearInterval(medidor)
    clearTimeout(temporizador)
    observador.disconnect()
    window.removeEventListener('pointermove', alMover)
    window.removeEventListener('resize', alRedimensionar)
    document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    canvas.remove()
  }

  return { destruir }
}
