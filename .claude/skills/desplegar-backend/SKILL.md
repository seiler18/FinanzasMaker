---
name: desplegar-backend
description: Llevar un cambio de backend/*.gs (Code, Lectores, Supabase, Acciones, Migrar) o backend/appsscript.json al Apps Script de la planilla sin cambiar la URL, o diagnosticar por qué el trabajador no escribe en Supabase o «Revisar correos ahora» no conecta. Úsala después de tocar cualquier .gs o cuando Ajustes muestre una «última revisión» vieja, la página diga «Sin conexión con el Apps Script» o el registro de ejecuciones muestre «Supabase … → 4xx/5xx».
---

# Desplegar el backend (el trabajador)

El código de Apps Script **no se sincroniza solo** con el repositorio: se
pega a mano en el editor. El usuario lo hace; el agente prepara y verifica.

## Pasos

1. `npm test` en verde antes de nada (el trabajador se prueba contra un
   Supabase falso: `tests/backend.test.mjs`, `tests/acciones.test.mjs`).
2. En la planilla: **Extensiones → Apps Script**.
3. Reemplazar el contenido de cada archivo que cambió por el del repo. Son
   cinco: `Code`, `Lectores`, `Supabase`, `Acciones`, `Migrar` (más
   `appsscript.json` si cambió; un permiso nuevo obliga a volver a autorizar).
4. **Implementar → Gestionar implementaciones → ✏️ (la existente) → Versión:
   Nueva versión → Implementar.** Crear una implementación NUEVA cambia la URL
   `/exec` y «Revisar correos ahora» deja de conectar.
5. Si cambió algo del procesamiento de correos, correr `ensayo()` y mirar la
   pestaña Ensayo antes de esperar al disparador.

Una tabla o columna nueva va **primero** en Supabase (`npx supabase db push`)
y en `COLUMNAS` de `Supabase.gs`; si no, el trabajador la ignora o la base
rechaza el lote (y entonces no se borra ningún correo: así está hecho).

## Diagnóstico

Lo primero siempre: **`probarSupabase()`** (¿entra con la clave?) y
**`diagnostico()`** (configuración leída, si está migrado, la búsqueda exacta
y cuántos correos bancarios devuelve).

| Síntoma | Causa probable |
|---|---|
| «Faltan SUPABASE_URL, SUPABASE_CLAVE o SUPABASE_USUARIO» | Propiedades del script (⚙️) incompletas |
| «Supabase … → 401» | La clave secreta se revocó o se copió mal: crear otra en Supabase → API Keys y ponerla en `SUPABASE_CLAVE` |
| «Supabase … → 400: … violates check constraint» | Un lector armó algo fuera de forma (fecha, tipo): el lote no entra y el correo no se borra. Arreglar el lector (`agregar-banco`) |
| «Supabase … → 400: column … does not exist» | Falta la migración en la base (`npx supabase db push`) |
| «Falta correr migrarASupabase()» en cada ejecución | No se migró: `migrarASupabase()` (o `empezarDeCero()` si no hay nada que traer) |
| La página no ve lo que el trabajador escribió | `SUPABASE_USUARIO` no es el UID del dueño (Supabase → Authentication → Users) |
| «Sin conexión con el Apps Script» al revisar correos | `API_URL` en `src/config.js` no es la URL `/exec` vigente, o la implementación no está en «Cualquier usuario» |
| «cierra sesión y vuelve a entrar» al revisar correos | El token de Google dura 1 h; o falta `CLIENT_ID` en las propiedades, o `PROPIETARIO` no es el correo con que entras (`instalar()` con la cuenta correcta) |
| «Error interno» | Ver **Ejecuciones** en el editor: ahí está la traza |
| No entran correos nuevos | **Activadores**: deben estar `procesarCorreos` (30 min), `actualizarAcciones` (1 h), `actualizarPrecios` (5 min) y `alertasAcciones` (4 h); si no, `programarDisparador()`. «Tope diario … alcanzado» es el freno de cuota (sigue al otro día) |
| Entra todo a «Por revisar» | Un banco cambió su plantilla: skill `agregar-banco` |
| Inversiones no se actualiza | `actualizarAcciones` a mano: si dice «Falta correr migrarAccionesASupabase()», migrar (o `empezarAccionesDeCero()`) |
