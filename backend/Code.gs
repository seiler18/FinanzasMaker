/* ============================================================
   FinanzasMaker — el trabajador de fondo en Google Apps Script (v2)

   Vive DENTRO de la planilla (Extensiones → Apps Script) y corre con la
   cuenta del dueño. Desde el hito 0010 ya no guarda en las hojas: guarda en
   Supabase (Supabase.gs), y la página lee de allá. Le quedan los trabajos que
   necesitan la cuenta de Google:

   1. procesarCorreos(): un disparador cada 30 min busca en Gmail los avisos de
      los bancos, los lee con Lectores.gs, escribe cada movimiento en la base y
      SOLO DESPUÉS manda ese correo a la papelera (Gmail lo borra del todo a
      los 30 días). Lo que no entiende va a «revisar» y no se toca. También
      manda a la papelera lo que el dueño decidió borrar desde la página.
   2. actualizarAcciones() y alertasAcciones() (Acciones.gs): lo que hacía la
      hoja de gestor-acciones.
   3. doPost(): solo «sincronizar» («Revisar correos ahora» en la página), con
      el token de «Iniciar sesión con Google»; si no es del dueño, nada.

   Instalación: README.md («v2: el trabajador»). Modelo de amenazas: SECURITY.md.
   ============================================================ */

const CONFIG_BASE = [
  ['titular', 'Jesus Seiler', 'Tu nombre tal como lo escriben los bancos (nombre + apellido). Sirve para reconocer transferencias entre tus cuentas.'],
  ['desde', '2026/01/01', 'Primera fecha que se importa (AAAA/MM/DD).'],
  ['borrar_correos', 'si', '«si»: el correo va a la papelera después de registrarlo. «no»: se deja donde está.'],
  ['dolar', '950', 'Pesos por dólar para convertir compras en USD (aproximado).'],
  ['cuentas_externas', 'Mercado Pago', 'Cuentas tuyas que no avisan lo que reciben (separadas por coma): lo que sale de ellas a tus cuentas cuenta como ingreso, y lo que les mandas, como gasto.'],
  ['bancos_por_aviso', '', 'Bancos que ya se leen por los avisos del celular (separados por coma, como salen en Movimientos: MACH, Tenpo…). Su correo solo completa lo que trajo el aviso; si llega uno sin aviso, va a «Por revisar».'],
  ['vendedores_cripto', 'Leveltech', 'Vendedores de Binance P2P a quienes les compras USDT (separados por coma): esa transferencia pasa a tu cuenta de Binance y no es gasto; el gasto se cuenta cuando el USDT sale por Binance Pay.'],
  ['umbral_venta_pct', '5', 'Inversiones: avisa «¿vender?» cuando una posición gana más de este % sobre su costo.'],
  ['umbral_caida_pct', '3', 'Inversiones: avisa «¿comprar?» cuando un activo cae más de este % en el día.'],
  ['acciones_desde', '2026/06/04', 'Inversiones: primera fecha de los correos de operaciones de Fintual que se leen (AAAA/MM/DD).'],
  ['email_alertas', '', 'Inversiones: a qué correo llegan los avisos. Vacío: al de la cuenta que instaló el script.'],
];

// Dominios con lector propio. La red genérica de Lectores.gs cubre el resto
// a través de las palabras del asunto.
const REMITENTES = ['tenpo.cl', 'tenpobank.cl', 'machbank.cl', 'somosmach.com', 'bciplus.cl', 'mercadopago.cl',
                    'mercadopago.com', 'copecpay.cl', 'correo.bancoestado.cl', 'fintual.com', 'bancofalabella.com', 'bci.cl',
                    'binance.com'];
const PALABRAS_ASUNTO = ['comprobante', 'transferencia', 'compra', 'abono', 'cargo', 'giro', 'pago', 'deposito',
                         'depósito', 'retiro', 'transacción', 'aviso'];

const PAGINA = 40;                 // hilos por vuelta de búsqueda
const SOLAPE_S = 2 * 24 * 3600;    // cada pasada vuelve a mirar 2 días atrás

