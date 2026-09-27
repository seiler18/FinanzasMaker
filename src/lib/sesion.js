import { CLIENT_ID } from '../config.js'

/* «Iniciar sesión con Google» (Google Identity Services).

   Google entrega un ID token (JWT firmado, dura 1 hora) que dice quién eres
   y para qué aplicación se emitió. No da acceso a tu Gmail ni a nada: es una
   credencial de identidad. El backend lo verifica contra Google y compara
   el correo con el del dueño de la planilla.

   Se guarda en sessionStorage: se va al cerrar la pestaña. Cuando vence, el
   backend responde `sesion: false` y la página vuelve a pedir el ingreso. */

const CLAVE = 'fm_credencial'
const GIS = 'https://accounts.google.com/gsi/client'

export const credencial = () => { try { return sessionStorage.getItem(CLAVE) } catch { return null } }
export const olvidar = () => { try { sessionStorage.removeItem(CLAVE) } catch { /* modo privado */ } }
const guardar = (t) => { try { sessionStorage.setItem(CLAVE, t) } catch { /* modo privado */ } }

// Vencido o a punto de vencer: mejor pedirlo de nuevo antes de llamar.
export function vigente() {
  const t = credencial()
  if (!t) return false
  try {
    const carga = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return carga.exp * 1000 > Date.now() + 60_000
  } catch { return false }
}

let cargado
function cargarGis() {
  cargado ??= new Promise((ok, mal) => {
    const s = document.createElement('script')
    s.src = GIS
    s.async = true
    s.onload = ok
    s.onerror = () => mal(new Error('No se pudo cargar el acceso de Google'))
    document.head.append(s)
  })
  return cargado
}

export async function botonIngreso(contenedor, alEntrar) {
  await cargarGis()
  const g = window.google.accounts.id
  g.initialize({
    client_id: CLIENT_ID,
    callback: (r) => { guardar(r.credential); alEntrar() },
    auto_select: true,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true,
  })
  g.renderButton(contenedor, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es', width: 300 })
  g.prompt()
}

export function salir() {
  olvidar()
  try { window.google?.accounts.id.disableAutoSelect() } catch { /* sin GIS */ }
}
