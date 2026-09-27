/* Pie de autoría. Mismos datos que el pie del hub (seiler18.github.io,
   src/data/site.js): nombre, lema y redes (el correo no: el contacto va por el hub). Si cambian allá, cambian
   aquí. Íconos de marca en SVG propio (Simple Icons, CC0): la CSP no deja
   cargar Font Awesome desde un CDN. */

const AUTOR = {
  nombre: 'Jesús Seiler',
  lema: 'Normas, sistemas y sitios que se sostienen',
  hub: 'https://seiler18.github.io/',
  cv: 'https://seiler18.github.io/Curriculo/',
}

const REDES = [
  ['LinkedIn', 'https://www.linkedin.com/in/ichbinseiler/', 'M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z'],
  ['GitHub', 'https://github.com/seiler18', 'M12 .3a12 12 0 0 0-3.8 23.38c.6.12.82-.26.82-.58l-.01-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .3'],
  ['GitLab', 'https://gitlab.com/seiler18', 'm23.6 9.59-.03-.09L20.3.98a.85.85 0 0 0-1.63.1l-2.2 6.74H7.54L5.33 1.07a.86.86 0 0 0-1.63-.09L.43 9.5l-.03.09a6.07 6.07 0 0 0 2.01 7.01l.01.01.03.02 4.98 3.73 2.46 1.86 1.5 1.13a1 1 0 0 0 1.22 0l1.5-1.13 2.46-1.86 5-3.75.02-.01a6.07 6.07 0 0 0 2.01-7z'],
]

export function pie({ repo, nota = '', oscuro = false } = {}) {
  const redes = REDES.map(([n, href, d]) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${n}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg></a>`).join('')
  return `
    <footer class="pie${oscuro ? ' pie-oscuro' : ''}">
      <div class="pie-in">
        <div class="pie-autor">
          <span class="pie-mono" aria-hidden="true">JS</span>
          <div>
            <p class="pie-hecho">Diseñado y desarrollado por <a href="${AUTOR.hub}" target="_blank" rel="noopener noreferrer">${AUTOR.nombre}</a></p>
            <p class="pie-lema">«${AUTOR.lema}»</p>
          </div>
        </div>
        <nav class="pie-enlaces" aria-label="Del autor">
          <a href="${AUTOR.hub}" target="_blank" rel="noopener noreferrer">Todo lo que hago</a>
          <a href="${AUTOR.cv}" target="_blank" rel="noopener noreferrer">Currículum</a>
          <a href="${repo}" target="_blank" rel="noopener noreferrer">Código en GitHub</a>
        </nav>
        <div class="pie-redes">${redes}</div>
      </div>
      <p class="pie-legal">© ${new Date().getFullYear()} ${AUTOR.nombre}. Todos los derechos reservados.${nota ? ' ' + nota : ''}</p>
    </footer>`
}
