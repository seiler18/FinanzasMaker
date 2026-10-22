# 0019 — Lo esperado del mes en vez de la proyección, y la clave del PDF

- **Fecha:** 2026-10-22
- **Estado:** página publicada y app v0.4.1 publicada el 2026-10-22; falta verlas en el celular y subir un estado de cuenta con clave
- **Commits:** el que añade este hito y el de la v0.4.1 en FinanzasMaker-android (hito 0005 allá)
- **Sigue a:** [0012](0012-cartolas-y-app-android.md) (cartolas) y [0007](0007-fecha-contable-y-tablero.md) (la cabina del resumen)

## Contexto

Jesús reportó tres cosas el 2026-10-22:

- Al subir el estado de cuenta de la tarjeta, «se rellena solo el espacio de
  la clave» y escribir la clave correcta no servía.
- La «Proyección a fin de mes» daba un número fuera de orden. Pidió que lo
  proyectado sea una comparación con lo que gastó otros meses: cuánto se
  espera que gaste este mes si sigue igual que los anteriores.
- En la app, la tarjeta «Invertido neto» se veía de otro tamaño que las demás.

## Qué se hizo

- **Clave del PDF** (`src/vistas/cartola.js`, `src/lib/cartolas/pdf.js`). La
  lectura funcionaba: se probó en Chrome con PDF cifrados en RC4-128,
  AES-128 y AES-256, clave mala y buena. La causa era el campo
  `type="password"`: Chrome lo rellena con una contraseña guardada para
  `seiler18.github.io` (ignora `autocomplete="off"` en esos campos) y lo que
  se escribía quedaba pegado a ella. Ahora es un campo de texto que se ve con
  puntos (`.clave-pdf`, `-webkit-text-security`), que ningún gestor
  reconoce. Además `variantesClave` prueba la clave como se escribió, sin
  espacios, sin puntos ni guion y sin dígito verificador: los bancos piden el
  RUT cada uno a su modo.
- **Lo esperado del mes** (`esperadoMes` en `src/lib/analisis.js`, que
  reemplaza a `proyeccionMes`). Con los últimos 3 meses con gastos:
  promedio de un mes entero, lo que llevabas al mismo día, y esperado = lo
  que llevas + lo que solías gastar del mismo día al fin de mes. La cabina
  muestra «Al día N solías llevar $X · hoy vas ▲ N %» y «Esperado a fin de
  mes $Y · promedio de 3 meses: $Z». El consejo «Proyección del mes» pasó a
  «Cómo va el mes», con las mismas cifras.
- En el mes en curso, la fila «Gasto vs el mes anterior» ya no sale: comparaba
  un mes a medias con el anterior entero y siempre decía que se gastaba menos.
- Lo mismo en la app (`Analisis.kt`, `Cabina.kt`, `AnalisisTest`), más las
  tarjetas del resumen del mismo alto por fila.
- `tests/analisis.test.mjs` imprimía el resultado y salía **antes** de las dos
  últimas pruebas (proyección y cobertura de avisos): si fallaban, nadie se
  enteraba. El resumen pasó al final.
- `tests/base.test.mjs`: en Windows, borrar la carpeta del Postgres
  desechable fallaba con EBUSY (Postgres la suelta un rato después de parar)
  y `npm run build` quedaba en rojo con las 44 pruebas en verde. Ahora
  reintenta.
- Android Studio había subido solo el wrapper de la app a Gradle 9.7.1 (el
  archivo «sin versionar»). No funciona con AGP 8.13: se deshizo (ver
  PENDIENTES, Gradle 9 va junto con AGP 9).

## Decisiones y alternativas descartadas

- **Comparar con meses anteriores y no con un ritmo diario.** El ritmo por
  día × días que faltan, aun sin los gastos grandes y mezclado con la
  historia, se dispara con cualquier mes atípico. Lo que se gasta del mismo
  día al fin de mes en meses anteriores ya incluye arriendos, cuentas y
  cuotas que caen tarde, sin tener que adivinar qué es «grande».
- **Promedio y no mediana** de los 3 meses: con tres datos la diferencia es
  poca y el promedio es lo que se entiende al leerlo.
- **Sin historia no hay cifra.** Antes se proyectaba igual con el ritmo del
  mes; ahora, sin meses anteriores con gastos, la fila no aparece.
- **Campo de texto con puntos** en vez de `autocomplete="new-password"`: con
  ese valor Chrome ofrece generar una contraseña segura, que es igual de
  confuso.

## Consecuencias

- «Gastas por día» sigue igual (sin los gastos grandes).
- La página y la app muestran las mismas filas y el mismo consejo.

## Pendiente

- Subir el estado de cuenta con clave en la página publicada y ver que abre.
- Ver en el celular, con la v0.4.1, la cabina y las tarjetas del resumen.
