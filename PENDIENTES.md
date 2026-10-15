# Pendientes

Lo que queda por hacer a mano o por decidir (hito 0013). Se tacha y se borra
cuando esté hecho. El repo es público: aquí no van claves.

## 1. Probar las cartolas de septiembre en la página publicada

Los estados de cuenta de las tarjetas MACH y Tenpo ya se probaron contra los
PDF reales de `estados-de-cuenta/` (cuadran al peso). Faltan las dos
**cartolas de cuenta** (MACH y Copec Pay), que no están en este PC.

En Agregar → Subir una cartola, subirlas y revisar:

- que diga «Cuadra al peso»;
- que lo marcado como faltante de verdad falte;
- que lo ya registrado aparezca como «Ya registrados».

Lo marcado se agrega a la base de verdad: se puede ensayar antes en la demo
(`?demo`). Para repetir la prueba automática, dejarlas en `cartolas/`.

## 2. Desplegar los lectores de avisos (hito 0014)

El orden importa: primero la base, después la función. Al revés, la función
llamaría a `aplicar_aviso` antes de que exista.

```
npx supabase db push
npx supabase functions deploy notificacion --use-api
```

Para comprobarlo, hacer una compra chica con MACH o Tenpo: debe aparecer como
movimiento en la página a los segundos, y el correo que llega después no debe
duplicarla.

## 2b. Más formatos de aviso

Cada banco o formato nuevo se suma a `lectores.js` con su prueba en
`tests/avisos.test.mjs`. Faltan las transferencias enviadas de MACH, Copec
Pay, Mercado Pago y BancoEstado: hace falta un aviso real de cada uno.

## 3. Más adelante

- **Salir del todo de Apps Script:** Fintual, precios (Yahoo) y alertas
  pasan a funciones de Supabase con programación. Después, el correo.
- **Otras cartolas** vistas en el correo: Santander, Prex y Tenpo Inversiones.
  Dejar el PDF en `cartolas/` y su clave en `.env`, y pedir que se agregue
  el formato (skill `agregar-banco`).
- **Gradle 8.14.3** de la app: GitHub avisa que está desactualizado. Va en un
  cambio aparte.
- **Play Protect** bloquea la app (firma propia, fuera de Play Store). Hoy está
  apagado el análisis de apps; la salida definitiva es publicarla en Play
  Store (pista interna).
- **Auditoría de ciberseguridad completa.**
