# Research: Sincronización autónoma del backlog con GitHub

**Feature**: [spec.md](spec.md) · **Issue**: [#3](https://github.com/fabisahe29/CREDIAGIL/issues/3) · **Fecha**: 2026-10-15

Cada decisión sigue el formato: Decisión · Motivo · Alternativas descartadas. Las marcadas con ★ se registran también en `DECISIONES.md` (FR-013).

---

## R1 ★ Mecanismo: comandos propios de Claude Code (skills de proyecto) que actúan solo por el MCP de GitHub

- **Decisión**: el flujo se implementa como cuatro skills de proyecto versionadas en `.claude/skills/`, invocables como comandos (`/ticket-tomar`, `/ticket-avance`, `/ticket-abrir-pr`, `/ticket-cerrar`). Cada una lee y escribe GitHub (issues, Project, pull requests) **únicamente** con las herramientas del servidor MCP oficial de GitHub. No hay código ejecutable propio.
- **Motivo**:
  - Cumple dos mínimos del enunciado a la vez: servidor MCP de GitHub y comandos propios compartidos por control de versiones.
  - Es el mismo formato que ya usa Spec Kit en este repositorio (`.claude/skills/speckit-*`), así que no agrega herramientas nuevas.
  - No necesita secretos en el repositorio ni en GitHub: usa la credencial local de cada desarrollador (FR-002).
  - Es coherente con el Principio IV de la constitución (actuar sobre sistemas externos solo a través de herramientas MCP).
- **Alternativas descartadas**:
  - **GitHub Actions + workflows integrados del Project**: automático aunque nadie invoque nada. Se descarta porque el `GITHUB_TOKEN` de Actions no tiene acceso a Projects de usuario y exigiría guardar un PAT como secreto del repositorio. Además, el workflow "Item closed → Done" vive fuera del control de versiones. En la clarificación se eligió que el cierre lo haga Claude Code.
  - **Script propio (Node/TypeScript con Octokit o `gh` CLI)**: es testeable con pruebas unitarias, pero duplica lo que ya da el MCP, agrega dependencias y una segunda vía de autenticación, y no cumple el mínimo "usar el servidor MCP de GitHub". Viola YAGNI (constitución, Restricciones técnicas).

## R2 ★ Comentarios de "especificación terminada" y "plan terminado": hooks de Spec Kit

- **Decisión**: registrar en `.specify/extensions.yml` dos hooks obligatorios (`optional: false`), `after_specify` y `after_plan`, que invocan `/ticket-avance`. Los skills `speckit-specify` y `speckit-plan` ya leen ese archivo y ejecutan los hooks obligatorios al terminar.
- **Motivo**: los hitos 2 y 3 (FR-012) se publican sin que nadie se acuerde de pedirlos y sin modificar los skills de Spec Kit, que se regeneran al actualizar Spec Kit. El archivo `.specify/extensions.yml` no está en `.specify/.gitignore`, así que se versiona.
- **Alternativas descartadas**:
  - **Invocar `/ticket-avance` a mano**: depende de la memoria del desarrollador, que es el problema que el issue quiere eliminar.
  - **Editar `speckit-specify` y `speckit-plan`**: los cambios se pierden al actualizar Spec Kit.
- **Nota**: los hooks también corren si se especifica algo sin issue de origen. En ese caso `/ticket-avance` no encuentra el enlace en la spec, lo informa y no hace nada (ver contrato).

## R3 Vínculo entre la spec y el issue: la línea "Issue de origen" de `spec.md`

- **Decisión**: la fuente de verdad del vínculo es la línea `**Issue de origen**: [owner/repo#N — título](url)` en la cabecera de `spec.md` (FR-010). `/ticket-avance`, `/ticket-abrir-pr` y `/ticket-cerrar` obtienen el número de issue de la spec activa (`.specify/feature.json` → `feature_directory`). Si falta, lo toman del nombre de la rama (`<N>-…`) o se lo piden al desarrollador.
- **Motivo**: no agrega estado nuevo y cumple a la vez la trazabilidad exigida.
- **Alternativas descartadas**: un archivo de estado aparte (`.ticket.json`), que duplica información y puede desincronizarse; o numerar las carpetas `specs/` con el número de issue, que rompe la numeración secuencial configurada en Spec Kit (`feature_numbering: sequential`).

## R4 Idempotencia (FR-016): marcadores ocultos en los comentarios y verificación previa del estado

- **Decisión**:
  - Cada comentario de avance lleva un marcador HTML invisible `<!-- crediagil:hito=<hito> -->`. Antes de publicar, el comando lee los comentarios del issue (`issue_read` · `get_comments`): si el marcador ya existe, no vuelve a publicar.
  - Antes de cambiar el Status, el comando lee el valor actual (`projects_get` · `get_project_item`) y solo escribe si es distinto.
  - Antes de crear un pull request, busca uno abierto con la misma rama `head`. Antes de fusionar, comprueba si ya está fusionado.
- **Motivo**: hace seguros los reintentos tras un fallo a mitad de camino (casos borde de la spec) sin guardar estado local. El marcador es invisible en GitHub, así que no ensucia el historial.
- **Alternativas descartadas**: comparar el texto del comentario, que es frágil si cambia la plantilla; o guardar un registro local de lo publicado, que no se comparte entre máquinas.

## R5 Estados del Project: por nombre, nunca por ID

- **Decisión**: los cambios de Status usan `projects_write` · `update_project_item` con `updated_field: {"name": "Status", "value": "<opción>"}` y el ítem se resuelve por `item_owner` + `item_repo` + `issue_number`. Los nombres canónicos son `Todo`, `In Progress`, `In review` y `Done`, y viven en un único archivo de referencia.
- **Motivo**: la herramienta acepta nombres de opción en el formato por nombre, y los IDs de opción (`47fc9ee4`…) son internos del Project y opacos para quien lee los comandos. Si alguien renombra una opción, el comando falla con un error explícito en lugar de escribir un valor equivocado.
- **Alternativas descartadas**: codificar los IDs numéricos del campo y de las opciones, que es frágil y no se puede leer.

## R6 Selección del ticket: lista en el orden del Project y elección explícita

- **Decisión**: `/ticket-tomar` llama a `projects_list` · `list_project_items` con `query: "is:issue status:Todo"` y `field_names: ["Status"]`, recorre todas las páginas y muestra número, título y etiquetas en el orden que devuelve el Project. Luego pregunta cuál tomar y vuelve a leer el ítem antes de modificarlo, para detectar si dejó de estar en **Todo** mientras se elegía.
- **Motivo**: es lo que se decidió en la clarificación (Q1). La segunda lectura cubre el caso borde "ya no está en Todo cuando confirma".
- **Alternativas descartadas**: ver la Clarificación Q1 de la spec (posición, prioridad, número de issue).

## R7 Rama de trabajo

- **Decisión**: `/ticket-tomar` crea una rama local `<N>-<slug-del-título>` desde `main` actualizado, salvo que el desarrollador ya esté en una rama de trabajo. Publicarla (`git push -u`) es un paso explícito del desarrollador. `/ticket-abrir-pr` verifica que la rama exista en el remoto y tenga commits respecto de `main`; si no, informa el motivo y no hace nada (caso borde de la spec).
- **Motivo**: el git local no forma parte del MCP de GitHub y publicar es una acción hacia afuera. La spec ya fija como precondición que la rama esté publicada.
- **Excepción (arranque)**: el issue #3 se trabaja en la rama `001-sincronizacion-backlog-github`, que lleva el nombre de la carpeta de Spec Kit y no el prefijo del issue.

## R8 Credencial y configuración del MCP

- **Decisión**: se versiona `.mcp.json` tal como existe hoy: servidor HTTP `https://api.githubcopilot.com/mcp/`, cabecera `Authorization: Bearer ${GIT_HUB}` y `X-MCP-Toolsets: context,repos,issues,pull_requests,projects`. Se agrega `.env.example` con `GIT_HUB=` vacío y se documenta que el token necesita permisos sobre repo, issues, pull requests y Projects.
- **Motivo**: Claude Code expande `${VAR}` en `.mcp.json` desde el entorno, así que el archivo no contiene secretos (FR-001, FR-002). La constitución pide versionar un `.env.example` sin valores.
- **Alternativas descartadas**: un servidor MCP local por Docker o binario, que agrega infraestructura sin beneficio; o configurar el MCP a nivel de usuario (`~/.claude.json`), que no se comparte con el equipo e incumple FR-001.

## R9 Verificaciones antes de fusionar (FR-008a)

- **Decisión**: `/ticket-cerrar` lee el pull request (`pull_request_read` · `get`, `get_status`, `get_check_runs` y `get_reviews`). Solo fusiona si cumple las cuatro condiciones: `mergeable_state` es `clean` (el MCP no expone el booleano `mergeable`), ningún check run falla ni está pendiente y el estado combinado no es `failure`, ni `pending` con statuses configurados (sin statuses, GitHub informa `pending` con `total_count: 0`, y eso cuenta como verde), no hay revisiones con `CHANGES_REQUESTED` sin resolver y el pull request no es borrador. El método de fusión es `squash`, con un título en formato de commit convencional.
- **Motivo**: es la regla de la constitución "ningún cambio se integra con pruebas en rojo". El squash deja un commit convencional por ticket en `main`.
- **Alternativas descartadas**: fusionar sin verificar, que viola la constitución; o `merge` con commit de merge, que deja en `main` los commits intermedios con mensajes no convencionales.
