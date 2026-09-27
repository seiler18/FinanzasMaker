import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/ingreso.css'
import { protegerMarco } from './lib/marco.js'
import { html, crudo, pintar, $, $$, aviso } from './lib/dom.js'
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

// Íconos de trazo (Lucide), escritos aquí: sin librería ni peticiones extra.
const ICONO = {
  candado: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  nube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 19a4.5 4.5 0 0 0 0-9h-1.3A7 7 0 1 0 5 16.2"/><path d="M8 19h9.5"/></svg>',
  chispa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>',
  ojo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  escudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
}

// Pares ingreso/gasto de la vista previa: alturas en décimos (clases .vNN).
const VISTA = [[60, 40], [70, 50], [60, 80], [90, 50], [70, 60], [100, 70]]

function pantallaIngreso() {
  pintar(raiz, html`
    <main class="ingreso">
      <div class="ingreso-fondo" aria-hidden="true">
        <span class="aurora aurora-1"></span><span class="aurora aurora-2"></span><span class="aurora aurora-3"></span>
        <span class="rejilla-fondo"></span>
      </div>

      <section class="ingreso-hero">
        <p class="ingreso-eyebrow"><span class="punto-vivo" aria-hidden="true"></span>Se actualiza sola cada hora</p>
        <h1>Tus finanzas,<br><span class="degradado-texto">leídas solas.</span></h1>
        <p class="ingreso-lead">Lee los avisos que te mandan tus bancos, registra cada gasto, ingreso e inversión y te dice dónde se va la plata. Sin darle tus claves a nadie.</p>
        <ul class="ingreso-rasgos">
          <li>${crudo(ICONO.candado)}Sin claves bancarias</li>
          <li>${crudo(ICONO.reloj)}Día, mes y año</li>
          <li>${crudo(ICONO.nube)}Tus datos en tu Drive</li>
          <li>${crudo(ICONO.chispa)}Consejos de ahorro</li>
        </ul>
        <div class="ingreso-vista" aria-hidden="true">
          <div class="vista-cab"><span>Ejemplo · últimos 6 meses</span><b>Ingresos y gastos</b></div>
          <div class="vista-barras">${VISTA.map(([a, b]) => crudo(`<span class="vista-par"><i class="v${a}"></i><i class="v${b}"></i></span>`))}</div>
          <div class="vista-leyenda"><span><i class="l1"></i>Ingresos</span><span><i class="l2"></i>Gastos</span></div>
          <div class="vista-chip chip-ahorro">Ahorro del mes<b>+34 %</b></div>
          <div class="vista-chip chip-consejo">Consejo<b>3 cobros se repiten</b></div>
        </div>
      </section>

      <section class="ingreso-caja" aria-labelledby="titulo-ingreso">
        <span class="ingreso-logo" aria-hidden="true">$</span>
        <div>
          <h2 id="titulo-ingreso">FinanzasMaker</h2>
          <p>Entra con la cuenta de Google dueña de la planilla.</p>
        </div>
        <div id="boton-google" class="boton-google"></div>
        <div class="separador">o</div>
        <a class="btn-demo" href="?demo">${crudo(ICONO.ojo)}Ver la demo con datos inventados</a>
        <p class="ingreso-pie">${crudo(ICONO.escudo)}Tu Gmail no pasa por ningún servidor ajeno</p>
      </section>
    </main>`)
  botonIngreso($('#boton-google'), entrar).catch((err) => aviso(err.message, 'error'))
}

onSesionCaducada(() => {
  aviso('Tu sesión venció, entra de nuevo')
  pantallaIngreso()
})

if (app.demo || vigente()) entrar()
else pantallaIngreso()
