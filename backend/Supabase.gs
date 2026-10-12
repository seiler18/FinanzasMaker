/* ============================================================
   Supabase desde Apps Script: el almacenamiento del trabajador (v2).

   Hasta el hito 0010 el trabajador escribía en las hojas de la planilla. Ahora
   escribe en la base de Supabase por su API REST (PostgREST), con la clave
   secreta. Esa clave se salta la RLS: por eso CADA consulta a una tabla de un
   usuario lleva `usuario=eq.<SUPABASE_USUARIO>` puesto aquí, no en quien
   llama, y cada fila que se inserta lleva su `usuario`.

   Propiedades del script (Configuración del proyecto → Propiedades):
     SUPABASE_URL      https://<ref>.supabase.co
     SUPABASE_CLAVE    una clave secreta (sb_secret_…), creada solo para esto
     SUPABASE_USUARIO  el id (uuid) del dueño en auth.users
   La clave no va en el código ni en el repositorio (SECURITY.md).

   Todo error de la API LANZA. Es lo que sostiene «escribir antes de borrar»:
   si la base no confirmó la fila, la excepción corta la pasada antes de que
   un solo correo llegue a la papelera.
   ============================================================ */

/* Columnas de cada tabla, con su tipo y largo máximo (los mismos CHECK de
   supabase/migrations/). Sirven para convertir lo que arman los lectores
   (texto vacío donde la base espera null, números como texto) y para recortar
   lo largo: un texto de más haría fallar el lote completo en cada pasada, y
   el trabajador quedaría atascado reintentando lo mismo. */
const COLUMNAS = {
  movimientos: { id: ['texto', 40], fecha: ['texto', 16], banco: ['texto', 80], producto: ['texto', 80], tipo: ['texto', 20],
    monto: ['entero'], moneda: ['texto', 10], monto_original: ['numero'], contraparte: ['texto', 200], categoria: ['texto', 80],
    cuotas: ['entero'], detalle: ['texto', 500], nota: ['texto', 500], origen: ['texto', 20], gmail_id: ['texto', 40],
    registrado: ['texto', 20], fecha_contable: ['texto', 10] },
  inversiones: { id: ['texto', 40], fecha: ['texto', 16], plataforma: ['texto', 80], operacion: ['texto', 40], instrumento: ['texto', 200],
    monto: ['numero', 0, 0], moneda: ['texto', 10], detalle: ['texto', 500], gmail_id: ['texto', 40], registrado: ['texto', 20] },
  revisar: { gmail_id: ['texto', 40], fecha: ['texto', 20], remitente: ['texto', 200], asunto: ['texto', 500], motivo: ['texto', 300],
    tipo: ['texto', 20], monto: ['numero'], contraparte: ['texto', 200], banco: ['texto', 80], extracto: ['texto', 1000],
    estado: ['texto', 20], borrar_correo: ['bool'], correo_borrado: ['bool'] },
  correos: { gmail_id: ['texto', 40], fecha: ['texto', 20], remitente: ['texto', 200], asunto: ['texto', 500], resultado: ['texto', 20],
    lector: ['texto', 60], referencia: ['texto', 40], procesado: ['texto', 20] },
  reglas: { patron: ['texto', 200], categoria: ['texto', 80], tipo: ['texto', 20] },
  presupuestos: { categoria: ['texto', 80], monto_mensual: ['entero'] },
  config: { clave: ['texto', 40], valor: ['texto', 500] },
  estado_trabajador: { ultima: ['crudo'], importando: ['bool'], resumen: ['crudo'], ultima_acciones: ['crudo'] },
  acciones_operaciones: { fecha: ['texto', 10], tipo: ['texto', 20], activo: ['texto', 200], ticker: ['texto', 20], cantidad: ['numero'],
    usd: ['numero'], clp: ['numero'], tipo_cambio: ['numero'], comision_clp: ['numero'], fuente: ['texto', 40], gmail_id: ['opcional', 40] },
  acciones_alertas: { fecha: ['crudo'], tipo: ['texto', 60], detalle: ['texto', 4000] },
  acciones_precios: { ticker: ['texto', 20], nombre: ['texto', 200], precio: ['numero'], cambio_dia: ['numero'], actualizado: ['crudo'] },
  acciones_mapa: { nombre: ['texto', 200], ticker: ['texto', 20] },
};

// De todos, sin dueño: el precio de VOO no es dato de nadie (migración 0005).
const GLOBALES = { acciones_precios: true, acciones_mapa: true };

function sb_() {
  const p = PropertiesService.getScriptProperties();
  const url = p.getProperty('SUPABASE_URL');
  const clave = p.getProperty('SUPABASE_CLAVE');
  const usuario = p.getProperty('SUPABASE_USUARIO');
  if (!url || !clave || !usuario) throw new Error('Faltan SUPABASE_URL, SUPABASE_CLAVE o SUPABASE_USUARIO en las propiedades del script (README, «v2: el trabajador»)');
  return { url: url.replace(/\/+$/, ''), clave, usuario };
}

/* Una petición a PostgREST. Solo `apikey`: con las claves nuevas
   (sb_secret_…) el gateway arma él la identidad de service_role. */
function sbPedir_(metodo, tabla, consulta, cuerpo, prefer) {
  const c = sb_();
  const op = { method: metodo, muteHttpExceptions: true, headers: { apikey: c.clave } };
  if (prefer) op.headers.Prefer = prefer;
  if (cuerpo !== undefined) { op.contentType = 'application/json'; op.payload = JSON.stringify(cuerpo); }
  const r = UrlFetchApp.fetch(c.url + '/rest/v1/' + tabla + (consulta ? '?' + consulta : ''), op);
  const codigo = r.getResponseCode();
  const texto = r.getContentText();
  if (codigo < 200 || codigo >= 300) {
    let msg = texto;
    try { const j = JSON.parse(texto); msg = j.message || texto; } catch (e) { /* no era JSON */ }
    throw new Error('Supabase ' + metodo.toUpperCase() + ' ' + tabla + ' → ' + codigo + ': ' + String(msg).slice(0, 300));
  }
  return texto ? JSON.parse(texto) : null;
}

