import { API_URL, CLIENT_ID } from '../config.js'
import { credencial, olvidar } from './sesion.js'
import { demoLlamar } from '../demo.js'

/* Cliente del backend de Apps Script.

   POST con Content-Type text/plain: así la petición es «simple» y el
   navegador no lanza el preflight OPTIONS, que Apps Script no contesta.
   La credencial (el ID token de Google) va en el CUERPO, nunca en la URL:
   las URL quedan en historiales, registros de proxys y en el Referer. */

export const modoDemo = () => !API_URL || !CLIENT_ID || new URLSearchParams(location.search).has('demo')

export class ErrorApi extends Error {}

let alCaducar = () => {}
export const onSesionCaducada = (fn) => { alCaducar = fn }

export async function llamar(accion, datos = {}) {
  if (modoDemo()) return demoLlamar(accion, datos)
  let r
  try {
    r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...datos, accion, credencial: credencial() }),
      redirect: 'follow',
      credentials: 'omit',
    })
  } catch {
    throw new ErrorApi('Sin conexión con el servidor')
  }
  let j
  try { j = await r.json() } catch { throw new ErrorApi('Respuesta no válida del servidor') }
  if (!j.ok) {
    if (j.sesion === false) { olvidar(); alCaducar() }
    throw new ErrorApi(j.error || 'Error')
  }
  return j
}
