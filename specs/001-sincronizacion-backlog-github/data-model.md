# Data Model: Sincronización autónoma del backlog con GitHub

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

Esta funcionalidad no tiene almacenamiento propio. Las entidades viven en GitHub (issues, Project, pull requests) y en archivos versionados del repositorio. Este documento fija sus atributos relevantes, sus reglas de validación y la máquina de estados del ticket.

## Constantes del flujo

Viven en un único archivo de referencia, [.claude/flujo-github.md](../../.claude/flujo-github.md), que leen todos los comandos.

| Constante | Valor |
|-----------|-------|
| Repositorio | `fabisahe29/CREDIAGIL` |
| Project | usuario `fabisahe29`, número `1` |
| Campo de estado | `Status` |
| Opciones de Status | `Todo`, `In Progress`, `In review`, `Done` |
| Rama base | `main` |
| Prefijo de marcador | `crediagil:hito=` |

## Entidades

### Ticket (issue de GitHub)

| Atributo | Fuente | Uso |
|----------|--------|-----|
| `number` | issue | identidad; clave en todos los comandos |
| `title`, `body` | issue | insumo de `/speckit.specify` (FR-005) |
| `html_url` | issue | enlace en la spec (FR-010) |
| `labels`, `milestone` | issue | se muestran en la lista y se pasan como contexto |
| `state` | issue | `open` / `closed`; el cierre lo produce la fusión (FR-009) |
| comentarios | issue | historial de avance (FR-012) |

**Validación**: solo los ítems del Project cuyo contenido es un *issue* son tickets; los borradores y los pull requests se excluyen de la lista.

### Ítem del Project

| Atributo | Fuente | Uso |
|----------|--------|-----|
| `id` / `node_id` | Project | se resuelve por `owner + repo + issue_number`; no se guarda |
| `Status` | campo single-select | estado del ticket (ver máquina de estados) |
| posición | orden de `list_project_items` | orden de la lista en `/ticket-tomar` |

### Especificación (carpeta `specs/<NNN>-<slug>/`)

| Atributo | Regla |
|----------|-------|
| `spec.md` → línea `**Issue de origen**` | MUST existir y tener el formato `[<owner>/<repo>#<N> — <título>](<url>)`. Es el vínculo spec → issue (FR-010, R3) |
| Ruta de la carpeta | se publica en el comentario del hito `especificacion` (vínculo issue → spec, FR-011) |
| Carpeta activa | la indica `.specify/feature.json` → `feature_directory` (local, no versionado) |

### Pull request

| Atributo | Regla |
|----------|-------|
| `head` | rama de trabajo del ticket; hay como máximo un PR abierto por ticket |
| `base` | `main` |
| `title` | commit convencional, p. ej. `feat: sincronización autónoma del backlog (#3)` |
| `body` | MUST contener `Closes #<N>` (FR-009) y el enlace a la carpeta de la spec |
| `merged` | `true` solo por `/ticket-cerrar`, salvo fusión manual (caso borde) |

### Comentario de avance

| Atributo | Regla |
|----------|-------|
| `hito` | uno de `inicio`, `especificacion`, `plan`, `pr`, `cierre` |
| marcador | primera línea: `<!-- crediagil:hito=<hito> -->` (invisible en GitHub) |
| unicidad | como máximo un comentario por `(issue, hito)`; si el marcador ya existe, no se publica otro (FR-016) |
| contenido | plantilla por hito en [contracts/comentarios.md](contracts/comentarios.md) |

### Registro de decisión (`DECISIONES.md`, raíz del repositorio)

Cada entrada lleva fecha, issue, decisión, motivo, alternativa descartada y consecuencias. La primera entrada son las decisiones R1 y R2 de [research.md](research.md) (FR-013).

## Máquina de estados del ticket

```text
            /ticket-tomar             /ticket-abrir-pr            /ticket-cerrar
  Todo ─────────────────► In Progress ─────────────────► In review ───────────────► Done
   │  comentario: inicio      │ hooks Spec Kit:            │ comentario: pr          comentario: cierre
   │                          │  · especificacion          │                         issue cerrado (Closes #N)
   │                          │  · plan                    │
                                                           └─ PR no fusionable → sigue en In review (FR-008a)
```

| Transición | Disparador | Precondición | Efectos (en orden) |
|------------|-----------|--------------|--------------------|
| Todo → In Progress | `/ticket-tomar` + elección | el ítem sigue en `Todo` al confirmar | Status → `In Progress` · comentario `inicio` · rama local · contenido entregado a `/speckit.specify` |
| (sin cambio de estado) | hook `after_specify` → `/ticket-avance` | la spec tiene "Issue de origen" | comentario `especificacion` |
| (sin cambio de estado) | hook `after_plan` → `/ticket-avance` | existe `plan.md` | comentario `plan` |
| In Progress → In review | `/ticket-abrir-pr` | rama publicada con commits respecto de `main` | PR con `Closes #N` · Status → `In review` · comentario `pr` |
| In review → Done | `/ticket-cerrar` | PR fusionable (R9) o ya fusionado | fusión squash · Status → `Done` · comentario `cierre` |

**Reglas**:

- Una transición solo escribe el Status si el valor actual es distinto del destino (R4).
- Si el Status actual no es el origen esperado (alguien lo movió a mano), el comando muestra el valor actual y el destino, y pide confirmación antes de sobrescribirlo. Esto resuelve el único punto que quedó abierto en la clarificación.
- Los efectos de cada transición son reintentables: al reinvocar el comando se completan solo los que faltan.