/* Cuotas de Google para una cuenta gmail.com gratuita: 90 minutos al día de
   disparadores y unas 20.000 lecturas de Gmail al día. Pasarse no bloquea
   Gmail, pero deja el script detenido hasta el día siguiente. Con 48 pasadas
   al día (cada 30 min) se queda lejos de ambas:
   · el disparador trabaja a lo más 1,5 min por vez (una pasada sin correos
     nuevos tarda segundos; solo una importación larga llega al tope);
   · si en el día ya sumó 60 min, las pasadas siguientes esperan a mañana;
   · lo que se ignoró (publicidad, alertas, correos que no son de bancos) se
     recuerda 6 horas y no se vuelve a abrir en cada pasada.
   Las tareas de Acciones.gs (cada 1 h y cada 4 h) duran segundos. */
const CADA_MIN = 30;
const PRESUPUESTO_DISPARADOR_MS = 90 * 1000;
const TOPE_DIARIO_MS = 60 * 60 * 1000;
const IGNORADOS_S = 6 * 3600;

/* ============================================================
   INSTALACIÓN — se corren a mano desde el editor
   ============================================================ */

/* Guarda quién es el dueño, siembra la configuración y las reglas base en la
   base si están vacías, y deja los disparadores. Antes: probarSupabase()
   (Supabase.gs) y, si había datos en la planilla, migrarASupabase() (Migrar.gs). */
function instalar() {
  const props = PropertiesService.getScriptProperties();
  const dueno = Session.getEffectiveUser().getEmail();
  if (!dueno) throw new Error('No se pudo leer tu correo: autoriza el script y vuelve a correr instalar()');
  props.setProperty('PROPIETARIO', dueno.toLowerCase());
  sembrar_();
  programarDisparador();
  console.log('Listo. Dueño: ' + dueno + (props.getProperty('CLIENT_ID') ? '' : '. Falta: definir CLIENT_ID con definirClienteId("...")'));
}

/* Un solo disparador de cada tarea. Se corre a mano para rehacerlos. */
function programarDisparador() {
  const tareas = [['procesarCorreos', (t) => t.everyMinutes(CADA_MIN), 'cada ' + CADA_MIN + ' minutos'],
                  ['actualizarAcciones', (t) => t.everyHours(1), 'cada 1 hora'],
                  ['actualizarPrecios', (t) => t.everyMinutes(5), 'cada 5 minutos (solo con la bolsa abierta)'],
                  ['alertasAcciones', (t) => t.everyHours(4), 'cada 4 horas']];
  const nombres = tareas.map((t) => t[0]);
  ScriptApp.getProjectTriggers()
    .filter((t) => nombres.indexOf(t.getHandlerFunction()) !== -1)
    .forEach((t) => ScriptApp.deleteTrigger(t));
  tareas.forEach((t) => { t[1](ScriptApp.newTrigger(t[0]).timeBased()).create(); console.log('Disparador: ' + t[0] + ' ' + t[2]); });
}

function definirClienteId(id) {
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(String(id || ''))) throw new Error('Eso no parece un ID de cliente de OAuth');
  PropertiesService.getScriptProperties().setProperty('CLIENT_ID', id);
  console.log('CLIENT_ID guardado');
}

function sembrar_() {
  if (!leer_('config', 'select=clave').length) agregarFilas_('config', CONFIG_BASE.map((c) => ({ clave: c[0], valor: c[1] })));
  if (!leer_('reglas', 'select=id').length) agregarFilas_('reglas', REGLAS_BASE.map((r) => ({ patron: r[0], categoria: r[1], tipo: r[2] || '' })));
}

/* Ensayo: lee los correos y escribe en la hoja «Ensayo» de esta planilla qué
   haría con cada uno — sin registrar nada, sin borrar nada y sin mover el
   cursor. Es la prueba de los lectores contra tus correos reales. */
function ensayo() {
  const r = procesar_({ ensayo: true, presupuestoMs: 5 * 60 * 1000 });
  console.log(JSON.stringify(r.resumen));
}

/* Vuelve a importar todo desde «desde» (configuración). Lo ya registrado no
   se duplica: la bitácora `correos` lo salta por id. */
function reiniciarImportacion() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('PASADA');
  props.deleteProperty('ULTIMA');
  console.log('Listo: la próxima pasada importa desde ' + leerConfig_().desde);
}

