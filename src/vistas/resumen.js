import { html, crudo, pintar, $, cerrarDialogo } from '../lib/dom.js'
import { clp, compacto, porciento, fechaCorta, conSigno, sentidoDe, SENTIDO } from '../lib/formato.js'
import { rango, mover, enRango, totales, porCategoria, porContraparte, porBanco, serie, hoyISO, ritmoGasto, proyeccionMes, TIPOS } from '../lib/analisis.js'
import { barrasPareadas, pintarBarrasHorizontales } from '../lib/grafico.js'
import { areaTendencia, anillo, dona, calor, sparkline, claseCat } from '../lib/tablero.js'
import { contarCifras } from '../lib/cuenta.js'
import { montarDotField } from '../lib/fondo-dotField.js'

// Qué significa que cada tarjeta suba (lo usa el delta flotante de cuenta.js).
const SUBE = { ingresos: 'bueno', gastos: 'malo', ahorro: 'bueno', inversion: 'neutro' }

const FLECHA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'

const ANTERIOR = { dia: 'el día anterior', mes: 'el mes anterior', año: 'el año anterior' }

/* Cuánto cambió una cifra frente al periodo anterior. `buenoSubiendo`: para
   los ingresos subir es bueno; para los gastos, malo. Sin base de
   comparación (el periodo anterior estaba en cero) no se inventa un
   porcentaje infinito: simplemente no hay chip. */
function variacion(actual, antes, buenoSubiendo) {
  if (!antes) return null
  const p = (actual - antes) / Math.abs(antes)
  if (Math.abs(p) < 0.01) return { texto: '= igual', clase: 'igual' }
  const sube = p > 0
  return { texto: `${sube ? '▲' : '▼'} ${Math.round(Math.abs(p) * 100)} %`, clase: sube === buenoSubiendo ? 'bien' : 'mal' }
}

/* Filas de la «cabina»: lo que dice cómo va el periodo además del ahorro.
   Cada fila solo aparece si tiene sentido (no se proyecta un mes que ya
   terminó, ni se promedia por día un día suelto). */
function filasCabina({ movs, escala, ref, r, t, antes }) {
  const filas = []
  const hoy = hoyISO()
  if (escala !== 'dia') {
    // El «por día» no cuenta los gastos grandes (arriendo, abonos, cuotas): un
    // solo pago de esos disparaba la cifra a algo que nunca se gasta en un día.
    const g = ritmoGasto(movs, r.desde, r.hasta, hoy)
    if (g.dias > 0 && g.corriente > 0) {
      const nota = g.grandes ? ` · sin ${g.grandes} gasto${g.grandes > 1 ? 's' : ''} grande${g.grandes > 1 ? 's' : ''} (${clp(g.grandesTotal)})` : ''
      filas.push(['Gastas por día', clp(g.porDia) + nota])
    }
    if (escala === 'mes' && hoy >= r.desde && hoy < r.hasta) {
      const pr = proyeccionMes(movs, ref.slice(0, 7), hoy)
      if (pr && (Number(hoy.slice(8, 10)) >= 3 || pr.ritmo > 0)) {
        filas.push(['Proyección a fin de mes', clp(pr.proy) + (t.ingresos > 0 ? ` · ${porciento(pr.proy / t.ingresos)} de lo que entró` : '')])
      }
    }
  }
  const v = variacion(t.gastos, antes.gastos, false)
  if (v && v.clase !== 'igual') filas.push([`Gasto vs ${ANTERIOR[escala]}`, `${v.texto} (${clp(antes.gastos)})`, v.clase])
  return filas
}

