import { html, pintar, aviso, $ } from '../lib/dom.js'
import { clp } from '../lib/formato.js'
import { CONFIG_BASE } from '../lib/config-base.js'

// Nombre legible de la app que mandó la notificación (MacroDroid manda el
// paquete de Android). Lo que no calce se muestra tal cual.
const APPS = [[/tenpo/i, 'Tenpo'], [/mach/i, 'MACH'], [/mercadopago/i, 'Mercado Pago'], [/copec/i, 'Copec Pay'],
  [/bancoestado/i, 'BancoEstado'], [/fintual/i, 'Fintual'], [/binance/i, 'Binance'], [/bci/i, 'BCI'], [/falabella/i, 'Falabella']]
const nombreApp = (p) => APPS.find(([re]) => re.test(p))?.[1] || p

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
      <header class="panel-cab"><h2>Celular</h2><p class="tenue">Las notificaciones de tus bancos que manda MacroDroid</p></header>
      <div id="celular"><p class="tenue">Cargando…</p></div>
      <div class="acciones"><button class="btn btn-borde" id="refrescar-celular">Actualizar</button></div>
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

  // El texto de las notificaciones lo escribe un tercero: va por html``, que escapa.
  const pintarCelular = async () => {
    const caja = $('#celular', el)
    try {
      const c = await app.llamar('celular')
      const disp = c.dispositivos.filter((d) => !d.revocado)
      pintar(caja, html`
        <dl class="datos-estado">
          ${disp.length ? disp.map((d) => html`<dt>${d.nombre}</dt><dd>último aviso: ${hace(d.ultimo_uso)}</dd>`) : html`<dt>Dispositivos</dt><dd>ninguno dado de alta</dd>`}
          <dt>Recibidas</dt><dd>${c.total} notificación${c.total === 1 ? '' : 'es'}</dd>
        </dl>
        ${c.notificaciones.length ? html`<ul class="movs">${c.notificaciones.map((n) => html`
          <li><div class="mov">
            <span class="mov-txt"><b>${n.titulo || nombreApp(n.paquete)}</b><small>${n.texto}</small></span>
            <span class="mov-monto"><small>${nombreApp(n.paquete)}</small><small>${hace(n.recibida)}</small></span>
          </div></li>`)}</ul>`
          : html`<p class="vacio">Todavía no llega ninguna. Haz una compra o una transferencia chica: el aviso debería aparecer aquí en segundos.</p>`}`)
    } catch (err) {
      pintar(caja, html`<p class="vacio">${err.message}</p>`)
    }
  }
  pintarCelular()
  $('#refrescar-celular', el).addEventListener('click', pintarCelular)

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
