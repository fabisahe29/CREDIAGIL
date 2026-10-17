---

description: "Lista de tareas: esqueleto del agente y del servidor MCP de originación"
---

# Tasks: Esqueleto del agente y del servidor MCP de originación

**Input**: documentos de diseño en `specs/005-esqueleto-agente-mcp/`

**Issue de origen**: [fabisahe29/CREDIAGIL#7](https://github.com/fabisahe29/CREDIAGIL/issues/7)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/core-mcp.md](contracts/core-mcp.md), [contracts/agente.md](contracts/agente.md), [quickstart.md](quickstart.md)

**Tests**: la spec los **exige** (FR-019 y FR-020) y la constitución también. Cada módulo se escribe primero como prueba (en rojo) y después se implementa (en verde), con `node --test`. Ninguna prueba depende de red ni del modelo real (regla de tests): el modelo se simula inyectando `query()`.

**Organization**: por historia de usuario. La Fase 2 deja el contrato de errores, los logs y el core en memoria. US1 conecta el agente con el core de punta a punta; US2 completa el contrato a través de MCP; US3 agrega la falla y los reintentos; US4 y US5 cierran datos y configuración.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US5)

## Path Conventions

- Código bajo `src/`: `src/compartido/`, `src/mcp/` y `src/agente/`. Cada `*.test.ts` va junto a su archivo (regla de tests). Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).
- Reglas por zona: `.claude/rules/servidor-mcp.md` aplica a `src/mcp/**` y `.claude/rules/tests.md` a los `*.test.ts`.

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): documentos e identificadores con prefijo `000`, correos `.example` y nombres inventados. Montos en pesos enteros.
- **stdout del servidor reservado a MCP**: todo log va a stderr con `src/compartido/logs.ts`.
- Errores tipados con causa, nunca silenciados (Principio VI).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Instalar las dependencias de producción: `npm install @anthropic-ai/claude-agent-sdk @modelcontextprotocol/sdk zod`. Comprobar con `npm ls @modelcontextprotocol/sdk zod` que hay **una sola** versión de cada una, la que trae el Agent SDK (R8). Si el Agent SDK usa la línea 2.x de MCP (`@modelcontextprotocol/server` y `/client`) o Zod v4, instalar esa línea en su lugar y anotarlo para T040.
- [X] T002 [P] Ampliar `package.json`, con el script `test` = `node --test ".claude/**/*.test.ts" "src/**/*.test.ts"`, y `tsconfig.json`, con `include` + `"src/**/*.ts"`. Comprobar que `npm test` y `npm run typecheck` siguen en verde con las pruebas del #5 y el #6.
- [X] T003 [P] Agregar a `.env.example`, sin valores y con un comentario cada una (R9): `ANTHROPIC_API_KEY=`, `CREDIAGIL_MODELO=` (por defecto `claude-opus-5-5`) y `CREDIAGIL_FALLA=` (vacío, `una-vez` o `siempre`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: el contrato de errores, los logs y el core en memoria con sus datos de ejemplo. Bloquea a todas las historias.

- [X] T004 [P] Prueba `src/compartido/errores.test.ts` (en rojo), según [data-model.md](data-model.md), «Error del contrato»:
  - los constructores `errorValidacion(codigo, mensaje, campo)`, `errorNegocio`, `errorPermisos` y `errorTransitorio` producen `reintentable` «`true` **si y solo si** `categoria` es `transitorio`»;
  - `transitorioAgotado()` es la excepción documentada: `categoria: "transitorio"`, `reintentable: false`;
  - `validacion` sin `campo` lanza;
  - el esquema Zod `esquemaRespuesta` acepta `{ ok: true, datos }` y `{ ok: false, error }`, y rechaza una categoría desconocida, un `mensaje` vacío o un `reintentable: true` en una categoría que no es `transitorio`.
- [X] T005 [P] Implementar `src/compartido/errores.ts`: tipos `Categoria`, `ErrorCore` y `Respuesta<T>`, esquemas Zod `esquemaError` y `esquemaRespuesta`, los constructores de T004 y `aResultadoMcp(respuesta)`, que produce `{ content, structuredContent, isError }` (R3). T004 en verde.
- [X] T006 [P] Prueba `src/compartido/logs.test.ts` (en rojo): `registrar(evento, campos)` escribe en el flujo inyectado (stderr por defecto) **una** línea JSON con `ts`, `nivel`, `evento`, `correlationId` y los campos dados; nunca escribe en stdout.
- [X] T007 [P] Implementar `src/compartido/logs.ts` (R6). T006 en verde.
- [X] T008 [P] Crear `src/mcp/datos-ejemplo.ts` con al menos 3 solicitudes ficticias según [data-model.md](data-model.md), «Solicitud»:
  - `idSolicitud` «`SOL-` + 10 dígitos que empiezan por `000`»;
  - `estado` `en_estudio`, `anulada` y `reservada`, una de cada uno;
  - `monto` «entero positivo» en pesos y `plazoMeses` «1 a 120»;
  - solicitante con nombre inventado, `documento` con prefijo `000` y correo `.example`.

  Exportar también, como constante, el identificador de cada caso para las pruebas y el quickstart.
- [X] T009 Prueba `src/mcp/core-simulado.test.ts` (en rojo) para `crearCore({ datos, falla? })` y `consultarSolicitud(id)`, sin MCP:
  - la solicitud `en_estudio` → `{ ok: true, datos: { solicitud } }`;
  - un id con formato válido que no existe → `{ ok: true, datos: { solicitud: null } }`;
  - formato inválido → `validacion`, `campo: "idSolicitud"`;
  - `anulada` → `negocio` `solicitud_anulada`;
  - `reservada` → `permisos` `solicitud_reservada`.
- [X] T010 Implementar `src/mcp/core-simulado.ts`: almacén en memoria, inicializado con una copia de los datos para que una prueba no afecte a otra, y `consultarSolicitud` con la entrada validada con Zod `^SOL-000\d{7}$`. Por ahora sin falla (se agrega en T025). T009 en verde.

**Checkpoint**: `npm test` y `npm run typecheck` en verde; el core responde en memoria con el contrato.

---

## Phase 3: User Story 1 - El agente conversa usando el core simulado (Priority: P1) 🎯 MVP

**Goal**: servidor MCP stdio del core, cliente del core, adaptador en el mismo proceso y agente con `query()` que interpreta el `result`.

**Independent Test**: `npm test` cubre el servidor como proceso y el agente con una consulta falsa; con el modelo real, [quickstart.md](quickstart.md), Escenario 3.

- [X] T011 [US1] Prueba `src/mcp/servidor.test.ts` (en rojo): arranca `node src/mcp/principal.ts` como proceso con el cliente MCP oficial y su transporte stdio, y comprueba:
  - `listTools` incluye `consultar_solicitud` con su esquema de entrada;
  - `callTool` con la solicitud `en_estudio` devuelve `structuredContent` `{ ok: true, datos: { solicitud } }` sin `isError`;
  - el proceso no escribe en stdout nada que no sea MCP: los logs del `correlationId` aparecen en stderr.
- [X] T012 [US1] Implementar `src/mcp/servidor.ts`, con `crearServidor(core)`, `McpServer` y `registerTool("consultar_solicitud", …)` según [contracts/core-mcp.md](contracts/core-mcp.md); la entrada lleva `idSolicitud` y `correlationId` (UUID) y el resultado sale con `aResultadoMcp`. Implementar también `src/mcp/principal.ts`, el arranque stdio. Registrar cada llamada con `{ evento: "herramienta", herramienta, correlationId, resultado }`, sin datos del solicitante. T011 en verde.
- [X] T013 [US1] Prueba `src/agente/cliente-core.test.ts` (en rojo), contra el servidor real como proceso: `crearClienteCore()` y `consultarSolicitud(id, correlationId)` devuelven la `Respuesta` validada; `cerrar()` termina el proceso del servidor.
- [X] T014 [US1] Implementar `src/agente/cliente-core.ts`: cliente MCP stdio del servidor `crediagil-core`, con un tiempo límite de 5 s por llamada (FR-013) y la respuesta validada con `esquemaRespuesta`. T013 en verde.
- [X] T015 [US1] Prueba `src/agente/adaptador.test.ts` (en rojo): `crearAdaptador({ core, correlationId })` expone un servidor `createSdkMcpServer` con la herramienta `consultar_solicitud` **sin** `correlationId` en su entrada. Su manejador, invocado directamente, agrega el `correlationId`, llama al core y devuelve `structuredContent` con la `Respuesta`. Fija aquí la firma de `tool()`; si no admite `structuredContent`, la respuesta va como JSON en un bloque de texto (riesgo del plan).
- [X] T016 [US1] Implementar `src/agente/adaptador.ts`, por ahora sin reintentos (se agregan en T029). Registrar cada llamada con `{ evento: "llamada_core", herramienta, intento: 1, correlationId, resultado }`. T015 en verde.
- [X] T017 [US1] Prueba `src/agente/agente.test.ts` (en rojo) para `conversar(mensaje, { ejecutarConsulta, core })`, con una `ejecutarConsulta` falsa que recibe las opciones y produce mensajes del SDK:
  - **opciones**: las de [contracts/agente.md](contracts/agente.md), «Opciones de `query()`» (`tools: []`, `mcpServers.originacion`, `allowedTools: ["mcp__originacion__*"]`, `settingSources: []`, `maxTurns: 8`, `model` por defecto `claude-opus-5-5`, y `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` en `env`);
  - **interpretación**, cada fila de la tabla «Interpretación del resultado» salvo la del adaptador, que se cubre en T030:
    - `success` + `end_turn` → `respuesta` con el texto del modelo;
    - `success` + `max_tokens`, `refusal`, `null` o un valor desconocido → `escalada` con motivo `respuesta_incompleta`;
    - `error_max_turns` → `escalada`, motivo `limite_de_turnos`;
  - **reintento del modelo**: `error_during_execution` en el primer intento y `success` + `end_turn` en el segundo → `respuesta`, con exactamente 2 llamadas a `ejecutarConsulta` y una espera de 1 s ±20% (`dormir` inyectado). Si los dos intentos fallan (`error_during_execution`, un flujo que termina sin `result` o el tiempo agotado) → `escalada`, motivo `falla_del_agente`, `intentos: 2`;
  - **auditoría**: cada `escalada` registra un evento `escalamiento` con `motivo`, `regla`, `resultado: "escalada"`, `correlationId` y `ts`, y su `respuesta` es el aviso fijo, sin el texto del modelo (FR-012, SC-005a);
  - **sin herramienta**: un saludo, con un `result` de `num_turns: 1` y sin llamadas al adaptador, devuelve `respuesta` (US1, escenario 2);
  - **logs**: cada turno y el `result` se registran con el `correlationId`.
- [X] T018 [US1] Implementar `src/agente/agente.ts` (R4 y R5): `systemPrompt` en español con el rol de asistente de originación (responder solo con datos de las herramientas y no decidir nada de crédito), `abortController` a los 120 s, el reintento único de la conversación, la tabla de interpretación en su orden, la señal de escalamiento con sus campos de auditoría y los textos fijos de [contracts/agente.md](contracts/agente.md). T017 en verde.
- [X] T019 [US1] Crear `src/agente/demo.ts`: `node src/agente/demo.ts "<mensaje>"` llama a `conversar` con el `query()` real, imprime `respuesta` en stdout y `tipo`, `turnos` y `correlationId` en stderr. Sin `ANTHROPIC_API_KEY`, sale con 1 y un mensaje claro.

**Checkpoint**: MVP. El agente conversa con el core de punta a punta (con el modelo real, en el quickstart) y su interpretación está probada sin modelo.

---

## Phase 4: User Story 2 - Todas las herramientas hablan el mismo idioma de errores (Priority: P1)

**Goal**: las 4 categorías y el vacío viajan intactos por MCP, y una respuesta fuera de contrato no se adivina.

**Independent Test**: `npm test` cubre cada categoría a través del servidor stdio y el caso fuera de contrato.

- [X] T020 [US2] Ampliar `src/mcp/servidor.test.ts`: por MCP, el identificador inexistente → éxito vacío sin `isError`; `SOL-123` → `validacion`, `campo: "idSolicitud"`, `isError: true`; un campo extra en la entrada → `validacion`; `anulada` → `negocio`; `reservada` → `permisos`. En todos los casos, `reintentable: false` (SC-002, SC-003).
- [X] T021 [US2] Ajustar `src/mcp/servidor.ts` si T020 lo pide; en particular, la entrada estricta, que con campos extra devuelve `validacion` en lugar de un error genérico del SDK. T020 en verde.
- [X] T022 [P] [US2] Ampliar `src/agente/cliente-core.test.ts`: una respuesta del core que no cumple `esquemaRespuesta`, simulada con un cliente MCP falso inyectado, → `negocio` `respuesta_fuera_de_contrato`, `reintentable: false` (FR-009). Implementarlo en `src/agente/cliente-core.ts`.

**Checkpoint**: el contrato de errores es el mismo de punta a punta.

---

## Phase 5: User Story 3 - El agente resiste una falla transitoria sin inventar resultados (Priority: P2)

**Goal**: falla simulada configurable al arrancar, reintentos deterministas y escalamiento con aviso fijo.

**Independent Test**: `npm test` cubre la política exacta y el adaptador contra el servidor real en `una-vez` y `siempre`; con el modelo real, [quickstart.md](quickstart.md), Escenario 4.

- [X] T023 [P] [US3] Prueba `src/mcp/falla.test.ts` (en rojo) para `leerFalla(valor)` y `crearFalla(modo)`, según [data-model.md](data-model.md), «Falla simulada»:
  - vacío o ausente → sin falla;
  - `una-vez` → la primera llamada falla y las siguientes no;
  - `siempre` → todas fallan;
  - un valor desconocido lanza un error con un mensaje claro: no se adivina.
- [X] T024 [P] [US3] Implementar `src/mcp/falla.ts`. T023 en verde.
- [X] T025 [US3] Conectar la falla:
  - `crearCore({ falla })`: con la falla activa, `consultarSolicitud` devuelve `transitorio` `core_no_disponible`, `reintentable: true`;
  - `src/mcp/principal.ts` lee `CREDIAGIL_FALLA` y, si es inválida, sale con código 1 y el mensaje en stderr;
  - pruebas en `src/mcp/core-simulado.test.ts` y en `src/mcp/servidor.test.ts`, con el proceso arrancado con `CREDIAGIL_FALLA=siempre` y con un valor inválido.
- [X] T026 [P] [US3] Prueba `src/agente/reintentos.test.ts` (en rojo) para `conReintentos(operacion, { dormir, azar })`, con un reloj y un azar falsos:
  - un éxito al primer intento no espera;
  - un `transitorio` y después un éxito → 2 intentos, con una espera de 500 ms (±20% según el azar inyectado);
  - un `transitorio` persistente → exactamente 3 intentos, con esperas de 500 y 1000 ms ±20% y una suma ≤ 1,8 s (SC-003a), y devuelve `transitorioAgotado()`;
  - un error no reintentable → 1 intento (FR-011);
  - un tiempo límite agotado cuenta como `transitorio`.
- [X] T027 [P] [US3] Implementar `src/agente/reintentos.ts`: función pura, con la política de [data-model.md](data-model.md), «Política de reintento». T026 en verde.
- [X] T028 [US3] Ampliar `src/agente/adaptador.test.ts` contra el servidor real arrancado con `CREDIAGIL_FALLA`, con `dormir` inyectado para no esperar de verdad:
  - en `una-vez`: 2 `llamada_core` y el resultado `ok` con la solicitud;
  - en `siempre`: 3 `llamada_core`, un evento `escalamiento` con `motivo: "falla_transitoria_persistente"`, `herramienta`, `intentos: 3`, `correlationId` y `ultimoError`, y la respuesta `transitorio_agotado` no reintentable;
  - el estado de la conversación expone la señal.
- [X] T029 [US3] Implementar los reintentos y la señal de escalamiento en `src/agente/adaptador.ts`, con `conReintentos` y el registro por intento. T028 en verde.
- [X] T030 [US3] Ampliar `src/agente/agente.test.ts`: si el adaptador emitió una señal de escalamiento durante la conversación, `conversar` devuelve `tipo: "escalada"`, motivo `falla_transitoria_persistente`, el **aviso fijo** de [contracts/agente.md](contracts/agente.md) y la señal (con `regla`, `resultado`, `ts`, `herramienta`, `intentos: 3` y `ultimoError`), **cualquiera** que sea el `result` y aunque el modelo haya escrito un texto con datos. Ese texto no aparece en la respuesta (SC-004). Esta fila tiene prioridad sobre las demás y **no** dispara el reintento del modelo.
- [X] T031 [US3] Implementar la prioridad de la señal del adaptador en `src/agente/agente.ts`, y en `src/agente/adaptador.ts` los campos de auditoría de la señal (`regla`: `constitución, Principio VI · reintentos agotados`). T030 en verde.

**Checkpoint**: una falla persistente nunca termina en un dato inventado; termina en aviso más escalamiento.

---

## Phase 6: User Story 4 - El core simulado guarda solo datos ficticios (Priority: P2)

**Goal**: los datos de ejemplo cumplen la convención y el core no depende de nada externo.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 5.

- [X] T032 [US4] Prueba `src/mcp/datos-ejemplo.test.ts`:
  - pasa el contenido de `src/mcp/datos-ejemplo.ts` por el control `datos-reales` del #5 como si fuera un Write y espera 0 bloqueos;
  - cada `documento` empieza por `000`, cada correo termina en `.example`, cada `idSolicitud` cumple `^SOL-000\d{7}$` y cada `monto` es un entero positivo (SC-006);
  - `src/mcp/core-simulado.ts` no importa módulos de red (`node:net`, `node:http`, `node:https`, `fetch`).
- [X] T033 [US4] Ampliar `.claude/hooks/lib/sin-datos-reales.test.ts` para que recorra también `src/**/*.ts` y `specs/005-esqueleto-agente-mcp/**/*.md`.

---

## Phase 7: User Story 5 - El servidor está disponible en Claude Code y su contrato está probado (Priority: P3)

**Goal**: registro del core en la configuración MCP del proyecto, sin credenciales, y decisiones registradas.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 2; `npm test`.

- [X] T034 [US5] **Primero**, ejecutar `npm test` y `npm run typecheck` y continuar solo si están en verde: T037 lo confirma de nuevo al cierre. Después, agregar a `.mcp.json` el servidor `crediagil-core` exacto de [contracts/core-mcp.md](contracts/core-mcp.md), «Registro en Claude Code», y `"crediagil-core"` a `enabledMcpjsonServers` en `.claude/settings.json`. Conservar `github` y el resto de la configuración, y validar los dos JSON. **Se hace al final**, con las pruebas en verde: en cuanto se habilita, las sesiones de Claude Code arrancan el servidor (riesgos del plan).
- [X] T035 [P] [US5] Prueba `src/mcp/registro.test.ts`: lee `.mcp.json` y comprueba que `crediagil-core` es `stdio`, con `command: "node"`, `args` que apuntan a `src/mcp/principal.ts` y **sin** `env`, `headers` ni ningún valor con forma de credencial (FR-018, SC-007).
- [X] T036 [US5] Agregar al **principio** de `DECISIONES.md` la entrada `## 2026-10-17 · Esqueleto del agente y del servidor MCP de originación`, con enlace al issue #7 y a [research.md](research.md):
  - las decisiones ★ (R1 a R4 y R7), cada una con su motivo, la alternativa descartada y sus consecuencias;
  - lo anotado en T001 sobre las versiones de MCP y Zod;
  - riesgos aceptados: el modelo real solo se valida a mano, y la firma de `tool()` si varió.

  Sigue el formato de las entradas anteriores.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T037 Comprobar que `npm test`, `npm run typecheck` y `npm run format:check` están en verde, **sin** `ANTHROPIC_API_KEY` definida (SC-008).
- [X] T038 Validación manual en una **sesión nueva** de Claude Code: Escenario 2 de [quickstart.md](quickstart.md), el core desde Claude Code.
  - Resultado (2026-10-16): `SOL-0001000001` devuelve la solicitud ficticia en estado `en_estudio`; `SOL-0009999999` devuelve `solicitud: null`; `SOL-123` devuelve `validacion` / `formato_invalido` con `campo: idSolicitud` y `reintentable: false`.
- [X] T039 Validación manual con el modelo real, con `ANTHROPIC_API_KEY` en la terminal y confirmación del desarrollador, porque consume tokens: Escenarios 3 y 4 de [quickstart.md](quickstart.md). Anotar los resultados en esta tarea.
  - Resultado (2026-10-16):
    - Escenario 3, consulta de `SOL-0001000001`: responde con estado `en_estudio`, monto, plazo y fecha del core; `llamada_core` y `resultado` comparten `correlationId`; `turnos=2`.
    - Escenario 3, `Hola`: ninguna `llamada_core`, `turnos=1`.
    - Escenario 4, `una-vez`: intento 1 `core_no_disponible`, intento 2 `ok` y respuesta con el dato real.
    - Escenario 4, `siempre`: 3 `llamada_core` `core_no_disponible` (esperas de ~0,5 s y ~1,1 s), un `escalamiento` `falla_transitoria_persistente` y el aviso fijo con la referencia, sin datos de la solicitud.
    - Hallazgo corregido: el evento `turno` contaba mensajes `assistant` (el SDK emite varios por turno, con `stop_reason` null) y mostraba 3 turnos frente a `turnos: 2`. Ahora se registra uno por `message.id` distinto y sin `stop_reason`; prueba nueva en `src/agente/agente.test.ts` y contrato actualizado en [contracts/agente.md](contracts/agente.md).
- [X] T040 Commit convencional en `7-esqueleto-del-agente-y-del-servidor-mcp`, por ejemplo `feat: esqueleto del agente y del servidor MCP de originación (#7)`. Antes:
  - `git status`, para confirmar que no entra ningún `.env`, archivo temporal ni `node_modules/`, y que sí entra `package-lock.json`;
  - la búsqueda de tokens del quickstart del #3.
- [ ] T041 Con confirmación del desarrollador: `git push -u origin 7-esqueleto-del-agente-y-del-servidor-mcp` y `/ticket-abrir-pr 7`. Es la primera revisión de cumplimiento con código en `src/`: se espera que las 5 reglas salgan no aplicables. Cualquier regla incumplida o hallazgo alto bloquea el PR y se corrige antes.
- [ ] T042 Con confirmación del desarrollador: `/ticket-cerrar`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T003)** → **Foundational (T004–T010)** → historias. T001 va primero: fija las versiones de MCP y Zod que usan todos los imports.
- **US1 (T011–T019)** depende de la Fase 2.
- **US2 (T020–T022)** depende de T012 (servidor) y T014 (cliente del core).
- **US3 (T023–T031)**:
  - T023/T024 y T026/T027 solo dependen de la Fase 2;
  - T025 depende de T024 y T012;
  - T028/T029 dependen de T016, T025 y T027;
  - T030/T031 dependen de T018 y T029.
