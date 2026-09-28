# FinanzasMaker — cómo se trabaja aquí

Control de gastos, ingresos e inversiones de Jesús a partir de los **correos
de aviso de sus bancos** (Tenpo, MACH, Mercado Pago, Copec Pay, BancoEstado,
Fintual, Binance y otros). No pide claves bancarias a nadie: un Apps Script dentro de
una planilla lee Gmail cada 30 minutos, registra cada movimiento y manda el correo
a la papelera. El front está en GitHub Pages (`seiler18/FinanzasMaker`) y,
sin backend configurado, abre en modo demo con datos inventados.

Hermano de `../VentasMaker/` (misma arquitectura: Vite sin framework, Apps
Script sobre Sheets, CSP estricta, deploy por Actions). Instalación: `README.md`.
Seguridad: `SECURITY.md`.

## Mapa

| Qué | Dónde |
|---|---|
| Lectores de correos (uno por formato) y red genérica | `backend/Lectores.gs` |
| Gmail → hoja → papelera, API, identidad | `backend/Code.gs` (`ACCIONES`, `procesar_`, `identidad_`) |
| Totales, series y consejos | `src/lib/analisis.js` |
| Vistas | `src/vistas/{resumen,movimientos,revisar,agregar,consejos,ajustes}.js` |
| Router y periodo (día/mes/año) | `src/main.js` (`VISTAS`) |
| Transiciones entre vistas; celular; tema | `src/styles/movimiento.css`, `src/styles/movil.css`, `src/lib/tema.js` |
| Signo y color de un monto (+ verde / − rojo) | `SENTIDO` y `conSigno` en `src/lib/formato.js` |
| Backend de mentira del modo demo | `src/demo.js` — debe contestar igual que `Code.gs` |
| Inicio de sesión con Google | `src/lib/sesion.js` |
| CSP | `vite.config.js` (solo en build) |
| Correos reales anonimizados | `tests/fixtures/*.json` |

## Procedimientos y memoria

**Antes de una tarea, comprueba si hay una skill que la cubra.** Al terminar
algo con sustancia, registra el hito.

| Necesitas… | Skill |
|---|---|
| Que se lea un banco o un formato nuevo | `agregar-banco` |
| Llevar un cambio de `Code.gs`/`Lectores.gs` a producción | `desplegar-backend` |
| Publicar el front | `desplegar` |
| Dejar constancia de lo hecho | `registrar-hito` |

Qué se hizo antes y por qué: `.claude/hitos/` (empieza por su `README.md`).

## Reglas

1. **Escribir antes de borrar.** Un correo va a la papelera solo después de
   que su fila quedó en la hoja (`escribir_` + `flush` antes de `moveToTrash`).
   Lo prueba `tests/backend.test.mjs`; no se toca ese orden.
2. **Lo dudoso no se borra.** Un correo que ningún lector entiende va a
   «Revisar» y se queda en Gmail hasta que el dueño decide. La red genérica
   solo propone, nunca registra.
3. **Transferencias entre cuentas propias no suman** (tipo `interna`), ni el
   pago de la tarjeta (`pago_tarjeta`): las compras ya se contaron. Se
   reconocen por el nombre del titular (`Config → titular`).
   **Excepción: las cuentas externas** (`Config → cuentas_externas`, por
   defecto Mercado Pago), que no avisan lo que reciben. Lo que sale de ellas
   a una cuenta propia es ingreso y lo que se les manda es gasto, decidido
   solo con el aviso de quien envía (`externa_` + `SALIDAS` en Lectores.gs).
   **Binance es una cuenta propia:** pagarle a un vendedor P2P
   (`Config → vendedores_cripto`) es «Compra de cripto» (interna, `p2p_`); el
   gasto es el USDT que sale por Binance Pay (`binance-pay`, «Remesas»).
4. **Aportes a Fintual: solo cuenta el correo del banco.** El «Invertimos tus
   $X» de Fintual va a la hoja Inversiones, no a Movimientos; si no, el aporte
   se cuenta dos veces.
5. **Todo texto de un correo es no confiable.** Se pinta con `html\`\`` (escapa)
   y se escribe en la hoja con `celda_()` (inyección de fórmulas).
6. **Sin `style="..."` en el marcado propio.** Anchos dinámicos por CSSOM
   (`el.style.setProperty`). Lo comprueba `npm run check`. La CSP admite estilos
   en línea solo porque los necesita el botón de Google (hito 0004); que eso no
   se vuelva la puerta para usarlos aquí.
7. **Fixtures anonimizados.** Nombres de terceros falsos, números de cuenta en
   ceros. El nombre del titular se deja (el lector lo necesita). `npm run check`
   rechaza números largos y RUT.
8. **Cada acción nueva exige la identidad del dueño** (`identidad_` en `doPost`).
   No hay acciones públicas salvo `doGet`, que no devuelve datos.
9. **No gastar las cuotas de Google** (gmail.com: 90 min/día de disparadores,
   ~20.000 lecturas de Gmail/día). Disparador cada 30 min, 1,5 min por pasada,
   tope diario de 60 min y lo ignorado recordado 6 h (constantes al inicio de
   `Code.gs`). Lo prueba `tests/backend.test.mjs`.
10. Tras cambiar `Code.gs` o `Lectores.gs`, redesplegar la aplicación web como
   **versión nueva** de la misma implementación (si no, la URL cambia).

## Verificación

`npm test` corre los lectores (casos sintéticos + fixtures reales), el flujo
del backend con Gmail simulado y los cálculos. `npm run build` incluye check y
test. La prueba contra los correos reales es `ensayo()` en el editor de Apps
Script: escribe en la hoja «Ensayo» qué haría con cada correo, sin registrar
ni borrar. La revisión visual de la página la hace el usuario.
