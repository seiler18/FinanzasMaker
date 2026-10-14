/* Los trozos de texto de un documento de pdf.js, página por página, en la
   forma que leen tabla.js y formatos.js: { s, x, y, w }.

   No importa pdf.js: recibe el documento ya abierto. Así lo usan igual la
   página (src/lib/cartolas/pdf.js, con el pdf.js del navegador) y las pruebas
   con PDF reales (tests/cartolas-reales.test.mjs, con el de Node). */
export async function trozos(doc) {
  const paginas = []
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n)
    const { items } = await pagina.getTextContent()
    paginas.push(items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })))
    pagina.cleanup()
  }
  return paginas
}
