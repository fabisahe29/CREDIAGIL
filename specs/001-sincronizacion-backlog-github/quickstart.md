# Quickstart: validar la sincronización del backlog

**Feature**: [spec.md](spec.md) · **Contratos**: [contracts/comandos.md](contracts/comandos.md)

Guía de validación de punta a punta. No hay pruebas automatizadas: esta funcionalidad no tiene código ejecutable propio (ver [research.md](research.md), R1). Cada escenario indica la historia o el requisito que comprueba.

## Prerrequisitos

1. Un token personal de GitHub con acceso de lectura y escritura a `fabisahe29/CREDIAGIL` (contenido, issues, pull requests) y a Projects.
2. Definirlo en el entorno de la sesión antes de abrir Claude Code. El nombre de la variable está en `.env.example`:

   ```powershell
   $env:GIT_HUB = "<tu token>"   # PowerShell; nunca en un archivo versionado
   ```

3. Abrir Claude Code en la raíz del repositorio y aprobar el servidor MCP `github` del proyecto cuando lo pida.
4. Comprobar que aparecen los comandos `/ticket-tomar`, `/ticket-avance`, `/ticket-abrir-pr` y `/ticket-cerrar`.

## Escenario 0 — Configuración segura (Historia 4 · FR-001 a FR-003 · SC-005)

| Paso | Resultado esperado |
|------|--------------------|
| `git ls-files .mcp.json .env.example .claude/skills .specify/extensions.yml` | todos versionados |
| Revisar `.mcp.json` | toolsets incluyen `projects`; la credencial es `${GIT_HUB}` |
| `git grep -nE "(ghp_\|github_pat_\|gho_)[A-Za-z0-9_]{20,}" $(git rev-list --all)` | sin resultados |

## Escenario 1 — Arranque sobre el propio issue #3 (Historias 2 y 3)

El issue #3 se arrancó a mano, así que el hito `inicio` ya existe. Ese comentario no tiene marcador, pero `/ticket-avance` no lo republica: no gestiona ese hito. Se validan los demás hitos sobre el mismo issue:

| Paso | Resultado esperado |
|------|--------------------|
| `/ticket-avance especificacion` | comentario con el marcador `especificacion` y la ruta `specs/001-sincronizacion-backlog-github/` (FR-011) |
| `/ticket-avance plan` | comentario con el marcador `plan` y las decisiones R1 y R2 |
| Repetir `/ticket-avance plan` | ↺ "ya publicado"; no aparece un segundo comentario (FR-016) |
| Publicar la rama `001-sincronizacion-backlog-github` y ejecutar `/ticket-abrir-pr 3` | PR hacia `main` con `Closes #3` · Status `In review` · comentario `pr` |
| Repetir `/ticket-abrir-pr 3` | ↺ en los tres efectos; no se crea un segundo PR |
| `/ticket-cerrar` | squash merge · issue #3 cerrado · Status `Done` · comentario `cierre` |
| Leer el issue #3 | se reconstruye qué se especificó, qué se decidió y qué quedó pendiente (SC-004) |

## Escenario 2 — Primer ticket autónomo (Historia 1 · SC-001 · SC-006)

| Paso | Resultado esperado |
|------|--------------------|
| `/ticket-tomar` | lista de tickets en `Todo` en el orden del Project; no cambia nada |
| Cancelar | sin cambios en el Project ni en los comentarios |
| `/ticket-tomar` y elegir `#4` | Status `In Progress` · comentario `inicio` · rama `4-<slug>` · contenido mostrado |
| `/speckit.specify` con ese contenido | spec con la línea "Issue de origen" → el hook publica el comentario `especificacion` sin invocarlo a mano |
| `/speckit.plan` | el hook publica el comentario `plan` |

## Escenario 3 — Casos borde (spec · Edge Cases)

Se usa un issue de prueba desechable (por ejemplo, `[prueba] flujo de tickets`, agregado al Project en `Todo`). Al terminar se cierra como *not planned*.

| Caso | Cómo provocarlo | Resultado esperado |
|------|-----------------|--------------------|
| Elección que ya no está en `Todo` | elegir el issue de prueba tras moverlo a mano a `In Progress` | se rechaza y se muestra la lista actualizada |
| Estado inesperado | moverlo a mano a `Done` y ejecutar `/ticket-abrir-pr` | se muestra estado actual → destino y se pide confirmación |
| Rama no publicada | `/ticket-abrir-pr` con la rama solo local | ⛔ con la instrucción de publicarla; sin PR |
| PR no fusionable | PR con conflicto o en borrador y `/ticket-cerrar` | ⛔ con el motivo; Status sigue en `In review` |
| Fusión manual | fusionar desde la web y luego `/ticket-cerrar` | ↺ en la fusión · Status `Done` · comentario `cierre` |
| Spec sin issue | `/speckit.specify` de algo sin "Issue de origen" | el hook informa "spec sin issue de origen" y no falla |
| Sin credencial | abrir Claude Code sin `GIT_HUB` y ejecutar `/ticket-tomar` | error explícito de autenticación; sin cambios parciales |
