# FinanzasMaker

Tus gastos, ingresos e inversiones por día, mes y año, **leídos de los correos
de aviso de tus bancos**. No le das tus claves bancarias a nadie: un script en
tu propia cuenta de Google revisa Gmail cada hora, anota cada movimiento en una
planilla y manda el correo a la papelera.

- **Front:** página estática en GitHub Pages (Vite, sin framework).
- **Backend:** Google Apps Script dentro de una planilla de Google Sheets.
- **Costo:** $0. Nada de tus datos pasa por un servidor ajeno: viven en tu Drive.

Sin backend configurado la página abre en **modo demo** con datos inventados.

## Qué entiende

| Banco | Qué se registra solo |
|---|---|
| Tenpo | Compras con tarjeta de crédito, transferencias enviadas y recibidas, pago por nómina, pagos enviados y recibidos, pago de cuentas, SOAP, pago de la tarjeta |
| MACH | Compras con tarjeta de crédito, transferencias, giros, cashback (BCI Plus) |
| Copec Pay | Transferencias, retiros a tus cuentas, cargas de saldo |
| Mercado Pago | Transferencias enviadas, pagos de servicios, ingresos de dinero |
| BancoEstado | Compras con débito, crédito (también en dólares) y Rutpay, giros, transferencias entre tus cuentas |
| Fintual | Aportes, retiros, venta de dólares, compra y venta de ETF, dividendos (hoja Inversiones) |
| BCI | Aviso de abono a tu cuenta MACH |
| Banco Falabella | Aviso de transferencia recibida |
| **Cualquier otro banco** | La red genérica reconoce comprobantes, abonos, cargos y giros de dominios bancarios y los deja en **Por revisar** para que tú decidas |

Lo que no llega por correo (efectivo, CencoPay, compras con Mercado Pago) se
anota en **Agregar**.

**Qué no suma:** las transferencias entre tus propias cuentas y el pago de la
tarjeta. Las compras ya se contaron el día que se hicieron.

## Instalación (una vez, ~20 minutos)

Todo con la cuenta de Gmail donde llegan los avisos.

### 1. La planilla y el script

1. En Google Drive: **Nuevo → Hoja de cálculo**. Nómbrala `FinanzasMaker`.
2. **Extensiones → Apps Script.** Se abre el editor con un `Código.gs`.
3. Borra lo que trae y pega el contenido de [`backend/Code.gs`](backend/Code.gs).
   Renómbralo a `Code`.
4. **+ → Secuencia de comandos**, llámalo `Lectores` y pega
   [`backend/Lectores.gs`](backend/Lectores.gs).
5. ⚙️ **Configuración del proyecto** → marca *Mostrar el archivo de manifiesto
   «appsscript.json»*. Vuelve al editor, abre `appsscript.json` y reemplázalo
   por [`backend/appsscript.json`](backend/appsscript.json).

### 2. Instalar

1. En el editor elige la función **`instalar`** y pulsa **Ejecutar**.
2. Google pide permisos. Como el script es tuyo y no está publicado, avisa
   *«Google no verificó esta app»*: **Configuración avanzada → Ir a
   FinanzasMaker (no seguro)** → **Permitir**. Pide leer y modificar Gmail
   (para leer los avisos y mandarlos a la papelera), la planilla, los
   disparadores y la conexión externa (para validar tu inicio de sesión).
3. Queda creado el disparador que revisa el correo **cada hora**, y las
   pestañas Movimientos, Inversiones, Revisar, Correos, Reglas, Presupuestos
   y Config.
4. En **Config** revisa `titular`: tu nombre y un apellido tal como lo escriben
   los bancos (por defecto `Jesus Seiler`). Con él se reconocen las
   transferencias entre tus cuentas.

**Opcional:** ejecuta `ensayo`. Escribe en la pestaña **Ensayo** qué haría con
cada correo desde el 01-01-2026, sin registrar ni borrar nada. Es la forma de
ver los lectores contra tus correos reales antes de soltarlos.

### 3. El inicio de sesión con Google

La página necesita un «ID de cliente» para mostrar el botón *Iniciar sesión
con Google*. No es un secreto, y no da acceso a nada: solo identifica tu página.

1. Entra a <https://console.cloud.google.com/> → **Crear proyecto** →
   `FinanzasMaker`.
2. **APIs y servicios → Pantalla de consentimiento de OAuth** → *Externo* →
   nombre `FinanzasMaker`, tu correo en soporte y contacto → Guardar. En
   **Usuarios de prueba** agrega tu Gmail.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth** →
   *Aplicación web*. En **Orígenes de JavaScript autorizados** agrega:
   - `https://seiler18.github.io`
   - `http://localhost:5173` (para desarrollo)
4. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).
5. En Apps Script: ⚙️ **Configuración del proyecto → Propiedades de la
   secuencia de comandos → Agregar** → propiedad `CLIENT_ID`, valor: el ID.

### 4. Publicar el backend

1. En Apps Script: **Implementar → Nueva implementación** → tipo
   **Aplicación web**. *Ejecutar como:* **Yo**. *Quién tiene acceso:*
   **Cualquier usuario**.
2. Copia la URL que termina en `/exec`.

«Cualquier usuario» es necesario para que la página pueda llamarlo, pero sin
un inicio de sesión de Google **tuyo** el backend no entrega ni un dato
(ver [SECURITY.md](SECURITY.md)).

### 5. Conectar la página

En [`src/config.js`](src/config.js) pon `API_URL` (la URL `/exec`) y
`CLIENT_ID`. Sube el cambio a `main` y GitHub Actions publica la página en
`https://seiler18.github.io/FinanzasMaker/`.

La primera importación (todo 2026) puede tomar varias horas de disparador
si hay muchos correos: cada ejecución trabaja 4,5 minutos y sigue en la
siguiente. Para adelantarla, ejecuta `procesarCorreos` a mano unas veces.

## Uso

- **Resumen:** ingresos, gastos, ahorro e inversión del día, el mes o el año;
  gráfico mes a mes o día a día (toca una barra para abrirla), gasto por
  categoría con tu presupuesto, por banco y los gastos más grandes.
- **Movimientos:** todo el periodo con filtros. Toca uno para cambiarle tipo
  o categoría; con *«Aplicar a todo lo de…»* se guarda una regla y lo que
  llegue después de ese comercio ya viene bien clasificado.
- **Por revisar:** los correos bancarios que no reconocí con seguridad.
- **Agregar:** lo que no llega por correo.
- **Consejos:** presupuestos excedidos, tasa de ahorro, proyección del mes,
  categorías que subieron, cobros que se repiten, gastos hormiga, cuotas y
  efectivo.
- **Ajustes:** presupuestos por categoría y *Revisar correos ahora*.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173 — sin config.js abre en modo demo
npm test         # lectores + flujo del backend + cálculos
npm run build    # check + test + build (lo mismo que corre en Actions)
```

Para sumar un banco o un formato de correo: `.claude/skills/agregar-banco/`.
