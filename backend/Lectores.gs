/* ============================================================
   LECTORES DE CORREOS BANCARIOS

   Funciones puras: reciben un correo ya aplanado y devuelven qué movimiento
   describe. No tocan Gmail ni la hoja, así que se prueban en Node
   (tests/lectores.test.mjs) sin simular Apps Script.

   Un correo pasa por aquí así:
     { de: 'no-reply@tenpo.cl', asunto: '...', texto: 'cuerpo en una línea',
       fecha: '2026-09-18 00:57' }   ← fecha de Gmail en hora de Chile

   Y sale una de cuatro respuestas:
     { estado: 'ok', lector, mov?, inv? }  → se registra y el correo se borra
     { estado: 'ignorar' }                 → publicidad, cartolas: no se toca
     { estado: 'revisar', motivo, sugerido } → va a «Por revisar»; el correo
                                             NO se borra hasta que lo decidas
     { estado: 'nada' }                    → no parece bancario

   El cuerpo se aplana a una sola línea (plano_) y los datos se sacan entre
   etiquetas («Comercio: … Cuotas:»). Así da igual cómo reparta las líneas
   cada banco: lo que se rompe es que cambie la ETIQUETA, y eso lo detecta
   el lector (devuelve null → «revisar», motivo «formato cambió»).
   ============================================================ */

const TIPOS = ['gasto', 'ingreso', 'interna', 'inversion', 'rescate', 'pago_tarjeta'];
const IGNORAR = { ignorar: true };

/* ---------- normalización ---------- */

// Los correos de marketing rellenan el preheader con U+034F y espacios de
// ancho cero; si no se quitan, «Monto: $ 1.000» no calza con la regex.
function plano_(s) {
  return String(s || '')
    .replace(/[ ͏​-‍⁠﻿]/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTIDADES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó',
  uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', iexcl: '¡', iquest: '¿', deg: '°', ordm: 'º' };

function htmlAtexto_(h) {
  return String(h || '')
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|td|th|tr|li|h\d|table)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTIDADES ? ENTIDADES[n] : m));
}

/* Texto que leen los lectores: la parte de texto plano MÁS el HTML pasado
   a texto. Hacen falta las dos: Copec Pay manda como texto plano solo el
   asunto, y Fintual pone el monto de un retiro («Te transferimos $X») solo
   en el encabezado HTML. Como las etiquetas se buscan por primera aparición,
   repetir el contenido no cambia lo que se extrae. */
function textoCorreo_(plano, html) {
  return plano_(String(plano || '') + ' ' + htmlAtexto_(html));
}