/* Aplica «cuentas_externas» a lo que ya estaba registrado: los traspasos
   desde o hacia esas cuentas que entraron como «Entre mis cuentas» pasan a
   ingreso o gasto. El lector de cada movimiento sale de la bitácora. Se puede
   correr varias veces: lo ya reclasificado no se toca. */
function reclasificarExternas() {
  const cfg = leerConfig_();
  const ctx = { titular: cfg.titular || '', externas: cfg.cuentas_externas || '' };
  const lector = {};
  leer_('correos', 'select=gmail_id,lector').forEach((c) => { lector[String(c.gmail_id)] = String(c.lector); });
  let n = 0;
  leer_('movimientos', 'select=id,tipo,categoria,contraparte,banco,detalle,gmail_id&origen=eq.correo&tipo=eq.interna').forEach((m) => {
    const antes = m.tipo + '|' + m.categoria;
    externa_(m, ctx, lector[String(m.gmail_id)] || '');
    if (m.tipo + '|' + m.categoria !== antes) { actualizar_('movimientos', 'id', m.id, { tipo: m.tipo, categoria: m.categoria }); n++; }
  });
  console.log(n + ' movimiento(s) reclasificados con cuentas_externas = «' + ctx.externas + '»');
}

/* Aplica «vendedores_cripto» a lo ya registrado: la transferencia a un
   vendedor de Binance P2P que entró como gasto pasa a «Compra de cripto». */
function reclasificarCripto() {
  const ctx = { vendedores: leerConfig_().vendedores_cripto || '' };
  let n = 0;
  leer_('movimientos', 'select=id,tipo,categoria,contraparte&origen=eq.correo').forEach((m) => {
    const antes = m.tipo + '|' + m.categoria;
    p2p_(m, ctx);
    if (m.tipo + '|' + m.categoria !== antes) { actualizar_('movimientos', 'id', m.id, { tipo: m.tipo, categoria: m.categoria }); n++; }
  });
  console.log(n + ' movimiento(s) reclasificados con vendedores_cripto = «' + ctx.vendedores + '»');
}

/* Qué ve el script, sin tocar nada: la configuración leída, la búsqueda
   exacta y cuántos correos devuelve. Lo primero que se mira si algo sale en 0. */
function diagnostico() {
  const cfg = leerConfig_();
  const props = PropertiesService.getScriptProperties();
  const q = consulta_(cfg.desde);
  const hilos = GmailApp.search(q, 0, 50);
  const bancarios = hilos.reduce((n, h) => n + h.getMessages().filter((m) => esRemitenteBancario_(correoDe_(m.getFrom()))).length, 0);
  console.log(JSON.stringify({
    config: cfg, propietario: props.getProperty('PROPIETARIO'), clientId: props.getProperty('CLIENT_ID') ? 'definido' : 'FALTA',
    migrado: props.getProperty('MIGRADO') || 'no', pasada: props.getProperty('PASADA'), consulta: q,
    hilosPrimeraPagina: hilos.length, correosBancariosPrimeraPagina: bancarios,
  }, null, 2));
}

/* ============================================================
   PROCESAMIENTO DE CORREOS
   ============================================================ */

/* Hasta que no se haya pasado lo de la planilla a la base, no se procesa
   nada: la bitácora de la base estaría vacía y lo de los últimos dos días
   (ya registrado en la hoja y en la papelera) entraría otra vez, duplicado. */
function migrado_() {
  return PropertiesService.getScriptProperties().getProperty('MIGRADO') === 'si';
}

function procesarCorreos() {
  if (!migrado_()) { console.log('Falta correr migrarASupabase() (o empezarDeCero()): no se procesa nada todavía'); return; }
  const props = PropertiesService.getScriptProperties();
  const hoy = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd');
  const uso = JSON.parse(props.getProperty('USO') || 'null') || {};
  const usado = uso.dia === hoy ? Number(uso.ms) || 0 : 0;
  if (usado >= TOPE_DIARIO_MS) { console.log('Tope diario de ' + TOPE_DIARIO_MS / 60000 + ' min alcanzado: sigue mañana'); return; }
  const t0 = Date.now();
  try {
    borrarDecididos_();
    const r = procesar_({ ensayo: false, presupuestoMs: PRESUPUESTO_DISPARADOR_MS });
    console.log(JSON.stringify(r.resumen));
  } finally {
    props.setProperty('USO', JSON.stringify({ dia: hoy, ms: usado + Date.now() - t0 }));
  }
}

