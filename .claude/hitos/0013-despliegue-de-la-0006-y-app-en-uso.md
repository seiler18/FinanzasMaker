# 0013 — La 0006 desplegada y la app Android en uso

- **Fecha:** 2026-10-14
- **Estado:** completado; falta probar las cartolas de cuenta y hacer los lectores
- **Commits:** el que añade este hito

## Contexto

Cierra lo que dejó por hacer el hito 0012.

## Qué se hizo

- Se aplicó la migración `0006_hora_del_aviso.sql` (`supabase db push`) y
  después se desplegó la función `notificacion` (versión 3), en ese orden.
- La app Android se instaló y se vinculó. Comprobado en la tabla
  `notificaciones`: los avisos de la app traen `publicada`, a menos de un
  segundo de `recibida`. MacroDroid se desinstaló y no hubo avisos dobles.
- La firma (`finanzasmaker.jks` y el `.env` de la app) quedó respaldada fuera
  de git.
- Los estados de cuenta de las tarjetas MACH y Tenpo se leyeron contra los PDF
  reales: 47 y 23 filas, cuadran al peso.

## Decisiones

- **Play Protect:** la app va con firma propia y fuera de Play Store, así que
  la marca como desconocida. Se dejó apagado el análisis de apps en el celular;
  la salida definitiva sería publicarla en Play Store.

## Pendiente

- Cartolas de cuenta MACH y Copec Pay en la página publicada.
- Lectores de notificaciones y salir de Apps Script (ver `PENDIENTES.md`).
