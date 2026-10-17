# Implementation Plan: Identificación y verificación del solicitante

**Branch**: `9-identificacion-y-verificacion-del-solici` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#9](https://github.com/fabisahe29/CREDIAGIL/issues/9)

**Input**: Feature specification from `/specs/007-verificacion-identidad/spec.md`

## Summary

Antes de cualquier registro, el agente encuentra al solicitante en el core y confirma su identidad con la fecha de expedición del documento. Si hay homónimos, no adivina. A los 3 intentos fallidos, escala. El estado «identidad verificada» lo guarda el core, y un control del agente lo consulta sin pasar por el modelo (Regla 1).

**Enfoque** (ver [research.md](research.md)):

- **Core** (`src/mcp/`):
  - Guarda en memoria el estado de identidad por `correlationId` y los intentos fallidos por solicitante (R1).
  - Ofrece tres herramientas nuevas: `buscar_solicitante`, `verificar_identidad` y `consultar_identidad`, con el contrato de errores del #7 (R2 a R4).
- **Política** (`src/politica/`): se crea el módulo único de política, con `MAX_INTENTOS_VERIFICACION = 3` y `evaluarRegla1`, que devuelve una decisión explicable (R5).
- **Adaptador** (`src/agente/`):
  - Expone al modelo buscar y verificar.
  - El código, no el modelo, emite `solicitud_de_dato` ante homónimos y escala en dos casos: una segunda búsqueda ambigua y la verificación bloqueada (R6).
- **Control de identidad**: un hook `PreToolUse` que consulta el core y bloquea, con un evento `bloqueo_por_regla`, las herramientas que exigen identidad. La lista arranca vacía; #10 y #13 agregan las suyas (R7).
- **System prompt**: pide la identificación al inicio del trámite. Lo que debe cumplirse sí o sí lo garantiza el código (R8).
- **Datos y auditoría**: solicitantes ficticios con un caso único, dos homónimos y casos sin coincidencias. La auditoría nunca incluye la fecha de expedición (R9).

## Technical Context

**Language/Version**: TypeScript `strict`, solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, como el #7 y el #8. En este equipo, Node v24.21.0.

**Primary Dependencies**: ninguna nueva.
- Las existentes: `@anthropic-ai/claude-agent-sdk` 0.3.302 (`Options.hooks`, `PreToolUse`), `@modelcontextprotocol/sdk` 1.32.1 y `zod` 4.6.7.
- `String.prototype.normalize("NFD")` de Node para quitar tildes.

**Storage**: en memoria del proceso del core, que vive toda la ejecución del chat (R1). Sin persistencia.

**Testing**: `node --test` sobre `src/**/*.test.ts`, sin red ni modelo.
- Política: el borde exacto de intentos (2 y 3).
- Core: funciones puras con reloj inyectable.
- Servidor MCP: con un cliente MCP en memoria, como el #7.
- Adaptador: con un core falso.
- Control de identidad: el callback se llama directamente.
- `conversar`: con la `query()` falsa, para comprobar que el hook queda registrado.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: la misma del #8: terminal en Windows, macOS y Linux. El core también se usa desde Claude Code (`.mcp.json`).

**Project Type**: servidor MCP y agente existentes; se agregan herramientas, un control y un módulo de política.

**Performance Goals**: cada herramienta de identidad responde en menos de 50 ms en el core simulado. El control de identidad agrega una llamada al core solo a las herramientas de la lista.

**Constraints**:
- La fecha de expedición nunca sale del core: ni en respuestas, ni en logs, ni en la auditoría.
- El límite de intentos lo aplica el core.
- Los eventos y los escalamientos los decide el código.
- Ante la duda, el control bloquea: si no puede consultar al core tras los reintentos, no deja seguir y escala.
- Sin `any`.

**Scale/Scope**:
- Decenas de conversaciones por ejecución.
- Unos 3 módulos nuevos (`politica/politica.ts`, `politica/identidad.ts`, `agente/control-identidad.ts`) y unos 7 modificados.
- Unas 60 pruebas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | Implementa la **Regla 1** sin relajarla: el core solo marca la identidad como verificada tras una verificación exitosa, y el control bloquea sin ella. Respeta el orden 4 → 5 → 1: el prompt no pide la identificación ante una petición de persona o un caso no cubierto, y el control no se interpone en un escalamiento. Las reglas 2 y 3 no se tocan. | ✅ |
| II. Datos exclusivamente ficticios | Solicitantes con documentos `000…`, identificadores `CLI-000…`, correos `.example` y nombres inventados. Las pruebas que necesiten un dato con forma real lo generan en tiempo de ejecución. | ✅ |
| III. Decisiones deterministas · esquemas | Entradas validadas con Zod en el servidor. Normalización y comparación en código. `evaluarRegla1` devuelve una decisión estructurada: regla, valores, motivo y versión. La desambiguación y el escalamiento los decide el adaptador, no el modelo. | ✅ |
| IV. Acciones solo por herramientas MCP | Buscar, verificar y consultar son herramientas del core. El control consulta el core por el cliente MCP. El estado vive en el core, de modo que el #13 puede rechazar un registro del lado del servidor. | ✅ |
| V. Escalar ante la duda | Homónimos sin resolver → escala. 3 intentos fallidos → escala. Falla al consultar la identidad → bloquea. El agente no elige entre coincidencias ni inventa solicitantes. | ✅ |
| VI. Observabilidad y resiliencia | Auditoría de cada verificación, incluida la mal formada, con `correlationId`, regla, resultado y marca de tiempo, sin la fecha. Logs de búsqueda sin el valor buscado. Reintentos y tiempos límite del #7 también en el control de identidad, que escala si se agotan. `verificar_identidad` es idempotente con una clave `idIntento` por intento (R4). | ✅ |
| Entrada y moneda | No aplica: no se procesan documentos ni montos. | ✅ N/A |
| Secretos fuera del repositorio | Sin secretos nuevos. | ✅ |
| TypeScript `strict`, sin `any` | Mismo `tsconfig`. Los tipos del hook vienen del SDK. | ✅ |
| Simplicidad (YAGNI) | Estado en memoria. Una lista de herramientas en lugar de un sistema de permisos. La política arranca con lo mínimo que este ticket necesita. | ✅ |
| Pruebas obligatorias | Política en el borde exacto; herramientas MCP con el rechazo del lado del servidor (bloqueo y validación); sin red ni modelo. Los casos de prueba 1 y 5 de punta a punta quedan en el quickstart y en el #17. | ✅ |