function consulta_(desde) {
  const de = REMITENTES.map((d) => 'from:' + d).join(' ');
  const asunto = PALABRAS_ASUNTO.map((p) => 'subject:' + p).join(' ');
  // in:anywhere incluye la papelera: hay avisos que se borraron a mano antes
  // de que existiera esto y también deben entrar.
  return 'in:anywhere -in:spam -in:sent -in:drafts after:' + desde + ' {' + de + ' ' + asunto + '}';
}

/* Una «pasada» recorre la búsqueda completa, de lo más nuevo a lo más viejo,
   en trozos de PAGINA hilos. Si se acaba el tiempo, la siguiente ejecución
   sigue desde `inicio`. Cuando termina, la próxima pasada empieza desde la
   hora en que empezó esta menos SOLAPE_S (lo ya visto se salta por id). */
function procesar_(op) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(op.ensayo ? 30000 : 1000)) return { resumen: { ocupado: true } };
  try {
    const cfg = leerConfig_();
    const ctx = { titular: cfg.titular || '', dolar: Number(cfg.dolar) || 950, externas: cfg.cuentas_externas || '', vendedores: cfg.vendedores_cripto || '' };
    const reglas = leer_('reglas', 'select=patron,categoria,tipo&order=id').filter((r) => r.patron);
    // Los ya procesados se consultan por trozo (los ids de cada página), no
    // todos al empezar: la bitácora crece sin tope y la página de búsqueda no.
    const vistos = new Set();
    // Lo ignorado no queda en la bitácora: sin esto se volvería a abrir en
    // cada pasada mientras siga dentro del solape. El ensayo debe verlo todo.
    const cache = CacheService.getScriptCache();
    const ignorados = new Set(op.ensayo ? [] : JSON.parse(cache.get('IGNORADOS') || '[]'));
    const recientes = leerPagina_('movimientos', 'select=id,fecha,banco,tipo,monto,contraparte&order=fecha.desc&limit=500');
    const borrar = !op.ensayo && String(cfg.borrar_correos).toLowerCase() === 'si';
    const props = PropertiesService.getScriptProperties();

    // `base` es el «desde» de la configuración con que empezó la importación.
    // Si cambia, se vuelve a importar desde la fecha nueva: lo ya registrado
    // se salta por id.
    const base = String(cfg.desde || '2026/01/01');
    let pasada = op.ensayo ? null : JSON.parse(props.getProperty('PASADA') || 'null');
    if (!pasada || pasada.base !== base) pasada = { base, desde: base, inicio: 0, comenzo: Math.floor(Date.now() / 1000) };
    const limite = inicioDe_(pasada.desde);
    const q = consulta_(pasada.desde);

    const t0 = Date.now();
    const resumen = { registrados: 0, inversiones: 0, revisar: 0, duplicados: 0, ignorados: 0, borrados: 0, errores: 0 };
    const filasEnsayo = [];
    let inicio = pasada.inicio;
    let terminado = false;

    // Siempre al menos una vuelta; después, mientras quede tiempo.
    for (;;) {
      const hilos = GmailApp.search(q, inicio, PAGINA);
      const lote = { movimientos: [], inversiones: [], revisar: [], correos: [], papelera: [] };
      const mensajes = [];
      hilos.forEach((hilo) => hilo.getMessages().forEach((msg) => mensajes.push(msg)));

      const nuevos = mensajes.map((m) => m.getId()).filter((id) => !vistos.has(id) && !ignorados.has(id));
      leerEn_('correos', 'select=gmail_id', 'gmail_id', nuevos).forEach((f) => vistos.add(String(f.gmail_id)));

      mensajes.forEach((msg) => {
        const id = msg.getId();
        if (vistos.has(id) || ignorados.has(id) || msg.getDate() < limite || msg.isDraft()) return;
        vistos.add(id);
        const de = correoDe_(msg.getFrom());
        // La búsqueda por asunto («pago», «aviso»…) trae también correos de
        // GitHub o de tiendas. Leer el cuerpo es lo caro: se descartan antes
        // por remitente, sin abrirlos.
        if (!esRemitenteBancario_(de)) { resumen.ignorados++; ignorados.add(id); return; }
        const c = {
          de, asunto: msg.getSubject() || '', fecha: fmtFecha_(msg.getDate()),
          texto: textoCorreo_(msg.getPlainBody(), msg.getBody()),
        };
        let r;
        try { r = leerCorreo_(c, ctx); } catch (e) { r = { estado: 'error', motivo: String(e) }; }
        if (r.estado === 'nada' || r.estado === 'ignorar') ignorados.add(id);
        manejar_(r, c, id, msg, { lote, resumen, reglas, recientes, filasEnsayo, ensayo: op.ensayo, ctx });
      });

      if (!op.ensayo) {
        // Primero la base, después la papelera. Si algo falla al escribir,
        // escribir_ lanza antes de tocar un solo correo.
        escribir_(lote);
        if (borrar) {
          lote.papelera.forEach((m) => {
            try { if (!m.isInTrash()) m.moveToTrash(); resumen.borrados++; }
            catch (e) { resumen.errores++; console.error('No se pudo borrar ' + m.getId() + ': ' + e); }
          });
        }
      }

      if (hilos.length < PAGINA) { terminado = true; break; }
      // Cinco de solape: si un hilo viejo recibe un correo nuevo sube al
      // principio y los demás se corren un lugar; sin esto se saltaría uno.
      inicio += hilos.length - 5;
      if (Date.now() - t0 >= op.presupuestoMs) break;
    }

    if (!op.ensayo) cache.put('IGNORADOS', JSON.stringify(Array.from(ignorados).slice(-3000)), IGNORADOS_S);
    if (op.ensayo) {
      escribirEnsayo_(filasEnsayo);
    } else if (terminado) {
      const ahora = new Date().toISOString();
      props.setProperty('PASADA', JSON.stringify({ base, desde: String(pasada.comenzo - SOLAPE_S), inicio: 0, comenzo: Math.floor(Date.now() / 1000) }));
      props.setProperty('ULTIMA', ahora);
      guardarEstado_({ ultima: ahora, importando: false, resumen });
    } else {
      props.setProperty('PASADA', JSON.stringify(Object.assign(pasada, { inicio })));
      guardarEstado_({ importando: true, resumen });
    }
    resumen.completa = terminado;
    return { resumen };
  } finally {
    lock.releaseLock();
  }
}

