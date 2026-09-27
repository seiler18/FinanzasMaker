import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/ingreso.css'
import './styles/pie.css'
import './styles/movimiento.css'
import './styles/movil.css'
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
import { pie } from './lib/pie.js'
import { iniciarTema, alternarTema, temaActual } from './lib/tema.js'

const REPO = 'https://github.com/seiler18/FinanzasMaker'

protegerMarco()
iniciarTema()

/* Router mínimo. Cada vista recibe un contenedor NUEVO en cada render: así
   los listeners que cuelga una vista mueren con ella (en VentasMaker,
   reutilizar el contenedor hizo que una vista reaccionara a clics de otra). */
// `corto` es la etiqueta de la barra inferior del celular: seis pestañas en
// 360 px dejan ~60 px a cada una, y «Movimientos» no cabe.
const VISTAS = {
  resumen: { titulo: 'Resumen', corto: 'Resumen', icono: 'inicio', fn: resumen, periodo: true },
  movimientos: { titulo: 'Movimientos', corto: 'Movs.', icono: 'lista', fn: movimientos, periodo: true },
  revisar: { titulo: 'Por revisar', corto: 'Revisar', icono: 'bandeja', fn: revisar },
  agregar: { titulo: 'Agregar', corto: 'Agregar', icono: 'mas', fn: agregar },
  consejos: { titulo: 'Consejos', corto: 'Consejos', icono: 'foco', fn: consejos, periodo: true, soloMes: true },
  ajustes: { titulo: 'Ajustes', corto: 'Ajustes', icono: 'ajustes', fn: ajustes },
}
const ORDEN = Object.keys(VISTAS)

// Íconos de las pestañas y del tema (trazo, estilo Lucide), escritos aquí.
const ICONO_NAV = {
  inicio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>',
  lista: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  bandeja: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z"/></svg>',
  mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  foco: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  sol: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  luna: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>',
}

/* Cambio de vista animado. Con View Transitions (Chrome, Edge, Safari 18,
   Firefox 144) la vista vieja sale y la nueva entra deslizándose hacia el
   lado que corresponde; sin ellas, la nueva solo entra (data-entra en
   movimiento.css). `dir`: 'adelante' | 'atras' | 'adentro' (zoom a un día o
   mes desde el gráfico) | 'suave' (cambio de escala) | null = sin animación,
   que es lo que toca al recargar datos tras editar: la vista no «cambió». */
const menosMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches
function conTransicion(dir, cambiar) {
  if (!dir || menosMovimiento()) return cambiar()
  if (!document.startViewTransition) {
    cambiar()
    $('#vista .vista')?.setAttribute('data-entra', dir)
    return
  }
  const raizDoc = document.documentElement
  raizDoc.dataset.dir = dir
  const vt = document.startViewTransition(() => {
    cambiar()
    // 'vt': la vista ya se desliza entera; data-entra solo escalona su contenido.
    $('#vista .vista')?.setAttribute('data-entra', 'vt')
  })
  vt.finished.finally(() => { if (raizDoc.dataset.dir === dir) delete raizDoc.dataset.dir })
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
    const dir = ORDEN.indexOf(vista) >= ORDEN.indexOf(app.vista) ? 'adelante' : 'atras'
    app.vista = vista
    app.filtros = filtros
    history.replaceState(null, '', '#' + vista)
    conTransicion(dir, () => { render(); scrollTo({ top: 0 }) })
  },
  cambiarPeriodo(escala, ref, dir = 'suave') {
    app.periodo = { escala, ref }
    guardarPref(app.periodo)
    conTransicion(dir, render)
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
        <a class="marca" href="#resumen"><span class="marca-logo" aria-hidden="true">$</span><span class="marca-nombre">FinanzasMaker</span></a>
        ${app.demo ? html`<span class="etiqueta-demo">Demo<span class="solo-ancho"> · datos inventados</span></span>` : ''}
        <span class="separa"></span>
        <button type="button" class="btn btn-icono btn-borde boton-tema" id="tema"></button>
      </div>
      <nav class="pestanas" aria-label="Secciones">
        ${Object.entries(VISTAS).map(([k, v]) => html`<button class="pestana" data-vista="${k}">
          <span class="pestana-icono">${crudo(ICONO_NAV[v.icono])}${k === 'revisar' ? html`<span class="contador"></span>` : ''}</span>
          <span class="pestana-largo">${v.titulo}</span><span class="pestana-corto" aria-hidden="true">${v.corto}</span>
          <span class="pestana-linea" aria-hidden="true"></span>
        </button>`)}
      </nav>
    </header>
    <main class="contenedor">
      <div id="periodo" class="periodo"></div>
      <div id="vista"></div>
    </main>
    ${crudo(pie({ repo: REPO, nota: 'FinanzasMaker es un registro personal, no asesoría financiera.' }))}`)

  document.body.classList.add('con-nav')
  pintarBotonTema()
  $('#tema').addEventListener('click', () => pintarBotonTema(alternarTema()))

  $('.pestanas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vista]')
    if (b && b.dataset.vista !== app.vista) app.ir(b.dataset.vista)
  })
  $('#periodo').addEventListener('click', (e) => {
    const esc = e.target.closest('[data-escala]')
    if (esc) return app.cambiarPeriodo(esc.dataset.escala, app.periodo.ref)
    const paso = e.target.closest('[data-paso]')
    const escala = VISTAS[app.vista].soloMes ? 'mes' : app.periodo.escala
    if (paso) return app.cambiarPeriodo(app.periodo.escala, mover(escala, app.periodo.ref, Number(paso.dataset.paso)), Number(paso.dataset.paso) > 0 ? 'adelante' : 'atras')
    if (e.target.closest('[data-hoy]')) app.cambiarPeriodo(app.periodo.escala, hoyISO())
  })
}

// El botón muestra el tema al que se pasa, no el actual: es lo que hace el clic.
// Los íconos son constantes del código, por eso innerHTML.
function pintarBotonTema(tema = temaActual()) {
  const b = $('#tema')
  if (!b) return
  const oscuro = tema === 'dark'
  b.innerHTML = oscuro ? ICONO_NAV.sol : ICONO_NAV.luna
  b.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro')
  b.title = b.getAttribute('aria-label')
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
  if (!menosMovimiento()) $('#vista .vista')?.setAttribute('data-entra', 'suave')
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
  document.body.classList.remove('con-nav')
  pintar(raiz, html`
    <div class="ingreso">
      <div class="ingreso-fondo" aria-hidden="true">
        <span class="aurora aurora-1"></span><span class="aurora aurora-2"></span><span class="aurora aurora-3"></span>
        <span class="rejilla-fondo"></span>
      </div>

      <main class="ingreso-cuerpo">
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
          <div class="vista-cab"><b>Ingresos y gastos</b><span>Ejemplo · 6 meses</span></div>
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
      </main>
      ${crudo(pie({ repo: REPO, oscuro: true }))}
    </div>`)
  botonIngreso($('#boton-google'), entrar).catch((err) => aviso(err.message, 'error'))
}

onSesionCaducada(() => {
  aviso('Tu sesión venció, entra de nuevo')
  pantallaIngreso()
})

if (app.demo || vigente()) entrar()
else pantallaIngreso()
