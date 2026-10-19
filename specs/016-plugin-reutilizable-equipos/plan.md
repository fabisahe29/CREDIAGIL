# Implementation Plan: Plugin reutilizable para otros equipos

**Branch**: `18-plugin-reutilizable-para-otros-equipos` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/016-plugin-reutilizable-equipos/spec.md](spec.md)

## Summary

Empaquetar en un plugin los controles genéricos de este repositorio (guardián de secretos y datos con forma real, convención de datos ficticios, solo lectura de los revisores, un revisor de cumplimiento con reglas del equipo y una skill de uso) y publicarlo en un catálogo (marketplace) dentro de este mismo repositorio.

El repositorio sigue siendo la fuente (aclaración Q2): un generador copia los archivos genéricos a la carpeta del plugin y las pruebas fallan si una copia difiere de su fuente o si el plugin contiene una referencia propia de este repositorio.

Para que la copia sea idéntica y portable hay que dejar neutras las fuentes genéricas (mensajes, comentarios y el tipo `Control`), y partir el guardián en una base común más dos puntos de entrada: el del repositorio y el del plugin.

## Technical Context

**Language/Version**: TypeScript `strict` ejecutado directamente por Node.js ≥ 22.18 (sin compilar), igual que los hooks actuales. Node 24 en este entorno.

**Primary Dependencies**: ninguna nueva. Los controles usan solo `node:*`; el generador y la verificación también. El plugin no instala paquetes: no lleva `node_modules`.

**Storage**: archivos. El plugin vive en `plugins/crediagil-controles/`; el catálogo en `.claude-plugin/marketplace.json`; la configuración de cada equipo, en el repositorio de ese equipo.

**Testing**: `node --test` con las pruebas junto a cada archivo (`<archivo>.test.ts`), como el resto del repositorio. Se suman la prueba de sincronía, la de portabilidad y la de la entrada del plugin.

**Target Platform**: la CLI de Claude Code de otros equipos, en Windows, macOS y Linux. Node ≥ 22.18 es requisito del equipo destino (R10).

**Project Type**: herramientas de desarrollo (plugin de Claude Code más scripts). No toca `src/` ni el agente de crédito.

**Performance Goals**: el guardián del plugin responde en menos del timeout de 10 s que ya usa el repositorio (`settings.json`).

**Constraints**: sin credenciales, rutas absolutas ni referencias propias en el plugin (FR-005). El guardián falla cerrado (FR-011). El revisor solo lee (FR-009). Lo que no se pudo confirmar de Claude Code se verifica antes de construir, con plan B (R9).

**Scale/Scope**: 1 plugin, 1 catálogo, 1 subagente, 1 skill, 1 hook (4 controles), 1 generador y 1 verificación. Unos 12 archivos copiados.

## Constitution Check

*GATE: debe pasar antes de la investigación. Reevaluado tras el diseño: sin cambios.*

| Principio | Resultado | Razón |
|-----------|-----------|-------|
| I. Reglas de negocio inmutables | ✅ No aplica | No toca `src/politica/` ni el orden de evaluación. El revisor genérico no contiene las reglas 1 a 5, que siguen en `revisor-cumplimiento`, fuera del plugin (FR-020). |
| II. Datos exclusivamente ficticios | ✅ Cumple | Ejemplos y pruebas usan datos con prefijo `000` o generados en ejecución, sin literales con forma real. El plugin incluye el control que lo hace cumplir. |
| III. Decisiones deterministas | ✅ Cumple | El hook es código determinista sin modelo. El modelo solo interviene en el revisor, que informa y no decide. |
| IV. Acciones solo por MCP | ✅ No aplica | No hay acciones sobre el core. El revisor sigue sin herramientas con efectos (`Read`, `Grep`, `Glob`). |
| V. Escalar ante la duda | ✅ Cumple | Sin reglas del equipo, el revisor lo informa y no inventa reglas (FR-008). Si el hook no puede evaluar, bloquea (FR-011). |
| VI. Observabilidad y resiliencia | ✅ Cumple | Los errores del hook se propagan con tipo y causa. No hay efectos que requieran idempotencia: el hook solo bloquea. |

Restricciones técnicas: TypeScript `strict`, sin `any`, secretos solo por entorno. Quedan cumplidas.

**Desviaciones**: ninguna de los Principios I y II. Una complejidad justificada, en Complexity Tracking.