function sinTildes_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// «Jesus EnriqueSeilerVelasquez» y «JESÚS ENRIQUE SEILER» deben compararse
// igual: sin tildes, sin mayúsculas y sin espacios (Tenpo a veces los come).
function clave_(s) {
  return sinTildes_(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* «$ 1.096.130» → 1096130 · «745,30» → 745.3 · «0.41» → 0.41 · «$2220» → 2220 */
function monto_(s) {
  const t = String(s == null ? '' : s).replace(/[^\d.,]/g, '').replace(/[.,]+$/, '');
  if (!t) return null;
  let n;
  if (/,\d{1,2}$/.test(t)) n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = parseInt(t.replace(/\./g, ''), 10);
  else if (/^\d+\.\d{1,2}$/.test(t)) n = parseFloat(t);
  else n = parseInt(t.replace(/[.,]/g, ''), 10);
  return isFinite(n) && n > 0 ? n : null;
}

// Primer monto en pesos que aparece después de `etiqueta` (regex o texto).
function montoTras_(texto, etiqueta) {
  const fuente = etiqueta instanceof RegExp ? etiqueta.source : escaparRegex_(etiqueta);
  const m = new RegExp(fuente + '\\s*:?\\s*(?:CLP)?\\s*\\$\\s?([\\d.]+(?:,\\d{1,2})?)', 'i').exec(texto);
  return m ? monto_(m[1]) : null;
}

function primerMonto_(texto) {
  const m = /\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?/.exec(texto);
  return m ? monto_(m[0]) : null;
}

// Texto entre dos etiquetas: entre_('Comercio: X Cuotas: 1', 'Comercio:', 'Cuotas:') → 'X'
function entre_(texto, desde, hasta) {
  const d = desde instanceof RegExp ? desde.source : escaparRegex_(desde);
  const h = hasta instanceof RegExp ? hasta.source : escaparRegex_(hasta);
  const m = new RegExp(d + '\\s*(.+?)\\s*(?:' + h + ')', 'i').exec(texto);
  return m ? m[1].trim() : '';
}

function escaparRegex_(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ---------- fechas ---------- */

function dosDig_(n) { return (n < 10 ? '0' : '') + n; }

function armarFecha_(a, m, d, hh, mm) {
  a = +a; m = +m; d = +d;
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const h = hh == null ? '' : ' ' + dosDig_(+hh) + ':' + dosDig_(+mm);
  return a + '-' + dosDig_(m) + '-' + dosDig_(d) + (h || ' 00:00');
}

// Fecha escrita en el cuerpo. Tres formatos vistos en los bancos chilenos:
// «2026-09-19 12:40:46» (Copec Pay), «09-12-2025 Hora: 21:09» (Tenpo,
// Rutpay) y «08/04/2024 a las 17:12» / «14/09/2026 - 20:38:40» (BancoEstado, MACH).
function fechaCuerpo_(texto) {
  let m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(texto);
  if (m) return armarFecha_(m[1], m[2], m[3], m[4], m[5]);
  m = /\b(\d{2})[-/](\d{2})[-/](\d{4})(?:\D{1,20}?(\d{2}):(\d{2}))?/.exec(texto);
  if (m) return armarFecha_(m[3], m[2], m[1], m[4], m[5]);
  return '';
}

function diasEntre_(a, b) {
  const t = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.abs(t(a) - t(b)) / 86400000;
}

// La del cuerpo es la hora real de la operación, pero solo se le cree si
// está cerca de la del correo: un «Fecha: 03-12-2025» que llega en septiembre
// es otra fecha del texto (un vencimiento, una promoción), no la operación.
function fechaDe_(c) {
  const f = fechaCuerpo_(c.texto);
  return f && c.fecha && diasEntre_(f, c.fecha) <= 3 ? f : c.fecha;
}

/* ---------- personas ---------- */

// ¿El nombre es del titular? Basta con que contenga todas las palabras del
// titular configurado («Jesus Seiler» → jesus + seiler), pegadas o no.
// «Luis Seiler» no lo es; «JESUS ENRIQUE SEILER VELASQUEZ» sí.
function esPropio_(nombre, titular) {
  const n = clave_(nombre);
  const partes = sinTildes_(titular || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return partes.length > 0 && n.length > 0 && partes.every((p) => n.indexOf(p) !== -1);
}

function transferencia_(sentido, contraparte, ctx) {
  if (esPropio_(contraparte, ctx.titular)) return 'interna';
  return sentido === 'sale' ? 'gasto' : 'ingreso';
}

// «UNIMARC PALOMA SANTIAGO CHL» → sin el país del final, que no aporta.
function comercio_(s) {
  return String(s || '').replace(/\s+(CHL|CL|CHILE)$/i, '').trim();
}

/* ---------- armado ---------- */

function mov_(c, campos) {
  return {
    mov: Object.assign({
      fecha: fechaDe_(c), banco: '', producto: 'Cuenta', tipo: 'gasto', monto: null,
      moneda: 'CLP', monto_original: '', contraparte: '', cuotas: '', detalle: '', categoria: '',
    }, campos),
  };
}

function inv_(c, campos) {
  return {
    inv: Object.assign({ fecha: fechaDe_(c), plataforma: '', operacion: '', instrumento: '', monto: null, moneda: 'CLP', detalle: '' }, campos),
  };
}

function usd_(valor, ctx) {
  return Math.round(valor * (Number(ctx.dolar) || 950));
}

/* ============================================================
   LOS LECTORES — uno por formato de correo.
   `de` se prueba contra el remitente y `asunto` contra el asunto; el primero
   que calza lee. Si `leer` devuelve null es que el formato cambió.
   Para sumar un banco: skill `agregar-banco`.
   ============================================================ */

const LECTORES = [
  /* ----- Tenpo ----- */
  {
    id: 'tenpo-compra-tc', de: /@tenpo(bank)?\.cl$/i, asunto: /compra con tu tarjeta de cr[eé]dito/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto transacción') || montoTras_(c.texto, 'La compra por');
      if (!monto) return null;
      return mov_(c, {
        banco: 'Tenpo', producto: 'Tarjeta de crédito', tipo: 'gasto', monto,
        contraparte: comercio_(entre_(c.texto, 'Comercio:', 'Cuotas:')),
        cuotas: +((/Cuotas:\s*(\d+)/i.exec(c.texto) || [])[1] || 1),
      });
    },
  },
  {
    // Transferencia que TÚ enviaste desde Tenpo.
    id: 'tenpo-transferencia-enviada', de: /@tenpo(bank)?\.cl$/i, asunto: /transferencia exitoso/i,
    leer: (c, ctx) => {
      const monto = montoTras_(c.texto, 'Monto transferencia') || montoTras_(c.texto, 'transferencia por');
      const dest = entre_(c.texto, 'Nombre del destinatario:', /Banco de destino|Rut|N[º°o] cuenta|$/);
      if (!monto) return null;
      return mov_(c, {
        banco: 'Tenpo', tipo: transferencia_('sale', dest, ctx), monto, contraparte: dest,
        detalle: entre_(c.texto, 'Banco de destino:', /N[º°o] cuenta|Tipo de cuenta|$/),
      });
    },
  },
  {
    // «Comprobante de transferencia - Tenpo» trae DOS plantillas distintas:
    //  · «Comprobante de recibo transferencia La transferencia de X por 20.000
    //    a tu cuenta Tenpo fue exitosa» → te llegó plata.
    //  · «Comprobante de transferencia exitosa La transferencia de X por
    //    $20.000 a tu cuenta fue exitosa» → copia de una transferencia que
    //    ya llegó en «Comprobante de transferencia exitoso»: se ignora.
    //  · «Pago por nomina - Tenpo» usa la primera plantilla: es sueldo.
    id: 'tenpo-transferencia', de: /@tenpo(bank)?\.cl$/i, asunto: /^Comprobante de transferencia - Tenpo|Pago por n[oó]mina/i,
    leer: (c, ctx) => {
      const monto = montoTras_(c.texto, 'Monto transferencia') || monto_(entre_(c.texto, / por /, / a tu cuenta/));
      if (!monto) return null;
      if (/recibo transferencia/i.test(c.texto)) {
        const origen = entre_(c.texto, 'La transferencia de', / por /);
        return mov_(c, {
          banco: 'Tenpo', tipo: transferencia_('entra', origen, ctx), monto, contraparte: origen,
          categoria: /n[oó]mina/i.test(c.asunto) ? 'Sueldo' : '',
          detalle: entre_(c.texto, 'Banco de origen:', /N[º°o] cuenta|Tipo de cuenta|Rut|$/),
        });
      }
      // La copia trae el MISMO código de transferencia que el «Comprobante de
      // transferencia exitoso» que llega junto con ella (y a veces un
      // destinatario equivocado): contarla sería contar dos veces.
      return IGNORAR;
    },
  },
  {
    id: 'tenpo-pago-recibido', de: /@tenpo(bank)?\.cl$/i, asunto: /te ha enviado un pago/i,
    leer: (c, ctx) => {
      const monto = montoTras_(c.texto, 'Monto pagado') || montoTras_(c.texto, / por/);
      const quien = entre_(c.texto, 'El pago de', / por /) || entre_(c.texto, 'Enviado por:', 'Monto');
      if (!monto) return null;
      return mov_(c, { banco: 'Tenpo', tipo: transferencia_('entra', quien, ctx), monto, contraparte: quien });
    },
  },
  {
    id: 'tenpo-pago-enviado', de: /@tenpo(bank)?\.cl$/i, asunto: /^Enviaste un pago a /i,
    leer: (c, ctx) => {
      const monto = montoTras_(c.texto, 'Monto pagado') || montoTras_(c.texto, / por/);
      const quien = entre_(c.texto, 'Enviado a:', /Monto pagado|$/) || c.asunto.replace(/^Enviaste un pago a (.+?) por .*$/i, '$1');
      if (!monto) return null;
      return mov_(c, { banco: 'Tenpo', tipo: transferencia_('sale', quien, ctx), monto, contraparte: quien });
    },
  },
  {
    // Pago de una cuenta (agua, luz…) desde la app. El «Método de pago» dice
    // si salió de la tarjeta o de la cuenta.
    id: 'tenpo-pago-servicio', de: /@tenpo(bank)?\.cl$/i, asunto: /^Comprobante de pago exitoso/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto');
      if (!monto) return null;
      const servicio = entre_(c.texto, 'Servicio:', /M[eé]todo de pago|Identificador|$/) || entre_(c.texto, 'Tu cuenta', / est[aá] pagada/);
      const tarjeta = /M[eé]todo de pago:\s*Tarjeta de cr[eé]dito/i.test(c.texto);
      return mov_(c, { banco: 'Tenpo', producto: tarjeta ? 'Tarjeta de crédito' : 'Cuenta', tipo: 'gasto', monto, contraparte: servicio, categoria: 'Servicios' });
    },
  },
  {
    id: 'tenpo-soap', de: /@tenpo(bank)?\.cl$/i, asunto: /SOAP/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto');
      return monto ? mov_(c, { banco: 'Tenpo', tipo: 'gasto', monto, contraparte: 'SOAP', categoria: 'Seguros' }) : null;
    },
  },
  {
    // Pagar la tarjeta no es un gasto nuevo: las compras ya se contaron
    // cuando se hicieron. Contarlo otra vez duplicaría el mes.
    id: 'tenpo-pago-tc', de: /@tenpo(bank)?\.cl$/i, asunto: /pago de tu tarjeta de cr[eé]dito/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'realizaste por') || montoTras_(c.texto, 'Monto transacción');
      if (!monto) return null;
      return mov_(c, { banco: 'Tenpo', producto: 'Tarjeta de crédito', tipo: 'pago_tarjeta', monto, contraparte: 'Tarjeta de crédito Tenpo' });
    },
  },
  { id: 'tenpo-otros', de: /@tenpo(bank)?\.cl$|teamtailor/i, leer: () => IGNORAR },

  /* ----- MACH ----- */
  {
    id: 'mach-compra-tc', de: /@(mail\.)?machbank\.cl$|@somosmach\.com$/i, asunto: /compra con tu tarjeta de cr[eé]dito/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto pagado') || montoTras_(c.texto, 'Monto');
      if (!monto) return null;
      const tipoTarjeta = (/Tipo de tarjeta de cr[eé]dito\s+(F[ií]sica|Virtual)/i.exec(c.texto) || [])[1] || '';
      return mov_(c, {
        banco: 'MACH', producto: 'Tarjeta de crédito', tipo: 'gasto', monto,
        contraparte: comercio_(entre_(c.texto, /Comercio:?/, /Monto/)),
        cuotas: Math.max(1, +((/Cantidad de cuotas:?\s*(\d+)/i.exec(c.texto) || [])[1] || 1)),
        detalle: tipoTarjeta ? 'Tarjeta ' + tipoTarjeta.toLowerCase() : '',
      });
    },
  },
  {
    id: 'mach-compra-debito', de: /@(mail\.)?machbank\.cl$|@somosmach\.com$/i, asunto: /compra con tu (tarjeta|cuenta)/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto pagado') || montoTras_(c.texto, 'Monto');
      if (!monto) return null;
      return mov_(c, { banco: 'MACH', tipo: 'gasto', monto, contraparte: comercio_(entre_(c.texto, /Comercio:?/, /Monto/)) });
    },
  },
  {
    id: 'mach-transferencia-enviada', de: /@(mail\.)?machbank\.cl$|@somosmach\.com$/i, asunto: /^Realizaste una transferencia a /i,
    leer: (c, ctx) => {
      const dest = c.asunto.replace(/^Realizaste una transferencia a /i, '').trim();
      const monto = montoTras_(c.texto, /Monto(?: transferido| total)?/) || primerMonto_(c.texto);
      if (!monto) return null;
      return mov_(c, { banco: 'MACH', tipo: transferencia_('sale', dest, ctx), monto, contraparte: dest });
    },
  },
  {
    // MACH manda el aviso de «recibiste» también a quien ENVÍA, dirigido al
    // destinatario («Hola Fintual. Acabas de recibir…»). Ese no es tuyo: la
    // salida ya la contó «Realizaste una transferencia».
    id: 'mach-transferencia-recibida', de: /@(mail\.)?machbank\.cl$|@somosmach\.com$/i, asunto: /^Recibiste una transferencia de /i,
    leer: (c, ctx) => {
      const saludo = (/\bHola\s+([^\s.,!]+)/i.exec(c.texto) || [])[1] || '';
      const nombre = sinTildes_(String(ctx.titular || '').split(/\s+/)[0]).toLowerCase();
      if (saludo && nombre && sinTildes_(saludo).toLowerCase() !== nombre) return IGNORAR;
      const origen = c.asunto.replace(/^Recibiste una transferencia de /i, '').trim();
      const monto = montoTras_(c.texto, /Monto(?: recibido| transferido)?/) || primerMonto_(c.texto);
      if (!monto) return null;
      return mov_(c, { banco: 'MACH', tipo: transferencia_('entra', origen, ctx), monto, contraparte: origen });
    },
  },
  {
    id: 'mach-giro', de: /@(mail\.)?machbank\.cl$|@somosmach\.com$/i, asunto: /giro/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto') || primerMonto_(c.texto);
      if (!monto) return null;
      return mov_(c, { banco: 'MACH', tipo: 'gasto', monto, contraparte: 'Giro en cajero', categoria: 'Efectivo' });
    },
  },
  {
    id: 'bciplus-cashback', de: /@bciplus\.cl$/i, asunto: /cashback/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto') || montoTras_(c.texto, 'Retiraste');
      if (!monto) return null;
      return mov_(c, { banco: 'MACH', tipo: 'ingreso', monto, contraparte: 'Cashback BCI Plus', categoria: 'Cashback' });
    },
  },
  { id: 'mach-otros', de: /machbank|somosmach|machhelp|bciplus/i, leer: () => IGNORAR },

  /* ----- Copec Pay ----- */
  {
    // «Retiro» en Copec Pay es sacar plata hacia OTRA cuenta (normalmente
    // tuya): es una transferencia, no un giro en efectivo.
    id: 'copecpay-transferencia', de: /@copecpay\.cl$/i, asunto: /(retiro|transferencia) se realiz[oó]/i,
    leer: (c, ctx) => {
      const monto = montoTras_(c.texto, 'Monto');
      const dest = entre_(c.texto, 'Cuenta destino:', /Cuenta (Vista|Corriente|RUT|de Ahorro)|\*{2,}|N[º°] transacci/);
      if (!monto) return null;
      const comentario = entre_(c.texto, 'Comentario:', /Inf[oó]rmate|$/);
      return mov_(c, {
        banco: 'Copec Pay', tipo: transferencia_('sale', dest, ctx), monto, contraparte: dest,
        detalle: [entre_(c.texto, /\*{4}\d{4}/, /N[º°] transacci/), comentario].filter(Boolean).join(' · '),
      });
    },
  },
  {
    // Cargar la billetera desde una tarjeta propia mueve plata entre tus
    // productos; el gasto aparece cuando se usa.
    id: 'copecpay-carga', de: /@copecpay\.cl$/i, asunto: /cargaste dinero/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto');
      if (!monto) return null;
      return mov_(c, { banco: 'Copec Pay', tipo: 'interna', monto, contraparte: 'Carga de saldo', detalle: entre_(c.texto, 'Cuenta origen:', /N[º°] transacci|$/) });
    },
  },
  { id: 'copecpay-otros', de: /copecpay|copec\.cl/i, leer: () => IGNORAR },

  /* ----- Mercado Pago ----- */
  {
    id: 'mercadopago-transferencia', de: /@(info\.)?mercadopago\.(cl|com)$/i, asunto: /transferencia/i,
    leer: (c, ctx) => {
      const monto = montoTras_(c.texto, 'enviamos tu transferencia de');
      if (!monto) return null;
      const dest = entre_(c.texto, 'Nombre y apellido:', /Entidad:|$/);
      return mov_(c, {
        banco: 'Mercado Pago', tipo: transferencia_('sale', dest, ctx), monto, contraparte: dest,
        detalle: entre_(c.texto, 'Entidad:', /N[uú]mero de cuenta|$/),
      });
    },
  },
  {
    // Dos plantillas con el mismo asunto «Se acreditó tu pago»:
    //  · «Sencillito Servicios ya recibió tu pago … Total: $X» → pagaste algo.
    //  · «Se acreditó tu pago por: Ingreso de dinero $X» → cargaste tu cuenta.
    id: 'mercadopago-pago', de: /@(info\.)?mercadopago\.(cl|com)$/i, asunto: /acredit[oó] tu pago|pagaste|tu pago/i,
    leer: (c) => {
      if (/Ingreso de dinero/i.test(c.texto)) {
        const monto = montoTras_(c.texto, 'Ingreso de dinero');
        return monto ? mov_(c, { banco: 'Mercado Pago', tipo: 'interna', monto, contraparte: 'Ingreso de dinero' }) : null;
      }
      const monto = montoTras_(c.texto, 'Total') || primerMonto_(c.texto);
      const quien = (/([^.!]+?) ya recibi[oó] tu pago/i.exec(c.texto) || [])[1] || '';
      if (!monto) return null;
      return mov_(c, { banco: 'Mercado Pago', tipo: 'gasto', monto, contraparte: quien.replace(/^.*?(Pago de cuenta|Jesus[\w\s]*?Velasquez)\s*/i, '').trim() });
    },
  },
  { id: 'mercadopago-otros', de: /mercadopago|mercadolibre/i, leer: () => IGNORAR },

  /* ----- BancoEstado (el remitente de avisos, no el de publicidad) ----- */
  {
    id: 'bancoestado-compra', de: /@correo\.bancoestado\.cl$/i, asunto: /Notificaci[oó]n de compra/i,
    leer: (c, ctx) => {
      const usd = /por\s+USD\s*([\d.,]+)/i.exec(c.texto);
      const monto = usd ? usd_(monto_(usd[1]), ctx) : montoTras_(c.texto, / por/);
      if (!monto) return null;
      const credito = /tarjeta de cr[eé]dito/i.test(c.texto);
      return mov_(c, {
        banco: 'BancoEstado', producto: credito ? 'Tarjeta de crédito' : (/Rutpay/i.test(c.asunto) ? 'Rutpay' : 'Cuenta'),
        tipo: 'gasto', monto, moneda: usd ? 'USD' : 'CLP', monto_original: usd ? monto_(usd[1]) : '',
        contraparte: comercio_(entre_(c.texto, / en /, / asociad[oa]/).replace(/\d{3,}\S*$/, '').trim()),
        detalle: usd ? 'Convertido a pesos con el dólar de Config' : '',
      });
    },
  },
  {
    id: 'bancoestado-giro', de: /@correo\.bancoestado\.cl$/i, asunto: /Notificaci[oó]n de giro/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, / por/);
      return monto ? mov_(c, { banco: 'BancoEstado', tipo: 'gasto', monto, contraparte: 'Giro en cajero', categoria: 'Efectivo' }) : null;
    },
  },
  {
    id: 'bancoestado-entre-mis-cuentas', de: /@correo\.bancoestado\.cl$/i, asunto: /entre mis cuentas/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto Total');
      return monto ? mov_(c, { banco: 'BancoEstado', tipo: 'interna', monto, contraparte: 'Entre mis cuentas', detalle: entre_(c.texto, 'Producto:', /N[º°] de Cuenta|$/) }) : null;
    },
  },
  {
    id: 'bancoestado-transferencia', de: /@correo\.bancoestado\.cl$/i, asunto: /transferencia/i,
    leer: (c, ctx) => {
      const monto = montoTras_(c.texto, /Monto(?: Total| transferido)?/) || primerMonto_(c.texto);
      if (!monto) return null;
      const recibida = /recibi|a su cuenta|a tu cuenta|abono/i.test(c.asunto + ' ' + c.texto.slice(0, 200));
      const quien = entre_(c.texto, /(?:Nombre(?: del)? (?:destinatario|beneficiario|titular)|Destinatario|Origen)\s*:?/, /Rut|Banco|N[º°]|Monto|$/);
      return mov_(c, { banco: 'BancoEstado', tipo: transferencia_(recibida ? 'entra' : 'sale', quien, ctx), monto, contraparte: quien });
    },
  },
  {
    id: 'bancoestado-pago', de: /@correo\.bancoestado\.cl$/i, asunto: /Notificaci[oó]n de pago/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Monto Total') || primerMonto_(c.texto);
      return monto ? mov_(c, { banco: 'BancoEstado', tipo: 'gasto', monto, contraparte: 'Pago BancoEstado', categoria: 'Servicios' }) : null;
    },
  },
  { id: 'bancoestado-otros', de: /bancoestado/i, leer: () => IGNORAR },

  /* ----- Fintual (inversiones) -----
     Un aporte a Fintual sale de un banco, y ese banco ya manda su correo
     («Realizaste una transferencia a Fintual» → tipo inversión). Por eso el
     «Invertimos tus $X» de Fintual va SOLO al registro de inversiones: si
     también fuera movimiento, el aporte se contaría dos veces.
     Los retiros sí son movimiento (rescate): la plata suele llegar a Mercado
     Pago, que no avisa cuando recibes. */
  {
    id: 'fintual-aporte', de: /@fintual\.com$/i, asunto: /^Invertimos tu (plata|beneficio)/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Invertimos tus');
      if (!monto) return null;
      const objetivo = c.asunto.replace(/^Invertimos tu (plata|beneficio)( del Estado)?( en)?\s*/i, '').trim();
      return inv_(c, { plataforma: 'Fintual', operacion: /beneficio/i.test(c.asunto) ? 'bonificacion' : 'aporte', instrumento: objetivo || 'Fintual', monto });
    },
  },
  {
    id: 'fintual-retiro', de: /@fintual\.com$/i, asunto: /^Pagamos tu retiro/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, 'Te transferimos');
      if (!monto) return null;
      const objetivo = c.asunto.replace(/^Pagamos tu retiro de\s*/i, '').trim();
      return Object.assign(
        mov_(c, { banco: 'Fintual', producto: 'Inversión', tipo: 'rescate', monto, contraparte: 'Fintual', detalle: objetivo }),
        inv_(c, { plataforma: 'Fintual', operacion: 'retiro', instrumento: objetivo, monto }));
    },
  },
  {
    id: 'fintual-venta-dolares', de: /@fintual\.com$/i, asunto: /^Recibir[aá]s [\d.]+ pesos chilenos por la venta/i,
    leer: (c) => {
      const monto = montoTras_(c.texto, /a \$|Te transferiremos los/) || monto_((/^Recibir[aá]s ([\d.]+)/i.exec(c.asunto) || [])[1]);
      if (!monto) return null;
      const usd = (/US \$\s?([\d.,]+)/i.exec(c.texto) || [])[1];
      return Object.assign(
        mov_(c, { banco: 'Fintual', producto: 'Inversión', tipo: 'rescate', monto, contraparte: 'Fintual', detalle: usd ? 'Venta de US$' + usd : '' }),
        inv_(c, { plataforma: 'Fintual', operacion: 'venta_dolares', instrumento: 'Dólares', monto }));
    },
  },
  {
    // Cada plantilla tiene su etiqueta del total: en una venta el primer
    // «US $» del cuerpo es el precio por acción, no lo que recibiste.
    id: 'fintual-acciones', de: /@fintual\.com$/i, asunto: /^(Invertiste US|Vendiste [\d,]+ acciones|Recibiste un dividendo)/i,
    leer: (c) => {
      const op = /^Invertiste/i.test(c.asunto) ? 'compra' : /^Vendiste/i.test(c.asunto) ? 'venta' : 'dividendo';
      const patron = { compra: /Invertiste US \$\s?([\d.,]+)/i, venta: /(?:Recibiste|Total)\s+US \$\s?([\d.,]+)/i, dividendo: /por US \$\s?([\d.,]+)/i }[op];
      const usd = monto_((patron.exec(c.asunto + ' ' + c.texto) || [])[1]);
      if (!usd) return null;
      const instrumento = (/(?:acciones de|dividendo de)\s+(.+)$/i.exec(c.asunto) || [])[1] || '';
      return inv_(c, { plataforma: 'Fintual', operacion: op, instrumento: instrumento.trim(), monto: usd, moneda: 'USD' });
    },
  },
  {
    id: 'fintual-compra-dolares', de: /@fintual\.com$/i, asunto: /^Compraste (US|d[oó]lares)/i,
    leer: (c) => {
      const clp = montoTras_(c.texto, 'con tus');
      const usd = (/compraste US \$\s?([\d.,]+)/i.exec(c.texto) || [])[1];
      return clp ? inv_(c, { plataforma: 'Fintual', operacion: 'compra_dolares', instrumento: 'Dólares', monto: clp, detalle: usd ? 'US$' + usd : '' }) : null;
    },
  },
  {
    id: 'fintual-intereses', de: /@fintual\.com$/i, asunto: /generaron intereses/i,
    leer: (c) => {
      const usd = monto_((/US \$\s?([\d.,]+)/i.exec(c.texto) || [])[1]);
      return usd ? inv_(c, { plataforma: 'Fintual', operacion: 'interes', instrumento: 'Dólares', monto: usd, moneda: 'USD' }) : null;
    },
  },
  // «Invertiremos…», «Pediste un retiro…», cartolas y confirmaciones: avisos
  // previos o resúmenes de algo que llega en otro correo.
  { id: 'fintual-otros', de: /fintual/i, leer: () => IGNORAR },

  /* ----- BCI: aviso de abono a la cuenta MACH (MACH es de BCI) ----- */
  {
    id: 'bci-abono', de: /@bci\.cl$/i, asunto: /abono/i,
    leer: (c, ctx) => {
      const monto = monto_((/Monto transferido:?\s*\$?\s*([\d.]+)/i.exec(c.texto) || [])[1]);
      if (!monto) return null;
      const quien = entre_(c.texto, 'Titular de la cuenta de origen:', /Banco de origen|$/) || entre_(c.texto, 'nuestro cliente', /,/);
      return mov_(c, {
        banco: /banco Mach/i.test(c.texto) ? 'MACH' : 'BCI', tipo: transferencia_('entra', quien, ctx), monto, contraparte: quien,
        detalle: entre_(c.texto, 'Comentario para el destinatario:', /Atentamente|Saluda|$/).slice(0, 120),
      });
    },
  },

  /* ----- Banco Falabella: aviso de cortesía al destinatario ----- */
  {
    id: 'falabella-transferencia-recibida', de: /bancofalabella\.com$/i, asunto: /transferencia de fondos recibida/i,
    leer: (c, ctx) => {
      const quien = entre_(c.texto, /nuestro\(a\) cliente/, / ha instruido/);
      const monto = montoTras_(c.texto, /Monto(?: transferido| transferencia)?/) || primerMonto_(c.texto);
      if (!monto) return null;
      return mov_(c, { banco: 'Falabella', tipo: transferencia_('entra', quien, ctx), monto, contraparte: quien, detalle: 'Aviso de Banco Falabella' });
    },
  },
];

