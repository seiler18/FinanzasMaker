# 0007 — Efectos de interacción según la temática (inversiones)

- **Fecha:** 2026-10-03
- **Estado:** completado en el código (sin commitear ni publicar al escribir esto); falta el visto bueno visual
- **Commits:** pendiente

## Contexto

Los demás sitios del portafolio recibieron una tanda de efectos (Curriculo hito
0023, hub 0004). Aquí ya existían los más caros: secciones que aparecen, cifras
que cuentan, barras/arcos/sparklines que se dibujan al entrar y luz que sigue
al puntero en los mosaicos (hitos 0003 y 0006). Esta tanda solo añade lo que
faltaba, y lo ata al tono del resultado —sube o baja—, que es lo que este
dashboard tiene que decir primero.

## Qué se hizo

- **Fondo de puntos en la tarjeta «Resultado total»** (`src/lib/fondo-hero.js`
  sobre `src/lib/fondo-dotField.js`, copia del port de React Bits hecho en
  Curriculo, con su aviso de licencia): verde si gana, rojo si pierde, gris en
  cero. Se vuelve a montar al cambiar de tema, porque el canvas guarda el color
  con que nació.
- **«El resultado aterriza»:** al terminar de contar la cifra grande
  (`--dur-cuenta`), el marco respira una vez en el tono del resultado.
- **Flecha ▲ / ▼** delante del porcentaje, que entra desde el lado al que va.
  Es además una señal que no depende del color.
- **Luz que sigue al puntero también en las tres partes** (realizado + no
  realizado + dividendos): se extendió el listener que ya había para `.tile`.
- **Imán** en «Entrar con clave» y «Mostrar los N movimientos», y **chispas** en
  el segundo (`src/lib/efectos.js`, subconjunto del módulo de Curriculo).
- **Destello verde** que recorre el nombre «Gestor de acciones» cada 7 s.
- Estilos en `src/styles/efectos.css`; tokens nuevos `--ciclo-brillo`,
  `--espera-brillo`, `--brillo-texto` en `tokens.css`.

## Decisiones y alternativas descartadas

- **No se copiaron los contadores ni el brillo de `efectos.js`:** `movimiento.js`
  y el listener de `main.js` ya hacen lo mismo. Dos sistemas para lo mismo es
  cómo se llega a que dos cifras cuenten a ritmos distintos.
- **Los contadores no se vuelven a animar al refrescar:** `contar()` ya borra
  `data-cuenta` tras la primera vez, y la página no tiene refresco automático
  (los datos se piden al entrar o al poner la clave). Un «flash» verde/rojo al
  cambiar una cifra no tendría cuándo dispararse, así que **no se hizo**.
- **Sin sparklines nuevos ni cifras inventadas:** los de los mosaicos ya
  salen de `evolucion()`.
- **Chispas no van en el acceso con clave:** ese botón abre un `<dialog>`, que
  va en la capa superior del navegador y las taparía. Tampoco en «Entrar» del
  propio diálogo, por lo mismo.
- **Título por palabras: no aplica.** El nombre es una línea corta y de color
  liso; no aporta nada en un dashboard.
- **`box-shadow` y `background-position` animados** (el marco que respira y el
  destello): excepciones a «solo transform y opacity», igual que `destello` en
  `movimiento.css`. Repintan un elemento, no recalculan la maqueta.
- **Imán con `translate`, no `transform`**, y la propiedad añadida a la lista de
  `transition` de esos botones.
- **Canvas por CSSOM** (`Object.assign(canvas.style, …)`): la CSP
  (`style-src 'self'`) no admite estilos escritos como atributo. Probado contra
  el build con la CSP puesta: sin errores.

## Consecuencias

- Sin dependencias nuevas. `npm run check`, `npm test` y `npm run build` pasan.
- Verificado con Playwright contra `npm run preview` (CSP activa): lienzo
  montado con el tono del resultado, animación `aterriza`, flecha, destello,
  luz en `.parte`, imán de 6 px, 8 chispas que se limpian, el lienzo se
  remonta al cambiar de tema y con «menos movimiento» ninguna animación corre.
  Sin errores de consola. **Sin visto bueno visual del usuario.**
- Solo se probó con la demo (datos inventados). La cartera real no se tocó.

## Pendiente

- Visto bueno visual, sobre todo la presencia de los puntos (`opacidad` y
  `radio` en `fondo-hero.js`, hoy 0.5 y 2) y si el destello del nombre sobra.
- Probar en móvil real.
