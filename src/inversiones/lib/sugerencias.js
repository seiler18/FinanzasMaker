/* Sugerencias de compra y venta a partir del precio de hoy (hito 0021).

   Dos reglas, las que pidió Jesús, sin adivinar el mercado:
   · VENDER: una posición abierta cuyo precio de hoy supera su costo promedio
     (el móvil de cartera.js, el mismo de Fintual). Las que pasan
     `umbrales.ventaPct` (Finanzas → Ajustes) se marcan: son las mismas del
     aviso por correo «VENDER?» de Acciones.gs.
   · RECOMPRAR: un activo que vendiste en los últimos `dias` y que hoy está
     más barato que el precio al que lo vendiste. Cuenta la última venta de
     cada activo; con lo que recibiste te alcanza para más acciones de las que
     vendiste. Las que siguen sobre tu precio de venta quedan «en espera».

   El precio por acción de una operación es usd / cantidad: para una venta,
   «Recibiste» entre «Cantidad de acciones» del correo de Fintual (sin
   comisión, como hasta hoy, da su «Precio por acción»).

   Sin DOM ni red: corre igual en el navegador y en Node. */

export const DIAS_RECIENTE = 90
const DIA_MS = 24 * 3600 * 1000

export function precioPorAccion(m) {
  return (m.tipo === 'compra' || m.tipo === 'venta') && m.cantidad > 0 && typeof m.usd === 'number' ? m.usd / m.cantidad : null
}

export function sugerencias(datos, calculo, { hoy = new Date(), dias = DIAS_RECIENTE } = {}) {
  const umbral = (datos.umbrales?.ventaPct ?? 5) / 100

  const vender = calculo.abiertas
    .filter((p) => p.precio !== null && p.costoProm > 0 && p.precio > p.costoProm)
    .map((p) => ({
      ticker: p.ticker,
      nombre: p.nombre,
      tenencia: p.tenencia,
      costoProm: p.costoProm,
      precio: p.precio,
      pct: p.precio / p.costoProm - 1,
      ganancia: p.tenencia * (p.precio - p.costoProm),
      sobreUmbral: p.precio / p.costoProm - 1 >= umbral,
    }))
    .sort((a, b) => b.pct - a.pct)

  // La última venta de cada activo dentro de la ventana. Los movimientos
  // vienen en orden cronológico: la última que aparece es la más reciente.
  const desde = new Date(hoy.getTime() - dias * DIA_MS).toISOString().slice(0, 10)
  const ultima = new Map()
  for (const m of datos.movimientos || []) {
    if (m.tipo !== 'venta' || !m.ticker || m.ticker === 'USD' || m.fecha < desde) continue
    if (precioPorAccion(m) === null) continue
    const previa = ultima.get(m.ticker)
    if (!previa || m.fecha >= previa.fecha) ultima.set(m.ticker, m)
  }

  const nombres = new Map(calculo.posiciones.map((p) => [p.ticker, p.nombre]))
  const precios = new Map((datos.precios || []).map((p) => [p.ticker, p.precio]))
  const comprar = []
  const espera = []
  for (const m of ultima.values()) {
    const precio = precios.get(m.ticker)
    if (typeof precio !== 'number' || !(precio > 0)) continue
    const precioVenta = precioPorAccion(m)
    const s = {
      ticker: m.ticker,
      nombre: nombres.get(m.ticker) || m.activo || m.ticker,
      fecha: m.fecha,
      cantidad: m.cantidad,
      recibido: m.usd,
      precioVenta,
      precio,
      pct: precio / precioVenta - 1,
      accionesHoy: m.usd / precio,
      extra: m.usd / precio - m.cantidad,
    }
    if (precio < precioVenta) comprar.push(s)
    else espera.push(s)
  }
  comprar.sort((a, b) => a.pct - b.pct)
  espera.sort((a, b) => a.pct - b.pct)
  return { vender, comprar, espera, dias, umbralPct: umbral }
}