/* ============================================================
   RED GENÉRICA — «cualquier correo que tenga que ver con bancos»

   Para bancos sin lector propio (uno que no usas hace tiempo, uno nuevo).
   Es a propósito desconfiada: solo propone, nunca registra ni borra sola.
   Lo que caza va a «Por revisar» y ahí decides.
   ============================================================ */

const FINANCIERAS = /banco|bank|\bbci\b|santander|itau|scotia|security|falabella|ripley|coopeuch|tenpo|mach|mercadopago|copec|cenco|fintual|racional|global66|prex|paypal|btg|bice|consorcio|internacional|tapp|lapolar|sbpay|transbank|webpay|khipu|cmr|abcdin|fpay|mibanco|lider|chek|dale\b|caja/i;
const TRANSACCIONAL = /se ha realizado|realizaste|recibiste|has recibido|te (han )?transferi|transferencia (exitosa|recibida|realizada|enviada|de fondos)|comprobante|abono|cargo en|compra (por|aprobada|realizada|exitosa)|giro|dep[oó]sito|pago (realizado|recibido|exitoso|aprobado)|aviso de (transferencia|cargo|abono)/i;
const PUBLICIDAD = /anular (su |tu )?suscripci|desuscrib|dejar de recibir|mkt\.|marketing|promo|novedades|newsletter|encuesta|ofertas@|preaprobad|participa por|gana un|cup[oó]n|% (de )?(dcto|descuento|off)/i;

