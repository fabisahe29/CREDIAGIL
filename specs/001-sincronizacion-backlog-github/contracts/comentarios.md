# Contrato: plantillas de comentarios de avance y de pull request

**Feature**: [../spec.md](../spec.md) · Requisito: FR-012 (contenido mínimo por hito)

Reglas para todos los comentarios:

- La primera línea es el marcador invisible `<!-- crediagil:hito=<hito> -->`. Es la clave de idempotencia (R4).
- Van en español y en Markdown.
- Las rutas se escriben relativas a la raíz del repositorio, con enlace a la rama correspondiente.
- No incluyen datos de solicitantes ni secretos (constitución, Principio II). Solo hablan del trabajo.

Los textos entre `{llaves}` son campos que se rellenan.

## `inicio` — `/ticket-tomar`

```markdown
<!-- crediagil:hito=inicio -->
🚧 **Inicio de trabajo**

El ticket pasa a **In Progress** en el Project.
Rama de trabajo: `{rama}`

Siguiente paso: especificarlo con `/speckit.specify`.
```

## `especificacion` — `/ticket-avance especificacion`

```markdown
<!-- crediagil:hito=especificacion -->
📝 **Especificación terminada**

Carpeta: [`{specs/NNN-slug}/`]({url a la carpeta en la rama})

**Qué se especificó**
- {una línea por historia de usuario, con su prioridad}
- {n} requisitos funcionales · {m} criterios de éxito

**Aclaraciones registradas**: {lista Q → A de la sección Clarifications, o "ninguna"}
```

## `plan` — `/ticket-avance plan`

```markdown
<!-- crediagil:hito=plan -->
🧭 **Plan terminado**

Plan: [`{specs/NNN-slug}/plan.md`]({url})

**Decisiones principales**
- {decisión} — {motivo en una línea} (descartado: {alternativa})

**Constitución**: {sin desviaciones | desviaciones justificadas: …}
```

## `pr` — `/ticket-abrir-pr`

```markdown
<!-- crediagil:hito=pr -->
🔍 **Pull request abierto**: #{pr}

El ticket pasa a **In review**.

**Pendiente**
- {elemento pendiente, o "Nada pendiente: todos los criterios de aceptación quedan cubiertos por el PR."}
```

## `cierre` — `/ticket-cerrar`

```markdown
<!-- crediagil:hito=cierre -->
✅ **Ticket cerrado**

PR #{pr} fusionado en `main` ({sha corto}). El ticket pasa a **Done**.

**Resultado**: {resumen de una o dos líneas de lo entregado}
**Quedó fuera / para después**: {elementos, con enlace a issues si existen, o "nada"}
```

## Cuerpo del pull request — `/ticket-abrir-pr`

```markdown
## Resumen
{qué cambia, en 1–3 viñetas}

## Trazabilidad
- Issue: Closes #{N}
- Especificación: [`{specs/NNN-slug}/`]({url})

## Verificación
{cómo se validó; referencia a quickstart.md}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
