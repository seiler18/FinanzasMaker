# 0003 — La primera instalación importó 0 correos: Sheets convirtió «desde» en fecha

- **Fecha:** 2026-09-27
- **Estado:** completado en el repo; falta pegar los `.gs` en Apps Script
- **Commits:** pendiente de commit

## Contexto

Con el backend instalado, Jesús ejecutó `ensayo()` y `procesarCorreos()`, y
los dos terminaron en 0 en todo. La planilla tenía las pestañas y las reglas
creadas, pero ni un correo.

## Qué se hizo

- **Diagnóstico.** La consulta que arma `consulta_()`, probada tal cual contra
  su Gmail con el conector, devolvía más de 200 hilos: la consulta estaba bien.
  El problema era el valor. `sembrar_()` escribió `desde = 2026/01/01` en
  Config, Sheets lo convirtió en una fecha, y `String(fecha)` dejó la búsqueda
  como `after:Thu Jan 01 2026 00:00:00 GMT-0300 (…)`, que no calza con nada.
  El simulador de Sheets de las pruebas guardaba el texto tal cual, así que no
  lo vio.
- **Segundo daño.** `procesarCorreos()` dio por terminada la pasada vacía y
  movió el cursor a «ahora − 2 días». Sin corregirlo, enero a septiembre no se
  habrían importado nunca.
- **Arreglos** (`backend/Code.gs`):
  - `COLUMNAS_TEXTO` + `aCelda_()`: fechas, id de Gmail, referencias y valores
    de Config se escriben con apóstrofo (texto forzado). El id de Gmail tenía
    el mismo riesgo: uno hexadecimal como `18012345e6789012` se lee como número.
  - `deCelda_()`: lo que ya quedó convertido en planillas existentes se vuelve
    a texto al leer (la Config de Jesús se arregla sola).
  - `esFecha_()` en vez de `instanceof Date`, que falla con fechas de otro
    contexto.
  - La pasada guarda su `base` (el `desde` con que empezó). Si no coincide con
    Config, se reimporta desde la fecha de Config; lo ya registrado se salta
    por id. La pasada rota de Jesús no tiene `base`, así que se reinicia sola.
  - `diagnostico()` y `reiniciarImportacion()` para el editor.
  - Los correos de remitentes no bancarios (GitHub, tiendas) que trae la
    búsqueda por asunto se descartan antes de leer el cuerpo, que es lo lento.
- **Pruebas.** El simulador ahora convierte en `Date` el texto con forma de
  fecha y quita el apóstrofo, como Sheets. La prueba nueva reproducía la
  consulta rota exacta antes del arreglo. En total son 142.
- `src/config.js`: `CLIENT_ID` definido. La página deja el modo demo y muestra
  el ingreso con Google.

## Decisiones y alternativas descartadas

- Se descartó arreglar solo la celda a mano (formato texto en Config): le
  pasaría igual a cualquiera que instale, y a cualquier columna de fecha.

## Consecuencias

- Toda columna nueva con fechas, ids o códigos va en `COLUMNAS_TEXTO`.
- Si algo sale en 0, lo primero es `diagnostico()` (skill `desplegar-backend`).

## Pendiente

- Jesús debe pegar `Code.gs` y `Lectores.gs` nuevos en Apps Script,
  redesplegar como versión nueva y correr `procesarCorreos`.
