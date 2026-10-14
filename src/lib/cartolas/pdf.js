/* Abrir el PDF de una cartola en el navegador.

   - pdf.js se carga recién aquí (import dinámico): quien no sube cartolas no
     lo descarga.
   - El PDF y su clave no salen del navegador. A la base llegan solo los
     movimientos que el dueño elige agregar.
   - El worker de pdf.js se sirve desde la misma página: la CSP no admite
     scripts de otro origen. `isEvalSupported: false`: la CSP tampoco admite
     eval, y para leer texto no hace falta. */
import { trozos } from './trozos.js'

export class ClavePdf extends Error {
  constructor(incorrecta) {
    super(incorrecta ? 'Esa no es la clave del PDF' : 'El PDF tiene clave')
    this.incorrecta = incorrecta
  }
}

/* bytes: ArrayBuffer del archivo. Lanza ClavePdf si falta la clave o no es esa. */
export async function trozosDelPdf(bytes, clave) {
  const pdfjs = await import('pdfjs-dist')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  let doc
  try {
    // pdf.js se queda con el búfer que recibe (lo pasa al worker): se le da una copia
    // para poder reintentar con otra clave.
    doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes.slice(0)), password: clave || undefined,
      isEvalSupported: false, disableFontFace: true, verbosity: 0,
    }).promise
  } catch (e) {
    if (e?.name === 'PasswordException') throw new ClavePdf(e.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD)
    throw new Error('No se pudo abrir el PDF')
  }
  try {
    return await trozos(doc)
  } finally {
    await doc.loadingTask.destroy()
  }
}
