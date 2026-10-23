# Pendientes

Lo que queda por hacer a mano o por decidir (hitos 0013 a 0022). Se tacha y se
borra cuando esté hecho. El repo es público: aquí no van claves.

## 1. Pegar el Apps Script: precios cada 5 min (hito 0021)

El arreglo del hito 0020 ya está pegado y los precios volvieron (2026-10-23).
Para las Sugerencias de Inversiones con precios cada 5 minutos:

1. Skill `desplegar-backend`: pegar **`Acciones.gs` y `Code.gs`** e
   implementar como versión nueva de la misma implementación.
2. Correr **`programarDisparador()`** una vez: crea el disparador nuevo
   `actualizarPrecios` (5 min) y rehace los otros tres. En **Activadores**
   deben quedar cuatro.
3. Con la bolsa abierta (lunes a viernes, 10:30 a 17:00 en Chile en esta
   época), Inversiones debe decir «Precios de hace N min» con N ≤ 5.

La 0008, la 0009 y la función están desplegadas, y los avisos crudos se
releyeron (2026-10-16, hito 0016). Solo quedan crudos el cashback depositado
de MACH (a propósito) y la prueba de conexión de la app.

## 2. La app v0.5.0 en el celular: Inversiones (hito 0022)

La v0.5.0 (Release `v0.5.0` de FinanzasMaker-android, misma firma) trae
Inversiones: instalarla **encima** desde Releases y abrir Más → Inversiones.
Mirar:

- que el resultado total, el valor de la cartera y las sugerencias digan lo
  mismo que la página de Inversiones;
- las cuatro vistas (Resumen, Ideas, Cartera, Movimientos), tocar una parte
  del resultado y un activo (se abren hojas de detalle);
- los gráficos al tocarlos (lo puesto y lo recuperado, dividendos por mes,
  actividad por mes);
- con la bolsa abierta, que «Precios de hace N min» no pase de 5 a 10 min
  sin tocar nada.

## 3. Apagar el correo, banco por banco

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

## 4. Probar las cartolas en la página publicada

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

## 5. Más adelante

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
