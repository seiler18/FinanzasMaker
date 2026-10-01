# 0008 — Vista «Cuotas»: impuesto de timbres estimado

- **Fecha:** 2026-10-01
- **Estado:** completado; fórmula contrastada con un estado de cuenta real de Tenpo (MACH queda parcial)
- **Commits:** sin commitear al escribir esto

## Contexto

En Chile el banco cobra el impuesto de timbres y estampillas (DL 3475) a las
compras en cuotas, aunque sean sin interés. Jesús lo recordaba como «0,066 %
hasta 0,08 %» y pidió un apartado que estime lo que le cobrarán en el mes.

## Qué se averiguó

- **0,066 % del monto por cada mes o fracción de plazo, con tope de 0,8 %**
  (no 0,08 %). El tope se alcanza desde las 13 cuotas (12 × 0,066 = 0,792 %).
- Lo recauda el banco. Según el Banco de Chile se calcula sobre el total de la
  operación y se carga **completo en el primer estado de cuenta posterior** a
  la compra, no repartido en las cuotas.
- El SII dice que **3 cuotas «precio contado»** no es operación de crédito y no
  paga. **El banco no lo aplica** (ver «Contraste con estados de cuenta»).
- No se encontró norma 2026 que cambie nada. Las fuentes que traen la cifra
  son páginas del SII y del Banco de Chile; el texto del DL no se pudo leer
  directo (PDF ilegible para la herramienta), así que la cifra se contrastó
  entre tres fuentes secundarias.

## Contraste con estados de cuenta reales

Se abrieron los PDF de septiembre 2026 de Tenpo y MACH (carpeta local
`estados-de-cuenta/`, ignorada por git; las claves de los PDF van en `.env`).
No se copió ningún monto real al repo.

- **Tenpo, exacto al peso:** el cargo «IMPUESTO DECRETO LEY 3475 TASA 0,066 %»
  es `monto × 0,066 % × cuotas`, redondeado. Se verificó con tres compras
  en 3 cuotas «(0,00 %)»: **las sin interés pagan igual**, también las de 3
  cuotas. El cargo sale en el **mismo estado de cuenta**, 1 o 2 días después
  de la compra (no en el siguiente, como decía el Banco de Chile).
- **MACH, parcial:** un cargo equivale a 0,066 % sobre una compra de 1 cuota
  (en Tenpo no pasó) y una compra en 3 cuotas hecha dos días antes del cierre
  no traía cargo aún. Falta ver el estado de cuenta siguiente para saber si
  se cobra al facturar la primera cuota.

## Qué se hizo

- `timbreCuotas`, `comprasEnCuotas`, `timbrePorMes` en `analisis.js` (con
  `TIMBRE = {tasaMes, tope}` en un solo sitio). Usan el mes contable: una
  compra con `fecha_contable` cuenta donde la fijó el dueño.
- Vista `src/vistas/cuotas.js` (pestaña «Cuotas», mensual): impuesto estimado,
  total comprado en cuotas, proyección a fin de mes (solo mes en curso, desde
  el día 5), tabla por compra con su tasa, últimos 6 meses y la explicación del
  cálculo. El consejo de cuotas suma ahora la estimación.
- La barra del celular pasa a 7 pestañas.

## Decisiones y alternativas descartadas

- **Estimación, no gasto registrado.** El impuesto llega en el estado de
  cuenta, que la app no lee a propósito (hito 0006). No se inserta en la hoja.
- **Por mes de compra, no de cargo.** No se conoce la fecha de cierre de cada
  tarjeta; la nota de la vista dice que cae en el primer estado de cuenta
  posterior.
- **Sin excepción para 3 cuotas.** Se había previsto una casilla para quitarlas
  ("precio contado" del SII); los estados de cuenta mostraron que el banco las
  cobra, y se quitó.

## Pendiente

- Revisar el próximo estado de cuenta de MACH (21 de octubre) para entender el
  cargo sobre 1 cuota y cuándo cobra el de 3 cuotas.