export function resumen(el, app) {
  const { escala, ref } = app.periodo
  const r = rango(escala, ref)
  const movs = enRango(app.datos.movimientos, r)
  const t = totales(movs)
  const antes = totales(enRango(app.datos.movimientos, rango(escala, mover(escala, ref, -1))))
  const cats = porCategoria(movs)
  const bancos = porBanco(movs.filter((m) => m.tipo === 'gasto' || m.tipo === 'ingreso'))
  const presup = new Map((app.datos.presupuestos || []).map((p) => [p.categoria, Number(p.monto_mensual) || 0]))
  const maxCat = Math.max(1, ...cats.map((c) => Math.max(c.monto, escala === 'mes' ? presup.get(c.categoria) || 0 : 0)))
  const puntos = escala === 'dia' ? null : serie(app.datos.movimientos, escala, ref)
  const filas = filasCabina({ movs: app.datos.movimientos, escala, ref, r, t, antes })

  // Ahorro acumulado punto a punto: sube cuando entra plata y baja cuando sale.
  let corrido = 0
  const sparks = puntos && {
    ingresos: puntos.map((p) => p.ingresos),
    gastos: puntos.map((p) => p.gastos),
    ahorro: puntos.map((p) => (corrido += p.ingresos - p.gastos)),
  }

  // Cada tarjeta es un botón: abre su detalle (abrirDetalle, más abajo).
  const kpi = (clave, titulo, valor, sentido, nota = '', cambio = null) => html`
    <button type="button" class="kpi kpi-${clave}" data-kpi="${clave}" aria-haspopup="dialog">
      <span class="kpi-titulo">${titulo}<span class="kpi-flecha">${crudo(FLECHA)}</span></span>
      <span class="cifra ${sentido ? 'monto-' + sentido : ''}" data-cuenta="${valor}" data-sentido="${sentido}" data-clave="${clave}" data-sube="${SUBE[clave]}">${conSigno(valor, sentido)}</span>
      ${cambio ? html`<span class="kpi-cambio kpi-${cambio.clase}">${cambio.texto}<small> vs ${ANTERIOR[escala].replace('el ', '')}</small></span>` : ''}
      ${nota ? html`<span class="kpi-nota">${nota}</span>` : ''}
      ${sparks && sparks[clave] ? crudo(sparkline(sparks[clave], 'sp-' + clave)) : ''}
    </button>`

  // Un mes sin ingresos casi siempre es un depósito que cayó el mes anterior:
  // se avisa dónde corregirlo en vez de dejar el «sin ingresos» a secas.
  const pistaIngreso = escala === 'mes' && t.ingresos === 0 && t.gastos > 0

  pintar(el, html`
    <div class="tablero">
      <section class="cabina" aria-label="Estado de ${r.etiqueta}">
        <span class="cabina-brillo cabina-brillo-1" aria-hidden="true"></span>
        <span class="cabina-brillo cabina-brillo-2" aria-hidden="true"></span>
        <span class="cabina-rejilla" aria-hidden="true"></span>
        <span class="cabina-puntos" aria-hidden="true"></span>
        <p class="cabina-eyebrow"><span class="punto-vivo" aria-hidden="true"></span>${r.etiqueta}</p>
        <div class="cabina-cuerpo">
          <div id="anillo" class="anillo"></div>
          <div class="cabina-datos">
            <p class="cabina-pregunta">${t.ahorro < 0 ? 'Gastaste de más' : 'Te quedó'}</p>
            <p class="cabina-cifra"><span class="cifra" data-cuenta="${t.ahorro}" data-sentido="${sentidoDe(t.ahorro)}" data-clave="cabina" data-sube="bueno">${conSigno(t.ahorro, sentidoDe(t.ahorro))}</span></p>
            <p class="cabina-sub">${t.tasa == null ? 'sin ingresos en el periodo' : `${porciento(t.tasa)} de lo que entró`}</p>
          </div>
        </div>
        ${filas.length ? html`<dl class="cabina-filas">${filas.map(([k, v, c]) => html`<div><dt>${k}</dt><dd class="${c ? 'cabina-' + c : ''}">${v}</dd></div>`)}</dl>` : ''}
        ${pistaIngreso ? html`<p class="cabina-pista">¿Un ingreso llegó antes de tiempo? Ábrelo en Movimientos y usa «Contar en el día» para que sume a este mes.</p>` : ''}
      </section>

      <section class="kpis" aria-label="Totales de ${r.etiqueta}. Toca una tarjeta para ver su detalle">
        ${kpi('ingresos', 'Ingresos', t.ingresos, t.ingresos ? 'mas' : '', '', variacion(t.ingresos, antes.ingresos, true))}
        ${kpi('gastos', 'Gastos', t.gastos, t.gastos ? 'menos' : '', '', variacion(t.gastos, antes.gastos, false))}
        ${kpi('ahorro', 'Ahorro', t.ahorro, sentidoDe(t.ahorro), t.tasa == null ? 'sin ingresos en el periodo' : `${porciento(t.tasa)} de lo que entró`)}
        ${kpi('inversion', 'Invertido neto', t.inversionNeta, '', `${clp(t.invertido)} aportado · ${clp(t.rescatado)} retirado`)}
      </section>
    </div>

    ${puntos ? html`
      <section class="panel">
        <header class="panel-cab"><div><h2>${escala === 'año' ? 'Mes a mes' : 'Día a día'}</h2>
          <p class="tenue">${escala === 'año' ? 'Toca un mes para abrirlo' : 'Toca un día para ver sus movimientos'}</p></div>
          <div class="escalas escalas-chicas" role="group" aria-label="Tipo de gráfico">
            <button type="button" class="escala" data-grafico="area" aria-pressed="true">Área</button>
            <button type="button" class="escala" data-grafico="barras" aria-pressed="false">Barras</button>
          </div></header>
        <div id="grafico" class="grafico"></div>
        <details class="tabla-datos">
          <summary>Ver como tabla</summary>
          <div class="tabla-scroll"><table>
            <thead><tr><th scope="col">${escala === 'año' ? 'Mes' : 'Día'}</th><th scope="col" class="num">Ingresos</th><th scope="col" class="num">Gastos</th></tr></thead>
            <tbody>${puntos.filter((p) => p.ingresos || p.gastos).map((p) => html`<tr><th scope="row">${p.largo}</th>${celda(p.ingresos, 'mas')}${celda(p.gastos, 'menos')}</tr>`)}</tbody>
          </table></div>
        </details>
      </section>` : ''}

    <section class="panel">
      <header class="panel-cab"><h2>En qué se fue</h2>
        <p class="tenue">${escala === 'mes' && presup.size ? 'La raya marca tu presupuesto · ' : ''}Toca una categoría para ver sus movimientos</p></header>
      ${cats.length ? html`<div class="reparto-gasto">
        <div id="dona" class="dona"></div>
        <ul class="cats">${cats.map((c, i) => {
          const tope = escala === 'mes' ? presup.get(c.categoria) : 0
          const estado = tope ? (c.monto > tope ? 'excedido' : c.monto >= tope * 0.8 ? 'cerca' : '') : ''
          return html`<li>
            <button class="cat" data-cat="${c.categoria}">
              <span class="cat-nombre"><i class="cat-punto d-${claseCat(i)}" aria-hidden="true"></i>${c.categoria}</span>
              <span class="cat-monto"><b class="monto-menos">${conSigno(c.monto, 'menos')}</b>${tope ? html` <small class="${estado}">de ${compacto(tope)}${estado === 'excedido' ? ' · excedido' : ''}</small>` : ''}</span>
              <span class="cat-pista" aria-hidden="true">
                <span class="cat-barra d-${claseCat(i)}" data-p="${(c.monto / maxCat) * 100}"></span>
                ${tope ? html`<span class="cat-tope" data-p="${(tope / maxCat) * 100}"></span>` : ''}
              </span>
            </button></li>`
        })}</ul></div>` : html`<p class="vacio">No hay gastos en ${r.etiqueta}.</p>`}
    </section>

    <div class="columnas">
      ${escala === 'mes' ? html`<section class="panel">
        <header class="panel-cab"><h2>Calendario de gasto</h2><p class="tenue">Cuanto más oscuro, más gastaste ese día</p></header>
        <div id="calor" class="calor"></div>
      </section>` : ''}

      <section class="panel">
        <header class="panel-cab"><h2>Por banco</h2></header>
        ${bancos.length ? html`<table class="tabla-bancos">
          <thead><tr><th scope="col">Banco</th><th scope="col" class="num">Entró</th><th scope="col" class="num">Salió</th></tr></thead>
          <tbody>${bancos.map((b) => html`<tr><th scope="row">${b.banco}</th>${celda(b.ingresos, 'mas')}${celda(b.gastos, 'menos')}</tr>`)}</tbody>
        </table>` : html`<p class="vacio">Sin movimientos.</p>`}
        ${grandes(movs)}
      </section>
    </div>
    <dialog id="detalle" class="dialogo hoja" aria-labelledby="detalle-titulo"></dialog>`)

  anillo(el.querySelector('#anillo'), t.tasa)

  if (puntos) {
    const elegir = (p) => app.cambiarPeriodo(escala === 'año' ? 'mes' : 'dia', escala === 'año' ? `${p.clave}-01` : p.clave, 'adentro')
    let tipoActual = 'area', anchoPintado = 0
    const pintarGrafico = (tipo) => {
      tipoActual = tipo
      const caja = el.querySelector('#grafico')
      anchoPintado = caja.clientWidth
      if (tipo === 'barras') barrasPareadas(caja, puntos, { alElegir: elegir })
      else areaTendencia(caja, puntos, { alElegir: elegir })
    }
    pintarGrafico('area')
    // Al cambiar el ancho de la ventana el gráfico se redibuja a su nuevo ancho.
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        const w = el.querySelector('#grafico')?.clientWidth
        if (w && Math.abs(w - anchoPintado) > 8) pintarGrafico(tipoActual)
      }).observe(el.querySelector('#grafico'))
    }
    el.querySelector('[data-grafico]').closest('.escalas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-grafico]')
      if (!b || b.getAttribute('aria-pressed') === 'true') return
      el.querySelectorAll('[data-grafico]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
      pintarGrafico(b.dataset.grafico)
    })
  }

  if (cats.length) {
    const donut = dona(el.querySelector('#dona'), cats, {
      total: t.gastos,
      alElegir: (s) => app.ir('movimientos', s.otros ? { tipo: 'gasto' } : { categoria: s.nombre }),
    })
    // La lista y la dona se iluminan juntas.
    const lista = el.querySelector('.cats')
    lista.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-cat]'); if (b) donut.resaltar(b.dataset.cat) })
    lista.addEventListener('pointerleave', () => donut.resaltar(null))
    lista.addEventListener('focusin', (e) => { const b = e.target.closest('[data-cat]'); if (b) donut.resaltar(b.dataset.cat) })
    lista.addEventListener('focusout', () => donut.resaltar(null))
  }

  if (escala === 'mes') {
    calor(el.querySelector('#calor'), puntos, { hoy: hoyISO(), alElegir: (p) => app.cambiarPeriodo('dia', p.clave, 'adentro') })
  }

  // La luz de cada tarjeta sigue al puntero (--mx/--my, ver tablero.css).
  el.querySelector('.kpis').addEventListener('pointermove', (e) => {
    const k = e.target.closest('.kpi')
    if (!k) return
    const c = k.getBoundingClientRect()
    k.style.setProperty('--mx', `${e.clientX - c.left}px`)
    k.style.setProperty('--my', `${e.clientY - c.top}px`)
  })

  pintarBarrasHorizontales(el)
  // Matriz de puntos tras la cifra de la cabina. Se retira sola cuando la vista
  // se vuelve a pintar (ver fondo-dotField.js). Alcance corto: la cabina mide
  // ~600 px, no la pantalla entera.
  const colores = getComputedStyle(document.documentElement)
  montarDotField(el.querySelector('.cabina-puntos'), {
    colorA: colores.getPropertyValue('--ing-aurora-1').trim(),
    colorB: colores.getPropertyValue('--ing-aurora-2').trim(),
    separacion: 12, alcance: 170, abombado: 26, ondulacion: 1.5, opacidad: 0.5,
  })
  // El periodo entra en la clave: pasar a otro mes no es «un cambio de cifra».
  contarCifras(el, `${escala}|${ref}`)
  el.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kpi]')
    if (k) return abrirDetalle(el, app, k.dataset.kpi, { movs, t, r })
    const b = e.target.closest('[data-cat]')
    if (b) app.ir('movimientos', { categoria: b.dataset.cat })
  })
}

