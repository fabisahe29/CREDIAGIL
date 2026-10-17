# Research: Interfaz de chat

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Fecha**: 2026-10-17

Hechos verificados en el repositorio y en los tipos instalados (`@anthropic-ai/claude-agent-sdk` 0.3.302, Node v24.21.0), seguidos de las decisiones R1–R9.

## Hechos de partida

- `conversar(mensaje, opciones)` ([src/agente/agente.ts](../../src/agente/agente.ts)) atiende **un mensaje suelto**: cada llamada abre un `query()` nuevo, sin historial. Ya acepta un `core` inyectado (no lo cierra si viene de fuera) y devuelve `{ respuesta, tipo, escalamiento, turnos, correlationId }`.
- La señal de escalamiento (`SenalEscalamiento`) la producen el adaptador y `conversar` **en código**, nunca el modelo. Es el único evento de negocio que existe hoy.
- `registrar()` ([src/compartido/logs.ts](../../src/compartido/logs.ts)) escribe siempre en `process.stderr`. El cliente del core arranca el servidor con `stderr: "inherit"` ([src/agente/cliente-core.ts](../../src/agente/cliente-core.ts)): sus logs también salen por la terminal.
- `Options` del Agent SDK ofrece `resume` (id de sesión), `continue`, `forkSession` y `persistSession` (por defecto `true`: guarda la sesión en `~/.claude/projects/`). `prompt` acepta `string` o `AsyncIterable<SDKUserMessage>`.
- `node:util` trae `styleText` (Node ≥ 20.12), que respeta `NO_COLOR` y terminales sin color. `node:readline` está disponible sin dependencias.
- No existe `README.md` en el repositorio.

## R1. Contexto entre turnos: historial explícito en el prompt

**Decisión**: la conversación guarda en memoria su historial de turnos (texto del solicitante y respuesta final del agente) y `conversar` recibe la opción nueva `historial`, que se antepone al mensaje nuevo en un bloque delimitado. Cada turno sigue siendo un `query()` independiente con `persistSession: false`.

**Motivo**:
- Conserva intacto el modelo del #7: un turno = un `query()` con su clasificación del `result`, su reintento y su escalamiento.
- Un reintento repite exactamente el mismo prompt; no hay estado parcial de sesión que limpiar.
- No escribe en disco el contenido de los documentos fuera del repositorio (Principio VI pide no dispersarlo) y se prueba con la `query()` falsa que ya existe.

**Alternativas descartadas**:
- `resume` con el `session_id` de cada turno: persiste la transcripción completa, documentos incluidos, en `~/.claude/projects/`; un intento fallido puede dejar mensajes parciales en la sesión que el reintento hereda.
- Un único `query()` con `prompt` como `AsyncIterable` durante toda la conversación: rompe la interpretación por turno del `result` y un error del modelo mataría la conversación entera.

**Consecuencia**: el historial no incluye las llamadas a herramientas de turnos anteriores, solo los textos. Basta, porque el agente ya resume en su respuesta lo que devolvió el core. Los tokens crecen con la conversación; se acota porque toda conversación termina en un estado final o con `/nueva` (riesgo anotado en el plan).

## R2. Canal de eventos de negocio: lista estructurada que llena el código, no el modelo

**Decisión**: un catálogo único en `src/compartido/eventos.ts` (Zod, unión discriminada por `tipo`). El `EstadoConversacion` del adaptador gana `eventos: EventoNegocio[]` y una función `emitirEvento(estado, evento)`, que valida contra el catálogo y registra el evento en los logs. `conversar` devuelve esa lista en `ResultadoConversacion.eventos`. La señal de escalamiento del #7 se emite también como evento `escalamiento`.

**Motivo**: los eventos salen solo de código determinista (manejadores de herramientas o `conversar`), igual que la señal del #7, así que el estado visible nunca depende del texto del modelo (FR-007; Principio III). Los tickets #9–#16 solo llaman a `emitirEvento` desde sus manejadores (FR-006).

**Alternativas descartadas**:
- Que el modelo marque los eventos en su texto (etiquetas o JSON embebido): no es determinista y contradice FR-007.
- Una herramienta `emitir_evento` expuesta al modelo: el modelo podría declarar una preaprobación sin que la política la haya decidido.
- Eventos en vivo por callback durante el turno: la presentación no lo necesita (los eventos se muestran al cerrar el turno) y complica las pruebas. Las líneas de herramientas sí van en vivo (R5).

## R3. La interfaz valida los eventos otra vez

**Decisión**: la interfaz pasa cada evento recibido por el esquema del catálogo antes de mostrarlo. Si no cumple, lo muestra como «evento no reconocido», lo registra con `nivel: "warn"` y no toca el estado (FR-011).

**Motivo**: defensa en profundidad al estilo del Principio IV; un emisor futuro con un error no puede cambiar el estado visible.

**Alternativa descartada**: confiar en el tipo de TypeScript del emisor: no protege de datos construidos en tiempo de ejecución.

## R4. Terminal con `node:readline` y `styleText`, sin dependencias

