/* Configuración del front. Ninguno de estos valores es secreto: cualquiera
   los ve en el navegador. La seguridad está en el backend, que solo contesta
   a un token de Google emitido para CLIENT_ID y cuyo correo sea el del dueño.

   API_URL   → la URL /exec de la aplicación web de Apps Script (README, paso 5).
   CLIENT_ID → el «ID de cliente» OAuth tipo «Aplicación web» (README, paso 3).

   Mientras falte cualquiera de los dos, la página abre en MODO DEMO con datos
   inventados (src/demo.js). También con ?demo en la URL. */
export const API_URL = 'https://script.google.com/macros/s/AKfycbwbS-rjbQxeUKJBUTNtFvBE0uUSkv8tMCKGlQJ0FrGPi56rrf90FXcCUA1tdAwJYrrd/exec'
export const CLIENT_ID = ''
