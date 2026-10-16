import { html, pintar, aviso, $ } from '../lib/dom.js'
import { clp } from '../lib/formato.js'
import { CONFIG_BASE } from '../lib/config-base.js'
import { coberturaAvisos } from '../lib/analisis.js'
import { enLaApp } from '../lib/app-android.js'

// Nombre legible de la app que mandó la notificación (llega el paquete de
// Android). Lo que no calce se muestra tal cual.
const APPS = [[/seiler18\.finanzasmaker/i, 'App FinanzasMaker'], [/tenpo/i, 'Tenpo'], [/mach/i, 'MACH'], [/mercadopago/i, 'Mercado Pago'], [/copec/i, 'Copec Pay'],
  [/bancoestado/i, 'BancoEstado'], [/fintual/i, 'Fintual'], [/binance/i, 'Binance'], [/bci/i, 'BCI'], [/falabella/i, 'Falabella']]
const nombreApp = (p) => APPS.find(([re]) => re.test(p))?.[1] || p

// La app Android (repo FinanzasMaker-android) recibe la clave por este
// enlace: scheme finanzasmaker, host vincular, extra «clave». Si ya tenía una,
// pide confirmación antes de reemplazarla.
const enlaceVincular = (clave) => `intent://vincular#Intent;scheme=finanzasmaker;package=io.github.seiler18.finanzasmaker;S.clave=${clave};end`
// Dentro de la app, la página es lo que se ve: este enlace vuelve a la
// pantalla propia de la app (acceso a notificaciones, cola, bancos elegidos).
const ENLACE_ESTADO_APP = 'intent://estado#Intent;scheme=finanzasmaker;package=io.github.seiler18.finanzasmaker;end'