function dominio_(correo) {
  return (/@([^>\s]+)/.exec(correo) || [])[1] || '';
}

function nombreBanco_(dom) {
  const partes = dom.toLowerCase().split('.').filter((p) => !/^(cl|com|net|mail|correo|email|info|notificaciones|mensajeria|www)$/.test(p));
  const p = partes[partes.length - 1] || dom;
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// ¿Vale la pena abrir este correo? Remitente con lector propio o de un
// dominio con pinta de banco. Se usa ANTES de leer el cuerpo.
function esRemitenteBancario_(de) {
  de = String(de || '').toLowerCase();
  return LECTORES.some((L) => L.de.test(de)) || FINANCIERAS.test(dominio_(de));
}

function generico_(c) {
  const dom = dominio_(c.de);
  if (!FINANCIERAS.test(dom)) return { estado: 'nada' };
  if (PUBLICIDAD.test(c.de + ' ' + c.asunto) || /anular (su |tu )?suscripci|desuscrib/i.test(c.texto)) return { estado: 'nada' };
  if (!TRANSACCIONAL.test(c.asunto + ' ' + c.texto.slice(0, 600))) return { estado: 'nada' };
  const monto = primerMonto_(c.texto);
  if (!monto) return { estado: 'nada' };
  const entra = /recib|abono|dep[oó]sit|te transfiri|a (su|tu) cuenta|te ha enviado/i.test(c.asunto + ' ' + c.texto.slice(0, 300));
  return {
    estado: 'revisar', motivo: 'Correo bancario sin lector propio',
    sugerido: { fecha: fechaDe_(c), banco: nombreBanco_(dom), tipo: entra ? 'ingreso' : 'gasto', monto, contraparte: '' },
  };
}

/* ============================================================
   PUNTO DE ENTRADA
   ============================================================ */

function leerCorreo_(c, ctx) {
  c = { de: String(c.de || '').toLowerCase(), asunto: plano_(c.asunto), texto: plano_(c.texto), fecha: c.fecha };
  for (let i = 0; i < LECTORES.length; i++) {
    const L = LECTORES[i];
    if (!L.de.test(c.de) || (L.asunto && !L.asunto.test(c.asunto))) continue;
    let r;
    try { r = L.leer(c, ctx || {}); } catch (e) { r = null; }
    if (r === IGNORAR) {
      // Un lector «-otros» no debe tragarse un comprobante de un formato
      // nuevo del mismo banco: si la red genérica lo reconoce, se revisa.
      if (/-otros$/.test(L.id)) {
        const g = generico_(c);
        return g.estado === 'revisar' ? Object.assign(g, { motivo: 'Formato nuevo de ' + g.sugerido.banco }) : { estado: 'ignorar' };
      }
      return { estado: 'ignorar' };
    }
    const valido = r && ((r.mov && r.mov.monto > 0) || (r.inv && r.inv.monto > 0));
    if (!valido) {
      const g = generico_(c);
      return { estado: 'revisar', lector: L.id, motivo: 'El formato cambió (' + L.id + ')', sugerido: (g.sugerido || { fecha: c.fecha, banco: nombreBanco_(dominio_(c.de)), tipo: 'gasto', monto: primerMonto_(c.texto), contraparte: '' }) };
    }
    return Object.assign({ estado: 'ok', lector: L.id }, r);
  }
  return generico_(c);
}

/* ============================================================
   CATEGORÍAS
   Reglas en la hoja «Reglas» (patrón → categoría y, opcional, tipo). La
   primera que calza gana. Un patrón es texto que se busca dentro de la
   contraparte, sin tildes ni mayúsculas.
   ============================================================ */

const REGLAS_BASE = [
  // Cargar Mercado Pago con la tarjeta de crédito no es gastar: la plata
  // cambia de bolsillo. Si en tu caso sí son compras, borra esta regla.
  ['mercado pago santiago', 'Carga de billetera', 'interna'],
  // Lo mismo al cargar Copec Pay con una tarjeta: MACH lo avisa como compra
  // en «COPEC PAY» y Copec Pay como «Cargaste dinero». Va antes que «copec».
  ['copec pay', 'Carga de billetera', 'interna'],
  ['fintual', 'Inversiones', 'inversion'],
  ['btg pactual', 'Inversiones', 'inversion'],
  ['corredores de bolsa', 'Inversiones', 'inversion'],
  ['racional', 'Inversiones', 'inversion'],
  ['unimarc', 'Supermercado'], ['jumbo', 'Supermercado'], ['lider', 'Supermercado'], ['santa isabel', 'Supermercado'],
  ['tottus', 'Supermercado'], ['cugat', 'Supermercado'], ['cencopay-supermercados', 'Supermercado'], ['vikingo', 'Supermercado'],
  ['acuenta', 'Supermercado'], ['mayorista', 'Supermercado'],
  ['copec', 'Combustible'], ['shell', 'Combustible'], ['aramco', 'Combustible'], ['petrobras', 'Combustible'],
  ['jetsmart', 'Viajes'], ['latam', 'Viajes'], ['sky airline', 'Viajes'], ['copa', 'Viajes'], ['turbus', 'Viajes'],
  ['termas', 'Viajes'], ['hotel', 'Viajes'], ['airbnb', 'Viajes'], ['booking', 'Viajes'],
  ['uber eats', 'Comida'], ['rappi', 'Comida'], ['pedidosya', 'Comida'], ['justo', 'Comida'], ['mcdonald', 'Comida'],
  ['starbucks', 'Comida'], ['restaurant', 'Comida'], ['sushi', 'Comida'],
  ['uber', 'Transporte'], ['didi', 'Transporte'], ['cabify', 'Transporte'], ['metro', 'Transporte'], ['autopista', 'Transporte'], ['total tag', 'Transporte'],
  ['farmacia', 'Salud'], ['ahumada', 'Salud'], ['cruz verde', 'Salud'], ['salcobrand', 'Salud'], ['megasalud', 'Salud'],
  ['clinica', 'Salud'], ['dental', 'Salud'],
  ['arriendo', 'Vivienda'], ['neat', 'Vivienda'], ['dividendo', 'Vivienda'], ['gastos comunes', 'Vivienda'],
  ['enel', 'Servicios'], ['suralis', 'Servicios'], ['saesa', 'Servicios'], ['essal', 'Servicios'], ['aguas', 'Servicios'], ['lipigas', 'Servicios'],
  ['gasco', 'Servicios'], ['abastible', 'Servicios'], ['mundo pacifico', 'Servicios'], ['sencillito', 'Servicios'],
  ['wom', 'Servicios'], ['entel', 'Servicios'], ['movistar', 'Servicios'], ['vtr', 'Servicios'], ['claro', 'Servicios'],
  ['tgr', 'Impuestos'], ['sii', 'Impuestos'], ['tesoreria', 'Impuestos'],
  ['netflix', 'Suscripciones'], ['spotify', 'Suscripciones'], ['disney', 'Suscripciones'], ['hbo', 'Suscripciones'],
  ['youtube', 'Suscripciones'], ['google', 'Suscripciones'], ['apple', 'Suscripciones'], ['openai', 'Suscripciones'],
  ['anthropic', 'Suscripciones'], ['claude', 'Suscripciones'], ['amazon prime', 'Suscripciones'], ['paramount', 'Suscripciones'],
  ['mercadolibre', 'Compras'], ['falabella', 'Compras'], ['paris', 'Compras'], ['ripley', 'Compras'], ['decathlon', 'Compras'],
  ['lenovo', 'Compras'], ['sodimac', 'Compras'], ['easy', 'Compras'], ['aliexpress', 'Compras'], ['temu', 'Compras'],
  ['seguro', 'Seguros'], ['soap', 'Seguros'], ['southbridge', 'Seguros'],
  ['giro en cajero', 'Efectivo'],
  ['cashback', 'Cashback'],
];

// Un gasto desde la cuenta (no la tarjeta) hacia algo que se escribe como
// nombre de persona: «Carolina Guzman», «Pedro». Los comercios traen
// mayúsculas con números, sufijos (SPA, LTDA) o asteriscos (TUU*...).
function pareceTransferencia_(mov) {
  const n = String(mov.contraparte || '');
  return mov.tipo === 'gasto' && mov.producto === 'Cuenta' && /^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,}$/.test(n) && !/\b(SPA|LTDA|SA)\b/i.test(n);
}

