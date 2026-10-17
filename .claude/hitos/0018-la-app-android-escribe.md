# 0018 — La app Android también escribe: Agregar, Por revisar, editar

- **Fecha:** 2026-10-17
- **Estado:** app v0.4.0 probada en el PC; falta publicarla y probar las escrituras en el celular
- **Commits:** el que añade este hito (aquí, comentarios y documentación) y el de la v0.4.0 en FinanzasMaker-android
- **Sigue a:** [0017](0017-la-app-android-con-pantallas-propias.md), donde la app solo leía

## Contexto

Con la app v0.3.0 en uso, Jesús pidió lo que faltaba de la página: Agregar,
Por revisar y Cuotas. Inversiones queda solo en la web: está hecha para
Fintual. El detalle está en el hito 0004 de FinanzasMaker-android.

## Qué se hizo

- La app escribe con la sesión del dueño lo mismo que `ACCIONES` de
  `src/lib/datos.js`: movimientos manuales, ediciones (con la regla por
  contraparte), eliminaciones y `decidir_revisar`.
- `src/lib/reglas.js` y `src/lib/validar.js` tienen ahora una copia en
  Kotlin (`nucleo/Reglas.kt`, `nucleo/Validar.kt`). Una línea más en la
  regla 10 de `CLAUDE.md` y un comentario en `validar.js`. En `reglas.js` no:
  tiene que ser idéntico a la copia de la función `notificacion` (lo prueba
  `npm test`), y un comentario obligaría a redesplegarla.

## Decisiones y alternativas descartadas

- **Sin cambios en la base.** La RLS y los CHECK de `movimientos`,
  `reglas` y `revisar` ya cubren a cualquier cliente con sesión; la app usa
  las mismas tablas y la misma función que la página.
- **Copiar la validación y no moverla a la base** (una función SQL
  `agregar_movimiento`): la página escribe directo desde la v2 y cambiar eso
  era tocar los dos lados. Si las copias se separan, esa es la salida, igual
  que con los cálculos (hito 0017).

## Consecuencias

- `reglas.js` ya tiene cuatro versiones que deben calzar: esta, la copia de
  la función `notificacion`, `categorizar_` del trabajador y la de la app.
- Lo que solo hace la página: cartolas en PDF, presupuestos y Config,
  «Revisar correos ahora», Inversiones y revocar celulares.

## Pendiente

- Publicar la app v0.4.0 y probar en el celular (`PENDIENTES.md`, punto 2).
