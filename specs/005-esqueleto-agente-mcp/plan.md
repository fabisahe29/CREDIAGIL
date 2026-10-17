# Implementation Plan: Esqueleto del agente y del servidor MCP de originación

**Branch**: `7-esqueleto-del-agente-y-del-servidor-mcp` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#7](https://github.com/fabisahe29/CREDIAGIL/issues/7)

**Input**: Feature specification from `/specs/005-esqueleto-agente-mcp/spec.md`

## Summary

Un agente mínimo, construido con el Claude Agent SDK, conversa y consulta un core de originación simulado que corre como servidor MCP propio. Todas las herramientas comparten un contrato de errores. Ante una falla pasajera, el agente reintenta de forma acotada y, si persiste, avisa al solicitante y escala sin inventar resultados.

**Enfoque** (ver [research.md](research.md)):

- **Core** (`src/mcp/`): servidor MCP stdio con el SDK oficial, datos ficticios en memoria, una herramienta `consultar_solicitud` y una falla simulada configurada al arrancar (R1, R10).
- **Contrato de errores** (`src/compartido/`): cuatro categorías, `reintentable`, `codigo` y `mensaje`, validado con Zod y compartido por el core y el agente (R3).
- **Agente** (`src/agente/`): `query()` del Agent SDK, aislado (sin herramientas integradas ni configuración del repositorio) y con `claude-opus-5-5` (R5).
  - Usa las herramientas del core a través de un **adaptador MCP en su mismo proceso**, cuyos manejadores llaman al core por stdio y reintentan de forma determinista (R2).
  - Interpreta el `result` del SDK y compone en código los avisos de falla y de escalamiento (R4).
- **Observabilidad**: logs JSON por stderr con `correlationId` en cada turno y cada llamada (R6).
- **Pruebas**: `node --test`, sin red ni modelo; `query()` se inyecta (R7).

## Technical Context

**Language/Version**: TypeScript `strict`, con solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, igual que el #5 y el #6. En este equipo, Node v24.21.0.

**Primary Dependencies**: las primeras de producción del repositorio, en la versión que use el Agent SDK, verificada con `npm ls` (R8):
- `@anthropic-ai/claude-agent-sdk`, que trae como dependencia opcional el binario de Claude Code;
- `@modelcontextprotocol/sdk`;
- `zod`.

**Storage**: en memoria, con datos de ejemplo en código (`src/mcp/datos-ejemplo.ts`). Sin persistencia entre ejecuciones.

**Testing**: `node --test` sobre `.claude/**/*.test.ts` y `src/**/*.test.ts`.
- Pruebas unitarias del contrato, del core, de la falla y de la política de reintentos.
- Pruebas de integración del servidor stdio con un cliente MCP real y del adaptador contra el servidor real.
- Pruebas del agente con una consulta falsa inyectada.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: Node en Windows, macOS y Linux; Claude Code v2.1.295 o posterior para el registro del servidor.

**Project Type**: servicio de línea de comandos: un agente y un servidor MCP.

**Performance Goals**: el core responde en menos de 50 ms por llamada sin falla. Ante una falla persistente, la espera entre intentos no supera 1,8 s (SC-003a).

**Constraints**:
- Sin red ni modelo en las pruebas.
- stdout del servidor reservado a MCP.
- Sin credenciales en archivos versionados.
- Datos solo ficticios.
- El agente no puede leer el repositorio ni ejecutar comandos.

**Scale/Scope**: 1 servidor, 1 herramienta, 1 adaptador, unas 60 pruebas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | No se implementa ninguna regla de originación ni se decide nada de crédito. El `systemPrompt` le prohíbe al modelo decidir, y las respuestas de falla las compone el código. La revisión de cumplimiento del #6 lo verificará. | ✅ N/A, sin improvisación |
| II. Datos exclusivamente ficticios | Datos de ejemplo con prefijo `000`, correos `.example` y nombres inventados. Una prueba los pasa por el detector `datos-reales` del #5, y el guardián bloquea cualquier dato con forma real al escribirlos. | ✅ |
| III. Decisiones deterministas · esquemas | Validación con Zod de cada entrada y de cada respuesta del core. Reintento, escalamiento e interpretación del `result` en código con pruebas. El modelo solo entiende la conversación y elige la herramienta. | ✅ |
| IV. Acciones solo por herramientas MCP | El core es un servidor MCP propio con el SDK oficial. El agente solo tiene herramientas MCP (`tools: []`), y el adaptador del mismo proceso también es un servidor MCP, sin lógica de negocio. El core valida sus entradas del lado del servidor. | ✅ Adaptador justificado abajo |
| V. Escalar ante la duda | Una falla persistente escala con una señal estructurada. Una respuesta fuera de contrato no se adivina. Un `stop_reason` inesperado se informa como respuesta incompleta. | ✅ |
| VI. Observabilidad y resiliencia | `correlationId` en cada turno y cada llamada, en logs JSON. Tiempo límite por llamada al core (5 s) y por conversación (120 s). Reintentos acotados con backoff: al core, 500 ms y 1000 ms ±20%; al modelo, un reintento de la conversación tras 1 s ±20%. **Toda salida sin respuesta válida escala** con una señal que es el registro de auditoría (motivo, regla, resultado, `correlationId` y `ts`): «nunca se decide sin respuesta». Errores tipados con causa. La idempotencia no aplica: no hay herramientas con efectos. | ✅ |
| Secretos fuera del repositorio | `ANTHROPIC_API_KEY` solo por entorno; `.env.example` sin valores. | ✅ |
| TypeScript `strict`, Node LTS, sin `any` | Mismo `tsconfig`, ampliado a `src/`. | ✅ |
| Simplicidad (YAGNI) | Una herramienta, sin compilación, sin base de datos y sin librería de logs. El adaptador se justifica abajo. | ✅ |
| Pruebas obligatorias | Pruebas del contrato, del core, de la resiliencia y del agente (FR-019, FR-020). | ✅ |

