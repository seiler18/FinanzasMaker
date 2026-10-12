import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_CLAVE } from '../config.js'

/* El cliente de Supabase, uno solo para toda la página.

   La sesión vive en sessionStorage, no en localStorage (lo de fábrica): se
   va al cerrar la pestaña, igual que el token de Google que se guardaba antes
   (SECURITY.md, A4). Al volver, el botón de Google entra solo (auto_select).
   El acceso al almacenamiento va envuelto: en modo privado puede lanzar, y
   entonces la sesión vale solo para esta carga. */
const almacen = {
  getItem: (k) => { try { return sessionStorage.getItem(k) } catch { return null } },
  setItem: (k, v) => { try { sessionStorage.setItem(k, v) } catch { /* modo privado */ } },
  removeItem: (k) => { try { sessionStorage.removeItem(k) } catch { /* modo privado */ } },
}

let cliente
export function supa() {
  cliente ??= createClient(SUPABASE_URL, SUPABASE_CLAVE, {
    auth: { storage: almacen, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return cliente
}
