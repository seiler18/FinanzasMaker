import { html, pintar } from '../lib/dom.js'
import { clp, fechaCorta, conSigno } from '../lib/formato.js'
import { rango, hoyISO, comprasEnCuotas, timbrePorMes, TIMBRE } from '../lib/analisis.js'
import { pintarBarrasHorizontales } from '../lib/grafico.js'
import { contarCifras } from '../lib/cuenta.js'

/* Impuesto de timbres de las compras en cuotas: estimación de lo que el banco
   cargará por las compras del mes. Cómo se calcula y por qué es una
   estimación: ver el comentario de TIMBRE en analisis.js. */

const pct = (n) => n.toLocaleString('es-CL', { maximumFractionDigits: 3 }) + ' %'
const diasDelMes = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate()

export function cuotas(el, app) {
  const mes = app.periodo.ref.slice(0, 7)
  const etiqueta = rango('mes', app.periodo.ref).etiqueta
  const { compras, total, impuesto } = comprasEnCuotas(app.datos.movimientos, mes)
  const meses = timbrePorMes(app.datos.movimientos, mes, 6)
  const maxMes = Math.max(1, ...meses.map((m) => m.impuesto))

  // Proyección solo del mes en curso: las compras en cuotas son pocas y
  // grandes, así que a inicios de mes el ritmo no dice nada.
  const hoy = hoyISO()
  let proyeccion = null
  if (mes === hoy.slice(0, 7) && impuesto > 0) {
    const dia = Number(hoy.slice(8, 10))
    const [a, m] = mes.split('-').map(Number)
    if (dia >= 5 && dia < diasDelMes(a, m)) proyeccion = Math.round((impuesto / dia) * diasDelMes(a, m))
  }

  pintar(el, html`
    <section class="kpis" aria-label="Impuesto de timbres estimado de ${etiqueta}">
      <div class="kpi kpi-fijo kpi-gastos">
        <span class="kpi-titulo">Impuesto estimado</span>
        <span class="cifra monto-menos" data-cuenta="${impuesto}" data-sentido="${impuesto ? 'menos' : ''}">${conSigno(impuesto, impuesto ? 'menos' : '')}</span>
        <span class="kpi-nota">por las compras de ${etiqueta}</span>
      </div>
      <div class="kpi kpi-fijo">
        <span class="kpi-titulo">Compras en cuotas</span>
        <span class="cifra" data-cuenta="${total}">${clp(total)}</span>
        <span class="kpi-nota">${compras.length} compra${compras.length === 1 ? '' : 's'}${total ? ` · el impuesto es el ${pct((impuesto / total) * 100)} del total` : ''}</span>
      </div>
      ${proyeccion ? html`<div class="kpi kpi-fijo">
        <span class="kpi-titulo">Proyección a fin de mes</span>
        <span class="cifra" data-cuenta="${proyeccion}">${clp(proyeccion)}</span>
        <span class="kpi-nota">si sigues comprando a este ritmo</span>
      </div>` : ''}
    </section>

    <section class="panel">
      <header class="panel-cab"><div><h2>Compras en cuotas de ${etiqueta}</h2>
        <p class="tenue">${pct(TIMBRE.tasaMes)} por cada mes de plazo, con tope de ${pct(TIMBRE.tope)}</p></div>
      </header>
      ${compras.length ? html`<div class="tabla-scroll"><table>
        <thead><tr><th scope="col">Compra</th><th scope="col" class="num">Monto</th><th scope="col" class="num">Cuotas</th><th scope="col" class="num">Tasa</th><th scope="col" class="num">Impuesto</th></tr></thead>
        <tbody>${compras.map((c) => html`<tr>
          <th scope="row">${c.contraparte || 'Compra'}<small class="fila-sub">${fechaCorta(c.fecha)} · ${c.banco}</small></th>
          <td class="num">${clp(c.monto)}</td><td class="num">${c.cuotas}</td><td class="num">${pct(c.pct)}</td>
          <td class="num monto-menos">${conSigno(c.impuesto, 'menos')}</td></tr>`)}</tbody>
        <tfoot><tr><th scope="row">Total</th><td class="num">${clp(total)}</td><td></td><td></td><td class="num monto-menos">${conSigno(impuesto, 'menos')}</td></tr></tfoot>
      </table></div>` : html`<p class="vacio">No hay compras en cuotas en ${etiqueta}.</p>`}
    </section>

    <div class="columnas">
      <section class="panel">
        <header class="panel-cab"><h2>Últimos 6 meses</h2><p class="tenue">Impuesto estimado por mes</p></header>
        <ul class="reparto">${meses.map((m) => html`<li>
          <span class="reparto-nombre">${m.etiqueta}<small>${m.n} compra${m.n === 1 ? '' : 's'}</small></span>
          <b class="${m.impuesto ? 'monto-menos' : ''}">${m.impuesto ? conSigno(m.impuesto, 'menos') : clp(0)}</b>
          <span class="reparto-pista" aria-hidden="true"><span class="reparto-barra reparto-menos" data-p="${(m.impuesto / maxMes) * 100}"></span></span>
        </li>`)}</ul>
      </section>

      <section class="panel">
        <header class="panel-cab"><h2>Cómo se calcula</h2></header>
        <ul class="notas">
          <li>El impuesto de timbres y estampillas (DL 3475) grava el crédito: <b>${pct(TIMBRE.tasaMes)} del monto por cada mes de plazo</b>, hasta ${pct(TIMBRE.tope)} (desde las 13 cuotas).</li>
          <li>Aplica aunque las cuotas sean <b>sin interés</b>, también las de 3 cuotas. Lo cobra el banco como «Impuesto Decreto Ley 3475» y aparece en el <b>mismo estado de cuenta</b>, uno o dos días después de la compra.</li>
          <li>Pagar en <b>1 cuota</b> no genera este cargo (en Tenpo; MACH cobró una vez el 0,066 % de una compra en 1 cuota, caso aún sin explicar).</li>
          <li>Es una <b>estimación</b>: calzó al peso con tres cargos reales de Tenpo, pero cada banco puede calcular distinto. Compara con el cargo de tu estado de cuenta.</li>
        </ul>
      </section>
    </div>`)

  pintarBarrasHorizontales(el)
  contarCifras(el)
}
