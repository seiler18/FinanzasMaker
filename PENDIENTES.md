# Pendientes

Lo que queda por hacer a mano o por decidir (hitos 0013 a 0020). Se tacha y se
borra cuando esté hecho. El repo es público: aquí no van claves.

## 1. Pegar el Apps Script ahora: Inversiones está parada (hito 0020)

Desde el 2026-10-19 21:06 los precios y las operaciones de Fintual no se
actualizan: la consulta por ids pasó el tope de 2 kB de URL de Apps Script y
`actualizarAcciones` se cae en cada corrida. Ya está corregido en el repo.

1. Skill `desplegar-backend`: pegar **`Supabase.gs`, `Acciones.gs` y
   `Code.gs`** en el editor (los tres cambiaron) e implementar como versión
   nueva de la misma implementación.
2. Correr **`actualizarAcciones`** a mano y ver en Inversiones «Precios
   recién actualizados». Después sigue sola cada hora.

De paso entra el cambio de `CONFIG_BASE` en `Code.gs` (la clave
`bancos_por_aviso`), que el trabajador no usa.

La 0008, la 0009 y la función están desplegadas, y los avisos crudos se
releyeron (2026-10-16, hito 0016). Solo quedan crudos el cashback depositado
de MACH (a propósito) y la prueba de conexión de la app.

## 2. Apagar el correo, banco por banco

En Ajustes → Celular, «Qué llega por el celular» dice por banco cuánto llegó
por aviso y cuánto solo por correo. Cuando un banco lleve un tiempo sin nada
«solo por correo», agregarlo en Configuración → `bancos por aviso`. Desde ahí
su correo solo completa lo que trajo el aviso; lo que llegue sin aviso aparece
en «Por revisar» con el motivo «Llegó por correo y no por el celular».

Para eso faltan formatos de aviso. Cada uno necesita un aviso real; cuando
llegue, queda crudo y se ve en Ajustes → Celular:

- MACH: transferencia enviada, pago de la tarjeta, cashback depositado (este
  se dejó crudo a propósito, hito 0014);
- Tenpo: transferencia recibida, pago de la tarjeta;
- BancoEstado: transferencia recibida, compras;
- Copec Pay y Mercado Pago: todavía no mandaron ningún aviso de movimiento.

Al sumar uno: lector y fixture (`lectores.js`, `tests/avisos.test.mjs`),
desplegar la función y releer los crudos (punto 1).

Fintual sigue por correo (sus avisos no traen el monto).

## 3. Probar las cartolas en la página publicada

**El estado de cuenta con clave (hito 0019).** El campo de la clave ya no lo
rellena Chrome solo. Subir el estado de cuenta de la tarjeta que falló y ver
que abre con la clave (con o sin puntos, guion y dígito verificador). Si
Chrome igual ofrece una contraseña guardada, ignorarla. Si abre pero dice
«No reconozco…», es un formato nuevo: dejar el PDF en `cartolas/` y pedir
que se agregue (skill `agregar-banco`).

Los estados de cuenta de septiembre de las tarjetas MACH y Tenpo y las
cartolas de cuenta MACH y Copec Pay ya cuadran al peso contra los PDF reales
de `cartolas/` (en el PC de la oficina). En la página publicada, Agregar →
Subir una cartola, subirlas y revisar:

- que diga «Cuadra al peso»;
- que lo marcado como faltante de verdad falte;
- que lo ya registrado aparezca como «Ya registrados».

Lo marcado se agrega a la base de verdad: se puede ensayar antes en la demo
(`?demo`). Para repetir la prueba automática, dejarlas en `cartolas/`.

## 4. Más adelante

- **Salir de Apps Script salvo para Fintual.** Con los bancos por aviso, al
  trabajador le quedan los correos de Fintual, los precios (Yahoo) y las
  alertas. Precios y alertas podrían pasar a funciones de Supabase con
  `pg_cron`; Fintual sigue necesitando leer Gmail.
- **No guardar los códigos de validación** que llegan en avisos (Tenpo): hoy
  quedan en `notificaciones`, marcados ignorados.
- **Otras cartolas** vistas en el correo: Santander, Prex y Tenpo Inversiones.
  Dejar el PDF en `cartolas/` y su clave en `.env`, y pedir que se agregue
  el formato (skill `agregar-banco`).
- **Gradle 9.x de la app, junto con AGP 9.** La app ya está en Gradle 8.14.6
  (la última de la línea 8). Si Android Studio ofrece «actualizar Gradle»,
  decir que no: el 2026-10-21 lo hizo solo (9.7.1) y dejó el wrapper
  modificado sin versionar; se deshizo el 2026-10-22. La 9.6 o posterior no funciona con AGP 8.x, y el
  plugin de Kotlin actual solo declara compatibilidad hasta Gradle 9.0: se suben
  juntos y verificando, en un cambio aparte.
- **Play Protect** bloquea la app (firma propia, fuera de Play Store). Hoy está
  apagado el análisis de apps; la salida definitiva es publicarla en Play
  Store (pista interna).
- **Auditoría de ciberseguridad completa.**
