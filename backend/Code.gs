/* ============================================================
   FinanzasMaker — backend en Google Apps Script

   Vive DENTRO de la planilla (Extensiones → Apps Script) y corre con la
   cuenta del dueño. Dos trabajos:

   1. procesarCorreos(): un disparador cada 30 min busca en Gmail los avisos de
      los bancos, los lee con Lectores.gs, escribe cada movimiento en la hoja
      y SOLO DESPUÉS manda ese correo a la papelera (Gmail lo borra del todo
      a los 30 días). Lo que no entiende va a «Revisar» y no se toca.
   2. doPost(): la API que usa la página de GitHub Pages. Cada petición trae
      el token de «Iniciar sesión con Google»; si no es del dueño, no hay datos.

   Instalación: README.md. Modelo de amenazas: SECURITY.md.
   ============================================================ */

const HOJAS = {
  movimientos: ['id', 'fecha', 'banco', 'producto', 'tipo', 'monto', 'moneda', 'monto_original', 'contraparte',
                'categoria', 'cuotas', 'detalle', 'nota', 'origen', 'gmail_id', 'registrado',
                // Opcional, 'AAAA-MM-DD'. Si está, el movimiento cuenta en ESE día para los
                // totales y no en `fecha` (que sigue siendo cuándo ocurrió de verdad).
                'fecha_contable'],
  inversiones: ['id', 'fecha', 'plataforma', 'operacion', 'instrumento', 'monto', 'moneda', 'detalle', 'gmail_id', 'registrado'],
  revisar:     ['gmail_id', 'fecha', 'remitente', 'asunto', 'motivo', 'tipo', 'monto', 'contraparte', 'banco', 'extracto', 'estado'],
  // Bitácora de cada correo procesado. Es lo que queda como respaldo cuando
  // el correo ya se borró, y lo que evita procesar dos veces el mismo.
  correos:     ['gmail_id', 'fecha', 'remitente', 'asunto', 'resultado', 'lector', 'referencia', 'procesado'],
  reglas:      ['patron', 'categoria', 'tipo'],
  presupuestos: ['categoria', 'monto_mensual'],
  config:      ['clave', 'valor'],
};

const NOMBRES_HOJA = {
  movimientos: 'Movimientos', inversiones: 'Inversiones', revisar: 'Revisar', correos: 'Correos',
  reglas: 'Reglas', presupuestos: 'Presupuestos', config: 'Config', ensayo: 'Ensayo',
};

const CONFIG_BASE = [
  ['titular', 'Jesus Seiler', 'Tu nombre tal como lo escriben los bancos (nombre + apellido). Sirve para reconocer transferencias entre tus cuentas.'],
  ['desde', '2026/01/01', 'Primera fecha que se importa (AAAA/MM/DD).'],
  ['borrar_correos', 'si', '«si»: el correo va a la papelera después de registrarlo. «no»: se deja donde está.'],
  ['dolar', '950', 'Pesos por dólar para convertir compras en USD (aproximado).'],
  ['cuentas_externas', 'Mercado Pago', 'Cuentas tuyas que no avisan lo que reciben (separadas por coma): lo que sale de ellas a tus cuentas cuenta como ingreso, y lo que les mandas, como gasto.'],
  ['vendedores_cripto', 'Leveltech', 'Vendedores de Binance P2P a quienes les compras USDT (separados por coma): esa transferencia pasa a tu cuenta de Binance y no es gasto; el gasto se cuenta cuando el USDT sale por Binance Pay.'],
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
     recuerda 6 horas y no se vuelve a abrir en cada pasada. */
const CADA_MIN = 30;
const PRESUPUESTO_DISPARADOR_MS = 90 * 1000;
const TOPE_DIARIO_MS = 60 * 60 * 1000;
const IGNORADOS_S = 6 * 3600;

/* ============================================================
   INSTALACIÓN — se corren a mano desde el editor, una vez
   ============================================================ */

/* Crea las hojas, guarda quién es el dueño y deja el disparador.
   CLIENT_ID es el «ID de cliente» de OAuth de la página (README, paso 3):
   no es secreto, pero el backend solo acepta tokens emitidos para él. */
function instalar() {
  const props = PropertiesService.getScriptProperties();
  const dueno = Session.getEffectiveUser().getEmail();
  if (!dueno) throw new Error('No se pudo leer tu correo: autoriza el script y vuelve a correr instalar()');
  props.setProperty('PROPIETARIO', dueno.toLowerCase());
  Object.keys(HOJAS).forEach(hoja_);
  sembrar_();
  programarDisparador();
  console.log('Listo. Dueño: ' + dueno + '. Falta: definir CLIENT_ID con definirClienteId("...")');
}

/* Deja un solo disparador de procesarCorreos, cada CADA_MIN minutos. Lo
   llama instalar(); se corre a mano para cambiar la frecuencia de una
   planilla ya instalada. */
function programarDisparador() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'procesarCorreos')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('procesarCorreos').timeBased().everyMinutes(CADA_MIN).create();
  console.log('Disparador: procesarCorreos cada ' + CADA_MIN + ' minutos');
}

