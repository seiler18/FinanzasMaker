/* Recibe cada notificación de las apps de los bancos desde el celular (la
   app FinanzasMaker para Android, o MacroDroid) y la guarda cruda con
   registrar_notificacion() (supabase/migrations/0002_notificaciones.sql y
   0006_hora_del_aviso.sql).

   Sin JWT (`verify_jwt = false` en supabase/config.toml): el celular no tiene
   sesión de Supabase. Lo que identifica al celular es la cabecera `x-clave`,
   64 caracteres al azar; la base guarda solo su SHA-256 y la compara allí.

   No registra el contenido en los logs: es el texto de los avisos del banco. */
import { leerCuerpo } from './cuerpo.js'
import { leerAviso } from './lectores.js'
import { categorizar } from './reglas.js'

const URL_BASE = Deno.env.get('SUPABASE_URL') ?? ''
const CLAVE_SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const MAX_CUERPO = 16 * 1024

const responder = (status: number, cuerpo: Record<string, unknown>) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

// Los mensajes fijos de registrar_notificacion(), traducidos a HTTP.
const ERRORES: [string, number, string][] = [
  ['clave-invalida', 401, 'Clave no válida'],
  ['demasiadas', 429, 'Demasiadas notificaciones en un minuto'],
  ['paquete-vacio', 400, 'Falta el paquete de la app'],
]

// Llama a una función de la base con la clave de servicio.
const rpc = (nombre: string, args: Record<string, unknown>) =>
  fetch(`${URL_BASE}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: CLAVE_SERVICIO, authorization: `Bearer ${CLAVE_SERVICIO}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  })

/* Convierte el aviso recién guardado en movimiento (lectores.js). Nunca lanza:
   el aviso ya está a salvo en `notificaciones` y, si algo falla aquí, queda
   cruda para volver a leerla; que el celular reciba un error solo haría que la
   reenviara. Tampoco registra el contenido en los logs. */
async function tramitar(clave: string, d: ReturnType<typeof leerCuerpo>): Promise<string> {
  try {
    // El contexto va primero: el lector necesita el titular para reconocer
    // una transferencia a ti mismo (0008).
    const c = await rpc('contexto_aviso', { _clave: clave })
    if (!c.ok) throw new Error(`contexto ${c.status}`)
    const { reglas, titular, externas } = await c.json()
    const leido = leerAviso({ ...d, recibida: Date.now() }, { titular, externas })
    if (leido === null) return 'cruda'
    let args: Record<string, unknown> = { _clave: clave, _paquete: d.paquete, _titulo: d.titulo, _texto: d.texto }
    if ('ignorar' in leido) {
      args = { ...args, _estado: 'ignorada' }
    } else {
      args = { ...args, _estado: 'registrada', _mov: categorizar({ ...leido.mov }, reglas) }
    }
    const r = await rpc('aplicar_aviso', args)
    if (!r.ok) throw new Error(`aplicar ${r.status}`)
    return String(await r.json())
  } catch (e) {
    console.error('tramitar falló', e instanceof Error ? e.message : '')
    return 'cruda'
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { ok: false, error: 'Solo POST' })

  // Lo que no tiene forma de clave ni llega a la base.
  const clave = req.headers.get('x-clave') ?? ''
  if (!/^[0-9a-f]{64}$/.test(clave)) return responder(401, { ok: false, error: 'Clave no válida' })

  if (Number(req.headers.get('content-length') ?? 0) > MAX_CUERPO) return responder(413, { ok: false, error: 'Cuerpo muy grande' })
  const bruto = await req.text()
  if (bruto.length > MAX_CUERPO) return responder(413, { ok: false, error: 'Cuerpo muy grande' })

  let datos
  try {
    datos = leerCuerpo(bruto, req.headers.get('content-type') ?? '')
  } catch {
    return responder(400, { ok: false, error: 'Cuerpo no válido' })
  }

  const r = await fetch(`${URL_BASE}/rest/v1/rpc/registrar_notificacion`, {
    method: 'POST',
    headers: { apikey: CLAVE_SERVICIO, authorization: `Bearer ${CLAVE_SERVICIO}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      _clave: clave, _paquete: datos.paquete, _titulo: datos.titulo, _texto: datos.texto, _texto_largo: datos.texto_largo,
      _publicada: datos.publicada,
    }),
  })

  if (r.ok) {
    const estado = await r.json()
    // Una repetida ya se tramitó la primera vez.
    const aviso = estado === 'nueva' ? await tramitar(clave, datos) : undefined
    return responder(estado === 'nueva' ? 201 : 200, { ok: true, estado, aviso })
  }
  const err = await r.json().catch(() => ({}))
  const msg = String(err?.message ?? '')
  for (const [clave_error, status, texto] of ERRORES) {
    if (msg.includes(clave_error)) return responder(status, { ok: false, error: texto })
  }
  console.error('registrar_notificacion falló', r.status, err?.code ?? '')
  return responder(500, { ok: false, error: 'Error al guardar' })
})
