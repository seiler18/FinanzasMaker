import { html, pintar, aviso } from '../lib/dom.js'
import { TIPOS, hoyISO } from '../lib/analisis.js'

/* Registro a mano: lo que no llega por correo (efectivo, CencoPay, compras
   con Mercado Pago, un banco que no avisa). */

export function agregar(el, app) {
  const categorias = app.categorias()
  const bancos = [...new Set(['Efectivo', ...app.datos.movimientos.map((m) => m.banco).filter(Boolean), 'CencoPay'])]
  pintar(el, html`
    <form class="panel form-agregar">
      <h2>Agregar un movimiento</h2>
      <div class="tipo-rapido" role="radiogroup" aria-label="Tipo">
        ${['gasto', 'ingreso', 'inversion', 'interna'].map((k, i) => html`<label><input type="radio" name="tipo" value="${k}" ${i === 0 ? 'checked' : ''}><span>${TIPOS[k]}</span></label>`)}
      </div>
      <div class="rejilla-campos">
        <label class="campo"><span>Monto</span><input name="monto" type="number" inputmode="numeric" min="1" step="1" required placeholder="15000"></label>
        <label class="campo"><span>Fecha</span><input name="fecha" type="date" value="${hoyISO()}" required></label>
        <label class="campo"><span>¿Dónde o a quién?</span><input name="contraparte" maxlength="80" placeholder="Feria, almuerzo, Pedro…"></label>
        <label class="campo"><span>Categoría</span><input name="categoria" list="cats-agregar" maxlength="40" placeholder="Se deduce si la dejas vacía"></label>
        <label class="campo"><span>Medio</span><input name="banco" list="bancos-agregar" value="Efectivo" maxlength="40"></label>
        <label class="campo"><span>Nota</span><input name="nota" maxlength="200"></label>
      </div>
      <datalist id="cats-agregar">${categorias.map((c) => html`<option value="${c}">`)}</datalist>
      <datalist id="bancos-agregar">${bancos.map((b) => html`<option value="${b}">`)}</datalist>
      <div class="acciones"><span class="separa"></span><button class="btn btn-primario">Guardar</button></div>
    </form>`)

  const form = el.querySelector('form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(form))
    const boton = form.querySelector('button')
    boton.disabled = true
    try {
      await app.llamar('agregar', { mov: { ...d, monto: Number(d.monto) } })
      aviso('Guardado')
      form.reset()
      form.fecha.value = hoyISO()
      await app.recargar(false)
    } catch (err) { aviso(err.message, 'error') }
    boton.disabled = false
  })
}
