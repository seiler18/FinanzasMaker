/* Las acciones de la página contra Supabase.

   Cada una devuelve lo mismo que devolvía la acción homónima de
   backend/Code.gs cuando la página le hablaba al Apps Script: así las vistas
   no cambiaron, y src/demo.js sigue siendo el mismo backend de mentira.
   Quien entra aquí ya tiene sesión: la RLS de cada tabla deja ver y tocar
   solo lo del dueño (supabase/migrations/0004_finanzas.sql). */
import { supa } from './supa.js'
import { validarMov, validarMovCartola, validarTipo, texto, enteroPositivo, fechaValida, ahoraChile, ErrorValidacion } from './validar.js'
import { clave } from './reglas.js'
import { CONFIG_BASE, conBase } from './config-base.js'

export class ErrorDatos extends Error {
  constructor(msg, { sesion = false } = {}) { super(msg); this.sesion = sesion }
}

// supabase-js no lanza: devuelve { data, error }. Esto lo vuelve una
// excepción con un mensaje que se le puede mostrar a la persona.
async function q(consulta) {
  const { data, error } = await consulta
  if (error) throw traducir(error)
  return data
}

function traducir(e) {
  const msg = String(e?.message || '')
  const code = String(e?.code || '')
  if (/^PGRST30/.test(code) || /jwt (expired|is invalid|malformed)/i.test(msg)) return new ErrorDatos('Inicia sesión de nuevo', { sesion: true })
  if (msg.includes('ya-no-pendiente')) return new ErrorDatos('Ya no está pendiente')
  if (msg.includes('demasiados-dispositivos')) return new ErrorDatos('Ya hay 5 celulares activos: revoca uno antes de vincular otro')
  if (code === '42501') return new ErrorDatos('Sin permiso para eso')
  if (code === '23514') return new ErrorDatos('La base rechazó un dato con formato no válido')
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return new ErrorDatos('Sin conexión con el servidor')
  return new ErrorDatos(msg || 'Error')
}

// PostgREST corta en 1000 filas por respuesta: se pide por páginas, con un
// orden total (`id` al final) para que ninguna fila caiga entre dos páginas.
const PAGINA = 1000
async function todas(armar) {
  const out = []
  for (let desde = 0; ; desde += PAGINA) {
    const filas = await q(armar().range(desde, desde + PAGINA - 1))
    out.push(...filas)
    if (filas.length < PAGINA) return out
  }
}

const COLS_MOV = 'id, fecha, banco, producto, tipo, monto, moneda, monto_original, contraparte, categoria, cuotas, detalle, nota, origen, registrado, fecha_contable'
const COLS_INV = 'id, fecha, plataforma, operacion, instrumento, monto, moneda, detalle, registrado'
const COLS_REV = 'gmail_id, fecha, remitente, asunto, motivo, tipo, monto, contraparte, banco, extracto, estado'

// La hoja devolvía '' en una celda vacía; la base, null. Las vistas esperan lo primero.
const vacio = (v) => (v == null ? '' : v)
const deMov = (f) => ({ ...f, monto: Number(f.monto) || 0, monto_original: f.monto_original == null ? '' : Number(f.monto_original), cuotas: vacio(f.cuotas) })
const deInv = (f) => ({ ...f, monto: Number(f.monto) || 0 })
const deRev = (f) => ({ ...f, monto: f.monto == null ? '' : Number(f.monto) })

const reglasDelDueno = () => todas(() => supa().from('reglas').select('patron, categoria, tipo').order('id'))

async function usuario() {
  const { data } = await supa().auth.getSession()
  const id = data?.session?.user?.id
  if (!id) throw new ErrorDatos('Inicia sesión de nuevo', { sesion: true })
  return id
}

/* El id de un movimiento de cartola: siempre el mismo para la misma fila del
   mismo dueño (src/lib/cartolas/clasificar.js arma la clave). */
