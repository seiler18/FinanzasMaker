# 0023 — Dónde quedó todo al 2026-10-23, y gestor-acciones retirado

- **Fecha:** 2026-10-23
- **Estado:** completado; falta que Jesús borre la carpeta de gestor-acciones (y, si quiere, el repo de GitHub)
- **Commits:** el que añade este hito
- **Sigue a:** [0020](0020-inversiones-sin-precios-por-el-largo-de-la-url.md), [0021](0021-sugerencias-de-inversiones-y-precios-cada-5-min.md) y [0022](0022-inversiones-en-la-app-android.md)

## Contexto

Al cerrar el 2026-10-23, Jesús pidió dejar anotado lo hecho en el día y cómo
va quedando todo, y avisó que borrará el proyecto gestor-acciones: todo lo
que hacía ya vive en FinanzasMaker y en FinanzasMaker-android.

## Qué se hizo el 2026-10-23

1. **Gradle de VS Code en la app Android.** Fallaba con «What went wrong:
   25.0.4.1»: la extensión usaba el Java 25 que trae la de Red Hat, y Gradle
   8.14 no corre sobre Java 25. Se apuntó al JDK 17
   (`java.import.gradle.java.home` en los ajustes de usuario de VS Code, no
   en el repo). En el otro PC, lo mismo con su ruta si vuelve a fallar.
2. **Un correo de Agensi.io** (vender los *skills* del repo en su
   marketplace). Es una empresa real y el correo es marketing en frío, no
   phishing; dio con la dirección porque está escrita en los hitos 0010 y
   0011, y el repo es público. Se decidió ignorarlo.
3. **Inversiones parada desde el 19-10** (hito 0020): la consulta por ids de
   Gmail pasó los 2 kB de URL de Apps Script con 76 correos de Fintual. Se
   divide de a 50. Pegado y comprobado el mismo día.
4. **Sugerencias en Inversiones** (hito 0021): vender lo que vale más que su
   costo, recomprar lo vendido en 90 días si hoy está más barato, en
   espera; el precio por acción de cada operación; precios cada 5 min con la
   bolsa abierta (`actualizarPrecios`) y la página que se repinta sola.
5. **Inversiones en la app Android v0.5.0** (hito 0022 aquí, 0006 allá): lo
   mismo que la página, con la lógica copiada y probada con los mismos casos.
6. **gestor-acciones retirado** (abajo).

## Cómo queda todo

| Pieza | Dónde | Qué hace |
|---|---|---|
| **Base** | Supabase `mbcswbrmgfgmpsssnfzh` | Movimientos, revisar, reglas, config, presupuestos, inversiones (operaciones, precios, alertas), celulares y avisos. RLS por usuario; registro cerrado |
| **Función `notificacion`** | `supabase/functions/notificacion/` | Recibe los avisos del celular y los vuelve movimientos (lectores por banco) |
| **Trabajador** | Apps Script de la planilla (`backend/*.gs`) | `procesarCorreos` cada 30 min · `actualizarAcciones` cada 1 h (correos de Fintual + precios) · `actualizarPrecios` cada 5 min con la bolsa abierta · `alertasAcciones` cada 4 h |
| **Página Finanzas** | `/FinanzasMaker/` | Resumen, movimientos, agregar (y cartolas en PDF), revisar, cuotas, consejos, ajustes (presupuestos, Config, celulares) |
| **Página Inversiones** | `/FinanzasMaker/inversiones/` | Resultado, sugerencias, cartera, dividendos, alertas, movimientos. Contrato en `docs/contrato-inversiones.md` |
| **App Android v0.5.0** | repo privado `seiler18/FinanzasMaker-android` | Escucha los avisos de los bancos (la entrada principal de datos) y muestra Finanzas e Inversiones en pantallas propias; anota, edita y revisa |

**Solo en la página:** subir cartolas, presupuestos, Config, «Revisar correos
ahora» y revocar celulares. Todo lo demás está en las dos.

**Gemelas** (regla 10): la app copia `analisis.js`, `reglas.js`,
`validar.js`, `formato.js` de Finanzas y, desde hoy, `cartera.js`,
`sugerencias.js` y el `formato.js` de Inversiones; el trabajador calza con
`cartera.js` en `costoMovilAcciones_`.

**Lo que queda por hacer a mano** está en `PENDIENTES.md`: pegar `Acciones.gs`
y `Code.gs` y correr `programarDisparador()` (precios cada 5 min), instalar la
app v0.5.0, sumar bancos a `bancos_por_aviso`, probar las cartolas publicadas.
Más adelante: el proveedor de inversiones configurable (BTG, Zesty…), Gradle 9
con AGP 9, Play Store y la auditoría de seguridad.

## gestor-acciones

Fue el dashboard de la cartera sobre la hoja «Fintual - Monitoreo en vivo»;
el 2026-10-12 pasó a ser la página Inversiones (hito 0011) y se archivó en
GitHub (su hito 0008).

Antes de borrarlo se comprobó que no se pierde nada:

- la carpeta local está igual que GitHub, sin cambios ni archivos ignorados
  que solo existan en ella (fuera de `node_modules/` y `dist/`);
- ningún código de FinanzasMaker ni de la app depende de ella; solo la
  nombraban comentarios;
- el portafolio (`seiler18.github.io`) y el Currículo ya no la enlazan;
- la hoja de Google quedó como respaldo y sin disparadores (su hito 0008).

Lo que FinanzasMaker todavía citaba de ese repo se trajo aquí:

- `docs/contrato.md` → **`docs/contrato-inversiones.md`**, al día (de dónde
  sale cada campo en Supabase y quién lo lee, la app incluida);
- su memoria (hitos 0001–0008) → **`.claude/hitos/gestor-acciones/`**: explica
  decisiones vigentes, como el costo promedio móvil (su 0004);
- los comentarios que la nombraban (`Lectores.gs`, `Acciones.gs`, `api.js`,
  `cartera.js`, `demo.js`) y el README apuntan ahora a esto.

Se puede borrar la carpeta `../gestor-acciones/`. El repo de GitHub está
archivado: borrarlo también apaga su página (`seiler18.github.io/gestor-acciones/`,
que sigue respondiendo y nadie enlaza); dejarlo archivado no cuesta nada. La
hoja vieja se puede borrar cuando se quiera: `migrarAccionesASupabase` ya no
hace falta.

## Decisiones y alternativas descartadas

- **Copiar la memoria y el contrato en vez de enlazarlos:** el enlace se
  rompe si el repo se borra.
- Las migraciones que nombran a gestor-acciones (`0005_inversiones.sql`) no
  se tocaron: una migración aplicada no se edita (regla 8).

## Pendiente

- Borrar `../gestor-acciones/` (lo hace Jesús) y decidir si el repo de GitHub
  se borra o queda archivado.
