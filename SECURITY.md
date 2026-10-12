# Seguridad — FinanzasMaker

## Qué se protege y de quién

| Activo | Amenaza principal |
|---|---|
| Tus movimientos (la planilla) | Alguien de internet que llama directo a la URL `/exec` |
| Tu Gmail | El script corre con permiso para leer y mandar correos a la papelera: un error o un abuso de la API no debe poder borrar lo que no corresponde |
| Los correos de los bancos | Son texto que escribe un tercero (o alguien que se hace pasar por el banco): no se ejecuta ni se interpreta como fórmula |
| Datos de terceros | Nombres y cuentas de a quién le transfieres: no van al repositorio público |

## Controles

**Identidad (`identidad_` en `Code.gs`).** La aplicación web es pública (tiene
que serlo para que la llame GitHub Pages), pero **toda** acción exige el ID
token de «Iniciar sesión con Google»:
- Primero se descarta en local, sin gastar una llamada, lo que no tiene forma
  de JWT, dice ser para otro `client_id`, es de otro correo o está vencido.
- Después Google (`oauth2.googleapis.com/tokeninfo`) verifica la firma. Se
  exige `aud` = nuestro CLIENT_ID, emisor `accounts.google.com`, correo
  verificado e igual al dueño guardado por `instalar()`.
- Un token válido se recuerda en caché (por hash) hasta que vence.
- Freno global: máximo 30 verificaciones externas por minuto, para que nadie
  agote la cuota de UrlFetch del dueño con tokens falsos.
- `doGet` no devuelve datos.

**Gmail.**
- Solo va a la papelera un correo que un lector **reconoció** y cuya fila **ya
  se escribió** en la hoja. Un correo dudoso, publicidad o una cartola no se
  tocan. Desde la página solo se puede borrar un correo de «Revisar» que tú
  descartaste marcando «borrar».
- Nunca se borra definitivamente: la papelera de Gmail lo guarda 30 días.
- La hoja **Correos** conserva remitente, asunto y fecha de cada correo
  procesado: el respaldo que queda cuando el correo ya no existe.
- La API nunca devuelve el `gmail_id` de un movimiento ni el cuerpo de los
  correos (salvo los 400 caracteres del extracto en «Revisar»).

**Datos no confiables.** Todo texto de un correo se escribe en la hoja con
`celda_()` (un `=IMPORTXML(...)` en un asunto no se ejecuta) y se pinta en la
página con la plantilla `html` que escapa. CSP estricta en el build: scripts sin
`unsafe-inline` ni `eval`, solo los orígenes de Google que se necesitan. Los
**estilos** sí admiten `unsafe-inline`, porque el botón de Google los inyecta;
un hash no sirve porque Google cambia su CSS. Un estilo inyectado no ejecuta
código, y el marcado propio sigue sin `style=""` (lo vigila `npm run check`).
Anti-clickjacking por JS.

**Repositorio público.** Ninguna credencial: `API_URL` y `CLIENT_ID` no son
secretos. Los fixtures son correos reales **anonimizados**, y `npm run check`
rechaza números largos sin enmascarar y RUT.

**CI.** Igual que VentasMaker: el trabajo que compila no puede escribir; el que
publica solo escribe en Pages. `npm ci --ignore-scripts`, `npm audit`,
acciones fijadas por SHA. La única excepción con nombre es
`npm rebuild @embedded-postgres/linux-x64`: su postinstall solo recrea los
enlaces simbólicos de los binarios del Postgres de las pruebas.

**Supabase (v2, hito 0010).** La clave publicable va en la página y es
pública por diseño; la seguridad la dan los privilegios y las políticas:
- `anon` no tiene ningún privilegio en `public` (0001). Sin sesión no se lee
  ni se llama nada, aunque una tabla nueva olvide su política.
- Toda tabla tiene RLS. Un disparador de eventos lo activa al crearla, y
  `tests/base.test.mjs` falla si falta. Las políticas son
  `usuario = (select auth.uid())`.
- **Registro cerrado en la base:** un disparador en `auth.users` rechaza todo
  correo que no esté en `permitidos`, venga por Google, correo, teléfono o
  anónimo. El mensaje no revela cómo funciona por dentro (0003).
- **Celular (MacroDroid):**
  - Entra por una sola función HTTP sin JWT, con una clave de 64 hex en la
    cabecera `x-clave`.
  - La base guarda solo su SHA-256, tiene un tope de 60 avisos por minuto
    por celular y se revoca por dispositivo.
  - La clave solo sirve para **mandar** avisos a esa cuenta, no para leer.
  - Los avisos se guardan como texto no confiable: se pintarán escapados,
    como los correos.
- **La clave de servicio** existe solo en Supabase (la usa la función). Más
  adelante estará también en las propiedades del script de Apps Script.
  `npm run check` rechaza claves `sb_secret_` y JWT en el repo.
- **Pendiente:** la auditoría completa de ciberseguridad al terminar la v2.

## Riesgos aceptados

| # | Riesgo | Por qué se acepta |
|---|---|---|
| A1 | Quien pueda **editar** la planilla controla el script (y por él tu Gmail) | Es tu planilla: no la compartas con nadie |
| A2 | El script pide el permiso completo de Gmail (`mail.google.com`) | Apps Script `GmailApp` no ofrece uno más chico que permita mandar a la papelera |
| A3 | Un correo falso que imite a un banco podría crear un movimiento falso | Solo si viene desde el dominio del banco; Gmail marca como spam lo que falla SPF/DKIM, y la búsqueda excluye spam. El daño es un número mal en tu planilla, que se corrige o elimina |
| A4 | El token de Google vive 1 hora en `sessionStorage` | Nada en el navegador es inmune a un XSS; la otra mitad de la defensa es que no haya XSS (escape y CSP) |