// Una cifra en cero no lleva signo ni color: «+$0» en verde diría que entró algo.
const celda = (n, sentido) => html`<td class="num ${n ? 'monto-' + sentido : ''}">${n ? conSigno(n, sentido) : clp(0)}</td>`

function grandes(movs) {
  const top = movs.filter((m) => m.tipo === 'gasto').sort((a, b) => b.monto - a.monto).slice(0, 5)
  if (!top.length) return ''
  return html`<h3 class="sub">Los gastos más grandes</h3>
    <ol class="lista-simple">${top.map((m) => html`<li><span>${m.contraparte || TIPOS[m.tipo]}<small>${fechaCorta(m.fecha)} · ${m.banco}</small></span><b class="monto-menos">${conSigno(m.monto, 'menos')}</b></li>`)}</ol>`
}

/* ---------- Detalle de una tarjeta ----------
   En el celular sale como hoja desde abajo; en pantalla ancha, centrado.
   Todo sale de los movimientos ya cargados: no hay otra llamada al backend. */

function abrirDetalle(el, app, clave, { movs, t, r }) {
  const dlg = $('#detalle', el)
  const contenido = {
    ingresos: () => detalleTipo('ingreso', 'Ingresos', t.ingresos, movs, 'mas'),
    gastos: () => detalleTipo('gasto', 'Gastos', t.gastos, movs, 'menos'),
    ahorro: () => detalleAhorro(app, t, movs),
    inversion: () => detalleInversion(t, movs),
  }[clave]
  const filtro = { ingresos: 'ingreso', gastos: 'gasto', inversion: 'inversion' }[clave]
  pintar(dlg, html`
    <div class="hoja-cuerpo">
      <span class="hoja-asa" aria-hidden="true"></span>
      <header class="hoja-cab">
        <div><p class="tenue">${r.etiqueta}</p><h2 id="detalle-titulo">${{ ingresos: 'Ingresos', gastos: 'Gastos', ahorro: 'Ahorro', inversion: 'Invertido neto' }[clave]}</h2></div>
        <button type="button" class="btn btn-icono btn-borde" data-cerrar aria-label="Cerrar">×</button>
      </header>
      ${contenido()}
      ${filtro ? html`<button type="button" class="btn btn-primario hoja-ir" data-ir="${filtro}">Ver en Movimientos</button>` : ''}
    </div>`)
  pintarBarrasHorizontales(dlg)
  contarCifras(dlg)
  dlg.onclick = (e) => {
    // Un clic en el velo cae en el propio <dialog>, fuera de .hoja-cuerpo.
    if (e.target === dlg || e.target.closest('[data-cerrar]')) return cerrarDialogo(dlg)
    if (alClicDetalle(e)) return
    const ir = e.target.closest('[data-ir]')
    if (ir) { dlg.close(); app.ir('movimientos', { tipo: ir.dataset.ir }) }
  }
  dlg.showModal()
}

