# 0011 — La v2 completa: la página en Supabase, Inversiones adentro y el trabajador

- **Fecha:** 2026-10-12
- **Estado:** listo en la rama `v2`; falta el cambio en producción (pasos del usuario en el README, «Pasar de la v1 a la v2»)
- **Commits:** los de la rama `v2`

## Contexto

Sigue al hito 0010. Jesús pidió terminar todo lo pendiente de la fase:

- **Unir gestor-acciones a FinanzasMaker.** Inversiones por un lado,
  finanzas propias por el otro, para no tener dos proyectos.
- **Dejar Apps Script como base de datos** (lo encontraba lento) y pasar a
  Supabase.
- **Un MVP que le funcione a él primero.**

Confirmó además que su correo es `ichbinseiler@gmail.com` y armó la macro de
MacroDroid. La primera notificación real (MACH) llegó a la base el mismo día.

## Qué se hizo

**Base**

- `0004_finanzas.sql`:
  - las siete hojas de la planilla como tablas, con las mismas columnas, más
    `usuario`;
  - fechas como texto `AAAA-MM-DD HH:MM` con CHECK, porque `analisis.js`
    corta esos textos;
  - `estado_trabajador`;
  - `decidir_revisar()` (`security invoker`): el movimiento, el estado y la
    bitácora cambian juntos o no cambia nada.
- `0005_inversiones.sql`: operaciones (con los tipos del contrato de
  gestor-acciones), precios y mapa (de todos, solo lectura) y alertas.
- Las dos aplicadas en el proyecto real, con el mismo resultado de
  privilegios que en las pruebas: `anon` nada, `authenticated` ejecuta solo
  `crear_dispositivo`, todas las tablas con RLS.

**Página**

- `src/lib/datos.js` reimplementa contra Supabase las acciones que tenía el
  Apps Script, con la misma forma de respuesta. Las vistas casi no cambiaron
  y `src/demo.js` sigue siendo el mismo backend de mentira.
- `src/lib/validar.js`, `src/lib/reglas.js` y `src/lib/config-base.js` son
  gemelas de Code.gs y Lectores.gs, con su prueba (`tests/reglas.test.mjs`).
- Ingreso: el mismo botón de Google → `signInWithIdToken` con nonce. La
  sesión vive en `sessionStorage`.
- Ajustes ganó «Celular» (lo que llegó de MacroDroid: la forma de probar la
  macro) y «Configuración» (antes era la pestaña Config de la planilla,
  ahora suma los umbrales de Inversiones).
- «Por revisar» ya no borra el correo: lo marca, y el trabajador lo borra.

**Inversiones**

- La página de gestor-acciones se trajo como **segunda página** del build
  (`inversiones/index.html` + `src/inversiones/`). Tiene su CSS, sus libs y
  su demo.
- `src/inversiones/lib/api.js` arma el contrato v1 desde Supabase.
- La entrada con clave se cambió por el ingreso con Google.
- Botón «Inversiones» arriba en Finanzas y «← Finanzas» de vuelta.

**Trabajador**

- `backend/Supabase.gs`, el cliente REST:
  - `COLUMNAS` con tipo y largo, para convertir y recortar;
  - el filtro del dueño en cada consulta;
  - todo error lanza.
- `backend/Code.gs`:
  - guarda en Supabase;
  - pregunta lo ya procesado por los ids de cada página;
  - borra lo marcado en la página (`borrarDecididos_`);
  - la API solo atiende «sincronizar»;
  - tres disparadores;
  - no procesa nada sin `MIGRADO`.
- `backend/Acciones.gs`: lo de gestor-acciones (correos de Fintual,
  AUTO-MAPA, precios de Yahoo, alertas con anti-spam, costo promedio móvil),
  escribiendo en Supabase.
- `backend/Migrar.gs`: `migrarASupabase()` y `migrarAccionesASupabase()`,
  una vez, saltando e informando lo ilegible. También `empezarDeCero()` y
  `empezarAccionesDeCero()`.

**Pruebas**

- `tests/apps-script-falso.mjs`: Apps Script y PostgREST de mentira.
- `backend.test.mjs` reescrito (42 casos) y `acciones.test.mjs` (13).
- La gemela del costo móvil compara `Acciones.gs` con `cartera.js`.
- Las pruebas de Inversiones se trajeron de gestor-acciones.
- `base.test.mjs` creció a 24 casos.
- El build corre todo: 235 pruebas en total.

