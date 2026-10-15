# Implementation Plan: Guardarraíles del repositorio con hooks

**Branch**: `5-guardarrailes-del-repositorio-con-hooks` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#5](https://github.com/fabisahe29/CREDIAGIL/issues/5)

**Input**: Feature specification from `/specs/003-guardarrailes-hooks/spec.md`

## Summary

El entorno impide por sí solo cuatro cosas: escribir datos con forma real, tocar secretos, escribir código sin spec y dejar código sin formato. Ninguna depende de la memoria de nadie.

**Enfoque** (ver [research.md](research.md)):

- **Guardián** (`PreToolUse`): un único hook en TypeScript que ejecuta tres controles y devuelve un solo *deny* con todos los motivos (R1, R2):
  - **datos reales**: tarjeta por Luhn; cédula, NIT y cuenta con palabra clave; convención ficticia del prefijo `000` (R3);
  - **secretos**: herramientas de archivos, shell y búsquedas recursivas, con reglas `deny` como segunda capa (R4);
  - **spec primero**: la rama `<N>-…` debe tener una spec con `Issue de origen` #N para escribir bajo `src/` (R7).
- **Formateador** (`PostToolUse`): Prettier sobre los archivos de código editados (R10).
- **Falla cerrado**: `try/catch` → *deny*, más `onFailure: "block"` (R5).
- **Ejecución**: Node ejecuta TypeScript sin compilar y sin dependencias en el camino del bloqueo (R8). Las pruebas usan `node --test` con datos generados en tiempo de ejecución (R11).

## Technical Context

**Language/Version**: TypeScript `strict` (sintaxis borrable), ejecutado por Node ≥ 22.18. En este equipo, Node v24.21.0.

**Primary Dependencies**: ninguna en tiempo de ejecución de los controles. Dependencias de desarrollo: `prettier` (formateador), `typescript` (chequeo de tipos) y `@types/node`.

**Storage**: N/A. Configuración en `.claude/settings.json` y convención en un módulo más su documento.

**Testing**: `node --test` sobre `.claude/hooks/**/*.test.ts`, con pruebas unitarias por control, una de punta a punta del guardián como proceso y una de sincronización entre la convención y su documento. Validación manual en [quickstart.md](quickstart.md).

**Target Platform**: Claude Code v2.1.295 o superior (CLI y extensión de VS Code), en Windows (Git Bash o PowerShell), macOS y Linux.

**Project Type**: herramientas de desarrollo: hooks de Claude Code.

**Performance Goals**: el guardián responde en menos de 300 ms por acción (arranque de Node incluido), para no frenar el trabajo. Tiempo límite de 10 s.

**Constraints**:

- Falla cerrado (FR-015).
- Ningún dato con forma real literal, ni en el código ni en las pruebas (FR-018).
- Rutas Windows normalizadas.
- Sin dependencias en el camino del bloqueo (SC-006).

**Scale/Scope**: 2 hooks, 3 controles, 1 convención, unas 40 pruebas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | No se tocan. El ticket es de herramientas de desarrollo. | ✅ N/A |
| II. Datos exclusivamente ficticios | Es el objeto principal del ticket: el guardián bloquea datos con forma real en cualquier archivo, comando o comentario. La convención `000` hace reconocibles los datos ficticios, y las pruebas no contienen datos reales literales (R11). | ✅ Refuerza |
| III. Decisiones deterministas · validación con esquema | Los controles son código determinista, sin intervención del modelo. La entrada del hook se valida contra un esquema con guardas de tipo escritas a mano, no con Zod, para no tener dependencias en el camino del bloqueo (R8). Una entrada inválida se bloquea, no se adivina. | ✅ Desviación menor justificada abajo |
| IV. Acciones solo por MCP | N/A: el ticket no actúa sobre el core de originación. El guardián revisa además los textos de las herramientas MCP de GitHub. | ✅ N/A |
| V. Escalar ante la duda | El equivalente aquí es fallar cerrado: ante un error, la acción se bloquea con su causa (R5). | ✅ |
| VI. Observabilidad y resiliencia | Los errores se propagan con tipo y causa, y nada se silencia (R5). Tiempo límite explícito. No se agregan logs JSON con `correlationId`, porque aplican a solicitudes de crédito y no a herramientas de desarrollo. Los mensajes enmascaran los datos detectados. | ✅ |
| Secretos fuera del repositorio | Se refuerza con dos capas: guardián y `permissions.deny` (R4). | ✅ |
| TypeScript `strict`, Node LTS, sin `any` | `tsconfig` `strict` y Node 24 LTS. `unknown` en la entrada, nunca `any`. | ✅ |
| Simplicidad (YAGNI) | Un hook por evento, sin dependencias de ejecución, corredor de pruebas nativo. Se descartaron el sandbox, Vitest y `tsx` (R4, R8). | ✅ |
| Pruebas obligatorias | FR-017: casos que bloquean y que pasan, por control. | ✅ |

