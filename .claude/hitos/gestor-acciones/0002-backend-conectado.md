# 0002 — Backend conectado: la página lee la hoja real

- **Fecha:** 2026-09-27
- **Estado:** completado
- **Commits:** el de este hito (`conecto la página con la API de la hoja`)

## Contexto

El 0001 dejó el código listo y la página publicada solo en modo demo. Faltaba
que el dueño pegara `Code.gs` y `Api.gs` en la hoja, generara la clave y
publicara la aplicación web.

## Qué se hizo

- El dueño entregó el código que corría en la hoja
  (`backend/Code_Original.gs`, ignorado por `.gitignore` porque trae el
  historial). La comparación confirmó lo que el 0001 había deducido de los
  datos: solo diferían las fórmulas de G/P realizada y no realizada, ya
  alineadas en `Code.gs`, y el final reconstruido de `checkAlerts` era exacto.
- El dueño pegó el backend, generó la clave y publicó la aplicación web.
- `src/config.js`: `API_URL` con la URL `/exec`.
- Verificado con `curl` contra la URL real: `GET` → estado del servicio;
  `POST` sin clave y con una clave falsa → `{"ok":false,"sesion":false}`.

## Decisiones y alternativas descartadas

- **La prueba con la clave buena la hace el dueño en la página**, no desde la
  terminal: la clave no pasa por la sesión del agente ni queda en su historial.
  Por la misma razón no se probó el caso «datos reales» con `curl`.

## Consecuencias

- La URL `/exec` queda fija: actualizar el backend es **Nueva versión** de esta
  implementación (skill `desplegar-backend`), nunca una implementación nueva.
- El primer `GET` a la URL devolvió una vez la página «No se pudo abrir el
  archivo» de Drive; el siguiente, el JSON correcto. Fue un fallo pasajero de
  la redirección de Google. Si se repite de forma sostenida, está en la tabla
  de diagnóstico de `desplegar-backend`.

## Pendiente

- Que el dueño entre con su clave y confirme que los totales coinciden con los
  de la pestaña Dashboard de la hoja.
- Enlazar el proyecto en el portafolio (tres sitios, `../CLAUDE.md`).
- Lo que el 0001 dejó pendiente (splits, `num_`, comisión estimada, Excel).
