/* Vuelve a leer los avisos que quedaron crudos, con los lectores de hoy.

   Un aviso queda `cruda` cuando ningún lector lo entendía al llegar
   (supabase/functions/notificacion/lectores.js). Después de sumar un lector,
   este script les da una segunda pasada: hace lo mismo que la función
   `notificacion` (leer, categorizar con las reglas del dueño, tramitar), pero
   por id, con tramitar_aviso() (migración 0008).

   Uso:   node scripts/releer-avisos.mjs              ensayo: muestra qué haría
          node scripts/releer-avisos.mjs --aplicar    lo hace

   Necesita en .env CLAVE_BASE_DATOS_FINANZASMAKER y el proyecto enlazado
   (`npx supabase link`, que deja la URL del pooler en supabase/.temp/).

   No imprime el texto de los avisos (es lo que escribe el banco): solo el id,
   la app y lo que resultó. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { leerAviso } from '../supabase/functions/notificacion/lectores.js'
import { categorizar } from '../supabase/functions/notificacion/reglas.js'

const RAIZ = join(import.meta.dirname, '..')
const aplicar = process.argv.includes('--aplicar')

const env = Object.fromEntries(readFileSync(join(RAIZ, '.env'), 'utf8').split(/\r?\n/)
  .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
if (!env.CLAVE_BASE_DATOS_FINANZASMAKER) throw new Error('Falta CLAVE_BASE_DATOS_FINANZASMAKER en .env')

const url = new URL(readFileSync(join(RAIZ, 'supabase/.temp/pooler-url'), 'utf8').trim())
url.password = encodeURIComponent(env.CLAVE_BASE_DATOS_FINANZASMAKER)

const c = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  const { rows: crudas } = await c.query(`
    select id, usuario, paquete, titulo, texto, texto_largo,
           (extract(epoch from publicada) * 1000)::bigint as publicada,
           (extract(epoch from recibida) * 1000)::bigint as recibida
      from notificaciones where estado = 'cruda' order by recibida`)
  const contextos = new Map()
  const contexto = async (uid) => {
    if (!contextos.has(uid)) {
      const reglas = (await c.query('select patron, categoria, tipo from reglas where usuario = $1 order by id', [uid])).rows
      const cfg = Object.fromEntries((await c.query("select clave, valor from config where usuario = $1 and clave in ('titular', 'cuentas_externas')", [uid])).rows.map((f) => [f.clave, f.valor]))
      contextos.set(uid, { reglas, titular: cfg.titular || '', externas: cfg.cuentas_externas || '' })
    }
    return contextos.get(uid)
  }

  const cuenta = {}
  for (const n of crudas) {
    const ctx = await contexto(n.usuario)
    const leido = leerAviso({ ...n, publicada: n.publicada == null ? null : Number(n.publicada), recibida: Number(n.recibida) }, ctx)
    if (leido === null) { cuenta.cruda = (cuenta.cruda || 0) + 1; continue }
    const mov = 'ignorar' in leido ? null : categorizar({ ...leido.mov }, ctx.reglas)
    // Cada aviso en su transacción: uno que falle no deshace los demás. En el
    // ensayo se tramita igual y se deshace, así se ve si sería 'nueva' o
    // 'ya-estaba' (el correo ya lo trajo) sin cambiar nada.
    let resultado
    await c.query('begin')
    try {
      resultado = (await c.query('select tramitar_aviso($1, $2, $3) as r', [n.id, mov ? 'registrada' : 'ignorada', mov ? JSON.stringify(mov) : null])).rows[0].r
      await c.query(aplicar ? 'commit' : 'rollback')
    } catch (e) {
      await c.query('rollback')
      resultado = `error ${e.code || ''}`.trim()
    }
    cuenta[resultado] = (cuenta[resultado] || 0) + 1
    console.log(`#${n.id} ${n.paquete} → ${resultado}${mov ? ` (${mov.banco} ${mov.tipo} ${mov.monto})` : ''}`)
  }
  console.log(`\n${crudas.length} crudas:`, cuenta, aplicar ? '' : '\nEnsayo: nada cambió. Con --aplicar se hace.')
} finally {
  await c.end()
}
