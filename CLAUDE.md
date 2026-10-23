# FinanzasMaker — cómo se trabaja aquí

Control de gastos, ingresos e inversiones de Jesús, leído de lo que le avisan
sus bancos (Tenpo, MACH, Mercado Pago, Copec Pay, BancoEstado, Fintual,
Binance y otros). No pide claves bancarias a nadie. Dos páginas, un proyecto:
**Finanzas** (`/FinanzasMaker/`) e **Inversiones** (`/FinanzasMaker/inversiones/`,
lo que era gestor-acciones). Sin sesión, las dos abren en modo demo.

La v2 (hitos 0010 y 0011) tiene tres piezas:

- **Base: Supabase** (proyecto `mbcswbrmgfgmpsssnfzh`). Postgres con RLS por
  usuario. La página lee y escribe directo con la sesión de Google.
- **Trabajador: Apps Script** dentro de la planilla, con la cuenta del dueño.
  Lo que necesita Google:
  - lee Gmail cada 30 min, escribe en la base y después manda el correo a la
    papelera;
  - cada hora lee las operaciones de Fintual y los precios de Yahoo, y
    cada 5 min solo los precios, con la bolsa de Nueva York abierta;
  - cada 4 h avisa las señales de la cartera.
  Escribe con una clave secreta (se salta la RLS) y filtra él por usuario.
- **Celular: la app FinanzasMaker para Android** (repo privado
  `seiler18/FinanzasMaker-android`, carpeta `../FinanzasMaker-android/`)
  manda las notificaciones de los bancos a la función `notificacion`, que las
  convierte en movimientos (hitos 0014 y 0015). Desde su v0.3.0 (hito 0017)
  tiene **pantallas propias**: entra con Google de forma nativa, lee la base
  con esa sesión (la misma RLS) y dibuja el resumen, los movimientos y los
  consejos con sus propios cálculos, gemelos de los de aquí (regla 10).
  Desde la v0.4.0 (hito 0018) también escribe: anotar, editar, eliminar y
  decidir «Por revisar», con copias de `reglas.js` y `validar.js`. Desde la
  v0.5.0 (hito 0022) muestra también Inversiones, con copias de
  `cartera.js`, `sugerencias.js` y el `formato.js` de Inversiones. Las
  cartolas, los presupuestos y Config siguen solo aquí.

**Hacia dónde va (hito 0015): el correo solo para Fintual.** Los bancos pasan
uno a uno a `bancos_por_aviso` (Config) cuando su cobertura por aviso lo
permite (Ajustes → Celular). Para esos, el correo ya no crea movimientos: solo
completa lo que trajo el aviso, y lo que llegue sin aviso va a «Por revisar».

Además, la página lee **cartolas y estados de cuenta en PDF** (Agregar →
Subir una cartola), en el navegador, para lo que ningún aviso trajo (hito 0012).

Hermano de `../VentasMaker/` (Vite sin framework, CSP estricta, deploy por
Actions). Instalación y migración: `README.md`. Seguridad: `SECURITY.md`.

## Mapa

