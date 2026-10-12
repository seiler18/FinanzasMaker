import './styles/tokens.css'
import './styles/app.css'
import './styles/movimiento.css'
import './styles/tablero.css'
import './styles/efectos.css'
import { protegerMarco } from './lib/marco.js'
import { html, pintar, crudo, $, $$, aviso } from './lib/dom.js'
import { hayBackend, cartera as pedirCartera, ErrorApi } from './lib/api.js'
import { botonIngreso, haySesion, salir } from '../lib/sesion.js'
import { calcularCartera, evolucion } from './lib/cartera.js'
import { datosDemo } from './demo.js'
import { areaEvolucion, anillo, dona, calorMeses, sparkline, claseCat } from './lib/tablero.js'
import { barras, divergentes, columnas, aplicarMedidas, activarTooltip } from './lib/graficos.js'
import { fUsd, fUsdSigno, fClp, fClpSigno, fNum, fAcciones, fPct, fPctSigno, fFecha, fFechaHora, fMes, dir } from './lib/formato.js'
import { revelarAlVer, contar, menosMovimiento } from './lib/movimiento.js'
import { iniciarTema, alternarTema, temaActual } from './lib/tema.js'
import { montarFondoHero } from './lib/fondo-hero.js'
import { initMagnetico, initChispas } from './lib/efectos.js'

protegerMarco()
iniciarTema()

// Imán en los botones de la página y chispas al mostrar más movimientos (lib/efectos.js).
// Las chispas NO van en el acceso: abre un <dialog>, que en la capa superior las taparía.
initMagnetico('#btn-acceso, .mas', { maximo: 6 })
initChispas('.mas')

const app = $('#app')
const estado = { modo: 'demo', datos: null, filtro: 'todos', busqueda: '', verTodos: false, orden: { campo: 'valor', sube: false }, mesDiv: null }

const TIPOS = {
  compra: 'Compra',
  venta: 'Venta',
  dividendo: 'Dividendo',
  compraUsd: 'Compra de dólares',
  ventaUsd: 'Venta de dólares',
}
const FILTROS = [
  ['todos', 'Todos'],
  ['compra', 'Compras'],
  ['venta', 'Ventas'],
  ['dividendo', 'Dividendos'],
  ['dolares', 'Dólares'],
]
const FILAS_INICIALES = 20
const pasaFiltro = (m, f) => f === 'todos' || (f === 'dolares' ? m.ticker === 'USD' : m.tipo === f)

// Íconos de trazo (estilo Lucide) escritos aquí: sin librería ni peticiones.
const ICONO = {
  sol: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  luna: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>',
}

/* ===== arranque ===== */

async function iniciar() {
  $('#anio').textContent = String(new Date().getFullYear())
  activarTooltip(document.body, $('#tip'))
  conectarAcceso()
  conectarTema()
  conectarNavegacion()
  conectarDetalle()
  const demo = new URLSearchParams(location.search).has('demo')
  // Volver a Finanzas sin salir de la demo.
  if (demo) $('.volver')?.setAttribute('href', '../?demo')
  if (hayBackend() && !demo && (await haySesion())) await cargarReal()
  else mostrar('demo', datosDemo())
}

async function cargarReal() {
  pintarEstado('cargando')
  try {
    mostrar('real', await pedirCartera())
    return true
  } catch (e) {
    if (e instanceof ErrorApi && e.sesion) await salir()
    if (!estado.datos) mostrar('demo', datosDemo())
    else pintarEstado()
    aviso(e.message || 'No se pudieron cargar tus datos', 'error')
    return false
  }
}

function mostrar(modo, datos) {
  estado.modo = modo
  estado.datos = datos
  estado.calculo = calcularCartera(datos)
  estado.serie = evolucion(datos.movimientos || [])
  estado.mesDiv = null
  pintarEstado()
  pintarTodo()
}

/* ===== cabecera, tema y acceso ===== */

function pintarEstado(cargando) {
  const d = estado.datos
  const chip = $('#estado')
  if (cargando) chip.textContent = 'Cargando tus datos…'
  else if (estado.modo === 'demo') chip.textContent = 'Datos de demostración'
  else chip.textContent = `Tus datos · al día a las ${fFechaHora(d.ultimaEjecucion || d.generado.slice(0, 19))}`
  chip.dataset.modo = cargando ? 'cargando' : estado.modo

  const boton = $('#btn-acceso')
  boton.hidden = !hayBackend()
  boton.textContent = estado.modo === 'real' ? 'Salir' : 'Entrar'
}

// El botón muestra el tema al que se pasa, no el actual. Íconos constantes
// del código, por eso innerHTML.
function conectarTema() {
  const b = $('#btn-tema')
  const pintarBoton = (tema = temaActual()) => {
    const oscuro = tema === 'dark'
    b.innerHTML = oscuro ? ICONO.sol : ICONO.luna
    b.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro')
    b.title = b.getAttribute('aria-label')
  }
  pintarBoton()
  b.addEventListener('click', () => pintarBoton(alternarTema()))
}

/* Entrar: el mismo «Iniciar sesión con Google» de Finanzas (src/lib/sesion.js).
   La sesión de Supabase vive en sessionStorage, que es del origen y de la
   pestaña: si ya entraste en Finanzas, aquí ya hay sesión y no se pide nada. */
