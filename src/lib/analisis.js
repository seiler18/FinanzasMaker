/* Cálculos sobre los movimientos: periodos, totales, series y consejos.

   Funciones puras (sin DOM), probadas en tests/analisis.test.mjs.
   Las fechas viajan como texto 'AAAA-MM-DD HH:MM' y se comparan como texto:
   ese formato ordena igual que el tiempo y no depende de la zona horaria
   del navegador.

   Qué suma dónde:
   - gasto, ingreso               → los totales del periodo
   - inversion (aporte), rescate  → «Invertido neto», aparte: no es gastar
   - interna, pago_tarjeta        → no suman nada. Una transferencia entre
     tus cuentas no es plata que entra ni que sale, y el pago de la tarjeta
     paga compras que ya se contaron el día que se hicieron. */

export const TIPOS = {
  gasto: 'Gasto', ingreso: 'Ingreso', interna: 'Entre mis cuentas',
  inversion: 'Inversión', rescate: 'Rescate de inversión', pago_tarjeta: 'Pago de tarjeta',
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const dd = (n) => String(n).padStart(2, '0')
export const hoyISO = (d = new Date()) => `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`

/* Día en que el movimiento CUENTA. Normalmente es el día en que ocurrió; si el
   dueño fijó `fecha_contable` (un sueldo que el banco depositó el 30 de
   septiembre pero corresponde a octubre) cuenta en ese día. Todos los
   periodos, series y consejos pasan por aquí: si uno mirara `fecha` suelto,
   el mismo movimiento contaría en meses distintos según la pantalla. */
export const diaContable = (x) => String(x.fecha_contable || x.fecha).slice(0, 10)

function diasDelMes(a, m) { return new Date(Date.UTC(a, m, 0)).getUTCDate() }

/* ---------- periodos ---------- */

export function rango(escala, ref) {
  const [a, m, d] = ref.split('-').map(Number)
  if (escala === 'dia') {
    const f = `${a}-${dd(m)}-${dd(d)}`
    return { desde: f, hasta: f, etiqueta: `${d} de ${MESES_LARGO[m - 1]} de ${a}` }
  }
  if (escala === 'mes') {
    return { desde: `${a}-${dd(m)}-01`, hasta: `${a}-${dd(m)}-${dd(diasDelMes(a, m))}`, etiqueta: `${MESES_LARGO[m - 1]} ${a}` }
  }
  return { desde: `${a}-01-01`, hasta: `${a}-12-31`, etiqueta: String(a) }
}

export function mover(escala, ref, paso) {
  const [a, m, d] = ref.split('-').map(Number)
  let f
  if (escala === 'dia') f = new Date(Date.UTC(a, m - 1, d + paso))
  else if (escala === 'mes') f = new Date(Date.UTC(a, m - 1 + paso, 1))
  else f = new Date(Date.UTC(a + paso, 0, 1))
  return `${f.getUTCFullYear()}-${dd(f.getUTCMonth() + 1)}-${dd(f.getUTCDate())}`
}

export function enRango(movs, r) {
  return movs.filter((x) => { const f = diaContable(x); return f >= r.desde && f <= r.hasta })
}

/* ---------- totales ---------- */

export function totales(movs) {
  const t = { ingresos: 0, gastos: 0, invertido: 0, rescatado: 0 }
  for (const x of movs) {
    const n = Number(x.monto) || 0
    if (x.tipo === 'ingreso') t.ingresos += n
    else if (x.tipo === 'gasto') t.gastos += n
    else if (x.tipo === 'inversion') t.invertido += n
    else if (x.tipo === 'rescate') t.rescatado += n
  }
  t.ahorro = t.ingresos - t.gastos
  t.tasa = t.ingresos > 0 ? t.ahorro / t.ingresos : null
  t.inversionNeta = t.invertido - t.rescatado
  return t
}

export function porCategoria(movs, tipo = 'gasto') {
  const m = new Map()
  for (const x of movs) {
    if (x.tipo !== tipo) continue
    const c = x.categoria || 'Otros'
    const e = m.get(c) || { categoria: c, monto: 0, n: 0 }
    e.monto += Number(x.monto) || 0; e.n++
    m.set(c, e)
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto)
}

export function porBanco(movs) {
  const m = new Map()
  for (const x of movs) {
    const b = x.banco || 'Sin banco'
    const e = m.get(b) || { banco: b, ingresos: 0, gastos: 0, n: 0 }
    if (x.tipo === 'ingreso') e.ingresos += Number(x.monto) || 0
    if (x.tipo === 'gasto') e.gastos += Number(x.monto) || 0
    e.n++
    m.set(b, e)
  }
  return [...m.values()].sort((a, b) => b.gastos + b.ingresos - (a.gastos + a.ingresos))
}

/* De quién vino o a quién se fue, para el detalle de una tarjeta del
   resumen. Sin contraparte, cae en el nombre del tipo: así «Ingreso» junta
   los abonos que el banco no nombra en vez de dejarlos en una fila vacía. */
export function porContraparte(movs, tipo) {
  const m = new Map()
  for (const x of movs) {
    if (x.tipo !== tipo) continue
    const k = String(x.contraparte || '').trim() || TIPOS[tipo]
    const e = m.get(k) || { nombre: k, monto: 0, n: 0 }
    e.monto += Number(x.monto) || 0; e.n++
    m.set(k, e)
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto)
}

/* Serie para el gráfico: los 12 meses del año o los días del mes. */
export function serie(movs, escala, ref) {
  const [a, m] = ref.split('-').map(Number)
  const puntos = escala === 'año'
    ? MESES.map((e, i) => ({ clave: `${a}-${dd(i + 1)}`, etiqueta: e, largo: `${MESES_LARGO[i]} ${a}` }))
    : Array.from({ length: diasDelMes(a, m) }, (_, i) => ({ clave: `${a}-${dd(m)}-${dd(i + 1)}`, etiqueta: String(i + 1), largo: `${i + 1} de ${MESES_LARGO[m - 1]}` }))
  const largo = escala === 'año' ? 7 : 10
  const idx = new Map(puntos.map((p, i) => [p.clave, i]))
  const salida = puntos.map((p) => ({ ...p, ingresos: 0, gastos: 0 }))
  for (const x of movs) {
    const i = idx.get(diaContable(x).slice(0, largo))
    if (i == null) continue
    if (x.tipo === 'ingreso') salida[i].ingresos += Number(x.monto) || 0
    if (x.tipo === 'gasto') salida[i].gastos += Number(x.monto) || 0
  }
  return salida
}

/* ---------- ritmo de gasto y proyección ----------
   Dividir lo gastado entre los días transcurridos y multiplicar por los del mes
   da cifras absurdas cuando el mes arranca con un pago grande (arriendo, un
   abono a la tarjeta, una compra en cuotas): $600.000 el día 2 «proyectan»
   millones. Por eso se separan los gastos GRANDES (puntuales) del corriente
   (el del día a día):
   - «por día» y el ritmo usan solo el corriente;
   - proyección = lo ya gastado (grandes incluidos, son reales) + ritmo
     corriente × días que faltan. Los grandes no se repiten solos.
   Con pocos días de datos el ritmo se mezcla con el de los meses anteriores. */
const diaUTC = (f) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d) }
const entreDias = (desde, hasta) => (hasta < desde ? 0 : Math.round((diaUTC(hasta) - diaUTC(desde)) / 864e5) + 1)
const isoUTC = (ms) => { const f = new Date(ms); return `${f.getUTCFullYear()}-${dd(f.getUTCMonth() + 1)}-${dd(f.getUTCDate())}` }