function manejar_(r, c, id, msg, s) {
  const bitacora = (resultado, lector, ref) => s.lote.correos.push({
    gmail_id: id, fecha: c.fecha, remitente: c.de, asunto: c.asunto, resultado, lector: lector || '', referencia: ref || '', procesado: ahora_(),
  });
  const ensayo = (resultado, extra) => s.filasEnsayo.push(Object.assign({ fecha: c.fecha, remitente: c.de, asunto: c.asunto, resultado }, extra || {}));

  if (r.estado === 'nada' || r.estado === 'ignorar') {
    s.resumen.ignorados++;
    if (s.ensayo && r.estado === 'ignorar') ensayo('ignorado');
    return;
  }
  if (r.estado === 'revisar' || r.estado === 'error') {
    s.resumen.revisar++;
    const g = r.sugerido || {};
    if (s.ensayo) return ensayo('revisar', { motivo: r.motivo, tipo: g.tipo, monto: g.monto, contraparte: g.contraparte });
    s.lote.revisar.push({
      gmail_id: id, fecha: g.fecha || c.fecha, remitente: c.de, asunto: c.asunto, motivo: r.motivo || '',
      tipo: g.tipo || '', monto: g.monto || '', contraparte: g.contraparte || '', banco: g.banco || '',
      extracto: plano_(c.texto).slice(0, 400), estado: 'pendiente',
    });
    return bitacora('revisar', r.lector);
  }

  // estado ok
  let ref = '';
  if (r.mov) {
    const m = p2p_(externa_(categorizar_(r.mov, s.reglas), s.ctx, r.lector), s.ctx);
    const dup = esDuplicado_(m, s.recientes.concat(s.lote.movimientos));
    if (dup) {
      s.resumen.duplicados++;
      if (s.ensayo) return ensayo('duplicado', { tipo: m.tipo, monto: m.monto, contraparte: m.contraparte, motivo: 'Igual a ' + dup.banco + ' ' + dup.fecha });
      bitacora('duplicado', r.lector, dup.id);
      s.lote.papelera.push(msg);
      return;
    }
    m.id = nuevoId_('M');
    Object.assign(m, { origen: 'correo', gmail_id: id, registrado: ahora_(), nota: '' });
    s.lote.movimientos.push(m);
    s.resumen.registrados++;
    ref = m.id;
    if (s.ensayo) ensayo('movimiento', { tipo: m.tipo, monto: m.monto, contraparte: m.contraparte, categoria: m.categoria, banco: m.banco, lector: r.lector });
  }
  if (r.inv) {
    const v = Object.assign(r.inv, { id: nuevoId_('I'), gmail_id: id, registrado: ahora_() });
    s.lote.inversiones.push(v);
    s.resumen.inversiones++;
    ref = ref || v.id;
    if (s.ensayo && !r.mov) ensayo('inversión', { tipo: v.operacion, monto: v.monto + ' ' + v.moneda, contraparte: v.instrumento, lector: r.lector });
  }
  if (!s.ensayo) {
    bitacora('registrado', r.lector, ref);
    s.lote.papelera.push(msg);
  }
}