function conectarAcceso() {
  const dlg = $('#dlg-ingreso')
  const error = $('#ingreso-error')
  let botonListo = false
  const fallar = (msg) => { error.textContent = msg; error.hidden = false }

  $('#btn-acceso').addEventListener('click', async () => {
    if (estado.modo === 'real') {
      await salir()
      mostrar('demo', datosDemo())
      aviso('Sesión cerrada')
      return
    }
    error.hidden = true
    dlg.showModal()
    if (botonListo) return
    botonListo = true
    botonIngreso($('#boton-google'), async () => {
      cerrarDialogo(dlg)
      await cargarReal()
    }, fallar).catch((e) => fallar(e.message))
  })
  $('#btn-cancelar').addEventListener('click', () => cerrarDialogo(dlg))
}

/* Cierra un <dialog> dejando correr su animación de salida (.saliendo en
   movimiento.css). El listener se quita al cerrar: colgado, el animationend
   de la ENTRADA siguiente cerraría el diálogo apenas abierto (pasó en
   FinanzasMaker). El temporizador es la red por si la animación no corre. */
function cerrarDialogo(dlg) {
  if (!dlg.open) return
  if (menosMovimiento()) return dlg.close()
  const alTerminar = (e) => { if (e.target === dlg) fin() }
  const fin = () => {
    clearTimeout(red)
    dlg.removeEventListener('animationend', alTerminar)
    dlg.classList.remove('saliendo')
    dlg.close()
  }
  const red = setTimeout(fin, 400)
  dlg.classList.add('saliendo')
  dlg.addEventListener('animationend', alTerminar)
}

/* ===== secciones ===== */

function pintarTodo() {
  const c = estado.calculo
  pintar(app, html`
    ${estado.modo === 'demo' ? avisoDemo() : ''}
    ${resumen(c)}
    ${tablero(c)}
    ${carteraActual(c)}
    ${resultadoPorActivo(c)}
    ${dividendos(c)}
    ${composicion(c)}
    <div class="dos-col">
      ${alertas(estado.datos.alertas || [])}
      ${dolares(c)}
    </div>
    ${movimientos()}
  `)
  aplicarMedidas(app)
  pintarTablaCartera()
  pintarColumnasDividendos()
  pintarTablero()
  conectarMovimientos()
  conectarSecciones()
  revelarAlVer(app)
  montarFondoHero(app)
  vigilarSecciones()
}

function avisoDemo() {
  return html`<p class="banda-demo">
    Estás viendo una <b>cartera de ejemplo</b> con montos inventados.
    ${hayBackend() ? 'Entra con tu cuenta de Google para ver la tuya.' : 'El backend todavía no está conectado (src/config.js).'}
  </p>`
}

/* Cada mosaico lleva a la sección que explica su cifra (data-ir) y, si
   corresponde, deja filtrados los movimientos (data-filtro-ir). */
function tile(etiqueta, valor, { nota = '', clase = '', cuenta = null, formato = '', ir = '', filtro = '', spark = '' } = {}) {
  return html`<button type="button" class="tile" data-ir="${ir}" ${filtro ? html`data-filtro-ir="${filtro}"` : ''}>
    <span class="tile-etq">${etiqueta}<span class="tile-flecha" aria-hidden="true">↓</span></span>
    <span class="tile-val ${clase}" ${cuenta !== null ? html`data-cuenta="${cuenta}" data-formato="${formato}"` : ''}>${valor}</span>
    ${nota ? html`<span class="tile-nota">${nota}</span>` : ''}
    ${spark ? crudo(spark) : ''}
  </button>`
}

/* Las tres partes del resultado. Cada una se abre en su desglose por activo
   (abrirParte). `campo` es el de cada posición en calcularCartera. */
const PARTES = {
  realizado: {
    nombre: 'Ganancia realizada', campo: 'gpRealizada', nota: 'de lo que ya vendiste',
    explica: 'Lo que recibiste al vender menos lo que te habían costado esas acciones, al costo promedio que tenías el día de cada venta. Es como lo calcula Fintual.',
  },
  noRealizado: {
    nombre: 'Ganancia no realizada', campo: 'gpNoRealizada', nota: 'de lo que tienes hoy',
    explica: 'Lo que valen hoy tus acciones menos lo que te costaron. Cambia con el precio: se vuelve realizada recién cuando vendes.',
  },
  dividendos: {
    nombre: 'Dividendos', campo: 'dividendos', nota: 'lo que te pagaron',
    explica: 'Los pagos que te hicieron las empresas y fondos por tener sus acciones.',
  },
}

