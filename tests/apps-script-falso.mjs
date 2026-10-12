// Un Apps Script de mentira para probar backend/*.gs en Node: hojas, Gmail,
// caché, propiedades, disparadores, tokeninfo de Google, Yahoo y la API REST
// de Supabase (PostgREST) en memoria. Lo usan tests/backend.test.mjs y
// tests/acciones.test.mjs.
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'

const leerSrc = (f) => fs.readFileSync(new URL('../backend/' + f, import.meta.url), 'utf8')

export const URL_SB = 'https://falso.supabase.co'
export const USUARIO = '11111111-1111-4111-8111-111111111111'

const responder = (codigo, cuerpo) => ({
  getResponseCode: () => codigo,
  getContentText: () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
})

/* ---------- PostgREST en memoria ----------
   Entiende justo lo que usa backend/Supabase.gs: select, filtros eq/is/in,
   order, limit/offset, insert con on_conflict + resolution, patch y delete. */
const CLAVES = {
  movimientos: ['id'], inversiones: ['id'], revisar: ['usuario', 'gmail_id'], correos: ['usuario', 'gmail_id'],
  presupuestos: ['usuario', 'categoria'], config: ['usuario', 'clave'], estado_trabajador: ['usuario'],
  acciones_precios: ['ticker'], acciones_mapa: ['nombre'], acciones_operaciones: ['usuario', 'gmail_id'],
}
const CON_ID = { reglas: true, acciones_operaciones: true, acciones_alertas: true }

export class SupabaseFalso {
  constructor() { this.tablas = {}; this.pedidos = []; this.falla = null; this.seq = 0; this.orden = null }
  tabla(n) { return (this.tablas[n] ??= []) }

