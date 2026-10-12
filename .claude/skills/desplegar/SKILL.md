---
name: desplegar
description: Publicar el front de FinanzasMaker en GitHub Pages. Úsala cuando el usuario pida publicar, subir o desplegar la página, o después de cambiar src/ o src/config.js.
---

# Publicar las páginas

GitHub Actions (`.github/workflows/deploy.yml`) publica en cada push a `main`
las dos páginas: Finanzas (`index.html`) e Inversiones (`inversiones/index.html`).
`npm run build` corre `check`, `test` y `test:base` primero: si fallan, no se
publica.

1. `npm run build` en local, en verde.
2. Commit en español, una línea, sin atribución a Claude (`../CLAUDE.md`).
3. Push a `main` (solo si el usuario lo pidió).
4. `gh run watch` hasta que termine; las páginas quedan en
   `https://seiler18.github.io/FinanzasMaker/` y `…/FinanzasMaker/inversiones/`.
5. Comprobar con `curl -sI` que las dos responden 200. Una prueba de humo
   (que carguen en demo sin errores de JS ni de CSP) se puede con
   `playwright-core` y el Chrome instalado; la revisión visual la hace el
   usuario.

**Primera vez:** crear el repo `seiler18/FinanzasMaker`, y en *Settings →
Pages → Source* elegir **GitHub Actions**. Al publicarlo, enlazarlo en los
tres sitios del portafolio que dice `../CLAUDE.md`.
