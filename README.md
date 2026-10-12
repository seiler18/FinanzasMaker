# FinanzasMaker

Tus gastos, ingresos e inversiones por día, mes y año, **leídos solos de lo que
te avisan tus bancos**: los correos de aviso y, en el celular, las
notificaciones de sus apps. No le das tus claves bancarias a nadie.

Dos páginas, un proyecto:

- **Finanzas** (`/FinanzasMaker/`): gastos, ingresos, presupuestos, cuotas y consejos.
- **Inversiones** (`/FinanzasMaker/inversiones/`): la cartera de acciones de
  Fintual, con costo promedio móvil, resultado y dividendos. Era
  [gestor-acciones](https://github.com/seiler18/gestor-acciones).

Sin sesión, las dos abren en **modo demo** con datos inventados.

## Cómo está armado (v2)

```
Gmail ───► trabajador (Apps Script: cada 30 min, 1 h y 4 h) ──┐
Celular ─► MacroDroid ─► función «notificacion» (Supabase) ────┼─► Supabase (Postgres + RLS) ◄── las dos páginas
```

- **Base:** un proyecto de Supabase (plan gratis). La clave pública que va en la
  página no abre nada sin sesión: cada tabla tiene RLS y `anon` no tiene
  privilegios. Solo los correos de la tabla `permitidos` pueden crear cuenta.
- **Página:** Vite sin framework en GitHub Pages. Entra con *Iniciar sesión con
  Google* y lee y escribe directo en la base.
- **Trabajador:** un Google Apps Script dentro de una planilla, con tu cuenta.
  Lee Gmail, registra cada movimiento en la base y SOLO DESPUÉS manda el correo
  a la papelera. También lee las operaciones de Fintual, trae los precios de
  Yahoo y avisa por correo las señales de la cartera. Es lo único que toca tu
  Gmail.
- **Celular:** MacroDroid manda cada notificación de los bancos a la base
  (ver abajo). Por ahora se guardan crudas, para el relevamiento.
- **Costo:** $0.

Historia y decisiones: `.claude/hitos/` (0010 y 0011 son la v2).

## Qué entiende

| Banco | Qué se registra solo |
|---|---|
| Tenpo | Compras con tarjeta de crédito, transferencias enviadas y recibidas, pago por nómina, pagos enviados y recibidos, pago de cuentas, SOAP, pago de la tarjeta |
| MACH | Compras con tarjeta de crédito, transferencias, giros, cashback (BCI Plus) |
| Copec Pay | Transferencias, retiros a tus cuentas, cargas de saldo |
| Mercado Pago | Transferencias enviadas, pagos de servicios, ingresos de dinero |
| BancoEstado | Compras con débito, crédito (también en dólares) y Rutpay, giros, transferencias entre tus cuentas |
| Fintual | Aportes, retiros, venta de dólares, compra y venta de ETF, dividendos (tabla `inversiones`); las operaciones de acciones, además, en la página **Inversiones** |
| BCI | Aviso de abono a tu cuenta MACH |
| Banco Falabella | Aviso de transferencia recibida |
| Binance | Pagos y envíos por Binance Pay en USDT/USDC (remesas), pasados a pesos con el `dolar` de la configuración |
| **Cualquier otro banco** | La red genérica reconoce comprobantes, abonos, cargos y giros de dominios bancarios y los deja en **Por revisar** para que tú decidas |

Lo que no llega por correo (efectivo, CencoPay, compras con Mercado Pago) se
anota en **Agregar**.

**Qué no suma:** las transferencias entre tus propias cuentas y el pago de la
tarjeta. Las compras ya se contaron el día que se hicieron.

**Mercado Pago es una cuenta externa** (`cuentas_externas` en Ajustes): no avisa
cuando recibes dinero, así que el sueldo que llega ahí se registra cuando lo
pasas a otra cuenta tuya (Mercado Pago → Copec Pay o MACH = ingreso). Al revés,
lo que mandas a Mercado Pago cuenta como gasto, porque lo que se gaste ahí no
llega por correo. Para aplicarlo a lo ya registrado: `reclasificarExternas`.

**Binance funciona como una cuenta tuya más.** Comprar USDT por P2P es
transferirle pesos a un vendedor; esa transferencia no es gasto sino
«Compra de cripto» (`vendedores_cripto` en Ajustes, separados por coma). El gasto
se cuenta cuando el USDT sale por Binance Pay (categoría «Remesas»). Así, 25 USDT
comprados para enviar a la familia no se cuentan dos veces. Binance no avisa la
compra P2P por correo: si compras a un vendedor nuevo, agrégalo a
`vendedores_cripto` y ejecuta `reclasificarCripto` para lo ya registrado.

## Instalación desde cero

Para una cuenta nueva. Si vienes de la v1 (todo en planillas), sigue
[Pasar de la v1 a la v2](#pasar-de-la-v1-a-la-v2).

### 1. La base (Supabase)

1. Crea un proyecto en <https://supabase.com> (región São Paulo) y guarda la
   contraseña de la base en `.env` como `CLAVE_BASE_DATOS_FINANZASMAKER`.
2. `npx supabase login` y `npx supabase link --project-ref <ref>`.
3. Aplica las tablas, la función del celular y la configuración de Auth:
   ```bash
   export SUPABASE_DB_PASSWORD="$(grep '^CLAVE_BASE_DATOS_FINANZASMAKER=' .env | cut -d= -f2-)"
   npx supabase db push
   npx supabase functions deploy notificacion --use-api
   npx supabase config push      # ingreso con Google, registro cerrado
   ```
4. En el SQL Editor, tu correo en la lista de acceso:
   `insert into permitidos (email) values ('tu@gmail.com');`
5. **Authentication → Users → Add user** con ese correo (confirmado). Su *UID*
   es el `SUPABASE_USUARIO` del trabajador.

### 2. El ID de cliente de Google

La página lo necesita para el botón *Iniciar sesión con Google*. No es secreto.

1. <https://console.cloud.google.com/> → proyecto `FinanzasMaker` →
   **Pantalla de consentimiento de OAuth** (*Externo*, tu Gmail en usuarios de prueba).
2. **Credenciales → ID de cliente de OAuth → Aplicación web**, con orígenes
   `https://seiler18.github.io` y `http://localhost:5173`.
3. Ponlo en `src/config.js` (`CLIENT_ID`) y en `supabase/config.toml`
   (`[auth.external.google] client_id`), y vuelve a hacer `config push`.

### 3. El trabajador (Apps Script)

1. Una planilla nueva en Drive → **Extensiones → Apps Script**.
2. Crea un archivo por cada `.gs` de [`backend/`](backend/) con su mismo
   nombre (`Code`, `Lectores`, `Supabase`, `Acciones`, `Migrar`) y
   pega su contenido. En ⚙️ marca *Mostrar el archivo de manifiesto* y
   reemplaza `appsscript.json` por [el del repo](backend/appsscript.json).
3. ⚙️ **Propiedades de la secuencia de comandos:**

   | Propiedad | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_CLAVE` | una clave **secreta** creada solo para esto (Supabase → Settings → API Keys → *Create new secret key*, nombre `apps-script`) |
   | `SUPABASE_USUARIO` | el UID de tu usuario (paso 1.5) |
   | `CLIENT_ID` | el ID de cliente de Google (paso 2) |

4. Ejecuta **`probarSupabase`** y autoriza. Google avisa *«no verificó esta
   app»*: es tuya → *Configuración avanzada → Ir a FinanzasMaker → Permitir*.
5. Ejecuta **`empezarDeCero`**, **`empezarAccionesDeCero`** e **`instalar`**
   (siembran la configuración y las reglas, y dejan los tres disparadores).
6. **Implementar → Nueva implementación → Aplicación web**, *Ejecutar como:*
   Yo, *Acceso:* Cualquier usuario. La URL `/exec` va en `src/config.js`
   (`API_URL`): la usa solo el botón *Revisar correos ahora*, y sin un
   inicio de sesión de Google tuyo no hace nada.

**Opcional:** `ensayo` escribe en la pestaña **Ensayo** qué haría con cada
correo, sin registrar ni borrar. Si algo sale en 0: `diagnostico`.

**Cuotas de Google.** Una cuenta gmail.com gratuita tiene 90 minutos al día de
disparadores. La revisión de correos trabaja a lo más 1,5 minutos por vez y,
si en el día ya sumó 60, espera a mañana; las tareas de Inversiones duran
segundos. Pasarse no bloquea Gmail: solo detiene el script hasta el día siguiente.

### 4. La página

Sube a `main`: GitHub Actions corre el check, las pruebas y publica en
`https://seiler18.github.io/FinanzasMaker/`.

## Pasar de la v1 a la v2

La v1 guardaba todo en dos planillas (FinanzasMaker y la de gestor-acciones).
El trabajador nuevo **no procesa nada hasta que se migra** (propiedades
`MIGRADO` y `MIGRADO_ACCIONES`): así lo de los últimos días no entra dos veces.

1. `npx supabase config push` en esta carpeta (ingreso con Google y registro
   cerrado). Muestra cada cambio y pide confirmar.
2. En Supabase, la clave secreta `apps-script` (paso 3.3 de arriba).
3. En el Apps Script de la planilla **FinanzasMaker**:
   1. Reemplaza `Code` y `appsscript.json`; crea `Supabase`, `Acciones` y
      `Migrar`. `Lectores` no cambió.
   2. Propiedades: `SUPABASE_URL`, `SUPABASE_CLAVE`, `SUPABASE_USUARIO` y
      `PLANILLA_ACCIONES` (la URL de la hoja «Fintual - Monitoreo en vivo»).
      `CLIENT_ID` ya estaba.
   3. Ejecuta, en orden y mirando el registro de cada uno: **`probarSupabase`**
      (autoriza los permisos nuevos), **`migrarASupabase`**,
      **`migrarAccionesASupabase`** e **`instalar`**.
   4. **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva
      versión → Implementar** (la URL no cambia).
4. En el Apps Script de la hoja de **gestor-acciones**: **Activadores** → borra
   los dos. Si no, sigue leyendo Fintual y avisando por su cuenta.
5. Publica la página (push a `main`).

Las planillas no se tocan: quedan como respaldo.

## Notificaciones del celular (v2, en relevamiento)

La v2 deja de depender del correo: las apps de los bancos avisan cada
movimiento con una notificación, y **MacroDroid** (Android) se la manda a la
base de Supabase. Por ahora solo se guardan tal cual llegan; con una semana
de avisos reales se escriben los lectores (hito 0010).

**Antes:** el celular tiene que estar dado de alta. La clave queda en `.env`
y no se imprime:

```bash
node scripts/crear-dispositivo.mjs <tu-correo> "Celular Android"
```

**En el celular:**

1. Instala [MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)
   (ArloSoft). La versión gratis alcanza: es una sola macro.
2. Ajustes de Android → Batería → MacroDroid → **Sin restricciones**. Si no,
   Android la duerme y se pierden avisos.
3. Macro nueva → **Disparador** → *Notificación* → *Notificación recibida*:
   - Aplicaciones: tus bancos y billeteras (Tenpo, MACH, Mercado Pago,
     Copec Pay, BancoEstado, BCI, Fintual, Binance…).
   - Contenido: *Cualquiera*. Marca *Ignorar notificaciones en curso*, si
     aparece.
   - MacroDroid pedirá el **acceso a notificaciones**: concédelo.
4. **Acción** → *Interacción web* → *Solicitud HTTP*:
   - Método `POST`
   - URL `https://mbcswbrmgfgmpsssnfzh.supabase.co/functions/v1/notificacion`
   - Cabecera: nombre `x-clave`, valor = `CLAVE_DISPOSITIVO_CELULAR_ANDROID`
     de tu `.env`.
   - Cuerpo, tipo `text/plain`, **exactamente** estas cinco líneas (las
     llaves son la «magia de texto» de MacroDroid):
     ```
     {not_app_package}
     {not_title}
     {notification}
     --
     {not_text_big}
     ```
5. Guarda la macro. La próxima notificación de un banco debería aparecer en
   la tabla `notificaciones` (panel de Supabase → Table Editor).

La clave identifica al celular, no lee nada: con ella solo se pueden mandar
avisos a tu cuenta. Si el celular se pierde, se revoca el dispositivo
(`revocado` en `dispositivos`) y se crea otro.

## Uso

- **Resumen:** ingresos, gastos, ahorro e inversión del día, el mes o el año;
  gráfico mes a mes o día a día (toca una barra para abrirla), gasto por
  categoría con tu presupuesto, por banco y los gastos más grandes.
- **Movimientos:** todo el periodo con filtros. Toca uno para cambiarle tipo
  o categoría; con *«Aplicar a todo lo de…»* se guarda una regla y lo que
  llegue después de ese comercio ya viene bien clasificado.
- **Por revisar:** los correos bancarios que no se reconocieron con seguridad.
  Si decides borrar el correo, se va a la papelera en la próxima revisión.
- **Agregar:** lo que no llega por correo.
- **Cuotas** y **Consejos:** compras en cuotas con su impuesto de timbres;
  presupuestos excedidos, proyección del mes, cobros que se repiten, gastos hormiga.
- **Ajustes:** *Revisar correos ahora*, lo que llegó del **celular** (para
  comprobar la macro), la **configuración** (titular, cuentas externas,
  vendedores cripto, umbrales de Inversiones…) y los presupuestos.
- **Inversiones** (botón arriba): posiciones, resultado por activo,
  dividendos, dólares, alertas y movimientos de la cartera.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173 — con ?demo, datos inventados
npm test           # lectores, trabajador (con Supabase falso), Inversiones, reglas, cálculos
npm run test:base  # la base en un Postgres desechable: RLS, privilegios, políticas
npm run build      # check + test + test:base + build (lo mismo que corre en Actions)
```

Supabase (la clave de la base sale del `.env`, nunca de la línea de comandos):

```bash
export SUPABASE_DB_PASSWORD="$(grep '^CLAVE_BASE_DATOS_FINANZASMAKER=' .env | cut -d= -f2-)"
npx supabase db push                                    # aplica supabase/migrations/
npx supabase functions deploy notificacion --use-api    # sin Docker
```

Para que alguien más pueda crear cuenta, su correo va primero en la tabla
`permitidos` (SQL Editor): la base rechaza cualquier otro registro.

Para sumar un banco o un formato de correo: `.claude/skills/agregar-banco/`.
