// Pruebas de la base (supabase/migrations/) sobre un Postgres 17 desechable.
//
// `embedded-postgres` baja los binarios por npm y levanta un Postgres en una
// carpeta temporal: corre igual en Windows y en el runner de Actions, sin
// instalar nada. Se le aplica supabase/pruebas/supabase-minimo.sql y todas las
// migraciones en orden; que se apliquen ya es una prueba.
//
// Una política se valida demostrando que NIEGA, no que permite: casi todo lo
// de abajo entra con el rol equivocado. Con PRUEBAS_PG_URL (un superusuario de
// cualquier Postgres) se usa ese en vez del desechable.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const RAIZ = join(import.meta.dirname, '..', 'supabase')
const BASE = 'pruebas_finanzasmaker'

const migraciones = () => readdirSync(join(RAIZ, 'migrations'))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
  .map((nombre) => ({ nombre, sql: readFileSync(join(RAIZ, 'migrations', nombre), 'utf8') }))

let sql
let detener = async () => {}

before(async () => {
  let conexion
  if (process.env.PRUEBAS_PG_URL) {
    const u = new URL(process.env.PRUEBAS_PG_URL)
    conexion = { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }
  } else {
    const { default: EmbeddedPostgres } = await import('embedded-postgres')
    const dir = mkdtempSync(join(tmpdir(), 'finanzasmaker-pg-'))
    const port = 55000 + Math.floor(Math.random() * 5000)
    const pgEmb = new EmbeddedPostgres({
      databaseDir: join(dir, 'datos'), user: 'postgres', password: 'postgres', port, persistent: false,
      // UTF-8 con el locale propio de Postgres 17: igual en Windows y Linux.
      initdbFlags: ['--encoding=UTF8', '--locale-provider=builtin', '--builtin-locale=C.UTF-8', '--locale=C'],
      onLog: () => {}, onError: () => {},
    })
    await pgEmb.initialise()
    await pgEmb.start()
    conexion = { host: 'localhost', port, user: 'postgres', password: 'postgres' }
    detener = async () => { await pgEmb.stop(); rmSync(dir, { recursive: true, force: true }) }
  }

  const admin = new pg.Client({ ...conexion, database: 'postgres' })
  await admin.connect()
  await admin.query(`drop database if exists ${BASE} with (force)`)
  await admin.query(`create database ${BASE}`)
  await admin.end()

  sql = new pg.Client({ ...conexion, database: BASE })
  await sql.connect()
  sql.on('notice', () => {})
  await sql.query(readFileSync(join(RAIZ, 'pruebas', 'supabase-minimo.sql'), 'utf8'))
  for (const m of migraciones()) {
    try { await sql.query(m.sql) } catch (e) { throw new Error(`${m.nombre} no corre: ${e.message}`) }
  }
})

after(async () => {
  await sql?.end()
  await detener()
})

// ---------------------------------------------------------------------------
// Herramientas
// ---------------------------------------------------------------------------

/* Corre `fn` en una transacción con la identidad que tendría una petición
   por PostgREST: rol + claims del JWT. `quien` es un uuid (authenticated),
   null (anon) o 'servicio' (service_role). Siempre se deshace al final. */
async function como(quien, fn) {
  const rol = quien === 'servicio' ? 'service_role' : quien ? 'authenticated' : 'anon'
  const claims = quien && quien !== 'servicio' ? { sub: quien, role: rol } : { role: rol }
  await sql.query('begin')
  try {
    await sql.query(`set local role ${rol}`)
    await sql.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)])
    return await fn()
  } finally {
    await sql.query('rollback')
  }
}

/* Lo mismo, pero confirmando: para preparar datos que otra prueba lee. */
async function comoConfirmado(quien, fn) {
  const rol = quien === 'servicio' ? 'service_role' : quien ? 'authenticated' : 'anon'
  const claims = quien && quien !== 'servicio' ? { sub: quien, role: rol } : { role: rol }
  await sql.query('begin')
  try {
    await sql.query(`set local role ${rol}`)
    await sql.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)])
    const r = await fn()
    await sql.query('commit')
    return r
  } catch (e) {
    await sql.query('rollback')
    throw e
  }
}

/* El error de una promesa que debía fallar (o null si no falló). Dentro de
   `como()` un error aborta la transacción: se usa un savepoint para seguir. */
async function falla(consulta, params) {
  await sql.query('savepoint antes')
  try {
    await sql.query(consulta, params)
    await sql.query('release savepoint antes')
    return null
  } catch (e) {
    await sql.query('rollback to savepoint antes')
    return { code: e.code, message: e.message }
  }
}

async function crearUsuario(email = `${randomUUID().slice(0, 8)}@prueba.test`) {
  await sql.query('insert into permitidos (email) values ($1) on conflict do nothing', [email])
  const { rows } = await sql.query('insert into auth.users (email) values ($1) returning id', [email])
  return rows[0].id
}

const registrar = (clave, paquete = 'com.tenpo.app', titulo = 'Compra', texto = 'Compraste $1.000 en COMERCIO') =>
  sql.query('select registrar_notificacion($1, $2, $3, $4, $5) as r', [clave, paquete, titulo, texto, ''])

