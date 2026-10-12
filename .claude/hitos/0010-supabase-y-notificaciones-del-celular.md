# 0010 — Nace la v2: base en Supabase y notificaciones del celular

- **Fecha:** 2026-10-12
- **Estado:** en curso. La base y la recepción de notificaciones están en producción; la macro quedó armada en el celular el mismo día
- **Commits:** el de este hito

## Contexto

Jesús quería que FinanzasMaker dejara de depender del correo y funcionara
«como Kuanto», conectado a los bancos. Al investigarlo se vio que:

- **Kuanto no se conecta a los bancos.** Su propia página dice «No nos
  conectamos a tu banco o email». Junta los movimientos de tres fuentes:
  correos reenviados, notificaciones del celular y cartolas subidas.
- **Los agregadores no cubren sus cuentas.** Fintoc, Floid y Prometeo entran
  al portal del banco con el RUT y la clave del usuario. Son para empresas y
  no publican precios. Además, la lista de movimientos de Fintoc tiene solo
  bancos tradicionales: Chile, Santander, Itaú, BICE, Scotiabank, BCI y
  BancoEstado. No están Tenpo, MACH, Mercado Pago ni Copec Pay, que son sus
  cuentas principales.
- **Las finanzas abiertas de la ley Fintec llegan tarde.** Parten en julio de
  2027, escalonadas de 6 a 36 meses, y para recibir los datos hay que estar
  inscrito en la CMF.

Con eso, Jesús decidió cuatro cosas:

- Su celular es **Android**, así que el canal sin correo son las
  notificaciones de las apps de los bancos.
- Se hace una **v2 de FinanzasMaker**, no un proyecto nuevo.
- **gestor-acciones se une aquí** como la sección «Inversiones».
- Apps Script deja de ser la base de datos (lo encontraba «MUY lento») y se
  pasa a **Supabase**.

## Qué se hizo

- **Proyecto de Supabase** «FinanzasMaker» (`mbcswbrmgfgmpsssnfzh`, región
  São Paulo, plan gratis).
  - Se creó **sin** «Enable Automatic RLS»; lo reemplaza la migración 0001.
  - Quedó enlazado con `npx supabase link`.
  - La clave de la base vive en `.env` (`CLAVE_BASE_DATOS_FINANZASMAKER`), que
    git ignora.
- **`supabase/migrations/0001_base.sql`.**
  - `anon` (la clave pública) pierde todo privilegio en `public`: tablas,
    secuencias y funciones, también las que se creen después.
  - PUBLIC deja de ejecutar funciones nuevas.
  - Un disparador de eventos (`rls_automatico`) activa RLS en toda tabla nueva
    de `public`.
  - Registro cerrado: un disparador en `auth.users` rechaza todo correo que no
    esté en `permitidos`.
- **`0002_notificaciones.sql`.**
  - Tablas `dispositivos` (guarda solo el SHA-256 de la clave del celular) y
    `notificaciones` (crudas, con huella de contenido + minuto contra
    repetidos).
  - `crear_dispositivo()`: exige sesión, máximo 5 dispositivos activos.
  - `registrar_notificacion()`: solo la llama la clave de servicio, con tope de
    60 por minuto por celular.
  - El dueño ve, marca y borra lo suyo. No lee el hash ni inserta directo.
- **`0003_registro_sin_pistas.sql`.** El rechazo del registro ya no le dice
  al visitante que existe la tabla `permitidos`.
- **Función `notificacion`** (`supabase/functions/notificacion/`).
  - Sin JWT (`verify_jwt = false`). La identidad es la cabecera `x-clave`.
  - Lee el cuerpo en texto por líneas (`cuerpo.js`) o en JSON.
  - No escribe el contenido en los logs.
  - Desplegada con `--use-api`, sin Docker.
- **Usuario dueño.** Se creó `ichbinseiler@gmail.com` con la API de
  administración y se agregó a `permitidos`. Jesús confirmó que es su cuenta.
- **Dispositivo «Celular Android».** Lo creó `scripts/crear-dispositivo.mjs`
  y su clave quedó en `.env` (`CLAVE_DISPOSITIVO_CELULAR_ANDROID`), sin
  imprimirse.
- **Pruebas.**
  - `tests/base.test.mjs` (`npm run test:base`): 17 casos sobre un Postgres 17
    desechable (`embedded-postgres`), con el arnés copiado de Seregenera.
    Revisa:
    - que toda tabla tenga RLS;
    - que toda función `security definer` fije su `search_path`;
    - que `anon` no tenga ningún privilegio;
    - que `authenticated` ejecute solo `crear_dispositivo`;
    - el registro cerrado;
    - las políticas, entrando con el rol equivocado.
  - `tests/notificacion.test.mjs`: 7 casos del lector del cuerpo.
  - `npm run build` corre ahora también `test:base`.