// «hace 3 h»: qué tan viejo es el precio. El trabajador lo trae de Yahoo Finance
// cada vez que corre (cada hora por defecto), y por eso puede no calzar con
// el que ves en Fintual en este minuto.
function edadPrecios(precios) {
  const t = (precios || []).map((p) => p.actualizado).filter(Boolean).sort().pop()
  if (!t) return ''
  // Sin «Z»: el contrato trae la hora local sin zona, y el navegador del dueño
  // está en la misma (Chile). Leerla como UTC la corría 3 o 4 horas.
  const min = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000))
  if (!isFinite(min)) return ''
  if (min < 2) return 'Precios recién actualizados'
  if (min < 60) return `Precios de hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `Precios de hace ${h} h` : `Precios de hace ${Math.round(h / 24)} días`
}

function resumen(c) {
  const t = c.totales
  const valores = { realizado: t.gpRealizada, noRealizado: t.gpNoRealizada, dividendos: t.dividendos }
  const max = Math.max(...Object.values(valores).map(Math.abs), 0) || 1
  const edad = edadPrecios(estado.datos.precios)
  const serie = estado.serie || []
  const sobreInvertido = t.invertido > 0 ? t.resultado / t.invertido : null
  const parte = (k) => {
    const v = valores[k]
    return html`<button type="button" class="parte parte-${dir(v)}" data-parte="${k}" aria-haspopup="dialog">
      <span class="parte-etq">${PARTES[k].nombre}<span class="parte-chev" aria-hidden="true">›</span></span>
      <span class="parte-val ${dir(v)}" data-cuenta="${v}" data-formato="usdSigno">${fUsdSigno(v)}</span>
      <span class="parte-nota">${PARTES[k].nota}</span>
      <span class="parte-pista" aria-hidden="true"><span class="parte-barra ${v < 0 ? 'barra-neg' : 'barra-pos'}" data-w="${(Math.abs(v) / max).toFixed(4)}"></span></span>
    </button>`
  }
  return html`<section class="resumen revela" aria-labelledby="h-resumen">
    <div class="hero hero-${dir(t.resultado)}">
      <!-- Fondo de puntos con el tono del resultado: lo monta lib/fondo-hero.js -->
      <div class="hero-puntos" aria-hidden="true"></div>
      <div class="hero-cab">
        <h2 id="h-resumen" class="hero-etq">Resultado total de la cartera</h2>
        ${edad ? html`<p class="hero-precios" title="El trabajador trae los precios de Yahoo Finance cada hora; Fintual puede mostrar uno más reciente"><span class="punto" aria-hidden="true"></span>${edad}</p>` : ''}
      </div>
      <p class="hero-cifra ${dir(t.resultado)}" data-cuenta="${t.resultado}" data-formato="usdSigno">${fUsdSigno(t.resultado)}</p>
      <p class="hero-sub">
        ${sobreInvertido !== null ? html`<span class="hero-pct ${dir(t.resultado)}">${fPctSigno(sobreInvertido)}</span> sobre lo invertido` : ''}
        ${t.resultadoClp !== null ? html`<span class="hero-clp">≈ ${fClpSigno(t.resultadoClp)} al dólar de hoy</span>` : ''}
      </p>
      <div class="partes" aria-label="De dónde sale el resultado. Toca una parte para ver cada activo">
        ${parte('realizado')}
        <span class="partes-op" aria-hidden="true">+</span>
        ${parte('noRealizado')}
        <span class="partes-op" aria-hidden="true">+</span>
        ${parte('dividendos')}
      </div>
    </div>
    <div class="tiles">
      ${tile('Valor de la cartera hoy', fUsd(t.valorCartera), { nota: `${c.abiertas.length} posición${c.abiertas.length === 1 ? '' : 'es'} abierta${c.abiertas.length === 1 ? '' : 's'}`, cuenta: t.valorCartera, formato: 'usd', ir: 'h-cartera' })}
      ${tile('Invertido en acciones', fUsd(t.invertido), { nota: 'suma de todas las compras', cuenta: t.invertido, formato: 'usd', ir: 'h-mov', filtro: 'compra', spark: sparkline(serie.map((d) => d.compras), 'sp-puesto') })}
      ${tile('Recibido por ventas', fUsd(t.ventas), { cuenta: t.ventas, formato: 'usd', ir: 'h-mov', filtro: 'venta', spark: sparkline(serie.map((d) => d.ventas), 'sp-recuperado') })}
      ${tile('Dividendos acumulados', fUsd(t.dividendos), { cuenta: t.dividendos, formato: 'usd', ir: c.dividendosPorMes.length ? 'h-div' : 'h-mov', filtro: c.dividendosPorMes.length ? '' : 'dividendo', spark: sparkline(serie.map((d) => d.dividendos), 'sp-div') })}
      ${tile('Dólar hoy', t.dolar !== null ? `$${fNum(t.dolar)}` : '—', { nota: 'CLP por USD', ir: 'h-usd' })}
      ${tile('Comisiones pagadas', fClp(t.comisionesClp), { nota: 'en compra y venta de dólares', cuenta: t.comisionesClp, formato: 'clp', ir: 'h-usd' })}
    </div>
  </section>`
}

/* ===== tablero: anillo, área, dona y calendario de calor ===== */

function tablero(c) {
  const serie = estado.serie || []
  if (!serie.length) return ''
  const ab = c.abiertas
  const conResultado = c.posiciones.filter((p) => Math.abs(p.resultado) >= 0.005)
  const mejor = [...conResultado].sort((a, b) => b.resultado - a.resultado)[0]
  const peor = [...conResultado].sort((a, b) => a.resultado - b.resultado)[0]
  const mayor = ab[0]
  const fila = (etq, p, texto, clase = '') => html`<div><dt>${etq}</dt><dd>${p
    ? html`<button type="button" class="enlace-activo" data-ticker="${p.ticker}"><b>${p.ticker}</b></button> <small class="${clase}">${texto}</small>`
    : '—'}</dd></div>`
  return html`<section class="tablero revela" aria-label="Tablero de la cartera">
    <div class="panel estado-cartera">
      <header class="panel-cab">
        <h2>Cómo va la cartera</h2>
        <p>Posiciones abiertas que hoy valen más de lo que costaron</p>
      </header>
      <div class="anillo" id="anillo"></div>
      <dl class="pares">
        ${fila('Mayor peso', mayor, mayor ? fPct(mayor.peso) : '')}
        ${fila('Mejor resultado', mejor, mejor ? fUsdSigno(mejor.resultado) : '', mejor ? dir(mejor.resultado) : '')}
        ${fila('Peor resultado', peor && peor !== mejor ? peor : null, peor ? fUsdSigno(peor.resultado) : '', peor ? dir(peor.resultado) : '')}
      </dl>
    </div>
    <div class="panel">
      <header class="panel-cab">
        <h2>Lo puesto y lo recuperado</h2>
        <p>Acumulado mes a mes: lo que compraste frente a lo que ya volvió por ventas y dividendos. Recorre el gráfico con el puntero o las flechas</p>
      </header>
      <div class="grafico" id="graf-evolucion"></div>
    </div>
  </section>`
}

function composicion(c) {
  const ab = c.abiertas.filter((p) => p.valor !== null && p.valor > 0)
  const serie = estado.serie || []
  if (!ab.length && !serie.length) return ''
  return html`<div class="dos-col">
    ${ab.length ? html`<section class="panel revela" aria-labelledby="h-comp">
      <header class="panel-cab">
        <h2 id="h-comp">Composición de la cartera</h2>
        <p>Peso de cada activo en el valor de hoy. Toca uno para ver su detalle</p>
      </header>
      <div class="reparto">
        <div class="dona" id="dona"></div>
        <ul class="cats" id="cats-dona">
          ${ab.map((p, i) => html`<li><button type="button" class="cat-fila" data-ticker="${p.ticker}">
            <span class="cat-nombre"><i class="cat-punto d-${claseCat(i)}"></i><b>${p.ticker}</b><small>${p.nombre}</small></span>
            <span class="cat-val">${fUsd(p.valor)}<small>${fPct(p.peso)}</small></span>
          </button></li>`)}
        </ul>
      </div>
    </section>` : ''}
    ${serie.length ? html`<section class="panel revela" aria-labelledby="h-act">
      <header class="panel-cab">
        <h2 id="h-act">Actividad por mes</h2>
        <p>Cuánto compraste cada mes; el punto marca los meses con dividendo</p>
      </header>
      <div class="calor" id="calor-meses"></div>
    </section>` : ''}
  </div>`
}

function pintarAreaEvolucion() {
  const cArea = $('#graf-evolucion')
  if (cArea) areaEvolucion(cArea, (estado.serie || []).map((d) => ({ etiqueta: fMes(d.mes), largo: fMes(d.mes), puesto: d.compras, recuperado: d.recibido })))
}

function pintarTablero() {
  const c = estado.calculo
  const serie = estado.serie || []
  const cAnillo = $('#anillo')
  if (cAnillo) {
    const ab = c.abiertas.filter((p) => p.valor !== null)
    anillo(cAnillo, ab.filter((p) => p.gpNoRealizada > 0).length, ab.length)
  }
  pintarAreaEvolucion()
  const cDona = $('#dona')
  if (cDona) {
    const ab = c.abiertas.filter((p) => p.valor !== null && p.valor > 0)
    const d = dona(cDona, ab.map((p) => ({ ticker: p.ticker, nombre: p.nombre, valor: p.valor })), {
      total: c.totales.valorCartera,
      alElegir: (seg) => seg.uno && abrirActivo(seg.uno),
    })
    const lista = $('#cats-dona')
    lista.addEventListener('pointerover', (e) => d.resaltar(e.target.closest('[data-ticker]')?.dataset.ticker ?? null))
    lista.addEventListener('pointerleave', () => d.resaltar(null))
    lista.addEventListener('focusin', (e) => d.resaltar(e.target.closest('[data-ticker]')?.dataset.ticker ?? null))
    lista.addEventListener('focusout', () => d.resaltar(null))
  }
  const cCalor = $('#calor-meses')
  if (cCalor) calorMeses(cCalor, serie, c.dividendosPorMes, { alElegir: () => irA('h-mov') })
}

// La luz de los mosaicos y de las tres partes del resultado sigue al puntero (--mx/--my por CSSOM, sin style="").
document.addEventListener('pointermove', (e) => {
  const t = e.target.closest?.('.tile, .parte')
  if (!t) return
  const r = t.getBoundingClientRect()
  t.style.setProperty('--mx', `${e.clientX - r.left}px`)
  t.style.setProperty('--my', `${e.clientY - r.top}px`)
}, { passive: true })

function carteraActual(c) {
  if (!c.abiertas.length) {
    return html`<section class="panel revela"><h2>Cartera actual</h2><p class="vacio">No hay posiciones abiertas.</p></section>`
  }
  const filas = c.abiertas.map((p) => ({
    ticker: p.ticker,
    etiqueta: p.ticker,
    detalle: p.nombre,
    valor: p.valor ?? 0,
    texto: html`${fUsd(p.valor)} <small>${fPct(p.peso)}</small>`,
    tip: `${p.ticker}: ${fUsd(p.valor)} (${fPct(p.peso)} de la cartera) · toca para ver el detalle`,
  }))
  return html`<section class="panel revela" aria-labelledby="h-cartera">
    <header class="panel-cab">
      <h2 id="h-cartera">Cartera actual</h2>
      <p>Valor de cada posición abierta al precio de hoy, en USD. Toca un activo para ver su detalle</p>
    </header>
    ${barras(filas)}
    <div class="tabla-envoltura" id="tabla-cartera"></div>
  </section>`
}

/* Tabla de la cartera, ordenable por columna. Al reordenar, cada fila tiene
   nombre de transición propio y se desliza a su lugar nuevo (View
   Transitions); el nombre sale del índice, no del ticker: «BRK.B» no es un
   identificador CSS válido. */
const COLUMNAS = [
  ['ticker', 'Activo', false],
  ['tenencia', 'Acciones', true],
  ['costoProm', 'Costo prom.', true],
  ['precio', 'Precio hoy', true],
  ['cambioDia', 'Cambio hoy', true],
  ['valor', 'Valor', true],
  ['gpNoRealizada', 'G/P no realizada', true],
]

function pintarTablaCartera() {
  const cont = $('#tabla-cartera')
  if (!cont) return
  const { campo, sube } = estado.orden
  const base = estado.calculo.abiertas.map((p, i) => ({ p, i }))
  const valorDe = (p) => (campo === 'ticker' ? p.ticker : p[campo] ?? -Infinity)
  base.sort((a, b) => {
    const x = valorDe(a.p), y = valorDe(b.p)
    const r = typeof x === 'string' ? x.localeCompare(y) : x - y
    return sube ? r : -r
  })
  pintar(cont, html`<table>
    <thead><tr>
      ${COLUMNAS.map(([k, nombre, num]) => html`<th scope="col" class="${num ? 'num' : ''}" aria-sort="${campo === k ? (sube ? 'ascending' : 'descending') : 'none'}">
        <button type="button" class="orden" data-orden="${k}">${nombre}<span class="orden-flecha" aria-hidden="true">${campo === k ? (sube ? '▲' : '▼') : '↕'}</span></button>
      </th>`)}
    </tr></thead>
    <tbody>
      ${base.map(({ p, i }) => html`<tr class="fila-activo" data-ticker="${p.ticker}" data-i="${i}" tabindex="0">
        <th scope="row"><b>${p.ticker}</b> <small>${p.nombre}</small></th>
        <td class="num">${fAcciones(p.tenencia)}</td>
        <td class="num">${fUsd(p.costoProm)}</td>
        <td class="num">${fUsd(p.precio)}</td>
        <td class="num ${dir(p.cambioDia)}">${fPctSigno(p.cambioDia)}</td>
        <td class="num">${fUsd(p.valor)}</td>
        <td class="num ${dir(p.gpNoRealizada)}">${fUsdSigno(p.gpNoRealizada)} <small>${p.costoProm ? fPctSigno(p.gpNoRealizada / (p.tenencia * p.costoProm)) : ''}</small></td>
      </tr>`)}
    </tbody>
  </table>`)
  cont.querySelectorAll('tbody tr').forEach((tr) => tr.style.setProperty('view-transition-name', `fila-${tr.dataset.i}`))
}

function ordenarCartera(campo) {
  const o = estado.orden
  estado.orden = { campo, sube: o.campo === campo ? !o.sube : campo === 'ticker' }
  if (document.startViewTransition && !menosMovimiento()) document.startViewTransition(pintarTablaCartera)
  else pintarTablaCartera()
}

function resultadoPorActivo(c) {
  const lista = [...c.posiciones].sort((a, b) => b.resultado - a.resultado)
  const filas = lista.map((p) => ({
    ticker: p.ticker,
    etiqueta: p.ticker,
    detalle: p.abierta ? 'abierta' : '',
    valor: p.resultado,
    clase: dir(p.resultado),
    texto: fUsdSigno(p.resultado),
    tip: `${p.ticker} · ${p.nombre}: realizado ${fUsdSigno(p.gpRealizada)}, no realizado ${fUsdSigno(p.gpNoRealizada)}, dividendos ${fUsd(p.dividendos)}`,
  }))
  return html`<section class="panel revela" aria-labelledby="h-resultado">
    <header class="panel-cab">
      <h2 id="h-resultado">Resultado por activo</h2>
      <p>Ganancia o pérdida realizada + no realizada + dividendos, en USD, de todo lo que has tenido</p>
      <ul class="leyenda" aria-label="Leyenda">
        <li><span class="muestra barra-pos"></span>Ganancia</li>
        <li><span class="muestra barra-neg"></span>Pérdida</li>
      </ul>
    </header>
    ${divergentes(filas)}
  </section>`
}

function dividendos(c) {
  const serie = c.dividendosPorMes
  if (!serie.length) return ''
  const total = serie.reduce((s, d) => s + d.usd, 0)
  return html`<section class="panel revela" aria-labelledby="h-div">
    <header class="panel-cab">
      <h2 id="h-div">Dividendos por mes</h2>
      <p>${fUsd(total)} en ${serie.length} meses · los meses sin dividendo cuentan como cero. Toca un mes para ver de qué activo vino</p>
    </header>
    <div class="grafico" id="graf-div"></div>
    <div id="mes-div" class="mes-div" aria-live="polite"></div>
  </section>`
}

/* El SVG se dibuja al ancho real del contenedor: con un viewBox fijo, el
   navegador escala también el texto y el eje queda enorme en escritorio y
   diminuto en móvil. */
function pintarColumnasDividendos() {
  const cont = $('#graf-div')
  if (!cont) return
  const serie = estado.calculo.dividendosPorMes
  const max = serie.reduce((m, d, i) => (d.usd > serie[m].usd ? i : m), 0)
  pintar(cont, columnas(
    serie.map((d) => ({ etiqueta: fMes(d.mes), valor: d.usd, tip: `${fMes(d.mes)}: ${fUsd(d.usd)}` })),
    { formato: fUsd, destacar: max, ancho: Math.max(280, Math.round(cont.clientWidth)) },
  ))
  marcarMesDividendo()
}

function marcarMesDividendo() {
  const serie = estado.calculo.dividendosPorMes
  $$('#graf-div .col').forEach((g) => g.setAttribute('aria-pressed', String(serie[Number(g.dataset.i)]?.mes === estado.mesDiv)))
}

function elegirMesDividendo(i) {
  const d = estado.calculo.dividendosPorMes[i]
  if (!d) return
  estado.mesDiv = estado.mesDiv === d.mes ? null : d.mes
  marcarMesDividendo()
  const cont = $('#mes-div')
  if (!estado.mesDiv) return pintar(cont, '')
  const lista = (estado.datos.movimientos || []).filter((m) => m.tipo === 'dividendo' && m.fecha.startsWith(d.mes))
  pintar(cont, html`<div class="mes-div-caja">
    <p class="mes-div-tit"><b>${fMes(d.mes)}</b> · ${fUsd(d.usd)}</p>
    ${lista.length ? html`<ul class="mes-div-lista">${lista.map((m) => html`<li>
      <button type="button" class="enlace-activo" data-ticker="${m.ticker}"><b>${m.ticker}</b> <small>${m.activo}</small></button>
      <span class="num sube">+${fUsd(m.usd)}</span></li>`)}</ul>`
      : html`<p class="vacio">Ese mes no hubo dividendos.</p>`}
  </div>`)
}

let esperaResize
window.addEventListener('resize', () => {
  clearTimeout(esperaResize)
  esperaResize = setTimeout(() => { pintarColumnasDividendos(); pintarAreaEvolucion() }, 150)
})

const CLASE_ALERTA = [
  [/señal/i, 'senal', 'Señal'],
  [/importaci/i, 'info', 'Importación'],
  [/auto-mapa/i, 'info', 'Activo nuevo'],
  [/revisar/i, 'revisar', 'Revisar'],
]

function alertas(lista) {
  return html`<section class="panel revela" aria-labelledby="h-alertas">
    <header class="panel-cab">
      <h2 id="h-alertas">Alertas recientes</h2>
      <p>Las escribe el trabajador cada 4 horas (umbrales en Finanzas → Ajustes)</p>
    </header>
    ${lista.length
      ? html`<ol class="alertas">
          ${lista.slice(0, 12).map((a) => {
            const [, clase, nombre] = CLASE_ALERTA.find(([r]) => r.test(a.tipo)) || [null, 'info', a.tipo]
            return html`<li>
              <span class="chip chip-${clase}">${nombre}</span>
              <time>${fFechaHora(a.fecha)}</time>
              <p>${a.detalle}</p>
            </li>`
          })}
        </ol>`
      : html`<p class="vacio">Sin alertas.</p>`}
  </section>`
}

function dolares(c) {
  const f = c.flujoDolares
  const prom = (clp, usd) => (usd ? clp / usd : null)
  return html`<section class="panel revela" aria-labelledby="h-usd">
    <header class="panel-cab">
      <h2 id="h-usd">Cambio de dólares</h2>
      <p>Pesos que pasaron a dólares para invertir, y de vuelta</p>
    </header>
    <dl class="pares">
      <div><dt>Dólares comprados</dt><dd>${fUsd(f.comprados)} <small>por ${fClp(f.clpPagados)} · ${f.comprados ? `$${fNum(prom(f.clpPagados, f.comprados))}/USD` : '—'}</small></dd></div>
      <div><dt>Dólares vendidos</dt><dd>${fUsd(f.vendidos)} <small>por ${fClp(f.clpRecibidos)} · ${f.vendidos ? `$${fNum(prom(f.clpRecibidos, f.vendidos))}/USD` : '—'}</small></dd></div>
      <div><dt>Comisiones</dt><dd>${fClp(c.totales.comisionesClp)}</dd></div>
    </dl>
  </section>`
}

function movimientos() {
  const todos = estado.datos.movimientos || []
  return html`<section class="panel revela" aria-labelledby="h-mov">
    <header class="panel-cab">
      <h2 id="h-mov">Movimientos</h2>
      <p>Lo que leyó el trabajador de tus correos de Fintual, más el historial cargado a mano</p>
    </header>
    <div class="mov-controles">
      <div class="filtros" role="group" aria-label="Filtrar movimientos">
        ${FILTROS.map(([id, nombre]) => html`<button type="button" class="filtro" data-filtro="${id}" aria-pressed="${estado.filtro === id}">${nombre}<span class="filtro-n">${todos.filter((m) => pasaFiltro(m, id)).length}</span></button>`)}
      </div>
      <label class="buscar"><span class="oculto-visual">Buscar un activo</span>
        <input type="search" id="buscar-mov" placeholder="Buscar activo (VOO, Apple…)" value="${estado.busqueda}" autocomplete="off"></label>
    </div>
    <div id="tabla-mov"></div>
  </section>`
}

function pintarMovimientos() {
  const todos = [...(estado.datos.movimientos || [])].reverse()
  const q = estado.busqueda.trim().toLowerCase()
  const lista = todos.filter((m) => pasaFiltro(m, estado.filtro) && (!q || `${m.ticker} ${m.activo}`.toLowerCase().includes(q)))
  const visibles = estado.verTodos ? lista : lista.slice(0, FILAS_INICIALES)
  pintar($('#tabla-mov'), html`${visibles.length ? html`<div class="tabla-envoltura">
      <table class="anima-filas">
        <thead><tr>
          <th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Activo</th>
          <th scope="col" class="num">Cantidad</th><th scope="col" class="num">Monto USD</th><th scope="col" class="num">Monto CLP</th>
        </tr></thead>
        <tbody>
          ${visibles.map((m) => html`<tr ${m.ticker !== 'USD' ? html`class="fila-activo" data-ticker="${m.ticker}" tabindex="0"` : ''}>
            <td>${fFecha(m.fecha)}</td>
            <td><span class="tipo tipo-${m.tipo}">${TIPOS[m.tipo] || m.tipo}</span></td>
            <td><b>${m.ticker}</b> <small>${m.ticker === 'USD' ? '' : m.activo}</small></td>
            <td class="num">${m.tipo === 'dividendo' ? '—' : m.ticker === 'USD' ? fUsd(m.cantidad) : fAcciones(m.cantidad)}</td>
            <td class="num">${fUsd(m.usd)}</td>
            <td class="num">${m.clp ? fClp(m.clp) : '—'}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>` : html`<p class="vacio">Ningún movimiento coincide${q ? html` con «${estado.busqueda.trim()}»` : ''}.</p>`}
    ${lista.length > visibles.length
      ? html`<button type="button" class="mas" id="btn-mas">Mostrar los ${lista.length} movimientos</button>`
      : visibles.length ? html`<p class="tabla-pie">${lista.length} movimiento${lista.length === 1 ? '' : 's'}</p>` : ''}`)
}

