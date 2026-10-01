import { html, pintar, $, aviso } from '../lib/dom.js'
import { clp, fechaCorta, conSigno, SENTIDO } from '../lib/formato.js'
import { rango, enRango, TIPOS } from '../lib/analisis.js'

/* Lista del periodo, agrupada por día, con filtros y edición.
   Editar la categoría con «aplicar a todos» guarda una regla en la hoja: la
   próxima compra en ese comercio ya llega bien clasificada. */

// Dentro de cada día se ordena por hora; mostrarla deja ver que el orden es el real.
// Los manuales sin hora quedan en 00:00 y no la muestran, como en fechaCorta.
const hora = (f) => { const h = String(f || '').slice(11, 16); return h && h !== '00:00' ? h + ' · ' : '' }

export function movimientos(el, app, filtros = {}) {
  const r = rango(app.periodo.escala, app.periodo.ref)
  const todos = enRango(app.datos.movimientos, r).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  const bancos = [...new Set(app.datos.movimientos.map((m) => m.banco).filter(Boolean))].sort()
  const categorias = app.categorias()
  const f = { texto: '', tipo: '', banco: '', categoria: '', ...filtros }

  pintar(el, html`
    <section class="panel">
      <form class="filtros" role="search">
        <label class="campo campo-ancho"><span>Buscar</span><input type="search" name="texto" value="${f.texto}" placeholder="Comercio, persona, nota…"></label>
        <label class="campo"><span>Tipo</span><select name="tipo"><option value="">Todos</option>${Object.entries(TIPOS).map(([k, v]) => html`<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${v}</option>`)}</select></label>
        <label class="campo"><span>Banco</span><select name="banco"><option value="">Todos</option>${bancos.map((b) => html`<option ${f.banco === b ? 'selected' : ''}>${b}</option>`)}</select></label>
        <label class="campo"><span>Categoría</span><select name="categoria"><option value="">Todas</option>${categorias.map((c) => html`<option ${f.categoria === c ? 'selected' : ''}>${c}</option>`)}</select></label>
      </form>
      <div id="lista"></div>
    </section>
    <dialog id="editor" class="dialogo"></dialog>`)

  const lista = $('#lista', el)
  const form = $('.filtros', el)
  const pintarLista = () => {
    const d = Object.fromEntries(new FormData(form))
    const q = d.texto.trim().toLowerCase()
    const vis = todos.filter((m) => (!d.tipo || m.tipo === d.tipo) && (!d.banco || m.banco === d.banco) && (!d.categoria || m.categoria === d.categoria)
      && (!q || `${m.contraparte} ${m.nota} ${m.detalle} ${m.categoria}`.toLowerCase().includes(q)))
    if (!vis.length) return pintar(lista, html`<p class="vacio">No hay movimientos con esos filtros en ${r.etiqueta}.</p>`)
    const dias = new Map()
    for (const m of vis) { const k = String(m.fecha).slice(0, 10); if (!dias.has(k)) dias.set(k, []); dias.get(k).push(m) }
    pintar(lista, html`<p class="tenue cuenta">${vis.length} movimiento${vis.length > 1 ? 's' : ''}</p>
      ${[...dias].map(([dia, ms]) => html`
      <h3 class="dia">${fechaCorta(dia)}</h3>
      <ul class="movs">${ms.map((m) => html`
        <li><button class="mov mov-${m.tipo}" data-id="${m.id}">
          <span class="mov-txt"><b>${m.contraparte || TIPOS[m.tipo]}</b>
            <small>${hora(m.fecha)}${m.categoria || 'Otros'} · ${m.banco}${m.producto && m.producto !== 'Cuenta' ? ' · ' + m.producto : ''}${Number(m.cuotas) > 1 ? ` · ${m.cuotas} cuotas` : ''}${m.origen === 'manual' ? ' · manual' : ''}${m.nota ? ' · ' + m.nota : ''}</small></span>
          <span class="mov-monto"><b class="${SENTIDO[m.tipo] ? 'monto-' + SENTIDO[m.tipo] : ''}">${conSigno(m.monto, SENTIDO[m.tipo])}</b>${m.tipo === 'interna' || m.tipo === 'pago_tarjeta' ? html`<small>no suma</small>` : ''}</span>
        </button></li>`)}</ul>`)}`)
  }
  form.addEventListener('input', pintarLista)
  form.addEventListener('submit', (e) => e.preventDefault())
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]')
    if (b) editar(el, app, app.datos.movimientos.find((m) => m.id === b.dataset.id), categorias)
  })
  pintarLista()
}