**Gate**: aprobado. **Re-check post-diseño**: sin cambios, aprobado.

## Project Structure

### Documentation (this feature)

```text
specs/003-guardarrailes-hooks/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos de la plataforma y decisiones R1–R11
├── data-model.md        # Acción, bloqueo, patrones, archivo protegido, ticket→spec
├── quickstart.md        # Escenarios 0–6
├── contracts/
│   ├── hooks.md                        # settings.json, entrada/salida, mensajes
│   └── convencion-datos-ficticios.md   # prefijo 000, palabras clave, casos
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
.claude/
├── settings.json                   # MODIFICADO: + permissions.deny + hooks
└── hooks/
    ├── guardian.ts                 # NUEVO: PreToolUse; lee stdin, despacha, responde
    ├── guardian.test.ts            # NUEVO: punta a punta como proceso
    ├── formatear.ts                # NUEVO: PostToolUse; Prettier
    ├── formatear.test.ts           # NUEVO
    └── lib/
        ├── accion.ts               # NUEVO: esquema de entrada y normalización (R6)
        ├── accion.test.ts
        ├── bloqueo.ts              # NUEVO: tipo Bloqueo, enmascarado y mensaje (FR-014)
        ├── bloqueo.test.ts
        ├── convencion-ficticia.ts  # NUEVO: fuente única de palabras clave y prefijo
        ├── convencion-ficticia.test.ts   # sincronía con docs/datos-ficticios.md
        ├── datos-reales.ts         # NUEVO: control FR-001 a FR-004
        ├── datos-reales.test.ts
        ├── secretos.ts             # NUEVO: control FR-005 a FR-007
        ├── secretos.test.ts
        ├── spec-primero.ts         # NUEVO: control FR-008 a FR-010
        └── spec-primero.test.ts
docs/
└── datos-ficticios.md              # NUEVO: convención para personas (FR-003)
package.json                        # NUEVO: type module, engines, scripts, devDependencies
tsconfig.json                       # NUEVO: strict, noEmit, erasableSyntaxOnly
.prettierrc.json                    # NUEVO
.prettierignore                     # NUEVO
.claude/rules/tests.md              # MODIFICADO: enlace a docs/datos-ficticios.md
DECISIONES.md                       # MODIFICADO: entrada del #5
```

**Structure Decision**: los hooks viven en `.claude/hooks/`, fuera de `src/`. No son código de producción del agente (aclaración Q1) y no los bloquea el control de spec primero. `package.json` y `tsconfig.json` se crean aquí con lo mínimo; el #7 los amplía para el agente.

## Complexity Tracking

| Desviación | Por qué hace falta | Alternativa más simple descartada |
|------------|--------------------|-----------------------------------|
| Validación de entrada con guardas de tipo propias en lugar de Zod (Principio III, "p. ej. Zod") | El guardián no debe tener dependencias: si `node_modules` falta, los bloqueos siguen funcionando (SC-006, R8) | Zod obligaría a `npm install` antes de que funcione ningún control, y un clon sin dependencias quedaría sin guardarraíles o, con `onFailure: block`, bloqueado por completo |
| `package.json` y `tsconfig.json` antes del #7 | Prettier, el chequeo de tipos y `npm test` los necesitan | Esperar al #7 deja los controles sin pruebas ejecutables, lo que contradice FR-017 |

## Riesgos y pendientes

- **Versión de Claude Code**: `onFailure: "block"` exige v2.1.295 o posterior. En versiones anteriores, el `try/catch` del guardián sigue fallando cerrado ante errores propios, pero no ante un tiempo agotado ni ante la falta de Node. Se verifica en el quickstart.
- **Negación `!` en `permissions.deny`**: está documentada, pero hay que validarla (Escenario 2). Si falla, se aplica la alternativa del contrato.
- **`disableAllHooks`** desde la configuración local apaga los hooks (R9). Las reglas `deny` siguen activas.
- **Activación durante este ticket**: en cuanto `settings.json` declare los hooks, las sesiones nuevas aplican los controles, incluso al implementar este ticket. Por eso conviene declararlos al final, después de que las pruebas estén en verde.
- **Esquemas de MultiEdit, Write y Edit sin verificar** en la documentación: la extracción defensiva (R6) los cubre, y la prueba de punta a punta usa los nombres de campo conocidos.
