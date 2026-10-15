# Flujo de tickets con GitHub: constantes y reglas comunes

Fuente única de las constantes y reglas que aplican los comandos `/ticket-tomar`, `/ticket-avance`, `/ticket-abrir-pr` y `/ticket-cerrar`. Si algo de aquí cambia, se cambia solo aquí.

Diseño: [specs/001-sincronizacion-backlog-github/](../specs/001-sincronizacion-backlog-github/) · Origen: [issue #3](https://github.com/fabisahe29/CREDIAGIL/issues/3)

## Constantes

| Constante | Valor |
|-----------|-------|
| Owner | `fabisahe29` (usuario) |
| Repositorio | `CREDIAGIL` |
| Project | número `1`, del usuario `fabisahe29` |
| Campo de estado | `Status` |
| Opciones de Status | `Todo` · `In Progress` · `In review` · `Done` (exactas, con estas mayúsculas) |
| Rama base | `main` |
| Prefijo de marcador | `crediagil:hito=` |
| Hitos | `inicio` · `especificacion` · `plan` · `pr` · `cierre` |

## Regla 1: solo el servidor MCP de GitHub

- Toda lectura o escritura sobre issues, el Project y pull requests se hace con herramientas `mcp__github__*`.
- Nunca se usa `gh`, `curl` ni la API REST como alternativa, ni siquiera si el MCP falla.
- `git` local solo se usa para ramas y commits del desarrollador.
- Si una llamada al MCP falla, por ejemplo por credencial ausente (`GIT_HUB` sin definir), permisos o red, el comando se detiene. Informa qué falló, qué efectos alcanzó a aplicar y cuáles no, y sugiere revisar `.env.example`.

## Regla 2: resolver el issue del trabajo en curso

En este orden:

1. El argumento explícito `<N>`, si el comando lo recibió.
2. La línea `**Issue de origen**: [fabisahe29/CREDIAGIL#<N> — …](…)` de `spec.md` en la carpeta activa. La carpeta se lee en `.specify/feature.json` → `feature_directory`.
3. El prefijo numérico de la rama actual (`git branch --show-current`, patrón `^<N>-`), **solo si** el número no tiene ceros a la izquierda (`001-…` es una carpeta de Spec Kit, no un issue) y el desarrollador confirma "issue #<N>: <título>".
4. Si nada de lo anterior da un número, preguntar al desarrollador.

## Regla 3: leer y escribir el Status

- **Leer**: `mcp__github__projects_get` con `method: get_project_item`, `owner: fabisahe29`, `project_number: 1`, `item_id` del ítem y `field_names: ["Status"]`. El `item_id` se obtiene de `projects_list` · `list_project_items` con `query: "is:issue"`, buscando el ítem cuyo `content.number` es `<N>`.
- **Escribir**: `mcp__github__projects_write` con `method: update_project_item`, `owner: fabisahe29`, `project_number: 1`, `item_owner: fabisahe29`, `item_repo: CREDIAGIL`, `issue_number: <N>` y `updated_field: {"name": "Status", "value": "<opción>"}`. Se escribe por nombre de opción, nunca por ID.
- **Solo si cambia**: si el Status actual ya es el destino, no se escribe (↺).
- **Estado inesperado**: si el Status actual no es el origen esperado de la transición, se muestra "estado actual → destino" y se pide confirmación antes de escribir. Si el desarrollador no confirma, el comando termina sin más efectos.

| Transición | Origen esperado | Destino |
|-----------|-----------------|---------|
| `/ticket-tomar` | `Todo` | `In Progress` |
| `/ticket-abrir-pr` | `In Progress` | `In review` |
| `/ticket-cerrar` | `In review` | `Done` |

## Regla 4: comentarios de avance con marcador (idempotencia)

- La primera línea de cada comentario de avance es exactamente `<!-- crediagil:hito=<hito> -->`.
- Como máximo hay un comentario por `(issue, hito)`.
- Antes de publicar se leen **todos** los comentarios del issue (`mcp__github__issue_read` con `method: get_comments`, paginando con `perPage: 100`). Si alguno contiene el marcador del hito, no se publica (↺).
- Se publica con `mcp__github__add_issue_comment`.
- Las plantillas están en [contracts/comentarios.md](../specs/001-sincronizacion-backlog-github/contracts/comentarios.md). Se respetan su estructura y su marcador. El texto va en español.
- Los comentarios hablan solo del trabajo: nunca incluyen datos de solicitantes, documentos ni secretos (constitución, Principio II).

## Regla 5: reintentos

Cada comando se puede volver a ejecutar sin riesgo. Antes de cada efecto se comprueba si ya está aplicado (Status, marcador, PR existente, PR fusionado), y solo se aplican los que faltan.

## Regla 6: resumen final

Todo comando termina con una línea por efecto:

- `✅ <efecto>`: aplicado ahora.
- `↺ <efecto>`: ya estaba aplicado.
- `⛔ <efecto> — <motivo>`: no aplicado.

Los enlaces al issue, al PR y a la carpeta de la spec se incluyen cuando existen.
