---
name: agregar-banco
description: Enseñarle a FinanzasMaker un banco o un formato de correo nuevo (un lector en backend/Lectores.gs). Úsala cuando aparezcan correos en «Por revisar» con motivo «Correo bancario sin lector propio» o «El formato cambió», cuando el usuario empiece a usar otro banco, o pida "que lea los correos de X".
---

# Agregar un banco o un formato

Un lector convierte un tipo de correo en un movimiento. Se escribe **contra un
correo real**, no contra la idea de cómo debería ser.

## 1. Conseguir el correo

- Si Gmail está conectado (conector de Gmail): buscar con `includeTrash: true`
  (los avisos suelen estar en la papelera) y leer el mensaje en `PLAIN_TEXT`.
  Si la parte de texto plano viene vacía o trae solo el asunto (le pasa a
  Copec Pay), usar `FULL_CONTENT` y pasar el HTML a texto.
- Si no: pedirle al usuario el texto del correo, o que mire la tarjeta en
  «Por revisar» (el `extracto` de la tabla `revisar`).
- Guardar todo correo real **fuera** del repositorio mientras se trabaja
  (`correos-crudos/` está en `.gitignore`).

## 2. El fixture (anonimizado — el repo es público)

`tests/fixtures/<banco>-<formato>.json`:

```json
{ "from": "…", "subject": "…", "date": "2026-…Z", "body": "…",
  "espera": { "tipo": "gasto", "monto": 12345, "contraparte": "…", "categoria": "…" } }
```

- Nombres de terceros → falsos. El nombre del titular se deja igual (lo usa
  `esPropio_`).
- Todo número de cuenta, tarjeta u operación de 8+ dígitos → ceros del mismo
  largo. RUT → `11.111.111-1`. Nombre del empleador → «EMPRESA DEMO».
- Montos, fechas, comercios y el texto fijo de la plantilla → **exactos**.
- `espera` acepta `estado` (`ok` por defecto, `ignorar`, `revisar`), los campos
  del movimiento y `inv: {…}` para la tabla `inversiones`.

`npm run check` rechaza números largos y RUT que no sean relleno.

## 3. El lector

En `backend/Lectores.gs`, dentro de `LECTORES`, **antes** del `-otros` de ese
banco (el primero que calza gana):

```js
{
  id: 'banco-formato', de: /@dominio\.cl$/i, asunto: /texto fijo del asunto/i,
  leer: (c, ctx) => {
    const monto = montoTras_(c.texto, 'Monto');          // etiqueta → número
    if (!monto) return null;                              // null = «el formato cambió»
    const quien = entre_(c.texto, 'Destinatario:', 'Banco');
    return mov_(c, { banco: 'Banco', tipo: transferencia_('sale', quien, ctx), monto, contraparte: quien });
  },
},
```

- `c.texto` ya viene en una sola línea (texto plano + HTML). Se busca **entre
  etiquetas**, no por posición de línea.
- `transferencia_('sale' | 'entra', nombre, ctx)` decide si es gasto, ingreso
  o `interna` (cuenta propia).
- Lo que no es un movimiento nuevo (copias, avisos previos, cartolas) →
  `return IGNORAR`.
- Si un correo del banco puede duplicar a otro (un aviso de cortesía al
  destinatario más el recibo del otro banco), revisar si `esDuplicado_` lo
  cubre y agregar una prueba.
- Dominio nuevo: agregarlo a `REMITENTES` en `backend/Code.gs`.
- Categoría por comercio: una fila en `REGLAS_BASE` (siembra la tabla `reglas`
  de una cuenta nueva). En producción manda la tabla `reglas` del dueño: se
  crea desde la página con *«Aplicar a todo lo de…»* en Movimientos.

## 4. Probar

`npm test`. El fixture real debe pasar, y `tests/backend.test.mjs` sigue
probando que lo leído llega a la base (Supabase falso) antes de la papelera. Si el formato tiene variantes que no
tienes como correo real, agrega un caso sintético en `CASOS` de
`tests/lectores.test.mjs`, con datos inventados.

## 5. Llevarlo a producción

Skill `desplegar-backend`. Después, en «Por revisar», los correos de ese banco
que ya estaban ahí se registran a mano. Los nuevos entran solos.

## Un formato de cartola (PDF) nuevo

La cartola no es un correo: se lee en la página (`src/lib/cartolas/`).

1. Deja el PDF en `cartolas/` (ignorada por git) y, si tiene clave, agrégala
   a `.env` con cualquier nombre: las pruebas prueban todas sin imprimirlas.
2. Mira la forma con los trozos de pdf.js (texto, x, y): títulos de columna,
   dónde declara sus totales y cómo sigue una descripción larga.
3. Agrega el formato a `FORMATOS` en `formatos.js`: `es(texto)` por algo que
   solo esa cartola dice, `leer()` con las columnas (`defs`) y los totales que
   la cartola declara. Si los montos cortos caen en la columna vecina, usa el
   modo `'tramo'`.
4. `node tests/cartolas-reales.test.mjs` tiene que decir que **cuadra al peso**.
   Si no cuadra, se leyó mal: no se ofrece nada a medias.
5. Una prueba sintética en `tests/cartolas.test.mjs`, con nombres y montos
   inventados, y el banco en la lista de `src/vistas/cartola.js` y en el
   texto de ayuda del panel.
