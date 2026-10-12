/* Lee el cuerpo que manda el celular. JavaScript plano, sin nada de Deno, para
   que lo pruebe Node (tests/notificacion.test.mjs) y lo use la función.

   Dos formatos:

   - text/plain, el de MacroDroid:
       línea 1   el paquete de la app (com.tenpo.app)
       línea 2   el título de la notificación
       resto     el texto
       «--»      (opcional) desde esa línea en adelante, el texto expandido
     Se eligió en vez de JSON porque MacroDroid pega la «magia de texto» tal
     cual dentro del cuerpo: una comilla o un salto de línea en el aviso del
     banco rompería un JSON escrito a mano, y el aviso se perdería.

   - application/json, para una app propia más adelante:
       { "paquete", "titulo", "texto", "texto_largo" }

   Lanza Error si no hay paquete: sin saber de qué app viene, el aviso no sirve. */

export const LIMITES = { paquete: 120, titulo: 500, texto: 4000, texto_largo: 4000 }

// Fuera los caracteres de control salvo salto de línea y tabulación: Postgres
// no admite \0 en un texto, y el resto solo ensucia.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const limpio = (v, max) => String(v ?? '').replace(CONTROL, '').trim().slice(0, max)

// Si MacroDroid no reconoce un campo, deja el texto de la variable sin
// reemplazar ({not_text_big}); eso no es contenido del banco.
const sinVariable = (s) => (/^\{[a-z_]+\}$/.test(s) ? '' : s)

export function leerCuerpo(bruto, tipo = '') {
  let d
  if (/application\/json/i.test(tipo)) {
    const j = JSON.parse(bruto)
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('JSON no es un objeto')
    d = { paquete: j.paquete, titulo: j.titulo, texto: j.texto, texto_largo: j.texto_largo }
  } else {
    const lineas = String(bruto).replace(/\r\n?/g, '\n').split('\n')
    const corte = lineas.findIndex((l, i) => i >= 2 && l.trim() === '--')
    const cuerpo = corte === -1 ? lineas.slice(2) : lineas.slice(2, corte)
    const largo = corte === -1 ? [] : lineas.slice(corte + 1)
    d = { paquete: lineas[0], titulo: lineas[1], texto: cuerpo.join('\n'), texto_largo: largo.join('\n') }
  }
  const r = {}
  for (const k of Object.keys(LIMITES)) r[k] = sinVariable(limpio(d[k], LIMITES[k]))
  if (!/^[A-Za-z0-9_.]+$/.test(r.paquete)) throw new Error('Paquete no válido')
  return r
}
