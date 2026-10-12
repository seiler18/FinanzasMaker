/* ============================================================
   Migración, una sola vez: de las planillas a Supabase (v2, hito 0011).

   migrarASupabase()         las hojas de ESTA planilla (FinanzasMaker)
   migrarAccionesASupabase() la hoja «Fintual - Monitoreo en vivo» de
                             gestor-acciones (su URL en la propiedad
                             PLANILLA_ACCIONES)

   Hasta que cada una corre, el trabajador no procesa nada de lo suyo
   (migrado_ en Code.gs, migradoAcciones_ en Acciones.gs): si procesara antes,
   la bitácora de la base estaría vacía y lo reciente entraría dos veces.
   Para empezar sin traer nada: empezarDeCero() y empezarAccionesDeCero().

   Las hojas no se tocan: quedan como respaldo de solo lectura. Lo que una
   fila trae mal (sin id, fecha ilegible, tipo desconocido) no se inventa: se
   salta y se informa en el registro de ejecución.
   ============================================================ */

/* Las columnas que tenían las hojas, en orden (el HOJAS del Code.gs v1). */
const HOJAS_PLANILLA = {
  movimientos: ['Movimientos', ['id', 'fecha', 'banco', 'producto', 'tipo', 'monto', 'moneda', 'monto_original', 'contraparte',
    'categoria', 'cuotas', 'detalle', 'nota', 'origen', 'gmail_id', 'registrado', 'fecha_contable']],
  inversiones: ['Inversiones', ['id', 'fecha', 'plataforma', 'operacion', 'instrumento', 'monto', 'moneda', 'detalle', 'gmail_id', 'registrado']],
  revisar: ['Revisar', ['gmail_id', 'fecha', 'remitente', 'asunto', 'motivo', 'tipo', 'monto', 'contraparte', 'banco', 'extracto', 'estado']],
  correos: ['Correos', ['gmail_id', 'fecha', 'remitente', 'asunto', 'resultado', 'lector', 'referencia', 'procesado']],
  reglas: ['Reglas', ['patron', 'categoria', 'tipo']],
  presupuestos: ['Presupuestos', ['categoria', 'monto_mensual']],
  config: ['Config', ['clave', 'valor']],
};

// Sheets convierte por su cuenta lo que parece fecha o número; el Code.gs v1
// lo deshacía al leer (deCelda_). Lo mismo aquí.
const TEXTO_PLANILLA = { fecha: 1, fecha_contable: 1, gmail_id: 1, referencia: 1, registrado: 1, procesado: 1, valor: 1, patron: 1, id: 1 };

function leerHoja_(ss, tabla) {
  const nombre = HOJAS_PLANILLA[tabla][0];
  const cols = HOJAS_PLANILLA[tabla][1];
  const h = ss.getSheetByName(nombre);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, cols.length).getValues().map((fila) => {
    const o = {};
    cols.forEach((k, i) => {
      let v = fila[i];
      if (esFecha_(v)) v = k === 'valor' ? Utilities.formatDate(v, 'America/Santiago', 'yyyy/MM/dd') : fmtFecha_(v);
      else if (TEXTO_PLANILLA[k] && typeof v === 'number') v = String(v);
      o[k] = v;
    });
    return o;
  });
}

// 'AAAA-MM-DD HH:MM' tal cual; 'AAAA-MM-DD' a las 12:00; otra cosa, ''.
function fechaMigrada_(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + ' 12:00';
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
  return m ? m[1] + '-' + m[2] + '-' + m[3] + ' ' + (m[4] || '12') + ':' + (m[5] || '00') : '';
}

const ORIGENES = ['correo', 'manual', 'notificacion', 'cartola'];

