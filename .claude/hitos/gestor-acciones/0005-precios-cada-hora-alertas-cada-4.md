# 0005 — Precios cada hora, alertas cada 4 horas

- **Fecha:** 2026-09-28
- **Estado:** completado en el repo; falta pegar `backend/Code.gs` en la hoja y usar «Aplicar horarios de Configuración»
- **Commits:** el de este hito

## Contexto

Jesús vio en la página una G/P no realizada distinta de la que Fintual le
mostraba en ese momento (incluso de otro signo), y preguntó si la causa era
la fuente de precios (Yahoo o GOOGLEFINANCE).

## Qué se encontró

Leída la hoja real para el diagnóstico (los montos no van al repo, regla 1):

- **El costo abierto cuadraba** con el de Fintual dentro del redondeo de su
  porcentaje. El cálculo (costo móvil, hito 0004) no era la causa.
- **La diferencia estaba en el valor de la cartera**, o sea en los precios:
  la última corrida del trigger de 8 h fue a las 08:58 de un lunes, antes de
  la apertura de Nueva York (10:30 hora de Chile). Los precios eran el cierre
  del viernes; Fintual mostraba los de la sesión en curso. La siguiente
  corrida era a las 16:58, casi al cierre.
- **La fuente no era el problema.** La hoja usa Yahoo (`regularMarketPrice`)
  y GOOGLEFINANCE solo como respaldo si Yahoo falla. Las dos dan el último
  precio con centavos de diferencia (GOOGLEFINANCE, hasta 20 min atrasado).

## Qué se hizo

- `backend/Code.gs`: la tarea única `tareaProgramada` cada 8 h se partió en
  dos triggers:
  - `actualizarProgramado`, cada **1 h**: correos + precios + hojas derivadas.
  - `alertasProgramadas`, cada **4 h**: `checkAlerts()` con los precios de la
    última actualización.
- Configuración: la fila 7 pasó a «Actualizar correos y precios cada (horas)»
  y la fila 11 nueva es «Revisar alertas y avisar por correo cada (horas)».
  `setupTrigger()` migra la fila 7 antigua (de 8 a 1) y crea la 11 si falta;
  valores fuera de 1, 2, 4, 6, 8, 12 (lo único que acepta `everyHours`)
  vuelven al valor por defecto.
- Menú nuevo «Aplicar horarios de Configuración» para reprogramar sin pasar
  por «Configurar todo».
- «Última ejecución» (fila 9) ya no la escribe `checkAlerts`: la escribe solo
  la lectura de correos, así marca cuándo se refrescaron los datos.
- `tareaProgramada` sigue en el menú («Actualizar y revisar alertas») y hace
  las dos cosas.

## Decisiones y alternativas descartadas

- **Cambiar a GOOGLEFINANCE:** descartado. No mejora la frescura (el precio
  solo cambia cuando corre el trigger) y las fórmulas no las lee Excel.
- **Alertas cada hora:** descartado a pedido de Jesús. El anti-spam
  (`lastSig`) no repite el mismo aviso, pero cuando un activo oscila en torno
  al umbral las señales cambian a menudo y llegarían demasiados correos.
- **Correr solo en horario de mercado:** descartado por ahora. 24 corridas al
  día caben de sobra en las cuotas de Apps Script, y leer correos cada hora
  sirve igual fuera de horario (FinanzasMaker los manda a la papelera).

## Consecuencias

- Los precios de la página van a lo más ~1 h detrás de Fintual en horario de
  mercado. Nunca van a calzar al minuto.
- Las alertas por correo llegan a lo más cada 4 h.

## Pendiente

- Pegar `backend/Code.gs` en la hoja y usar Fintual → «Aplicar horarios de
  Configuración» (sin esto sigue el trigger viejo de 8 h). `Api.gs` no cambió:
  no hace falta nueva versión de la aplicación web.