/* La bitácora va al final: si una tabla de datos falla, el correo no queda
   anotado como procesado y la próxima pasada lo vuelve a intentar. Las de
   «revisar» y la bitácora no se pisan si ya estaban (reintento tras un corte). */
function escribir_(lote) {
  agregarFilas_('movimientos', lote.movimientos);
  agregarFilas_('inversiones', lote.inversiones);
  agregarFilas_('revisar', lote.revisar, { conflicto: 'usuario,gmail_id', ignorar: true });
  agregarFilas_('correos', lote.correos, { conflicto: 'usuario,gmail_id', ignorar: true });
}

/* Lo que el dueño decidió en la página («Registrar» con borrar_correos = si,
   o «Descartar y borrar el correo»): la página solo lo marca, porque Gmail lo
   toca únicamente este script. Se anota hecho aunque el correo ya no exista. */
function borrarDecididos_() {
  const pendientes = leer_('revisar', 'select=gmail_id&borrar_correo=is.true&correo_borrado=is.false');
  pendientes.forEach((f) => {
    try {
      const msg = GmailApp.getMessageById(f.gmail_id);
      if (msg && !msg.isInTrash()) msg.moveToTrash();
    } catch (e) {
      console.error('No se pudo borrar ' + f.gmail_id + ': ' + e);
    }
    actualizar_('revisar', 'gmail_id', f.gmail_id, { correo_borrado: true });
  });
}

/* Una sola página de resultados, para consultas que ya traen su `limit`. */
function leerPagina_(tabla, consulta) {
  return sbPedir_('get', tabla, sbConsulta_(tabla, consulta)) || [];
}

function escribirEnsayo_(filas) {
  const ss = SpreadsheetApp.getActive();
  const h = ss.getSheetByName('Ensayo') || ss.insertSheet('Ensayo');
  h.clearContents();
  const cab = ['fecha', 'remitente', 'asunto', 'resultado', 'tipo', 'monto', 'contraparte', 'categoria', 'banco', 'lector', 'motivo'];
  const datos = [cab].concat(filas.map((f) => cab.map((k) => celda_(f[k] == null ? '' : f[k]))));
  h.getRange(1, 1, datos.length, cab.length).setValues(datos);
}

/* ============================================================
   API HTTP — solo «Revisar correos ahora»
   ============================================================ */

function doGet() {
  return json_({ ok: true, servicio: 'FinanzasMaker' });
}