function migrarASupabase() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRADO') === 'si') throw new Error('Ya se migró. Para repetirlo, borra la propiedad MIGRADO (lo de la base se sobrescribe con lo de la hoja).');
  sb_(); // falla temprano si faltan las propiedades de Supabase
  const ss = SpreadsheetApp.getActive();
  const saltadas = [];
  const salta = (tabla, i, motivo) => saltadas.push(tabla + ' fila ' + (i + 2) + ': ' + motivo);
  const informe = {};

  const movs = [];
  leerHoja_(ss, 'movimientos').forEach((m, i) => {
    if (!m.id && !m.fecha) return; // fila en blanco
    const fecha = fechaMigrada_(m.fecha);
    const monto = Math.round(Number(m.monto));
    if (!m.id) return salta('movimientos', i, 'sin id');
    if (!fecha) return salta('movimientos', i, 'fecha ilegible «' + m.fecha + '»');
    if (TIPOS.indexOf(String(m.tipo)) === -1) return salta('movimientos', i, 'tipo «' + m.tipo + '»');
    if (!isFinite(monto) || monto < 0) return salta('movimientos', i, 'monto «' + m.monto + '»');
    movs.push(Object.assign({}, m, {
      fecha, monto, origen: ORIGENES.indexOf(String(m.origen)) !== -1 ? m.origen : 'correo',
      fecha_contable: /^\d{4}-\d{2}-\d{2}/.test(String(m.fecha_contable)) ? String(m.fecha_contable).slice(0, 10) : '',
    }));
  });
  agregarFilas_('movimientos', movs, { conflicto: 'id' });
  informe.movimientos = movs.length;

  const invs = [];
  leerHoja_(ss, 'inversiones').forEach((v, i) => {
    if (!v.id && !v.fecha) return;
    const fecha = fechaMigrada_(v.fecha);
    if (!v.id) return salta('inversiones', i, 'sin id');
    if (!fecha) return salta('inversiones', i, 'fecha ilegible «' + v.fecha + '»');
    invs.push(Object.assign({}, v, { fecha }));
  });
  agregarFilas_('inversiones', invs, { conflicto: 'id' });
  informe.inversiones = invs.length;

  const rev = leerHoja_(ss, 'revisar').filter((r) => r.gmail_id).map((r) => Object.assign({}, r, {
    fecha: String(r.fecha || ''), estado: ['pendiente', 'registrado', 'descartado'].indexOf(String(r.estado)) !== -1 ? r.estado : 'pendiente',
  }));
  agregarFilas_('revisar', rev, { conflicto: 'usuario,gmail_id' });
  informe.revisar = rev.length;

  const cor = leerHoja_(ss, 'correos').filter((c) => c.gmail_id).map((c) => Object.assign({}, c, { fecha: String(c.fecha || ''), procesado: String(c.procesado || '') }));
  agregarFilas_('correos', cor, { conflicto: 'usuario,gmail_id', ignorar: true });
  informe.correos = cor.length;

  // Las reglas, en su orden (la primera que calza gana) y solo si la base no
  // tiene: repetirlas las duplicaría.
  if (!leer_('reglas', 'select=id').length) {
    const reg = leerHoja_(ss, 'reglas').filter((r) => r.patron).map((r) => ({
      patron: r.patron, categoria: r.categoria || '', tipo: TIPOS.indexOf(String(r.tipo)) !== -1 ? r.tipo : '',
    }));
    agregarFilas_('reglas', reg);
    informe.reglas = reg.length;
  } else {
    informe.reglas = 'la base ya tenía reglas: no se tocaron';
  }

  const pre = leerHoja_(ss, 'presupuestos').filter((p) => p.categoria && Number(p.monto_mensual) > 0)
    .map((p) => ({ categoria: p.categoria, monto_mensual: Math.round(Number(p.monto_mensual)) }));
  agregarFilas_('presupuestos', pre, { conflicto: 'usuario,categoria' });
  informe.presupuestos = pre.length;

  const cfg = leerHoja_(ss, 'config').filter((c) => /^[a-z_]{1,40}$/.test(String(c.clave)))
    .map((c) => ({ clave: c.clave, valor: String(c.valor == null ? '' : c.valor) }));
  agregarFilas_('config', cfg, { conflicto: 'usuario,clave' });
  informe.config = cfg.length;

  // Lo que la página mostraba como «última revisión» sigue igual.
  const ultima = props.getProperty('ULTIMA');
  guardarEstado_({ ultima: ultima || null, importando: false });

  props.setProperty('MIGRADO', 'si');
  console.log('Migrado a Supabase: ' + JSON.stringify(informe));
  console.log('En la base: ' + ['movimientos', 'inversiones', 'revisar', 'correos', 'reglas'].map((t) => t + ' ' + leer_(t, 'select=' + (t === 'revisar' || t === 'correos' ? 'gmail_id' : 'id')).length).join(' · '));
  if (saltadas.length) console.log(saltadas.length + ' fila(s) saltada(s):\n' + saltadas.slice(0, 50).join('\n'));
}

/* Sin nada que traer: el trabajador empieza a escribir en la base desde ya. */
function empezarDeCero() {
  PropertiesService.getScriptProperties().setProperty('MIGRADO', 'si');
  sembrar_();
  console.log('Listo: procesarCorreos() escribe en Supabase desde la próxima pasada');
}

/* ---------- gestor-acciones ---------- */

const TIPOS_HOJA_ACCIONES = { 'Compra acción': 'compra', 'Venta acción': 'venta', Dividendo: 'dividendo', 'Compra USD': 'compraUsd', 'Venta USD': 'ventaUsd' };

// Números de la hoja: reales, o texto con coma decimal en las filas a mano.
function numeroHojaAcc_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === '' || v == null) return null;
  let s = String(v).trim().replace(/\s/g, '');
  if (/^-?[\d.]+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) && s !== '' ? n : null;
}