// ---------------------------------------------------------------------------
// El esquema completo
// ---------------------------------------------------------------------------

test('las migraciones van numeradas sin huecos ni repetidos', () => {
  const numeros = migraciones().map((m) => Number(m.nombre.slice(0, 4)))
  assert.deepEqual(numeros, numeros.map((_, i) => i + 1))
})

test('todas las migraciones se pueden aplicar otra vez encima', async () => {
  for (const m of migraciones()) {
    try { await sql.query(m.sql) } catch (e) { assert.fail(`${m.nombre} no es re-ejecutable: ${e.message}`) }
  }
})

test('toda tabla de public tiene RLS activo', async () => {
  const { rows } = await sql.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`)
  assert.deepEqual(rows.map((r) => r.relname), [])
})

test('una tabla nueva de public sale con RLS sin pedirlo (rls_automatico)', async () => {
  await sql.query('begin')
  try {
    await sql.query('create table tabla_olvidada (x int)')
    const { rows } = await sql.query("select relrowsecurity from pg_class where relname = 'tabla_olvidada'")
    assert.equal(rows[0].relrowsecurity, true)
  } finally {
    await sql.query('rollback')
  }
})

// Una función `security definer` sin `search_path` fijo se puede secuestrar
// creando un objeto con el mismo nombre en un esquema que vaya antes.
test('toda función security definer de public fija su search_path', async () => {
  const { rows } = await sql.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
    order by 1`)
  assert.deepEqual(rows.map((r) => r.proname), [])
})

test('anon no tiene ningún privilegio sobre tablas ni secuencias de public', async () => {
  const { rows } = await sql.query(`
    select c.relname, p.priv from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['select', 'insert', 'update', 'delete']) p(priv)
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege('anon', c.oid, p.priv)
    union all
    select c.relname, 'usage' from pg_class c join pg_namespace n on n.oid = c.relnamespace
    -- El CASE evita que Postgres evalúe la función sobre algo que no es secuencia.
    where n.nspname = 'public' and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage') else false end
    order by 1, 2`)
  assert.deepEqual(rows, [])
})

// Las de trigger y de eventos no cuentan: Postgres no deja llamarlas sueltas.
test('anon no ejecuta ninguna función de public', async () => {
  const { rows } = await sql.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
      and has_function_privilege('anon', p.oid, 'execute')
    order by 1`)
  assert.deepEqual(rows.map((r) => r.proname), [])
})

// Funciones `security definer` que un usuario con sesión puede llamar. Una
// nueva que aparezca aquí hay que justificarla o revocarla.
test('authenticated ejecuta solo las funciones security definer previstas', async () => {
  const { rows } = await sql.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
      and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1`)
  assert.deepEqual(rows.map((r) => r.proname), ['crear_dispositivo'])
})

// ---------------------------------------------------------------------------
// Registro cerrado
// ---------------------------------------------------------------------------

test('solo un correo de permitidos puede crear cuenta', async () => {
  await sql.query('begin')
  try {
    const fuera = await falla("insert into auth.users (email) values ('intruso@prueba.test')")
    assert.match(fuera?.message ?? '', /registro-cerrado/)
    const sinCorreo = await falla('insert into auth.users (phone) values ($1)', ['+56900000000'])
    assert.match(sinCorreo?.message ?? '', /registro-cerrado/)
    await sql.query("insert into permitidos (email) values ('dueno@prueba.test')")
    assert.equal(await falla("insert into auth.users (email) values ('DUENO@prueba.test')"), null)
  } finally {
    await sql.query('rollback')
  }
})

test('nadie con la API lee ni escribe permitidos', async () => {
  const uid = await crearUsuario()
  for (const quien of [null, uid]) {
    await como(quien, async () => {
      assert.equal((await falla('select * from permitidos'))?.code, '42501')
      assert.equal((await falla("insert into permitidos (email) values ('otro@prueba.test')"))?.code, '42501')
    })
  }
})

// ---------------------------------------------------------------------------
// Dispositivos y notificaciones
// ---------------------------------------------------------------------------

test('crear_dispositivo: exige sesión y guarda solo el hash', async () => {
  const uid = await crearUsuario()
  await como(null, async () => {
    assert.equal((await falla("select crear_dispositivo('celular')"))?.code, '42501')
  })
  await como(uid, async () => {
    const { rows } = await sql.query("select crear_dispositivo('celular') as clave")
    assert.match(rows[0].clave, /^[0-9a-f]{64}$/)
    const vistos = await sql.query('select nombre, usuario from dispositivos')
    assert.deepEqual(vistos.rows, [{ nombre: 'celular', usuario: uid }])
    // El hash no se lee ni se elige desde la página.
    assert.equal((await falla('select clave_hash from dispositivos'))?.code, '42501')
    assert.equal((await falla("insert into dispositivos (nombre, clave_hash) values ('x', repeat('a', 64))"))?.code, '42501')
  })
  const { rows } = await sql.query('select count(*)::int as n from dispositivos where usuario = $1', [uid])
  assert.equal(rows[0].n, 0, 'como() deshace: no debe quedar nada')
})

