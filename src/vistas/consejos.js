import { html, pintar } from '../lib/dom.js'
import { clp } from '../lib/formato.js'
import { consejos as calcular, suscripciones, rango } from '../lib/analisis.js'

const ICONO = { alerta: '!', atencion: '▲', info: 'i', bien: '✓' }
const NIVEL = { alerta: 'Alerta', atencion: 'Atención', info: 'Dato', bien: 'Bien' }

export function consejos(el, app) {
  // Los consejos son mensuales: en vista de año se usa el mes de referencia.
  const mes = app.periodo.ref.slice(0, 7)
  const lista = calcular(app.datos.movimientos, app.datos.presupuestos, mes)
  const subs = suscripciones(app.datos.movimientos, mes)
  const etiqueta = rango('mes', app.periodo.ref).etiqueta

  pintar(el, html`
    <section class="panel">
      <header class="panel-cab"><h2>Consejos para ${etiqueta}</h2></header>
      ${lista.length ? html`<ul class="consejos">${lista.map((c) => html`
        <li class="consejo consejo-${c.nivel}">
          <span class="consejo-icono" aria-hidden="true">${ICONO[c.nivel]}</span>
          <div><h3><span class="oculto-visual">${NIVEL[c.nivel]}: </span>${c.titulo}</h3><p>${c.texto}</p>
          ${c.categoria ? html`<button class="enlace" data-cat="${c.categoria}">Ver movimientos de ${c.categoria}</button>` : ''}</div>
        </li>`)}</ul>` : html`<p class="vacio">Sin observaciones para este mes. Con más movimientos registrados salen más consejos.</p>`}
    </section>

    ${subs.length ? html`<section class="panel">
      <header class="panel-cab"><h2>Cobros que se repiten</h2><p class="tenue">Mismo comercio y monto parecido en 2 o más de los últimos 4 meses</p></header>
      <table class="tabla-bancos">
        <thead><tr><th scope="col">Comercio</th><th scope="col" class="num">Al mes</th><th scope="col" class="num">Al año</th></tr></thead>
        <tbody>${subs.map((s) => html`<tr><th scope="row">${s.contraparte}</th><td class="num">${clp(s.monto)}</td><td class="num">${clp(s.anual)}</td></tr>`)}</tbody>
      </table>
    </section>` : ''}`)

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]')
    if (b) app.ir('movimientos', { categoria: b.dataset.cat })
  })
}