export async function idCartola(uid, clave) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${uid}|${clave}`))
  return 'C' + [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const ACCIONES = {
  async datos() {
    const sb = supa()
    const [movimientos, inversiones, revisar, presupuestos, reglas, config, est] = await Promise.all([
      todas(() => sb.from('movimientos').select(COLS_MOV).order('fecha').order('id')),
      todas(() => sb.from('inversiones').select(COLS_INV).order('fecha').order('id')),
      q(sb.from('revisar').select(COLS_REV).eq('estado', 'pendiente').order('fecha')),
      q(sb.from('presupuestos').select('categoria, monto_mensual')),
      reglasDelDueno(),
      q(sb.from('config').select('clave, valor')),
      q(sb.from('estado_trabajador').select('ultima, importando').maybeSingle()),
    ])
    const cfg = conBase(config)
    return {
      movimientos: movimientos.map(deMov),
      inversiones: inversiones.map(deInv),
      revisar: revisar.map(deRev),
      presupuestos: presupuestos.map((p) => ({ categoria: p.categoria, monto_mensual: Number(p.monto_mensual) || 0 })),
      reglas,
      config: cfg,
      estado: {
        ultima: est?.ultima || '',
        importando: Boolean(est?.importando),
        borrar: String(cfg.borrar_correos).toLowerCase() === 'si',
        titular: cfg.titular || '',
      },
    }
  },

  async agregar(b) {
    const m = validarMov(b.mov || {}, await reglasDelDueno())
    const fila = await q(supa().from('movimientos')
      .insert({ ...m, origen: 'manual', registrado: ahoraChile() })
      .select(COLS_MOV).single())
    return { mov: deMov(fila) }
  },

  /* Cambiar tipo o categoría. Con `regla: true` además se guarda la regla
     «esta contraparte → esta categoría» y se aplica a los movimientos que ya
     tenían la misma contraparte: así se corrige una vez, no cien. */
  async editar(b) {
    const sb = supa()
    const id = texto(b.id, 40)
    const cambios = {}
    if (b.tipo != null) cambios.tipo = validarTipo(b.tipo)
    if (b.categoria != null) cambios.categoria = texto(b.categoria, 40) || 'Otros'
    if (b.nota != null) cambios.nota = texto(b.nota, 200)
    // Vacío = que vuelva a contar en su fecha real.
    if (b.fecha_contable != null) cambios.fecha_contable = b.fecha_contable === '' ? '' : fechaValida(b.fecha_contable).slice(0, 10)
    const m = await q(sb.from('movimientos').select('id, origen, contraparte').eq('id', id).maybeSingle())
    if (!m) throw new ErrorDatos('No existe ese movimiento')
    // Lo que leyó un lector no se reescribe a mano: si está mal, está mal el lector.
    if (m.origen === 'manual') {
      if (b.monto != null) cambios.monto = enteroPositivo(b.monto)
      if (b.contraparte != null) cambios.contraparte = texto(b.contraparte, 80)
      if (b.fecha != null) cambios.fecha = fechaValida(b.fecha)
    }
    let aplicados = 0
    if (b.regla && cambios.categoria && m.contraparte) {
      await q(sb.from('reglas').insert({ patron: m.contraparte, categoria: cambios.categoria, tipo: cambios.tipo || '' }))
      const k = clave(m.contraparte)
      const todos = await todas(() => sb.from('movimientos').select('id, contraparte').order('id'))
      const ids = todos.filter((f) => f.id !== id && clave(f.contraparte) === k).map((f) => f.id)
      const extra = { categoria: cambios.categoria, ...(cambios.tipo ? { tipo: cambios.tipo } : {}) }
      // De a 200: una lista de ids muy larga no cabe en la URL de PostgREST.
      for (let i = 0; i < ids.length; i += 200) await q(sb.from('movimientos').update(extra).in('id', ids.slice(i, i + 200)))
      aplicados = ids.length
    }
    if (Object.keys(cambios).length) await q(sb.from('movimientos').update(cambios).eq('id', id))
    return { aplicados }
  },

  async eliminar(b) {
    // La bitácora `correos` queda: impide que el mismo correo (si sigue en la
    // papelera) vuelva a entrar en la próxima pasada.
    const filas = await q(supa().from('movimientos').delete().eq('id', texto(b.id, 40)).select('id'))
    if (!filas.length) throw new ErrorDatos('No existe ese movimiento')
    return {}
  },

  /* Decidir un «Por revisar». El correo no se borra desde aquí (Gmail lo toca
     solo el trabajador): queda marcado y se va a la papelera en la próxima
     pasada. `borrado` dice si quedó marcado. */
  async revisar(b) {
    const sb = supa()
    const gid = texto(b.gmail_id, 40)
    const fila = await q(sb.from('revisar').select(COLS_REV).eq('gmail_id', gid).eq('estado', 'pendiente').maybeSingle())
    if (!fila) throw new ErrorDatos('Ya no está pendiente')
    let mov = null
    if (b.decision === 'registrar') {
      const base = { fecha: fila.fecha, banco: fila.banco, contraparte: fila.contraparte, tipo: fila.tipo || 'gasto', monto: fila.monto }
      mov = { ...validarMov({ ...base, ...(b.mov || {}) }, await reglasDelDueno()), registrado: ahoraChile() }
    } else if (b.decision !== 'descartar') {
      throw new ErrorDatos('Decisión no válida')
    }
    const id = await q(sb.rpc('decidir_revisar', { _gmail_id: gid, _decision: b.decision, _mov: mov, _borrar: b.borrar === true }))
    const marcado = await q(sb.from('revisar').select('borrar_correo').eq('gmail_id', gid).maybeSingle())
    return { borrado: Boolean(marcado?.borrar_correo), id: id || '' }
  },

  async presupuesto(b) {
    const categoria = texto(b.categoria, 40)
    if (!categoria) throw new ErrorDatos('Falta la categoría')
    const monto = Math.max(0, Math.round(Number(b.monto) || 0))
    const t = supa().from('presupuestos')
    if (monto > 0) await q(t.upsert({ categoria, monto_mensual: monto }, { onConflict: 'usuario,categoria' }))
    else await q(t.delete().eq('categoria', categoria))
    return {}
  },

  /* Guardar la configuración (Ajustes). Solo las claves conocidas. */
  async config(b) {
    const conocidas = new Set(CONFIG_BASE.map(([k]) => k))
    const filas = Object.entries(b.valores || {})
      .filter(([k]) => conocidas.has(k))
      .map(([k, v]) => ({ clave: k, valor: texto(v, 500) }))
    if (!filas.length) return {}
    await q(supa().from('config').upsert(filas, { onConflict: 'usuario,clave' }))
    return {}
  },

  /* Agregar lo que el dueño eligió de una cartola (src/vistas/cartola.js).
     Con id fijo y «on conflict do nothing»: subir la misma cartola dos veces
     no duplica nada. */
  async importar_cartola(b) {
    const uid = await usuario()
    const registrado = ahoraChile()
    const filas = []
    const ids = new Set()
    for (const x of (b.movs || []).slice(0, 1000)) {
      const id = await idCartola(uid, texto(x.clave, 300))
      if (ids.has(id)) continue
      ids.add(id)
      filas.push({ id, ...validarMovCartola(x), origen: 'cartola', registrado })
    }
    let agregados = 0
    for (let i = 0; i < filas.length; i += 200) {
      const r = await q(supa().from('movimientos').upsert(filas.slice(i, i + 200), { onConflict: 'id', ignoreDuplicates: true }).select('id'))
      agregados += r.length
    }
    return { agregados, repetidos: filas.length - agregados }
  },

  /* Dar de alta un celular (la app FinanzasMaker para Android). La clave sale
     UNA vez: la página se la pasa a la app y no la guarda. */
  async vincular(b) {
    const nombre = texto(b.nombre, 60) || 'App Android'
    const clave = String(await q(supa().rpc('crear_dispositivo', { _nombre: nombre })))
    if (!/^[0-9a-f]{64}$/.test(clave)) throw new ErrorDatos('La base no devolvió una clave válida')
    return { clave, nombre }
  },

  /* Revocar un celular: su clave deja de servir en el acto. */
  async revocar(b) {
    const filas = await q(supa().from('dispositivos').update({ revocado: new Date().toISOString() })
      .eq('id', texto(b.id, 40)).is('revocado', null).select('id'))
    if (!filas.length) throw new ErrorDatos('Ese celular ya no está activo')
    return {}
  },

  /* Lo que llegó del celular: para comprobar que la app (o la macro) funciona.
     `avisados` (movimientos que reconoció un aviso) y `desde` alimentan la
     cobertura por banco (coberturaAvisos): cuenta desde el primer aviso que
     se convirtió en movimiento, y como mucho 30 días. */
  async celular() {
    const sb = supa()
    const hace30 = new Date(Date.now() - 30 * 864e5)
    const [dispositivos, notificaciones, total, avisos] = await Promise.all([
      q(sb.from('dispositivos').select('id, nombre, creado, ultimo_uso, revocado').order('creado')),
      q(sb.from('notificaciones').select('id, paquete, titulo, texto, recibida, estado').order('recibida', { ascending: false }).limit(15)),
      sb.from('notificaciones').select('id', { count: 'exact', head: true }).then(({ count, error }) => { if (error) throw traducir(error); return count || 0 }),
      todas(() => sb.from('notificaciones').select('id, movimiento, recibida').not('movimiento', 'is', null)
        .gte('recibida', hace30.toISOString()).order('recibida').order('id')),
    ])
    const diaChile = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
    return {
      dispositivos, notificaciones, total,
      avisados: avisos.map((a) => a.movimiento),
      desde: avisos.length ? diaChile(avisos[0].recibida) : diaChile(hace30),
    }
  },
}

export { ErrorValidacion }
