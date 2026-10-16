# Implementation Plan: Revisión independiente y de cumplimiento antes del pull request

**Branch**: `6-revision-independiente-y-de-cumplimiento` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#6](https://github.com/fabisahe29/CREDIAGIL/issues/6)

**Input**: Feature specification from `/specs/004-revision-independiente-pr/spec.md`

## Summary

`/ticket-abrir-pr` deja de abrir el pull request a ciegas. Antes ejecuta dos revisiones independientes sobre el último commit publicado de la rama, registra su resultado en el issue y solo abre el PR si ninguna regla de negocio está incumplida y no hay hallazgos altos o críticos.

**Enfoque** (ver [research.md](research.md)):

- **Revisores**: dos subagentes propios, `revisor-codigo` y `revisor-cumplimiento`, con contexto aislado y solo `Read`, `Grep` y `Glob` (R1, R2).
- **Skills**: `revisar-codigo` y `revisar-cumplimiento`, con `context: fork`, `agent:`, `allowed-tools`, `disallowed-tools` y `argument-hint`, ocultas del menú. Solo las invoca el flujo (R3).
- **Determinismo alrededor del modelo** (`.claude/revision/`):
  - `preparar` fija el alcance: diff de `origin/<rama>` contra `main` (R4);
  - un hook `SubagentStop` captura y valida el informe JSON del revisor (R5);
  - `decidir` aplica la regla de gravedad y genera los comentarios (R6).
- **Registro**: comentarios con marcador `crediagil:revision=<tipo>;commit=<sha>` en el issue, reutilizables al reintentar y enlazados desde el cuerpo del PR (R7).
- **Puerta en dos capas**: el flujo, y un control `puerta-pr` en el guardián del #5 que niega crear un PR sin decisión favorable para el head remoto (R9). Otro control, `revisores`, impone la solo lectura (R2).

## Technical Context

**Language/Version**: TypeScript `strict` (sintaxis borrable), ejecutado por Node ≥ 22.18 sin compilar, como el #5.

