/* Da de alta un celular que manda notificaciones (MacroDroid) y deja su clave
   en .env, que git ignora. La clave NO se imprime: queda en el historial de la
   terminal y del agente. Se copia desde .env a la macro y nada más.

   Uso:   node scripts/crear-dispositivo.mjs <correo-del-dueño> "<nombre>"
   Ej.:   node scripts/crear-dispositivo.mjs tu@gmail.com "Celular Android"

   Necesita en .env CLAVE_BASE_DATOS_FINANZASMAKER y el proyecto enlazado
   (`npx supabase link`, que deja la URL del pooler en supabase/.temp/).

   Entra como el dueño (rol authenticated + sus claims) y llama a
   crear_dispositivo(), el mismo camino que usará la página: no hay una
   segunda puerta para crear dispositivos. Cuando Ajustes tenga la sección de
   dispositivos, este script queda para emergencias. */
import { readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const RAIZ = join(import.meta.dirname, '..')
const [correo, nombre] = process.argv.slice(2)
if (!correo || !nombre) {
  console.error('Uso: node scripts/crear-dispositivo.mjs <correo-del-dueño> "<nombre>"')
  process.exit(1)
}

const env = Object.fromEntries(readFileSync(join(RAIZ, '.env'), 'utf8').split(/\r?\n/)
  .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]))
if (!env.CLAVE_BASE_DATOS_FINANZASMAKER) throw new Error('Falta CLAVE_BASE_DATOS_FINANZASMAKER en .env')

const url = new URL(readFileSync(join(RAIZ, 'supabase/.temp/pooler-url'), 'utf8').trim())
url.password = encodeURIComponent(env.CLAVE_BASE_DATOS_FINANZASMAKER)

// Nombre de la variable en .env: CLAVE_DISPOSITIVO_<NOMBRE EN MAYÚSCULAS>.
const variable = 'CLAVE_DISPOSITIVO_' + nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
if (env[variable]) throw new Error(`${variable} ya existe en .env: revoca ese dispositivo o elige otro nombre`)

const c = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  const u = await c.query('select id from auth.users where lower(email) = lower($1)', [correo])
  if (!u.rowCount) throw new Error(`No hay usuario con el correo ${correo}`)
  await c.query('begin')
  await c.query('set local role authenticated')
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u.rows[0].id, role: 'authenticated' })])
  const { rows } = await c.query('select crear_dispositivo($1) as clave', [nombre])
  // Primero queda en .env y recién después se confirma: si escribir falla, el
  // dispositivo no existe y no hay una clave perdida que nadie conoce.
  appendFileSync(join(RAIZ, '.env'), `\n${variable}=${rows[0].clave}\n`)
  await c.query('commit')
  console.log(`✓ Dispositivo «${nombre}» creado. Su clave quedó en .env como ${variable}.`)
} catch (e) {
  await c.query('rollback').catch(() => {})
  throw e
} finally {
  await c.end()
}