function hace(iso) {
  if (!iso) return 'nunca'
  const min = Math.round((Date.now() - new Date(iso)) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
}

export function ajustes(el, app) {
  const est = app.datos.estado || {}
  const cfg = app.datos.config || {}
  const presup = new Map((app.datos.presupuestos || []).map((p) => [p.categoria, Number(p.monto_mensual) || 0]))
  const cats = app.categorias().filter((c) => !['Entre mis cuentas', 'Pago de tarjeta', 'Inversiones', 'Ingresos', 'Sueldo', 'Cashback', 'Compra de cripto', 'Venta de cripto'].includes(c))

  pintar(el, html`
    <section class="panel">
      <header class="panel-cab"><h2>Correos</h2></header>
      <dl class="datos-estado">
        <dt>Última revisión completa</dt><dd>${est.ultima ? new Date(est.ultima).toLocaleString('es-CL') : 'todavía ninguna'}${est.importando ? ' · importando el historial, sigue en la próxima revisión' : ''}</dd>
        <dt>Después de registrar</dt><dd>${est.borrar ? 'el correo va a la papelera (Gmail lo borra a los 30 días)' : 'el correo se deja donde está'}</dd>
        <dt>Titular</dt><dd>${est.titular || '—'} <small class="tenue">(para reconocer transferencias entre tus cuentas)</small></dd>
      </dl>
      <div class="acciones"><button class="btn btn-primario" id="sincronizar">Revisar correos ahora</button></div>
    </section>

    <section class="panel">
      <header class="panel-cab"><h2>Celular</h2><p class="tenue">Las notificaciones de tus bancos que manda la app FinanzasMaker (o MacroDroid)</p></header>
      <div id="celular"><p class="tenue">Cargando…</p></div>
      <div id="vincular-paso"></div>
      <div class="acciones">${app.demo ? '' : html`<button class="btn btn-primario" id="vincular">Vincular la app</button>`}<button class="btn btn-borde" id="refrescar-celular">Actualizar</button>${enLaApp() ? html`<a class="btn btn-borde" href="${ENLACE_ESTADO_APP}">Estado de la app</a>` : ''}</div>
    </section>

    <section class="panel">
      <header class="panel-cab"><h2>Configuración</h2><p class="tenue">La usa el trabajador al leer cada correo</p></header>
      <form id="config" class="presupuestos">
        ${CONFIG_BASE.map(([k, , ayuda]) => html`<label class="campo"><span>${k.replace(/_/g, ' ')}</span>
          <input name="${k}" value="${cfg[k] ?? ''}" maxlength="500" autocomplete="off"><small class="tenue">${ayuda}</small></label>`)}
        <div class="acciones"><span class="separa"></span><button class="btn btn-primario">Guardar configuración</button></div>
      </form>
    </section>

    <section class="panel">
      <header class="panel-cab"><h2>Presupuesto mensual</h2><p class="tenue">Deja en 0 las categorías sin presupuesto</p></header>
      <form id="presupuestos" class="presupuestos">
        ${cats.map((c) => html`<label class="campo campo-fila"><span>${c}</span><input type="number" min="0" step="1000" name="${c}" value="${presup.get(c) || 0}" inputmode="numeric"></label>`)}
        <div class="acciones"><span class="separa"></span><button class="btn btn-primario">Guardar presupuestos</button></div>
      </form>
    </section>

    <section class="panel">
      <div class="acciones"><button class="btn btn-borde" id="salir">${app.demo ? 'Salir de la demo' : 'Cerrar sesión'}</button></div>
    </section>`)

  // Qué bancos ya llegan por el celular: con esto se decide cuáles pasar a
  // «bancos por aviso» (su correo deja de crear movimientos, migración 0008).
  const porAviso = new Set(String(cfg.bancos_por_aviso || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
  const tablaCobertura = (c) => {
    const filas = coberturaAvisos(app.datos.movimientos, c.avisados, c.desde)
    if (!filas.length) return ''
    return html`
      <h3 class="subtitulo">Qué llega por el celular <small class="tenue">desde el ${c.desde.split('-').reverse().join('-')}</small></h3>
      <table class="tabla-cobertura">
        <thead><tr><th>Banco</th><th>Por aviso</th><th>Solo por correo</th></tr></thead>
        <tbody>${filas.map((f) => html`<tr>
          <td>${f.banco}${porAviso.has(f.banco.toLowerCase()) ? html` <small class="etiqueta">por aviso</small>` : ''}</td>
          <td>${f.aviso}</td><td class="${f.soloCorreo ? 'falta' : ''}">${f.soloCorreo}</td></tr>`)}</tbody>
      </table>
      <p class="tenue">Cuando un banco pase un tiempo sin nada «solo por correo», agrégalo a <b>bancos por aviso</b> en Configuración: su correo
        dejará de crear movimientos, y lo que llegue sin aviso irá a «Por revisar».</p>`
  }

  // El texto de las notificaciones lo escribe un tercero: va por html``, que escapa.
  const pintarCelular = async () => {
    const caja = $('#celular', el)
    try {
      const c = await app.llamar('celular')
      const disp = c.dispositivos.filter((d) => !d.revocado)
      pintar(caja, html`
        <dl class="datos-estado">
          ${disp.length ? disp.map((d) => html`<dt>${d.nombre}</dt><dd>último aviso: ${hace(d.ultimo_uso)}
            <button type="button" class="btn btn-chico btn-borde" data-revocar="${d.id}" data-nombre="${d.nombre}">Revocar</button></dd>`) : html`<dt>Dispositivos</dt><dd>ninguno dado de alta</dd>`}
          <dt>Recibidas</dt><dd>${c.total} ${c.total === 1 ? 'notificación' : 'notificaciones'}</dd>
        </dl>
        ${c.notificaciones.length ? html`<ul class="movs">${c.notificaciones.map((n) => html`
          <li><div class="mov">
            <span class="mov-txt"><b>${n.titulo || nombreApp(n.paquete)}</b><small>${n.texto}</small></span>
            <span class="mov-monto"><small>${nombreApp(n.paquete)}</small><small>${hace(n.recibida)}</small></span>
          </div></li>`)}</ul>`
          : html`<p class="vacio">Todavía no llega ninguna. Haz una compra o una transferencia chica: el aviso debería aparecer aquí en segundos.</p>`}
        ${tablaCobertura(c)}`)
    } catch (err) {
      pintar(caja, html`<p class="vacio">${err.message}</p>`)
    }
  }
  pintarCelular()
  $('#refrescar-celular', el).addEventListener('click', pintarCelular)

  $('#celular', el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-revocar]')
    if (!b) return
    if (!confirm(`¿Revocar «${b.dataset.nombre}»? Su clave deja de servir en el acto; para volver a usarlo hay que vincularlo de nuevo.`)) return
    b.disabled = true
    try {
      await app.llamar('revocar', { id: b.dataset.revocar })
      aviso('Celular revocado')
      pintarCelular()
    } catch (err) { aviso(err.message, 'error'); b.disabled = false }
  })

  // La clave se muestra UNA vez, aquí; la página no la guarda. Quien la tiene
  // solo puede mandar avisos a esta cuenta, y se revoca con un clic.
  $('#vincular', el)?.addEventListener('click', async (e) => {
    const b = e.currentTarget
    b.disabled = true
    try {
      const { clave, nombre } = await app.llamar('vincular', { nombre: 'App Android' })
      pintar($('#vincular-paso', el), html`
        <div class="vincular">
          <p>Lista la clave de «${nombre}». <b>Se muestra solo esta vez.</b></p>
          <p class="tenue">Desde el celular donde instalaste la app, toca «Abrir la app y vincular». Si lo ves en el computador o no abre, copia la clave y pégala en la app con «Pegar clave».</p>
          <div class="acciones"><a class="btn btn-primario" href="${enlaceVincular(clave)}">Abrir la app y vincular</a><button type="button" class="btn btn-borde" id="copiar-clave">Copiar clave</button></div>
        </div>`)
      $('#copiar-clave', el).addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(clave); aviso('Clave copiada') } catch { aviso('No se pudo copiar', 'error') }
      })
      pintarCelular()
    } catch (err) { aviso(err.message, 'error') }
    b.disabled = false
  })

  $('#sincronizar', el).addEventListener('click', async (e) => {
    const b = e.currentTarget
    b.disabled = true
    b.textContent = 'Revisando…'
    try {
      const { resumen: r } = await app.llamar('sincronizar')
      if (r.ocupado) aviso('Ya se están revisando los correos, prueba en un minuto')
      else aviso(`${r.registrados || 0} nuevo${r.registrados === 1 ? '' : 's'}, ${r.revisar || 0} por revisar${r.completa ? '' : ' · queda más, sigue solo'}`)
      await app.recargar(false)
    } catch (err) { aviso(err.message, 'error') }
    b.disabled = false
    b.textContent = 'Revisar correos ahora'
  })

  $('#config', el).addEventListener('submit', async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget))
    const cambios = Object.fromEntries(Object.entries(d).filter(([k, v]) => String(v).trim() !== String(cfg[k] ?? '')))
    if (!Object.keys(cambios).length) return aviso('Sin cambios')
    try {
      await app.llamar('config', { valores: cambios })
      aviso(`Guardado: ${Object.keys(cambios).join(', ').replace(/_/g, ' ')}`)
      await app.recargar()
    } catch (err) { aviso(err.message, 'error') }
  })

  $('#presupuestos', el).addEventListener('submit', async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget))
    const cambios = Object.entries(d).filter(([c, v]) => (Number(v) || 0) !== (presup.get(c) || 0))
    try {
      for (const [categoria, monto] of cambios) await app.llamar('presupuesto', { categoria, monto: Number(monto) || 0 })
      aviso(cambios.length ? `Presupuestos guardados (${cambios.map(([c, v]) => `${c} ${clp(v)}`).join(', ')})` : 'Sin cambios')
      await app.recargar(false)
    } catch (err) { aviso(err.message, 'error') }
  })

  $('#salir', el).addEventListener('click', () => app.salir())
}
