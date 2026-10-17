# Research: Esqueleto del agente y del servidor MCP de originación

**Feature**: [spec.md](spec.md) · **Issue**: [#7](https://github.com/fabisahe29/CREDIAGIL/issues/7) · **Fecha**: 2026-10-17

**Fuentes**: documentación oficial del Claude Agent SDK, consultada el 2026-10-17 ([typescript](https://code.claude.com/docs/en/agent-sdk/typescript), [agent-loop](https://code.claude.com/docs/en/agent-sdk/agent-loop), [custom-tools](https://code.claude.com/docs/en/agent-sdk/custom-tools), [mcp](https://code.claude.com/docs/en/agent-sdk/mcp), [hooks](https://code.claude.com/docs/en/agent-sdk/hooks), [claude-code-features](https://code.claude.com/docs/en/agent-sdk/claude-code-features), [quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)); SDK de MCP para TypeScript ([sitio](https://ts.sdk.modelcontextprotocol.io/), [README](https://github.com/modelcontextprotocol/typescript-sdk)); y la referencia de modelos de la API de Claude. Entorno local: Node v24.21.0 y npm 11.19.0.

Cada decisión sigue el formato Decisión · Motivo · Alternativas descartadas. Las marcadas con ★ van a `DECISIONES.md`.

## Hechos de la plataforma que condicionan el diseño

| Hecho (documentación oficial) | Consecuencia |
|-------------------------------|--------------|
| `query({ prompt, options })` del Agent SDK **ejecuta él mismo el ciclo de herramientas**: llama a la herramienta y devuelve el resultado al modelo «sin ceder el control a tu código». | El reintento no se puede hacer entre turnos desde nuestro código: tiene que vivir en el manejador de la herramienta (R2). |
| El mensaje final `result` trae `subtype` ∈ `success`, `error_max_turns`, `error_max_budget_usd`, `error_during_execution`, `error_max_structured_output_retries`, y `stop_reason` del último turno (`end_turn`, `max_tokens`, `refusal`…). `maxTurns` cuenta solo los turnos con uso de herramientas. | El ciclo termina por la razón de parada del modelo (FR-002) y `maxTurns` es el límite de seguridad (FR-003). Nuestro código solo interpreta el `result` (R4). |
| No hay ninguna salida de hook que vuelva a ejecutar una herramienta. `PostToolUse` puede reemplazar lo que ve el modelo, pero no reintentar. | Descarta los hooks como lugar del reintento (R2). |
| `createSdkMcpServer({ name, version, tools })` con `tool(nombre, descripción, esquemaZod, manejador)` crea un servidor MCP **en el mismo proceso** del agente. El modelo ve las herramientas como `mcp__<clave>__<herramienta>`. Un manejador que devuelve `isError: true` controla el mensaje que lee el modelo; con `structuredContent`, el texto de `content` no se le reenvía. | Las herramientas del agente son un servidor MCP en el mismo proceso, cuyos manejadores llaman al core con reintentos (R2). El error viaja en `structuredContent` (R3). |
| `tools: []` quita todas las herramientas integradas (Read, Bash, Write…); `settingSources: []` no carga la configuración del repositorio; `strictMcpConfig: true` evita servidores MCP ajenos; `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` desactiva la memoria automática. | El agente solo tiene las herramientas del core: no puede leer el repositorio ni ejecutar comandos (R5). |
| El Agent SDK necesita el binario de Claude Code (incluido como dependencia opcional de npm) y `ANTHROPIC_API_KEY` en el entorno. **No documenta** ningún transporte falso ni ayuda para probar `query()`. | El código que llama a `query()` queda detrás de una interfaz inyectable, y las pruebas le pasan una secuencia de mensajes simulada (R7). |
| El SDK de MCP para TypeScript tiene dos líneas: `@modelcontextprotocol/sdk` 1.x (un paquete con servidor, cliente y transportes, sobre Zod) y los paquetes 2.x separados (`@modelcontextprotocol/server`, `/client`, con Zod v4). **No verificado**: qué línea usa el Agent SDK internamente. | Se usa la línea que ya trae el Agent SDK, para no tener dos versiones de MCP; se comprueba al instalar (R8). |
| En `.mcp.json` del proyecto, un servidor stdio es `{"type": "stdio", "command", "args", "env"}`, con expansión `${VAR:-por_defecto}`. Claude Code pide aprobación para los servidores del proyecto. | Registro del core para Claude Code sin credenciales (FR-018, R9). |
| Modelo recomendado por defecto: `claude-opus-5-5` (referencia de la API de Claude). | Valor por defecto del agente, configurable por variable de entorno (R5). |

---

## R1 ★ Dos procesos: el core como servidor MCP stdio y el agente aparte

- **Decisión**:
  - El **core de originación simulado** es un servidor MCP stdio propio (`src/mcp/`), construido con el SDK oficial de MCP. Expone las herramientas del core con contratos tipados.
  - El **agente** (`src/agente/`) es otro proceso. Usa el Agent SDK y habla con el core como **cliente MCP** sobre stdio.
  - El mismo servidor del core queda registrado en `.mcp.json` para usarlo desde Claude Code (FR-018).
- **Motivo**: es lo que pide la constitución (Principio IV: el agente actúa sobre el core solo mediante herramientas del servidor MCP propio, construido con el SDK oficial de MCP). Un proceso aparte hace real la separación entre el razonamiento y la ejecución, y permite probar el core sin el modelo.
- **Alternativas descartadas**:
  - **Core solo como servidor MCP en el mismo proceso del agente** (`createSdkMcpServer` con la lógica del core dentro): no sirve como servidor para Claude Code (FR-018) y mezcla el core con el agente.
  - **El core como funciones llamadas directamente por el agente**: no es MCP; contradice el Principio IV.

## R2 ★ Reintentos deterministas en un adaptador MCP en el mismo proceso del agente

- **Decisión**: el agente no recibe directamente el servidor stdio del core. Recibe un servidor MCP **en su mismo proceso** (`createSdkMcpServer`, clave `originacion`) con las mismas herramientas del core. Cada manejador:
  1. llama a la herramienta del core con el **cliente MCP** (`cliente-core.ts`), con el `correlationId` y un tiempo límite;
  2. si la respuesta es un error `transitorio` (o se agota el tiempo), reintenta con la política de FR-011: 2 reintentos, esperas de 500 ms y 1000 ms ±20%;
  3. devuelve al modelo el resultado, o el error del contrato;
  4. si los reintentos se agotan, registra la **señal de escalamiento** (FR-012) y devuelve un error `transitorio_agotado`, no reintentable, que el agente traduce en el aviso al solicitante (R4).

  La política de reintentos es una función pura con reloj y azar inyectables, probada aparte (`reintentos.ts`).
- **Motivo**: el Agent SDK ejecuta el ciclo de herramientas sin devolvernos el control, y ningún hook reintenta. El manejador de la herramienta es el único punto determinista: el reintento no depende de que el modelo «decida» volver a intentar (Principio III), y las pruebas cubren el número exacto de intentos y las esperas (SC-003a). El modelo sigue actuando solo mediante herramientas MCP; el adaptador también es un servidor MCP y no tiene reglas de negocio.
- **Alternativas descartadas**:
  - **Entregar al agente el servidor stdio y dejar el reintento al modelo**: no es determinista, no se puede probar con exactitud y el modelo podría reintentar errores no reintentables.
  - **Reintentar en un hook `PostToolUse`**: la documentación no permite volver a ejecutar una herramienta desde un hook.
  - **Reintentar dentro del servidor del core**: el core simula la falla; reintentar allí ocultaría justo lo que se quiere probar, y el issue pide que reintente el agente.

## R3 ★ Contrato de errores compartido, validado con Zod

- **Decisión**: un módulo compartido (`src/compartido/errores.ts`) define el contrato:
  - **Error**: `{ categoria: "transitorio" | "validacion" | "negocio" | "permisos", reintentable: boolean, codigo: string, mensaje: string, campo?: string }`. Solo `transitorio` es reintentable (FR-006).
  - **Respuesta de herramienta**: `{ ok: true, datos }` o `{ ok: false, error }`, en `structuredContent`; las de error van además con `isError: true`.
  - **Respuesta vacía**: `{ ok: true, datos: { ... vacío } }`, nunca un error (FR-007).

  Las entradas de cada herramienta se validan con un esquema Zod; una que no lo cumple devuelve `validacion` con el `campo` (FR-008). El cliente del agente valida también la forma de la respuesta del core: una respuesta fuera de contrato se trata como error no reintentable (FR-009).
- **Motivo**: un solo módulo con su esquema evita que cada herramienta futura invente su formato. Zod es lo que pide la constitución (Principio III) y lo que usan el Agent SDK y el SDK de MCP. A diferencia del #5, aquí no hay restricción de funcionar sin `node_modules`.
- **Alternativas descartadas**:
  - **Errores como texto libre o excepciones**: el agente tendría que interpretar mensajes (prohibido por FR-009).
  - **Solo `isError: true` sin categoría**: no distingue qué se puede reintentar.

## R4 ★ El agente interpreta el `result`; no cuenta vueltas

- **Decisión**: `agente.ts` ejecuta `query()` y recorre los mensajes. La decisión final sale del mensaje `result`:

  | `result` | Respuesta al solicitante |
  |----------|--------------------------|
  | cualquiera, si el adaptador emitió una **señal de escalamiento** | aviso fijo, escalado `falla_transitoria_persistente` |
  | `success` con `stop_reason` `end_turn` | el texto del modelo |
  | `success` con cualquier otro `stop_reason` | aviso fijo, escalado `respuesta_incompleta` (FR-004) |
  | `error_max_turns` | aviso fijo, escalado `limite_de_turnos` (FR-003) |
  | `error_during_execution`, otros errores, sin `result` o tiempo agotado | **un reintento** de la conversación tras 1 s ±20%; si vuelve a fallar, aviso fijo, escalado `falla_del_agente` (FR-013) |

  Toda salida que no es `respuesta` escala: el Principio VI dice «si se agotan, la solicitud se escala; nunca se decide sin respuesta», y el Principio V pide escalar ante cualquier caso no previsto. El límite de seguridad es `maxTurns: 8`, más un tiempo límite total por conversación con `abortController` (FR-013).

  **Reintentos de la llamada al modelo**: la documentación del Agent SDK no dice si el proceso de Claude Code reintenta por su cuenta los errores de la API. Para no depender de un comportamiento sin verificar, `conversar` reintenta explícitamente una vez la conversación completa. Uno solo, porque cada intento consume tokens y puede repetir llamadas al core, que en este ticket son de solo lectura.
- **Motivo**: el SDK sigue el ciclo por la razón de parada del modelo (FR-002); nuestro código no cuenta vueltas ni busca palabras. Los avisos los compone el código, no el modelo: así se garantiza que el solicitante reciba el aviso, que la solicitud se escale y que no aparezca un resultado inventado (SC-004, SC-005a).
- **Alternativas descartadas**:
  - **Ciclo propio con la API de Mensajes** (`stop_reason == "tool_use"`): el issue pide el Agent SDK.
  - **Confiar en que el modelo redacte el aviso de escalamiento**: no garantiza que lo haga ni que no invente datos.
  - **Responder «intenta más tarde» sin escalar**: contradice el Principio VI.
  - **Varios reintentos del modelo**: multiplica el costo en tokens sin mejorar el caso simulado.

## R5 Agente aislado: solo las herramientas del core

- **Decisión**: opciones de `query()`: `tools: []`, `mcpServers: { originacion: <servidor en el mismo proceso> }`, `allowedTools: ["mcp__originacion__*"]`, `settingSources: []` (que tampoco carga el `.mcp.json` del proyecto; `strictMcpConfig` no existe en el Agent SDK 0.3.302), `env` con `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, un `systemPrompt` propio en español y el modelo `claude-opus-5-5` (sobrescribible con `CREDIAGIL_MODELO`).
- **Motivo**: el agente de originación no debe leer el repositorio, ejecutar comandos ni cargar la configuración de desarrollo. Solo actúa sobre el core (Principio IV).
- **Alternativas descartadas**: las opciones por defecto, que cargan las herramientas integradas y la configuración del proyecto.

## R6 Logs JSON con `correlationId`, por stderr

- **Decisión**: `src/compartido/logs.ts` escribe una línea JSON por evento (`ts`, `nivel`, `evento`, `correlationId` y campos propios) en **stderr**. El agente genera un `correlationId` por conversación (`crypto.randomUUID()`) y lo envía al core en cada llamada como campo de la entrada. El core lo registra. La señal de escalamiento es un evento `escalamiento`.
- **Motivo**: en el servidor stdio, stdout es el canal MCP; escribir allí rompería el protocolo. El Principio VI pide el `correlationId` en cada turno y cada llamada.
- **Alternativas descartadas**: una librería de logs (YAGNI); el `correlationId` en los metadatos `_meta` de MCP (no verificado en el SDK).

## R7 ★ Pruebas sin red ni modelo

- **Decisión**:
  - **Core y servidor**: pruebas de las herramientas como funciones y del servidor completo con un cliente MCP real que lo arranca como proceso stdio. No hace falta el modelo.
  - **Reintentos**: la política con reloj y azar inyectables (esperas exactas, 3 intentos).
  - **Adaptador y cliente del core**: contra el servidor real arrancado con la falla en `una-vez` y `siempre`.
  - **Agente**: `agente.ts` recibe la función `query` por inyección. Las pruebas le pasan una función falsa que produce una secuencia de mensajes del SDK (`assistant`, `result` con cada `subtype` y `stop_reason`) y que, cuando corresponde, llama a los manejadores reales del adaptador.
  - **Punta a punta con el modelo real**: solo en el quickstart, con `ANTHROPIC_API_KEY`.

  Corredor: `node --test`, como el #5 y el #6, ampliado a `src/**/*.test.ts`.
- **Motivo**: la regla de tests del repositorio prohíbe depender de red, del modelo real o de servicios externos, y el SDK no ofrece un transporte falso.
- **Alternativas descartadas**: Vitest con `vi.mock` (otra herramienta para lo mismo); probar solo con el modelo real (cuesta tokens y no es reproducible).

## R8 Dependencias de ejecución y versión de MCP

- **Decisión**: dependencias de producción `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk` y `zod`, en la línea y la versión que use el Agent SDK. Al instalar, `npm ls @modelcontextprotocol/sdk zod` debe mostrar una sola versión de cada una. Si el Agent SDK usa la línea 2.x, se adoptan los paquetes 2.x y se registra en `DECISIONES.md`.
- **Motivo**: dos versiones de MCP o de Zod en el mismo proceso dan tipos incompatibles entre el adaptador y el cliente.
- **Alternativas descartadas**: elegir la línea a ciegas antes de instalar.

## R9 Registro en Claude Code y variables de entorno

- **Decisión**:
  - `.mcp.json` gana el servidor `crediagil-core`: `{"type": "stdio", "command": "node", "args": ["${CLAUDE_PROJECT_DIR:-.}/src/mcp/principal.ts"]}`, sin `env` ni credenciales. `.claude/settings.json` lo agrega a `enabledMcpjsonServers`.
  - `.env.example` gana `ANTHROPIC_API_KEY=`, `CREDIAGIL_MODELO=` y `CREDIAGIL_FALLA=` (valores: vacío, `una-vez` o `siempre`), sin valores.
- **Motivo**: cumple FR-018 y SC-007 sin pasos de configuración. Node ejecuta TypeScript sin compilar (como en el #5), así que no hace falta un `dist/`.
- **Alternativas descartadas**: compilar a `dist/` (paso extra sin necesidad).

## R10 Herramienta mínima: `consultar_solicitud`

- **Decisión**: el core expone una sola herramienta, `consultar_solicitud({ idSolicitud, correlationId })`:
  - `idSolicitud` con formato `SOL-` + 10 dígitos que empiezan por `000` (convención ficticia), validado con Zod;
  - encontrada → `{ ok: true, datos: { solicitud } }`; no encontrada → `{ ok: true, datos: { solicitud: null } }` (éxito vacío);
  - formato inválido → `validacion`; solicitud `anulada` → `negocio` (no se consulta una solicitud anulada); solicitud `reservada` (de otro canal) → `permisos`; falla simulada activa → `transitorio`.

  Los datos de ejemplo incluyen una solicitud por caso, todas ficticias.
- **Motivo**: con una sola herramienta se ejercitan datos, vacío y las 4 categorías (FR-016), sin adelantar reglas de originación.
- **Alternativas descartadas**: una herramienta por categoría (artificial); herramientas de negocio reales (fuera de alcance).