function filtrarMovimientos(filtro) {
  estado.filtro = filtro
  estado.verTodos = false
  for (const x of $$('[data-filtro]')) x.setAttribute('aria-pressed', String(x.dataset.filtro === filtro))
  pintarMovimientos()
}

function conectarMovimientos() {
  pintarMovimientos()
  const sec = $('#h-mov').closest('section')
  sec.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]')
    if (b) filtrarMovimientos(b.dataset.filtro)
    if (e.target.closest('#btn-mas')) {
      estado.verTodos = true
      pintarMovimientos()
    }
  })
  let espera
  $('#buscar-mov').addEventListener('input', (e) => {
    clearTimeout(espera)
    espera = setTimeout(() => {
      estado.busqueda = e.target.value
      estado.verTodos = false
      pintarMovimientos()
    }, 120)
  })
}

/* Clics que cruzan secciones: un mosaico lleva a la suya, un activo abre su
   detalle, una columna de dividendos muestra su mes, un encabezado ordena. */
function conectarSecciones() {
  app.addEventListener('click', (e) => {
    const t = e.target.closest('.tile[data-ir]')
    if (t) return irA(t.dataset.ir, t.dataset.filtroIr)
    const pt = e.target.closest('[data-parte]')
    if (pt) return abrirParte(pt.dataset.parte)
    const o = e.target.closest('[data-orden]')
    if (o) return ordenarCartera(o.dataset.orden)
    const col = e.target.closest('#graf-div .col')
    if (col) return elegirMesDividendo(Number(col.dataset.i))
    const a = e.target.closest('[data-ticker]')
    if (a) abrirActivo(a.dataset.ticker)
  })
  // Filas y barras con tabindex: Enter o espacio hacen lo mismo que el clic.
  app.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const el = e.target.closest('tr[data-ticker], li[data-ticker], #graf-div .col')
    if (!el || e.target.closest('button, input')) return
    e.preventDefault()
    if (el.matches('.col')) elegirMesDividendo(Number(el.dataset.i))
    else abrirActivo(el.dataset.ticker)
  })
}

