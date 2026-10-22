import { html, pintar, aviso, $, $$ } from '../lib/dom.js'
import { clp, fechaCorta, conSigno, SENTIDO } from '../lib/formato.js'
import { TIPOS } from '../lib/analisis.js'
import { leerCartola, ErrorCartola } from '../lib/cartolas/formatos.js'
import { clasificar } from '../lib/cartolas/clasificar.js'
import { cruzar } from '../lib/cartolas/cruzar.js'

/* «Subir una cartola», dentro de Agregar: lo que ningún aviso trajo.

   1. El dueño elige el PDF (y su clave, si tiene). Se lee aquí, en el
      navegador (src/lib/cartolas/pdf.js): el archivo no sale del equipo.
   2. Se lee la tabla y se cuadra con los totales que declara la misma
      cartola. Si no cuadra, se dice antes de ofrecer nada.
   3. Se cruza con lo ya registrado: lo que falta viene marcado; lo de antes
      del periodo, sin marcar; lo ya registrado y lo informativo, aparte.
   4. Se agrega lo marcado, con id fijo: subirla dos veces no duplica. */

const BANCOS = ['MACH', 'Copec Pay', 'Tenpo', 'Mercado Pago', 'BancoEstado', 'BCI', 'Falabella']
const fecha = (f) => (f ? fechaCorta(f) : '—')

