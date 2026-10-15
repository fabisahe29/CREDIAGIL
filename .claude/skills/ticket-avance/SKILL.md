---
name: "ticket-avance"
description: "Publica en el issue de origen el comentario de avance del hito 'especificacion' o 'plan' (resumen y ruta de la spec, o decisiones del plan). Lo invocan los hooks de Spec Kit after_specify y after_plan."
argument-hint: "especificacion | plan (opcional; se deduce de los artefactos)"
user-invocable: true
disable-model-invocation: false
---

# /ticket-avance

Publica un comentario de avance en el issue de origen de la spec activa. Cubre los hitos `especificacion` y `plan` de FR-012. Los hitos `inicio`, `pr` y `cierre` los publican `/ticket-tomar`, `/ticket-abrir-pr` y `/ticket-cerrar`.

Contrato: [contracts/comandos.md](../../../specs/001-sincronizacion-backlog-github/contracts/comandos.md#ticket-avance-hito)

## Entrada

```text
$ARGUMENTS
```

- `especificacion` o `plan`: el hito a publicar.
- Si viene vacío, se deduce: si la carpeta activa tiene `plan.md`, es `plan`; si solo tiene `spec.md`, es `especificacion`.
- Cualquier otro valor: informa los valores válidos y termina.

## Precondiciones

1. Lee `.claude/flujo-github.md` y aplica sus reglas comunes.
2. Carpeta activa: `.specify/feature.json` → `feature_directory`. Si no existe, ⛔ "no hay feature activa" y termina.

## Flujo

1. **Resolver el issue** con la Regla 2, pasos 2 a 4. Si `spec.md` no tiene la línea `**Issue de origen**` y la rama tampoco da un número, informa "spec sin issue de origen; no se comenta" y **termina sin error**, para no bloquear a Spec Kit. No preguntes en ese caso.
2. **Comprobar el artefacto.** Para `especificacion` debe existir `spec.md`; para `plan`, `plan.md`. Si falta, ⛔ y termina.
3. **Idempotencia** (Regla 4). Si ya existe un comentario con `<!-- crediagil:hito=<hito> -->`, informa ↺ y termina.
4. **Componer el comentario** con la plantilla del hito en [comentarios.md](../../../specs/001-sincronizacion-backlog-github/contracts/comentarios.md). El enlace a la carpeta o archivo es `https://github.com/fabisahe29/CREDIAGIL/tree/<rama-actual>/<ruta>`, con la rama codificada para URL.
   - **`especificacion`**, a partir de `spec.md`:
     - Ruta de la carpeta.
     - Una viñeta por historia de usuario, con su título y prioridad.
     - El número de requisitos funcionales (`FR-…`) y de criterios de éxito (`SC-…`).
     - Las respuestas de la sección `## Clarifications`, en formato `Q → A` resumido, o "ninguna".
   - **`plan`**, a partir de `plan.md` y `research.md`:
     - Enlace al plan.
     - Una viñeta por decisión de `research.md` (`R1`, `R2`…), con decisión, motivo en una línea y alternativa descartada.
     - El resultado del Constitution Check: sin desviaciones, o las desviaciones justificadas.
     - Si el comentario supera unas 40 líneas, resume las decisiones menores en una sola viñeta y enlaza a `research.md`.
5. **Publicar** con `mcp__github__add_issue_comment` (`owner: fabisahe29`, `repo: CREDIAGIL`, `issue_number: <N>`).

## Errores

| Situación | Comportamiento |
|-----------|----------------|
| Spec sin issue de origen | Aviso, termina sin error |
| Falta el artefacto del hito | ⛔ |
| El marcador ya existe | ↺ |
| Falla el MCP | Regla 1 |

## Salida

El resumen de la Regla 6, con un único efecto: `comentario <hito>`, más el enlace al comentario si se publicó.
