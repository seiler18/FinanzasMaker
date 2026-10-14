# Seguridad — FinanzasMaker (v2)

## Qué se protege y de quién

| Activo | Amenaza principal |
|---|---|
| Tus movimientos e inversiones (la base de Supabase) | Alguien de internet con la clave pública, que va en la página |
| La clave secreta del trabajador | Quien la lea tiene la base entera: esa clave se salta la RLS |
| Tu Gmail | El script corre con permiso para leer y mandar correos a la papelera: un error o un abuso no debe poder borrar lo que no corresponde |
| Los correos y las notificaciones de los bancos | Son texto que escribe un tercero (o alguien que se hace pasar por el banco): no se ejecuta ni se interpreta |
| La clave del celular | Quien la tenga puede mandar notificaciones falsas a tu cuenta |
| Datos de terceros | Nombres y cuentas de a quién le transfieres: no van al repositorio público |

## Controles

**La base (Supabase).** La clave publicable va en la página y es pública por
diseño; la seguridad la dan los privilegios y las políticas.

- `anon` no tiene ningún privilegio en `public` (migración 0001). Sin sesión
  no se lee ni se llama nada, aunque una tabla nueva olvide su política.
- Toda tabla tiene RLS. Un disparador de eventos lo activa al crearla y
  `tests/base.test.mjs` falla si falta.
- Las políticas son `usuario = (select auth.uid())`. Lo que la página no debe
  escribir lo cierran además los privilegios por columna:
  - `revisar` y `correos` solo se marcan;
  - `notificaciones`, `inversiones` y `acciones_operaciones` los crea el
    trabajador;
  - los precios no se tocan desde la página.
- **Registro cerrado en la base.** Un disparador en `auth.users` rechaza todo
  correo que no esté en `permitidos`, venga por Google, correo, teléfono o
  anónimo. El mensaje no cuenta cómo funciona por dentro (0003). El panel de
  Auth también tiene el registro apagado (`config.toml`): es la segunda puerta.
- **Ingreso.** El botón de Google da un ID token; la página lo cambia por una
  sesión con `signInWithIdToken` y un **nonce** inventado en cada carga, así
  un token robado de otra página no sirve aquí. La sesión vive en
  `sessionStorage` y se va al cerrar la pestaña.
- `decidir_revisar` es `security invoker`: corre con la sesión de quien llama.
  `authenticated` ejecuta una sola función `security definer`,
  `crear_dispositivo`, y la prueba lo vigila.

**El trabajador (Apps Script).**

- Escribe con una clave **secreta propia**, la `apps-script`. Vive solo en las
  propiedades del script, nunca en el código ni en el repositorio, y se
  revoca en Supabase sin tocar nada más.
- Como esa clave se salta la RLS, el filtro lo pone el trabajador:
  - toda consulta pasa por `sbConsulta_`, que antepone
    `usuario=eq.<SUPABASE_USUARIO>`;
  - toda fila sale de `aFila_` con su `usuario`;
  - `tests/backend.test.mjs` revisa cada petición de una pasada completa.
- `aFila_` recorta cada texto al largo de su columna. Si no, un texto de más
  haría fallar el lote en cada pasada y el trabajador quedaría atascado.
- La aplicación web es pública (tiene que serlo para que la llame GitHub
  Pages), pero solo atiende **«sincronizar»**, y con el ID token del dueño
  (`identidad_`):
  - Primero se descarta en local, sin gastar una llamada, lo que no tiene
    forma de JWT, dice ser para otro `client_id`, es de otro correo o está
    vencido.
  - Después Google (`oauth2.googleapis.com/tokeninfo`) verifica la firma, el
    emisor, el correo verificado e igual al dueño.
  - Freno global: 30 verificaciones externas por minuto.
  - `doGet` no devuelve datos. La API ya no entrega datos: eso es Supabase.
- Hasta que se migra, no procesa nada (`MIGRADO`, `MIGRADO_ACCIONES`). Así lo
  reciente no entra dos veces.

**Gmail.**

- Solo va a la papelera un correo que un lector **reconoció** y cuya fila la
  base **ya confirmó**. Si Supabase no responde 2xx, la pasada se corta antes
  de tocar un correo, y la bitácora `correos` va al final del lote.
- Un correo dudoso, publicidad o una cartola no se tocan.
- Desde la página solo se **marca** un correo de «Por revisar»; lo borra el
  trabajador en su próxima pasada. Gmail lo toca únicamente el script.
- Nunca se borra definitivamente: la papelera de Gmail lo guarda 30 días.
- La tabla `correos` conserva remitente, asunto y fecha de cada correo
  procesado: el respaldo que queda cuando el correo ya no existe.