// Date de la hoja o texto dd/mm/aaaa → 'AAAA-MM-DD'.
function fechaHojaAcc_(v, tz) {
  if (esFecha_(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}

function migrarAccionesASupabase() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRADO_ACCIONES') === 'si') throw new Error('Ya se migró. Para repetirlo, vacía acciones_operaciones y borra la propiedad MIGRADO_ACCIONES.');
  const url = props.getProperty('PLANILLA_ACCIONES');
  if (!url) throw new Error('Falta la propiedad PLANILLA_ACCIONES con la URL de la hoja «Fintual - Monitoreo en vivo»');
  const ss = SpreadsheetApp.openByUrl(url);
  const tz = ss.getSpreadsheetTimeZone();
  const hoja = (n, cols) => { const h = ss.getSheetByName(n); return h && h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, cols).getValues() : []; };
  const saltadas = [];

  // Orden cronológico estable, como lo entregaba el Api.gs: a igual fecha, el
  // de la hoja. El id de la base guarda ese orden (cartera.js lo usa).
  const ops = [];
  hoja('Movimientos', 11).forEach((r, i) => {
    const tipo = TIPOS_HOJA_ACCIONES[String(r[1]).trim()];
    const fecha = fechaHojaAcc_(r[0], tz);
    if (!tipo || !fecha) { if (String(r[1]).trim() || r[0]) saltadas.push('Movimientos fila ' + (i + 2) + ': «' + r[1] + '» ' + r[0]); return; }
    ops.push({ i, fecha, tipo, activo: String(r[2] || ''), ticker: String(r[3] || '').trim(), cantidad: numeroHojaAcc_(r[4]),
      usd: numeroHojaAcc_(r[5]), clp: numeroHojaAcc_(r[6]), tipo_cambio: numeroHojaAcc_(r[7]), comision_clp: numeroHojaAcc_(r[8]),
      fuente: String(r[9] || 'Correo Gmail'), gmail_id: String(r[10] || '') });
  });
  ops.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.i - b.i));
  // Repetible: si una corrida anterior cortó a medias, las operaciones ya están
  // y no se vuelven a escribir (las cargadas a mano no tienen correo y se
  // duplicarían). Lo demás se completa.
  const yaOps = leer_('acciones_operaciones', 'select=id').length;
  if (yaOps) console.log('acciones_operaciones ya tenía ' + yaOps + ' fila(s): no se tocaron');
  else agregarFilas_('acciones_operaciones', ops, { conflicto: 'usuario,gmail_id', ignorar: true });

  const mapa = hoja('Mapa', 2).filter((r) => String(r[0]).trim()).map((r) => ({ nombre: String(r[0]).trim(), ticker: String(r[1] || '').trim() }));
  agregarFilas_('acciones_mapa', mapa, { conflicto: 'nombre' });

  const alertas = hoja('Alertas', 3).filter((r) => r[0] || r[2]).map((r) => ({
    fecha: esFecha_(r[0]) ? r[0].toISOString() : new Date().toISOString(), tipo: String(r[1] || ''), detalle: String(r[2] || ''),
  }));
  if (!leer_('acciones_alertas', 'select=id&limit=1').length) agregarFilas_('acciones_alertas', alertas);

  const precios = hoja('Precios', 5).filter((r) => String(r[0]).trim() && numeroHojaAcc_(r[2]) != null).map((r) => ({
    ticker: String(r[0]).trim(), nombre: String(r[1] || ''), precio: numeroHojaAcc_(r[2]), cambio_dia: numeroHojaAcc_(r[3]),
    actualizado: esFecha_(r[4]) ? r[4].toISOString() : null,
  }));
  agregarFilas_('acciones_precios', precios, { conflicto: 'ticker' });

  // Configuración de la hoja: correo (fila 4), umbrales (5 y 6), desde (8).
  const c = ss.getSheetByName('Configuración');
  if (c) {
    const v = (fila) => c.getRange(fila, 2).getValue();
    const desde = fechaHojaAcc_(v(8), tz);
    const cfg = [['email_alertas', String(v(4) || '')], ['umbral_venta_pct', String(numeroHojaAcc_(v(5)) || 5)],
                 ['umbral_caida_pct', String(numeroHojaAcc_(v(6)) || 3)]];
    if (desde) cfg.push(['acciones_desde', desde.replace(/-/g, '/')]);
    agregarFilas_('config', cfg.map((x) => ({ clave: x[0], valor: x[1] })), { conflicto: 'usuario,clave' });
  }

  props.setProperty('MIGRADO_ACCIONES', 'si');
  console.log('Acciones migradas: ' + (yaOps || ops.length) + ' operación(es), ' + mapa.length + ' activo(s) en el mapa, ' + alertas.length + ' alerta(s), ' + precios.length + ' precio(s)');
  if (saltadas.length) console.log(saltadas.length + ' fila(s) saltada(s):\n' + saltadas.slice(0, 50).join('\n'));
}
