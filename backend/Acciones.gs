/* ============================================================
   Inversiones — lo que hacía la hoja de gestor-acciones, en el trabajador.

   Tres tareas, cada una con su disparador (programarDisparador en Code.gs):
   · actualizarAcciones, cada 1 h: lee los correos de operaciones de Fintual
     (compras, ventas, dividendos, dólares) y actualiza los precios de Yahoo.
   · alertasAcciones, cada 4 h: avisa por correo si una posición superó el
     umbral de ganancia o si un activo cae fuerte en el día.
   La base guarda HECHOS (operaciones, precios, alertas); las posiciones y los
   resultados los calcula la página (src/inversiones/lib/cartera.js).

   Viene de gestor-acciones/backend/Code.gs (v4.2). Lo que cambió al mudarse:
   · escribe en Supabase y no en hojas; sin hojas derivadas;
   · los tipos ya son los del contrato (compra, venta, dividendo, compraUsd,
     ventaUsd), no los de la hoja («Compra acción»…);
   · un correo que no se entiende se avisa UNA vez (la hoja avisaba en cada
     corrida, porque no lo marcaba como visto);
   · sin respaldo de GOOGLEFINANCE: fuera de una hoja no existe. Si Yahoo no
     responde, queda el último precio con su hora.
   ============================================================ */

const FINTUAL = 'hola@fintual.com';
const ACCIONES_DESDE_BASE = '2026/06/04';   // la primera operación de la cartera
const RESIDUO_ACC = 0.001;

/* ---------- tareas programadas ---------- */

function actualizarAcciones() {
  if (!migradoAcciones_()) { console.log('Falta correr migrarAccionesASupabase() (o empezarAccionesDeCero())'); return; }
  const nuevas = leerCorreosAcciones_();
  const precios = actualizarPreciosAcciones_();
  guardarEstado_({ ultima_acciones: new Date().toISOString() });
  console.log('Acciones: ' + nuevas + ' operación(es) nueva(s), ' + precios + ' precio(s) al día');
}

function alertasAcciones() {
  if (!migradoAcciones_()) return;
  revisarAlertasAcciones_();
}

// Mismo motivo que migrado_() en Code.gs: sin lo de la hoja en la base, la
// primera corrida importaría otra vez cada operación desde junio.
function migradoAcciones_() {
  return PropertiesService.getScriptProperties().getProperty('MIGRADO_ACCIONES') === 'si';
}

/* Para una cartera nueva, sin nada que traer de una hoja. */
function empezarAccionesDeCero() {
  PropertiesService.getScriptProperties().setProperty('MIGRADO_ACCIONES', 'si');
  console.log('Listo: actualizarAcciones() leerá los correos de Fintual desde ' + (leerConfig_().acciones_desde || ACCIONES_DESDE_BASE));
}

/* ---------- correos de Fintual ---------- */