/* El filtro del dueño, delante de cualquier otro. */
function sbConsulta_(tabla, consulta) {
  const partes = [];
  if (!GLOBALES[tabla]) partes.push('usuario=eq.' + sb_().usuario);
  if (consulta) partes.push(consulta);
  return partes.join('&');
}

// eq/in con el valor escapado para la URL. Los ids de Gmail son hex, pero un
// patrón de regla o un nombre de comercio pueden traer comas o paréntesis.
function sbEq_(col, v) { return col + '=eq.' + encodeURIComponent(String(v)); }
function sbIn_(col, valores) {
  // Se codifica la lista entera, comillas incluidas: PostgREST decodifica la
  // URL antes de leer ("a","b"), y UrlFetchApp rechaza comillas sueltas.
  const lista = valores.map((v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',');
  return col + '=in.' + encodeURIComponent('(' + lista + ')');
}

/* Todas las filas que calzan, de a 1000 (el tope de PostgREST por respuesta). */
function sbLeer_(tabla, consulta) {
  const out = [];
  for (let desde = 0; ; desde += 1000) {
    const q = sbConsulta_(tabla, consulta) + '&limit=1000&offset=' + desde;
    const filas = sbPedir_('get', tabla, q) || [];
    Array.prototype.push.apply(out, filas);
    if (filas.length < 1000) return out;
  }
}

/* Inserta (o, con `conflicto`, inserta-o-actualiza / inserta-si-no-está).
   De a 500 filas por petición. */
function sbInsertar_(tabla, objs, opciones) {
  if (!objs || !objs.length) return;
  const o = opciones || {};
  const filas = objs.map((x) => aFila_(tabla, x));
  // PostgREST rechaza un lote cuyas filas no traen las mismas claves («All
  // object keys must match»). Con `columns` (la unión) y missing=default, lo
  // que una fila no trae toma el valor por defecto de la columna.
  const columnas = {};
  filas.forEach((f) => Object.keys(f).forEach((k) => { columnas[k] = true; }));
  let prefer = 'return=minimal,missing=default';
  const partes = ['columns=' + Object.keys(columnas).join(',')];
  if (o.conflicto) {
    prefer += ',resolution=' + (o.ignorar ? 'ignore-duplicates' : 'merge-duplicates');
    partes.push('on_conflict=' + o.conflicto);
  }
  const consulta = partes.join('&');
  for (let i = 0; i < filas.length; i += 500) sbPedir_('post', tabla, consulta, filas.slice(i, i + 500), prefer);
}

function sbActualizar_(tabla, consulta, cambios) {
  sbPedir_('patch', tabla, sbConsulta_(tabla, consulta), aFila_(tabla, cambios, true), 'return=minimal');
}

/* Lo que arma el código (con '' donde no hay dato) → lo que acepta la base. */
function aFila_(tabla, obj, parcial) {
  const cols = COLUMNAS[tabla];
  if (!cols) throw new Error('Tabla desconocida: ' + tabla);
  const fila = {};
  Object.keys(cols).forEach((k) => {
    if (!(k in obj)) return;
    const tipo = cols[k][0];
    const max = cols[k][1];
    const v = obj[k];
    if (tipo === 'texto') fila[k] = String(v == null ? '' : v).slice(0, max);
    // Texto que, vacío, es null: un `unique` admite muchos null pero un solo ''.
    else if (tipo === 'opcional') fila[k] = v == null || v === '' ? null : String(v).slice(0, max);
    else if (tipo === 'entero') fila[k] = v === '' || v == null || !isFinite(Number(v)) ? null : Math.round(Number(v));
    else if (tipo === 'numero') fila[k] = v === '' || v == null || !isFinite(Number(v)) ? (cols[k].length > 2 ? cols[k][2] : null) : Number(v);
    else if (tipo === 'bool') fila[k] = v === true || String(v).toLowerCase() === 'true';
    else fila[k] = v;
  });
  if (!parcial && !GLOBALES[tabla]) fila.usuario = sb_().usuario;
  return fila;
}

/* ---------- lo que usa el resto del trabajador ---------- */

function leer_(tabla, consulta) { return sbLeer_(tabla, consulta || ''); }
function agregarFilas_(tabla, objs, opciones) { sbInsertar_(tabla, objs, opciones); }
function actualizar_(tabla, campo, valor, cambios) { sbActualizar_(tabla, sbEq_(campo, valor), cambios); }

function leerConfig_() {
  const o = {};
  leer_('config', 'select=clave,valor').forEach((f) => { o[String(f.clave)] = String(f.valor); });
  CONFIG_BASE.forEach((c) => { if (!(c[0] in o)) o[c[0]] = c[1]; });
  return o;
}

/* Lo que la página muestra en Ajustes («Última revisión completa»). */
function guardarEstado_(cambios) {
  sbInsertar_('estado_trabajador', [cambios], { conflicto: 'usuario' });
}

/* Se corre a mano tras poner las propiedades: confirma que la clave y el
   usuario sirven, sin escribir nada. */
function probarSupabase() {
  const c = sb_();
  const n = sbLeer_('config', 'select=clave').length;
  console.log('Supabase OK: ' + c.url + ' · usuario ' + c.usuario + ' · ' + n + ' clave(s) de configuración');
}
