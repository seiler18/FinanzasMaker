import { CLIENT_ID } from '../config.js'
import { supa } from './supa.js'

/* «Iniciar sesión con Google» → sesión de Supabase.

   Google entrega un ID token (JWT firmado, dura 1 hora) que dice quién eres y
   para qué aplicación se emitió. No da acceso a tu Gmail ni a nada. La página
   se lo pasa a Supabase (signInWithIdToken), que verifica la firma con Google,
   que el token sea para CLIENT_ID y que el nonce calce, y devuelve una sesión.
   La base solo deja entrar a correos de la tabla `permitidos` (migración 0001).

   El nonce: un valor al azar que la página inventa en cada carga. Google lo
   firma dentro del token (en hash) y Supabase compara con el original. Así un
   token robado de otra página no sirve aquí.

   El token de Google se guarda además en sessionStorage para una sola cosa:
   «Revisar correos ahora», que llama al Apps Script, y el Apps Script lo
   valida por su cuenta (identidad_ en backend/Code.gs). */

const CLAVE = 'fm_credencial'
const GIS = 'https://accounts.google.com/gsi/client'

export const credencial = () => { try { return sessionStorage.getItem(CLAVE) } catch { return null } }
const guardar = (t) => { try { sessionStorage.setItem(CLAVE, t) } catch { /* modo privado */ } }
export const olvidar = () => { try { sessionStorage.removeItem(CLAVE) } catch { /* modo privado */ } }

export async function haySesion() {
  try {
    const { data } = await supa().auth.getSession()
    return Boolean(data.session)
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

async function nuevoNonce() {
  const bruto = crypto.randomUUID() + crypto.randomUUID()
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bruto))
  return { bruto, hash: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('') }
}

// Lo que responde Auth cuando el correo no está en `permitidos` o el
// registro está cerrado; al usuario le basta saber que esa cuenta no entra.
function mensaje(error) {
  const t = String(error?.message || '')
  if (/registro-cerrado|signups not allowed|database error saving new user/i.test(t)) return 'Esa cuenta de Google no tiene acceso'
  return 'No se pudo iniciar sesión: ' + t
}

export async function botonIngreso(contenedor, alEntrar, alFallar = () => {}) {
  await cargarGis()
  const nonce = await nuevoNonce()
  const g = window.google.accounts.id
  g.initialize({
    client_id: CLIENT_ID,
    nonce: nonce.hash,
    callback: async (r) => {
      guardar(r.credential)
      const { error } = await supa().auth.signInWithIdToken({ provider: 'google', token: r.credential, nonce: nonce.bruto })
      if (error) { olvidar(); alFallar(mensaje(error)); return }
      alEntrar()
    },
    auto_select: true,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true,
  })
  g.renderButton(contenedor, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es', width: 300 })
  g.prompt()
}

export async function salir() {
  olvidar()
  try { await supa().auth.signOut({ scope: 'local' }) } catch { /* sin red: la sesión local igual se borra */ }
  try { window.google?.accounts.id.disableAutoSelect() } catch { /* sin GIS */ }
}
