import { API_URL, CLIENT_ID, SUPABASE_URL } from '../config.js'
import { credencial } from './sesion.js'
import { demoLlamar } from '../demo.js'
import { ACCIONES, ErrorDatos, ErrorValidacion } from './datos.js'

/* La puerta única de las vistas a los datos: `llamar(accion, datos)`.

   - Modo demo → src/demo.js, que contesta igual que lo real.
   - Todo lo demás → Supabase (src/lib/datos.js).
   - Salvo «sincronizar» («Revisar correos ahora»): eso es leer Gmail, y Gmail
     lo lee solo el trabajador de Apps Script. Se le pide por su URL /exec con
     el token de Google, que el script valida por su cuenta.

   POST con Content-Type text/plain al Apps Script: así la petición es
   «simple» y el navegador no lanza el preflight OPTIONS, que Apps Script no
   contesta. La credencial va en el CUERPO, nunca en la URL. */

export const modoDemo = () => !SUPABASE_URL || !CLIENT_ID || new URLSearchParams(location.search).has('demo')

export class ErrorApi extends Error {}

let alCaducar = () => {}
export const onSesionCaducada = (fn) => { alCaducar = fn }

export async function llamar(accion, datos = {}) {
  if (modoDemo()) return demoLlamar(accion, datos)
  if (accion === 'sincronizar') return sincronizar()
  const fn = Object.hasOwn(ACCIONES, accion) ? ACCIONES[accion] : null
  if (!fn) throw new ErrorApi('Acción no válida')
  try {
    return { ok: true, ...(await fn(datos)) }
  } catch (e) {
    if (e instanceof ErrorDatos && e.sesion) { alCaducar(); throw new ErrorApi(e.message) }
    if (e instanceof ErrorDatos || e instanceof ErrorValidacion) throw new ErrorApi(e.message)
    if (e instanceof TypeError) throw new ErrorApi('Sin conexión con el servidor')
    throw e
  }
}

const VOLVER = 'Para revisar los correos ahora, cierra sesión y vuelve a entrar con Google'

async function sincronizar() {
  const cred = credencial()
  if (!API_URL || !cred) throw new ErrorApi(VOLVER)
  let r
  try {
    r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'sincronizar', credencial: cred }),
      redirect: 'follow',
      credentials: 'omit',
    })
  } catch {
    throw new ErrorApi('Sin conexión con el Apps Script')
  }
  let j
  try { j = await r.json() } catch { throw new ErrorApi('Respuesta no válida del Apps Script') }
  // El token de Google dura una hora; la sesión de Supabase se renueva sola.
  // Que venza el primero no debe sacar a nadie de la página.
  if (!j.ok) throw new ErrorApi(j.sesion === false ? VOLVER : j.error || 'Error')
  return j
}
