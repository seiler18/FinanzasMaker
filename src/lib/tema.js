/* Claro u oscuro. Por defecto sigue al sistema; si el usuario elige con el
   botón, la elección se guarda y manda (data-theme en <html>, que tokens.css
   lee). Sin almacenamiento —modo privado— la elección dura lo que la pestaña. */

const CLAVE = 'fm_tema'
const raiz = document.documentElement
const oscuroSistema = () => matchMedia('(prefers-color-scheme: dark)').matches

export function temaActual() {
  return raiz.dataset.theme || (oscuroSistema() ? 'dark' : 'light')
}

// Se llama lo primero en main.js, antes de pintar nada, para que no parpadee
// el tema del sistema antes del elegido.
export function iniciarTema() {
  try {
    const t = localStorage.getItem(CLAVE)
    if (t === 'light' || t === 'dark') raiz.dataset.theme = t
  } catch { /* sin almacenamiento */ }
}

export function alternarTema() {
  const nuevo = temaActual() === 'dark' ? 'light' : 'dark'
  const aplicar = () => { raiz.dataset.theme = nuevo }
  try { localStorage.setItem(CLAVE, nuevo) } catch { /* sin almacenamiento */ }
  // Fundido entre los dos temas donde el navegador sabe hacerlo; sin
  // data-dir, #vista no toma nombre propio y todo funde junto (movimiento.css).
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(aplicar)
  else aplicar()
  // Se devuelve el tema nuevo porque, con View Transitions, `aplicar` corre
  // después: leer temaActual() justo ahora daría todavía el anterior.
  return nuevo
}
