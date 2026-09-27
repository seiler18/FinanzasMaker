import { html, pintar, aviso } from '../lib/dom.js'
import { clp, fechaCorta } from '../lib/formato.js'
import { TIPOS } from '../lib/analisis.js'

/* Correos que parecen bancarios pero ningún lector entendió: un banco sin
   lector propio (la red genérica los caza) o un formato que cambió.
   Nada de esto se registró ni se borró todavía: lo decides aquí. */

export function revisar(el, app) {
  const pendientes = app.datos.revisar || []
  const categorias = app.categorias()
  if (!pendientes.length) {
    return pintar(el, html`<section class="panel"><p class="vacio">No hay correos por revisar. Todo lo que llegó se entendió solo.</p></section>`)
  }
  pintar(el, html`
    <p class="intro">Estos correos parecen de un banco pero no los reconocí con seguridad. <b>Registrar</b> crea el movimiento
      ${app.datos.estado?.borrar ? 'y manda el correo a la papelera' : ''}; <b>Descartar</b> lo deja fuera de las cuentas.</p>
    ${pendientes.map((r) => html`
      <form class="panel tarjeta-revisar" data-gid="${r.gmail_id}">
        <header>
          <h2>${r.asunto}</h2>
          <p class="tenue">${r.remitente} · ${fechaCorta(r.fecha)}</p>
          <p class="motivo">${r.motivo}</p>
        </header>
        <blockquote class="extracto">${r.extracto}</blockquote>
        <div class="rejilla-campos">
          <label class="campo"><span>Tipo</span><select name="tipo">${Object.entries(TIPOS).map(([k, v]) => html`<option value="${k}" ${r.tipo === k ? 'selected' : ''}>${v}</option>`)}</select></label>
          <label class="campo"><span>Monto</span><input name="monto" type="number" min="1" step="1" value="${r.monto}" required></label>
          <label class="campo"><span>Banco</span><input name="banco" value="${r.banco}" maxlength="40"></label>
          <label class="campo"><span>Contraparte</span><input name="contraparte" value="${r.contraparte}" maxlength="80" placeholder="Comercio o persona"></label>
          <label class="campo"><span>Categoría</span><input name="categoria" list="cats-revisar" maxlength="40" placeholder="Se deduce si la dejas vacía"></label>
        </div>
        <div class="acciones">
          <button class="btn btn-borde" value="descartar" formnovalidate>Descartar</button>
          <button class="btn btn-borde" value="descartar-borrar" formnovalidate>Descartar y borrar el correo</button>
          <span class="separa"></span>
          <button class="btn btn-primario" value="registrar">Registrar ${r.monto ? clp(r.monto) : ''}</button>
        </div>
      </form>`)}
    <datalist id="cats-revisar">${categorias.map((c) => html`<option value="${c}">`)}</datalist>`)

  el.addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = e.target
    const accion = e.submitter?.value
    const d = Object.fromEntries(new FormData(form))
    const cuerpo = { gmail_id: form.dataset.gid }
    if (accion === 'registrar') Object.assign(cuerpo, { decision: 'registrar', mov: { tipo: d.tipo, monto: Number(d.monto), banco: d.banco, contraparte: d.contraparte, categoria: d.categoria } })
    else Object.assign(cuerpo, { decision: 'descartar', borrar: accion === 'descartar-borrar' })
    form.querySelectorAll('button').forEach((b) => { b.disabled = true })
    try {
      const r = await app.llamar('revisar', cuerpo)
      aviso(accion === 'registrar' ? `Registrado${r.borrado ? ' y correo a la papelera' : ''}` : r.borrado ? 'Descartado y borrado' : 'Descartado')
      await app.recargar()
    } catch (err) {
      aviso(err.message, 'error')
      form.querySelectorAll('button').forEach((b) => { b.disabled = false })
    }
  })
}