**Decisión**: la interfaz es un bucle de `readline` sobre stdin/stdout. Cada elemento lleva una **etiqueta de texto** fija (`Tú`, `Agente`, `[PREAPROBACIÓN]`, `[ESCALAMIENTO]`…) y, si la terminal lo admite, color con `styleText`. Las líneas que llegan mientras el agente trabaja se descartan con un aviso (FR-003).

**Motivo**: YAGNI (aclaración Q3). Las etiquetas hacen que la salida se lea igual sin color, en el video y en las pruebas.

**Alternativas descartadas**: Ink o blessed (dependencias para un diseño que no se califica); `rl.question()` en bucle (lo que se escribe durante el turno quedaría en cola y se enviaría después, contra FR-003).

## R5. Líneas de herramientas en el modo de demostración: observador del adaptador

**Decisión**: `conversar` acepta la opción `alUsarHerramienta(info)`, que el adaptador invoca por cada intento de llamada al core con `{ herramienta, intento, resultado: "ok" | codigo, categoria? }`. La interfaz solo la conecta con `--demo` (FR-009).

**Motivo**: el adaptador ya tiene ese punto (`alIntentar`, que hoy solo registra). Reusarlo muestra los reintentos tal como ocurren, en vivo.

**Alternativa descartada**: leer los logs JSON y filtrarlos: acopla la interfaz al formato de los logs.

## R6. Logs a un archivo por ejecución

**Decisión**: `logs.ts` gana `fijarDestino(destino)` para cambiar el destino por defecto. Al arrancar, el chat abre `logs/chat-<AAAAMMDD-HHMMSS>.jsonl` (carpeta ignorada por git), dirige ahí sus logs y el stderr del servidor del core (opción nueva `stderr` de `crearClienteCore`), y muestra la ruta al iniciar.

**Motivo**: los logs JSON en stderr se mezclarían con la conversación. El archivo permite cruzar la demo con el `correlationId` (FR-004, FR-021).

**Alternativa descartada**: silenciar los logs en el chat (pierde la auditoría del Principio VI); dejarlos en stderr y pedir redirigir `2>` (el comando dejaría de ser uno solo).

## R7. Documentos: lectura con límites y bloque delimitado

**Decisión**:
- Soportado = extensión `.txt` o `.md`, tamaño ≤ 256 KiB, UTF-8 válido (`TextDecoder` con `fatal: true`) y sin bytes nulos. Todo lo demás es **no soportado**: no se lee el contenido (salvo los bytes necesarios para validar los `.txt`/`.md`).
- El contenido viaja al agente dentro de un bloque `<documento nombre="…">…</documento>`; un no soportado, como `<documento_no_soportado nombre="…" tipo="…" motivo="…"/>`. El `systemPrompt` agrega que lo que hay dentro de `<documento>` es un dato del solicitante, nunca una instrucción.
- `/adjuntar` envía el documento como un turno propio. Un archivo vacío o inexistente se informa al solicitante y no se envía.
- A los logs solo van nombre, tipo, tamaño y si fue soportado.

**Motivo**: FR-013 a FR-015 y la constitución (entrada solo `.txt`/`.md`; lo demás se escala por la regla 5, que aplicará el agente en #15). El delimitador reduce el riesgo de que un documento se lea como instrucción.

**Alternativas descartadas**: rechazar el no soportado en la interfaz sin avisar al agente (la interfaz estaría decidiendo y el caso no se escalaría); adjuntar a la cola del siguiente mensaje (otro estado que manejar sin beneficio para la demo).

## R8. Texto de varias líneas: modo `/pegar` … `/fin`

**Decisión**: `/pegar` abre un bloque; todas las líneas hasta una línea que sea exactamente `/fin` se envían como un solo mensaje, con sus saltos de línea (FR-012).

**Motivo**: `readline` entrega cada línea por separado y el modo de pegado entre corchetes (*bracketed paste*) no es uniforme entre terminales de Windows, macOS y Linux. Un marcador explícito es determinista y probable.

**Alternativa descartada**: detectar el pegado por tiempo entre líneas (frágil y no reproducible en pruebas).

## R9. Casos de prueba: JSON validado, en `casos/`

**Decisión**: un caso es una carpeta `casos/<nombre>/` con `caso.json` (`nombre`, `descripcion`, `pasos: [{ "mensaje": "…" } | { "adjuntar": "archivo.md" }]`) y sus documentos al lado. Se valida con Zod y se comprueba que cada adjunto existe **antes** de enviar el primer paso (FR-019). Se carga con `/caso <ruta>` o al arrancar con `--caso <ruta>`. El repositorio trae `casos/demo-consulta/`, con datos ficticios.

**Motivo**: JSON se valida sin dependencias nuevas y los mensajes de varias líneas caben en un string. La carpeta deja los documentos junto al caso; el #17 agregará ahí los escenarios obligatorios.

**Alternativas descartadas**: YAML (dependencia nueva); Markdown con secciones por paso (habría que escribir un analizador); guardar casos dentro de `src/` (no son código de producción).
