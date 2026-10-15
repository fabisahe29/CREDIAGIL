# Implementation Plan: Memoria y convenciones del equipo

**Branch**: `4-memoria-y-convenciones-del-equipo` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#4](https://github.com/fabisahe29/CREDIAGIL/issues/4)

**Input**: Feature specification from `/specs/002-memoria-convenciones-equipo/spec.md`

## Summary

Quien clone el repositorio recibe al abrir Claude Code las convenciones del equipo y las reglas no negociables. Cada zona del código carga sus propias reglas solo cuando se trabaja en ella, y lo personal queda fuera del control de versiones.

**Enfoque** (ver [research.md](research.md)):

- `CLAUDE.md` en la raíz, de menos de 60 líneas, con las 6 convenciones del equipo y un `@import` de la constitución, que es el uso justificado de importación (R1, R2).
- Cuatro reglas en `.claude/rules/` con `paths`: tests (`**/*.test.ts`), política (`src/politica/**`), servidor MCP (`src/mcp/**`) y specs (`specs/**`) (R3 a R5).
- Lo personal va en `CLAUDE.local.md` y `.claude/settings.local.json`, ignorados en `.gitignore`. Lo compartido va en `.claude/settings.json` (R7, R8).

## Technical Context

**Language/Version**: Markdown (memoria y reglas), YAML (frontmatter `paths`) y JSON (configuración). Sin código ejecutable.

**Primary Dependencies**: mecanismos nativos de Claude Code: `CLAUDE.md`, `@import`, `.claude/rules/` con `paths`, `CLAUDE.local.md` y `settings.json` / `settings.local.json`. Los hechos se verificaron en la documentación oficial (research, tabla inicial).

**Storage**: N/A. Archivos en el repositorio.

**Testing**: validación manual con `/memory` y `/context` según [quickstart.md](quickstart.md), escenarios 1 a 4, usando archivos de ejemplo temporales para las reglas por ruta.

**Target Platform**: Claude Code (CLI y extensión de VS Code) en cualquier sistema operativo.

**Project Type**: configuración de herramientas de desarrollo.

**Performance Goals**: `CLAUDE.md` de menos de 60 líneas; la recomendación oficial es menos de 200. Las reglas no se cargan al iniciar.

**Constraints**:

- No duplicar la constitución.
- Que ningún archivo personal se versione.
- Que el YAML de las reglas sea válido, porque si falla la regla se vuelve global (R6).

**Scale/Scope**: 1 memoria de proyecto, 4 reglas, 1 configuración compartida y 2 ubicaciones personales.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | No se cambian. `politica.md` las aplica al código y enlaza la constitución sin reinterpretarlas (FR-007a). | ✅ |
| II. Datos exclusivamente ficticios | `tests.md` lo exige en tests y fixtures; los archivos de ejemplo del quickstart son temporales y ficticios. | ✅ |
| III. Decisiones deterministas | `politica.md` exige aritmética exacta y orden de evaluación, que refuerzan el principio. | ✅ |
| IV. Acciones solo por MCP | `servidor-mcp.md` exige revalidación del lado del servidor y contratos tipados. | ✅ |
| V. Escalar ante la duda | Sin impacto directo; la constitución importada lo mantiene siempre en contexto. | ✅ |
| VI. Observabilidad | Sin impacto directo. | ✅ N/A |
| Secretos fuera del repositorio | `settings.local.json` y `CLAUDE.local.md` en `.gitignore`. | ✅ |
| Simplicidad (YAGNI) | Solo mecanismos nativos, sin scripts ni herramientas nuevas. | ✅ |
| Governance: la constitución prevalece | Se importa, no se copia ni se resume, así que no puede desincronizarse. | ✅ |

**Gate**: aprobado, sin violaciones. **Re-check post-diseño**: sin cambios, aprobado.

## Project Structure

### Documentation (this feature)

```text
specs/002-memoria-convenciones-equipo/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # R1–R9 y hechos verificados de la plataforma
├── data-model.md        # Archivos, carga y precedencia
├── quickstart.md        # Escenarios de validación 1–4
├── contracts/
│   └── archivos-memoria.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
CLAUDE.md                      # NUEVO: convenciones del equipo + @import de la constitución
.gitignore                     # MODIFICADO: + CLAUDE.local.md, .claude/settings.local.json
DECISIONES.md                  # MODIFICADO: entrada del #4
.claude/
├── settings.json              # NUEVO: enabledMcpjsonServers ["github"]
└── rules/
    ├── tests.md               # NUEVO
    ├── politica.md            # NUEVO
    ├── servidor-mcp.md        # NUEVO
    └── specs.md               # NUEVO
```

**Structure Decision**: solo archivos de configuración de Claude Code en la raíz y en `.claude/`. `src/politica/` y `src/mcp/` **no** se crean en este ticket: las reglas los referencian por patrón y los crea el #7 (R5).

## Complexity Tracking

Sin violaciones que justificar.

## Riesgos y pendientes

- **Qué cuenta como test**: resuelto en la aclaración Q3. Solo `*.test.ts` (R4). Los fixtures quedan protegidos por la constitución importada, no por la regla de tests.
- **Rutas de la política y del MCP fijadas antes de existir** (R5): el #7 debe respetarlas o ajustar los `paths`.
- **`@import` de un archivo inexistente**: la documentación no dice qué pasa. No aplica aquí, porque la constitución existe y está versionada.
