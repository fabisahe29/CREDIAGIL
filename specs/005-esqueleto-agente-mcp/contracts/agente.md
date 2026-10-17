# Contrato: agente de originación

**Requisitos**: FR-001 a FR-004, FR-009, FR-011 a FR-013, FR-017, FR-019, FR-020 · **Decisiones**: [research.md](../research.md), R2, R4, R5, R6 y R7

## Interfaz

```text
conversar(mensaje: string, opciones?: {
  correlationId?: string,      // por defecto, uno nuevo
  ejecutarConsulta?: QueryFn,  // por defecto, query() del Agent SDK; las pruebas inyectan una falsa
  core?: ClienteCore,          // por defecto, cliente stdio del servidor crediagil-core
  dormir?: (ms) => Promise,    // para las pruebas de reintento
  azar?: () => number,
}) → Promise<ResultadoConversacion>
```

`ResultadoConversacion` según [data-model.md](../data-model.md), «Conversación y resultado del agente».

Demo: `node src/agente/demo.ts "<mensaje>"` imprime la respuesta en stdout y los logs en stderr.

## Opciones de `query()` (R5)

| Opción | Valor |
|--------|-------|
| `model` | `CREDIAGIL_MODELO` o `claude-opus-5-5` |
| `systemPrompt` | Propio, en español: rol de asistente de originación; responder solo con datos devueltos por las herramientas; no decidir nada de crédito |
| `tools` | `[]` (sin herramientas integradas) |
| `mcpServers` | `{ originacion: <adaptador en el mismo proceso> }` |
| `allowedTools` | `["mcp__originacion__*"]` |
| `settingSources` | `[]` |
| `maxTurns` | `8` (límite de seguridad, FR-003) |
| `abortController` | Se aborta a los 120 s de conversación (FR-013) |
| `env` | `process.env` + `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` |

## Adaptador en el mismo proceso (R2)

`createSdkMcpServer({ name: "originacion", tools: [...] })` con una herramienta por herramienta del core, mismo nombre y misma entrada **sin** `correlationId`: el adaptador lo agrega.

Manejador de cada herramienta:

1. llama al core con el `ClienteCore`, el `correlationId` y un tiempo límite de 5 s;
2. valida la respuesta contra el contrato; si no cumple → `respuesta_fuera_de_contrato`, no reintentable;
3. si es `reintentable`, reintenta según la política (3 intentos, 500 ms y 1000 ms ±20%);
4. si se agotan los intentos → emite la señal de escalamiento, la guarda en el estado de la conversación y devuelve `transitorio_agotado`;
5. devuelve al modelo `structuredContent` con la `Respuesta`, y `isError: true` si es error.

Cada intento registra `{ "evento": "llamada_core", "herramienta", "intento", "correlationId", "resultado" }`.

## Interpretación del resultado (R4)

Se evalúa en este orden; gana la primera fila que aplica. Toda conversación que no termina en `respuesta` termina en `escalada`, con aviso y señal (FR-012, SC-005a).

| Condición | `tipo` | Motivo de la señal | `respuesta` |
|-----------|--------|--------------------|-------------|
| El adaptador emitió una señal (core caído tras reintentos) | `escalada` | `falla_transitoria_persistente` | «No pude consultar el sistema de originación en este momento. Tu caso pasa a un analista, que te contactará. Referencia: `<correlationId corto>`.» |
| `success` y `stop_reason` `end_turn` | `respuesta` | — | Texto del modelo |
| `success` con **cualquier otro** `stop_reason` (`max_tokens`, `refusal`, `null` o un valor desconocido) | `escalada` | `respuesta_incompleta` | «No pude completar tu respuesta. Tu caso pasa a un analista. Referencia: `<…>`.» |
| `error_max_turns` | `escalada` | `limite_de_turnos` | «No pude completar tu consulta. Tu caso pasa a un analista. Referencia: `<…>`.» |
| `error_during_execution`, otro `subtype` de error, ausencia de `result` o tiempo agotado: **tras un reintento** de la conversación (1 s ±20%) que también falla | `escalada` | `falla_del_agente` | «Tuve un problema al atender tu consulta. Tu caso pasa a un analista. Referencia: `<…>`.» |

**Reintento del modelo** (FR-013): ante la última fila, `conversar` vuelve a ejecutar `query()` una sola vez con el mismo mensaje y el mismo `correlationId`, tras 1 s ±20% (`dormir` y `azar` inyectables). Si el reintento termina en cualquier otra fila, esa es la que vale.

**Señal de escalamiento** (auditoría): `{ "evento": "escalamiento", "motivo", "regla", "resultado": "escalada", "correlationId", "ts", "herramienta"?, "intentos"?, "ultimoError"? }`. `regla` cita la norma que lo exige (por ejemplo, `constitución, Principio VI · reintentos agotados` o `FR-004 · razón de parada inesperada`).

Ningún texto fijo incluye datos de la consulta: nunca se inventa un resultado. Cada turno `assistant` y el `result` se registran con el `correlationId` (`{ "evento": "turno", "numero" }`, uno por `message.id` distinto, y `{ "evento": "resultado", "subtype", "stop_reason", "tipo", "turnos" }`).
