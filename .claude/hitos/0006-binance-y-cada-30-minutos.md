# 0006 — Binance (remesas y compra P2P) y revisión cada 30 minutos

- **Fecha:** 2026-09-28
- **Estado:** completado
- **Commits:** el de este hito

## Contexto

Jesús envió 40 USDT a sus padres por Binance Pay: tenía 15 USDT en Binance y
compró 25 más por P2P con una transferencia de $25.000 desde Copec Pay al
vendedor (Leveltech SPA), cinco minutos antes del envío. Binance no se leía y
la transferencia al vendedor entraba como un gasto a un tercero. Pidió además
revisar el correo cada 30 minutos sin que Google restrinja la cuenta. Los
estados de cuenta de tarjetas y cuentas quedan fuera a propósito: traen
claves y demasiados datos sensibles.

## Qué se hizo

- **Lector `binance-pay`** (inglés y español): «You made the following
  payment» / «El siguiente pago se realizó desde tu Binance Pay» → gasto de
  Binance, categoría «Remesas», moneda USDT, pasado a pesos con el dólar de
  Config. La fecha es la del correo: la del cuerpo viene en UTC.
- **`binance-sin-lector`**: un depósito, retiro o pago recibido de
  `ses.binance.com` va a «Revisar». **`binance-otros`**: alertas de inicio de
  sesión y publicidad (`smailer*.binance.com`) se ignoran.
- **`p2p_` + `Config → vendedores_cripto`** (por defecto `Leveltech`): la
  transferencia a un vendedor P2P pasa a interna «Compra de cripto»; lo que
  paga un vendedor al venderle USDT, a interna «Venta de cripto».
  `reclasificarCripto()` lo aplica a lo ya registrado.
- **Disparador cada 30 min** (`programarDisparador`, lo llama `instalar`) con
  frenos de cuota: 1,5 min por pasada (antes 4,5), tope de 60 min de
  disparador al día (`USO` en propiedades) y los ignorados recordados 6 h en
  caché (`IGNORADOS`) para no reabrirlos en cada pasada.
- Front: el detalle muestra «(40 USDT)»; «Remesas» no cuenta como
  suscripción; las categorías de cripto no salen en presupuestos.

## Decisiones y alternativas descartadas

- **Binance como cuenta propia.** Entrar pesos a Binance no es gasto; salir
  USDT a un tercero sí. Contar la transferencia al vendedor Y el envío sumaba
  $25.000 dos veces; contar solo la transferencia dejaba fuera los 15 USDT
  que ya estaban.
- **Tipo `inversion` para la compra**, descartado: el mismo dinero saldría
  como aportado y como gastado.
- **Reconocer al vendedor por la hora** (transferencia minutos antes del
  pago), descartado: en el mismo minuto salió otra transferencia a un
  familiar. Por nombre, en Config, que se lee aunque la fila no exista.
- **Regla en `REGLAS_BASE`**, descartada: solo siembra planillas nuevas; la
  pestaña Reglas de producción no la recibiría.

## Consecuencias

- El gasto de una remesa es el USDT enviado × dólar de Config, no lo pagado
  al vendedor (el precio P2P suele ser algo mayor).
- Un vendedor P2P nuevo entra como gasto hasta que se agrega a
  `vendedores_cripto` (y `reclasificarCripto`).
- Un pago en BTC u otra moneda no estable va a «Revisar»: no hay precio.

## Pendiente (hecho por Jesús el 2026-09-28)

- Pegar `Code.gs` y `Lectores.gs`, versión nueva de la implementación.
- Correr `programarDisparador()` (cambia el disparador a 30 min) y
  `reclasificarCripto()` (la compra a Leveltech del 28-09).
- Correr `reiniciarImportacion()` una vez: la pasada normal solo mira los
  últimos 2 días, y los envíos anteriores (15 USDT del 01-09, 255,56 USDT del
  20-08) no entrarían. Lo ya registrado no se duplica.
- Revisar la categoría de esos dos envíos: «Remesas» es la de por defecto,
  Binance no dice a quién fue el pago.
