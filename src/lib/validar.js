/* Validación de lo que la página escribe en la base. Antes vivía en
   backend/Code.gs (validarMov_, texto_, enteroPositivo_, fechaValida_) y la
   aplicaba el backend; ahora la página escribe directo en Supabase y valida
   aquí. La base repite lo esencial con CHECK (formato de fecha, tipo, monto),
   así que un error aquí no deja entrar basura: solo da un mensaje peor. */
import { TIPOS, categorizar } from './reglas.js'

export class ErrorValidacion extends Error {}
const falla = (msg) => { throw new ErrorValidacion(msg) }

export const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)

export function enteroPositivo(v) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n <= 0 || n > 1e10) falla('Monto no válido')
  return n
}

const dos = (n) => String(n).padStart(2, '0')

function armarFecha(a, m, d, hh, mm) {
  a = +a; m = +m; d = +d
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return ''
  return `${a}-${dos(m)}-${dos(d)} ${dos(+hh)}:${dos(+mm)}`
}

/* 'AAAA-MM-DD' o 'AAAA-MM-DD HH:MM' → 'AAAA-MM-DD HH:MM'. Sin hora, las 12:00:
   así un movimiento manual no se corre de día por la zona horaria. */
export function fechaValida(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(String(v || ''))
  if (!m) falla('Fecha no válida (AAAA-MM-DD)')
  const f = armarFecha(m[1], m[2], m[3], m[4] ?? 12, m[5] ?? 0)
  if (!f) falla('Fecha no válida')
  return f
}

/* La hora de ahora en Chile, en el formato de la base. */
export function ahoraChile(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {})
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

export function validarTipo(t) {
  if (!TIPOS.includes(t)) falla('Tipo no válido')
  return t
}

/* Un movimiento escrito a mano (Agregar, o un «Por revisar» que se registra).
   Sin categoría, se deduce con las reglas del dueño. */
export function validarMov(x, reglas) {
  const m = {
    fecha: fechaValida(x.fecha),
    banco: texto(x.banco, 40) || 'Efectivo',
    producto: texto(x.producto, 40) || 'Cuenta',
    tipo: validarTipo(String(x.tipo || 'gasto')),
    monto: enteroPositivo(x.monto),
    contraparte: texto(x.contraparte, 80),
    categoria: texto(x.categoria, 40),
    detalle: texto(x.detalle, 200),
    nota: texto(x.nota, 200),
    fecha_contable: x.fecha_contable ? fechaValida(x.fecha_contable).slice(0, 10) : '',
  }
  if (!m.categoria) categorizar(m, reglas)
  return m
}
