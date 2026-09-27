import { html, pintar } from '../lib/dom.js'
import { clp, compacto, porciento, fechaCorta } from '../lib/formato.js'
import { rango, enRango, totales, porCategoria, porBanco, serie, TIPOS } from '../lib/analisis.js'
import { barrasPareadas, pintarBarrasHorizontales } from '../lib/grafico.js'

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

  pintar(el, html`
    <section class="kpis" aria-label="Totales de ${r.etiqueta}">
      <article class="kpi"><h3>Ingresos</h3><p class="cifra">${clp(t.ingresos)}</p></article>
      <article class="kpi"><h3>Gastos</h3><p class="cifra">${clp(t.gastos)}</p></article>
      <article class="kpi"><h3>Ahorro</h3><p class="cifra ${t.ahorro < 0 ? 'negativo' : ''}">${clp(t.ahorro)}</p>
        <p class="kpi-nota">${t.tasa == null ? 'sin ingresos en el periodo' : `${porciento(t.tasa)} de lo que entró`}</p></article>
      <article class="kpi"><h3>Invertido neto</h3><p class="cifra">${clp(t.inversionNeta)}</p>
        <p class="kpi-nota">${clp(t.invertido)} aportado · ${clp(t.rescatado)} retirado</p></article>
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
            <tbody>${puntos.filter((p) => p.ingresos || p.gastos).map((p) => html`<tr><th scope="row">${p.largo}</th><td class="num">${clp(p.ingresos)}</td><td class="num">${clp(p.gastos)}</td></tr>`)}</tbody>
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
              <span class="cat-monto">${clp(c.monto)}${tope ? html` <small class="${estado}">de ${compacto(tope)}${estado === 'excedido' ? ' · excedido' : ''}</small>` : ''}</span>
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
          <tbody>${bancos.map((b) => html`<tr><th scope="row">${b.banco}</th><td class="num">${clp(b.ingresos)}</td><td class="num">${clp(b.gastos)}</td></tr>`)}</tbody>
        </table>` : html`<p class="vacio">Sin movimientos.</p>`}
        ${grandes(movs)}
      </section>
    </div>`)

  if (puntos) {
    barrasPareadas(el.querySelector('#grafico'), puntos, {
      alElegir: (p) => app.cambiarPeriodo(escala === 'año' ? 'mes' : 'dia', escala === 'año' ? `${p.clave}-01` : p.clave),
    })
  }
  pintarBarrasHorizontales(el)
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]')
    if (b) app.ir('movimientos', { categoria: b.dataset.cat })
  })
}

function grandes(movs) {
  const top = movs.filter((m) => m.tipo === 'gasto').sort((a, b) => b.monto - a.monto).slice(0, 5)
  if (!top.length) return ''
  return html`<h3 class="sub">Los gastos más grandes</h3>
    <ol class="lista-simple">${top.map((m) => html`<li><span>${m.contraparte || TIPOS[m.tipo]}<small>${fechaCorta(m.fecha)} · ${m.banco}</small></span><b>${clp(m.monto)}</b></li>`)}</ol>`
}