| Qué | Dónde |
|---|---|
| Esquema: blindaje y registro cerrado, notificaciones, finanzas, inversiones | `supabase/migrations/NNNN_*.sql` |
| Recepción de notificaciones del celular; lector del cuerpo | `supabase/functions/notificacion/{index.ts,cuerpo.js}` |
| Avisos del celular → movimientos (lectores por banco, publicidad, Fintual ignorado; `reglas.js` es copia de `src/lib/reglas.js`) | `supabase/functions/notificacion/{lectores.js,reglas.js}`, tests en `tests/avisos.test.mjs` |
| Un mismo movimiento por aviso y por correo: `aplicar_aviso` → `tramitar_aviso` y el trigger `absorber_aviso` | `supabase/migrations/0007_movimientos_desde_avisos.sql`, redefinidas en `0008_bancos_por_aviso.sql` |
| Las dos patas de una transferencia entre tus cuentas (`emparejar_aviso`); el correo de un banco en `bancos_por_aviso` va a `revisar` | `supabase/migrations/0008_bancos_por_aviso.sql` |
| La otra pata que trajo el correo (Copec Pay no avisa); el correo sin hora (00:00) se compara por día (`cerca`) | `supabase/migrations/0009_parejas_con_el_correo.sql` |
| Releer los avisos crudos tras sumar un lector (ensayo por defecto; `--ignorar` lo que el correo ya trajo de otra forma) | `scripts/releer-avisos.mjs` |
| Qué bancos ya llegan por aviso (Ajustes → Celular) | `coberturaAvisos` en `src/lib/analisis.js`, acción `celular` en `src/lib/datos.js` |
| ¿La página está dentro de la app Android? (enlace «Estado de la app»). Sin uso desde la app v0.3.0, que ya no abre la página | `src/lib/app-android.js` |
| Ingreso con Google y registro cerrado (lo que sube `config push`) | `supabase/config.toml` (`[auth]`, `[auth.external.google]`) |
| Trabajador: pasada de correos, disparadores, «Revisar correos ahora», identidad | `backend/Code.gs` (`procesar_`, `borrarDecididos_`, `ACCIONES`, `identidad_`) |
| Lectores de correos (uno por formato) y red genérica; reglas base | `backend/Lectores.gs` |
| Cliente de Supabase del trabajador: columnas, recortes, filtro de usuario | `backend/Supabase.gs` (`COLUMNAS`, `sbConsulta_`) |
| Fintual: operaciones, precios, alertas; costo promedio móvil | `backend/Acciones.gs` (`costoMovilAcciones_`) |
| Migración única desde las planillas | `backend/Migrar.gs` |
| Acciones de la página contra Supabase (misma forma que tenía el Apps Script) | `src/lib/datos.js` (`ACCIONES`), puerta única `src/lib/api.js` (`llamar`) |
| Sesión: botón de Google → `signInWithIdToken` con nonce | `src/lib/sesion.js`, cliente `src/lib/supa.js` |
| Validación y categorías en la página (gemelas de Code.gs / Lectores.gs) | `src/lib/validar.js`, `src/lib/reglas.js`, `src/lib/config-base.js` |
| Totales, series, consejos, fecha contable, timbres de las cuotas | `src/lib/analisis.js` |
| Vistas de Finanzas | `src/vistas/{resumen,movimientos,revisar,agregar,cuotas,consejos,ajustes}.js` |
| Router y periodo (día/mes/año) | `src/main.js` (`VISTAS`) |
| Sugerencias de Inversiones: vender sobre el costo, recomprar bajo la última venta; precio por acción | `src/inversiones/lib/sugerencias.js`, tests en `tests/inversiones-sugerencias.test.mjs` |
| Página Inversiones (su propio CSS, libs y demo) | `inversiones/index.html`, `src/inversiones/` (`main.js`, `lib/cartera.js`, `lib/api.js` arma el contrato v1) |
| Signo y color de un monto (+ verde / − rojo) | `SENTIDO` y `conSigno` en `src/lib/formato.js` |
| Efectos (se apagan con `prefers-reduced-motion`) | `src/lib/{efectos,fondo-dotField,cuenta}.js`, `src/styles/efectos.css` — de React Bits (MIT + Commons Clause: se usan aquí, **no se redistribuyen**) |
| Backend de mentira del modo demo | `src/demo.js` (Finanzas) y `src/inversiones/demo.js` — contestan igual que lo real |
| CSP y las dos páginas del build | `vite.config.js` |
| Correos reales anonimizados | `tests/fixtures/*.json` |
| Apps Script y Supabase de mentira para probar los `.gs` | `tests/apps-script-falso.mjs` |
| Pruebas de la base (Postgres desechable) y lo mínimo de Supabase | `tests/base.test.mjs`, `supabase/pruebas/supabase-minimo.sql` |
| Vincular y revocar celulares desde la página (enlace `intent://` a la app) | `src/vistas/ajustes.js` (`enlaceVincular`), acciones `vincular`/`revocar` en `src/lib/datos.js` |
| Dar de alta un celular a mano (la clave va a `.env`) | `scripts/crear-dispositivo.mjs` |
| Cartolas: tabla de un PDF, formatos (con su cuadre), clasificar, cruzar con lo registrado | `src/lib/cartolas/{tabla,formatos,clasificar,cruzar}.js`; pdf.js se carga solo al subir una (`pdf.js`); vista `src/vistas/cartola.js` |
| PDF reales de cartolas (solo en la máquina del dueño, ignorados por git; claves en `.env`) | `cartolas/` |

