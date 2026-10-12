/* Cálculo de la cartera a partir de los hechos del contrato (docs/contrato.md).

   Es la MISMA aritmética que las hojas Posiciones y Resultados de la planilla
   (backend/Code.gs, costoPromedioMovil_): costo promedio MÓVIL, el que tenías
   al momento de cada venta, que es como lo calcula Fintual. Si cambias una
   aquí, cambia la otra: tests/cartera.test.mjs ejecuta la de Code.gs y
   compara.

   Hasta el hito 0004 se usaba el promedio de TODAS las compras. Cuadra
   mientras no cierres una posición y la vuelvas a abrir: si vendes todo y
   meses después compras más caro, esa compra nueva encarecía el costo de lo
   que ya habías vendido: la venta salía con pérdida donde Fintual muestra
   ganancia (hito 0004). El resultado total no cambia; cambia cómo se reparte
   entre realizado y no realizado.

   Sin DOM ni red: corre igual en el navegador y en Node. */

// Por debajo de esto una tenencia es residuo de fracciones (0,0001 acciones),
// no una posición. Es el mismo umbral que usa la hoja.
export const RESIDUO = 0.001

const TIPOS_ACCION = new Set(['compra', 'venta', 'dividendo'])

/* Costo promedio móvil de un activo. eventos: [{tipo, cantidad, usd}] en
   orden cronológico. Cada compra suma acciones y costo; cada venta saca
   acciones al costo promedio de ESE momento y lo que sobra o falta es la G/P
   realizada. El costo que queda es el de lo que tienes hoy.

   Un residuo de fracción (vendiste 1,9999 de 2) se descarta con su costo, sin
   cargarlo a la venta: 0,0001 acciones no son una pérdida. Una venta de más
   acciones de las que hay (falta una compra en la hoja) no inventa costo:
   lo que sobra se vende a costo cero. */
export function costoPromedioMovil(eventos) {
  let acciones = 0, costo = 0, realizada = 0
  for (const e of eventos) {
    const cant = e.cantidad || 0
    const usd = e.usd || 0
    if (e.tipo === 'compra') { acciones += cant; costo += usd; continue }
    if (e.tipo !== 'venta') continue
    const prom = acciones > 0 ? costo / acciones : 0
    const costoVendido = Math.min(cant, Math.max(acciones, 0)) * prom
    realizada += usd - costoVendido
    costo -= costoVendido
    acciones -= cant
    if (acciones < RESIDUO) { acciones = 0; costo = 0 }
  }
  return { acciones, costo, realizada, costoProm: acciones > 0 ? costo / acciones : 0 }
}

export function calcularCartera(datos) {
  const precios = new Map((datos.precios || []).map((p) => [p.ticker, p]))
  const porTicker = new Map()
  // Orden cronológico estable: el costo móvil depende del orden. La API ya
  // los manda así; se ordena igual por si otra fuente no lo hace.
  const movs = [...(datos.movimientos || [])].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))

  for (const m of movs) {
    if (!TIPOS_ACCION.has(m.tipo) || !m.ticker || m.ticker === 'USD') continue
    let p = porTicker.get(m.ticker)
    if (!p) {
      p = { ticker: m.ticker, activo: m.activo, comprado: 0, invertido: 0, vendido: 0, ventas: 0, dividendos: 0, primera: m.fecha, ultima: m.fecha, eventos: [] }
      porTicker.set(m.ticker, p)
    }
    const cant = m.cantidad || 0
    const usd = m.usd || 0
    if (m.tipo === 'compra') { p.comprado += cant; p.invertido += usd }
    if (m.tipo === 'venta') { p.vendido += cant; p.ventas += usd }
    if (m.tipo === 'dividendo') p.dividendos += usd
    else p.eventos.push({ tipo: m.tipo, cantidad: cant, usd })
    if (m.fecha < p.primera) p.primera = m.fecha
    if (m.fecha > p.ultima) p.ultima = m.fecha
  }

  const posiciones = [...porTicker.values()]
    .sort((a, b) => (a.ticker < b.ticker ? -1 : 1))
    .map(({ eventos, ...p }) => {
      const pr = precios.get(p.ticker)
      const movil = costoPromedioMovil(eventos)
      const tenencia = movil.acciones
      const costoProm = movil.costoProm
      const precio = pr && typeof pr.precio === 'number' ? pr.precio : null
      const abierta = tenencia > RESIDUO
      const valor = precio !== null ? tenencia * precio : null
      const gpRealizada = movil.realizada
      const gpNoRealizada = abierta && precio !== null ? valor - movil.costo : 0
      return {
        ...p,
        costoAbierto: movil.costo,
        nombre: (pr && pr.nombre && pr.nombre !== p.ticker ? pr.nombre : '') || p.activo || p.ticker,
        tenencia,
        costoProm,
        precio,
        cambioDia: pr && typeof pr.cambioDia === 'number' ? pr.cambioDia : null,
        abierta,
        valor,
        gpRealizada,
        gpNoRealizada,
        resultado: gpRealizada + gpNoRealizada + p.dividendos,
      }
    })

  const suma = (campo, lista = posiciones) => lista.reduce((s, p) => s + (typeof p[campo] === 'number' ? p[campo] : 0), 0)
  const abiertas = posiciones.filter((p) => p.abierta)
  const valorCartera = suma('valor', abiertas)
  for (const p of abiertas) p.peso = valorCartera > 0 && p.valor !== null ? p.valor / valorCartera : null

  const comisionesClp = (datos.movimientos || []).reduce((s, m) => s + (m.comisionClp || 0), 0)
  const resultado = suma('resultado')
  const dolar = datos.dolar && typeof datos.dolar.clp === 'number' ? datos.dolar.clp : null

  return {
    posiciones,
    abiertas: abiertas.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)),
    cerradas: posiciones.filter((p) => !p.abierta),
    totales: {
      invertido: suma('invertido'),
      ventas: suma('ventas'),
      dividendos: suma('dividendos'),
      valorCartera,
      gpRealizada: suma('gpRealizada'),
      gpNoRealizada: suma('gpNoRealizada'),
      resultado,
      comisionesClp,
      dolar,
      resultadoClp: dolar !== null ? resultado * dolar : null,
    },
    dividendosPorMes: dividendosPorMes(datos.movimientos || []),
    flujoDolares: flujoDolares(datos.movimientos || []),
  }
}

