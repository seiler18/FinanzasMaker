/* Fondo de puntos de la tarjeta «Resultado total» (.hero).

   Los puntos llevan el tono del resultado: verde si la cartera gana, rojo si
   pierde, gris si está en cero — el mismo mensaje que el halo de detrás, dicho
   dos veces para no depender solo del color de la cifra.

   El tono sale de los tokens (--serie-2, --negativo, --texto-tenue), que
   cambian con el tema. El canvas guarda el color con el que se montó, así que
   hay que volver a montarlo cuando cambia el tema: se vigila el atributo
   data-theme del <html> y la preferencia del sistema. */

import { montarDotField } from './fondo-dotField.js'

const TONOS = { sube: '--serie-2', baja: '--negativo', neutro: '--texto-tenue' }

let actual = null
let vigilando = false
let raizApp = null

function limpiar() {
  actual?.destruir()
  actual = null
}

function montar() {
  limpiar()
  const hero = raizApp?.querySelector('.hero')
  const lienzo = hero?.querySelector('.hero-puntos')
  if (!hero || !lienzo) return
  const tono = ['sube', 'baja', 'neutro'].find((d) => hero.classList.contains(`hero-${d}`)) || 'neutro'
  const color = getComputedStyle(document.documentElement).getPropertyValue(TONOS[tono]).trim() || '#888888'
  actual = montarDotField(lienzo, {
    colorA: color,
    colorB: color,
    opacidad: 0.5,
    radio: 2,
    separacion: 17,
    alcance: 240, // la tarjeta es pequeña: 500 px abombaría todo a la vez
    abombado: 34,
    ondulacion: 1.5,
  })
}

/** Se llama tras cada pintado de la página; el HTML nuevo trae un lienzo nuevo. */
export function montarFondoHero(app) {
  raizApp = app
  montar()
  if (vigilando) return
  vigilando = true
  // El cambio de tema pasa por una View Transition: el atributo cambia dentro
  // de ella, así que el observador ve el valor ya aplicado.
  new MutationObserver(montar).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', montar)
}
