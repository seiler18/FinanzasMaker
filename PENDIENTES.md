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

## 2. Lectores de notificaciones (lo que sigue y lo que más pesa)

Hoy los avisos de la app llegan **crudos** a la tabla `notificaciones`: la
página no los muestra como movimientos. Convertirlos es lo que deja de
depender del correo y de Apps Script. Hay decisiones por tomar (dónde
corren, cómo se evita contar dos veces la misma compra); ver el hito 0013.

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