**Gate**: aprobado.

**Re-check post-diseño**: aprobado, sin desviaciones. Los cambios al código del #7 y del #8 son aditivos:
- herramientas nuevas;
- dos motivos de escalamiento más;
- un campo más en el estado de la conversación;
- un hook registrado que, con la lista vacía, no bloquea nada.

## Project Structure

### Documentation (this feature)

```text
specs/007-verificacion-identidad/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del repo y del SDK, decisiones R1–R9
├── data-model.md        # Solicitante, coincidencia, estado de identidad, intentos, decisión
├── quickstart.md        # Escenarios 1–6
├── contracts/
│   ├── core-mcp.md      # buscar_solicitante, verificar_identidad, consultar_identidad
│   └── agente.md        # adaptador, eventos, motivos de escalamiento, control PreToolUse, prompt
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── politica/
│   ├── politica.ts               # NUEVO: VERSION_POLITICA, MAX_INTENTOS_VERIFICACION
│   ├── identidad.ts              # NUEVO: evaluarRegla1 → decisión estructurada
│   └── identidad.test.ts         # NUEVO: bordes de intentos y Regla 1
├── mcp/
│   ├── datos-ejemplo.ts          # MODIFICADO: SOLICITANTES_EJEMPLO y constantes de casos
│   ├── datos-ejemplo.test.ts     # MODIFICADO: casos de FR-017 y convención ficticia
│   ├── core-simulado.ts          # MODIFICADO: buscar, verificar, consultar; estado; reloj
│   ├── core-simulado.test.ts     # MODIFICADO
│   ├── servidor.ts               # MODIFICADO: tres herramientas nuevas y auditoría
│   └── servidor.test.ts          # MODIFICADO
└── agente/
    ├── cliente-core.ts           # MODIFICADO: buscarSolicitante, verificarIdentidad, consultarIdentidad
    ├── cliente-core.test.ts      # MODIFICADO
    ├── adaptador.ts              # MODIFICADO: herramientas, busquedasAmbiguas, motivos nuevos
    ├── adaptador.test.ts         # MODIFICADO
    ├── control-identidad.ts      # NUEVO: HERRAMIENTAS_CON_IDENTIDAD, crearControlIdentidad
    ├── control-identidad.test.ts # NUEVO
    ├── agente.ts                 # MODIFICADO: AVISOS/REGLAS, hooks.PreToolUse, system prompt
    └── agente.test.ts            # MODIFICADO
CLAUDE.md                         # MODIFICADO: src/politica/ deja de ser "previsto"
DECISIONES.md                     # MODIFICADO (ya en el plan): entrada del #9
```

**Structure Decision**:
- Las herramientas van en el core existente (`src/mcp/`), porque el estado de identidad debe vivir donde el #13 lo vuelva a comprobar.
- La regla y su límite van en `src/politica/`, el módulo único que fija la constitución; este ticket lo crea.
- El control va en `src/agente/`, separado del adaptador, porque es un hook del ciclo del SDK y no un manejador de herramienta.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Hook `PreToolUse` con una lista hoy vacía (R7) | El issue pide que los hooks del agente consulten una fuente confiable. Deja la Regla 1 lista para #10 y #13 con solo agregar un nombre | Comprobar la identidad en cada manejador: cada ticket repetiría la comprobación |
| Estado e intentos indexados por `correlationId` en el core (R1) | Que una conversación nueva empiece sin verificar y que el bloqueo no se herede | Un estado global del core: mezclaría conversaciones del mismo chat |

## Riesgos y pendientes

- **Hook sin herramientas reales**: hasta el #10 y el #13, el control solo se ejerce en pruebas. El primer ticket que agregue una herramienta a la lista confirma el contrato de punta a punta.
- **El modelo podría no pedir la identificación al inicio**: el momento lo guía el prompt (R8). Lo que importa para la Regla 1, que no se usen documentos ni se registre sin identidad, depende del control. El quickstart (Escenarios 3 y 6) lo verifica con el modelo real.
- **Enmascarado y homónimos**: con dos homónimos de igual nombre, los últimos 4 dígitos los distinguen. Si dos documentos compartieran los últimos 4 dígitos, el solicitante igual da el documento completo; la búsqueda por documento nunca es ambigua.
- **Revisión de cumplimiento del #6**: se espera la Regla 1 ✅ y las demás no aplicables. Hay que verificar que ningún umbral de las reglas 2 y 3 aparezca como literal.