- **`scripts/check.js`** busca además claves secretas de Supabase y JWT, y
  revisa `supabase/` y `scripts/`.
- **CI (`deploy.yml`):** `npm rebuild @embedded-postgres/linux-x64` es la
  única excepción con nombre a `--ignore-scripts`. Su postinstall solo
  recrea los enlaces simbólicos de los binarios; sin él, Postgres no
  arranca en Linux.
- **Verificado contra la base real:**
  - mismos resultados de privilegios que en las pruebas;
  - el registro público con la clave publicable devuelve `registro-cerrado`;
  - leer `notificaciones` o llamar `registrar_notificacion` sin sesión da 401;
  - una notificación de prueba entró (201) y su repetición no (200);
  - las tildes llegan intactas;
  - las filas de prueba se borraron.

## Decisiones y alternativas descartadas

- **Apps Script se queda solo como trabajador de fondo** (Gmail, precios,
  alertas) y escribe en Supabase.
  - Leer Gmail desde fuera de Google exige una app OAuth con un permiso
    restringido: en modo prueba el token vence cada 7 días, y si no, hay que
    pasar la verificación de Google.
  - Así se reusan `Lectores.gs` y sus pruebas tal cual.
  - Lo lento era que la página le preguntara todo a Apps Script, no el
    disparador de fondo.
- **Una base y un front**, no un front con dos backends: Finanzas e
  Inversiones leen de la misma base de Supabase.
- **Scraping propio de los bancos:** descartado. Rompe los términos de uso,
  choca con la segunda clave y los bloqueos, y obliga a guardar la clave del
  banco. Tenpo, MACH y Copec Pay ni siquiera tienen sitio web.
- **Agregador pagado (Fintoc):** descartado por ahora. Queda para una fase
  con varios usuarios y solo cubriría BancoEstado y BCI.
- **VPS:** descartada. Una base administrada sale más barata y no hay que
  mantener un servidor.
- **Cuerpo en texto por líneas, no JSON.** MacroDroid pega la «magia de
  texto» sin escapar: una comilla en el aviso del banco rompería un JSON
  escrito a mano. El JSON queda para una app propia.
- **La función de borde y no un RPC llamado con la clave pública.** Así `anon`
  no ejecuta nada en la base: la superficie pública es una sola función HTTP
  que solo acepta claves con forma válida.
- **La clave del celular nunca se imprime.** Va directo a `.env`. La base
  guarda su hash y no la puede devolver.
- **RLS por usuario (`usuario = auth.uid()`) aunque hoy haya un solo dueño.**
  Cuesta lo mismo y deja la base lista para varios usuarios.
- **Registro cerrado en la base y no solo en el panel.** Un ajuste del panel
  se desmarca sin querer; el disparador está versionado y probado.

## Consecuencias

- **Toda tabla nueva va en una migración `NNNN_slug.sql` con su RLS, sus
  políticas y su prueba en `tests/base.test.mjs`.** Una migración ya
  aplicada no se edita: se escribe otra.
- **Aplicar migraciones:** `npx supabase db push`, con
  `SUPABASE_DB_PASSWORD` tomada del `.env`.
- **Desplegar la función:**
  `npx supabase functions deploy notificacion --use-api`.
- **El sitio actual no cambió:** sigue leyendo de Apps Script hasta el día
  del cambio.

## Pendiente

- **Juntar una semana de notificaciones reales.** La macro de MacroDroid ya
  está armada (README, «Notificaciones del celular»).
- **Opcional:** desmarcar «Allow new users to sign up» en el panel de Auth,
  como segunda puerta.
- **Migraciones de Finanzas** (las hojas actuales) **y de Inversiones** (las
  de gestor-acciones).
- **El front contra Supabase**, con inicio de sesión de Google
  (`signInWithIdToken`) y la sección Inversiones.
- **El trabajador de Apps Script escribiendo en Supabase.** Se mantiene
  «escribir antes de borrar»: el correo va a la papelera solo después de la
  respuesta 201.
- **El día del cambio:**
  - importar los datos de las dos planillas;
  - publicar;
  - archivar gestor-acciones;
  - mover sus enlaces en los tres sitios del portafolio.
- **Lectores de notificaciones**, escritos con lo que junte el relevamiento.
- **Auditoría de ciberseguridad completa** al terminar la v2, como se hizo en
  Seregenera.
- **Comprobar en el CI de Actions que `test:base` corre.** Se probó en
  Windows; en el runner de Linux todavía no.
