# Contrato: comandos propios del flujo de tickets

**Feature**: [../spec.md](../spec.md) · **Modelo**: [../data-model.md](../data-model.md) · **Comentarios**: [comentarios.md](comentarios.md)

Interfaz que el repositorio expone al desarrollador: cuatro comandos de Claude Code, versionados en `.claude/skills/<nombre>/SKILL.md`. Todos leen las constantes de `.claude/flujo-github.md` y actúan sobre GitHub **solo** con herramientas `mcp__github__*`.

## Reglas comunes

- **Precondición global**: el servidor MCP `github` está conectado. Si una llamada falla por credencial ausente o sin permisos, el comando se detiene. Informa qué falló, qué pasos alcanzó a aplicar y cuáles no (FR-015) y no intenta vías alternativas como `gh` o la API REST.
- **Idempotencia**: antes de cada efecto se verifica si ya está aplicado (R4). Reinvocar un comando completa los efectos faltantes y nunca duplica ninguno.
- **Estado inesperado**: si el Status actual no es el origen esperado, el comando muestra el estado actual y el destino, y pide confirmación antes de escribir.
- **Salida**: cada comando termina con un resumen de una línea por efecto, con su resultado: ✅ aplicado, ↺ ya estaba aplicado, ⛔ no aplicado (con motivo).

---

## `/ticket-tomar`

Toma el siguiente ticket, elegido por el desarrollador (FR-004 a FR-006, FR-014).

| | |
|---|---|
| **Argumentos** | opcional: `<N>`, número de issue, para saltar la lista. Se valida igual que una elección. |
| **Lecturas** | `projects_list` · `list_project_items` (`query: "is:issue status:Todo"`, `field_names: ["Status"]`, todas las páginas) · `issue_read` · `get` |
| **Escrituras** | `projects_write` · `update_project_item` (Status → `In Progress`) · `add_issue_comment` (hito `inicio`) |
| **Local** | `git switch -c <N>-<slug>` desde `main`, salvo que ya se esté en una rama de trabajo distinta de `main` |

**Flujo**:

1. Listar los tickets en `Todo`, en el orden del Project: número, título y etiquetas. Si no hay ninguno, informar "No hay tickets en Todo" y terminar sin cambios.
2. Pedir la elección. Si se cancela, terminar sin cambios.
3. Releer el ítem elegido. Si ya no está en `Todo` o no pertenece a la lista, rechazar y volver al paso 1.
4. Status → `In Progress`; comentario `inicio`; crear la rama local.
5. Mostrar título, enlace, etiquetas, milestone y cuerpo, e indicar que el siguiente paso es `/speckit.specify` con ese contenido. La spec MUST incluir la línea `**Issue de origen**` (FR-010).

**Errores**: sin tickets → aviso, sin cambios · elección inválida → nueva lista · el Status no se puede escribir → ⛔ y se detiene antes de comentar.

---

## `/ticket-avance <hito>`

Publica un comentario de avance de los hitos `especificacion` o `plan` (FR-011, FR-012). Lo invocan los hooks de Spec Kit y también se puede invocar a mano.

| | |
|---|---|
| **Argumentos** | `especificacion` · `plan`. Si se omite, se deduce del artefacto más reciente: con `plan.md` → `plan`; con solo `spec.md` → `especificacion`. |
| **Entrada** | carpeta activa (`.specify/feature.json`) → `spec.md` (línea "Issue de origen") y `plan.md` / `research.md` |
| **Lecturas** | `issue_read` · `get_comments` (buscar el marcador) |
| **Escrituras** | `add_issue_comment` |

**Flujo**: resolver el issue (R3) → si el marcador del hito ya existe, terminar (↺) → componer el comentario con la plantilla → publicar.

**Errores**: la spec no tiene "Issue de origen" → informar "spec sin issue de origen; no se comenta" y terminar sin error, para no bloquear a Spec Kit · falta el artefacto del hito → ⛔.

---

## `/ticket-abrir-pr`

Revisa el ticket y, solo si las revisiones lo permiten, abre el pull request en un solo paso (FR-007, FR-009). Las revisiones previas las agregó el #6: [specs/004-revision-independiente-pr/contracts/ticket-abrir-pr.md](../../004-revision-independiente-pr/contracts/ticket-abrir-pr.md).

