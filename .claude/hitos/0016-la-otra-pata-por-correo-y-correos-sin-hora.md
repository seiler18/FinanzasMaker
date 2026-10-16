# 0016 — La otra pata por correo y los correos sin hora

- **Fecha:** 2026-10-16
- **Estado:** escrito y probado; falta desplegar la 0009 y releer los avisos crudos
- **Commits:** el que añade este hito

## Contexto

Con la 0008 y la función ya desplegadas, se corrió en ensayo
`scripts/releer-avisos.mjs` sobre los 34 avisos crudos. 22 salían ignorados
(publicidad, Fintual, sesión, códigos), 3 «ya estaba» y 7 «nueva». Al cruzar
esos 7 con lo que había traído el correo:

- MACH recibió $319, $640 y $680 desde Copec Pay (12 y 14 de octubre). Copec
  Pay no avisa al celular, y su correo registró su pata como `interna`. El
  aviso de MACH sumaba un ingreso que no fue: `emparejar_aviso` solo juntaba
  aviso con aviso.
- Tenpo, $8.000: el correo de las transferencias de Tenpo trae solo la fecha y
  quedó a las 00:00. El aviso, a las 12:38, no lo reconocía (ventana de 4
  horas) y la transferencia se contaba dos veces.
- MACH, $5.000: el correo lo trajo como ingreso en «Bci», el mismo día, sin
  hora.
- Tenpo, compra de $14.748 del 14 de octubre: **ningún correo la trajo**. Era
  una compra que faltaba.
- BancoEstado → MACH, $180.840: se empareja como debía (0008).

Los dos primeros problemas no son solo de los avisos viejos: pasan con cada
transferencia de Copec Pay a MACH y cada transferencia de Tenpo de aquí en
adelante.

## Qué se hizo

- Migración `0009_parejas_con_el_correo.sql`:
  - `cerca(a, b, segundos)`: una fecha a las 00:00 se compara por día. La
    usan `tramitar_aviso` (¿el correo ya lo trajo?) y `absorber_aviso` (¿hay
    un aviso que completar?). Si el correo sin hora completa un aviso, se
    queda la hora del aviso.
  - `emparejar_aviso`: si no hay otra pata por aviso, busca una interna del
    correo en otro banco (mismo monto, cerca) que ningún aviso haya
    reclamado; el aviso pasa a interna «Desde/Hacia <banco>».
  - `absorber_aviso`: cuando llega una interna por correo, convierte en
    interna el aviso sin contraparte de otro banco que era su otra pata.
- `scripts/releer-avisos.mjs`: `--ignorar <ids>` para los avisos viejos que
  el correo ya trajo de otra forma, y el ensayo muestra cómo queda cada
  movimiento después de emparejarse.
- Pruebas en `tests/base.test.mjs`: los dos órdenes, una interna del correo
  para un solo aviso, correo sin hora del mismo día y de otro día.

## Decisiones y alternativas descartadas

- **Solo se toca la fila del aviso.** La del correo ya está bien
  (`interna`, con su contraparte); cambiarla perdería lo que el correo sabe.
- **00:00 = sin hora, comparado por día.** Se descartó cambiar los lectores
  de `Lectores.gs` para que pongan otra marca: obliga a redesplegar el Apps
  Script y no arregla las filas que ya están. Riesgo aceptado: algo hecho de
  verdad a medianoche se compara por día; sigue siendo mismo banco, monto y
  sentido, y una sola pareja.
- **El #11 se ignora a mano, no con una regla.** «Bci» en el correo y «MACH»
  en el aviso podrían ser lo mismo o no (Bci es el banco de MACH, pero el
  correo puede ser el comprobante de quien envió). Con un caso, no se
  justifica una equivalencia de nombres que después confunda otros.

## Consecuencias

- Antes de `releer-avisos.mjs --aplicar`, mirar los «nueva» del ensayo contra
  lo que trajo el correo; lo repetido va en `--ignorar`.

## Pendiente

- Desplegar la 0009 (`db push`; la función no cambia).
- Releer: `node scripts/releer-avisos.mjs --aplicar --ignorar 11`.