export function panelCartola(el, app) {
  let bytes = null
  let leida = null
  let datos = app.datos
  // De src/lib/cartolas/pdf.js, que se carga recién al elegir un archivo.
  let ClavePdf = class {}

  pintar(el, html`
    <header class="panel-cab"><h2>Subir una cartola</h2>
      <p class="tenue">Lee la cartola de MACH y de Copec Pay, y el estado de cuenta de las tarjetas MACH y Tenpo. El PDF se abre aquí, en tu navegador: no se sube a ningún lado.</p></header>
    <label class="campo"><span>Cartola o estado de cuenta (PDF)</span><input type="file" id="cartola-archivo" accept="application/pdf,.pdf"></label>
    <div id="cartola-paso"></div>`)
  const paso = $('#cartola-paso', el)

  async function abrir(clave) {
    pintar(paso, html`<p class="tenue">Leyendo el PDF…</p>`)
    try {
      const pdf = await import('../lib/cartolas/pdf.js')
      ClavePdf = pdf.ClavePdf
      leida = leerCartola(await pdf.trozosDelPdf(bytes, clave))
      mostrar()
    } catch (e) {
      if (e instanceof ClavePdf) return pedirClave(e.incorrecta)
      pintar(paso, html`<p class="vacio">${e instanceof ErrorCartola ? e.message : `No se pudo leer: ${e.message}`}</p>`)
    }
  }

  /* El campo NO es type="password": Chrome lo rellenaba solo con una
     contraseña guardada para seiler18.github.io (ignora autocomplete="off" en
     esos campos), y lo que el dueño escribía quedaba pegado a esa clave. Es
     un texto que se ve con puntos (.clave-pdf) y que ningún gestor reconoce. */
  function pedirClave(incorrecta) {
    pintar(paso, html`
      <form id="cartola-clave" class="rejilla-campos" autocomplete="off">
        <label class="campo"><span>${incorrecta ? 'Esa no es la clave. Prueba otra vez' : 'El PDF tiene clave'}</span>
          <input type="text" name="clave-pdf" class="clave-pdf" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-bwignore required></label>
        <div class="acciones"><button class="btn btn-primario">Abrir</button></div>
        <p class="tenue">Suele ser tu RUT: puedes escribirlo con o sin puntos, guion y dígito verificador.</p>
      </form>`)
    const form = $('#cartola-clave', paso)
    const campo = form.elements['clave-pdf']
    campo.value = ''
    campo.focus()
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      // La clave vive solo en esta llamada: no se guarda en ningún lado.
      abrir(campo.value)
    })
  }

  function mostrar() {
    const c = leida
    if (!c.banco) c.banco = 'MACH'
    const movsCartola = clasificar(c, { config: datos.config || {}, reglas: datos.reglas || [] })
    const { movs, soloApp } = cruzar(c, movsCartola, datos.movimientos)
    const grupos = {
      nuevo: movs.filter((m) => m.estado === 'nuevo'),
      anterior: movs.filter((m) => m.estado === 'anterior'),
      registrado: movs.filter((m) => m.estado === 'registrado'),
      informativo: movs.filter((m) => m.estado === 'informativo'),
    }
    const elegibles = [...grupos.nuevo, ...grupos.anterior]
    const fila = (m, i) => html`
      <li><label class="mov mov-${m.tipo} mov-elegir">
        ${i == null ? '' : html`<input type="checkbox" name="elegido" value="${i}" ${m.estado === 'nuevo' ? 'checked' : ''}>`}
        <span class="mov-txt"><b>${m.contraparte || TIPOS[m.tipo]}</b>
          <small>${fecha(m.fecha)} · ${m.categoria} · ${TIPOS[m.tipo]}${Number(m.cuotas) > 1 ? ` · ${m.cuotas} cuotas` : ''}${m.motivo ? ` · ${m.motivo}` : ''}${m.registrado ? ` · ya está: ${m.registrado.contraparte || TIPOS[m.registrado.tipo]} (${fecha(m.registrado.fecha)})` : ''}</small></span>
        <span class="mov-monto"><b class="${SENTIDO[m.tipo] ? 'monto-' + SENTIDO[m.tipo] : ''}">${conSigno(m.monto, SENTIDO[m.tipo])}</b>${m.tipo === 'interna' || m.tipo === 'pago_tarjeta' ? html`<small>no suma</small>` : ''}</span>
      </label></li>`
    const lista = (ms, conCasilla) => html`<ul class="movs">${ms.map((m) => fila(m, conCasilla ? elegibles.indexOf(m) : null))}</ul>`
    const plegable = (titulo, ms, extra = '') => (ms.length ? html`<details class="cartola-grupo"><summary>${titulo} (${ms.length})</summary>${extra}${lista(ms, false)}</details>` : '')

    pintar(paso, html`
      <div class="cartola-resumen">
        <p><b>${c.producto === 'Cuenta' ? 'Cartola' : 'Estado de cuenta'}</b> · <select id="cartola-banco" aria-label="Banco">${[...new Set([c.banco, ...BANCOS])].map((b) => html`<option ${b === c.banco ? 'selected' : ''}>${b}</option>`)}</select> · ${c.producto} · ${fecha(c.periodo.desde)} al ${fecha(c.periodo.hasta)}</p>
        <p class="cartola-cuadre ${c.cuadre.ok ? 'cuadra' : 'no-cuadra'}">${c.cuadre.ok ? '✓ Cuadra al peso con los totales de la cartola.' : '⚠ No cuadra con los totales de la cartola: puede que se haya leído mal. Revisa antes de agregar.'}</p>
        <ul class="lista-simple">${c.cuadre.items.filter((i) => i.cartola != null).map((i) => html`<li><span>${i.que}</span><span>${i.que.startsWith('Filas') ? i.leido : clp(i.leido)}${i.cartola === i.leido ? '' : html` <small>la cartola dice ${i.que.startsWith('Filas') ? i.cartola : clp(i.cartola)}</small>`}</span></li>`)}</ul>
      </div>
      <form id="cartola-form">
        ${elegibles.length ? html`
          ${grupos.nuevo.length ? html`<h3 class="dia cartola-titulo">Faltan en la app (${grupos.nuevo.length})</h3>${lista(grupos.nuevo, true)}` : ''}
          ${grupos.anterior.length ? html`<h3 class="dia cartola-titulo">Compras de antes del periodo (${grupos.anterior.length})</h3><p class="tenue">Una cuota de una compra vieja: la compra ya debería estar, con su monto completo, el día en que se hizo. Márcala solo si falta.</p>${lista(grupos.anterior, true)}` : ''}
          <div class="acciones"><span class="separa"></span><button class="btn btn-primario" id="cartola-agregar">Agregar</button></div>`
        : html`<p class="vacio">Todo lo de esta cartola ya está en la app.</p>`}
        ${plegable('Ya registrados', grupos.registrado)}
        ${plegable('Solo en la app', soloApp.map((m) => ({ ...m, estado: 'soloApp' })), html`<p class="tenue">Están en la app como ${c.banco} en ese periodo, pero la cartola no los trae: puede ser un duplicado o un movimiento anotado en otro banco.</p>`)}
        ${plegable('Informativos', grupos.informativo)}
      </form>`)

    $('#cartola-banco', paso).addEventListener('change', (e) => { leida.banco = e.target.value; mostrar() })
    const form = $('#cartola-form', paso)
    const boton = $('#cartola-agregar', paso)
    const contar = () => {
      if (!boton) return
      const n = $$('input[name="elegido"]:checked', form).length
      boton.textContent = n ? `Agregar ${n} movimiento${n === 1 ? '' : 's'}` : 'Nada marcado'
      boton.disabled = !n
    }
    form.addEventListener('change', contar)
    contar()
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const elegidos = $$('input[name="elegido"]:checked', form).map((x) => elegibles[Number(x.value)])
      if (!elegidos.length) return
      boton.disabled = true
      try {
        const r = await app.llamar('importar_cartola', {
          movs: elegidos.map((m) => ({ clave: m.clave, fecha: m.fecha, banco: m.banco, producto: m.producto, tipo: m.tipo, monto: m.monto, contraparte: m.contraparte, categoria: m.categoria, cuotas: m.cuotas, detalle: m.detalle })),
        })
        aviso(`${r.agregados} movimiento${r.agregados === 1 ? '' : 's'} agregado${r.agregados === 1 ? '' : 's'}${r.repetidos ? ` · ${r.repetidos} ya estaban` : ''}`)
        datos = await app.recargar(false)
        mostrar()
      } catch (err) {
        aviso(err.message, 'error')
        boton.disabled = false
      }
    })
  }

  $('#cartola-archivo', el).addEventListener('change', async (e) => {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    if (archivo.size > 20 * 1024 * 1024) return pintar(paso, html`<p class="vacio">El archivo pesa más de 20 MB: no parece una cartola.</p>`)
    bytes = await archivo.arrayBuffer()
    abrir()
  })
}