/* «Ver más», «Ver las demás» y el despliegue de una fila del reparto. Todo el
   contenido ya está pintado: aquí solo se destapa. Devuelve true si el clic era
   de los suyos. */
function alClicDetalle(e) {
  const abre = e.target.closest('[data-abre]')
  if (abre) {
    const abierto = abre.getAttribute('aria-expanded') !== 'true'
    abre.setAttribute('aria-expanded', String(abierto))
    abre.nextElementSibling.hidden = !abierto
    return true
  }
  const extras = e.target.closest('[data-extras]')
  if (extras) {
    extras.previousElementSibling.querySelectorAll('li[data-extra]').forEach((li) => { li.hidden = false })
    extras.remove()
    return true
  }
  const mas = e.target.closest('[data-mas]')
  if (mas) {
    const ocultos = [...mas.previousElementSibling.querySelectorAll('li[hidden]')]
    ocultos.slice(0, Number(mas.dataset.mas)).forEach((li) => { li.hidden = false })
    if (ocultos.length <= Number(mas.dataset.mas)) mas.remove()
    else mas.querySelector('small').textContent = `(${ocultos.length - Number(mas.dataset.mas)})`
    return true
  }
  return false
}

function total(valor, sentido, nota = '') {
  return html`<p class="hoja-total"><span class="cifra ${sentido ? 'monto-' + sentido : ''}" data-cuenta="${valor}" data-sentido="${sentido}">${conSigno(valor, sentido)}</span>
    ${nota ? html`<span class="tenue">${nota}</span>` : ''}</p>`
}

