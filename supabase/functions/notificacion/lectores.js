/* Convierte el aviso de un banco (la notificación del celular) en un
   movimiento. JavaScript plano, sin nada de Deno, para que lo pruebe Node
   (tests/avisos.test.mjs) y lo use la función.

   Es el equivalente de backend/Lectores.gs para lo que llega por el celular,
   y escribe con el mismo vocabulario (banco, producto, tipo) porque un
   movimiento que vino por aviso y su correo tienen que reconocerse como el
   mismo (supabase/migrations/0007_movimientos_desde_avisos.sql).

   leerAviso() devuelve:
     { mov }          un movimiento, todavía sin categoría ni origen
     { ignorar: true } ruido que no aporta (sesión expirada, promociones,
                       códigos de validación, cashback ya acumulado)
     null             un formato que no conozco: el aviso se queda crudo
   Los formatos son los de avisos reales (tests/fixtures-avisos.json). Un
   formato nuevo se suma aquí con su fixture; mientras tanto no se pierde, se
   queda en `notificaciones` como cruda.

   Lo que el aviso no trae NO se inventa: la transferencia recibida de MACH no
   dice quién la envió, así que queda sin contraparte y la completa el correo. */

const IGNORAR = { ignorar: true }
const monto = (s) => {
  const n = Number(String(s ?? '').replace(/\./g, '').replace(/[^\d]/g, ''))
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
const pesos = (t) => monto((/\$\s*([\d.]+)/.exec(t) || [])[1])
const dos = (n) => String(n).padStart(2, '0')

// 'AAAA-MM-DD HH:MM' en hora de Chile, que es como guarda la fecha la tabla.
// Intl con la zona explícita: no depende de la del servidor, que es UTC.
export function fechaChile(ms) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).reduce((o, x) => ({ ...o, [x.type]: x.value }), {})
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

// «SKY AIRLINES BSP          por» → una sola línea, sin el país del final.
const comercio = (s) => String(s || '').replace(/\s+/g, ' ').replace(/\s+(CHL|CL|CHILE)$/i, '').trim()

const RUIDO = [
  /sesi[oó]n expirada/i, /hemos cerrado tu sesi[oó]n/i,
  /c[oó]digo de validaci[oó]n|clave (din[aá]mica|de un solo uso)|c[oó]digo de (seguridad|verificaci[oó]n)/i,
  /eval[uú]a nuestra atenci/i,
  /ganaste tenpesos|tenpesos/i,
  /tus lucas crecen|tasa preferencial/i,
  // El cashback «acumulado» todavía no es plata: llega cuando se retira (y
  // ese correo ya lo lee bciplus-cashback).
  /tu compra tiene cashback|te devolvimos \$/i,
]

// Una `publicada` de más de 30 días atrás o más de 10 minutos en el futuro es el
// reloj del celular mal puesto (lo mismo que decide registrar_notificacion): se
// usa la hora de llegada.
const creible = (ms, ahora) => Number.isSafeInteger(ms) && ms > ahora - 30 * 864e5 && ms < ahora + 10 * 6e4

/* a = { paquete, titulo, texto, texto_largo, publicada (ms o null), recibida (ms) } */
export function leerAviso(a) {
  const r = leer(a)
  // Sin monto no hay movimiento: queda crudo en vez de fallar contra la tabla.
  return r && r.mov && !r.mov.monto ? null : r
}

function leer(a) {
  const titulo = String(a.titulo || '')
  const texto = String(a.texto_largo || '').trim().length > String(a.texto || '').trim().length ? a.texto_largo : a.texto
  const todo = `${titulo}\n${texto}`
  const cuando = creible(a.publicada, a.recibida || Date.now()) ? a.publicada : a.recibida || Date.now()

  if (RUIDO.some((r) => r.test(todo))) return IGNORAR

  // ---------- MACH ----------
  if (a.paquete === 'cl.bci.sismo.mach') {
    const compra = /Compra con Tarjeta de (Cr[eé]dito|D[eé]bito)\s*(Virtual|F[ií]sica)?\s*\**\s*\d{4}\s+en\s+(.+?)\s+por\s+\$\s*([\d.]+)/is.exec(texto)
    if (compra) {
      const credito = /^cr/i.test(compra[1])
      return {
        mov: {
          fecha: fechaChile(cuando), banco: 'MACH', producto: credito ? 'Tarjeta de crédito' : 'Cuenta', tipo: 'gasto',
          monto: monto(compra[4]), contraparte: comercio(compra[3]), cuotas: credito ? 1 : null,
          detalle: compra[2] ? `Tarjeta ${compra[2].toLowerCase()}` : '',
        },
      }
    }
    const recibida = /Has recibido una transferencia por\s+\$\s*([\d.]+)/i.exec(texto)
    if (recibida) {
      return { mov: { fecha: fechaChile(cuando), banco: 'MACH', producto: 'Cuenta', tipo: 'ingreso', monto: monto(recibida[1]), contraparte: '', cuotas: null, detalle: '' } }
    }
    return null
  }

  // ---------- Tenpo ----------
  if (a.paquete === 'com.krealo.tenpo') {
    const compra = /El\s+(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})\s+se realiz[oó] una compra con tu tarjeta de cr[eé]dito por\s+\$\s*([\d.]+)\s+en\s+(.+)$/is.exec(texto)
    if (compra) {
      return {
        mov: {
          // La hora que dice el aviso es la de la compra: manda sobre la de llegada.
          fecha: `${compra[3]}-${compra[2]}-${compra[1]} ${compra[4]}:${compra[5]}`,
          banco: 'Tenpo', producto: 'Tarjeta de crédito', tipo: 'gasto', monto: monto(compra[6]),
          contraparte: comercio(compra[7]), cuotas: 1, detalle: '',
        },
      }
    }
    const enviada = /Tu transferencia por\s+\$\s*([\d.]+)\s+se realiz[oó] de manera exitosa/i.exec(texto)
    if (enviada) {
      return { mov: { fecha: fechaChile(cuando), banco: 'Tenpo', producto: 'Cuenta', tipo: 'gasto', monto: monto(enviada[1]), contraparte: '', cuotas: null, detalle: '' } }
    }
    return null
  }

  return null
}