test('crear_dispositivo: hasta 5 activos por usuario', async () => {
  const uid = await crearUsuario()
  await como(uid, async () => {
    for (let i = 0; i < 5; i++) await sql.query('select crear_dispositivo($1)', [`c${i}`])
    assert.match((await falla("select crear_dispositivo('sexto')"))?.message ?? '', /demasiados-dispositivos/)
  })
})

test('registrar_notificacion: solo la clave de servicio la puede llamar', async () => {
  const uid = await crearUsuario()
  const clave = await comoConfirmado(uid, async () => (await sql.query("select crear_dispositivo('celular') as c")).rows[0].c)
  for (const quien of [null, uid]) {
    await como(quien, async () => {
      assert.equal((await falla('select registrar_notificacion($1, $2)', [clave, 'com.tenpo.app']))?.code, '42501')
    })
  }
  await como('servicio', async () => {
    assert.equal((await registrar(clave)).rows[0].r, 'nueva')
  })
})

test('registrar_notificacion: clave inválida, revocada o paquete vacío', async () => {
  const uid = await crearUsuario()
  const clave = await comoConfirmado(uid, async () => (await sql.query("select crear_dispositivo('celular') as c")).rows[0].c)
  await como('servicio', async () => {
    assert.match((await falla('select registrar_notificacion($1, $2)', ['0'.repeat(64), 'com.tenpo.app']))?.message ?? '', /clave-invalida/)
    assert.match((await falla('select registrar_notificacion($1, $2)', [null, 'com.tenpo.app']))?.message ?? '', /clave-invalida/)
    assert.match((await falla('select registrar_notificacion($1, $2)', [clave, '   ']))?.message ?? '', /paquete-vacio/)
  })
  await comoConfirmado(uid, () => sql.query('update dispositivos set revocado = now()'))
  await como('servicio', async () => {
    assert.match((await falla('select registrar_notificacion($1, $2)', [clave, 'com.tenpo.app']))?.message ?? '', /clave-invalida/)
  })
})

test('registrar_notificacion: la misma notificación en el mismo minuto entra una vez', async () => {
  const uid = await crearUsuario()
  const clave = await comoConfirmado(uid, async () => (await sql.query("select crear_dispositivo('celular') as c")).rows[0].c)
  await como('servicio', async () => {
    assert.equal((await registrar(clave)).rows[0].r, 'nueva')
    assert.equal((await registrar(clave)).rows[0].r, 'repetida')
    assert.equal((await registrar(clave, 'com.tenpo.app', 'Compra', 'Compraste $2.000 en OTRO')).rows[0].r, 'nueva')
    const { rows } = await sql.query('select usuario, estado from notificaciones')
    assert.deepEqual(rows, [{ usuario: uid, estado: 'cruda' }, { usuario: uid, estado: 'cruda' }])
  })
})

test('registrar_notificacion: tope de 60 por minuto por celular', async () => {
  const uid = await crearUsuario()
  const clave = await comoConfirmado(uid, async () => (await sql.query("select crear_dispositivo('celular') as c")).rows[0].c)
  await como('servicio', async () => {
    for (let i = 0; i < 60; i++) await registrar(clave, 'com.tenpo.app', 'Compra', `Compraste $${i}`)
    assert.match((await falla('select registrar_notificacion($1, $2, $3, $4)', [clave, 'com.tenpo.app', 'x', 'la 61']))?.message ?? '', /demasiadas/)
  })
})

test('notificaciones: cada uno ve y toca solo las suyas', async () => {
  const a = await crearUsuario()
  const b = await crearUsuario()
  const clave = await comoConfirmado(a, async () => (await sql.query("select crear_dispositivo('celular') as c")).rows[0].c)
  await comoConfirmado('servicio', () => registrar(clave))

  await como(b, async () => {
    assert.equal((await sql.query('select * from notificaciones')).rowCount, 0)
    assert.equal((await sql.query("update notificaciones set estado = 'ignorada'")).rowCount, 0)
    assert.equal((await sql.query('delete from notificaciones')).rowCount, 0)
    assert.equal((await sql.query('select id from dispositivos')).rowCount, 0)
    assert.equal((await sql.query('update dispositivos set revocado = now()')).rowCount, 0)
  })
  await como(a, async () => {
    assert.equal((await sql.query('select * from notificaciones')).rowCount, 1)
    assert.equal((await sql.query("update notificaciones set estado = 'ignorada'")).rowCount, 1)
    // Solo `estado` se cambia; el contenido y el dueño, no.
    assert.equal((await falla('update notificaciones set usuario = $1', [b]))?.code, '42501')
    assert.equal((await falla("update notificaciones set texto = 'otro'"))?.code, '42501')
    assert.equal((await falla("insert into notificaciones (usuario, paquete, huella) values ($1, 'x', repeat('a', 64))", [a]))?.code, '42501')
    assert.equal((await falla('update dispositivos set usuario = $1', [b]))?.code, '42501')
  })
})