// Desde qué monto un gasto cuenta como «grande»: 5 veces el gasto típico (la
// mediana) de los últimos 90 días, con piso de $50.000. Sin historia, $150.000.
export function umbralGrande(movs, hoy = hoyISO()) {
  const desde = isoUTC(diaUTC(hoy) - 90 * 864e5)
  const montos = movs
    .filter((x) => { const f = diaContable(x); return x.tipo === 'gasto' && f >= desde && f <= hoy })
    .map((x) => Number(x.monto) || 0).sort((a, b) => a - b)
  if (montos.length < 8) return 150000
  return Math.max(50000, 5 * montos[Math.floor(montos.length / 2)])
}

export function ritmoGasto(movs, desde, hasta, hoy = hoyISO(), umbral = umbralGrande(movs, hoy)) {
  const fin = hoy < hasta ? hoy : hasta
  const dias = entreDias(desde, fin)
  const gastos = movs.filter((x) => { const f = diaContable(x); return x.tipo === 'gasto' && f >= desde && f <= fin })
  const grandes = gastos.filter((x) => Number(x.monto) >= umbral)
  const total = gastos.reduce((s, x) => s + (Number(x.monto) || 0), 0)
  const grandesTotal = grandes.reduce((s, x) => s + (Number(x.monto) || 0), 0)
  const corriente = total - grandesTotal
  return { dias, total, corriente, grandes: grandes.length, grandesTotal, porDia: dias > 0 ? corriente / dias : 0 }
}

