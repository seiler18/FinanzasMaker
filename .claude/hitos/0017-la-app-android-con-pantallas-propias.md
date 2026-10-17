# 0017 — La app Android deja de abrir la página: pantallas propias

- **Fecha:** 2026-10-17
- **Estado:** escrito y probado en el PC (app v0.3.0); falta el cliente OAuth Android en Google Cloud, publicar la versión y verla en el celular
- **Commits:** el que añade este hito (aquí, solo comentarios y documentación) y el de la v0.3.0 en FinanzasMaker-android
- **Cambia:** lo que el [0015](0015-bancos-por-aviso-y-la-app-muestra-la-pagina.md) decidió sobre la página dentro de la app

## Contexto

Desde el 0015 la app Android abría esta página como Trusted Web Activity.
En el celular de Jesús eso era Edge (su navegador predeterminado): se veía y
se sentía como Edge. Pidió que la app tenga su ingreso con Google, su
configuración y los gráficos y cifras de la página, pero dibujados por ella.
El detalle está en el hito 0003 de FinanzasMaker-android.

## Qué se hizo

- En la app (otro repo): ingreso con Google nativo (Credential Manager) que
  canjea el ID token en Supabase igual que `src/lib/sesion.js`; lectura de
  `movimientos`, `presupuestos` y `revisar` con esa sesión; Resumen,
  Movimientos, Consejos y Ajustes propios; vincular el celular con un toque
  (`crear_dispositivo` con la sesión).
- Los cálculos de `src/lib/analisis.js`, `variacion` y `filasCabina` de
  `src/vistas/resumen.js` y `src/lib/formato.js`, copiados a Kotlin. Su
  prueba repite los casos de `tests/analisis.test.mjs`.
- Aquí: la gemela nueva en la regla 10 de `CLAUDE.md` y un comentario en
  cada archivo gemelo; el texto de la pieza «Celular».

## Decisiones y alternativas descartadas

- **Sin cambios en Supabase.** La app pide el token para el mismo cliente
  web que usa la página, que es la audiencia que `[auth.external.google]`
  ya acepta. La alternativa (sumar el cliente Android a los client_id de
  Supabase) pedía un `config push` sin ganar nada.
- **La app solo lee.** Anotar, editar, decidir «Por revisar» y las cartolas
  siguen aquí: duplicar la escritura duplicaría también la validación
  (`validar.js`, reglas) y sus gemelas.
- **Los cálculos se duplican, con prueba**, en vez de moverlos a la base
  (una vista o una función SQL que ambos lean): la página calcula en el
  navegador desde la v1 y moverlo era rehacer el resumen de los dos lados.
  Si las gemelas empiezan a separarse, esa es la salida.

## Consecuencias

- `src/lib/app-android.js` (el enlace «Estado de la app») queda sin uso: la
  app ya no carga la página. Se puede retirar junto con `assetlinks.json` del
  hub (`seiler18.github.io`).
- Renombrar una columna de `movimientos` o `presupuestos` rompe la app hasta
  su próxima versión (`Movimiento.COLUMNAS` allá).
- Un cambio en qué suma o en los consejos se hace en los dos repos.

## Pendiente

- Cliente OAuth **Android** en Google Cloud (README de la app, «Ingreso con
  Google»), publicar la v0.3.0 e instalarla (`PENDIENTES.md`, punto 2).
- Comparar en el celular el resumen de un mes con el de la página.