function definirClienteId(id) {
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(String(id || ''))) throw new Error('Eso no parece un ID de cliente de OAuth');
  PropertiesService.getScriptProperties().setProperty('CLIENT_ID', id);
  console.log('CLIENT_ID guardado');
}

/* Ensayo: lee los correos y escribe en la hoja «Ensayo» qué haría con cada
   uno — sin registrar nada, sin borrar nada y sin mover el cursor. Es la
   prueba de los lectores contra tus correos reales antes de soltarlos. */
function ensayo() {
  const r = procesar_({ ensayo: true, presupuestoMs: 5 * 60 * 1000 });
  console.log(JSON.stringify(r.resumen));
}

/* Vuelve a importar todo desde «desde» (Config). Lo ya registrado no se
   duplica: la bitácora Correos lo salta por id. */
function reiniciarImportacion() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('PASADA');
  props.deleteProperty('ULTIMA');
  console.log('Listo: la próxima pasada importa desde ' + leerConfig_().desde);
}

/* Aplica «cuentas_externas» (Config) a lo que ya estaba registrado: los
   traspasos desde o hacia esas cuentas que entraron como «Entre mis cuentas»
   pasan a ingreso o gasto. El lector de cada movimiento sale de la bitácora
   Correos. Se puede correr varias veces: lo ya reclasificado no se toca. */
function reclasificarExternas() {
  const cfg = leerConfig_();
  const ctx = { titular: cfg.titular || '', externas: cfg.cuentas_externas || '' };
  const lector = {};
  leer_('correos').forEach((c) => { lector[String(c.gmail_id)] = String(c.lector); });
  let n = 0;
  conBloqueo_(() => {
    leer_('movimientos').forEach((m) => {
      if (m.origen !== 'correo' || m.tipo !== 'interna') return;
      const antes = m.tipo + '|' + m.categoria;
      externa_(m, ctx, lector[String(m.gmail_id)] || '');
      if (m.tipo + '|' + m.categoria !== antes) { actualizar_('movimientos', 'id', m.id, { tipo: m.tipo, categoria: m.categoria }); n++; }
    });
  });
  console.log(n + ' movimiento(s) reclasificados con cuentas_externas = «' + ctx.externas + '»');
}

/* Aplica «vendedores_cripto» (Config) a lo ya registrado: la transferencia
   a un vendedor de Binance P2P que entró como gasto pasa a «Compra de
   cripto» (interna). Se puede correr varias veces. */
function reclasificarCripto() {
  const ctx = { vendedores: leerConfig_().vendedores_cripto || '' };
  let n = 0;
  conBloqueo_(() => {
    leer_('movimientos').forEach((m) => {
      if (m.origen !== 'correo') return;
      const antes = m.tipo + '|' + m.categoria;
      p2p_(m, ctx);
      if (m.tipo + '|' + m.categoria !== antes) { actualizar_('movimientos', 'id', m.id, { tipo: m.tipo, categoria: m.categoria }); n++; }
    });
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
    pasada: props.getProperty('PASADA'), consulta: q, hilosPrimeraPagina: hilos.length, correosBancariosPrimeraPagina: bancarios,
  }, null, 2));
}

/* ============================================================
   PROCESAMIENTO DE CORREOS
   ============================================================ */