// Proyección del mes en curso (`mes` = 'AAAA-MM'); null si no es el mes de `hoy`.
export function proyeccionMes(movs, mes, hoy = hoyISO()) {
  if (mes !== hoy.slice(0, 7)) return null
  const [a, m] = mes.split('-').map(Number)
  const totalDias = diasDelMes(a, m)
  const dia = Number(hoy.slice(8, 10))
  if (dia >= totalDias) return null
  const umbral = umbralGrande(movs, hoy)
  const actual = ritmoGasto(movs, `${mes}-01`, `${mes}-${dd(totalDias)}`, hoy, umbral)
  if (actual.total <= 0) return null
  let hDias = 0, hCorriente = 0
  for (const n of [1, 2, 3]) {
    const pm = mesAnterior(mes, n)
    if (!movs.some((x) => x.tipo === 'gasto' && mesDe(x) === pm)) continue
    const [pa, pmm] = pm.split('-').map(Number)
    const dm = diasDelMes(pa, pmm)
    hCorriente += ritmoGasto(movs, `${pm}-01`, `${pm}-${dd(dm)}`, `${pm}-${dd(dm)}`, umbral).corriente
    hDias += dm
  }
  const historico = hDias ? hCorriente / hDias : null
  const peso = Math.min(1, dia / 7)
  const ritmo = historico == null ? actual.porDia : peso * actual.porDia + (1 - peso) * historico
  return { proy: Math.round(actual.total + ritmo * (totalDias - dia)), ritmo, gastado: actual.total, grandes: actual.grandes, grandesTotal: actual.grandesTotal }
}

/* ---------- consejos ---------- */

const clave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const mesDe = (x) => diaContable(x).slice(0, 7)
function mesAnterior(mes, n = 1) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 - n, 1))
  return `${d.getUTCFullYear()}-${dd(d.getUTCMonth() + 1)}`
}

const NO_SUSCRIPCION = new Set(['Transferencias a personas', 'Supermercado', 'Combustible', 'Vivienda', 'Impuestos', 'Remesas'])

/* Posibles suscripciones: la misma contraparte con un monto parecido (±10 %)
   en al menos 2 de los últimos 4 meses. */
export function suscripciones(movs, mes) {
  const meses = new Set([mes, mesAnterior(mes), mesAnterior(mes, 2), mesAnterior(mes, 3)])
  const grupos = new Map()
  for (const x of movs) {
    if (x.tipo !== 'gasto' || !meses.has(mesDe(x)) || !x.contraparte) continue
    // Se repiten pero no son «suscripciones» que uno revisa si cancelar.
    if (NO_SUSCRIPCION.has(x.categoria)) continue
    const k = clave(x.contraparte)
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(x)
  }
  const salida = []
  for (const lista of grupos.values()) {
    const porMes = new Map()
    for (const x of lista) porMes.set(mesDe(x), x)
    if (porMes.size < 2) continue
    const montos = [...porMes.values()].map((x) => Number(x.monto))
    const min = Math.min(...montos), max = Math.max(...montos)
    if (max > min * 1.1) continue
    const ultimo = [...porMes.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0]
    salida.push({ contraparte: ultimo.contraparte, monto: Number(ultimo.monto), meses: porMes.size, anual: Number(ultimo.monto) * 12 })
  }
  return salida.sort((a, b) => b.anual - a.anual)
}