| | |
|---|---|
| **Argumentos** | opcional: `<N>`. Por defecto, el issue se resuelve con R3. |
| **Lecturas** | `list_branches` / `list_commits` (la rama existe en el remoto y tiene commits respecto de `main`) · `issue_read` · `get_comments` (registros de revisión del `sha`, Regla 7, y marcador `pr`) · `list_pull_requests` (`head: <owner>:<rama>`, `state: open`) |
| **Locales** | `node .claude/revision/revision.ts preparar` · `reutilizar <sha>` · `decidir <sha>` · skills `revisar-codigo` y `revisar-cumplimiento` (subagentes revisores) |
| **Escrituras** | `add_issue_comment` (registros de revisión) · `create_pull_request` (vigilado por el control `puerta-pr` del guardián) · `update_project_item` (Status → `In review`) · `add_issue_comment` (hito `pr`) |

**Flujo**:

1. Verificar la rama remota. Si no existe o no tiene cambios, ⛔ con el motivo (por ejemplo, "publica la rama con `git push -u origin <rama>`") y terminar sin cambios.
2. **Revisiones** sobre el head de `origin/<rama>` (pasos R1 a R7 del contrato del #6): buscar registros previos del `sha` y reutilizarlos, o preparar el paquete y ejecutar las dos revisiones con un reintento acotado; decidir por gravedad; publicar los registros en el issue. Si la decisión bloquea, ⛔ «PR no abierto» con los motivos, el Status sigue en `In Progress` y el comando termina.
3. Si ya hay un PR abierto para la rama, reutilizarlo (↺). Si no, crearlo: base `main`, título convencional, cuerpo según la plantilla PR de [comentarios.md](comentarios.md) con `Closes #<N>` y la sección `## Revisiones`.
4. Status → `In review`.
5. Comentario `pr` con el enlace al PR y lo pendiente. Lo pendiente sale de las tareas sin marcar en `tasks.md`, si existe, y de lo diferido en la spec y el plan; si no queda nada, se dice explícitamente.

---

## `/ticket-cerrar`

Fusiona y cierra el ticket en un solo paso (FR-008, FR-008a, FR-008b).

| | |
|---|---|
| **Argumentos** | opcional: `<N>` o número de PR. Por defecto, el PR abierto de la rama actual. |
| **Lecturas** | `pull_request_read` · `get`, `get_status`, `get_reviews` · `issue_read` · `get_comments` |
| **Escrituras** | `merge_pull_request` (`merge_method: squash`) · `update_project_item` (Status → `Done`) · `add_issue_comment` (hito `cierre`) |

**Flujo**:

1. Leer el PR. Si ya está fusionado, saltar al paso 3 (↺, FR-008b). Si está cerrado sin fusionar, ⛔ "PR cerrado sin fusionar; el ticket no pasa a Done".
2. Verificar fusionabilidad (R9): `mergeable_state` igual a `clean`, checks en verde (un `pending` sin statuses cuenta como verde), sin `CHANGES_REQUESTED` y no borrador. Si falla, ⛔ con el motivo concreto; el ticket sigue en `In review`. Si pasa, fusionar con squash y título convencional `<tipo>: <resumen> (#<N>)`.
3. Status → `Done`. Confirmar que el issue quedó cerrado; si no se cerró (faltaba `Closes`), informarlo como ⛔. Este comando no cierra el issue a mano.
4. Comentario `cierre`.
5. Recordar al desarrollador que actualice su copia local (`git switch main && git pull`).

---

## Hooks de Spec Kit (`.specify/extensions.yml`)

```yaml
hooks:
  after_specify:
    - extension: crediagil-flujo
      command: ticket.avance
      description: Comenta en el issue de origen que la especificación terminó
      prompt: Ejecutar /ticket-avance especificacion
      optional: false
  after_plan:
    - extension: crediagil-flujo
      command: ticket.avance
      description: Comenta en el issue de origen las decisiones del plan
      prompt: Ejecutar /ticket-avance plan
      optional: false
```

Spec Kit convierte `ticket.avance` en `/ticket-avance`, según la regla de reemplazar puntos por guiones.
