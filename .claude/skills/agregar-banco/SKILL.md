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
- Si no: pedirle al usuario el texto del correo, o que mire la fila en
  «Revisar» (`extracto`).
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
  del movimiento y `inv: {…}` para la hoja de inversiones.

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
- Categoría por comercio: una fila en `REGLAS_BASE` (o, en producción, en la
  pestaña Reglas de la planilla, que manda sobre la base).

## 4. Probar

`npm test`. El fixture real debe pasar. Si el formato tiene variantes que no
tienes como correo real, agrega un caso sintético en `CASOS` de
`tests/lectores.test.mjs`, con datos inventados.

## 5. Llevarlo a producción

Skill `desplegar-backend`. Después, en «Por revisar», los correos de ese banco
que ya estaban ahí se registran a mano. Los nuevos entran solos.