export function consejos(movs, presupuestos, mes, hoy = hoyISO()) {
  const salida = []
  const delMes = movs.filter((x) => mesDe(x) === mes)
  const t = totales(delMes)
  const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL')

  // 1. Presupuestos
  const gastoCat = new Map(porCategoria(delMes).map((c) => [c.categoria, c.monto]))
  for (const p of presupuestos || []) {
    const tope = Number(p.monto_mensual) || 0
    const usado = gastoCat.get(p.categoria) || 0
    if (!tope) continue
    if (usado > tope) salida.push({ nivel: 'alerta', titulo: `Te pasaste en ${p.categoria}`, texto: `Llevas ${clp(usado)} de un presupuesto de ${clp(tope)} (${clp(usado - tope)} de más).`, categoria: p.categoria })
    else if (usado >= tope * 0.8) salida.push({ nivel: 'atencion', titulo: `${p.categoria} al ${Math.round((usado / tope) * 100)} %`, texto: `Te quedan ${clp(tope - usado)} para el resto del mes.`, categoria: p.categoria })
  }

  // 2. Tasa de ahorro
  if (t.ingresos > 0) {
    if (t.ahorro < 0) salida.push({ nivel: 'alerta', titulo: 'Gastaste más de lo que entró', texto: `Este mes salieron ${clp(t.gastos)} y entraron ${clp(t.ingresos)}: ${clp(-t.ahorro)} de diferencia.` })
    else if (t.tasa < 0.1) salida.push({ nivel: 'atencion', titulo: `Estás ahorrando el ${Math.round(t.tasa * 100)} % de lo que entra`, texto: `Una meta razonable es 10–20 %. Llegar al 10 % este mes sería guardar ${clp(t.ingresos * 0.1 - t.ahorro)} más.` })
    else if (t.tasa >= 0.2) salida.push({ nivel: 'bien', titulo: `Ahorro del ${Math.round(t.tasa * 100)} %`, texto: `Te quedan ${clp(t.ahorro)} este mes. Si no los necesitas a la mano, invertirlos evita que se gasten solos.` })
  }

  // 3. Proyección del mes en curso
  const pr = proyeccionMes(movs, mes, hoy)
  if (pr && Number(hoy.slice(8, 10)) >= 5) {
    const previo = totales(movs.filter((x) => mesDe(x) === mesAnterior(mes))).gastos
    const texto = `Con tu ritmo diario (${clp(pr.ritmo)} al día, sin contar gastos grandes) terminarías el mes con unos ${clp(pr.proy)} en gastos` + (previo ? ` (el mes pasado fueron ${clp(previo)}).` : '.')
    salida.push({ nivel: previo && pr.proy > previo * 1.1 ? 'atencion' : 'info', titulo: 'Proyección del mes', texto })
  }

  // 4. Categorías que subieron frente al promedio de los 3 meses anteriores
  const previos = [1, 2, 3].map((n) => mesAnterior(mes, n))
  const conDatos = previos.filter((pm) => movs.some((x) => mesDe(x) === pm))
  if (conDatos.length) {
    const prom = new Map()
    for (const pm of conDatos) for (const c of porCategoria(movs.filter((x) => mesDe(x) === pm))) prom.set(c.categoria, (prom.get(c.categoria) || 0) + c.monto / conDatos.length)
    for (const [cat, monto] of gastoCat) {
      const p = prom.get(cat) || 0
      if (p > 0 && monto > p * 1.25 && monto - p >= 15000) {
        salida.push({ nivel: 'atencion', titulo: `${cat} subió ${Math.round((monto / p - 1) * 100)} %`, texto: `Llevas ${clp(monto)} este mes; tu promedio es ${clp(p)}.`, categoria: cat })
      }
    }
  }

  // 5. Suscripciones
  const subs = suscripciones(movs, mes)
  if (subs.length) {
    const total = subs.reduce((s, x) => s + x.monto, 0)
    salida.push({
      nivel: 'info', titulo: `${subs.length} cobro${subs.length > 1 ? 's' : ''} que se repite${subs.length > 1 ? 'n' : ''} cada mes`,
      texto: `Suman ${clp(total)} al mes (${clp(total * 12)} al año). Revisa si los sigues usando: ` + subs.slice(0, 5).map((s) => `${s.contraparte} ${clp(s.monto)}`).join(', ') + '.',
    })
  }

  // 6. Gastos hormiga
  const chicos = delMes.filter((x) => x.tipo === 'gasto' && Number(x.monto) < 5000)
  const sumaChicos = chicos.reduce((s, x) => s + Number(x.monto), 0)
  if (chicos.length >= 10 && sumaChicos >= 20000) {
    salida.push({ nivel: 'info', titulo: `${chicos.length} compras chicas`, texto: `Las compras de menos de $5.000 suman ${clp(sumaChicos)} este mes. Una a una no se notan.` })
  }

  // 7. Cuotas
  const enCuotas = movs.filter((x) => x.tipo === 'gasto' && Number(x.cuotas) > 1 && [mes, ...previos.slice(0, 2)].includes(mesDe(x)))
  if (enCuotas.length) {
    const imp = comprasEnCuotas(movs, mes).impuesto
    salida.push({ nivel: 'info', titulo: `${enCuotas.length} compra${enCuotas.length > 1 ? 's' : ''} en cuotas en los últimos 3 meses`, texto: `Suman ${clp(enCuotas.reduce((s, x) => s + Number(x.monto), 0))}. Aunque sean sin interés pagan impuesto de timbres, así que pagarlas en 1 cuota sale más barato.${imp ? ` Solo el impuesto de timbres estimado de las de este mes es ${clp(imp)}.` : ''}` })
  }

  // 8. Efectivo: lo que se gasta después de un giro no queda registrado
  const giros = delMes.filter((x) => x.categoria === 'Efectivo')
  if (giros.length) {
    salida.push({ nivel: 'info', titulo: `Sacaste ${clp(giros.reduce((s, x) => s + Number(x.monto), 0))} en efectivo`, texto: 'En qué se gastó no llega por correo. Si quieres verlo, anótalo en «Agregar».' })
  }

  const orden = { alerta: 0, atencion: 1, info: 2, bien: 3 }
  return salida.sort((a, b) => orden[a.nivel] - orden[b.nivel])
}

