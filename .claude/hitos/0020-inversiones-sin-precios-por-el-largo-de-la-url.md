# 0020 — Inversiones dejó de actualizarse: la URL pasó los 2 kB

- **Fecha:** 2026-10-23
- **Estado:** corregido en el repo; falta pegar `Supabase.gs`, `Acciones.gs` y `Code.gs` en el Apps Script (`PENDIENTES.md`)
- **Commits:** el que añade este hito
- **Sigue a:** [0011](0011-v2-supabase-inversiones-y-trabajador.md) (Inversiones en el trabajador)

## Contexto

El 2026-10-23 Jesús avisó que la página de Inversiones decía que los precios
no se actualizaban hace 4 días. En la base: `acciones_precios` y
`estado_trabajador.ultima_acciones` se quedaron en 2026-10-20 00:06 UTC
(19-10 21:06 en Chile), mientras `procesarCorreos` seguía al día.

En los registros de Supabase, `actualizarAcciones` seguía corriendo cada hora
(:06), pero después de leer `config` no hacía ninguna petición más: se caía
entre la búsqueda en Gmail y la consulta de los `gmail_id` ya registrados.
Google no mandó ningún correo de fallos.

## Qué se hizo

- **La causa.** `leerCorreosAcciones_` preguntaba por los ids ya registrados
  de a 100 en una sola URL (`gmail_id=in.(…)`). Codificado, cada id de Gmail
  ocupa 25 caracteres (`%22` + 16 hex + `%22` + `%2C`), y la URL completa
  mide 149 + 25·n. UrlFetchApp no manda una URL de más de 2.048 caracteres
  («Limit Exceeded: URLFetch URL Length»). A las 00:06 había 74 correos de
  Fintual (1.999 caracteres); a las 00:35 y 00:36 llegaron dos «Invertiremos
  tu plata» y con 76 (2.049) se pasó por un carácter. Desde entonces se caía
  en cada corrida, antes de llegar a los precios.
- **`leerEn_(tabla, consulta, col, valores)`** en `Supabase.gs`: la misma
  consulta de a `IN_POR_URL` = 50 valores (unos 1.400 caracteres), pasando
  por `sbConsulta_` como todas. La usan `leerCorreosAcciones_` y la pasada de
  correos de `Code.gs`, que tenía el mismo riesgo si un lote de 40 hilos traía
  más de 76 mensajes nuevos.
- **El Apps Script falso** (`tests/apps-script-falso.mjs`) ahora rechaza una
  URL que, con el largo de la del proyecto real, pase los 2.048 caracteres.
  La prueba nueva de `tests/acciones.test.mjs` (100 correos con ids de 16
  hex) falla sin el arreglo con el mismo error de Google.

## Decisiones y alternativas descartadas

- **Leer por POST o con una función RPC:** descartado; dividir la lista no
  cambia la base ni los permisos.
- **Bajar el tope de la búsqueda de Gmail:** descartado; la lista de ids
  crece igual con el tiempo y el problema volvería.

## Consecuencias

Ninguna en lo que se guarda: son las mismas consultas en más tandas (2 en
vez de 1 por hora con los ~85 correos de Fintual de hoy).

## Pendiente

- Pegar `Supabase.gs`, `Acciones.gs` y `Code.gs` en el editor (skill
  `desplegar-backend`) y correr `actualizarAcciones` a mano para ver los
  precios al día.