// Una regla con tipo solo reclasifica gastos e ingresos, y respeta el
// sentido: «fintual → inversión» hace inversión lo que SALE hacia Fintual,
// pero lo que LLEGA desde Fintual es un rescate. Un rescate, una interna o
// un pago de tarjeta ya vienen bien clasificados del lector.
function tipoPorRegla_(actual, regla) {
  if (actual === 'gasto') return regla;
  if (actual === 'ingreso') return regla === 'inversion' ? 'rescate' : regla === 'interna' ? 'interna' : actual;
  return actual;
}

function categorizar_(mov, reglas) {
  const lista = reglas && reglas.length ? reglas : REGLAS_BASE.map((r) => ({ patron: r[0], categoria: r[1], tipo: r[2] || '' }));
  const k = clave_(mov.contraparte);
  if (k && mov.tipo !== 'interna') {
    for (let i = 0; i < lista.length; i++) {
      const p = clave_(lista[i].patron);
      if (!p || k.indexOf(p) === -1) continue;
      if (lista[i].tipo && TIPOS.indexOf(lista[i].tipo) !== -1) mov.tipo = tipoPorRegla_(mov.tipo, lista[i].tipo);
      if (!mov.categoria) mov.categoria = lista[i].categoria;
      break;
    }
  }
  if (!mov.categoria) {
    if (mov.tipo === 'interna') mov.categoria = mov.categoria || 'Entre mis cuentas';
    else if (mov.tipo === 'pago_tarjeta') mov.categoria = 'Pago de tarjeta';
    else if (mov.tipo === 'rescate' || mov.tipo === 'inversion') mov.categoria = 'Inversiones';
    else if (mov.tipo === 'ingreso') mov.categoria = 'Ingresos';
    else if (pareceTransferencia_(mov)) mov.categoria = 'Transferencias a personas';
    else mov.categoria = 'Otros';
  }
  return mov;
}

/* ============================================================
   DUPLICADOS ENTRE BANCOS
   Una misma transferencia puede avisarse dos veces: Banco Falabella avisa
   «te transfirieron» y Tenpo avisa «recibiste». Se considera la misma si:
   mismo tipo y monto, bancos distintos, ≤ 2 días, y un nombre contiene al otro.
   ============================================================ */

function esDuplicado_(mov, existentes) {
  if (mov.tipo !== 'ingreso' && mov.tipo !== 'gasto') return null;
  const k = clave_(mov.contraparte);
  if (k.length < 5) return null;
  for (let i = 0; i < existentes.length; i++) {
    const e = existentes[i];
    if (e.tipo !== mov.tipo || Number(e.monto) !== Number(mov.monto) || e.banco === mov.banco) continue;
    if (diasEntre_(String(e.fecha).slice(0, 10), String(mov.fecha).slice(0, 10)) > 2) continue;
    const ke = clave_(e.contraparte);
    if (ke.length >= 5 && (ke.indexOf(k) !== -1 || k.indexOf(ke) !== -1)) return e;
  }
  return null;
}