function procesarCorreos() {
  const props = PropertiesService.getScriptProperties();
  const hoy = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd');
  const uso = JSON.parse(props.getProperty('USO') || 'null') || {};
  const usado = uso.dia === hoy ? Number(uso.ms) || 0 : 0;
  if (usado >= TOPE_DIARIO_MS) { console.log('Tope diario de ' + TOPE_DIARIO_MS / 60000 + ' min alcanzado: sigue mañana'); return; }
  const t0 = Date.now();
  try {
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
    const reglas = leer_('reglas').filter((r) => r.patron);
    const vistos = new Set(leer_('correos').map((f) => String(f.gmail_id)));
    // Lo ignorado no queda en la bitácora: sin esto se volvería a abrir en
    // cada pasada mientras siga dentro del solape. El ensayo debe verlo todo.
    const cache = CacheService.getScriptCache();
    const ignorados = new Set(op.ensayo ? [] : JSON.parse(cache.get('IGNORADOS') || '[]'));
    const recientes = leer_('movimientos').slice(-500);
    const borrar = !op.ensayo && String(cfg.borrar_correos).toLowerCase() === 'si';
    const props = PropertiesService.getScriptProperties();

    // `base` es el «desde» de Config con que empezó la importación. Si
    // cambia (o la pasada guardada es de antes de que existiera `base`), se
    // vuelve a importar desde la fecha nueva: lo ya registrado se salta por id.
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

      hilos.forEach((hilo) => hilo.getMessages().forEach((msg) => {
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
      }));

      if (!op.ensayo) {
        // Primero la hoja, después la papelera. Si algo falla al escribir,
        // se lanza antes de tocar un solo correo.
        escribir_(lote);
        SpreadsheetApp.flush();
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
      props.setProperty('PASADA', JSON.stringify({ base, desde: String(pasada.comenzo - SOLAPE_S), inicio: 0, comenzo: Math.floor(Date.now() / 1000) }));
      props.setProperty('ULTIMA', new Date().toISOString());
    } else {
      props.setProperty('PASADA', JSON.stringify(Object.assign(pasada, { inicio })));
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

function escribir_(lote) {
  agregarFilas_('movimientos', lote.movimientos);
  agregarFilas_('inversiones', lote.inversiones);
  agregarFilas_('revisar', lote.revisar);
  agregarFilas_('correos', lote.correos);
}

function escribirEnsayo_(filas) {
  const ss = SpreadsheetApp.getActive();
  const h = ss.getSheetByName(NOMBRES_HOJA.ensayo) || ss.insertSheet(NOMBRES_HOJA.ensayo);
  h.clearContents();
  const cab = ['fecha', 'remitente', 'asunto', 'resultado', 'tipo', 'monto', 'contraparte', 'categoria', 'banco', 'lector', 'motivo'];
  const datos = [cab].concat(filas.map((f) => cab.map((k) => celda_(f[k] == null ? '' : f[k]))));
  h.getRange(1, 1, datos.length, cab.length).setValues(datos);
}

/* ============================================================
   API HTTP
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
    if (err instanceof ErrorVisible) return json_({ ok: false, error: err.message });
    console.error(err && err.stack || err);
    return json_({ ok: false, error: 'Error interno' });
  }
}

class ErrorVisible extends Error {}
function falla_(msg) { throw new ErrorVisible(msg); }

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

/* ============================================================
   ACCIONES (todas exigen la identidad del dueño)
   ============================================================ */

const ACCIONES = {
  datos: () => ({
    movimientos: leer_('movimientos').map(limpiarMov_),
    inversiones: leer_('inversiones'),
    revisar: leer_('revisar').filter((r) => r.estado === 'pendiente'),
    presupuestos: leer_('presupuestos'),
    reglas: leer_('reglas'),
    estado: estado_(),
  }),

  agregar: (b) => conBloqueo_(() => {
    const m = validarMov_(b.mov || {});
    Object.assign(m, { id: nuevoId_('M'), origen: 'manual', gmail_id: '', registrado: ahora_() });
    agregarFilas_('movimientos', [m]);
    return { mov: limpiarMov_(m) };
  }),

  /* Cambiar tipo o categoría. Con `regla: true` además se guarda la regla
     «esta contraparte → esta categoría» y se aplica a los movimientos que ya
     tenían la misma contraparte: así se corrige una vez, no cien. */
  editar: (b) => conBloqueo_(() => {
    const id = texto_(b.id, 40);
    const cambios = {};
    if (b.tipo != null) { if (TIPOS.indexOf(b.tipo) === -1) falla_('Tipo no válido'); cambios.tipo = b.tipo; }
    if (b.categoria != null) cambios.categoria = texto_(b.categoria, 40) || 'Otros';
    if (b.nota != null) cambios.nota = texto_(b.nota, 200);
    // Vacío = que vuelva a contar en su fecha real. Vale para todo origen:
    // lo típico es un depósito del banco que llegó antes de tiempo.
    if (b.fecha_contable != null) cambios.fecha_contable = b.fecha_contable === '' ? '' : fechaValida_(b.fecha_contable).slice(0, 10);
    const filas = leer_('movimientos');
    const m = filas.find((f) => String(f.id) === id);
    if (!m) falla_('No existe ese movimiento');
    if (m.origen === 'manual') {
      if (b.monto != null) cambios.monto = enteroPositivo_(b.monto);
      if (b.contraparte != null) cambios.contraparte = texto_(b.contraparte, 80);
      if (b.fecha != null) cambios.fecha = fechaValida_(b.fecha);
    }
    let aplicados = 0;
    if (b.regla && cambios.categoria && m.contraparte) {
      agregarFilas_('reglas', [{ patron: m.contraparte, categoria: cambios.categoria, tipo: cambios.tipo || '' }]);
      const k = clave_(m.contraparte);
      filas.forEach((f) => {
        if (String(f.id) !== id && clave_(f.contraparte) === k) {
          actualizar_('movimientos', 'id', f.id, Object.assign({ categoria: cambios.categoria }, cambios.tipo ? { tipo: cambios.tipo } : {}));
          aplicados++;
        }
      });
    }
    actualizar_('movimientos', 'id', id, cambios);
    return { aplicados };
  }),

  eliminar: (b) => conBloqueo_(() => {
    const id = texto_(b.id, 40);
    if (!borrarFila_('movimientos', 'id', id)) falla_('No existe ese movimiento');
    // La bitácora de Correos queda: impide que el mismo correo (si sigue en
    // la papelera) vuelva a entrar en la próxima pasada.
    return {};
  }),

  /* Decidir un «Por revisar»: registrarlo (con los datos corregidos a mano)
     o descartarlo. Registrar lo trata como cualquier correo leído: queda
     el movimiento y el correo va a la papelera si borrar_correos = si. */
  revisar: (b) => conBloqueo_(() => {
    const gid = texto_(b.gmail_id, 40);
    const fila = leer_('revisar').find((r) => String(r.gmail_id) === gid && r.estado === 'pendiente');
    if (!fila) falla_('Ya no está pendiente');
    const cfg = leerConfig_();
    let ref = '';
    if (b.decision === 'registrar') {
      const fecha = esFecha_(fila.fecha) ? fmtFecha_(fila.fecha) : String(fila.fecha);
      const m = validarMov_(Object.assign({ fecha, banco: fila.banco, contraparte: fila.contraparte, tipo: fila.tipo, monto: fila.monto }, b.mov || {}));
      Object.assign(m, { id: nuevoId_('M'), origen: 'correo', gmail_id: gid, registrado: ahora_() });
      agregarFilas_('movimientos', [m]);
      ref = m.id;
    } else if (b.decision !== 'descartar') {
      falla_('Decisión no válida');
    }
    actualizar_('revisar', 'gmail_id', gid, { estado: b.decision === 'registrar' ? 'registrado' : 'descartado' });
    actualizar_('correos', 'gmail_id', gid, { resultado: b.decision === 'registrar' ? 'registrado' : 'descartado', referencia: ref });
    SpreadsheetApp.flush();
    let borrado = false;
    if ((b.decision === 'registrar' && String(cfg.borrar_correos).toLowerCase() === 'si') || (b.decision === 'descartar' && b.borrar === true)) {
      try { const msg = GmailApp.getMessageById(gid); if (msg && !msg.isInTrash()) msg.moveToTrash(); borrado = true; }
      catch (e) { console.error('No se pudo borrar ' + gid + ': ' + e); }
    }
    return { borrado, id: ref };
  }),

  presupuesto: (b) => conBloqueo_(() => {
    const cat = texto_(b.categoria, 40);
    if (!cat) falla_('Falta la categoría');
    const monto = Math.max(0, Math.round(Number(b.monto) || 0));
    borrarFila_('presupuestos', 'categoria', cat);
    if (monto > 0) agregarFilas_('presupuestos', [{ categoria: cat, monto_mensual: monto }]);
    return {};
  }),

  // «Revisar correos ahora» desde la página: la misma pasada del disparador,
  // con menos tiempo para que el navegador no espere minutos.
  sincronizar: () => ({ resumen: procesar_({ ensayo: false, presupuestoMs: 40 * 1000 }).resumen, estado: estado_() }),
};

function estado_() {
  const props = PropertiesService.getScriptProperties();
  const p = JSON.parse(props.getProperty('PASADA') || 'null');
  const cfg = leerConfig_();
  return {
    ultima: props.getProperty('ULTIMA') || '',
    importando: !!(p && p.inicio > 0),
    borrar: String(cfg.borrar_correos).toLowerCase() === 'si',
    titular: cfg.titular || '',
  };
}

/* ---------- validación ---------- */

function validarMov_(x) {
  const tipo = String(x.tipo || 'gasto');
  if (TIPOS.indexOf(tipo) === -1) falla_('Tipo no válido');
  const m = {
    fecha: fechaValida_(x.fecha), banco: texto_(x.banco, 40) || 'Efectivo', producto: texto_(x.producto, 40) || 'Cuenta',
    tipo, monto: enteroPositivo_(x.monto), moneda: 'CLP', monto_original: '', contraparte: texto_(x.contraparte, 80),
    categoria: texto_(x.categoria, 40), cuotas: '', detalle: texto_(x.detalle, 200), nota: texto_(x.nota, 200),
    fecha_contable: x.fecha_contable ? fechaValida_(x.fecha_contable).slice(0, 10) : '',
  };
  if (!m.categoria) categorizar_(m, leer_('reglas').filter((r) => r.patron));
  return m;
}

function texto_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }

function enteroPositivo_(v) {
  const n = Math.round(Number(v));
  if (!isFinite(n) || n <= 0 || n > 1e10) falla_('Monto no válido');
  return n;
}

function fechaValida_(v) {
  const s = String(v || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(s);
  if (!m) falla_('Fecha no válida (AAAA-MM-DD)');
  const f = armarFecha_(m[1], m[2], m[3], m[4] || 12, m[5] || 0);
  if (!f) falla_('Fecha no válida');
  return f;
}

// Sheets devuelve fechas como Date si la celda se reinterpretó; la página
// siempre recibe texto 'AAAA-MM-DD HH:MM'.
function limpiarMov_(f) {
  const o = Object.assign({}, f);
  if (esFecha_(o.fecha)) o.fecha = fmtFecha_(o.fecha);
  // Solo el día: deCelda_ ya la devuelve como 'AAAA-MM-DD HH:MM' si Sheets la convirtió.
  o.fecha_contable = String(o.fecha_contable || '').slice(0, 10);
  o.monto = Number(o.monto) || 0;
  delete o.gmail_id;
  return o;
}

/* ============================================================
   HOJA
   ============================================================ */

const cabeceraAlDia_ = {};

function hoja_(nombre) {
  const ss = SpreadsheetApp.getActive();
  let h = ss.getSheetByName(NOMBRES_HOJA[nombre]);
  // Planilla creada antes de que HOJAS ganara una columna: se le escribe el
  // encabezado que falta, o la columna nueva existiría sin nombre. Una vez por
  // ejecución y hoja.
  if (h && !cabeceraAlDia_[nombre] && h.getLastRow() >= 1) {
    cabeceraAlDia_[nombre] = true;
    const ultima = HOJAS[nombre].length;
    if (!h.getRange(1, ultima, 1, 1).getValues()[0][0]) h.getRange(1, 1, 1, ultima).setValues([HOJAS[nombre]]).setFontWeight('bold');
  }
  if (!h) {
    h = ss.insertSheet(NOMBRES_HOJA[nombre]);
    h.getRange(1, 1, 1, HOJAS[nombre].length).setValues([HOJAS[nombre]]).setFontWeight('bold');
    h.setFrozenRows(1);
    // La fecha como texto: si Sheets la convierte a fecha, la zona horaria
    // de la planilla puede correrla un día.
    const col = HOJAS[nombre].indexOf('fecha');
    if (col !== -1) h.getRange(2, col + 1, h.getMaxRows() - 1, 1).setNumberFormat('@');
  }
  return h;
}

function sembrar_() {
  if (!leer_('config').length) agregarFilas_('config', CONFIG_BASE.map((c) => ({ clave: c[0], valor: c[1] })));
  if (!leer_('reglas').length) agregarFilas_('reglas', REGLAS_BASE.map((r) => ({ patron: r[0], categoria: r[1], tipo: r[2] || '' })));
}

/* Columnas que deben quedar como TEXTO. Sheets convierte por su cuenta lo
   que parece fecha («2026/01/01», «2026-09-18 00:57») y lo que parece número
   (un id de Gmail hexadecimal como «18012345e6789012» se vuelve 1,8e+22 y se
   pierde). Se escriben con un apóstrofo delante, que fuerza texto y no se ve.
   Así se rompió la primera instalación: «desde» quedó como fecha y la
   búsqueda en Gmail salió «after:Thu Jan 01 2026…», sin resultados. */
const COLUMNAS_TEXTO = { fecha: 1, fecha_contable: 1, gmail_id: 1, referencia: 1, registrado: 1, procesado: 1, valor: 1, patron: 1, id: 1 };

function aCelda_(k, v) {
  v = celda_(v == null ? '' : v);
  if (COLUMNAS_TEXTO[k] && typeof v === 'string' && v !== '' && v.charAt(0) !== "'") return "'" + v;
  return v;
}

// Lo que ya quedó convertido en planillas creadas antes de lo anterior.
function deCelda_(k, v) {
  if (esFecha_(v)) return k === 'valor' ? Utilities.formatDate(v, 'America/Santiago', 'yyyy/MM/dd') : fmtFecha_(v);
  if (COLUMNAS_TEXTO[k] && typeof v === 'number') return String(v);
  return v;
}

function leer_(nombre) {
  const h = hoja_(nombre);
  const n = h.getLastRow();
  if (n < 2) return [];
  const cab = HOJAS[nombre];
  return h.getRange(2, 1, n - 1, cab.length).getValues()
    .map((fila) => { const o = {}; cab.forEach((k, i) => { o[k] = deCelda_(k, fila[i]); }); return o; });
}

function agregarFilas_(nombre, objs) {
  if (!objs || !objs.length) return;
  const h = hoja_(nombre);
  const cab = HOJAS[nombre];
  const filas = objs.map((o) => cab.map((k) => aCelda_(k, o[k])));
  h.getRange(h.getLastRow() + 1, 1, filas.length, cab.length).setValues(filas);
}

function actualizar_(nombre, campo, valor, cambios) {
  const h = hoja_(nombre);
  const cab = HOJAS[nombre];
  const n = h.getLastRow();
  if (n < 2) return false;
  const col = cab.indexOf(campo);
  const vals = h.getRange(2, col + 1, n - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) !== String(valor)) continue;
    Object.keys(cambios).forEach((k) => {
      const c = cab.indexOf(k);
      if (c !== -1) h.getRange(i + 2, c + 1).setValue(aCelda_(k, cambios[k]));
    });
    return true;
  }
  return false;
}

function borrarFila_(nombre, campo, valor) {
  const h = hoja_(nombre);
  const n = h.getLastRow();
  if (n < 2) return false;
  const col = HOJAS[nombre].indexOf(campo);
  const vals = h.getRange(2, col + 1, n - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === String(valor)) { h.deleteRows(i + 2, 1); return true; }
  }
  return false;
}

function leerConfig_() {
  const o = {};
  leer_('config').forEach((f) => { o[String(f.clave)] = String(f.valor); });
  CONFIG_BASE.forEach((c) => { if (!(c[0] in o)) o[c[0]] = c[1]; });
  return o;
}

/* Neutraliza la inyección de fórmulas: el asunto de un correo lo escribe un
   tercero, y un «=IMPORTXML(…)» en una celda se ejecutaría. El apóstrofo
   inicial lo fuerza a texto y no se ve. */
function celda_(v) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

function conBloqueo_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) falla_('Se están procesando correos, intenta en un momento');
  try {
    const r = fn();
    SpreadsheetApp.flush();
    return r;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- utilidades ---------- */

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