function leerCorreosAcciones_() {
  const cfg = leerConfig_();
  const desde = String(cfg.acciones_desde || ACCIONES_DESDE_BASE);
  // in:anywhere: procesarCorreos manda estos mismos correos a la papelera
  // tras anotar lo suyo; la papelera se vacía a los 30 días y esto corre cada
  // hora, así que no se pierde ninguno.
  const hilos = GmailApp.search('in:anywhere from:' + FINTUAL + ' after:' + desde, 0, 100);
  const msgs = [];
  hilos.forEach((h) => h.getMessages().forEach((m) => { if (correoDe_(m.getFrom()) === FINTUAL) msgs.push(m); }));
  if (!msgs.length) return 0;

  const props = PropertiesService.getScriptProperties();
  const avisados = JSON.parse(props.getProperty('ACCIONES_AVISADOS') || '[]');
  const ya = new Set(avisados);
  for (let i = 0; i < msgs.length; i += 100) {
    const ids = msgs.slice(i, i + 100).map((m) => m.getId());
    leerPagina_('acciones_operaciones', 'select=gmail_id&' + sbIn_('gmail_id', ids)).forEach((f) => ya.add(String(f.gmail_id)));
  }

  const mapa = mapaAcciones_();
  const ops = [];
  const avisos = [];
  msgs.forEach((m) => {
    const id = m.getId();
    if (ya.has(id)) return;
    let r;
    try { r = parsearAcciones_(m, mapa); } catch (e) { r = { error: 'Error al leer «' + m.getSubject() + '»: ' + e }; }
    if (r === null) return; // newsletter u otro: no es una operación
    if (r.error) { avisos.push(r.error); avisados.push(id); return; }
    r.op.gmail_id = id;
    ops.push(r.op);
  });

  agregarFilas_('acciones_operaciones', ops, { conflicto: 'usuario,gmail_id', ignorar: true });
  if (ops.length) agregarFilas_('acciones_alertas', [{ fecha: new Date().toISOString(), tipo: 'IMPORTACIÓN', detalle: ops.length + ' movimiento(s) nuevo(s) leído(s) de Gmail.' }]);
  if (avisos.length) {
    agregarFilas_('acciones_alertas', [{ fecha: new Date().toISOString(), tipo: 'REVISAR', detalle: avisos.join(' | ') }]);
    avisarDueno_('Fintual: revisar correos no clasificados', avisos.join('\n'));
    props.setProperty('ACCIONES_AVISADOS', JSON.stringify(avisados.slice(-300)));
  }
  return ops.length;
}

/* Un correo de Fintual → una operación del contrato, null si no es una
   operación, o { error } si lo es pero falta un dato. Las expresiones son las
   de gestor-acciones, probadas contra los correos reales. */
function parsearAcciones_(m, mapa) {
  const subj = (m.getSubject() || '').replace(/&amp;/g, '&');
  const body = (m.getPlainBody() || '').replace(/ /g, ' ').replace(/ /g, ' ');
  const fecha = Utilities.formatDate(m.getDate(), 'America/Santiago', 'yyyy-MM-dd');
  const op = (tipo, campos) => ({ op: Object.assign({ fecha, tipo, activo: '', ticker: '', cantidad: null, usd: null, clp: null,
    tipo_cambio: null, comision_clp: null, fuente: 'Correo Gmail' }, campos) });

  // COMPRA USD
  if (/Compraste/i.test(subj) && /d[oó]lares/i.test(subj)) {
    const usd = grabAcc_(body, /compraste US\s*\$?\s*([\d.,]+)/i) || grabAcc_(subj, /US\s*\$?\s*([\d.,]+)/i);
    if (usd == null) return { error: 'Compra USD sin monto: ' + subj };
    return op('compraUsd', { activo: 'Dólares (USD)', ticker: 'USD', cantidad: usd, usd,
      clp: grabAcc_(body, /tus\s*\$\s*([\d.,]+)\s*pesos/i), tipo_cambio: grabAcc_(body, /tipo de cambio de\s*\$\s*([\d.,]+)/i),
      comision_clp: Math.round(usd * 4 * 100) / 100 });
  }
  // VENTA USD
  if (/venta de tus.*d[oó]lares/i.test(subj) || /Convertimos los US/i.test(body)) {
    const usd = grabAcc_(body, /Convertimos los US\s*\$?\s*([\d.,]+)/i) || grabAcc_(subj, /venta de tus\s*([\d.,]+)\s*d[oó]lares/i);
    if (usd == null) return { error: 'Venta USD sin monto: ' + subj };
    return op('ventaUsd', { activo: 'Dólares (USD)', ticker: 'USD', cantidad: usd, usd,
      clp: grabAcc_(body, /vender a\s*\$\s*([\d.,]+)/i) || grabAcc_(subj, /Recibir[aá]s\s*([\d.,]+)\s*pesos/i),
      tipo_cambio: grabAcc_(body, /tasa de\s*\$\s*([\d.,]+)/i), comision_clp: Math.round(usd * 4 * 100) / 100 });
  }
  // DIVIDENDO
  if (/Recibiste un dividendo/i.test(subj)) {
    const monto = grabAcc_(body, /por US\s*\$?\s*([\d.,]+)/i) || grabAcc_(subj, /por\s*([\d.,]+)\s*d[oó]lares/i);
    if (monto == null) return { error: 'Dividendo sin monto: ' + subj };
    const nombre = txtAcc_(body, /dividendo de\s+(.+?)\s+por US/i);
    const tkAsunto = (subj.match(/dividendo de\s+([A-Z0-9.]{1,6})\s+por/) || [])[1] || '';
    const ticker = tickerDe_(nombre, mapa) || tkAsunto || (nombre ? autoMapa_(nombre, mapa) : '');
    return op('dividendo', { activo: nombre || ticker, ticker, usd: monto });
  }
  // COMPRA ACCIÓN
  if (/Invertiste/i.test(subj)) {
    const usd = grabAcc_(body, /Monto invertido US\s*\$?\s*([\d.,]+)/i) || grabAcc_(subj, /US\s*\$?\s*([\d.,]+)\s*d[oó]lares/i);
    const cantidad = grabAcc_(body, /Acciones compradas\s*([\d.,]+)/i) || grabAcc_(subj, /en\s*([\d.,]+)\s*acciones/i);
    const nombre = txtAcc_(subj, /acciones de\s+(.+)$/i) || txtAcc_(body, /d[oó]lares en\s+(.+?)\s*\n/i);
    if (usd == null || cantidad == null) return { error: 'Compra acción incompleta: ' + subj };
    return op('compra', { activo: nombre, ticker: tickerDe_(nombre, mapa) || autoMapa_(nombre, mapa), cantidad, usd });
  }
  // VENTA ACCIÓN (total o parcial)
  if (/Vendiste/i.test(subj)) {
    const cantidad = grabAcc_(body, /Cantidad de acciones\s*([\d.,]+)/i) || grabAcc_(body, /Vendiste\s*([\d.,]+)\s*acciones/i)
      || grabAcc_(subj, /Vendiste\s*([\d.,]+)\s*acciones/i);
    const usd = grabAcc_(body, /Recibiste US\s*\$?\s*([\d.,]+)/i) || grabAcc_(body, /total de US\s*\$?\s*([\d.,]+)/i);
    const nombre = txtAcc_(body, /acciones de\s+(.+?)(?:\s+por un total|\n)/i) || txtAcc_(subj, /acciones de\s+(.+)$/i);
    if (cantidad == null || usd == null) return { error: 'Venta acción incompleta: ' + subj };
    return op('venta', { activo: nombre, ticker: tickerDe_(nombre, mapa) || autoMapa_(nombre, mapa), cantidad, usd });
  }
  return null;
}