function editar(el, app, m, categorias) {
  const dlg = $('#editor', el)
  const manual = m.origen === 'manual'
  pintar(dlg, html`
    <form method="dialog" class="form-dialogo">
      <h2>${m.contraparte || TIPOS[m.tipo]}</h2>
      <p class="tenue">${fechaCorta(m.fecha)} · ${m.banco} · ${clp(m.monto)}${m.moneda === 'USD' ? ` (US$${m.monto_original})` : m.moneda && m.moneda !== 'CLP' ? ` (${m.monto_original} ${m.moneda})` : ''}${m.detalle ? ' · ' + m.detalle : ''}</p>
      <label class="campo"><span>Tipo</span><select name="tipo">${Object.entries(TIPOS).map(([k, v]) => html`<option value="${k}" ${m.tipo === k ? 'selected' : ''}>${v}</option>`)}</select></label>
      <label class="campo"><span>Categoría</span><input name="categoria" value="${m.categoria}" list="lista-cats" autocomplete="off" required maxlength="40">
        <datalist id="lista-cats">${categorias.map((c) => html`<option value="${c}">`)}</datalist></label>
      ${m.contraparte ? html`<label class="check"><input type="checkbox" name="regla"> Aplicar a todo lo de «${m.contraparte}», también a lo que llegue después</label>` : ''}
      ${manual ? html`
        <label class="campo"><span>Monto</span><input name="monto" type="number" min="1" step="1" value="${m.monto}"></label>
        <label class="campo"><span>Fecha</span><input name="fecha" type="date" value="${String(m.fecha).slice(0, 10)}"></label>
        <label class="campo"><span>Contraparte</span><input name="contraparte" value="${m.contraparte}" maxlength="80"></label>` : ''}
      <label class="campo"><span>Nota</span><input name="nota" value="${m.nota}" maxlength="200"></label>
      <div class="acciones">
        <button class="btn btn-peligro" value="eliminar" formnovalidate>Eliminar</button>
        <span class="separa"></span>
        <button class="btn btn-borde" value="cancelar" formnovalidate>Cancelar</button>
        <button class="btn btn-primario" value="guardar">Guardar</button>
      </div>
    </form>`)
  const form = $('form', dlg)
  form.addEventListener('submit', async (e) => {
    const accion = e.submitter?.value
    if (accion === 'cancelar') return
    e.preventDefault()
    try {
      if (accion === 'eliminar') {
        if (!confirm('¿Eliminar este movimiento? El correo original no vuelve a importarse.')) return
        await app.llamar('eliminar', { id: m.id })
        aviso('Movimiento eliminado')
      } else {
        const d = Object.fromEntries(new FormData(form))
        const cambios = { id: m.id, tipo: d.tipo, categoria: d.categoria.trim(), nota: d.nota, regla: d.regla === 'on' }
        if (manual) Object.assign(cambios, { monto: Number(d.monto), fecha: d.fecha, contraparte: d.contraparte })
        const r = await app.llamar('editar', cambios)
        aviso(r.aplicados ? `Guardado, y aplicado a ${r.aplicados} movimiento${r.aplicados > 1 ? 's' : ''} más` : 'Guardado')
      }
      dlg.close()
      await app.recargar()
    } catch (err) { aviso(err.message, 'error') }
  })
  dlg.showModal()
}
