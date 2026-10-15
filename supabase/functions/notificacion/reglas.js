/* Categorías por reglas, en la página.

   Es la MISMA cuenta que categorizar_() de backend/Lectores.gs, que sigue
   usando el trabajador de Apps Script para lo que llega por correo. Antes la
   página no la necesitaba (el backend categorizaba al «Agregar»); con
   Supabase la página escribe directo y tiene que categorizar ella.
   tests/reglas.test.mjs ejecuta las dos versiones con los mismos casos: si
   cambias una, cambia la otra.

   Una regla es { patron, categoria, tipo }. La primera cuyo patrón (sin
   tildes ni mayúsculas) aparezca dentro de la contraparte gana. */

export const TIPOS = ['gasto', 'ingreso', 'interna', 'inversion', 'rescate', 'pago_tarjeta']

export const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
export const clave = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]/g, '')

// Un gasto desde la cuenta hacia algo con forma de nombre de persona.
function pareceTransferencia(mov) {
  const n = String(mov.contraparte || '')
  return mov.tipo === 'gasto' && mov.producto === 'Cuenta' && /^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,}$/.test(n) && !/\b(SPA|LTDA|SA)\b/i.test(n)
}

// Una regla con tipo respeta el sentido: «fintual → inversión» hace inversión
// lo que SALE hacia Fintual; lo que LLEGA desde Fintual es un rescate.
function tipoPorRegla(actual, regla) {
  if (actual === 'gasto') return regla
  if (actual === 'ingreso') return regla === 'inversion' ? 'rescate' : regla === 'interna' ? 'interna' : actual
  return actual
}

/* Modifica y devuelve `mov`, como su gemela. */
export function categorizar(mov, reglas) {
  const lista = reglas || []
  const k = clave(mov.contraparte)
  if (k && mov.tipo !== 'interna') {
    for (const r of lista) {
      const p = clave(r.patron)
      if (!p || !k.includes(p)) continue
      if (r.tipo && TIPOS.includes(r.tipo)) mov.tipo = tipoPorRegla(mov.tipo, r.tipo)
      if (!mov.categoria) mov.categoria = r.categoria
      break
    }
  }
  if (!mov.categoria) {
    if (mov.tipo === 'interna') mov.categoria = 'Entre mis cuentas'
    else if (mov.tipo === 'pago_tarjeta') mov.categoria = 'Pago de tarjeta'
    else if (mov.tipo === 'rescate' || mov.tipo === 'inversion') mov.categoria = 'Inversiones'
    else if (mov.tipo === 'ingreso') mov.categoria = 'Ingresos'
    else if (pareceTransferencia(mov)) mov.categoria = 'Transferencias a personas'
    else mov.categoria = 'Otros'
  }
  return mov
}
