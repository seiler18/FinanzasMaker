# 0009 — Efectos de interacción y delta flotante en las cifras

- **Fecha:** 2026-10-03
- **Estado:** completado, pendiente de visto bueno visual y de commit
- **Commits:** sin commitear al escribir esto

## Contexto

Curriculo y el hub (hitos 0023 y 0004 de cada uno) recibieron un fondo de
puntos y efectos de interacción pequeños. Se pidió lo mismo aquí, adaptado a la
temática: finanzas. FinanzasMaker **ya traía** varias de esas cosas
(contadores en `cuenta.js`, luz que sigue al puntero en las tarjetas del
Resumen, auroras, rejilla, sparklines, entrada escalonada), así que no se
duplicaron: se añadió lo que faltaba y se pensó un efecto propio del tema.

## Qué se hizo

- **Matriz de puntos** (`src/lib/fondo-dotField.js`, copia del port del
  Curriculo) en la portada de ingreso (`.ingreso-puntos`, la cara pública del
  sitio) y en la cabina del Resumen (`.cabina-puntos`, la del modo demo). Los
  colores salen de `--ing-aurora-1/2`.
- **Delta flotante** (`src/lib/cuenta.js`, el efecto propio de la temática):
  si una cifra vuelve a pintarse en el mismo periodo con OTRO valor, no cuenta
  desde 0 sino desde el anterior y suelta un chip con la diferencia
  («+$25.000»). Verde si el cambio es bueno para las finanzas, rojo si es
  malo; `data-sube` dice qué es bueno en cada cifra (ingresos y ahorro: subir;
  gastos: bajar; invertido neto: neutro).
- **Chispas al guardar un movimiento** (`soltarChispas` en `efectos.js`,
  llamada desde `vistas/agregar.js`): salen **tras** el guardado correcto, no
  en el clic.
- **Brillo que sigue al cursor en las tarjetas de Consejos** (`initBrillo`),
  el mismo resplandor que ya tenían las del Resumen.
- **Botón de la demo que se acerca al cursor** (`initMagnetico('.btn-demo')`).
- **Destello que recorre «leídas solas.»** en la portada de ingreso.
- `src/styles/efectos.css` (importado antes de `movil.css`) y cuatro tokens
  nuevos en `tokens.css`: `--brillo-texto`, `--ciclo-brillo`, `--espera-brillo`,
  `--ciclo-delta`.

## Decisiones y alternativas descartadas

- **Delta flotante en vez de «parpadeo verde/rojo»**: parpadear una cifra se
  lee como un error de la página; un chip con la diferencia responde a «¿qué
  hizo lo que acabo de registrar?». Es la única cosa nueva que no viene de los
  otros sitios, y no inventa datos: resta dos valores que la página ya calculó.
  La memoria vive solo en el módulo (se pierde al recargar) y entra el periodo
  en la clave, así que pasar de un mes a otro no cuenta como «cambio».
- **No se duplicaron los contadores ni el brillo de las tarjetas del Resumen**:
  ya existían. Solo se amplió el conteo para partir del valor anterior.
- **Chispas desde el resultado, no desde el clic**: `initChispas` (por clic)
  celebraría un «Guardar» con el formulario inválido. Por eso `soltarChispas`
  se exporta aparte. Probado: formulario sin monto → 0 chispas; guardado
  correcto → 8 chispas a los ~100 ms (el guardado es asíncrono).
- **Chispas no en `.btn-demo`**: ese botón navega a otra página y las chispas
  morirían con ella.
- **Título por palabras: no aplicado.** El titular de la portada lleva
  degradado recortado al texto (`.degradado-texto`) y esa combinación deja el
  texto invisible (aprendido en el hub). El destello usa `background-image`
  suelto, nunca el atajo `background`.
- **Fondo de puntos en la cabina**: se añadió sin quitar su rejilla CSS. Si el
  conjunto resulta recargado, la rejilla (`.cabina-rejilla`) es lo primero que
  se quita.
- **Cambios sobre la copia de `efectos.js` / `fondo-dotField.js`** respecto a
  la del Curriculo, necesarios aquí porque las vistas se repintan enteras:
  `fondo-dotField` se **autodestruye si su canvas sale del documento** (si no,
  cada cambio de periodo dejaba un intervalo de 20 ms y varios listeners
  vivos), e `initMagnetico` retira su listener cuando ya no queda ningún botón
  conectado. `soltarChispas` es nueva. Ninguno de esos tres cambios está en la
  copia del Curriculo ni del hub.

## Consecuencias

- Sin dependencias nuevas (todo es JS propio). `npm run check`, los 173 tests
  y el build pasan.
- La excepción a «solo transform y opacity»: el destello mueve el fondo
  recortado al texto. Documentada en `efectos.css`.
- Probado en navegador (Playwright contra `preview`): canvas montado en login
  y cabina; imán 9 px; delta con la clase y el signo correctos (gastos +$25.000
  en rojo, ahorro −$25.000 en rojo, ingresos sin chip) y que desaparece a los
  ~2 s; sin fugas de canvas tras cambiar de periodo; brillo de Consejos con
  `--mx`; movimiento reducido sin efectos (las cifras quedan en su valor).
  **Sin visto bueno visual del usuario.** Un fallo de maquetación se vio y se
  corrigió: el chip tapaba la flecha de «ver detalle» de las tarjetas.

## Pendiente

- Visto bueno visual y prueba en un móvil real.
- Ajustables: `opacidad`, `ondulacion`, `alcance` y `abombado` de cada
  `montarDotField` (en `main.js` y `vistas/resumen.js`); `--ciclo-delta`,
  `--ciclo-brillo` en `tokens.css`.
- Sincronizar las tres mejoras a `efectos.js` / `fondo-dotField.js` con el
  Curriculo y el hub si se quiere una sola versión.
