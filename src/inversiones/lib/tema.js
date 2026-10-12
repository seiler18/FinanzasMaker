/* Claro u oscuro. Por defecto sigue al sistema; si el usuario elige con el
   botón, la elección se guarda y manda (data-theme en <html>, que tokens.css
   ya leía). Mismo mecanismo que FinanzasMaker (src/lib/tema.js allá). */

// La misma clave que Finanzas (src/lib/tema.js): el tema elegido en una
// página vale en la otra.
const CLAVE = 'fm_tema'
const raiz = document.documentElement

export function temaActual() {
  return raiz.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

// Lo primero en main.js, para que no parpadee el tema del sistema.
export function iniciarTema() {
  try {
    const t = localStorage.getItem(CLAVE)
    if (t === 'light' || t === 'dark') raiz.dataset.theme = t
  } catch { /* sin almacenamiento */ }
}

export function alternarTema() {
  const nuevo = temaActual() === 'dark' ? 'light' : 'dark'
  try { localStorage.setItem(CLAVE, nuevo) } catch { /* sin almacenamiento */ }
  const aplicar = () => { raiz.dataset.theme = nuevo }
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(aplicar)
  else aplicar()
  // Se devuelve el tema nuevo porque, con View Transitions, `aplicar` corre
  // después: leer temaActual() justo ahora daría todavía el anterior.
  return nuevo
}