**Contra la base real**

- Un usuario de prueba temporal corrió las acciones de la página y las del
  trabajador (con curl síncrono y la clave secreta, solo en `apikey`): 18
  pasos en verde.
- Encontró un error que el falso no veía, y que se corrigió: PostgREST
  rechaza un lote con filas de distinta forma («All object keys must
  match»). El falso ahora también lo rechaza.
- El usuario y todo lo suyo se borraron al terminar.

**Navegador**

- Prueba de humo con `playwright-core` y el Chrome instalado: las dos
  páginas cargan en demo y en la pantalla de ingreso sin errores de JS ni de
  CSP.

## Decisiones y alternativas descartadas

- **Dos páginas y no una vista nueva dentro de Finanzas.** Los dos proyectos
  tenían `app.css`, `tablero.css` y clases con el mismo nombre. Como vista
  única habría que renombrar todo; como segunda página cada una carga solo su
  CSS. Comparten la sesión, porque `sessionStorage` es del origen y la
  pestaña. Queda duplicado `dom.js`/`efectos.js` entre las dos: deuda menor.
- **Apps Script se queda como trabajador, no como backend.** Leer Gmail desde
  fuera de Google exige una app OAuth verificada (hito 0010). La página ya no
  le habla, salvo «Revisar correos ahora».
- **La página marca y el trabajador borra.** El correo de un «Por revisar»
  descartado se va a la papelera hasta 30 min después y no al clic. A
  cambio, Gmail lo toca un solo actor.
- **Candados de migración** (`MIGRADO`, `MIGRADO_ACCIONES`). El disparador
  viejo sigue vivo y corre el código nuevo apenas se pega. Sin candado, con
  la bitácora de la base vacía, lo de los últimos días entraría dos veces.
- **Una clave secreta solo para el trabajador**, en las propiedades del
  script, y no la de fábrica. Se revoca sin tocar nada más.
- **Precios y mapa de todos, sin `usuario`.** El precio de VOO no es dato de
  nadie, y así no se repite por usuario.
- **`GmailApp.sendEmail` y no `MailApp`** para las alertas. El permiso de
  Gmail ya estaba; `MailApp` habría pedido `script.send_mail`.
- **Un correo de Fintual ilegible se avisa una vez.** La hoja avisaba en cada
  corrida porque no lo marcaba como visto.
- **`spreadsheets.readonly` en el manifiesto** para leer la hoja de
  gestor-acciones al migrar. Se puede quitar después (SECURITY.md, A5).
- **El ingreso con Google no se aplicó desde aquí.** `supabase config push`
  lo bloqueó el clasificador de permisos de Claude Code, dos veces, aun con
  el diff revisado. Queda revisado en `supabase/config.toml` para que lo
  aplique el usuario.
- **Rama `v2`, no `main`.** Publicar antes del cambio dejaría la página sin
  datos y sin ingreso.

## Consecuencias

- La página ya no depende del Apps Script para mostrar nada. Si el
  trabajador se cae, la página sigue andando con lo que hay.
- Toda columna nueva va en la migración, en `COLUMNAS` (Supabase.gs) y, si
  la página la escribe, en `datos.js`.
- gestor-acciones queda para archivar en cuanto Inversiones ande con datos
  reales.

## Pendiente

- **El cambio, del lado del usuario** (README, «Pasar de la v1 a la v2»):
  - `npx supabase config push`;
  - la clave `apps-script`;
  - pegar los `.gs`, las propiedades y la URL de la hoja de gestor-acciones;
  - `probarSupabase`, `migrarASupabase`, `migrarAccionesASupabase`,
    `instalar`;
  - una versión nueva de la implementación;
  - borrar los disparadores de la hoja de gestor-acciones.
- **Después del cambio, del lado del agente:**
  - verificar los conteos en la base;
  - unir `v2` a `main` y publicar;
  - archivar gestor-acciones;
  - mover sus enlaces en los tres sitios del portafolio y el inventario de
    `../CLAUDE.md`.
- **Lectores de notificaciones**, con la semana de relevamiento.
- **Cartolas, la página instalable en el celular y la app Android propia.**
- **Auditoría de ciberseguridad completa.**
- **Quitar `spreadsheets.readonly` del manifiesto tras migrar.**
