# 0014 — Los avisos del celular ya son movimientos

- **Fecha:** 2026-10-14
- **Estado:** escrito y probado; falta desplegar la migración 0007 y la función (ver `PENDIENTES.md`)
- **Commits:** el que añade este hito

## Contexto

Tras el hito 0013 la app Android manda los avisos de los bancos, pero se
guardaban crudos: la página seguía leyendo solo el correo, que lee Apps Script.
Jesús quiere dejar de depender de Apps Script. Esta es la primera fase: que el
aviso se convierta en movimiento sin pasar por el correo.

## Qué se hizo

- **Lectores de avisos** (`supabase/functions/notificacion/lectores.js`), uno
  por formato visto en avisos reales:
  - MACH: compra con tarjeta de crédito o débito, y transferencia recibida;
  - Tenpo: compra con tarjeta de crédito (con la hora que dice el aviso) y
    transferencia enviada.
  Lo que no aporta (sesión expirada, códigos de validación, promociones,
  cashback acumulado) se marca `ignorada`. Lo que no se conoce queda `cruda`.
- **La función `notificacion`** guarda el aviso, lo lee, lo categoriza con las
  reglas del dueño (`reglas.js`, copia de `src/lib/reglas.js`) y llama a
  `aplicar_aviso()`. Si cualquier paso falla, el aviso queda crudo y el celular
  recibe igual su 2xx.
- **Migración 0007:** `aplicar_aviso`, `contexto_aviso` y el trigger
  `absorber_aviso`, solo para la clave de servicio.

## Decisiones y alternativas descartadas

- **Una misma compra no se cuenta dos veces: se resuelve en la base, no en
  Apps Script.** Mientras el correo siga activo, la compra llega por los dos
  lados.
  - Aviso primero: el correo, al insertarse, completa la fila del aviso (trigger
    `BEFORE INSERT` que devuelve `null`) en vez de duplicarla.
  - Correo primero: el aviso reconoce el movimiento y no crea otro.
  - Cada movimiento del correo se empareja con **un** solo aviso
    (`notificaciones.movimiento`), así dos compras iguales el mismo día no se
    funden.
  - «Mismo» = banco, producto y monto, sentido compatible y ≤ 4 horas.
  - Se descartó cambiar `Code.gs`: obliga a pegarlo a mano en el editor y la
    lógica queda partida en dos lugares.
- **Lo que el aviso no dice no se inventa.** La transferencia recibida de MACH
  no trae quién la envió: entra como ingreso sin contraparte y el correo la
  completa (puede resultar «entre mis cuentas»). Si el correo se apaga, esos
  casos quedan como ingreso o gasto provisional hasta la cartola del mes.
- **El cashback depositado de MACH no se lee todavía.** El correo que sí cuenta
  es el del retiro, días antes que el aviso del depósito: leer los dos
  duplicaría el ingreso. Queda cruda.
- **`reglas.js` copiado, no importado.** La función se empaqueta sola y no
  puede alcanzar `src/`. Una prueba exige que sean idénticos.

## Consecuencias

- **Apps Script sigue siendo necesario** para todo lo que ningún aviso trae:
  Fintual, precios de Yahoo, alertas y los formatos de correo sin aviso.
- Un código de validación de Tenpo llegó en un aviso y está guardado crudo en
  `notificaciones`. No se usa, pero sería mejor no guardarlo: pendiente.

## Pendiente

- Desplegar la 0007 y después la función.
- Comprobar con compras reales que cada una queda en un movimiento.
- Más formatos: transferencias enviadas de MACH, Copec Pay, Mercado Pago,
  BancoEstado. Dejar su fixture y sumar el lector.
- Apagar el correo, cuando se confíe en los avisos.
- Fintual, precios y alertas fuera de Apps Script.
