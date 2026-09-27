import { defineConfig } from 'vite'

/* Content-Security-Policy: solo en el build (en `npm run dev` Vite inyecta
   estilos y el cliente de recarga en línea, y una CSP estricta los
   bloquearía). GitHub Pages no deja poner cabeceras, así que va como
   <meta>; el anti-clickjacking va en JS (src/lib/marco.js).

   Orígenes externos, cada uno por algo concreto:
   - accounts.google.com/gsi/  → «Iniciar sesión con Google»: su script, su
     hoja de estilos, el iframe del botón y sus llamadas.
   - script.google.com + script.googleusercontent.com → el backend: Apps
     Script responde en la primera y redirige a la segunda.
   - fonts.googleapis.com / fonts.gstatic.com → la tipografía Inter. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "frame-src https://accounts.google.com/gsi/",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com/gsi/",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function csp() {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`)
    },
  }
}

/* base = "/NOMBRE-DEL-REPO/" porque se publica en seiler18.github.io/FinanzasMaker/. */
export default defineConfig({
  base: '/FinanzasMaker/',
  plugins: [csp()],
})
