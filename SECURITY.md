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
página con la plantilla `html` que escapa. CSP estricta en el build: sin
`unsafe-inline`, sin `eval`, solo los orígenes de Google que se necesitan.
Anti-clickjacking por JS.

**Repositorio público.** Ninguna credencial: `API_URL` y `CLIENT_ID` no son
secretos. Los fixtures son correos reales **anonimizados**, y `npm run check`
rechaza números largos sin enmascarar y RUT.

**CI.** Igual que VentasMaker: el trabajo que compila no puede escribir; el que
publica solo escribe en Pages. `npm ci --ignore-scripts`, `npm audit`,
acciones fijadas por SHA.

## Riesgos aceptados

| # | Riesgo | Por qué se acepta |
|---|---|---|
| A1 | Quien pueda **editar** la planilla controla el script (y por él tu Gmail) | Es tu planilla: no la compartas con nadie |
| A2 | El script pide el permiso completo de Gmail (`mail.google.com`) | Apps Script `GmailApp` no ofrece uno más chico que permita mandar a la papelera |
| A3 | Un correo falso que imite a un banco podría crear un movimiento falso | Solo si viene desde el dominio del banco; Gmail marca como spam lo que falla SPF/DKIM, y la búsqueda excluye spam. El daño es un número mal en tu planilla, que se corrige o elimina |
| A4 | El token de Google vive 1 hora en `sessionStorage` | Nada en el navegador es inmune a un XSS; la otra mitad de la defensa es que no haya XSS (escape y CSP) |
