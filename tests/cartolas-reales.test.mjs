// Los lectores de cartola contra los PDF reales de la carpeta `cartolas/`
// (ignorada por git: solo existe en la máquina del dueño). Sin la carpeta, se
// salta. Las claves de los PDF se prueban desde `.env` sin imprimirlas, y la
// salida no muestra ningún movimiento: solo formato, cantidad de filas y cuadre.
//
// Cada PDF tiene que, o bien leerse y cuadrar al peso con sus propios totales,
// o bien reconocerse como algo que no se importa (Fintual / Alpaca).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { leerCartola, ErrorCartola } from '../src/lib/cartolas/formatos.js'
import { trozos } from '../src/lib/cartolas/trozos.js'

const RAIZ = join(import.meta.dirname, '..')
const DIR = join(RAIZ, 'cartolas')
const pdfs = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.pdf')) : []
if (!pdfs.length) {
  console.log('cartolas reales: sin la carpeta cartolas/ (normal fuera de la máquina del dueño), se salta')
  process.exit(0)
}

const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
const ENV = join(RAIZ, '.env')
const claves = existsSync(ENV)
  ? [...new Set(readFileSync(ENV, 'utf8').split(/\r?\n/).filter((l) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(l))
    .map((l) => l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')).filter(Boolean))]
  : []

async function abrir(data) {
  for (const password of [undefined, ...claves]) {
    try {
      return await getDocument({ data: data.slice(), password, isEvalSupported: false, verbosity: 0 }).promise
    } catch (e) {
      if (e?.name !== 'PasswordException') throw e
    }
  }
  return null
}

const fallos = []
for (const f of pdfs) {
  const doc = await abrir(new Uint8Array(readFileSync(join(DIR, f))))
  if (!doc) { fallos.push(`✗ ${f}: ninguna clave del .env lo abre`); continue }
  try {
    const c = leerCartola(await trozos(doc))
    const linea = `${f}: ${c.formato}, ${c.filas.length} filas`
    if (c.cuadre.ok) console.log(`  ✓ ${linea}, cuadra`)
    else fallos.push(`✗ ${linea}, NO cuadra: ${c.cuadre.items.filter((i) => i.cartola != null && i.cartola !== i.leido).map((i) => i.que).join(', ')}`)
  } catch (e) {
    if (e instanceof ErrorCartola && !/No reconozco/.test(e.message)) console.log(`  ✓ ${f}: no se importa (${e.message.split(':')[0]})`)
    else fallos.push(`✗ ${f}: ${e.message}`)
  } finally {
    await doc.destroy()
  }
}

if (fallos.length) {
  console.error(fallos.join('\n'))
  process.exit(1)
}
console.log(`cartolas reales: ${pdfs.length} PDF ok`)
