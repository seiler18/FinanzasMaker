/* Configuración del front. Ninguno de estos valores es secreto: cualquiera
   los ve en el navegador.

   SUPABASE_URL / SUPABASE_CLAVE → la base (v2, hito 0010). La clave es la
   «publicable» (sb_publishable_…): sin sesión no abre nada, porque anon no
   tiene privilegios y cada tabla tiene RLS (supabase/migrations/).
   CLIENT_ID → el «ID de cliente» OAuth tipo «Aplicación web» del botón de
   Google (README, paso 3). Supabase lo acepta como audiencia del token.
   API_URL   → la URL /exec del Apps Script, que ahora es solo el trabajador
   de fondo: la página lo llama únicamente para «Revisar correos ahora».

   Si falta SUPABASE_URL o CLIENT_ID, la página abre en MODO DEMO con datos
   inventados (src/demo.js). También con ?demo en la URL. */
export const SUPABASE_URL = 'https://mbcswbrmgfgmpsssnfzh.supabase.co'
export const SUPABASE_CLAVE = 'sb_publishable_-t06XtMFLDB8rs1bfbGl-A_XqV7uDbc'
export const CLIENT_ID = '684530628889-hrt90da5gqaah1pknbbnhhffqugje5sq.apps.googleusercontent.com'
export const API_URL = 'https://script.google.com/macros/s/AKfycbwbS-rjbQxeUKJBUTNtFvBE0uUSkv8tMCKGlQJ0FrGPi56rrf90FXcCUA1tdAwJYrrd/exec'
