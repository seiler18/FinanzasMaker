/* La configuración del dueño: claves, valor de fábrica y para qué sirve.

   Es la misma lista que CONFIG_BASE de backend/Code.gs (el trabajador la usa
   cuando falta una clave en la tabla `config`). tests/reglas.test.mjs
   comprueba que las dos digan lo mismo. Antes se editaba en la pestaña Config
   de la planilla; ahora, en Ajustes. */
export const CONFIG_BASE = [
  ['titular', 'Jesus Seiler', 'Tu nombre tal como lo escriben los bancos (nombre + apellido). Sirve para reconocer transferencias entre tus cuentas.'],
  ['desde', '2026/01/01', 'Primera fecha que se importa (AAAA/MM/DD).'],
  ['borrar_correos', 'si', '«si»: el correo va a la papelera después de registrarlo. «no»: se deja donde está.'],
  ['dolar', '950', 'Pesos por dólar para convertir compras en USD (aproximado).'],
  ['cuentas_externas', 'Mercado Pago', 'Cuentas tuyas que no avisan lo que reciben (separadas por coma): lo que sale de ellas a tus cuentas cuenta como ingreso, y lo que les mandas, como gasto.'],
  ['bancos_por_aviso', '', 'Bancos que ya se leen por los avisos del celular (separados por coma, como salen en Movimientos: MACH, Tenpo…). Su correo solo completa lo que trajo el aviso; si llega uno sin aviso, va a «Por revisar».'],
  ['vendedores_cripto', 'Leveltech', 'Vendedores de Binance P2P a quienes les compras USDT (separados por coma): esa transferencia pasa a tu cuenta de Binance y no es gasto; el gasto se cuenta cuando el USDT sale por Binance Pay.'],
  ['umbral_venta_pct', '5', 'Inversiones: avisa «¿vender?» cuando una posición gana más de este % sobre su costo.'],
  ['umbral_caida_pct', '3', 'Inversiones: avisa «¿comprar?» cuando un activo cae más de este % en el día.'],
  ['acciones_desde', '2026/06/04', 'Inversiones: primera fecha de los correos de operaciones de Fintual que se leen (AAAA/MM/DD).'],
  ['email_alertas', '', 'Inversiones: a qué correo llegan los avisos. Vacío: al de la cuenta que instaló el script.'],
]

/* Las filas de la tabla, completadas con lo de fábrica. */
export function conBase(filas) {
  const o = {}
  for (const f of filas || []) o[String(f.clave)] = String(f.valor)
  for (const [k, v] of CONFIG_BASE) if (!(k in o)) o[k] = v
  return o
}