// Los movimientos más recientes primero (la fecha trae la hora: «2026-09-18 00:57»).
// Ordenar por monto mezclaba las horas del día y no se podía leer como línea de tiempo.
const recientes = (ms) => [...ms].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

const PASO = 8

/* Filas de movimientos; las que pasan de `max` quedan ocultas y las destapa el
   botón «Ver más» (ver `alClicDetalle`). Sin tope nunca habría que esconder
   nada: el detalle se abre con lo justo y quien quiere más lo pide. */
function filasMov(ms, max = PASO) {
  const orden = recientes(ms)
  return html`<ol class="lista-simple">${orden.map((m, i) => {
      const s = SENTIDO[m.tipo]
      return html`<li ${i >= max ? 'hidden' : ''}><span>${m.contraparte || TIPOS[m.tipo]}<small>${fechaCorta(m.fecha)} · ${m.banco}</small></span><b class="monto-${s}">${conSigno(m.monto, s)}</b></li>`
    })}</ol>
    ${orden.length > max ? html`<button type="button" class="btn btn-chico btn-borde ver-mas" data-mas="${PASO}">Ver más <small>(${orden.length - max})</small></button>` : ''}`
}

/* Barras de reparto (por categoría o por contraparte), del color del sentido.
   Tocar una fila despliega TODOS sus movimientos (`movsDe`); las filas que no
   caben en `max` se destapan con «Ver las demás». */