/* Cinta inferior (solo visible en el celular): cada botón lleva a su sección
   con irA, y la sección que está a la vista queda marcada (aria-current). */
function conectarNavegacion() {
  $('#nav-inferior').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav]')
    if (b) irA(b.dataset.nav)
  })
}

let observadorNav = null
function vigilarSecciones() {
  const botones = $$('#nav-inferior [data-nav]')
  // Una sección puede no existir (sin posiciones no hay «Cartera actual»): su botón no se muestra.
  const secciones = botones.map((b) => {
    const sec = document.getElementById(b.dataset.nav)?.closest('section')
    b.hidden = !sec
    return sec ? [b, sec] : null
  }).filter(Boolean)
  const marcar = (activo) => botones.forEach((b) => { if (b === activo) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current') })
  if (observadorNav) observadorNav.disconnect()
  if (!secciones.length || !('IntersectionObserver' in window)) return
  const visibles = new Map()
  // Franja estrecha a 1/3 de la pantalla: la sección que la cruza es la activa.
  observadorNav = new IntersectionObserver((entradas) => {
    for (const en of entradas) {
      const par = secciones.find(([, s]) => s === en.target)
      if (en.isIntersecting) visibles.set(par[0], en.target.getBoundingClientRect().top); else visibles.delete(par[0])
    }
    const primero = secciones.find(([b]) => visibles.has(b))
    marcar(primero ? primero[0] : null)
  }, { rootMargin: '-30% 0px -60% 0px' })
  secciones.forEach(([, s]) => observadorNav.observe(s))
}

function irA(id, filtro) {
  if (filtro) filtrarMovimientos(filtro)
  const sec = document.getElementById(id)?.closest('section')
  if (!sec) return
  sec.scrollIntoView({ behavior: menosMovimiento() ? 'auto' : 'smooth', block: 'start' })
  // Un destello en la sección de destino dice «es aquí».
  sec.classList.remove('destello')
  void sec.offsetWidth
  sec.classList.add('destello')
}

/* ===== desglose de una parte del resultado ===== */

function abrirParte(k) {
  const def = PARTES[k]
  const c = estado.calculo
  const total = { realizado: c.totales.gpRealizada, noRealizado: c.totales.gpNoRealizada, dividendos: c.totales.dividendos }[k]
  const filas = c.posiciones.filter((p) => Math.abs(p[def.campo]) >= 0.005).sort((a, b) => b[def.campo] - a[def.campo])
  const max = Math.max(...filas.map((p) => Math.abs(p[def.campo])), 0) || 1
  const dlg = $('#dlg-activo')
  pintar(dlg, html`<div class="det">
    <span class="det-asa" aria-hidden="true"></span>
    <header class="det-cab">
      <div>
        <p class="det-estado"><span class="chip">Resultado total</span></p>
        <h2 id="det-titulo">${def.nombre}</h2>
      </div>
      <button type="button" class="btn btn-icono" data-cerrar aria-label="Cerrar">×</button>
    </header>
    <p class="det-cifra ${dir(total)}" data-cuenta="${total}" data-formato="usdSigno">${fUsdSigno(total)}</p>
    <p class="det-explica">${def.explica}</p>
    ${filas.length ? html`<h3 class="det-sub-tit">Por activo <small>toca uno para ver su detalle</small></h3>
      <ul class="desglose">${filas.map((p) => {
        const v = p[def.campo]
        return html`<li><button type="button" class="desglose-fila" data-ticker="${p.ticker}">
          <span class="desglose-etq"><b>${p.ticker}</b><small>${p.nombre}</small></span>
          <span class="desglose-pista" aria-hidden="true"><span class="mitad mitad-neg">${v < 0 ? html`<span class="barra barra-neg" data-w="${(Math.abs(v) / max).toFixed(4)}"></span>` : ''}</span><span class="mitad mitad-pos">${v >= 0 ? html`<span class="barra barra-pos" data-w="${(v / max).toFixed(4)}"></span>` : ''}</span></span>
          <span class="desglose-val ${dir(v)}">${fUsdSigno(v)}</span>
        </button></li>`
      })}</ul>` : html`<p class="vacio">Ningún activo tiene ${def.nombre.toLowerCase()} por ahora.</p>`}
  </div>`)
  aplicarMedidas(dlg)
  if (!dlg.open) dlg.showModal()
  dlg.querySelectorAll('[data-cuenta]').forEach(contar)
}

/* ===== detalle de un activo ===== */

function conectarDetalle() {
  const dlg = $('#dlg-activo')
  dlg.addEventListener('click', (e) => {
    // El clic en el velo cae en el propio <dialog>, fuera de su contenido.
    if (e.target === dlg || e.target.closest('[data-cerrar]')) return cerrarDialogo(dlg)
    const a = e.target.closest('[data-ticker]')
    if (a) abrirActivo(a.dataset.ticker)
  })
}

function abrirActivo(ticker) {
  const p = estado.calculo.posiciones.find((x) => x.ticker === ticker)
  if (!p) return
  const movs = (estado.datos.movimientos || []).filter((m) => m.ticker === ticker).reverse()
  const costoAbierto = p.costoAbierto
  const dlg = $('#dlg-activo')
  pintar(dlg, html`<div class="det">
    <span class="det-asa" aria-hidden="true"></span>
    <header class="det-cab">
      <div>
        <p class="det-estado"><span class="chip ${p.abierta ? 'chip-senal' : ''}">${p.abierta ? 'Posición abierta' : 'Cerrada'}</span></p>
        <h2 id="det-titulo">${p.ticker}</h2>
        <p class="det-nombre">${p.nombre}</p>
      </div>
      <button type="button" class="btn btn-icono" data-cerrar aria-label="Cerrar">×</button>
    </header>
    <p class="det-cifra ${dir(p.resultado)}" data-cuenta="${p.resultado}" data-formato="usdSigno">${fUsdSigno(p.resultado)}</p>
    <p class="det-sub">resultado total: realizado ${fUsdSigno(p.gpRealizada)} · no realizado ${fUsdSigno(p.gpNoRealizada)} · dividendos ${fUsd(p.dividendos)}</p>
    ${p.abierta && p.valor !== null && costoAbierto > 0 ? html`
      <div class="det-comp" aria-label="Lo que costó frente a lo que vale hoy">
        <div><span>Costó</span><span class="det-pista"><span class="det-barra det-costo" data-w="${Math.min(1, costoAbierto / Math.max(costoAbierto, p.valor)).toFixed(4)}"></span></span><b>${fUsd(costoAbierto)}</b></div>
        <div><span>Vale hoy</span><span class="det-pista"><span class="det-barra ${p.valor >= costoAbierto ? 'barra-pos' : 'barra-neg-d'}" data-w="${Math.min(1, p.valor / Math.max(costoAbierto, p.valor)).toFixed(4)}"></span></span><b>${fUsd(p.valor)}</b></div>
      </div>` : ''}
    <dl class="det-datos">
      ${p.abierta ? html`
        <div><dt>Acciones</dt><dd>${fAcciones(p.tenencia)}</dd></div>
        <div><dt>Costo promedio</dt><dd>${fUsd(p.costoProm)}</dd></div>
        <div><dt>Precio hoy</dt><dd>${fUsd(p.precio)} <small class="${dir(p.cambioDia)}">${fPctSigno(p.cambioDia)}</small></dd></div>
        <div><dt>Peso en la cartera</dt><dd>${fPct(p.peso)}</dd></div>` : ''}
      <div><dt>Invertido</dt><dd>${fUsd(p.invertido)}</dd></div>
      <div><dt>Recibido por ventas</dt><dd>${fUsd(p.ventas)}</dd></div>
      <div><dt>Primer movimiento</dt><dd>${fFecha(p.primera)}</dd></div>
      <div><dt>Último movimiento</dt><dd>${fFecha(p.ultima)}</dd></div>
    </dl>
    <h3 class="det-sub-tit">Movimientos de ${p.ticker} <small>${movs.length}</small></h3>
    <ol class="det-movs">${movs.slice(0, 40).map((m) => html`<li>
      <span><span class="tipo tipo-${m.tipo}">${TIPOS[m.tipo] || m.tipo}</span> <small>${fFecha(m.fecha)}</small></span>
      <span class="num">${m.tipo === 'dividendo' ? '' : html`<small>${fAcciones(m.cantidad)} acc. · </small>`}<b class="${m.tipo === 'venta' || m.tipo === 'dividendo' ? 'sube' : ''}">${m.tipo === 'compra' ? '−' : '+'}${fUsd(m.usd)}</b></span>
    </li>`)}</ol>
  </div>`)
  aplicarMedidas(dlg)
  if (!dlg.open) dlg.showModal()
  dlg.querySelector('.det').scrollTop = 0
  dlg.querySelectorAll('[data-cuenta]').forEach(contar)
}

iniciar()