## Procedimientos y memoria

**Antes de una tarea, comprueba si hay una skill que la cubra.** Al terminar
algo con sustancia, registra el hito.

| Necesitas… | Skill |
|---|---|
| Que se lea un banco o un formato nuevo | `agregar-banco` |
| Llevar un cambio de `backend/*.gs` al Apps Script | `desplegar-backend` |
| Publicar las páginas | `desplegar` |
| Dejar constancia de lo hecho | `registrar-hito` |

Qué se hizo antes y por qué: `.claude/hitos/` (empieza por su `README.md`).
Lo que queda por hacer a mano (desplegar, instalar, respaldar): `PENDIENTES.md`.

## Reglas

1. **Escribir antes de borrar.** Un correo va a la papelera solo después de
   que la base confirmó su fila. `escribir_` lanza si Supabase no responde
   2xx, antes de `moveToTrash`, y la bitácora `correos` va al final del lote.
   Lo prueban `tests/backend.test.mjs` (falla simulada) y el orden
   `escribe:` → `papelera:`. No se toca.
2. **Lo dudoso no se borra.** Un correo que ningún lector entiende va a
   `revisar` y se queda en Gmail hasta que el dueño decide en la página. La
   página **marca** (`borrar_correo`); el trabajador borra en su próxima
   pasada (`borrarDecididos_`). Gmail lo toca solo el trabajador.
   El correo de un banco en `bancos_por_aviso` que llega sin su aviso sí va a
   la papelera: no es dudoso, lo leyó un lector, y su movimiento quedó entero
   en `revisar` (lo desvía la base, `absorber_aviso`, 0008).
3. **Transferencias entre cuentas propias no suman** (tipo `interna`), ni el
   pago de la tarjeta (`pago_tarjeta`). Se reconocen por `titular`.
   **Excepción: las cuentas externas** (`cuentas_externas`, por defecto
   Mercado Pago): lo que sale de ellas a una cuenta propia es ingreso y lo que
   se les manda es gasto (`externa_` + `SALIDAS` en Lectores.gs).
   **Binance es una cuenta propia:** pagarle a un vendedor P2P
   (`vendedores_cripto`) es «Compra de cripto»; el gasto es el USDT que sale
   por Binance Pay.
4. **Aportes a Fintual: solo cuenta el correo del banco.** El «Invertimos tus
   $X» va a `inversiones`, no a `movimientos`. Las operaciones de acciones
   van además a `acciones_operaciones` (Acciones.gs), que es otra cuenta: no
   se suman con las finanzas.
5. **Todo texto de un correo o una notificación es no confiable.** Se pinta
   con `html\`\`` (escapa). En la hoja «Ensayo», `celda_()` (fórmulas).
6. **Sin `style="..."` en el marcado propio.** Anchos dinámicos por CSSOM.
   Lo comprueba `npm run check` en las dos páginas. La CSP admite estilos en
   línea solo por el botón de Google (hito 0004).
7. **Fixtures anonimizados.** Nombres de terceros falsos, números de cuenta en
   ceros, el titular se deja. `npm run check` rechaza números largos y RUT.
8. **La clave pública no abre nada.**
   - `anon` no tiene privilegios en `public`; la página lee con sesión.
   - Toda tabla nueva va en una migración con RLS, la política
     `usuario = (select auth.uid())` y su caso en `tests/base.test.mjs`,
     entrando con el rol equivocado.
   - Toda función `security definer` fija `search_path` y revoca `execute` de
     `public` y `anon` con nombre.
   - Una migración aplicada no se edita: se escribe la siguiente.
   - El registro está cerrado: solo entran los correos de `permitidos`.
9. **El trabajador escribe con la clave secreta: el filtro es suyo.**
   - Toda consulta pasa por `sbConsulta_`, que antepone
     `usuario=eq.<SUPABASE_USUARIO>`, y toda fila sale de `aFila_` con su
     `usuario`.
   - Las tablas de todos (`acciones_precios`, `acciones_mapa`) son las
     únicas sin dueño (`GLOBALES`).
   - Una columna nueva va también en `COLUMNAS`: si no, no se escribe.