function doPost(e) {
  let body;
  try {
    if (!e || !e.postData || e.postData.contents.length > 256 * 1024) return json_({ ok: false, error: 'Petición no válida' });
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'JSON no válido' });
  }
  try {
    const accion = String(body.accion || '');
    if (!Object.prototype.hasOwnProperty.call(ACCIONES, accion)) return json_({ ok: false, error: 'Acción no válida' });
    if (!identidad_(body.credencial)) return json_({ ok: false, error: 'Inicia sesión de nuevo', sesion: false });
    return json_(Object.assign({ ok: true }, ACCIONES[accion](body)));
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({ ok: false, error: 'Error interno' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- identidad ----------
   La credencial es el ID token (JWT) de Google Identity Services. Se valida
   con el endpoint tokeninfo de Google (que comprueba la firma) y además:
   emitido para NUESTRO client_id, correo verificado, y ese correo es el
   dueño guardado por instalar(). Un token válido se recuerda en caché por
   su tiempo de vida para no llamar a Google en cada clic.

   Antes de gastar una llamada externa se descarta lo que ni siquiera tiene
   forma de token o dice ser para otro: la cuota de UrlFetch es del dueño y
   la URL /exec es pública. Hay además un freno global de 30 validaciones
   por minuto. */
function identidad_(cred) {
  if (typeof cred !== 'string' || cred.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(cred)) return null;
  const props = PropertiesService.getScriptProperties();
  const cliente = props.getProperty('CLIENT_ID');
  const dueno = props.getProperty('PROPIETARIO');
  if (!cliente || !dueno) return null;

  let carga;
  try { carga = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(relleno_(cred.split('.')[1]))).getDataAsString()); }
  catch (e) { return null; }
  const ahora = Math.floor(Date.now() / 1000);
  if (!carga || carga.aud !== cliente || String(carga.email || '').toLowerCase() !== dueno || !(Number(carga.exp) > ahora + 30)) return null;

  const cache = CacheService.getScriptCache();
  const k = 'id_' + hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, cred, Utilities.Charset.UTF_8)).slice(0, 40);
  if (cache.get(k)) return dueno;

  const minuto = 'freno_' + Math.floor(ahora / 60);
  const n = Number(cache.get(minuto) || 0);
  if (n >= 30) return null;
  cache.put(minuto, String(n + 1), 120);

  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const p = JSON.parse(r.getContentText());
  if (p.aud !== cliente) return null;
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(p.iss) === -1) return null;
  if (String(p.email_verified) !== 'true') return null;
  if (String(p.email || '').toLowerCase() !== dueno) return null;
  const resta = Number(p.exp) - ahora;
  if (!(resta > 30)) return null;
  cache.put(k, '1', Math.min(resta - 30, 21600));
  return dueno;
}

function relleno_(s) { return s + '==='.slice((s.length + 3) % 4); }
function hex_(bytes) { return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join(''); }

/* La página habla con Supabase para todo lo demás (src/lib/datos.js). */
const ACCIONES = {
  // «Revisar correos ahora»: la misma pasada del disparador, con menos tiempo
  // para que el navegador no espere minutos.
  sincronizar: () => {
    if (!migrado_()) return { resumen: { ocupado: true } };
    borrarDecididos_();
    return { resumen: procesar_({ ensayo: false, presupuestoMs: 40 * 1000 }).resumen };
  },
};

/* ============================================================
   UTILIDADES
   ============================================================ */

/* Neutraliza la inyección de fórmulas en la hoja «Ensayo»: el asunto de un
   correo lo escribe un tercero, y un «=IMPORTXML(…)» en una celda se
   ejecutaría. El apóstrofo inicial lo fuerza a texto y no se ve. */
function celda_(v) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

function correoDe_(from) {
  const m = /<([^>]+)>/.exec(String(from || ''));
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

// Sin instanceof: una Date que llega de otro contexto (la hoja, un test) no
// es instancia del Date de este y pasaría como si fuera texto.
function esFecha_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v); }
function fmtFecha_(d) { return Utilities.formatDate(d, 'America/Santiago', 'yyyy-MM-dd HH:mm'); }
function ahora_() { return fmtFecha_(new Date()); }
function nuevoId_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

// '2026/01/01' o un epoch en segundos (lo que guarda una pasada terminada).
function inicioDe_(desde) {
  const s = String(desde);
  if (/^\d+$/.test(s)) return new Date(Number(s) * 1000);
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
  if (!m) return new Date(2026, 0, 1);
  // Medianoche de Chile en horario de verano (UTC-3), que es el de enero.
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 3, 0, 0));
}
