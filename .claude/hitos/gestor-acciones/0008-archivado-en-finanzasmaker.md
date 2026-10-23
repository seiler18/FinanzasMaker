# 0008 — Archivado: pasa a ser «Inversiones» de FinanzasMaker

- **Fecha:** 2026-10-12
- **Estado:** completado
- **Commits:** el de este hito

## Contexto

FinanzasMaker y este proyecto leían los mismos correos y se mantenían por
separado. Jesús quería una sola app, con una parte de finanzas y otra de
inversiones, y dejar la hoja de Google como base de datos porque era lenta.

## Qué se hizo

- La pantalla, el cálculo de la cartera y las pruebas se trajeron tal cual a
  `FinanzasMaker/src/inversiones/`, como segunda página del mismo sitio.
- El contrato de datos v1 (`docs/contrato.md`) se conserva: lo arma ahora
  `src/inversiones/lib/api.js` desde Supabase.
- La entrada con clave se cambió por el ingreso con Google.
- Lo que hacía la hoja (leer los correos de Fintual, precios de Yahoo, alertas)
  pasó al trabajador de FinanzasMaker (`backend/Acciones.gs`). El cálculo del
  costo promedio móvil sigue con su prueba gemela (hito 0004).
- La hoja se migró a la base y quedó como respaldo, sin disparadores.

## Decisiones y alternativas descartadas

- **Segunda página y no una sección de Finanzas:** los dos proyectos tenían
  CSS con las mismas clases.
- **Archivar y no borrar:** la historia (hitos 0001–0007) explica decisiones
  que siguen vigentes en FinanzasMaker.

## Consecuencias

- Este repositorio no se toca más. La demo de esta URL sigue publicada, pero
  ya no se actualiza: la vigente es la de FinanzasMaker.
- Los enlaces del portafolio (hub, Currículo) apuntan a FinanzasMaker.

## Pendiente

Ninguno.