  fetch(url, op = {}) {
    const metodo = String(op.method || 'get').toLowerCase()
    const [tabla, qs = ''] = url.slice((URL_SB + '/rest/v1/').length).split('?')
    const params = new URLSearchParams(qs)
    this.pedidos.push({ metodo, tabla, params, clave: op.headers?.apikey })
    if (op.headers?.apikey !== 'sb_secret_prueba') return responder(401, { message: 'Invalid API key' })
    if (this.falla?.(metodo, tabla)) return responder(500, { message: 'falla simulada' })

    const filtros = [...params].filter(([k]) => !['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k))
    const pasa = (f) => filtros.every(([k, v]) => {
      const i = v.indexOf('.')
      const opr = v.slice(0, i)
      const val = v.slice(i + 1)
      if (opr === 'eq') return String(f[k]) === val
      if (opr === 'is') return val === 'null' ? f[k] == null : String(Boolean(f[k])) === val
      if (opr === 'in') return [...val.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1')).includes(String(f[k]))
      throw new Error('filtro no soportado: ' + k + '=' + v)
    })

    if (metodo === 'get') {
      let filas = this.tabla(tabla).filter(pasa)
      const orden = params.get('order')
      if (orden) {
        const claves = orden.split(',').map((o) => o.split('.'))
        filas = [...filas].sort((a, b) => {
          for (const [col, dir] of claves) {
            const x = a[col]; const y = b[col]
            if (x === y) continue
            return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1)
          }
          return 0
        })
      }
      const desde = Number(params.get('offset') || 0)
      const tope = params.has('limit') ? Number(params.get('limit')) : Infinity
      filas = filas.slice(desde, desde + tope)
      const sel = params.get('select')
      if (sel && sel !== '*') filas = filas.map((f) => Object.fromEntries(sel.split(',').map((c) => [c, f[c] ?? null])))
      return responder(200, structuredClone(filas))
    }

    if (metodo === 'post') {
      this.orden?.push('escribe:' + tabla)
      const cuerpo = JSON.parse(op.payload)
      const prefer = op.headers?.Prefer || ''
      // Como PostgREST: sin `columns`, todas las filas deben traer las mismas claves.
      const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo]
      const firma = (f) => Object.keys(f).sort().join(',')
      if (!params.get('columns') && lista.some((f) => firma(f) !== firma(lista[0]))) return responder(400, { message: 'All object keys must match' })
      const conflicto = params.get('on_conflict')?.split(',') || CLAVES[tabla]
      for (const f of Array.isArray(cuerpo) ? cuerpo : [cuerpo]) {
        const ya = conflicto && this.tabla(tabla).find((e) => conflicto.every((c) => f[c] != null && String(e[c]) === String(f[c])))
        if (ya) {
          if (prefer.includes('ignore-duplicates')) continue
          if (prefer.includes('merge-duplicates')) { Object.assign(ya, f); continue }
          return responder(409, { message: 'duplicate key value violates unique constraint' })
        }
        this.tabla(tabla).push({ ...(CON_ID[tabla] ? { id: ++this.seq } : {}), ...f })
      }
      return responder(201, '')
    }
    if (metodo === 'patch') {
      const cambios = JSON.parse(op.payload)
      this.tabla(tabla).filter(pasa).forEach((f) => Object.assign(f, cambios))
      return responder(204, '')
    }
    if (metodo === 'delete') {
      this.tablas[tabla] = this.tabla(tabla).filter((f) => !pasa(f))
      return responder(204, '')
    }
    throw new Error('método no soportado: ' + metodo)
  }
}

/* ---------- hojas ---------- */
export class Hoja {
  constructor(n) { this.n = n; this.d = []; this.crudo = [] }
  getLastRow() { return this.d.length }
  getMaxRows() { return 1000 }
  getRange(r, c, nr = 1, nc = 1) {
    const h = this
    return {
      getValues() {
        const out = []
        for (let i = 0; i < nr; i++) { const f = []; for (let j = 0; j < nc; j++) f.push(h.d[r - 1 + i]?.[c - 1 + j] ?? ''); out.push(f) }
        return out
      },
      getValue() { return h.d[r - 1]?.[c - 1] ?? '' },
      setValues(v) { v.forEach((fila, i) => fila.forEach((x, j) => h.set(r + i, c + j, x))); return this },
      setValue(x) { h.set(r, c, x); return this },
      setNumberFormat() { return this }, setFontWeight() { return this },
    }
  }
  set(r, c, x) {
    while (this.d.length < r) { this.d.push([]); this.crudo.push([]) }
    const f = this.d[r - 1]; while (f.length < c) f.push('')
    this.crudo[r - 1][c - 1] = x
    f[c - 1] = typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x
  }
  clearContents() { this.d = []; this.crudo = [] }
}

/* Una planilla con hojas a partir de filas: { Movimientos: [[cabecera], [fila]…] }. */
export function planilla(hojas = {}, tz = 'America/Santiago') {
  const mapa = {}
  for (const [n, filas] of Object.entries(hojas)) { const h = new Hoja(n); filas.forEach((f, i) => f.forEach((x, j) => h.set(i + 1, j + 1, x))); mapa[n] = h }
  return {
    hojas: mapa,
    getSheetByName: (n) => mapa[n] || null,
    insertSheet: (n) => (mapa[n] = new Hoja(n)),
    getSpreadsheetTimeZone: () => tz,
  }
}

/* ---------- Gmail ---------- */
export class Msg {
  constructor(o) { Object.assign(this, { papelera: false, html: '', ...o }) }
  getId() { return this.id }
  getFrom() { return this.de }
  getSubject() { return this.asunto }
  getDate() { return new Date(this.fecha) }
  getPlainBody() { this.abierto = true; return this.texto }
  getBody() { return this.html }
  isDraft() { return false }
  isInTrash() { return this.papelera }
  moveToTrash() { this.entorno.orden.push('papelera:' + this.id); this.papelera = true }
}

const firmar = (b) => [...b].map((x) => (x > 127 ? x - 256 : x))
const aBuf = (x) => (typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map((b) => (b + 256) % 256)))

