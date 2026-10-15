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

test('registrar_notificacion: con la hora del celular, el mismo aviso reenviado después es repetido', async () => {
  const uid = await crearUsuario()
  const clave = await comoConfirmado(uid, async () => (await sql.query("select crear_dispositivo('celular') as c")).rows[0].c)
  const hace2h = Date.now() - 2 * 3600e3
  const con = (publicada, texto = 'Compraste $1.000 en COMERCIO') =>
    sql.query('select registrar_notificacion($1, $2, $3, $4, $5, $6) as r', [clave, 'com.tenpo.app', 'Compra', texto, '', publicada])
  await como('servicio', async () => {
    assert.equal((await con(hace2h)).rows[0].r, 'nueva')
    assert.equal((await con(hace2h)).rows[0].r, 'repetida')
    // Un reloj absurdo (un día en el futuro) se ignora: cuenta la hora de llegada.
    assert.equal((await con(Date.now() + 86400e3, 'Compraste $2.000 en OTRO')).rows[0].r, 'nueva')
    const { rows } = await sql.query('select publicada from notificaciones order by id')
    assert.ok(Math.abs(rows[0].publicada.getTime() - hace2h) < 2)
    assert.equal(rows[1].publicada, null)
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

// ---------------------------------------------------------------------------
// Finanzas (0004)
// ---------------------------------------------------------------------------

const mov = (usuario, extra = {}) => sql.query(
  'insert into movimientos (usuario, fecha, tipo, monto, contraparte, origen) values ($1, $2, $3, $4, $5, $6) returning id',
  [usuario, extra.fecha ?? '2026-10-01 12:00', extra.tipo ?? 'gasto', extra.monto ?? 1000, extra.contraparte ?? 'JUMBO', extra.origen ?? 'correo'])

test('movimientos: el dueño crea, corrige y borra lo suyo; otro no ve nada', async () => {
  const a = await crearUsuario()
  const b = await crearUsuario()
  const { rows: [{ id }] } = await mov(a)
  await como(b, async () => {
    assert.equal((await sql.query('select id from movimientos')).rowCount, 0)
    assert.equal((await sql.query("update movimientos set categoria = 'x'")).rowCount, 0)
    assert.equal((await sql.query('delete from movimientos')).rowCount, 0)
    // No puede escribir a nombre de otro.
    assert.equal((await falla("insert into movimientos (usuario, fecha, tipo, monto) values ($1, '2026-10-01 12:00', 'gasto', 1)", [a]))?.code, '42501')
  })
  await como(a, async () => {
    assert.equal((await sql.query('select id from movimientos')).rowCount, 1)
    const nuevo = await sql.query("insert into movimientos (fecha, tipo, monto) values ('2026-10-02 09:30', 'ingreso', 5000) returning id, usuario, origen")
    assert.match(nuevo.rows[0].id, /^M[0-9a-f]{10}$/)
    assert.equal(nuevo.rows[0].usuario, a)
    assert.equal(nuevo.rows[0].origen, 'manual')
    assert.equal((await sql.query("update movimientos set categoria = 'Supermercado' where id = $1", [id])).rowCount, 1)
    assert.equal((await falla('update movimientos set usuario = $1', [b]))?.code, '42501')
    assert.equal((await sql.query('delete from movimientos where id = $1', [id])).rowCount, 1)
  })
})

test('movimientos: la base rechaza una fecha, un tipo o un monto que la página no entendería', async () => {
  const a = await crearUsuario()
  await como(a, async () => {
    assert.equal((await falla("insert into movimientos (fecha, tipo, monto) values ('01/10/2026', 'gasto', 1)"))?.code, '23514')
    assert.equal((await falla("insert into movimientos (fecha, tipo, monto) values ('2026-10-01 12:00', 'regalo', 1)"))?.code, '23514')
    assert.equal((await falla("insert into movimientos (fecha, tipo, monto) values ('2026-10-01 12:00', 'gasto', -5)"))?.code, '23514')
  })
})

test('revisar, correos, inversiones y estado: los escribe el trabajador; la página solo decide', async () => {
  const a = await crearUsuario()
  await sql.query("insert into revisar (usuario, gmail_id, fecha, monto) values ($1, 'g1', '2026-10-01 12:00', 1000)", [a])
  await como(a, async () => {
    assert.equal((await falla("insert into revisar (gmail_id) values ('g2')"))?.code, '42501')
    assert.equal((await falla('update revisar set monto = 1'))?.code, '42501')
    assert.equal((await falla("insert into correos (gmail_id) values ('g2')"))?.code, '42501')
    assert.equal((await falla('delete from correos'))?.code, '42501')
    assert.equal((await falla('insert into estado_trabajador (usuario) values ($1)', [a]))?.code, '42501')
    assert.equal((await falla('update estado_trabajador set importando = true'))?.code, '42501')
    assert.equal((await falla("insert into inversiones (fecha) values ('2026-10-01 12:00')"))?.code, '42501')
  })
})

test('decidir_revisar: registrar crea el movimiento y marca el correo para la papelera, todo junto', async () => {
  const a = await crearUsuario()
  const b = await crearUsuario()
  await sql.query("insert into revisar (usuario, gmail_id, fecha) values ($1, 'g1', '2026-10-01 12:00'), ($1, 'g2', '2026-10-01 12:00')", [a])
  await sql.query("insert into correos (usuario, gmail_id, resultado) values ($1, 'g1', 'revisar'), ($1, 'g2', 'revisar')", [a])
  const m = { fecha: '2026-10-01 12:00', tipo: 'gasto', monto: 4990, contraparte: 'KIOSCO', categoria: 'Otros', banco: 'Tenpo' }

  await como(b, async () => {
    assert.match((await falla("select decidir_revisar('g1', 'registrar', $1)", [m]))?.message ?? '', /ya-no-pendiente/)
  })
  await como(a, async () => {
    const { rows: [{ id }] } = await sql.query("select decidir_revisar('g1', 'registrar', $1) as id", [m])
    const movs = await sql.query('select origen, gmail_id, monto from movimientos where id = $1', [id])
    assert.deepEqual(movs.rows, [{ origen: 'correo', gmail_id: 'g1', monto: '4990' }])
    const rev = await sql.query("select estado, borrar_correo from revisar where gmail_id = 'g1'")
    assert.deepEqual(rev.rows, [{ estado: 'registrado', borrar_correo: true }])
    const bit = await sql.query("select resultado, referencia from correos where gmail_id = 'g1'")
    assert.deepEqual(bit.rows, [{ resultado: 'registrado', referencia: id }])
    assert.match((await falla("select decidir_revisar('g1', 'registrar', $1)", [m]))?.message ?? '', /ya-no-pendiente/)

    // Descartar sin pedir borrar deja el correo en Gmail.
    await sql.query("select decidir_revisar('g2', 'descartar')")
    assert.deepEqual((await sql.query("select estado, borrar_correo from revisar where gmail_id = 'g2'")).rows, [{ estado: 'descartado', borrar_correo: false }])
  })
  // Con borrar_correos = no, registrar tampoco lo borra.
  await sql.query("insert into revisar (usuario, gmail_id, fecha) values ($1, 'g3', '2026-10-01 12:00')", [a])
  await sql.query("insert into config (usuario, clave, valor) values ($1, 'borrar_correos', 'no')", [a])
  await como(a, async () => {
    await sql.query("select decidir_revisar('g3', 'registrar', $1)", [m])
    assert.equal((await sql.query("select borrar_correo from revisar where gmail_id = 'g3'")).rows[0].borrar_correo, false)
  })
})

test('decidir_revisar: si el movimiento no es válido, no cambia nada', async () => {
  const a = await crearUsuario()
  await sql.query("insert into revisar (usuario, gmail_id, fecha) values ($1, 'g1', '2026-10-01 12:00')", [a])
  await como(a, async () => {
    assert.ok(await falla("select decidir_revisar('g1', 'registrar', $1)", [{ fecha: 'mal', tipo: 'gasto', monto: 1 }]))
    assert.match((await falla("select decidir_revisar('g1', 'otra')"))?.message ?? '', /decision-invalida/)
    assert.equal((await sql.query("select estado from revisar where gmail_id = 'g1'")).rows[0].estado, 'pendiente')
    assert.equal((await sql.query('select id from movimientos')).rowCount, 0)
  })
})

// ---------------------------------------------------------------------------
// Inversiones (0005)
// ---------------------------------------------------------------------------

test('inversiones: operaciones del dueño; precios y mapa los lee cualquiera con sesión y no los escribe nadie', async () => {
  const a = await crearUsuario()
  const b = await crearUsuario()
  await sql.query("insert into acciones_operaciones (usuario, fecha, tipo, ticker, cantidad, usd, gmail_id) values ($1, '2026-06-03', 'compra', 'VOO', 0.2, 120, 'x1')", [a])
  await sql.query("insert into acciones_precios (ticker, precio) values ('VOO', 600) on conflict do nothing")
  await como(b, async () => {
    assert.equal((await sql.query('select id from acciones_operaciones')).rowCount, 0)
    assert.equal((await sql.query('select ticker from acciones_precios')).rowCount, 1)
  })
  await como(a, async () => {
    assert.equal((await sql.query('select id from acciones_operaciones')).rowCount, 1)
    assert.equal((await falla("insert into acciones_operaciones (fecha, tipo) values ('2026-06-05', 'compra')"))?.code, '42501')
    assert.equal((await sql.query("update acciones_operaciones set ticker = 'VTI'")).rowCount, 1)
    assert.equal((await falla('update acciones_operaciones set usuario = $1', [b]))?.code, '42501')
    assert.equal((await falla("insert into acciones_precios (ticker) values ('X')"))?.code, '42501')
    assert.equal((await falla('update acciones_precios set precio = 1'))?.code, '42501')
    assert.equal((await falla("insert into acciones_mapa (nombre, ticker) values ('x', 'X')"))?.code, '42501')
    assert.equal((await falla("insert into acciones_alertas (tipo) values ('x')"))?.code, '42501')
  })
})

test('inversiones: un mismo correo de Fintual entra una vez', async () => {
  const a = await crearUsuario()
  await sql.query('begin')
  try {
    await sql.query("insert into acciones_operaciones (usuario, fecha, tipo, gmail_id) values ($1, '2026-06-03', 'compra', 'dup')", [a])
    assert.equal((await falla("insert into acciones_operaciones (usuario, fecha, tipo, gmail_id) values ($1, '2026-06-03', 'compra', 'dup')", [a]))?.code, '23505')
    // Lo cargado a mano (sin correo) no choca.
    assert.equal(await falla("insert into acciones_operaciones (usuario, fecha, tipo) values ($1, '2026-06-03', 'compra'), ($1, '2026-06-03', 'compra')", [a]), null)
  } finally {
    await sql.query('rollback')
  }
})

// ---------------------------------------------------------------------------
// Movimientos desde los avisos del celular (0007)
// ---------------------------------------------------------------------------

async function celular() {
  const uid = await crearUsuario()
  const clave = await comoConfirmado(uid, async () => (await sql.query("select crear_dispositivo('celular') as c")).rows[0].c)
  return { uid, clave }
}

const MACH_COMPRA = { fecha: '2026-10-14 19:53', banco: 'MACH', producto: 'Tarjeta de crédito', tipo: 'gasto', monto: 85112, contraparte: 'SKY AIRLINES BSP', categoria: 'Viajes', cuotas: 1, detalle: 'Tarjeta virtual' }

/* Guarda el aviso crudo y lo tramita, como hace la función `notificacion`. */
async function aviso(clave, texto, mov, estado = 'registrada') {
  await sql.query('select registrar_notificacion($1, $2, $3, $4, $5)', [clave, 'cl.bci.sismo.mach', 'MACHBANK', texto, ''])
  return (await sql.query('select aplicar_aviso($1, $2, $3, $4, $5, $6) as r', [clave, 'cl.bci.sismo.mach', 'MACHBANK', texto, estado, mov ? JSON.stringify(mov) : null])).rows[0].r
}

const filaCorreo = (uid, extra = {}) => sql.query(
  `insert into movimientos (usuario, fecha, banco, producto, tipo, monto, contraparte, categoria, cuotas, origen, gmail_id)
   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'correo', $10)`,
  [uid, extra.fecha ?? '2026-10-14 19:50', extra.banco ?? 'MACH', extra.producto ?? 'Tarjeta de crédito', extra.tipo ?? 'gasto', extra.monto ?? 85112,
    extra.contraparte ?? 'SKY AIRLINES', extra.categoria ?? 'Viajes', 'cuotas' in extra ? extra.cuotas : 3, extra.gmail_id ?? 'g1'])

test('avisos: solo la clave de servicio llama a aplicar_aviso y contexto_aviso', async () => {
  const { uid, clave } = await celular()
  for (const quien of [uid, null]) {
    await como(quien, async () => {
      assert.equal((await falla('select aplicar_aviso($1, $2, $3, $4, $5)', [clave, 'x', 'x', 'x', 'ignorada']))?.code, '42501')
      assert.equal((await falla('select contexto_aviso($1)', [clave]))?.code, '42501')
    })
  }
  await como('servicio', async () => {
    assert.match((await falla('select aplicar_aviso($1, $2, $3, $4, $5)', ['0'.repeat(64), 'x', 'x', 'x', 'ignorada']))?.message ?? '', /clave-invalida/)
    assert.match((await falla('select contexto_aviso($1)', ['0'.repeat(64)]))?.message ?? '', /clave-invalida/)
  })
})

test('avisos: el aviso crea el movimiento; el correo que llega después lo completa y no lo duplica', async () => {
  const { uid, clave } = await celular()
  await como('servicio', async () => {
    assert.equal(await aviso(clave, 'compra 1', MACH_COMPRA), 'nueva')
    let m = (await sql.query('select * from movimientos where usuario = $1', [uid])).rows
    assert.equal(m.length, 1)
    assert.equal(m[0].origen, 'notificacion')
    const id = m[0].id

    await filaCorreo(uid) // el correo: 3 cuotas, comercio exacto, 3 minutos antes
    m = (await sql.query('select * from movimientos where usuario = $1', [uid])).rows
    assert.equal(m.length, 1, 'no se duplica')
    assert.equal(m[0].id, id)
    assert.equal(m[0].origen, 'correo')
    assert.equal(m[0].cuotas, 3)
    assert.equal(m[0].contraparte, 'SKY AIRLINES')
    assert.equal(m[0].gmail_id, 'g1')
    const n = (await sql.query('select estado, movimiento from notificaciones where usuario = $1', [uid])).rows
    assert.deepEqual(n, [{ estado: 'registrada', movimiento: id }])

    // Una segunda compra igual, de verdad distinta, sí entra.
    await filaCorreo(uid, { gmail_id: 'g2' })
    assert.equal((await sql.query('select 1 from movimientos where usuario = $1', [uid])).rowCount, 2)
  })
})

test('avisos: si el correo llegó primero, el aviso no crea otro movimiento, y una segunda compra igual sí', async () => {
  const { uid, clave } = await celular()
  await como('servicio', async () => {
    await filaCorreo(uid)
    assert.equal(await aviso(clave, 'compra 1', MACH_COMPRA), 'ya-estaba')
    assert.equal((await sql.query('select 1 from movimientos where usuario = $1', [uid])).rowCount, 1)
    // El mismo correo ya está reclamado por el primer aviso: el segundo es otra compra.
    assert.equal(await aviso(clave, 'compra 2', MACH_COMPRA), 'nueva')
    assert.equal((await sql.query('select 1 from movimientos where usuario = $1', [uid])).rowCount, 2)
  })
})

test('avisos: banco, monto, sentido, producto u hora distintos no se confunden con el correo', async () => {
  const { uid, clave } = await celular()
  await como('servicio', async () => {
    await aviso(clave, 'compra 1', MACH_COMPRA)
    await filaCorreo(uid, { banco: 'Tenpo', gmail_id: 'a' })
    await filaCorreo(uid, { monto: 85113, gmail_id: 'b' })
    await filaCorreo(uid, { tipo: 'ingreso', gmail_id: 'c' })
    await filaCorreo(uid, { fecha: '2026-10-14 23:59', gmail_id: 'd' })
    await filaCorreo(uid, { producto: 'Cuenta', gmail_id: 'e' })
    const { rows } = await sql.query('select origen from movimientos where usuario = $1', [uid])
    assert.equal(rows.length, 6)
    assert.equal(rows.filter((r) => r.origen === 'notificacion').length, 1)
  })
})

test('avisos: el gasto del aviso se corrige a interna cuando el correo dice que era entre tus cuentas', async () => {
  const { uid, clave } = await celular()
  await como('servicio', async () => {
    await aviso(clave, 'transferencia', { fecha: '2026-10-14 20:00', banco: 'Tenpo', producto: 'Cuenta', tipo: 'gasto', monto: 8000, contraparte: '', categoria: 'Otros', cuotas: null, detalle: '' })
    await filaCorreo(uid, { fecha: '2026-10-14 20:00', banco: 'Tenpo', producto: 'Cuenta', tipo: 'interna', monto: 8000, contraparte: 'Jesus Seiler', categoria: 'Entre mis cuentas', cuotas: null })
    const { rows } = await sql.query('select tipo, contraparte from movimientos where usuario = $1', [uid])
    assert.deepEqual(rows, [{ tipo: 'interna', contraparte: 'Jesus Seiler' }])
  })
})

test('avisos: el ruido se marca ignorado y un formato desconocido queda crudo', async () => {
  const { uid, clave } = await celular()
  await como('servicio', async () => {
    assert.equal(await aviso(clave, 'sesion', null, 'ignorada'), 'ignorada')
    await sql.query('select registrar_notificacion($1, $2, $3, $4, $5)', [clave, 'cl.bci.sismo.mach', 'MACHBANK', 'algo nuevo', ''])
    assert.equal((await sql.query('select aplicar_aviso($1, $2, $3, $4, $5) as r', [clave, 'cl.bci.sismo.mach', 'MACHBANK', 'algo nuevo', 'cruda'])).rows[0].r, 'cruda')
    const { rows } = await sql.query('select estado from notificaciones where usuario = $1 order by id', [uid])
    assert.deepEqual(rows.map((r) => r.estado), ['ignorada', 'cruda'])
    // Un aviso que no se guardó antes no se tramita.
    assert.equal((await sql.query('select aplicar_aviso($1, $2, $3, $4, $5) as r', [clave, 'cl.bci.sismo.mach', 'MACHBANK', 'nunca llegó', 'ignorada'])).rows[0].r, 'sin-aviso')
  })
})

test('avisos: un movimiento inválido lo rechaza la tabla y el aviso queda crudo', async () => {
  const { uid, clave } = await celular()
  await como('servicio', async () => {
    await sql.query('select registrar_notificacion($1, $2, $3, $4, $5)', [clave, 'cl.bci.sismo.mach', 'MACHBANK', 'x', ''])
    const e = await falla('select aplicar_aviso($1, $2, $3, $4, $5, $6)', [clave, 'cl.bci.sismo.mach', 'MACHBANK', 'x', 'registrada', JSON.stringify({ ...MACH_COMPRA, tipo: 'regalo' })])
    assert.equal(e?.code, '23514')
    assert.equal((await sql.query('select estado from notificaciones where usuario = $1', [uid])).rows[0].estado, 'cruda')
  })
})
