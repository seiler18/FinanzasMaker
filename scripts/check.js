/* Verificador previo al build (va dentro de `npm run build`, así que un
   fallo rompe el deploy en vez de llegar a producción).

   Comprueba lo que Vite no ve:
   1. Colores y duraciones literales fuera de tokens.css.
   2. Atributos style="" en el marcado generado: la CSP los bloquearía.
   3. Secretos que no deben llegar al repo público.
   4. Datos personales en los fixtures: números de cuenta completos y RUT.
      Los correos de tests/fixtures/ vienen de Gmail real; si alguno se coló
      sin anonimizar, el build no pasa. */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const fallos = []
const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function archivos(dir, ext) {
  if (!existsSync(dir)) return []
  const out = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...archivos(p, ext))
    else if (ext.includes(extname(n))) out.push(p)
  }
  return out
}

// 1
for (const f of archivos(join(raiz, 'src/styles'), ['.css'])) {
  if (f.endsWith('tokens.css')) continue
  readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    const s = l.replace(/\/\*.*?\*\//g, '')
    if (/#[0-9a-fA-F]{3,8}\b/.test(s) || /rgba?\(/.test(s)) fallos.push(`${f}:${i + 1} color literal: ${l.trim()}`)
    if (/(transition|animation)[^;]*\b\d+m?s\b/.test(s) && !/none/.test(s)) fallos.push(`${f}:${i + 1} duración literal: ${l.trim()}`)
  })
}

// 2
for (const f of archivos(join(raiz, 'src'), ['.js'])) {
  readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (/<[a-z][^>]*\sstyle="/.test(l)) fallos.push(`${f}:${i + 1} atributo style="" (lo bloquea la CSP)`)
  })
}

// 3
const SECRETOS = [/gh[opsu]_[A-Za-z0-9]{30,}/, /AIza[0-9A-Za-z_-]{35}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /GOCSPX-[A-Za-z0-9_-]{20,}/]
const revisar = [...archivos(join(raiz, 'src'), ['.js', '.css']), ...archivos(join(raiz, 'backend'), ['.gs', '.json']),
                 ...archivos(join(raiz, 'tests'), ['.mjs', '.json']), join(raiz, 'index.html')].filter(existsSync)
for (const f of revisar) {
  if (SECRETOS.some((r) => r.test(readFileSync(f, 'utf8')))) fallos.push(`${f}: posible secreto en el código`)
}

// 4 — en los fixtures todo número de cuenta debe estar enmascarado o ser
// de relleno (solo ceros o una secuencia 1234…). Un RUT con dígito
// verificador tampoco tiene por qué estar.
const RELLENO = /^(0+|1+|(?:0123456789|1234567890)+\d*|\d?0{3,}\d*)$/
for (const f of archivos(join(raiz, 'tests/fixtures'), ['.json'])) {
  const t = readFileSync(f, 'utf8')
  for (const m of t.matchAll(/(?<![\d*.,$])\d{8,}(?![\d.,])/g)) {
    if (!RELLENO.test(m[0])) fallos.push(`${f}: número largo sin anonimizar (${m[0].slice(0, 3)}…)`)
  }
  const ruts = [...t.matchAll(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g)].map((x) => x[0]).filter((r) => !/^(1{1,2}\.?1{3}\.?1{3}|0+)-\d$/.test(r))
  if (ruts.length) fallos.push(`${f}: parece un RUT (usa 11.111.111-1)`)
}

if (fallos.length) {
  console.error(`✗ ${fallos.length} problema(s):\n  ` + fallos.join('\n  '))
  process.exit(1)
}
console.log('✓ check: estilos, CSP, secretos y fixtures en orden')