/* Serie mensual continua: los meses sin dividendo van en 0, no se saltan
   (un hueco en el eje del tiempo esconde que ese mes no hubo nada). */
export function dividendosPorMes(movimientos) {
  const meses = new Map()
  for (const m of movimientos) {
    if (m.tipo !== 'dividendo') continue
    const k = m.fecha.slice(0, 7)
    meses.set(k, (meses.get(k) || 0) + (m.usd || 0))
  }
  if (!meses.size) return []
  const claves = [...meses.keys()].sort()
  const out = []
  let [a, mes] = claves[0].split('-').map(Number)
  const [aFin, mesFin] = claves[claves.length - 1].split('-').map(Number)
  while (a < aFin || (a === aFin && mes <= mesFin)) {
    const k = `${a}-${String(mes).padStart(2, '0')}`
    out.push({ mes: k, usd: meses.get(k) || 0 })
    mes++
    if (mes > 12) { mes = 1; a++ }
  }
  return out
}

export function flujoDolares(movimientos) {
  const f = { comprados: 0, vendidos: 0, clpPagados: 0, clpRecibidos: 0 }
  for (const m of movimientos) {
    if (m.tipo === 'compraUsd') { f.comprados += m.usd || 0; f.clpPagados += m.clp || 0 }
    if (m.tipo === 'ventaUsd') { f.vendidos += m.usd || 0; f.clpRecibidos += m.clp || 0 }
  }
  return f
}

/* Serie mensual acumulada para el tablero. Cada mes lleva lo ocurrido hasta
   su último día: lo puesto (compras), lo recuperado (ventas + dividendos), el
   costo de lo que sigue abierto y lo realizado. El costo y lo realizado salen
   de costoPromedioMovil sobre los eventos hasta ese mes, así el último punto
   cuadra con calcularCartera. `compraMes` es solo lo comprado en ese mes. */
export function evolucion(movimientos) {
  const movs = [...movimientos]
    .filter((m) => TIPOS_ACCION.has(m.tipo) && m.ticker && m.ticker !== 'USD')
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  if (!movs.length) return []
  const claves = []
  let [a, mes] = movs[0].fecha.slice(0, 7).split('-').map(Number)
  const fin = movs[movs.length - 1].fecha.slice(0, 7)
  for (;;) {
    const k = `${a}-${String(mes).padStart(2, '0')}`
    claves.push(k)
    if (k >= fin) break
    mes++
    if (mes > 12) { mes = 1; a++ }
  }
  const eventosPorTicker = new Map()
  for (const m of movs) {
    if (m.tipo === 'dividendo') continue
    if (!eventosPorTicker.has(m.ticker)) eventosPorTicker.set(m.ticker, [])
    eventosPorTicker.get(m.ticker).push({ mes: m.fecha.slice(0, 7), tipo: m.tipo, cantidad: m.cantidad || 0, usd: m.usd || 0 })
  }
  return claves.map((k) => {
    let compras = 0, ventas = 0, dividendos = 0, compraMes = 0
    for (const m of movs) {
      const mm = m.fecha.slice(0, 7)
      if (mm > k) break
      const usd = m.usd || 0
      if (m.tipo === 'compra') { compras += usd; if (mm === k) compraMes += usd }
      else if (m.tipo === 'venta') ventas += usd
      else dividendos += usd
    }
    let costo = 0, realizado = 0
    for (const ev of eventosPorTicker.values()) {
      const r = costoPromedioMovil(ev.filter((e) => e.mes <= k))
      if (r.acciones > RESIDUO) costo += r.costo
      realizado += r.realizada
    }
    return { mes: k, compras, ventas, dividendos, recibido: ventas + dividendos, compraMes, costo, realizado }
  })
}