**Gate**: aprobado. **Re-check post-diseño**: sin cambios, aprobado.

## Project Structure

### Documentation (this feature)

```text
specs/005-esqueleto-agente-mcp/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del Agent SDK y de MCP, decisiones R1–R10
├── data-model.md        # Error, respuesta, solicitud, falla, reintento, escalamiento
├── quickstart.md        # Escenarios 1–5
├── contracts/
│   ├── core-mcp.md      # servidor crediagil-core y consultar_solicitud
│   └── agente.md        # conversar(), opciones de query(), adaptador, interpretación
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── compartido/
│   ├── errores.ts              # NUEVO: contrato de error y respuesta (Zod), constructores
│   ├── errores.test.ts
│   ├── logs.ts                 # NUEVO: log JSON por stderr con correlationId
│   └── logs.test.ts
├── mcp/
│   ├── datos-ejemplo.ts        # NUEVO: solicitudes ficticias (en_estudio, anulada, reservada)
│   ├── datos-ejemplo.test.ts   # sin datos con forma real (detector del #5)
│   ├── falla.ts                # NUEVO: modos una-vez | siempre, desde opción o env
│   ├── falla.test.ts
│   ├── core-simulado.ts        # NUEVO: almacén en memoria + consultar
│   ├── core-simulado.test.ts
│   ├── servidor.ts             # NUEVO: McpServer + registerTool consultar_solicitud
│   ├── servidor.test.ts        # cliente MCP real contra el proceso stdio
│   └── principal.ts            # NUEVO: arranque stdio (lee CREDIAGIL_FALLA)
└── agente/
    ├── reintentos.ts           # NUEVO: política pura (3 intentos, 500/1000 ms ±20%)
    ├── reintentos.test.ts
    ├── cliente-core.ts         # NUEVO: cliente MCP stdio del core, tiempo límite, validación
    ├── cliente-core.test.ts
    ├── adaptador.ts            # NUEVO: createSdkMcpServer con manejadores que reintentan y escalan
    ├── adaptador.test.ts
    ├── agente.ts               # NUEVO: conversar(); query() inyectable; interpretación del result
    ├── agente.test.ts
    └── demo.ts                 # NUEVO: node src/agente/demo.ts "<mensaje>"
.mcp.json                       # MODIFICADO: + crediagil-core (stdio, sin credenciales)
.claude/settings.json           # MODIFICADO: enabledMcpjsonServers + crediagil-core
.env.example                    # MODIFICADO: ANTHROPIC_API_KEY=, CREDIAGIL_MODELO=, CREDIAGIL_FALLA=
package.json                    # MODIFICADO: dependencies + test sobre src/**
tsconfig.json                   # MODIFICADO: include src/**
DECISIONES.md                   # MODIFICADO: entrada del #7
```

**Structure Decision**: es el primer código bajo `src/`, el código de producción que vigila el control de spec primero del #5. La separación sigue el mapa de `CLAUDE.md`: `src/mcp/` es el servidor y `src/agente/` el agente. El contrato de errores va en `src/compartido/`, porque lo usan los dos sin que uno dependa del otro. `src/politica/` no se crea: no hay reglas de negocio en este ticket.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Adaptador MCP en el mismo proceso entre el agente y el core (R2) | El Agent SDK ejecuta el ciclo de herramientas sin devolver el control, y ningún hook reintenta. El reintento determinista y la señal de escalamiento solo caben en el manejador de la herramienta (Principios III y VI) | Dar al agente el servidor stdio directamente y dejar el reintento al modelo: no es determinista ni se puede probar con exactitud |
| Código `transitorio_agotado`: `transitorio` pero no reintentable | Cuando los reintentos se agotan, el modelo no debe volver a intentarlo por su cuenta | Devolver el `transitorio` original, reintentable: el modelo podría insistir y saltarse el límite de FR-011 |
| Primeras dependencias de producción | El Agent SDK y el SDK de MCP son el stack que fija la constitución | — |

## Riesgos y pendientes

- **Versión de MCP y de Zod** (R8): el Agent SDK podría traer la línea 2.x de MCP o Zod v4. Se comprueba al instalar, antes de escribir el servidor. Si difiere del plan, se ajustan los imports y se registra en `DECISIONES.md`.
- **API del SDK de MCP no verificada en detalle**: `registerTool` con `outputSchema`, `structuredContent` del lado del servidor y el cliente `StdioClientTransport`. Las pruebas del servidor (T de US1) son lo primero que se escribe y fallan rápido si la API difiere.
- **`createSdkMcpServer` y `tool()`**: su firma completa no apareció en la documentación leída. La prueba del adaptador la fija. Si `tool()` no admite devolver `structuredContent`, el contrato viaja como JSON en un bloque de texto y se registra la variante.
- **El agente con el modelo real** solo se valida a mano (Escenarios 3 y 4), con `ANTHROPIC_API_KEY` y costo en tokens.
- **Revisión de cumplimiento del #6**: este es el primer ticket con código en `src/`. Se espera que informe las 5 reglas como no aplicables, porque no hay lógica de originación; cualquier otro resultado se revisa antes del PR.
- **El servidor arranca en las sesiones de Claude Code** en cuanto se habilite en `settings.json`. Se declara al final, con las pruebas en verde.
