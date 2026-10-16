# 0015 — Bancos por aviso, transferencias entre tus cuentas y la página dentro de la app

- **Fecha:** 2026-10-16
- **Estado:** escrito y probado; falta desplegar la 0008 y la función, y publicar la app v0.2.0 (ver `PENDIENTES.md`)
- **Commits:** el que añade este hito

## Contexto

Lo que se vio en la base el 2026-10-16, dos días después de desplegar la 0007:

- Cuatro operaciones reales llegaron por aviso: dos compras con tarjeta de
  crédito en Tenpo, una en MACH y una transferencia recibida en MACH. **Ninguna
  se duplicó** con su correo (las de Tenpo las completó el correo).
- La transferencia de $180.840 a MACH quedó como **ingreso**, y era plata
  tuya: salió de BancoEstado. El aviso de BancoEstado («has realizado una
  transferencia a Jesus Seiler … de Bci/machbank») quedó crudo, porque no
  había lector, y el de MACH no dice de quién viene.
- Los demás crudos eran publicidad (BancoEstado, Copec Pay, CencoPay), un
  recordatorio de cuenta por pagar (Mercado Pago) y avisos de Fintual sin
  monto.
- Lo que en esos días llegó **solo por correo**: transferencias entre tus
  cuentas en Copec Pay y Tenpo, y un ingreso en Bci.

Jesús pidió dos cosas: avanzar para dejar de depender del correo, salvo para
las acciones de Fintual, que solo avisa por correo; y que la app del celular
muestre lo mismo que la página, sin dejar de tener la web.

## Qué se hizo

- **Lectores** (`supabase/functions/notificacion/lectores.js`):
  - transferencia enviada de BancoEstado: hacia ti mismo es `interna` con
    «Hacia <banco>»; hacia tu cuenta externa (Mercado Pago), gasto «Hacia
    Mercado Pago»; hacia otro, gasto;
  - publicidad y recordatorios de pago se marcan ignorados; se miran
    **después** de los lectores del banco;
  - los avisos de Fintual se ignoran: Fintual sigue por correo.
- **Migración 0008** (`0008_bancos_por_aviso.sql`):
  - `contexto_aviso` devuelve `titular` y `externas`;
  - `emparejar_aviso` junta las dos patas de una transferencia entre tus
    cuentas: mismo monto, bancos distintos, una sale y la otra entra, a ≤ 10
    minutos → las dos `interna`;
  - `bancos_por_aviso` (Config): el correo de esos bancos solo completa su
    aviso; sin aviso, va a «Por revisar» (`absorber_aviso`);
  - `aplicar_aviso` se partió: `tramitar_aviso(id, …)` trabaja por id.
- `scripts/releer-avisos.mjs`: lee otra vez los avisos crudos con los lectores
  de hoy. En ensayo tramita y deshace, así muestra si cada uno sería nuevo o
  ya estaba.
- **Página:**
  - Ajustes → Celular muestra «Qué llega por el celular», por banco: por aviso
    o solo por correo (`coberturaAvisos`);
  - el enlace «Estado de la app» aparece cuando la página está dentro de la
    app (`src/lib/app-android.js`);
  - Config tiene la clave nueva (`config-base.js` ↔ `CONFIG_BASE` de
    `Code.gs`).
- **La app Android muestra esta página** (su hito 0002, v0.2.0). La verifica
  `assetlinks.json` en el hub (su hito 0007).

## Decisiones y alternativas descartadas

- **Apagar el correo banco por banco, y en la base, no en Apps Script.** No
  se puede apagar todo hoy: Copec Pay no mandó ningún aviso de movimiento, y
  faltan las transferencias enviadas de MACH, las recibidas de Tenpo y de
  BancoEstado, los pagos de tarjeta… Apagarlo de golpe perdería esos
  movimientos sin que nadie lo note. Con `bancos_por_aviso` el trabajador no
  cambia (no hay que pegar `Code.gs`; la clave nueva en `CONFIG_BASE` es solo
  la gemela), y el correo de un banco ya apagado no se pierde: aparece en «Por
  revisar» y se registra con un toque. Eso mismo muestra qué le falta al
  aviso.
- **Se desvía solo lo que escribe el trabajador** (`auth.uid()` nulo). Lo que
  registra la página desde «Por revisar» entra: si no, daría vueltas sin fin.
- **Emparejar las patas por monto y hora, solo entre avisos.** Lo del correo
  ya viene resuelto (sabe quién envió), así que no se toca. Riesgo aceptado:
  $X a un tercero desde un banco y exactamente $X de otro tercero en otro
  banco en los mismos 10 minutos se tomaría como interna. Se descartó
  esperar al correo para decidir: es justo la dependencia que se quiere
  quitar.
- **Publicidad después de los lectores.** Si va antes, una compra real en un
  comercio con «descuento» en el nombre se perdería como ignorada.
- **Fintual ignorado y no crudo.** Su aviso no trae el monto. El correo es la
  fuente, por decisión de Jesús.
- **La página dentro de la app, y no los gráficos reescritos en Android:** ver
  el hito 0002 de la app. Así una mejora visual se hace una vez, aquí.
- **Supabase sigue siendo la base.** La app podría guardar todo en el
  celular, pero la página (en el PC y en la app), la función que lee los
  avisos y el trabajador de Fintual necesitan un mismo lugar; y un celular
  perdido no puede llevarse los datos.

## Consecuencias

- `aplicar_aviso` ya no tiene la lógica: está en `tramitar_aviso`.
- Para sumar un formato de aviso: lector y fixture en `lectores.js` y
  `tests/avisos.test.mjs`, desplegar la función, y
  `node scripts/releer-avisos.mjs` (ensayo) y después con `--aplicar`.
- Para apagar el correo de un banco: Configuración → `bancos por aviso`.
  Revertirlo es borrarlo de la lista.

## Pendiente

- Desplegar la 0008 y después la función (`PENDIENTES.md`).
- Releer los crudos, sobre todo la transferencia BancoEstado → MACH del
  2026-10-15, que debe quedar como interna en los dos bancos.
- Publicar la app v0.2.0 y verla en el celular.
- Ir pasando bancos a `bancos_por_aviso` según la cobertura.
- Formatos que faltan: transferencias enviadas de MACH, recibidas de Tenpo y
  BancoEstado, compras de BancoEstado, Copec Pay, Mercado Pago, pago de
  tarjeta.