10. **Gemelas que deben calzar** (cada par tiene su prueba):
    - `src/lib/reglas.js` ↔ `categorizar_` ↔ `supabase/functions/notificacion/reglas.js` (copia idéntica: la función no puede importar de `src/`);
    - `esPropio` (lectores.js) ↔ `esPropio_` (Lectores.gs): el aviso y el
      correo reconocen al titular igual;
    - `config-base.js` ↔ `CONFIG_BASE`;
    - `src/inversiones/lib/cartera.js` ↔ `costoMovilAcciones_`. El costo
      promedio es **móvil**, el que tenías el día de cada venta;
    - `src/lib/analisis.js`, `variacion` y `filasCabina` (resumen.js) y
      `src/lib/formato.js` ↔ `nucleo/Analisis.kt`, `Cabina.kt` y
      `Formato.kt` de la app Android (otro repo, `AnalisisTest` repite los
      casos de `tests/analisis.test.mjs`). Un cambio en qué suma, qué es un
      gasto grande o cuándo sale un consejo se copia allá; si no, la app y la
      página muestran cifras distintas. Las columnas de `movimientos` que lee
      la app están en `Movimiento.COLUMNAS`: renombrar una la rompe;
    - `src/lib/reglas.js` y `src/lib/validar.js` ↔ `nucleo/Reglas.kt` y
      `nucleo/Validar.kt` de la app (`EscrituraTest`), y `ACCIONES` de
      `datos.js` (agregar, editar, eliminar, revisar) ↔ `Tablero.kt`: la app
      escribe con la misma validación y las mismas reglas;
    - `src/demo.js` ↔ `datos.js`;
    - `src/inversiones/demo.js` ↔ el contrato v1;
    - `src/inversiones/lib/cartera.js`, `sugerencias.js` y `formato.js` ↔
      `nucleo/Cartera.kt`, `Sugerencias.kt` y `FormatoInv.kt` de la app
      (`CarteraTest`, `SugerenciasTest`, `FormatoInvTest`), y `cartera()` de
      `lib/api.js` ↔ `Tablero.inversiones`: la app lee las mismas tablas y
      calcula lo mismo. Una regla nueva de sugerencias se copia allá.
11. **No gastar las cuotas de Google.** Disparador de correos cada 30 min, 1,5
    min por pasada, tope diario de 60 min, lo ignorado recordado 6 h
    (constantes al inicio de `Code.gs`). Acciones: cada 1 h y cada 4 h; los
    precios cada 5 min solo con la bolsa abierta (`bolsaAbierta_`).
12. **Ningún secreto sale de `.env`.** La clave de la base y la de cada celular
    viven ahí; los scripts las leen sin imprimirlas. La clave secreta del
    trabajador vive solo en Supabase y en las propiedades del Apps Script.
    `npm run check` rechaza `sb_secret_` y JWT en el repo.
13. Tras cambiar un `.gs`: pegarlo en el editor y redesplegar la aplicación web
    como **versión nueva** de la misma implementación (si no, la URL cambia).

## Verificación

- **`npm test`:**
  - los lectores (sintéticos más fixtures reales);
  - el trabajador contra un Supabase falso (`backend`, `acciones`);
  - las gemelas (`reglas`, `inversiones-cartera`);
  - el contrato de la demo de Inversiones;
  - los cálculos;
  - el cuerpo de las notificaciones;
  - las cartolas: sintéticas (`cartolas.test.mjs`) y, si existe la carpeta
    `cartolas/`, los PDF reales, que deben cuadrar al peso con sus totales.
- **`npm run test:base`:** un Postgres 17 desechable con las migraciones.
  Prueba RLS, privilegios, políticas y `decidir_revisar`.
- **`npm run build`:** incluye check, test y test:base.
- **Contra la base real:** un usuario de prueba temporal, que se borra al
  final. Las acciones de `datos.js` y las del trabajador con curl síncrono
  (así se encontró el «All object keys must match» de PostgREST, hito 0011).
- **El trabajador real:** `probarSupabase()` y `ensayo()` en el editor.
- **La revisión visual la hace el usuario.** Una prueba de humo (cargar sin
  errores) sí se puede: `vite preview` más `playwright-core` en el scratchpad
  con el Chrome instalado.
