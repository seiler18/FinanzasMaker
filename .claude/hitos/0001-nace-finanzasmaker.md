# 0001 — Nace FinanzasMaker: finanzas personales leídas de los correos de los bancos

- **Fecha:** 2026-09-27
- **Estado:** completado (código); instalación en la cuenta pendiente
- **Commits:** pendiente de commit

## Contexto

Jesús quería llevar gastos, ingresos e inversiones por día, mes y año, con
consejos de ahorro, sobre las cuentas que usa: Tenpo, MACH, Mercado Pago,
BancoEstado, CencoPay y Copec Pay. Planteó dos caminos:

1. Una app donde cualquiera **conecte sus cuentas bancarias**.
2. Front en GitHub Pages + backend en una hoja de Google (como VentasMaker),
   alimentado por un script que **lee los avisos de los bancos en Gmail**.

## Briefing (lo que se decidió con él)

| Pregunta | Respuesta |
|---|---|
| Correo donde llegan los avisos | Gmail personal |
| Bancos | Tenpo, MACH, Mercado Pago, BancoEstado, CencoPay, Copec Pay |
| Para quién | Para él primero |
| Nombre | FinanzasMaker |
| Qué registrar | Gastos, ingresos, inversiones, todo lo que se pueda |
| Borrar el correo tras registrarlo | **Sí, desde el día uno** |
| Historial a importar | **Solo 2026** |
| Bancos que no usa hace tiempo | Que igual se recojan: red genérica |

## Qué se hizo

- **Relevamiento del correo real** (bandeja + papelera). Hay correos por
  movimiento en Tenpo, MACH, Copec Pay, Mercado Pago (solo transferencias
  enviadas), Fintual, BCI y Falabella. BancoEstado no manda ninguno en 2026 (el
  último es de nov-2025). CencoPay solo manda publicidad. Un agente extrajo
  38 correos, uno por formato, y los guardó anonimizados en
  `tests/fixtures/` con lo que se espera de cada uno (`espera`).
- **`backend/Lectores.gs`**: 31 lectores de formato y 6 que ignoran lo que no es movimiento en cada banco, más una red genérica
  para cualquier dominio bancario. También la detección de transferencias
  propias, las categorías por reglas (`REGLAS_BASE`) y los duplicados entre
  bancos.
- **`backend/Code.gs`**:
  - Pasada horaria sobre Gmail (`in:anywhere -in:spam`, desde `2026/01/01`),
    reanudable si se acaba el tiempo.
  - Escribe primero y manda a la papelera después.
  - Bitácora en «Correos» y hoja «Revisar».
  - `ensayo()`, que informa sin registrar ni borrar.
  - API con identidad por ID token de Google.
- **Front** (`src/`): Resumen (KPIs, gráfico mes a mes o día a día, categorías
  con presupuesto, por banco), Movimientos (filtros y edición con reglas), Por
  revisar, Agregar, Consejos y Ajustes. Modo demo con datos inventados
  (`src/demo.js`).
- **Pruebas**: 136 en total.
  - 98 de lectores: sintéticas más los 38 fixtures reales.
  - 28 del flujo del backend con Gmail simulado.
  - 10 de cálculos.
  - `npm run check` rechaza estilos literales, `style=""`, secretos y
    fixtures con números de cuenta o RUT.

## Decisiones y alternativas descartadas

- **Leer correos en vez de conectar cuentas.** Conectar cuentas exige pedir la
  clave del banco (scraping: rompe términos de uso y obliga a custodiar
  credenciales ajenas) o un agregador pagado (Fintoc, Floid). La ley Fintec
  de finanzas abiertas todavía se implementa por etapas. El correo cuesta $0
  y no hay credenciales bancarias en ninguna parte. Su límite: solo se ve lo
  que el banco avisa, así que existe «Agregar» para lo que falta.
- **«Para cualquiera» = cada uno con su copia.** Cada persona copia la
  planilla en su Drive y usa la misma página pública. Nadie custodia datos
  ajenos. Queda para después: por ahora es solo para Jesús.
- **Identidad con Google (ID token) en vez de clave propia.** VentasMaker tiene
  un sistema de claves con HMAC para varios usuarios. Aquí hay un solo dueño
  y datos más sensibles: verificar el token de Google contra `tokeninfo` es
  menos código y no deja claves que custodiar. Se descartó servir la página
  desde Apps Script («solo yo»): se pierde GitHub Pages y el portafolio.