**Primary Dependencies**: ninguna nueva. Claude Code (subagentes, skills con `context: fork`, hooks `PreToolUse` y `SubagentStop`) y el servidor MCP de GitHub ya configurado (#3).

**Storage**: archivos locales no versionados en `.git/crediagil/revisiones/<sha>/` (paquete, informes, decisión) y comentarios del issue en GitHub (registro durable).

**Testing**: `node --test` sobre `.claude/**/*.test.ts`: validación de informes, decisión, render y parseo del registro, extracción del JSON, y los controles nuevos del guardián. Validación manual en [quickstart.md](quickstart.md), incluida la composición skill → skill (Escenario 0) y la detección de las 5 violaciones (Escenario 2).

**Target Platform**: Claude Code v2.1.295 o posterior, en Windows (Git Bash o PowerShell), macOS y Linux.

**Project Type**: herramientas de desarrollo: subagentes, skills y hooks de Claude Code, más scripts de apoyo.

**Performance Goals**: los scripts deterministas responden en menos de 2 s. Cada revisión queda acotada por `maxTurns: 40`. El guardián mantiene su objetivo de < 300 ms (`puerta-pr` solo lee un archivo y ejecuta un `git rev-parse`).

**Constraints**:

- Los revisores no escriben ni publican (FR-003).
- La decisión se toma en código, nunca a criterio del modelo (Principio III).
- Falla cerrado: sin informe válido no hay PR (FR-009, Principio VI).
- Sin datos con forma real en informes ni registros (FR-012).
- Ningún paso depende de `npm install` en el camino de la puerta.

**Scale/Scope**: 2 subagentes, 2 skills, 1 hook nuevo (`SubagentStop`), 2 controles nuevos del guardián, 1 CLI (`revision.ts`) con 3 subcomandos, unas 50 pruebas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | No se tocan. El revisor de cumplimiento verifica que cada ticket las respete, en su orden, y una regla incumplida bloquea el PR. | ✅ Refuerza |
| II. Datos exclusivamente ficticios | Los registros no reproducen datos con forma real (validación V8, con el detector del #5). Los datos de la rama de prueba del Escenario 2 siguen la convención `000`. | ✅ |
| III. Decisiones deterministas · validación con esquema | El modelo solo clasifica (severidad, estado de regla); el alcance, la validación del informe y la decisión de abrir el PR son código con pruebas (R4 a R6). Un informe que no pasa el esquema cuenta como revisión fallida, no se adivina. La validación usa guardas de tipo propias, no Zod. | ✅ Desviación menor justificada abajo |
| IV. Acciones solo por herramientas · defensa en profundidad | Las acciones sobre GitHub siguen siendo solo por el MCP oficial. La puerta se aplica también del lado del guardián (`puerta-pr`), aunque el flujo la haya saltado, y la solo lectura de los revisores en tres capas (R2, R9). | ✅ |
| V. Escalar ante la duda | Ante un informe inválido, un revisor que no termina o una regla sin evidencia, el PR no se abre y se informa la causa. Una regla sin evidencia nunca cuenta como cumplida (FR-006). | ✅ |
| VI. Observabilidad y resiliencia | Errores con causa, nada silenciado. Registros auditables por `sha` e idempotentes (R7). **Tiempo límite y reintentos** (R8): la plataforma no ofrece tiempo límite de reloj para subagentes; lo sustituye `maxTurns`, que acota cada revisión y marca la salida como parcial al agotarse. Hay un único reintento, secuencial, después de que la revisión anterior terminó; sin llamadas concurrentes ni errores transitorios de red en ese paso, un backoff no aporta. Si el reintento falla, no se decide: el PR no se abre. No se agregan logs JSON con `correlationId`, que aplican a solicitudes de crédito y no a herramientas de desarrollo (mismo criterio que el #5). | ✅ Justificado |
| Secretos fuera del repositorio | Los revisores no tienen shell, y `secretos` sigue aplicando a sus `Read` y `Grep`. | ✅ |
| TypeScript `strict`, Node LTS, sin `any` | Mismo `tsconfig` del #5; `unknown` en las entradas. | ✅ |
| Simplicidad (YAGNI) | Sin dependencias nuevas ni servicios. El hook `SubagentStop` y el control `puerta-pr` agregan complejidad, justificada abajo. | ✅ Justificado |
| Pruebas obligatorias | Pruebas unitarias de validación, decisión y controles, más validación manual de punta a punta. | ✅ |

**Gate**: aprobado. **Re-check post-diseño**: sin cambios, aprobado. La única incertidumbre de plataforma (composición skill → skill) tiene su alternativa de respaldo (R3) y se valida primero (Escenario 0).

## Project Structure

### Documentation (this feature)

```text
specs/004-revision-independiente-pr/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos de la plataforma y decisiones R1–R11
├── data-model.md        # Paquete, hallazgo, estado de regla, decisión, registro
├── quickstart.md        # Escenarios 0–5
├── contracts/
│   ├── revisores.md        # subagentes, skills, SubagentStop, controles del guardián
│   ├── informe.md          # esquema JSON, validación V1–V8, decisión, comentario
│   └── ticket-abrir-pr.md  # pasos R1–R7 del flujo, sección del PR, Regla 7
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
.claude/
├── agents/
│   ├── revisor-codigo.md           # NUEVO: subagente, solo lectura (R1, R2)
│   └── revisor-cumplimiento.md     # NUEVO
├── skills/
│   ├── revisar-codigo/SKILL.md         # NUEVO: context: fork (R3)
│   ├── revisar-cumplimiento/SKILL.md   # NUEVO
│   └── ticket-abrir-pr/SKILL.md        # MODIFICADO: pasos R1–R7
├── revision/
│   ├── revision.ts                 # NUEVO: CLI preparar | decidir | reutilizar
│   ├── revision.test.ts
│   ├── capturar.ts                 # NUEVO: hook SubagentStop (R5)
│   ├── capturar.test.ts
│   └── lib/
│       ├── paquete.ts              # NUEVO: diff, archivos, rutas (R4)
│       ├── informe.ts              # NUEVO: tipos y validación V1–V8
│       ├── informe.test.ts
│       ├── decision.ts             # NUEVO: regla de gravedad (R6)
│       ├── decision.test.ts
│       ├── registro.ts             # NUEVO: render y parseo del comentario (R7)
│       └── registro.test.ts
├── hooks/
│   ├── guardian.ts                 # MODIFICADO: + controles revisores y puerta-pr
│   └── lib/
│       ├── revisores.ts            # NUEVO
│       ├── revisores.test.ts
│       ├── puerta-pr.ts            # NUEVO
│       ├── puerta-pr.test.ts
│       └── accion.ts               # MODIFICADO: conserva agent_type
├── settings.json                   # MODIFICADO: + SubagentStop; matcher del guardián ampliado
└── flujo-github.md                 # MODIFICADO: Regla 7
specs/001-sincronizacion-backlog-github/contracts/
├── comandos.md                     # MODIFICADO: flujo de /ticket-abrir-pr
└── comentarios.md                  # MODIFICADO: sección Revisiones y plantilla de registro
package.json                        # MODIFICADO: test sobre .claude/**/*.test.ts
DECISIONES.md                       # MODIFICADO: entrada del #6
```

**Structure Decision**: todo vive en `.claude/`, fuera de `src/`, porque es herramienta de desarrollo (R10), como los hooks del #5. El código determinista va en `.claude/revision/`, separado de `.claude/hooks/`, porque lo ejecutan el flujo y el hook `SubagentStop`, no solo el guardián. Los controles nuevos del guardián sí van en `.claude/hooks/lib/`, junto a los del #5.

## Complexity Tracking

| Desviación o complejidad | Por qué hace falta | Alternativa más simple descartada |
|--------------------------|--------------------|-----------------------------------|
| Validación del informe con guardas de tipo propias en lugar de Zod (Principio III, «p. ej. Zod») | El hook `SubagentStop` y la puerta deben funcionar sin `node_modules`, igual que el guardián del #5 | Zod obligaría a `npm install` antes de poder abrir un PR |
| Hook `SubagentStop` para capturar el informe | La decisión depende del informe; copiarlo a mano desde la sesión principal sería un paso no determinista y alterable (Principio III) | Que la sesión principal escriba el informe con Write |
| Control `puerta-pr` en el guardián, además del flujo | «No se abre un PR sin revisión» no puede depender solo de que el modelo siga la skill (Principio IV, defensa en profundidad) | Confiar solo en los pasos de `/ticket-abrir-pr` |

## Riesgos y pendientes

- **Composición skill → skill fork no documentada**: se valida en el Escenario 0 antes de cualquier otra prueba manual; la alternativa de R3 está lista y no cambia el resto del diseño.
- **Redirecciones de shell sobre `.git/crediagil/`**: `puerta-pr` niega Write, Edit y MultiEdit, pero una redirección en un comando de shell no se puede analizar con certeza. Se registra como riesgo residual en `DECISIONES.md`, como los comandos ofuscados del #5.
- **Calidad de la clasificación**: la severidad y el estado de cada regla los decide el modelo. La validación V1 a V8 impide informes incompletos, pero no un juicio equivocado. El Escenario 2 mide la detección (SC-003), y la revisión humana del PR sigue disponible.
- **Matcher ampliado del guardián**: agregar `Glob|Agent|WebFetch|WebSearch` hace correr el guardián en más acciones. Su costo (< 300 ms) se mantiene; se verifica con `npm test`.
- **Activación durante este ticket**: en cuanto `settings.json` declare `puerta-pr`, `/ticket-abrir-pr` exige revisiones también para este ticket, que es justamente la validación de punta a punta (Escenario 3, paso 4). Por eso el control se activa al final, después de que las pruebas estén en verde.
- **Fallo de `capturar.ts`**: si el hook falla, el revisor termina sin informe guardado; `decidir` lo trata como revisión fallida y la puerta no se abre (falla cerrado).
