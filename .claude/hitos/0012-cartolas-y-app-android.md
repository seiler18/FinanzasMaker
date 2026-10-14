# 0012 — Cartolas en PDF, la hora del aviso y la app Android

- **Fecha:** 2026-10-14
- **Estado:** página publicada el 2026-10-14; la migración 0006 y la función `notificacion`, por desplegar (falta `npx supabase login` en este PC)
- **Commits:** los de la rama `cartolas-y-app`

## Contexto

Sigue al hito 0011. Jesús pidió:

- **Dejar de depender de MacroDroid** con una app Android propia, en un repo
  aparte y versionado.
- **Leer las cartolas** que más usa: MACH y Copec Pay (cuenta), y los estados
  de cuenta de las tarjetas MACH y Tenpo. Dejó los PDF en `cartolas/` y sus
  claves en `.env`. Tenía que quedar fuera del repo.
- La página instalable ya la tiene: Edge la instala desde el celular. Se sacó
  de los pendientes.

## Qué se hizo

**Cartolas (Agregar → Subir una cartola).**

- El PDF se abre en el navegador con pdf.js (6.3.289, fijado). El primer
  intento usó la 5.7.284 y `npm audit` en CI frenó la publicación:
  GHSA-hq66-cqwq-w95j, ejecución de JavaScript al abrir un PDF malicioso,
  corregida desde la 6.2.108. La 6 exige Node 22.13 (`engines`) y cierra el
  documento con `loadingTask.destroy()`. Se carga recién
  al elegir un archivo. Si el PDF tiene clave, se pide y no se guarda.
- `src/lib/cartolas/tabla.js` arma la tabla con los trozos de texto y su
  posición: líneas por altura, columnas por los títulos de cada página y
  descripciones de dos líneas.
- `formatos.js` tiene cuatro formatos: cuenta MACH, cuenta Copec Pay, tarjeta
  Tenpo y tarjeta MACH. Cada uno lee los totales que la cartola declara, y
  **el cuadre** los compara con la suma de lo leído. Las cuatro cartolas de
  septiembre cuadran al peso. El estado de cuenta de Fintual/Alpaca se
  reconoce y se explica por qué no se importa.
- `clasificar.js` usa los mismos criterios que los lectores de correo:
  - entre tus cuentas, Ahorro 24/7 y cargar una billetera → `interna`;
  - el pago de la tarjeta → `pago_tarjeta`. Visto desde la tarjeta es
    informativo;
  - P2P de Binance → compra de cripto;
  - lo demás va por las reglas del dueño.
  Además:
  - la rentabilidad diaria de Copec Pay se junta en un movimiento por mes;
  - una devolución toma el tipo de lo que devuelve;
  - el impuesto de timbres y los intereses se registran como gastos;
  - una cuota de una compra anterior al periodo se ofrece sin marcar.
- `cruzar.js` busca cada fila entre lo ya registrado: mismo banco y producto,
  mismo monto, a 3 días o menos y en un sentido compatible. La vista muestra:
  - lo que falta, ya marcado;
  - lo ya registrado;
  - lo que está en la app pero no en la cartola (un duplicado, o un
    movimiento anotado en otro banco).
- `importar_cartola` (datos.js y su gemela en demo.js) usa un id fijo,
  SHA-256 de dueño y fila. Subir la misma cartola dos veces no duplica.
- `.gitignore`: `/cartolas/` y `*.pdf`.

**Celular.**

- En Ajustes → Celular se puede **vincular la app**. Se crea el dispositivo
  y la clave se muestra una vez, con:
  - un enlace `intent://` que la abre en la app;
  - «Copiar clave».
  Cada celular se puede **revocar**.
- Migración `0006_hora_del_aviso.sql`:
  - `notificaciones.publicada` guarda la hora en que el celular mostró el
    aviso;
  - `registrar_notificacion` recibe `_publicada`, que es opcional;
  - la huella anti-repetidos usa el minuto de `publicada` cuando viene.
    Por eso un aviso que la app reenvía horas después sale como
    «repetida».
- `cuerpo.js` y la función `notificacion` pasan `publicada`, en el JSON de
  la app.
- **La app Android** vive en su propio repo (`seiler18/FinanzasMaker-android`,
  privado). Escucha las notificaciones de los bancos que se elijan, las
  guarda en una cola en el celular y las manda con WorkManager. Su historia
  está en el hito 0001 de ese repo.

**Arreglos de paso.**

- `app.recargar()` devuelve los datos nuevos. Una vista recibe una copia de
  `app`, y si no se repinta se queda con los datos viejos. La prueba de humo
  lo encontró: tras agregar desde la cartola, todo seguía como faltante.
- «notificaciónes» → «notificaciones».

## Decisiones y alternativas descartadas

- **PDF en el navegador, no en un servidor.** El extracto del banco no sale
  del equipo y no hay nada que mantener. Para leer en el servidor, el PDF y
  su clave tendrían que viajar.
- **Cuadre obligatorio a la vista.** Un PDF no tiene tabla, y leer una
  columna equivocada es fácil (pasó con los montos chicos de la tarjeta MACH:
  se resolvió con el modo `'tramo'`). Si los totales de la cartola no calzan,
  se avisa antes de ofrecer nada.
- **Leer las cartolas desde el correo, descartado por ahora.** El trabajador
  tendría que manejar claves de PDF y pdf.js en Apps Script. Bajar el PDF y
  subirlo cuesta un minuto al mes.
- **Huella por minuto de `publicada`, no por el instante exacto.** Así calza
  con la de MacroDroid (minuto de llegada) mientras convivan.
- **La clave pasa por un enlace `intent://`, no por un QR.** La página se usa
  en el mismo celular. Un QR obligaría a la app a pedir la cámara.

## Consecuencias

- `npm test` suma `cartolas.test.mjs` (sintéticas) y `cartolas-reales.test.mjs`.
  Esta última se salta si no existe la carpeta `cartolas/`, como en CI.
- Hasta desplegar la 0006, la función actual ignora `publicada`. La app
  funciona igual.
- **Orden del despliegue:** primero `npx supabase db push` y después
  `npx supabase functions deploy notificacion --use-api`. Al revés, la
  función llamaría con un argumento que la base todavía no conoce.

## Pendiente

- Desplegar la 0006 y la función (necesita `npx supabase login` y `link`).
- Instalar la app, vincularla y, cuando los avisos lleguen por ella
  (Ajustes → Celular), apagar la macro de MacroDroid.
- **Lectores de notificaciones**, con el relevamiento (hasta cerca del
  2026-10-19).
- Otras cartolas vistas en el correo: Santander, Prex y Tenpo Inversiones.
  Haría falta el PDF y su clave en `.env`.
- Auditoría de ciberseguridad completa.
