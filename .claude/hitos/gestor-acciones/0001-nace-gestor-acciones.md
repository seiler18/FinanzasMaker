# 0001 — Nace el Gestor de acciones: la hoja de Fintual como backend de una página

- **Fecha:** 2026-09-27
- **Estado:** en curso (código listo; falta pegar el backend en la hoja, publicar y conectar)
- **Commits:** pendiente de commit

## Contexto

La cartera se seguía en una hoja de Google, «Fintual - Monitoreo en vivo», con
un Apps Script que lee los correos de `hola@fintual.com`, escribe Movimientos,
consulta precios en Yahoo, arma Posiciones/Resultados/Dashboard y manda
alertas por correo. El dashboard era la propia pestaña Dashboard. Se quería
verlo en una página de GitHub Pages y dejar la puerta abierta a otras
plataformas (un Excel, otra web), manteniendo la hoja como backend.

Había dos copias del script en Drive: un Google Doc con la v3 y un
`Fintual_Script_v4_1.js`. Ninguna era exactamente la que corre:

- La v3 no tiene AUTO-MAPA ni el Dashboard nuevo que se ve en la hoja.
- El `.js` v4.1 venía **dañado**: `<`, `>` y `#` escapados con barra, emojis
  en mojibake (UTF-8 leído como latin1), los espacios duros de `num_` y
  `parsearCorreo_` convertidos en espacios normales, y el archivo **truncado**
  a mitad de `checkAlerts`.
- La fórmula de G/P realizada de la hoja en uso es la de la v3
  (`ventas − vendidas × costo promedio`), no la del v4.1
  (`ventas − invertido` cuando la tenencia es residual). Se descubrió porque
  el cálculo nuevo, con la fórmula del v4.1, no cuadraba en cuatro activos con
  residuos de fracción. Después el usuario entregó el código que corre
  (`backend/Code_Original.gs`, fuera del repo por `.gitignore`): la
  comparación línea a línea confirmó que solo difería en esa fórmula y en la
  de G/P no realizada, y que el final reconstruido de `checkAlerts` era exacto.

## Qué se hizo

- `backend/Code.gs` (v4.2): el v4.1 limpio por script (escapes, mojibake
  recuperado, espacios duros como ` `/` `, final de `checkAlerts`
  reconstruido desde la v3) y formateado con Prettier; luego alineado con el
  código en uso (fórmulas de G/P realizada y no realizada). Cambios de fondo: sin
  historial ni lista de activos embebidos (`MOVIMIENTOS`/`WATCHLIST` vacíos);
  `buildMovimientos`/`buildMapa` no vacían una hoja con datos; G/P realizada
  con la fórmula que corre hoy; cabecera sin nombre propio; ítem de menú
  «Generar clave del dashboard web».
- `backend/Api.gs`: `doGet` (solo estado), `doPost {accion:'cartera', clave}`
  con hash SHA-256 de la clave en Propiedades, comparación en tiempo constante
  y freno de 10 fallos/minuto. Entrega hechos normalizados: fechas `Date` o
  texto `dd/mm/aaaa` → `aaaa-mm-dd`, números con coma decimal, sin ID de Gmail
  ni email.
- `docs/contrato.md`: el JSON v1.
- Front con Vite y sin framework: `src/lib/cartera.js` (cálculo), gráficos
  SVG/HTML propios (barras de composición, divergentes de resultado por activo,
  columnas de dividendos por mes al ancho real del contenedor), tablas,
  filtros de movimientos, diálogo de clave, modo demo (`src/demo.js`).
- 15 pruebas (`npm test`): cálculo, `Api.gs` en Node con Apps Script simulado,
  y la demo contra el contrato.
- `scripts/check.js`: además de colores/CSP/secretos, rompe el build si la
  semilla de `Code.gs` trae datos o aparece un correo personal o una cadena con
  forma de clave.
- Nivel A: `CLAUDE.md`, `.claude/{hitos,skills,settings.json}`; skills
  `desplegar`, `desplegar-backend`, `conectar-plataforma`, `registrar-hito`.
- Workflow de Pages copiado de VentasMaker (dos trabajos, permisos mínimos,
  acciones por SHA).

**Validación contra el libro real** (exportado a `.xlsx` en el scratchpad de la
sesión, nunca en el repo): `Api.gs` simulado sobre las hojas reales → 0 filas
descartadas → `cartera.js` cuadró al centavo con los totales de Posiciones y
con el resultado en CLP del Dashboard.

## Decisiones y alternativas descartadas

- **Hechos en la API, cálculo en el front**, en vez de exponer las hojas
  Posiciones/Resultados. Leer los totales de la hoja ataba el contrato a filas
  (`Posiciones!D{n+2}`) y obligaba a otra plataforma a copiar las fórmulas. Con
  hechos, cualquier backend que sirva el JSON funciona, y la aritmética vive en
  un solo módulo con pruebas.
- **Privado con clave + demo pública**, en vez de una API pública (montos y
  posiciones a la vista de cualquiera con la URL) o de una página sin demo (no
  serviría para mostrarla en el portafolio). Clave única de 64 hex en vez de
  usuarios y sesiones como VentasMaker: hay un solo usuario y es solo lectura.
- **Clave mostrada en un diálogo de la hoja**, no en `Logger`: el registro de
  ejecución queda a la vista de cualquiera con acceso al proyecto (hallazgo L4
  de VentasMaker).
- **Fórmula de G/P realizada de la hoja en uso** sobre la del v4.1: es el
  método de costo promedio correcto; la del v4.1 cargaba todo el costo a la
  venta cuando quedaba un residuo de 0,0001 acciones. Coinciden en toda
  posición sin residuo.
- **Gráficos a mano** en vez de una librería: tres formas simples, CSP estricta
  sin `unsafe-inline` y 8 kB de JS comprimido. Paleta y marcas según la skill
  `dataviz`; el par azul/rojo divergente pasó su validador en claro y oscuro.
- **Nombre `gestor-acciones`**, elegido por el usuario. Se evitó `fintual-…`
  para no parecer un producto de la marca.
- **SVG al ancho medido del contenedor** en vez de un `viewBox` fijo: con el
  fijo, el texto del eje escalaba con la página (enorme en escritorio).

## Consecuencias

- Toda regla de cálculo existe dos veces: `cartera.js` y `buildPosiciones`.
  Van juntas (`CLAUDE.md`, regla 3).
- La copia de Drive del v4.1 ya no es referencia: la fuente es `backend/`.
- Para validar contra datos reales se trabaja fuera del repo.

## Pendiente

- El dueño: pegar `Code.gs` y `Api.gs` en la hoja, generar la clave, publicar
  la aplicación web y pasar la URL `/exec`.
- Crear el repo `seiler18/gestor-acciones`, poner `API_URL`, activar Pages
  (fuente: GitHub Actions) y publicar.
- Enlazarlo en el portafolio (tres sitios, `../CLAUDE.md`) y en el inventario
  de `../CLAUDE.md`.
- Splits: una compra anterior a un split (p. ej. uno 10:1) deja el
  costo promedio en la escala vieja. Hoy no afecta porque esas posiciones
  están cerradas; en una abierta, la G/P no realizada saldría mal.
- `num_` del lector de correos borra todos los puntos (asume «1.234,56»). Si
  Fintual escribiera «111.28», leería 11128.
- La comisión en CLP es una estimación fija (`usd × 4`), no se lee del correo.
- Excel por Power Query: descrito en la skill `conectar-plataforma`, sin probar.