/* «1.234,56» → 1234.56 (los correos de Fintual escriben con coma decimal). */
function numAcc_(s) {
  if (s == null) return null;
  const t = String(s).replace(/ /g, ' ').replace(/ /g, ' ').trim()
    .replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const v = parseFloat(t);
  return isNaN(v) ? null : v;
}
function grabAcc_(texto, re) { const m = texto.match(re); return m ? numAcc_(m[1]) : null; }
function txtAcc_(texto, re) { const m = texto.match(re); return m ? m[1].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : ''; }

/* ---------- nombre del activo → ticker ---------- */

function mapaAcciones_() {
  const m = {};
  leer_('acciones_mapa', 'select=nombre,ticker').forEach((f) => { m[String(f.nombre).trim().toLowerCase()] = String(f.ticker || ''); });
  return m;
}

function tickerDe_(nombre, mapa) {
  return nombre ? mapa[String(nombre).trim().toLowerCase()] || '' : '';
}

/* AUTO-MAPA: un activo nuevo se busca en Yahoo, se anota en acciones_mapa y
   se avisa para que el dueño verifique que el ticker es el correcto. */
function autoMapa_(nombre, mapa) {
  nombre = String(nombre || '').trim();
  if (!nombre) return '';
  const tk = buscarTickerYahoo_(nombre);
  agregarFilas_('acciones_mapa', [{ nombre, ticker: tk }], { conflicto: 'nombre', ignorar: true });
  mapa[nombre.toLowerCase()] = tk;
  const msg = tk
    ? 'AUTO-MAPA: nuevo activo "' + nombre + '" con ticker ' + tk + '. Verifica que el ticker sea el correcto.'
    : 'AUTO-MAPA: nuevo activo "' + nombre + '" SIN ticker (Yahoo no encontró coincidencia). Corrígelo en la operación desde la página.';
  agregarFilas_('acciones_alertas', [{ fecha: new Date().toISOString(), tipo: 'AUTO-MAPA', detalle: msg }]);
  avisarDueno_('Fintual: nuevo activo detectado — ' + (tk || nombre), msg);
  return tk;
}

