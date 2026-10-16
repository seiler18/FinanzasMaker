/* ¿La página se está viendo dentro de la app FinanzasMaker para Android?

   La app abre la página como Trusted Web Activity (Chrome a pantalla
   completa, repo FinanzasMaker-android): en la primera carga Chrome pone como
   `document.referrer` «android-app://<paquete>/». Las navegaciones siguientes
   ya no lo traen, así que se recuerda en sessionStorage, que dura lo que dura
   esa pestaña de la app. Solo decide si mostrar enlaces que vuelven a la app;
   nada de seguridad depende de esto. */
const PAQUETE = 'io.github.seiler18.finanzasmaker'
const MARCA = 'fm-en-app'

let enApp = null

export function enLaApp() {
  if (enApp !== null) return enApp
  enApp = String(document.referrer).startsWith(`android-app://${PAQUETE}`)
  try {
    if (enApp) sessionStorage.setItem(MARCA, '1')
    else enApp = sessionStorage.getItem(MARCA) === '1'
  } catch {
    // Sin sessionStorage (modo privado estricto): vale lo del referrer.
  }
  return enApp
}