**Riesgo residual aceptado**: con dos copias (aclaración Q2) la deriva solo se detecta, no se evita. La prueba de sincronía (FR-021) es la única defensa; si falla en CI, no se integra.

## Project Structure

### Documentation (this feature)

```text
specs/016-plugin-reutilizable-equipos/
├── plan.md                         # Este archivo
├── research.md                     # Decisiones R1 a R14 y puntos por verificar
├── data-model.md                   # Paquete, pieza, catálogo, configuración, resultado
├── quickstart.md                   # Instalación, uso y verificación en otro repositorio
├── contracts/
│   ├── catalogo-y-manifiesto.md    # marketplace.json, plugin.json y hooks.json
│   ├── configuracion-equipo.md     # Reglas del equipo y configuración del hook
│   └── verificacion.md             # Resultado por pieza del repositorio de prueba
├── checklists/requirements.md
└── tasks.md                        # Lo genera /speckit-tasks
```

### Source Code (repository root)

```text
.claude-plugin/
└── marketplace.json                        # Catálogo: lista el plugin (nuevo, escrito a mano)

plugins/crediagil-controles/                # Destino generado + manifiestos escritos a mano
├── .claude-plugin/plugin.json              # Nombre, versión, descripción (a mano)
├── hooks/
│   ├── hooks.json                          # Registra el guardián (a mano)
│   ├── guardian-controles.ts               # COPIA de .claude/hooks/guardian-controles.ts
│   ├── guardian-base.ts                    # COPIA
│   └── lib/                                # COPIAS: accion, bloqueo, shell, secretos,
│                                           #   datos-reales, convencion-ficticia, revisores, config-equipo
├── agents/revisor-reglas.md                # COPIA de .claude/agents/revisor-reglas.md
├── skills/revisar-reglas/SKILL.md          # COPIA de .claude/skills/revisar-reglas/SKILL.md
└── README.md                               # Guía corta, genérica (a mano)

.claude/
├── hooks/
│   ├── guardian-base.ts                    # Nuevo: evaluar, respuestaDeny, leerStdin, ejecutar
│   ├── guardian-controles.ts               # Nuevo: entrada del plugin (4 controles genéricos)
│   ├── guardian.ts                         # Cambia: usa la base y añade spec-primero y puerta-pr
│   └── lib/                                # Se neutralizan los controles genéricos (R4)
├── agents/revisor-reglas.md                # Nuevo: revisor genérico con reglas del equipo
└── skills/revisar-reglas/SKILL.md          # Nuevo: guía de uso del revisor

scripts/
├── plugin/
│   ├── piezas.ts                           # Lista fuente → destino (única definición de qué viaja)
│   ├── generar.ts                          # Copia las fuentes al plugin
│   ├── generar.test.ts                     # Sincronía (FR-021) y portabilidad (FR-005, FR-022)
│   ├── portabilidad.ts                     # Lista de términos y patrones prohibidos
│   └── verificar-instalacion.ts            # Repositorio de prueba temporal y resultado por pieza
└── (sin otros cambios)

docs/
└── plugin-controles.md                     # Guía de instalación, uso, actualización y desinstalación

DECISIONES.md                               # Entrada nueva (FR-016)
package.json                                # Scripts plugin:generar, plugin:verificar
```

**Structure Decision**: el plugin y el catálogo viven en este repositorio (R1). Las piezas genéricas tienen su fuente en `.claude/`, donde este proyecto las usa; `plugins/crediagil-controles/` guarda las copias generadas y los tres manifiestos escritos a mano. Lo que viaja se define en un solo lugar, `scripts/plugin/piezas.ts`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Guardián partido en base y dos entradas (`guardian.ts`, `guardian-controles.ts`) | El guardián actual importa `spec-primero` y `puerta-pr`, que son de este flujo (FR-020). Una entrada genérica separada permite copiar solo lo genérico. | Copiar `guardian.ts` completo llevaría referencias a tickets y a `.git/crediagil/` (FR-005). Desactivar controles con una bandera dejaría código propio dentro del plugin. |
| Generador y prueba de sincronía | La aclaración Q2 deja este repositorio como fuente. Sin generador, las copias se editan a mano y derivan. | Mantener el plugin a mano da dos fuentes editables y ninguna defensa contra la deriva. |