/* ---------- impuesto de timbres de las compras en cuotas ----------
   DL 3475: 0,066 % del monto por cada mes de plazo, con tope de 0,8 % (se
   alcanza desde las 13 cuotas: 12 × 0,066 = 0,792 %). Lo recauda el banco.

   Verificado contra un estado de cuenta real de Tenpo (septiembre 2026): el
   cargo «IMPUESTO DECRETO LEY 3475 TASA 0,066 %» es monto × 0,066 % × cuotas,
   redondeado al peso, y sale en el MISMO estado de cuenta, 1 o 2 días después
   de la compra. Las compras eran «(0,00 %)», o sea sin interés, y pagaron
   igual: por eso no hay excepción para «3 cuotas precio contado» (el SII la
   menciona, pero el banco no la aplica). Una compra en 1 cuota no genera cargo
   en Tenpo.
   Sin confirmar: en MACH hubo un cargo equivalente a 0,066 % sobre una compra
   de 1 cuota, y una compra en 3 cuotas hecha dos días antes del cierre aún no
   traía cargo. Sigue siendo una ESTIMACIÓN. */
export const TIMBRE = { tasaMes: 0.066, tope: 0.8 }

export function timbreCuotas(monto, cuotas, p = TIMBRE) {
  const n = Math.floor(Number(cuotas) || 0)
  if (n < 2) return 0
  return Math.round(((Number(monto) || 0) * Math.min(p.tasaMes * n, p.tope)) / 100)
}

export const porcentajeTimbre = (cuotas, p = TIMBRE) => (Number(cuotas) > 1 ? Math.min(p.tasaMes * Math.floor(Number(cuotas)), p.tope) : 0)

// Compras en cuotas del mes contable, con el impuesto estimado de cada una.
export function comprasEnCuotas(movs, mes) {
  const compras = movs
    .filter((x) => x.tipo === 'gasto' && Number(x.cuotas) > 1 && mesDe(x) === mes)
    .map((x) => ({ ...x, pct: porcentajeTimbre(x.cuotas), impuesto: timbreCuotas(x.monto, x.cuotas) }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  return { compras, total: compras.reduce((s, x) => s + Number(x.monto), 0), impuesto: compras.reduce((s, x) => s + x.impuesto, 0) }
}

// Los últimos `n` meses terminando en `mes`, del más viejo al más nuevo.
export function timbrePorMes(movs, mes, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const clave = mesAnterior(mes, n - 1 - i)
    const r = comprasEnCuotas(movs, clave)
    return { mes: clave, etiqueta: MESES[Number(clave.slice(5)) - 1], impuesto: r.impuesto, n: r.compras.length }
  })
}
