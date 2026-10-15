# Implementation Plan: Sincronización autónoma del backlog con GitHub

**Branch**: `001-sincronizacion-backlog-github` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#3](https://github.com/fabisahe29/CREDIAGIL/issues/3)

**Input**: Feature specification from `/specs/001-sincronizacion-backlog-github/spec.md`

## Summary

Claude Code mantiene el backlog del GitHub Project al día durante todo el ciclo de un ticket. El desarrollador elige el siguiente ticket en **Todo**, y cada transición (**In Progress** → **In review** → **Done**) ocurre en un solo paso junto con su efecto en GitHub y su comentario de avance en el issue.

**Enfoque técnico** (ver [research.md](research.md)):

- Cuatro comandos propios de Claude Code (skills de proyecto en `.claude/skills/`): `/ticket-tomar`, `/ticket-avance`, `/ticket-abrir-pr` y `/ticket-cerrar`. Actúan sobre GitHub **solo** con el servidor MCP oficial, configurado en `.mcp.json`, versionado y sin credenciales (R1, R8).
- Los comentarios de "especificación terminada" y "plan terminado" se publican solos mediante hooks de Spec Kit (`after_specify` y `after_plan`) (R2).
- Los reintentos son seguros gracias a marcadores ocultos en los comentarios y a la verificación previa del estado (R4).

## Technical Context

**Language/Version**: Markdown (instrucciones de skills de Claude Code) + YAML (hooks de Spec Kit) + JSON (configuración del MCP). Sin código ejecutable propio.

**Primary Dependencies**: Claude Code (skills de proyecto y `.mcp.json`) · servidor MCP oficial de GitHub (remoto, `https://api.githubcopilot.com/mcp/`, toolsets `context,repos,issues,pull_requests,projects`) · Spec Kit 1.2.1.dev0 (hooks en `.specify/extensions.yml`)

**Storage**: N/A. El estado vive en GitHub (Status del Project, comentarios, PR) y en `spec.md` (vínculo con el issue).

**Testing**: validación manual de punta a punta según [quickstart.md](quickstart.md), escenarios 0 a 3. No aplica una suite automatizada porque no hay código propio (ver Constitution Check).

**Target Platform**: sesión de Claude Code (CLI o extensión de VS Code) en Windows, macOS o Linux, con `git` y la variable de entorno `GIT_HUB`.

**Project Type**: configuración de herramientas de desarrollo (comandos de agente + configuración MCP).

**Performance Goals**: tomar un ticket en menos de 2 minutos desde un clon limpio (SC-006).

**Constraints**:

- Ninguna credencial en el repositorio (FR-002).
- Las acciones sobre GitHub van solo por el MCP; `git` local solo para ramas.
- Los nombres de Status deben coincidir exactamente con los del Project.

**Scale/Scope**: un desarrollador (trabajo individual), un repositorio, un Project y alrededor de 10 a 20 tickets.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

La constitución regula sobre todo el agente de originación de crédito. Esta feature es de herramientas del flujo de trabajo, así que varios principios no aplican directamente. Se verifican los seis, como exige la sección Governance.

| Principio | Evaluación | Resultado |
|-----------|-----------|-----------|
| I. Reglas de negocio inmutables | No toca el módulo de política ni las reglas de originación. | ✅ N/A |
| II. Datos exclusivamente ficticios | Los comentarios, PR y decisiones solo describen el trabajo; las plantillas prohíben incluir datos de solicitantes ([contracts/comentarios.md](contracts/comentarios.md)). | ✅ |
| III. Decisiones y cálculos deterministas | Las reglas del flujo son explícitas y verificables: estado esperado por transición, criterios de fusionabilidad (R9) y marcadores de idempotencia. Nada queda "a criterio" del modelo. | ✅ |
| IV. Acciones solo por herramientas MCP | Se aplica por analogía a GitHub: toda acción sobre issues, Project y PR va por el MCP oficial. No hay fallback a `gh` ni a REST. | ✅ |
| V. Escalar ante la duda | Ante un estado inesperado, el comando pide confirmación; ante un PR no fusionable o una credencial ausente, se detiene e informa. Nunca improvisa. | ✅ |
| VI. Observabilidad y resiliencia | Los comentarios de avance son el registro de auditoría. Los efectos son idempotentes (R4) y los errores se reportan con causa (FR-015). | ✅ |
| Restricción: TypeScript strict | No hay código ejecutable. Agregar un script en TS solo para esto contradiría YAGNI (R1). | ✅ Justificado: no aplica |
| Restricción: secretos por entorno y `.env.example` | `${GIT_HUB}` en `.mcp.json` y `.env.example` versionado (R8). | ✅ |
| Flujo: backlog en Project, Spec Kit | Esta feature es justamente ese flujo. | ✅ |
| Flujo: pruebas obligatorias | Las pruebas obligatorias que lista la constitución son del dominio de crédito y ninguna aplica aquí. La validación es el quickstart. | ✅ N/A |
| Flujo: commits convencionales, sin integrar en rojo | Título convencional del PR y del squash; `/ticket-cerrar` bloquea la fusión con checks en rojo (FR-008a, R9). | ✅ |

**Gate**: aprobado, sin violaciones. **Re-check post-diseño** (tras data-model y contratos): sin cambios, aprobado.

## Project Structure

### Documentation (this feature)

```text
specs/001-sincronizacion-backlog-github/
├── spec.md              # Especificación (con Clarifications)
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones R1–R9
├── data-model.md        # Fase 1: entidades y máquina de estados
├── quickstart.md        # Fase 1: guía de validación de punta a punta
├── contracts/
│   ├── comandos.md      # Contrato de los 4 comandos y de los hooks
│   └── comentarios.md   # Plantillas de comentarios y del cuerpo del PR
├── checklists/
│   └── requirements.md  # Checklist de calidad de la spec
└── tasks.md             # Fase 2 (/speckit-tasks; no lo crea este comando)
```

### Source Code (repository root)

```text
.mcp.json                        # Servidor MCP oficial de GitHub (ya existe, sin versionar) → versionar
.env.example                     # NUEVO: GIT_HUB= (sin valor)
DECISIONES.md                    # NUEVO: registro de decisiones (R1, R2) (FR-013)
.claude/
├── flujo-github.md              # NUEVO: constantes y reglas comunes del flujo
└── skills/
    ├── ticket-tomar/SKILL.md    # NUEVO: /ticket-tomar
    ├── ticket-avance/SKILL.md   # NUEVO: /ticket-avance
    ├── ticket-abrir-pr/SKILL.md # NUEVO: /ticket-abrir-pr
    └── ticket-cerrar/SKILL.md   # NUEVO: /ticket-cerrar
.specify/
└── extensions.yml               # NUEVO: hooks after_specify / after_plan → /ticket-avance
```

**Structure Decision**: no hay `src/` ni `tests/` para esta feature. Los comandos van junto a los de Spec Kit en `.claude/skills/`, con el mismo formato, y comparten un archivo de constantes (`.claude/flujo-github.md`) para que el repositorio, el Project, los nombres de Status y los marcadores no se repitan en cuatro sitios.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