- **US4 (T032–T033)** depende de T008 y T010.
- **US5**: T034 va al final, con todas las pruebas en verde; T035 depende de T034; T036 puede escribirse en cualquier momento, aunque conviene al final.
- **Fase 8**: T037 → T038 y T039 → T040 → T041 → T042.

### User Story Dependencies

- **US1 (P1)**: es el MVP.
- **US2 (P1)**: requiere el servidor y el cliente de US1.
- **US3 (P2)**: requiere el adaptador y el agente de US1.
- **US4 (P2)**: independiente, salvo los datos de la Fase 2.
- **US5 (P3)**: requiere el servidor de US1.

### Within Each User Story

Prueba en rojo → implementación en verde. Los archivos compartidos (`servidor.ts`, `adaptador.ts` y `agente.ts`) se modifican en secuencia entre historias.

### Parallel Opportunities

- T002 y T003 junto con T001, una vez instaladas las dependencias.
- En la Fase 2: T004/T005, T006/T007 y T008, en archivos distintos.
- En US3: falla (T023/T024) y reintentos (T026/T027) en paralelo.
- T022 en paralelo con T020/T021.
- T032 y T033 en cualquier momento después de la Fase 2.

---

## Parallel Example: Fase 2 y US3

```text
Task: "T004 errores.test.ts → T005 errores.ts"
Task: "T006 logs.test.ts → T007 logs.ts"
Task: "T008 datos-ejemplo.ts"
# Después de US1:
Task: "T023 falla.test.ts → T024 falla.ts"
Task: "T026 reintentos.test.ts → T027 reintentos.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. T001–T003 (dependencias y configuración) → T004–T010 (contrato, logs y core en memoria).
2. T011–T019: servidor stdio, cliente, adaptador y agente.
3. **Parar y validar**: `npm test` en verde; con `ANTHROPIC_API_KEY`, `node src/agente/demo.ts` responde con los datos del core.

### Incremental Delivery

1. MVP: US1.
2. US2: contrato de punta a punta (T020–T022).
3. US3: falla, reintentos y escalamiento (T023–T031).
4. US4: datos ficticios verificados (T032–T033).
5. US5: registro en Claude Code y decisiones (T034–T036).
6. Validación, commit, PR y cierre (T037–T042).
