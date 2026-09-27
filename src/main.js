import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import { protegerMarco } from './lib/marco.js'
import { html, pintar, $, $$, aviso } from './lib/dom.js'
import { llamar, modoDemo, onSesionCaducada } from './lib/api.js'
import { botonIngreso, vigente, salir } from './lib/sesion.js'
import { rango, mover, hoyISO } from './lib/analisis.js'
import { resumen } from './vistas/resumen.js'
import { movimientos } from './vistas/movimientos.js'
import { revisar } from './vistas/revisar.js'
import { agregar } from './vistas/agregar.js'
import { consejos } from './vistas/consejos.js'
import { ajustes } from './vistas/ajustes.js'

protegerMarco()

/* Router mínimo. Cada vista recibe un contenedor NUEVO en cada render: así
   los listeners que cuelga una vista mueren con ella (en VentasMaker,
   reutilizar el contenedor hizo que una vista reaccionara a clics de otra). */
const VISTAS = {
  resumen: { titulo: 'Resumen', fn: resumen, periodo: true },
  movimientos: { titulo: 'Movimientos', fn: movimientos, periodo: true },
  revisar: { titulo: 'Por revisar', fn: revisar },
  agregar: { titulo: 'Agregar', fn: agregar },
  consejos: { titulo: 'Consejos', fn: consejos, periodo: true, soloMes: true },
  ajustes: { titulo: 'Ajustes', fn: ajustes },
}

const PREF = 'fm_periodo'
const leerPref = () => { try { return JSON.parse(localStorage.getItem(PREF)) } catch { return null } }
const guardarPref = (p) => { try { localStorage.setItem(PREF, JSON.stringify({ escala: p.escala })) } catch { /* sin almacenamiento */ } }

const app = {
  demo: modoDemo(),
  datos: null,
  vista: 'resumen',
  filtros: {},
  periodo: { escala: leerPref()?.escala || 'mes', ref: hoyISO() },
  llamar,
  ir(vista, filtros = {}) {
    app.vista = vista
    app.filtros = filtros
    history.replaceState(null, '', '#' + vista)
    render()
  },
  cambiarPeriodo(escala, ref) {
    app.periodo = { escala, ref }
    guardarPref(app.periodo)
    render()
  },
  async recargar(pintarDespues = true) {
    app.datos = await llamar('datos')
    if (pintarDespues) render()
    else pintarPestanas()
  },
  categorias() {
    const s = new Set(app.datos.movimientos.map((m) => m.categoria).filter(Boolean))
    for (const r of app.datos.reglas || []) if (r.categoria) s.add(r.categoria)
    for (const p of app.datos.presupuestos || []) s.add(p.categoria)
    return [...s].sort((a, b) => a.localeCompare(b, 'es'))
  },
  salir() {
    salir()
    if (app.demo) location.href = location.pathname
    else pantallaIngreso()
  },
}

const raiz = document.getElementById('app')

function pintarPestanas() {
  const n = app.datos?.revisar?.length || 0
  $$('.pestana').forEach((b) => {
    b.setAttribute('aria-current', b.dataset.vista === app.vista ? 'page' : 'false')
    if (b.dataset.vista === 'revisar') $('.contador', b).textContent = n ? String(n) : ''
  })
}

function render() {
  const v = VISTAS[app.vista] || VISTAS.resumen
  const barra = $('#periodo')
  barra.hidden = !v.periodo
  if (v.periodo) {
    const escala = v.soloMes ? 'mes' : app.periodo.escala
    const r = rango(escala, app.periodo.ref)
    pintar(barra, html`
      ${v.soloMes ? '' : html`<div class="escalas" role="group" aria-label="Ver por">
        ${[['dia', 'Día'], ['mes', 'Mes'], ['año', 'Año']].map(([k, t]) => html`<button class="escala" data-escala="${k}" aria-pressed="${escala === k}">${t}</button>`)}
      </div>`}
      <div class="navegar">
        <button class="btn btn-icono btn-borde" data-paso="-1" aria-label="Anterior">‹</button>
        <h2 class="periodo-etiqueta">${r.etiqueta}</h2>
        <button class="btn btn-icono btn-borde" data-paso="1" aria-label="Siguiente">›</button>
        ${app.periodo.ref.slice(0, 7) !== hoyISO().slice(0, 7) ? html`<button class="btn btn-chico btn-borde" data-hoy>Hoy</button>` : ''}
      </div>`)
  }
  pintarPestanas()
  const cont = document.createElement('div')
  cont.className = 'vista'
  $('#vista').replaceChildren(cont)
  const periodoVista = v.soloMes ? { ...app.periodo, escala: 'mes' } : app.periodo
  v.fn(cont, { ...app, periodo: periodoVista }, app.filtros)
  document.title = `${v.titulo} · FinanzasMaker`
}

function shell() {
  pintar(raiz, html`
    <header class="barra">
      <div class="barra-in">
        <a class="marca" href="#resumen"><span class="marca-logo" aria-hidden="true">$</span>FinanzasMaker</a>
        ${app.demo ? html`<span class="etiqueta-demo">Demo · datos inventados</span>` : ''}
      </div>
      <nav class="pestanas" aria-label="Secciones">
        ${Object.entries(VISTAS).map(([k, v]) => html`<button class="pestana" data-vista="${k}">${v.titulo}${k === 'revisar' ? html`<span class="contador"></span>` : ''}</button>`)}
      </nav>
    </header>
    <main class="contenedor">
      <div id="periodo" class="periodo"></div>
      <div id="vista"></div>
    </main>`)

  $('.pestanas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vista]')
    if (b) app.ir(b.dataset.vista)
  })
  $('#periodo').addEventListener('click', (e) => {
    const esc = e.target.closest('[data-escala]')
    if (esc) return app.cambiarPeriodo(esc.dataset.escala, app.periodo.ref)
    const paso = e.target.closest('[data-paso]')
    const escala = VISTAS[app.vista].soloMes ? 'mes' : app.periodo.escala
    if (paso) return app.cambiarPeriodo(app.periodo.escala, mover(escala, app.periodo.ref, Number(paso.dataset.paso)))
    if (e.target.closest('[data-hoy]')) app.cambiarPeriodo(app.periodo.escala, hoyISO())
  })
}

async function entrar() {
  pintar(raiz, html`<div class="cargando" role="status">Cargando tus movimientos…</div>`)
  try {
    app.datos = await llamar('datos')
  } catch (err) {
    if (!app.demo && !vigente()) return pantallaIngreso()
    pintar(raiz, html`<div class="cargando error" role="alert">${err.message}</div>`)
    return
  }
  shell()
  const hash = location.hash.slice(1)
  app.vista = VISTAS[hash] ? hash : 'resumen'
  render()
}

function pantallaIngreso() {
  pintar(raiz, html`
    <main class="ingreso">
      <div class="ingreso-caja">
        <span class="marca-logo grande" aria-hidden="true">$</span>
        <h1>FinanzasMaker</h1>
        <p>Tus gastos, ingresos e inversiones, leídos de los correos de tus bancos. Sin darle tus claves a nadie.</p>
        <div id="boton-google" class="boton-google"></div>
        <p class="tenue">Solo entra la cuenta dueña de la planilla.</p>
        <a class="btn btn-borde" href="?demo">Ver la demo con datos inventados</a>
      </div>
    </main>`)
  botonIngreso($('#boton-google'), entrar).catch((err) => aviso(err.message, 'error'))
}

onSesionCaducada(() => {
  aviso('Tu sesión venció, entra de nuevo')
  pantallaIngreso()
})

if (app.demo || vigente()) entrar()
else pantallaIngreso()
