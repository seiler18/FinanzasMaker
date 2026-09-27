# 0002 — Publicado, backend conectado y enlazado en el portafolio

- **Fecha:** 2026-09-27
- **Estado:** completado (falta el ID de cliente OAuth)
- **Commits:** `aa78b34` (FinanzasMaker), `5c32577` (seiler18.github.io), `2b11fd4` (Curriculo)

## Contexto

El hito 0001 dejó el código listo pero sin repositorio ni instalación. Jesús
instaló el backend en su cuenta, publicó la aplicación web y pidió configurarla,
crear el repo y mostrar el proyecto (junto con `gestor-acciones`, hecho el mismo
día) en el hub y en el Currículo.

## Qué se hizo

- `src/config.js`: `API_URL` apunta a la implementación de Apps Script. Se
  comprobó que responde `{"ok":true,"servicio":"FinanzasMaker"}`.
- Repositorio público `seiler18/FinanzasMaker` con Pages por Actions. El
  primer deploy salió en verde y `https://seiler18.github.io/FinanzasMaker/`
  responde 200 con la CSP.
- Enlazado en los tres sitios del portafolio (regla de `../CLAUDE.md`), junto
  con `gestor-acciones`:
  - la sección «Proyectos publicados» del hub (`src/data/proyectos.js`);
  - `published` en `Curriculo/src/data/projects.js`;
  - el bloque «Proyectos publicados» de `Curriculo/ejemplos_index.html`.

  Los dos van primeros en la lista, porque son lo más reciente. Se comprobó
  que aparecen en los sitios publicados.

## Decisiones y alternativas descartadas

- Se enlaza la **demo**, no la versión con datos: quien visita no tiene la
  cuenta dueña, así que ve los datos inventados de `src/demo.js`. Por eso el
  botón dice «Ver la demo».

## Consecuencias

- Mientras `CLIENT_ID` esté vacío en `src/config.js`, la página sigue en modo
  demo aunque `API_URL` esté puesto (`modoDemo()` exige los dos). Esto es a
  propósito: sin ID de cliente no hay forma de iniciar sesión.

## Pendiente

- Crear el ID de cliente OAuth (README, paso 3), guardarlo como propiedad
  `CLIENT_ID` del script y en `src/config.js`, y publicar. Con eso aparece el
  botón «Iniciar sesión con Google» y se ven los datos reales.
