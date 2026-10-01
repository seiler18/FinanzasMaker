import { html, crudo, pintar, $, cerrarDialogo } from '../lib/dom.js'
import { clp, compacto, porciento, fechaCorta, conSigno, sentidoDe, SENTIDO } from '../lib/formato.js'
import { rango, mover, enRango, totales, porCategoria, porContraparte, porBanco, serie, TIPOS } from '../lib/analisis.js'
import { barrasPareadas, pintarBarrasHorizontales } from '../lib/grafico.js'
import { contarCifras } from '../lib/cuenta.js'

const FLECHA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'

export function resumen(el, app) {
  const { escala, ref } = app.periodo
  const r = rango(escala, ref)
  const movs = enRango(app.datos.movimientos, r)
  const t = totales(movs)
  const cats = porCategoria(movs)
  const bancos = porBanco(movs.filter((m) => m.tipo === 'gasto' || m.tipo === 'ingreso'))
  const presup = new Map((app.datos.presupuestos || []).map((p) => [p.categoria, Number(p.monto_mensual) || 0]))
  const maxCat = Math.max(1, ...cats.map((c) => Math.max(c.monto, escala === 'mes' ? presup.get(c.categoria) || 0 : 0)))
  const puntos = escala === 'dia' ? null : serie(app.datos.movimientos, escala, ref)

  // Cada tarjeta es un botón: abre su detalle (abrirDetalle, más abajo).
  const kpi = (clave, titulo, valor, sentido, nota = '') => html`
    <button type="button" class="kpi kpi-${clave}" data-kpi="${clave}" aria-haspopup="dialog">
      <span class="kpi-titulo">${titulo}<span class="kpi-flecha">${crudo(FLECHA)}</span></span>
      <span class="cifra ${sentido ? 'monto-' + sentido : ''}" data-cuenta="${valor}" data-sentido="${sentido}">${conSigno(valor, sentido)}</span>
      ${nota ? html`<span class="kpi-nota">${nota}</span>` : ''}
    </button>`

  pintar(el, html`
    <section class="kpis" aria-label="Totales de ${r.etiqueta}. Toca una tarjeta para ver su detalle">
      ${kpi('ingresos', 'Ingresos', t.ingresos, t.ingresos ? 'mas' : '')}
      ${kpi('gastos', 'Gastos', t.gastos, t.gastos ? 'menos' : '')}
      ${kpi('ahorro', 'Ahorro', t.ahorro, sentidoDe(t.ahorro), t.tasa == null ? 'sin ingresos en el periodo' : `${porciento(t.tasa)} de lo que entró`)}
      ${kpi('inversion', 'Invertido neto', t.inversionNeta, '', `${clp(t.invertido)} aportado · ${clp(t.rescatado)} retirado`)}
    </section>

    ${puntos ? html`
      <section class="panel">
        <header class="panel-cab"><h2>${escala === 'año' ? 'Mes a mes' : 'Día a día'}</h2>
          <p class="tenue">${escala === 'año' ? 'Toca un mes para abrirlo' : 'Toca un día para ver sus movimientos'}</p></header>
        <div id="grafico" class="grafico"></div>
        <details class="tabla-datos">
          <summary>Ver como tabla</summary>
          <div class="tabla-scroll"><table>
            <thead><tr><th scope="col">${escala === 'año' ? 'Mes' : 'Día'}</th><th scope="col" class="num">Ingresos</th><th scope="col" class="num">Gastos</th></tr></thead>
            <tbody>${puntos.filter((p) => p.ingresos || p.gastos).map((p) => html`<tr><th scope="row">${p.largo}</th>${celda(p.ingresos, 'mas')}${celda(p.gastos, 'menos')}</tr>`)}</tbody>
          </table></div>
        </details>
      </section>` : ''}

    <div class="columnas">
      <section class="panel">
        <header class="panel-cab"><h2>En qué se fue</h2>
          ${escala === 'mes' && presup.size ? html`<p class="tenue">La raya marca tu presupuesto</p>` : ''}</header>
        ${cats.length ? html`<ul class="cats">${cats.map((c) => {
          const tope = escala === 'mes' ? presup.get(c.categoria) : 0
          const estado = tope ? (c.monto > tope ? 'excedido' : c.monto >= tope * 0.8 ? 'cerca' : '') : ''
          return html`<li>
            <button class="cat" data-cat="${c.categoria}">
              <span class="cat-nombre">${c.categoria}</span>
              <span class="cat-monto"><b class="monto-menos">${conSigno(c.monto, 'menos')}</b>${tope ? html` <small class="${estado}">de ${compacto(tope)}${estado === 'excedido' ? ' · excedido' : ''}</small>` : ''}</span>
              <span class="cat-pista" aria-hidden="true">
                <span class="cat-barra" data-p="${(c.monto / maxCat) * 100}"></span>
                ${tope ? html`<span class="cat-tope" data-p="${(tope / maxCat) * 100}"></span>` : ''}
              </span>
            </button></li>`
        })}</ul>` : html`<p class="vacio">No hay gastos en ${r.etiqueta}.</p>`}
      </section>

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

  if (puntos) {
    barrasPareadas(el.querySelector('#grafico'), puntos, {
      alElegir: (p) => app.cambiarPeriodo(escala === 'año' ? 'mes' : 'dia', escala === 'año' ? `${p.clave}-01` : p.clave, 'adentro'),
    })
  }
  pintarBarrasHorizontales(el)
  contarCifras(el)
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
    const ir = e.target.closest('[data-ir]')
    if (ir) { dlg.close(); app.ir('movimientos', { tipo: ir.dataset.ir }) }
  }
  dlg.showModal()
}

function total(valor, sentido, nota = '') {
  return html`<p class="hoja-total"><span class="cifra ${sentido ? 'monto-' + sentido : ''}" data-cuenta="${valor}" data-sentido="${sentido}">${conSigno(valor, sentido)}</span>
    ${nota ? html`<span class="tenue">${nota}</span>` : ''}</p>`
}

// Barras de reparto (por categoría o por contraparte), del color del sentido.
function reparto(titulo, filas, sentido, max = 6) {
  if (!filas.length) return ''
  const tope = Math.max(1, filas[0].monto)
  const vis = filas.slice(0, max)
  const resto = filas.slice(max).reduce((s, f) => s + f.monto, 0)
  return html`<h3 class="sub">${titulo}</h3>
    <ul class="reparto">${vis.map((f) => html`<li>
      <span class="reparto-nombre">${f.nombre ?? f.categoria}<small>${f.n} movimiento${f.n > 1 ? 's' : ''}</small></span>
      <b class="monto-${sentido}">${conSigno(f.monto, sentido)}</b>
      <span class="reparto-pista" aria-hidden="true"><span class="reparto-barra reparto-${sentido}" data-p="${(f.monto / tope) * 100}"></span></span>
    </li>`)}</ul>
    ${resto ? html`<p class="tenue">y ${conSigno(resto, sentido)} más en ${filas.length - max} otro${filas.length - max > 1 ? 's' : ''}</p>` : ''}`
}

// Cronológica, lo más reciente primero (la fecha trae la hora: «2026-09-18 00:57»).
// Ordenar por monto mezclaba las horas del día y no se podía leer como línea de tiempo.
function lista(titulo, ms, max = 8) {
  if (!ms.length) return ''
  const vis = [...ms].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, max)
  return html`<h3 class="sub">${titulo}</h3>
    <ol class="lista-simple">${vis.map((m) => {
      const s = SENTIDO[m.tipo]
      return html`<li><span>${m.contraparte || TIPOS[m.tipo]}<small>${fechaCorta(m.fecha)} · ${m.banco}</small></span><b class="monto-${s}">${conSigno(m.monto, s)}</b></li>`
    })}</ol>`
}

function detalleTipo(tipo, nombre, valor, movs, sentido) {
  const ms = movs.filter((m) => m.tipo === tipo)
  if (!ms.length) return html`<p class="vacio">No hubo ${nombre.toLowerCase()} en este periodo.</p>`
  const promedio = valor / ms.length
  return html`
    ${total(valor, sentido, `${ms.length} movimiento${ms.length > 1 ? 's' : ''} · promedio ${clp(promedio)}`)}
    ${reparto('Por categoría', porCategoria(movs, tipo), sentido)}
    ${reparto(tipo === 'ingreso' ? 'De quién vino' : 'A quién se le pagó', porContraparte(movs, tipo), sentido, 5)}
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
    ${reparto('Dónde', porContraparte(movs, 'inversion'), 'menos', 5)}
    ${lista('Movimientos', [...aportes, ...rescates])}`
}
