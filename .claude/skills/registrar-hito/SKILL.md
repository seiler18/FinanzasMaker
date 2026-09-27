---
name: registrar-hito
description: Dejar constancia en .claude/hitos/ de un cambio relevante en FinanzasMaker. Úsala al terminar un trabajo con sustancia (banco o formato nuevo, cambio en cómo se clasifica o se borra, vista nueva, cambio de seguridad, instalación) o cuando el usuario pida "registra esto", "anota el hito" o pregunte "¿en qué estábamos?".
---

# Registrar un hito

Los hitos son la memoria: **qué** se hizo, **cuándo** y sobre todo **por qué**.
`CLAUDE.md` describe cómo se trabaja hoy; los hitos, cómo se llegó hasta aquí;
las skills, cómo se hace algo paso a paso.

**Un hito no se edita ni se borra.** Si una decisión cambió, se escribe otro
que referencie al anterior.

## Cuándo SÍ

- Un banco o formato nuevo, o uno que cambió su plantilla.
- Un cambio en qué suma y qué no (tipos, reglas base, duplicados).
- Un cambio en cuándo se borra un correo.
- Una vista nueva, un cambio de seguridad, la instalación en la cuenta.

## Cuándo NO

Typos, un color, una regla de categoría suelta. Lo que el `git log` cuenta
igual de bien.

## Cómo

1. **Número:** `ls .claude/hitos/` → siguiente de cuatro dígitos,
   `NNNN-slug-sin-acentos.md`.
2. **Secciones** (si una no aplica, «Ninguna»): Contexto · Qué se hizo ·
   Decisiones y alternativas descartadas · Consecuencias · Pendiente.
   Encabezado con Fecha (absoluta), Estado y Commits.
3. **Índice:** una fila en `.claude/hitos/README.md`, la más reciente arriba.
4. ¿Cambió cómo se trabaja? Actualiza `CLAUDE.md`. ¿Cambió un procedimiento?
   Actualiza la skill.

En español, en pasado, concreto. Sin firma ni atribución a Claude.