/* El entorno completo, con todos los .gs cargados en un contexto propio. */
export function crearEntorno() {
  const e = {
    supabase: new SupabaseFalso(), cache: new Map(), props: new Map(), correos: [], orden: [], logs: [], enviados: [],
    disparadores: [], fetchesGoogle: 0, yahoo: {}, buscarYahoo: {}, ss: planilla(), externas: {},
  }
  e.supabase.orden = e.orden
  let seq = 0
  const G = {
    console: { log: (...a) => e.logs.push(a.join(' ')), error: (...a) => e.logs.push('ERR ' + a.join(' ')) },
    SpreadsheetApp: {
      getActive: () => e.ss, getActiveSpreadsheet: () => e.ss, flush: () => e.orden.push('flush'),
      openByUrl: (u) => { if (!e.externas[u]) throw new Error('sin acceso a ' + u); return e.externas[u] },
    },
    CacheService: { getScriptCache: () => ({ get: (k) => e.cache.get(k) ?? null, put: (k, v) => e.cache.set(k, v) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => e.props.get(k) ?? null, setProperty: (k, v) => e.props.set(k, v), deleteProperty: (k) => e.props.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'Duenio@Gmail.com' }) },
    ScriptApp: {
      getProjectTriggers: () => [], deleteTrigger() {},
      newTrigger: (fn) => ({ timeBased: () => ({
        everyMinutes: (n) => ({ create: () => e.disparadores.push(fn + ' cada ' + n + ' min') }),
        everyHours: (n) => ({ create: () => e.disparadores.push(fn + ' cada ' + n + ' h') }),
      }) }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => firmar(crypto.createHash('sha256').update(aBuf(s)).digest()),
      base64DecodeWebSafe: (s) => firmar(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      newBlob: (b) => ({ getDataAsString: () => aBuf(b).toString('utf8') }),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => {
        const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
          .formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {})
        return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour === '24' ? '00' : p.hour).replace('mm', p.minute).replace('ss', p.second)
      },
    },
    UrlFetchApp: {
      fetch: (url, op) => {
        if (url.startsWith(URL_SB + '/rest/v1/')) return e.supabase.fetch(url, op)
        if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
          e.fetchesGoogle++
          const t = decodeURIComponent(url.split('id_token=')[1])
          const carga = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString())
          return responder(t.split('.')[2] === 'firma-buena' ? 200 : 400, { ...carga, iss: 'https://accounts.google.com', email_verified: 'true' })
        }
        if (url.startsWith('https://query1.finance.yahoo.com/v1/finance/search')) {
          const q = decodeURIComponent(url.split('q=')[1].split('&')[0])
          return responder(200, { quotes: e.buscarYahoo[q] ? [{ symbol: e.buscarYahoo[q], quoteType: 'ETF', exchange: 'PCX' }] : [] })
        }
        throw new Error('URL inesperada: ' + url)
      },
      fetchAll: (reqs) => reqs.map((r) => {
        const tk = decodeURIComponent(r.url.split('/chart/')[1].split('?')[0])
        const y = e.yahoo[tk]
        return y ? responder(200, { chart: { result: [{ meta: { regularMarketPrice: y[0], chartPreviousClose: y[1] } }] } }) : responder(404, 'no')
      }),
    },
    GmailApp: {
      search: (q, inicio, max) => {
        G.GmailApp.ultimaConsulta = q
        const de = /from:(\S+@\S+)/.exec(q)?.[1]
        // Un hilo por correo, lo más nuevo primero, como Gmail.
        const hilos = [...e.correos].filter((m) => !de || m.de.includes(de)).sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map((m) => ({ getMessages: () => [m] }))
        return hilos.slice(inicio, inicio + max)
      },
      getMessageById: (id) => e.correos.find((m) => m.id === id) || null,
      sendEmail: (a, asunto, texto) => e.enviados.push({ a, asunto, texto }),
    },
  }
  vm.createContext(G)
  vm.runInContext(['Lectores.gs', 'Supabase.gs', 'Code.gs', 'Acciones.gs', 'Migrar.gs'].map(leerSrc).join('\n'), G)
  e.G = G
  e.correo = (de, asunto, texto, fecha = '2026-09-18T12:00:00Z', extra = {}) => {
    const m = new Msg({ id: 'g' + (++seq), de: `Banco <${de}>`, asunto, texto, fecha, entorno: e, ...extra })
    e.correos.push(m)
    return m
  }
  e.filas = (t) => e.supabase.tabla(t)
  e.conectar = () => {
    e.props.set('SUPABASE_URL', URL_SB)
    e.props.set('SUPABASE_CLAVE', 'sb_secret_prueba')
    e.props.set('SUPABASE_USUARIO', USUARIO)
  }
  return e
}