function reparto(titulo, filas, sentido, movsDe, max = 6) {
  if (!filas.length) return ''
  const tope = Math.max(1, filas[0].monto)
  return html`<h3 class="sub">${titulo}</h3>
    <ul class="reparto">${filas.map((f, i) => html`<li ${i >= max ? 'hidden data-extra' : ''}>
      <button type="button" class="reparto-fila" aria-expanded="false" data-abre>
        <span class="reparto-nombre">${f.nombre ?? f.categoria}<small>${f.n} movimiento${f.n > 1 ? 's' : ''}</small></span>
        <b class="monto-${sentido}">${conSigno(f.monto, sentido)}</b>
        <span class="reparto-pista" aria-hidden="true"><span class="reparto-barra reparto-${sentido}" data-p="${(f.monto / tope) * 100}"></span></span>
      </button>
      <div class="reparto-movs" hidden>${filasMov(movsDe(f), 10)}</div>
    </li>`)}</ul>
    ${filas.length > max ? html`<button type="button" class="btn btn-chico btn-borde ver-mas" data-extras>Ver las demás <small>(${filas.length - max})</small></button>` : ''}`
}

function lista(titulo, ms, max = PASO) {
  if (!ms.length) return ''
  return html`<h3 class="sub">${titulo}</h3>${filasMov(ms, max)}`
}

