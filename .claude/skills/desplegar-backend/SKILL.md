---
name: desplegar-backend
description: Llevar un cambio de backend/Code.gs, backend/Lectores.gs o backend/appsscript.json a la planilla de Apps Script sin cambiar la URL, o diagnosticar por qué la página no conecta con el backend. Úsala después de tocar cualquier .gs o cuando la página diga «Sin conexión», «Inicia sesión de nuevo» en bucle o «Error interno».
---

# Desplegar el backend

El código de Apps Script **no se sincroniza solo** con el repositorio: se
pega a mano en el editor. El usuario lo hace; el agente prepara y verifica.

## Pasos

1. `npm test` en verde antes de nada.
2. En la planilla: **Extensiones → Apps Script**.
3. Reemplazar el contenido de `Code` y de `Lectores` por los del repo (y
   `appsscript.json` si cambió; un scope nuevo obliga a volver a autorizar).
4. **Implementar → Gestionar implementaciones → ✏️ (la existente) → Versión:
   Nueva versión → Implementar.** Crear una implementación NUEVA cambia la URL
   `/exec` y la página deja de conectar.
5. Si cambió algo del procesamiento de correos, correr `ensayo()` y mirar la
   pestaña Ensayo antes de esperar al disparador.

## Diagnóstico

Lo primero siempre: correr **`diagnostico()`** en el editor. Muestra en el
registro la configuración tal como la lee el script, si hay `CLIENT_ID` y
`PROPIETARIO`, el cursor de la importación, la búsqueda exacta y cuántos
correos bancarios devuelve.

| Síntoma | Causa probable |
|---|---|
| `ensayo` y `procesarCorreos` dan 0 en todo | Mirar `consulta` en `diagnostico()`: si dice `after:` seguido de algo que no es `AAAA/MM/DD`, una celda de Config quedó como fecha (hito 0003; ya se corrige al leer). Si la consulta está bien y hay 0 hilos, el problema es la búsqueda |
| Faltan los meses viejos | `reiniciarImportacion()` y después `procesarCorreos` (lo ya registrado no se duplica) |
| «Sin conexión con el servidor» | `API_URL` en `src/config.js` no es la URL `/exec` vigente, o la implementación no está en «Cualquier usuario» |
| «Inicia sesión de nuevo» siempre | Falta la propiedad `CLIENT_ID`, no coincide con `src/config.js`, o `PROPIETARIO` no es el correo con que entras (volver a correr `instalar()` con la cuenta correcta) |
| El botón de Google no aparece | El origen (`https://seiler18.github.io` o `http://localhost:5173`) no está en *Orígenes de JavaScript autorizados* del ID de cliente |
| «Error interno» | Ver **Ejecuciones** en el editor de Apps Script: ahí está la traza |
| No entran correos nuevos | **Activadores**: debe haber uno `procesarCorreos` cada 30 minutos; si no, correr `programarDisparador()`. Ver en Ejecuciones si falla; «Tope diario … alcanzado» en el registro es el freno de cuota (sigue al otro día) |
| Entra todo a «Revisar» | Un banco cambió su plantilla: skill `agregar-banco` |
