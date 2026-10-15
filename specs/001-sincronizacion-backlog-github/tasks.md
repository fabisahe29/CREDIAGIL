---

description: "Lista de tareas: sincronización autónoma del backlog con GitHub"
---

# Tasks: Sincronización autónoma del backlog con GitHub

**Input**: documentos de diseño en `specs/001-sincronizacion-backlog-github/`

**Issue de origen**: [fabisahe29/CREDIAGIL#3](https://github.com/fabisahe29/CREDIAGIL/issues/3)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: la spec no pide pruebas automatizadas y la feature no tiene código ejecutable propio (plan, R1). Cada historia cierra con una tarea de **validación manual** que sigue un escenario de [quickstart.md](quickstart.md).

**Organization**: las tareas se agrupan por historia de usuario. US4 (configuración) va primero porque las demás historias necesitan el MCP conectado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario a la que pertenece (US1–US4)

## Path Conventions

Sin `src/` ni `tests/`. Los archivos van en la raíz del repositorio, en `.claude/` y en `.specify/` (ver plan, Project Structure).

**Formato de cada skill** (para todas las tareas `SKILL.md`): frontmatter YAML con `name`, `description`, `argument-hint`, `user-invocable: true` y `disable-model-invocation: false`, igual que en `.claude/skills/speckit-specify/SKILL.md`. El cuerpo va en español y se organiza en las secciones *Entrada*, *Precondiciones*, *Flujo* (pasos numerados), *Errores* y *Salida*. La primera instrucción del flujo es: "Lee `.claude/flujo-github.md` y aplica sus reglas comunes".

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar que el entorno real coincide con lo que asume el diseño, antes de escribir nada.

- [X] T001 Verificar por MCP (solo lectura) que `projects_list` · `list_project_fields` del Project 1 de `fabisahe29` devuelve el campo `Status` con exactamente las opciones `Todo`, `In Progress`, `In review` y `Done`, y que `get_me` responde. Si algo no coincide, detenerse y actualizar [data-model.md](data-model.md) antes de seguir. No crea archivos.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: el archivo de constantes y reglas comunes que leen los cuatro comandos.

**⚠️ CRITICAL**: ningún `SKILL.md` se escribe antes de terminar esta fase.

- [X] T002 Crear `.claude/flujo-github.md` con:
  - La tabla de constantes de [data-model.md](data-model.md): repositorio `fabisahe29/CREDIAGIL`, Project del usuario `fabisahe29` número `1`, campo `Status`, opciones `Todo` · `In Progress` · `In review` · `Done`, rama base `main` y prefijo de marcador `crediagil:hito=`.
  - Las *Reglas comunes* de [contracts/comandos.md](contracts/comandos.md): solo herramientas `mcp__github__*`, sin fallback a `gh` ni a REST; idempotencia R4; confirmación ante un estado inesperado; resumen final con ✅ / ↺ / ⛔.
  - El procedimiento para resolver el issue (R3): línea `**Issue de origen**` de `spec.md` en `.specify/feature.json` → `feature_directory`; si falta, el prefijo `<N>-` de la rama; si tampoco está, preguntar.
  - La forma de escribir el Status (R5): `projects_write` · `update_project_item` con `item_owner` + `item_repo` + `issue_number` y `updated_field: {"name": "Status", "value": "<opción>"}`, tras leer el valor actual con `projects_get` · `get_project_item` y `field_names: ["Status"]`.
  - La regla de marcadores: la primera línea de cada comentario es `<!-- crediagil:hito=<hito> -->`, con hito en `inicio` | `especificacion` | `plan` | `pr` | `cierre`, "como máximo un comentario por `(issue, hito)`". Antes de publicar se lee `issue_read` · `get_comments` paginado.
  - Un enlace a las plantillas: dentro de `.claude/flujo-github.md`, la ruta relativa es `../specs/001-sincronizacion-backlog-github/contracts/comentarios.md` (ver [contracts/comentarios.md](contracts/comentarios.md)).

**Checkpoint**: constantes listas; ya se pueden escribir las historias.

---

## Phase 3: User Story 4 - Configuración compartida y segura del acceso a GitHub (Priority: P1)

**Goal**: un clon limpio trae el MCP de GitHub y los comandos; el desarrollador solo aporta su token por entorno.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 0.

### Implementation for User Story 4

- [X] T003 [P] [US4] Revisar `.mcp.json` (ya existe, sin versionar) y confirmar que contiene exactamente: servidor `github`, `type: http`, `url: https://api.githubcopilot.com/mcp/`, cabecera `Authorization: Bearer ${GIT_HUB}` y `X-MCP-Toolsets: context,repos,issues,pull_requests,projects`, sin ningún token literal. Ajustar solo si algo difiere (R8).
- [X] T004 [P] [US4] Crear `.env.example` en la raíz con un comentario que explique que el token se define en el entorno de la sesión y nunca en archivos versionados, los permisos necesarios (repo, issues, pull requests, Projects) y la línea `GIT_HUB=` sin valor.
- [X] T005 [US4] Ejecutar la búsqueda de secretos del Escenario 0 de [quickstart.md](quickstart.md) sobre el árbol de trabajo (`git grep` más los archivos sin seguimiento) y el historial (`git rev-list --all`). Debe dar 0 resultados (SC-005). Si aparece algo, detenerse e informar sin publicar nada.

**Checkpoint**: configuración lista para versionar. El commit se hace en la fase final.

---

## Phase 4: User Story 1 - Tomar el siguiente ticket del backlog (Priority: P1) 🎯 MVP

**Goal**: `/ticket-tomar` lista los tickets en **Todo**, el desarrollador elige uno, y el comando lo pasa a **In Progress**, comenta el inicio, crea la rama y entrega el contenido para `/speckit.specify`.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 2, pasos 1 a 3.

### Implementation for User Story 1

- [X] T006 [US1] Crear `.claude/skills/ticket-tomar/SKILL.md` según [contracts/comandos.md](contracts/comandos.md), sección `/ticket-tomar`:
  - argumento opcional `<N>`;
  - listar con `projects_list` · `list_project_items` (`query: "is:issue status:Todo"`, `field_names: ["Status"]`), recorriendo todas las páginas con `after`, y mostrar número, título y etiquetas en el orden del Project;
  - "solo los ítems cuyo contenido es un *issue* son tickets" (excluir borradores y PR);
  - sin tickets → "No hay tickets en Todo", sin cambios (FR-014);
  - pedir la elección; si se cancela, no se cambia nada;
  - releer el ítem y, si ya no está en `Todo`, rechazar y volver a listar;
  - Status → `In Progress`;
  - comentario `inicio` con la plantilla de [contracts/comentarios.md](contracts/comentarios.md);
  - `git switch -c <N>-<slug>` desde `main` actualizado, salvo que ya se esté en una rama de trabajo; el slug va en minúsculas, sin tildes, con guiones y con un máximo de 40 caracteres;
  - mostrar título, enlace, etiquetas, milestone y cuerpo, e indicar que el siguiente paso es `/speckit.specify` y que la spec MUST incluir `**Issue de origen**: [fabisahe29/CREDIAGIL#<N> — <título>](<url>)` (FR-010).
- [X] T007 [US1] Validación manual: ejecutar `/ticket-tomar` y cancelar. Debe mostrar la lista y no cambiar nada (Escenario 2, pasos 1 y 2). No tomar un ticket real hasta la fase final (T017).

**Checkpoint**: US1 lista. Es el MVP: ya no hace falta pegar tickets a mano.

---

## Phase 5: User Story 2 - Estado del ticket alineado con el ciclo del pull request (Priority: P2)

**Goal**: `/ticket-abrir-pr` y `/ticket-cerrar` llevan el ticket a **In review** y a **Done**, cada uno en un solo paso con su efecto en GitHub.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 1, pasos 4 a 6, sobre el issue #3.

### Implementation for User Story 2

- [X] T008 [P] [US2] Crear `.claude/skills/ticket-abrir-pr/SKILL.md` según [contracts/comandos.md](contracts/comandos.md), sección `/ticket-abrir-pr`:
  - argumento opcional `<N>`; resolver el issue con R3;
  - verificar con `list_branches` y `list_commits` que la rama actual existe en el remoto y tiene commits respecto de `main`; si no, ⛔ con la instrucción `git push -u origin <rama>` y sin cambios;
  - buscar un PR abierto con `list_pull_requests` (`head: fabisahe29:<rama>`, `state: open`) y reutilizarlo (↺); si no hay, crearlo con `create_pull_request` (base `main`, título en formato de commit convencional, cuerpo según la plantilla "Cuerpo del pull request" con `Closes #<N>`) (FR-009);
  - Status → `In review` (con confirmación si el estado actual no es `In Progress`);
  - comentario `pr` con el enlace al PR y lo pendiente: tareas sin marcar en `tasks.md` y elementos diferidos de la spec y el plan, o "Nada pendiente…".
- [X] T009 [P] [US2] Crear `.claude/skills/ticket-cerrar/SKILL.md` según [contracts/comandos.md](contracts/comandos.md), sección `/ticket-cerrar`:
  - argumento opcional `<N>` o número de PR; por defecto, el PR abierto de la rama actual;
  - `pull_request_read` · `get`; si ya está fusionado, saltar a Status (↺, FR-008b); si está cerrado sin fusionar, ⛔ "PR cerrado sin fusionar; el ticket no pasa a Done";
  - verificar R9 con `get`, `get_status` y `get_reviews`: `mergeable` es verdadero, estado combinado distinto de `failure` y `pending`, sin `CHANGES_REQUESTED` y no borrador; si falla, ⛔ con el motivo concreto y el ticket sigue en `In review` (FR-008a);
  - `merge_pull_request` con `merge_method: squash` y título `<tipo>: <resumen> (#<N>)`;
  - Status → `Done`;
  - confirmar con `issue_read` · `get` que el issue quedó cerrado; si no, ⛔ "falta `Closes #N`" y no cerrarlo a mano;
  - comentario `cierre`;
  - recordar `git switch main && git pull`.

**Checkpoint**: US2 lista. Se valida al cerrar el issue #3 en la fase final (T015–T016).

---

## Phase 6: User Story 3 - Historial de avance en el issue (Priority: P3)

**Goal**: los hitos `especificacion` y `plan` se comentan solos al terminar `/speckit.specify` y `/speckit.plan`. Los hitos `inicio`, `pr` y `cierre` ya los publican US1 y US2.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 1, pasos 1 a 3, sobre el issue #3.

### Implementation for User Story 3

- [X] T010 [P] [US3] Crear `.claude/skills/ticket-avance/SKILL.md` según [contracts/comandos.md](contracts/comandos.md), sección `/ticket-avance`:
  - argumento `especificacion` | `plan`; si se omite, se deduce: con `plan.md` → `plan`, con solo `spec.md` → `especificacion`;
  - resolver el issue con R3; si la spec no tiene "Issue de origen", informar "spec sin issue de origen; no se comenta" y terminar **sin error**, para no bloquear a Spec Kit;
  - si el marcador del hito ya existe en los comentarios, terminar (↺);
  - componer el comentario con la plantilla de [contracts/comentarios.md](contracts/comentarios.md). Para `especificacion`: ruta de la carpeta con enlace a la rama actual, historias con prioridad, número de FR y SC, y las respuestas de Clarifications. Para `plan`: decisiones de `research.md` con motivo y alternativa descartada, y el resultado del Constitution Check;
  - publicar con `add_issue_comment`.
- [X] T011 [P] [US3] Crear `.specify/extensions.yml` con el bloque YAML exacto de la sección "Hooks de Spec Kit" de [contracts/comandos.md](contracts/comandos.md): `after_specify` y `after_plan`, ambos con `extension: crediagil-flujo`, `command: ticket.avance` y `optional: false`, y con `prompt` `Ejecutar /ticket-avance especificacion` y `Ejecutar /ticket-avance plan` respectivamente. Confirmar que el YAML es válido y que `.specify/.gitignore` no lo excluye.
- [X] T012 [US3] Validación manual sobre el issue #3: ejecutar `/ticket-avance especificacion` y `/ticket-avance plan`, y luego repetir `/ticket-avance plan`. Se esperan dos comentarios con marcador y ↺ en la repetición, sin un tercer comentario (Escenario 1, pasos 1 a 3; FR-011, FR-016). Cubre los hitos 2 y 3 que el arranque manual del #3 dejó pendientes.

**Checkpoint**: las cuatro historias están implementadas.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: decisiones registradas, entrega del propio issue #3 y primer ticket autónomo.

- [X] T013 [P] Crear `DECISIONES.md` en la raíz. Cada entrada lleva "fecha, issue, decisión, motivo, alternativa descartada y consecuencias" ([data-model.md](data-model.md)). Primera entrada, fechada 2026-10-15 e issue #3: R1 (comandos propios por MCP; descartados GitHub Actions + workflows del Project y un script propio) y R2 (hooks de Spec Kit; descartados la invocación manual y editar los skills de Spec Kit), con enlace a [research.md](research.md) (FR-013).
- [X] T014 Commit convencional en `001-sincronizacion-backlog-github` (por ejemplo `feat: flujo de tickets sincronizado con GitHub Project (#3)`) con `.mcp.json`, `.env.example`, `.claude/flujo-github.md`, `.claude/skills/ticket-*/SKILL.md`, `.specify/extensions.yml`, `DECISIONES.md` y `specs/001-sincronizacion-backlog-github/`. Antes, `git status` para confirmar que no entra nada más, como `.specify/feature.json`, que está ignorado.
- [X] T015 Publicar la rama (`git push -u origin 001-sincronizacion-backlog-github`, previa confirmación del desarrollador) y ejecutar `/ticket-abrir-pr 3`; luego repetirlo. Se espera el PR hacia `main` con `Closes #3`, Status `In review` y el comentario `pr`, y ↺ en la repetición (Escenario 1, pasos 4 y 5).
- [X] T016 Ejecutar `/ticket-cerrar` sobre el PR del #3, previa confirmación del desarrollador. Se espera squash merge, issue #3 cerrado, Status `Done` y comentario `cierre`. Luego leer el issue #3 completo y comprobar que permite reconstruir qué se especificó, qué se decidió y qué quedó pendiente (Escenario 1, pasos 6 y 7; SC-004).
- [X] T017 Primer ticket autónomo: `/ticket-tomar` y elegir el siguiente ticket (por ejemplo #4). Comprobar Status `In Progress`, comentario `inicio`, rama `<N>-<slug>` y que, al correr `/speckit.specify` y `/speckit.plan`, los hooks publican solos los comentarios `especificacion` y `plan` (Escenario 2; SC-001, SC-006).
- [ ] T018 Casos borde de [quickstart.md](quickstart.md), Escenario 3, con un issue de prueba desechable `[prueba] flujo de tickets` (crearlo y agregarlo al Project en `Todo` solo con la confirmación del desarrollador; al terminar, cerrarlo como *not planned*). Registrar en el issue #3, o en el ticket en curso, los casos que fallen.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1, T001)**: sin dependencias.
- **Foundational (Fase 2, T002)**: depende de T001. Bloquea todos los `SKILL.md`.
- **US4 (Fase 3)**: T003 y T004 solo dependen de T001; T005 depende de T003 y T004. Las validaciones de las demás historias necesitan el MCP conectado.
- **US1, US2 y US3 (Fases 4 a 6)**: dependen de T002. Se pueden escribir en paralelo: cada skill es un archivo distinto.
- **Polish (Fase 7)**: T013 en paralelo con cualquier fase; T014 depende de T003–T013; T015 → T016 → T017 → T018 en ese orden.

### User Story Dependencies

- **US4 (P1)**: prerrequisito de la validación de todas las demás.
- **US1 (P1)**: independiente.
- **US2 (P2)**: independiente para implementarla. Para validarla hace falta un ticket en **In Progress** con rama publicada, que en el arranque es el #3.
- **US3 (P3)**: independiente para implementarla. Para validarla hace falta una spec con "Issue de origen", que ya existe para el #3.

### Within Each User Story

- Contrato → `SKILL.md` → validación manual.
- No se toma un ticket real (T017) ni se fusiona (T016) sin haber terminado US1–US3.

### Parallel Opportunities

- T003 y T004, y también T013, en cualquier momento después de T001.
- T006, T008, T009, T010 y T011 después de T002: cinco archivos distintos sin dependencias entre sí.

---

## Parallel Example: tras la Fase 2

```text
Task: "T006 [US1] .claude/skills/ticket-tomar/SKILL.md"
Task: "T008 [US2] .claude/skills/ticket-abrir-pr/SKILL.md"
Task: "T009 [US2] .claude/skills/ticket-cerrar/SKILL.md"
Task: "T010 [US3] .claude/skills/ticket-avance/SKILL.md"
Task: "T011 [US3] .specify/extensions.yml"
```

---

## Implementation Strategy

### MVP First (US4 + US1)

1. T001 → T002 → T003–T005 (configuración segura).
2. T006–T007: `/ticket-tomar` operativo, que es el núcleo del valor (SC-001).
3. **Parar y validar**: listar y cancelar sin efectos.

### Incremental Delivery

1. MVP: US4 + US1.
2. US3: los hitos de especificación y plan se completan sobre el #3 (T010–T012).
3. US2: comandos de apertura y cierre (T008–T009).
4. Polish: decisiones, commit, PR y cierre del #3 con los propios comandos (T013–T016); luego el primer ticket autónomo (T017) y los casos borde (T018).

---

## Notes

- Las acciones hacia afuera (push, crear PR, fusionar, crear el issue de prueba) se confirman con el desarrollador antes de ejecutarse: T015, T016 y T018.
- Ningún archivo nuevo puede contener tokens. La búsqueda de T005 se vuelve a ejecutar justo antes del commit de T014.
- Commit después de cada fase o grupo lógico, con mensajes convencionales.