- **Borrado desde el día uno, con resguardos.**
  - Solo se borra lo que un lector reconoció y ya quedó escrito.
  - Se manda a la papelera (30 días), nunca se borra definitivamente.
  - Se borra el mensaje, no el hilo: Tenpo agrupa varios comprobantes en uno.
  - La hoja «Correos» guarda remitente y asunto como respaldo.
  - Las cartolas y los estados de cuenta no se tocan.
- **Lo dudoso va a «Revisar» y no se borra solo**, incluida la red genérica.
  Es lo que permite recoger bancos sin lector (BancoEstado, uno nuevo) sin
  arriesgar un registro o un borrado equivocado.
- **Qué suma:**
  - Las transferencias entre cuentas propias son `interna` y no suman: la
    mayoría del tráfico es Mercado Pago → Copec Pay → Tenpo → MACH, y cada
    una genera dos correos.
  - El pago de la tarjeta es `pago_tarjeta` y tampoco suma: las compras ya se
    contaron.
  - Las cargas de billetera (compra en «MERCADO PAGO SANTIAGO» o «COPEC PAY»
    con tarjeta) son `interna` por regla.
- **Fintual.** El aporte se cuenta desde el correo del banco («Realizaste una
  transferencia a Fintual» → inversión). El «Invertimos tus $X» de Fintual va
  solo a la hoja Inversiones; si no, el aporte se contaría dos veces. Los
  retiros sí son movimiento (rescate), porque llegan a Mercado Pago, que no
  avisa cuando recibes. Una regla con tipo respeta el sentido: lo que llega
  desde Fintual es rescate, no inversión (`tipoPorRegla_`).
- **Copias que se ignoran:**
  - La «Comprobante de transferencia exitosa … a tu cuenta» de Tenpo trae el
    mismo código que la transferencia enviada.
  - El «Recibiste» de MACH dirigido al destinatario («Hola Fintual»).
  - El aviso de Falabella al destinatario se marca como duplicado del recibo
    de Tenpo (`esDuplicado_`).
- **Texto plano + HTML.** Copec Pay manda como texto plano solo el asunto, y
  Fintual pone el monto de un retiro solo en el HTML. Los lectores leen las
  dos partes juntas (`textoCorreo_`).
- **Fixtures reales, anonimizados.** El clasificador de permisos bloqueó la
  primera extracción (contenido de Gmail hacia un repositorio público). Jesús
  la autorizó explícitamente en la conversación. Aun así:
  - Los nombres de terceros son falsos.
  - Todo número de 8 o más dígitos quedó en ceros y los RUT en
    `11.111.111-1`.
  - El nombre del empleador se reemplazó por «EMPRESA DEMO».
  - El nombre del titular se dejó porque el lector lo necesita.

## Consecuencias

- Para sumar un banco o un formato: skill `agregar-banco` (fixture con
  `espera` → lector → prueba).
- Todo cambio en `.gs` necesita redesplegar como versión nueva (skill
  `desplegar-backend`).
- `src/demo.js` debe seguir contestando igual que `Code.gs`.

## Pendiente

- **Instalar en la cuenta** (README, pasos 1–5): planilla, `instalar()`, ID de
  cliente OAuth, implementación web, `src/config.js`. Recomendado correr
  `ensayo()` antes de la primera pasada real.
- Crear el repositorio `seiler18/FinanzasMaker`, activar Pages con Actions y,
  al publicarlo, enlazarlo en los tres sitios del portafolio (ver
  `../CLAUDE.md`).
- Sin lector todavía:
  - Neat (arriendo y cuentas): ya se ve como compra con la tarjeta de Tenpo.
  - Binance Pay.
  - La cartola de fondos mutuos de Santander.
  - Los PDF de cartolas (vienen con clave).
- Mercado Pago no avisa compras con su tarjeta ni con QR, y CencoPay no avisa
  nada: esos movimientos se anotan a mano.
- Si el sueldo principal llega sin aviso por correo (solo se vio un abono BCI
  en 2026), se anota a mano o se revisa qué banco podría avisarlo.
