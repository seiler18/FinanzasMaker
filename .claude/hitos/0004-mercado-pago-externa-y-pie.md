# 0004 — Mercado Pago como cuenta externa, pie de autoría y botón de Google arreglado

- **Fecha:** 2026-09-27
- **Estado:** completado en el repo; falta pegar los `.gs` y autorizar el origen en el ID de cliente
- **Commits:** pendiente de commit

## Contexto

Con la primera importación hecha (240 movimientos), Jesús explicó cómo le
llega el sueldo: cae en Mercado Pago, que no manda correo al recibir, y desde
ahí se lo transfiere a Copec Pay o MACH. Esperaba ver ese traspaso como
ingreso, pero la app lo marcaba como transferencia entre cuentas propias
(interna), así que el sueldo no aparecía en ninguna parte. También pidió un pie
con su autoría en FinanzasMaker y en gestor-acciones.

## Qué se hizo

- **Cuentas externas** (`externa_`, `SALIDAS` en `backend/Lectores.gs`;
  `cuentas_externas` en Config, por defecto «Mercado Pago»):
  - Lo que sale de Mercado Pago hacia una cuenta propia pasa a ser ingreso
    («Desde Mercado Pago»).
  - Lo que se le manda es gasto («Hacia Mercado Pago»), y cargarlo con una
    tarjeta también.
  - `reclasificarExternas()` aplica la regla a lo ya registrado, usando el
    lector que guarda la bitácora Correos.
  - El lector de MACH ahora guarda el banco de destino en `detalle`.
- **Pie de autoría** (`src/lib/pie.js`, `src/styles/pie.css`), en la app y
  en la pantalla de ingreso:
  - nombre, lema del hub, enlaces al hub, al currículum y al código, y redes;
  - íconos en SVG propio, porque la CSP no deja cargar Font Awesome.
  - El mismo pie va en gestor-acciones (commit `638834e` de ese repo).
- **Botón de Google.** Capturas con Chrome sin ventana mostraron el ícono a
  tamaño completo, también en producción. La consola dio dos causas:
  - La CSP bloqueaba el `<style>` que inyecta `gsi/client`. Se arregló con
    `'unsafe-inline'` solo en `style-src`.
  - Google responde «The given origin is not allowed for the given client
    ID» para `https://seiler18.github.io`. Esto se corrige en Google Cloud,
    no en el código.
- La vista previa del ingreso tenía dos burbujas encima del título y de la
  leyenda: se reubicaron.

## Decisiones y alternativas descartadas

- **La regla solo mira el aviso de quien envía.** Un traspaso Mercado Pago →
  Tenpo genera dos correos: «Enviamos tu transferencia» y «Recibiste» con
  origen Mercado Pago. Si se contaran los dos, el sueldo se sumaría dos veces.
- **Un ir y volver infla los dos totales**, aunque el ahorro queda bien.
  Ejemplo: Copec Pay → Mercado Pago → Copec Pay suma el mismo monto como gasto
  y como ingreso. Se aceptó a cambio de ver el sueldo, que es lo que importa.
  Pasa algo parecido con un rescate de Fintual que llega a Mercado Pago y
  después se traspasa.
- **Se descartó un hash** para el `<style>` de Google: cambia cada vez que
  Google toca su CSS, y el botón volvería a romperse sin aviso. Los scripts
  siguen sin nada en línea, que es lo que protege ante un XSS.
- **El correo no va en el pie.** El verificador de gestor-acciones prohíbe
  correos personales en el código, y el contacto ya está en el hub.

## Consecuencias

- Una cuenta que se comporte como Mercado Pago se agrega en
  `Config → cuentas_externas` y se corre `reclasificarExternas`.
- Un lector nuevo de transferencias enviadas debe sumarse a `SALIDAS` y
  guardar el banco de destino en `detalle`.

## Pendiente

- Pegar `Code.gs` y `Lectores.gs` nuevos, correr `reclasificarExternas` y
  redesplegar como versión nueva.
- En Google Cloud → Credenciales → el ID de cliente → Orígenes de
  JavaScript autorizados: agregar `https://seiler18.github.io`.