function detalleTipo(tipo, nombre, valor, movs, sentido) {
  const ms = movs.filter((m) => m.tipo === tipo)
  if (!ms.length) return html`<p class="vacio">No hubo ${nombre.toLowerCase()} en este periodo.</p>`
  const promedio = valor / ms.length
  return html`
    ${total(valor, sentido, `${ms.length} movimiento${ms.length > 1 ? 's' : ''} · promedio ${clp(promedio)}`)}
    ${reparto('Por categoría', porCategoria(movs, tipo), sentido, (f) => ms.filter((m) => (m.categoria || 'Otros') === f.categoria))}
    ${reparto(tipo === 'ingreso' ? 'De quién vino' : 'A quién se le pagó', porContraparte(movs, tipo), sentido, (f) => ms.filter((m) => (String(m.contraparte || '').trim() || TIPOS[tipo]) === f.nombre), 5)}
    ${lista(tipo === 'ingreso' ? 'Los últimos ingresos' : 'Los últimos gastos', ms, 8)}`
}

function detalleAhorro(app, t, movs) {
  const { escala, ref } = app.periodo
  const antes = totales(enRango(app.datos.movimientos, rango(escala, mover(escala, ref, -1))))
  const dif = t.ahorro - antes.ahorro
  const noSuma = movs.filter((m) => m.tipo === 'interna' || m.tipo === 'pago_tarjeta').reduce((s, m) => s + (Number(m.monto) || 0), 0)
  const nombreAntes = { dia: 'el día anterior', mes: 'el mes anterior', año: 'el año anterior' }[escala]
  return html`
    ${total(t.ahorro, sentidoDe(t.ahorro), t.tasa == null ? 'sin ingresos en el periodo' : `${porciento(t.tasa)} de lo que entró`)}
    <dl class="cuenta-ahorro">
      <div><dt>Entró</dt><dd class="monto-mas">${conSigno(t.ingresos, t.ingresos ? 'mas' : '')}</dd></div>
      <div><dt>Salió en gastos</dt><dd class="monto-menos">${conSigno(t.gastos, t.gastos ? 'menos' : '')}</dd></div>
      <div class="cuenta-total"><dt>Te quedó</dt><dd class="${t.ahorro ? 'monto-' + sentidoDe(t.ahorro) : ''}">${conSigno(t.ahorro, sentidoDe(t.ahorro))}</dd></div>
    </dl>
    <p class="comparacion">${dif === 0 ? html`Igual que ${nombreAntes}.`
      : html`<b class="monto-${sentidoDe(dif)}">${conSigno(dif, sentidoDe(dif))}</b> ${dif > 0 ? 'más' : 'menos'} que ${nombreAntes} (${clp(antes.ahorro)}).`}</p>
    <p class="tenue">Lo invertido no cuenta como gasto: está en «Invertido neto».${noSuma ? html` Tampoco suman ${clp(noSuma)} entre tus cuentas y pagos de tarjeta, que ya se contaron al comprar.` : ''}</p>`
}

function detalleInversion(t, movs) {
  const aportes = movs.filter((m) => m.tipo === 'inversion')
  const rescates = movs.filter((m) => m.tipo === 'rescate')
  if (!aportes.length && !rescates.length) return html`<p class="vacio">No hubo aportes ni rescates en este periodo.</p>`
  return html`
    ${total(t.inversionNeta, '', 'aportado menos retirado')}
    <dl class="cuenta-ahorro">
      <div><dt>Aportaste</dt><dd class="monto-menos">${conSigno(t.invertido, t.invertido ? 'menos' : '')}</dd></div>
      <div><dt>Retiraste</dt><dd class="monto-mas">${conSigno(t.rescatado, t.rescatado ? 'mas' : '')}</dd></div>
    </dl>
    ${reparto('Dónde', porContraparte(movs, 'inversion'), 'menos', (f) => aportes.filter((m) => (String(m.contraparte || '').trim() || TIPOS.inversion) === f.nombre), 5)}
    ${lista('Movimientos', [...aportes, ...rescates])}`
}