function buscarTickerYahoo_(nombre) {
  try {
    const r = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(nombre) + '&quotesCount=6&newsCount=0',
      { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.getResponseCode() !== 200) return '';
    const qs = (JSON.parse(r.getContentText()).quotes || []).filter((q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'));
    qs.sort((a, b) => puntajeTicker_(b) - puntajeTicker_(a));
    return qs.length ? String(qs[0].symbol) : '';
  } catch (e) {
    return '';
  }
}

function puntajeTicker_(q) {
  let s = 0;
  if (String(q.symbol).indexOf('.') < 0) s += 4; // preferir listado de EE. UU. (sin sufijo)
  if (['NMS', 'NYQ', 'PCX', 'NGM', 'BTS', 'ASE', 'NCM'].indexOf(q.exchange) >= 0) s += 2;
  if (q.quoteType === 'ETF') s += 1;
  return s;
}

/* ---------- precios ---------- */

/* Yahoo para cada ticker de la cartera más el dólar (CLP=X). Devuelve
   cuántos se actualizaron. Lo que falla conserva el precio anterior. */
function actualizarPreciosAcciones_() {
  const ops = leer_('acciones_operaciones', 'select=ticker,activo');
  const nombres = {};
  ops.forEach((o) => { if (o.ticker && o.ticker !== 'USD' && !nombres[o.ticker]) nombres[o.ticker] = o.activo || o.ticker; });
  const tickers = Object.keys(nombres).concat(['USDCLP']);
  nombres.USDCLP = 'Dólar observado (CLP/USD)';
  let res = null;
  try {
    res = UrlFetchApp.fetchAll(tickers.map((tk) => ({
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(tk === 'USDCLP' ? 'CLP=X' : tk) + '?range=1d&interval=1d',
      muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' },
    })));
  } catch (e) {
    console.error('Yahoo no respondió: ' + e);
    return 0;
  }
  const ahora = new Date().toISOString();
  const filas = [];
  tickers.forEach((tk, i) => {
    try {
      if (res[i].getResponseCode() !== 200) return;
      const meta = JSON.parse(res[i].getContentText()).chart.result[0].meta;
      const px = meta.regularMarketPrice;
      const pc = meta.chartPreviousClose || meta.previousClose;
      if (px == null) return;
      filas.push({ ticker: tk, nombre: nombres[tk], precio: px, cambio_dia: pc ? px / pc - 1 : '', actualizado: ahora });
    } catch (e) { /* ese ticker queda con su precio anterior */ }
  });
  agregarFilas_('acciones_precios', filas, { conflicto: 'ticker' });
  return filas.length;
}

/* ---------- posiciones y alertas ---------- */

/* Costo promedio MÓVIL por ticker: el que tenías al momento de cada venta
   (así lo calcula Fintual). Recibe operaciones del contrato y devuelve
   { ticker: { acciones, costo, realizada, costoProm } }.

   Es la misma cuenta que src/inversiones/lib/cartera.js:
   tests/inversiones-cartera.test.mjs ejecuta esta función en Node y compara.
   Si cambias una, cambia la otra (hito 0004 de gestor-acciones). */
function costoMovilAcciones_(ops) {
  const evs = [];
  ops.forEach((o, i) => {
    if (o.tipo !== 'compra' && o.tipo !== 'venta') return;
    const tk = String(o.ticker || '').trim();
    const t = Date.parse(String(o.fecha).slice(0, 10) + 'T00:00:00Z');
    if (!tk || tk === 'USD' || isNaN(t)) return;
    evs.push({ t, i, tk, compra: o.tipo === 'compra', cant: Number(o.cantidad) || 0, usd: Number(o.usd) || 0 });
  });
  // Cronológico y estable: a igual fecha, el orden de llegada.
  evs.sort((a, b) => a.t - b.t || a.i - b.i);
  const out = {};
  evs.forEach((e) => {
    const p = out[e.tk] || (out[e.tk] = { acciones: 0, costo: 0, realizada: 0, costoProm: 0 });
    if (e.compra) { p.acciones += e.cant; p.costo += e.usd; }
    else {
      const prom = p.acciones > 0 ? p.costo / p.acciones : 0;
      const costoVendido = Math.min(e.cant, Math.max(p.acciones, 0)) * prom;
      p.realizada += e.usd - costoVendido;
      p.costo -= costoVendido;
      p.acciones -= e.cant;
      // Residuo de fracción (vendiste 1,9999 de 2): se descarta con su costo.
      if (p.acciones < RESIDUO_ACC) { p.acciones = 0; p.costo = 0; }
    }
    p.costoProm = p.acciones > 0 ? p.costo / p.acciones : 0;
  });
  return out;
}

/* Señales con anti-spam: el mismo conjunto de señales no se avisa dos veces
   seguidas (un activo que oscila en torno al umbral avisaría a cada rato). */
function revisarAlertasAcciones_() {
  const cfg = leerConfig_();
  const venta = Number(cfg.umbral_venta_pct) || 5;
  const caida = Number(cfg.umbral_caida_pct) || 3;
  const pos = costoMovilAcciones_(leer_('acciones_operaciones', 'select=fecha,tipo,ticker,cantidad,usd&order=fecha,id'));
  const precio = {};
  leer_('acciones_precios', 'select=ticker,precio,cambio_dia').forEach((p) => { precio[p.ticker] = p; });

  const fichas = [];
  const lineas = [];
  Object.keys(pos).sort().forEach((tk) => {
    const p = pos[tk];
    const px = precio[tk] && precio[tk].precio != null ? Number(precio[tk].precio) : null;
    if (px > 0 && p.acciones > 0.0001 && p.costoProm > 0) {
      const g = ((px - p.costoProm) / p.costoProm) * 100;
      if (g >= venta) {
        fichas.push('SELL:' + tk);
        lineas.push('🟢 VENDER? ' + tk + ' va +' + g.toFixed(1) + '% sobre tu costo (actual US$' + px.toFixed(2) + ', costo US$' + p.costoProm.toFixed(2) + ').');
      }
    }
    const c = precio[tk] && precio[tk].cambio_dia != null ? Number(precio[tk].cambio_dia) : null;
    if (c !== null && c <= -(caida / 100)) {
      fichas.push('BUY:' + tk);
      lineas.push('🔻 COMPRAR? ' + tk + ' cae ' + (c * 100).toFixed(1) + '% hoy (actual US$' + (px != null ? px.toFixed(2) : '?') + ').');
    }
  });

  if (!lineas.length) return 0;
  const firma = fichas.sort().join('|');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ACCIONES_FIRMA') === firma) return 0;
  props.setProperty('ACCIONES_FIRMA', firma);
  agregarFilas_('acciones_alertas', [{ fecha: new Date().toISOString(), tipo: lineas.length + ' señal(es)', detalle: lineas.join('\n') }]);
  avisarDueno_('Fintual: ' + lineas.length + ' señal(es) relevante(s)',
    lineas.join('\n\n') + '\n\nRevisado: ' + new Date().toLocaleString('es-CL') + '\n\n(No repetiré este aviso hasta que cambien las señales.)');
  return lineas.length;
}

/* Correo al dueño: el de `email_alertas` en la configuración, o el de la
   cuenta que instaló el script. GmailApp y no MailApp: el permiso de Gmail
   ya está (lo necesita procesarCorreos) y MailApp pediría otro. */
function avisarDueno_(asunto, texto) {
  const destino = leerConfig_().email_alertas || PropertiesService.getScriptProperties().getProperty('PROPIETARIO');
  if (!destino) return;
  try { GmailApp.sendEmail(destino, asunto, texto); } catch (e) { console.error('No se pudo avisar por correo: ' + e); }
}
