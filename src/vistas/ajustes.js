import { html, pintar, aviso } from '../lib/dom.js'
import { clp } from '../lib/formato.js'

export function ajustes(el, app) {
  const est = app.datos.estado || {}
  const presup = new Map((app.datos.presupuestos || []).map((p) => [p.categoria, Number(p.monto_mensual) || 0]))
  const cats = app.categorias().filter((c) => !['Entre mis cuentas', 'Pago de tarjeta', 'Inversiones', 'Ingresos', 'Sueldo', 'Cashback'].includes(c))

  pintar(el, html`
    <section class="panel">
      <header class="panel-cab"><h2>Correos</h2></header>
      <dl class="datos-estado">
        <dt>Última revisión completa</dt><dd>${est.ultima ? new Date(est.ultima).toLocaleString('es-CL') : 'todavía ninguna'}${est.importando ? ' · importando el historial, sigue en la próxima hora' : ''}</dd>
        <dt>Después de registrar</dt><dd>${est.borrar ? 'el correo va a la papelera (Gmail lo borra a los 30 días)' : 'el correo se deja donde está'}</dd>
        <dt>Titular</dt><dd>${est.titular || '—'} <small class="tenue">(para reconocer transferencias entre tus cuentas)</small></dd>
      </dl>
      <p class="tenue">Estos valores se cambian en la pestaña <b>Config</b> de la planilla.</p>
      <div class="acciones"><button class="btn btn-primario" id="sincronizar">Revisar correos ahora</button></div>
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

  el.querySelector('#sincronizar').addEventListener('click', async (e) => {
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

  el.querySelector('#presupuestos').addEventListener('submit', async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.currentTarget))
    const cambios = Object.entries(d).filter(([c, v]) => (Number(v) || 0) !== (presup.get(c) || 0))
    try {
      for (const [categoria, monto] of cambios) await app.llamar('presupuesto', { categoria, monto: Number(monto) || 0 })
      aviso(cambios.length ? `Presupuestos guardados (${cambios.map(([c, v]) => `${c} ${clp(v)}`).join(', ')})` : 'Sin cambios')
      await app.recargar(false)
    } catch (err) { aviso(err.message, 'error') }
  })

  el.querySelector('#salir').addEventListener('click', () => app.salir())
}
