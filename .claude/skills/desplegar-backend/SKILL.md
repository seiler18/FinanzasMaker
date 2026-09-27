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

| Síntoma | Causa probable |
|---|---|
| «Sin conexión con el servidor» | `API_URL` en `src/config.js` no es la URL `/exec` vigente, o la implementación no está en «Cualquier usuario» |
| «Inicia sesión de nuevo» siempre | Falta la propiedad `CLIENT_ID`, no coincide con `src/config.js`, o `PROPIETARIO` no es el correo con que entras (volver a correr `instalar()` con la cuenta correcta) |
| El botón de Google no aparece | El origen (`https://seiler18.github.io` o `http://localhost:5173`) no está en *Orígenes de JavaScript autorizados* del ID de cliente |
| «Error interno» | Ver **Ejecuciones** en el editor de Apps Script: ahí está la traza |
| No entran correos nuevos | **Activadores**: debe haber uno `procesarCorreos` cada hora; si no, correr `instalar()`. Ver en Ejecuciones si falla |
| Entra todo a «Revisar» | Un banco cambió su plantilla: skill `agregar-banco` |
