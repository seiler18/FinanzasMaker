import { SUPABASE_URL, CLIENT_ID } from '../../config.js'
import { supa } from '../../lib/supa.js'

/* Los datos de Inversiones, desde Supabase (migración 0005).

   Arma exactamente el «contrato v1» que entregaba el Api.gs de
   gestor-acciones (docs/contrato.md de ese repo): así el resto de esta página
   (main.js, cartera.js) no cambió al mudarse a FinanzasMaker, y la demo sigue
   teniendo la misma forma (tests/inversiones-contrato.test.mjs).

   La base entrega HECHOS; posiciones y resultados los calcula cartera.js. */

export const hayBackend = () => Boolean(SUPABASE_URL && CLIENT_ID)

export class ErrorApi extends Error {
  constructor(msg, { sesion = false } = {}) { super(msg); this.sesion = sesion }
}

const ZONA = 'America/Santiago'

async function q(consulta) {
  const { data, error } = await consulta
  if (error) {
    const sesion = /^PGRST30/.test(String(error.code || '')) || /jwt/i.test(String(error.message || ''))
    throw new ErrorApi(sesion ? 'Inicia sesión de nuevo' : error.message || 'Error', { sesion })
  }
  return data
}

async function todas(armar) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const filas = await q(armar().range(desde, desde + 999))
    out.push(...filas)
    if (filas.length < 1000) return out
  }
}

// El contrato pide la hora local de la zona, sin desfase ('AAAA-MM-DDTHH:MM:SS').
function local(iso) {
  if (!iso) return null
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(iso)).reduce((o, x) => ((o[x.type] = x.value), o), {})
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`
}

const num = (v) => (v == null || v === '' ? null : Number(v))

export async function cartera() {
  const sb = supa()
  const [ops, precios, alertas, config, est] = await Promise.all([
    todas(() => sb.from('acciones_operaciones')
      .select('id, fecha, tipo, activo, ticker, cantidad, usd, clp, tipo_cambio, comision_clp, fuente')
      .order('fecha').order('id')),
    q(sb.from('acciones_precios').select('ticker, nombre, precio, cambio_dia, actualizado')),
    q(sb.from('acciones_alertas').select('fecha, tipo, detalle').order('fecha', { ascending: false }).limit(30)),
    q(sb.from('config').select('clave, valor').in('clave', ['umbral_venta_pct', 'umbral_caida_pct'])),
    q(sb.from('estado_trabajador').select('ultima_acciones').maybeSingle()),
  ])
  const cfg = Object.fromEntries(config.map((c) => [c.clave, c.valor]))
  const tickers = new Set(ops.map((o) => o.ticker).filter((t) => t && t !== 'USD'))
  const usdclp = precios.find((p) => p.ticker === 'USDCLP')

  return {
    ok: true,
    version: 1,
    generado: new Date().toISOString(),
    zona: ZONA,
    moneda: 'USD',
    dolar: usdclp?.precio != null ? { clp: Number(usdclp.precio), actualizado: local(usdclp.actualizado) } : null,
    precios: precios.filter((p) => tickers.has(p.ticker)).map((p) => ({
      ticker: p.ticker, nombre: p.nombre || p.ticker, precio: num(p.precio), cambioDia: num(p.cambio_dia), actualizado: local(p.actualizado),
    })),
    movimientos: ops.map((o) => ({
      fecha: o.fecha, tipo: o.tipo, activo: o.activo, ticker: o.ticker,
      cantidad: num(o.cantidad), usd: num(o.usd), clp: num(o.clp), tipoCambio: num(o.tipo_cambio), comisionClp: num(o.comision_clp),
      fuente: o.fuente,
    })),
    alertas: alertas.map((a) => ({ fecha: local(a.fecha), tipo: a.tipo, detalle: a.detalle })),
    umbrales: { ventaPct: Number(cfg.umbral_venta_pct) || 5, caidaPct: Number(cfg.umbral_caida_pct) || 3 },
    ultimaEjecucion: local(est?.ultima_acciones),
  }
}