**El celular (la app FinanzasMaker para Android, o MacroDroid).**

- Entra por una sola función HTTP sin JWT, con una clave de 64 hex en la
  cabecera `x-clave`.
- La clave se crea en Ajustes → Celular → «Vincular la app», se muestra una
  sola vez y la página no la guarda. Llega a la app por un enlace `intent://`
  (o copiada a mano); la app pide confirmar antes de reemplazar una clave que
  ya tenía, porque cualquier sitio podría abrir ese enlace. Se revoca desde
  la misma sección.
- `publicada` (la hora del aviso según el celular) se acepta solo entre 30
  días atrás y 10 minutos adelante; si no, cuenta la hora de llegada.
- La base guarda solo su SHA-256, tiene un tope de 60 avisos por minuto por
  celular y se revoca por dispositivo.
- La clave solo sirve para **mandar** avisos a esa cuenta, no para leer.
- La función no escribe el contenido en los logs.

**Cartolas (PDF).** Se abren en el navegador con pdf.js: el archivo y su
clave no salen del equipo ni se guardan. A la base llegan solo los movimientos
que el dueño marca. pdf.js corre sin `eval` y con su worker servido desde la
misma página (la CSP no cambió). Los PDF de prueba viven en `cartolas/`,
ignorada por git; `tests/cartolas-reales.test.mjs` lee sus claves de `.env`
sin imprimirlas.

**Datos no confiables.** Todo texto de un correo o de una notificación se pinta
con la plantilla `html` que escapa; en la hoja «Ensayo», `celda_()` neutraliza
las fórmulas. CSP estricta en el build de las dos páginas:

- **Scripts:** sin `unsafe-inline` ni `eval`.
- **Conexiones:** solo Supabase, el Apps Script y el botón de Google.
- **Estilos:** admiten `unsafe-inline`, porque el botón de Google los inyecta.
  Un hash no sirve, porque Google cambia su CSS, y un estilo inyectado no
  ejecuta código. El marcado propio sigue sin `style=""` (lo vigila
  `npm run check`).
- Anti-clickjacking por JS.

**Repositorio público.** Ninguna credencial.

- No son secretos: `SUPABASE_URL`, la clave publicable, `CLIENT_ID` y `API_URL`.
- `npm run check` rechaza claves `sb_secret_` y JWT.
- La contraseña de la base y las claves de los celulares viven en `.env`, que
  git ignora, y los scripts las leen sin imprimirlas.
- Los fixtures son correos reales **anonimizados**.

**CI.** Igual que VentasMaker: el trabajo que compila no puede escribir; el que
publica solo escribe en Pages. `npm ci --ignore-scripts`, `npm audit`,
acciones fijadas por SHA. La única excepción con nombre es
`npm rebuild @embedded-postgres/linux-x64`: su postinstall solo recrea los
enlaces simbólicos de los binarios del Postgres de las pruebas.

**Pendiente:** la auditoría completa de ciberseguridad al terminar la v2.

## Riesgos aceptados

| # | Riesgo | Por qué se acepta |
|---|---|---|
| A1 | Quien pueda **editar** la planilla controla el script: tu Gmail y, por `SUPABASE_CLAVE`, la base entera | Es tu planilla: no la compartas. La clave es solo del trabajador y se revoca en Supabase en un clic |
| A2 | El script pide el permiso completo de Gmail (`mail.google.com`) | `GmailApp` no ofrece uno más chico que permita mandar a la papelera; con él también manda las alertas, sin pedir otro permiso |
| A3 | Un correo falso que imite a un banco podría crear un movimiento falso | Solo si viene desde el dominio del banco; Gmail marca como spam lo que falla SPF/DKIM, y la búsqueda excluye spam. El daño es un número mal, que se corrige o elimina |
| A4 | La sesión de Supabase vive en `sessionStorage` | Nada en el navegador es inmune a un XSS; la otra mitad de la defensa es que no haya XSS (escape y CSP) |
| A5 | `migrarAccionesASupabase` necesitó el permiso completo de planillas (`openByUrl` no acepta el de solo lectura) | Era solo para la migración, hecha el 2026-10-12; ya se quitó del manifiesto y queda `spreadsheets.currentonly` |
| A6 | Las notificaciones crudas guardan el texto completo del aviso (montos, comercios, a veces nombres) | Son tus datos, en tu base con RLS; se necesitan enteras para escribir los lectores |
| A7 | Los precios salen de un endpoint no oficial de Yahoo | Si cambia o falla, queda el último precio con su hora; no afecta a las finanzas |
