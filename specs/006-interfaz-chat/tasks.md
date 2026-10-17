---

description: "Lista de tareas: interfaz de chat"
---

# Tasks: Interfaz de chat

**Input**: documentos de diseño en `specs/006-interfaz-chat/`

**Issue de origen**: [fabisahe29/CREDIAGIL#8](https://github.com/fabisahe29/CREDIAGIL/issues/8)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/chat-cli.md](contracts/chat-cli.md), [contracts/eventos.md](contracts/eventos.md), [quickstart.md](quickstart.md)

**Tests**: la spec los **exige** (FR-022) y la constitución también. Cada módulo se escribe primero como prueba (en rojo) y después se implementa (en verde), con `node --test`. Ninguna prueba depende de red ni del modelo real (regla de tests): `conversar` y `query()` se simulan, y la E/S del chat se inyecta en memoria.

**Organization**: por historia de usuario.
- La Fase 2 deja el catálogo de eventos, el destino de los logs, el stderr del core y el intérprete de comandos.
- US1 hace el chat turno a turno de punta a punta.
- US2 agrega los eventos, el estado y el modo de demostración; US3 cierra el contrato para los tickets siguientes.
- US4 agrega los documentos y US5, los casos de prueba y el README.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US5)

## Path Conventions

- Código bajo `src/`: `src/compartido/`, `src/agente/` y `src/chat/` (nuevo). Cada `*.test.ts` va junto a su archivo (regla de tests). Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).
- Casos de prueba en `casos/<nombre>/`, en la raíz.

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): números con prefijo `000`, correos `.example` y nombres inventados. Montos en pesos enteros.
- **El estado visible solo cambia con eventos validados**, nunca con el texto del agente (FR-007).
- **El contenido de los documentos nunca va a los logs**; solo nombre, tipo, tamaño y si fue soportado (FR-015).
- La interfaz no llama al core ni decide nada de crédito: solo llama a `conversar` (Principio IV).
- Los cambios en `src/agente/` son aditivos: sin `historial`, `conversar` se comporta exactamente como en el #7, y sus pruebas siguen en verde.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Agregar a `package.json` el script `"chat": "node src/chat/principal.ts"` y a `.gitignore` la carpeta `logs/`, con un comentario que remita a R6 de [research.md](research.md). Comprobar que `npm test` y `npm run typecheck` siguen en verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: catálogo de eventos, destino configurable de los logs, stderr del core configurable e intérprete de comandos. Bloquea a todas las historias.

- [X] T002 [P] Prueba `src/compartido/eventos.test.ts` (en rojo), según [data-model.md](data-model.md), «EventoNegocio»:
  - un evento válido de cada uno de los cuatro tipos `"preaprobacion" | "solicitud_de_dato" | "escalamiento" | "bloqueo_por_regla"` pasa `validarEvento` con `ok: true`;
  - comunes: `descripcion` y `motivo` «string no vacío», `correlationId` «UUID», `ts` «fecha ISO 8601»; `regla` «string no vacío, opcional»; `valores` «`Record<string, string | entero>`, opcional»;
  - `preaprobacion` sin `regla`, o con `valores` vacío o ausente, no valida («`regla`, `valores` (≥ 1 entrada)»);
  - `solicitud_de_dato` sin `dato` («string no vacío: qué se pide») no valida;
  - `escalamiento` valida sin `regla` ni `valores`;
  - `bloqueo_por_regla` sin `regla`, sin `valores` (≥ 1 entrada) o sin `siguientePaso` («string no vacío») no valida;
  - el esquema es **estricto**: un campo desconocido, un `tipo` fuera del catálogo o un valor decimal en `valores` (p. ej. `0.3`) no validan;
  - `validarEvento` **nunca lanza**: con `null`, un string o un objeto vacío devuelve `{ ok: false, problema }` con un `problema` legible.
- [X] T003 [P] Implementar `src/compartido/eventos.ts`: `TIPOS_EVENTO`, `esquemaEvento` (unión discriminada Zod, estricta), el tipo `EventoNegocio` y `validarEvento(valor)`, según [contracts/eventos.md](contracts/eventos.md). Sin umbrales de política como literales: el catálogo solo describe eventos. T002 en verde.
- [X] T004 [P] Ampliar `src/compartido/logs.test.ts` (en rojo): después de `fijarDestino(destino)`, `registrar` sin `destino` escribe en el nuevo destino; con `destino` explícito sigue escribiendo en el explícito. Restaurar `process.stderr` al final de la prueba.
- [X] T005 [P] Implementar `fijarDestino(destino)` en `src/compartido/logs.ts` (R6), sin cambiar la firma de `registrar`. T004 en verde.
- [X] T006 [P] Ampliar `src/agente/cliente-core.test.ts` (en rojo) y `src/agente/cliente-core.ts`: opción `stderr` de `crearClienteCore`, `"inherit"` por defecto, que se pasa a `StdioClientTransport`. La prueba arranca el servidor real con `stderr` hacia un descriptor de archivo temporal y comprueba que los logs del core quedan en ese archivo. Todas las pruebas del #7 siguen en verde.
- [X] T007 [P] Prueba `src/chat/comandos.test.ts` (en rojo), según [data-model.md](data-model.md), «Entrada», y [contracts/chat-cli.md](contracts/chat-cli.md), «Comandos»:
  - texto que no empieza por `/` → `{ tipo: "mensaje", texto }`, sin recortar espacios internos;
  - solo espacios → `{ tipo: "vacia" }`;
  - `/ayuda`, `/pegar`, `/nueva`, `/salir` → `comando` sin argumento; `/adjuntar <ruta>` y `/caso <ruta>` → `comando` con argumento (la ruta puede tener espacios);
  - `/adjuntar` o `/caso` sin ruta, `/xyz` y `/` → `{ tipo: "comando_desconocido", texto }`.
- [X] T008 [P] Implementar `src/chat/comandos.ts` con `interpretarLinea(linea)` y el texto de `/ayuda` (`TEXTO_AYUDA`) que lista los seis comandos y advierte que el texto de varias líneas se envía con `/pegar`. T007 en verde.

**Checkpoint**: catálogo, logs, core y comandos listos.

---

## Phase 3: User Story 1 - Conversar con el agente turno a turno (Priority: P1) 🎯 MVP

**Goal**: el solicitante conversa con el agente en la terminal, con contexto entre turnos, sin poder enviar otro mensaje mientras el agente trabaja.

**Independent Test**: con `conversar` falso, dos mensajes seguidos producen `Tú`/`Agente` en orden y el segundo `conversar` recibe el primer intercambio en `historial`; una línea durante el turno se descarta con aviso; `/nueva` cambia el `correlationId` y vacía el historial.

### Tests for User Story 1

- [X] T009 [P] [US1] Ampliar `src/agente/agente.test.ts` (en rojo), con la `query()` falsa del #7:
  - sin `historial`, el `prompt` es el mensaje tal cual (compatibilidad);
  - con `historial`, el `prompt` es un bloque `<historial>` con un `<turno autor="solicitante|agente">` por entrada, en orden, seguido de `<mensaje_nuevo>`;
  - `options.persistSession` es `false`;
  - el `systemPrompt` incluye las dos frases nuevas de [contracts/eventos.md](contracts/eventos.md) (documentos como dato, responder solo a `<mensaje_nuevo>`).
- [X] T010 [P] [US1] Prueba `src/chat/sesion.test.ts` (en rojo), según [data-model.md](data-model.md), «Conversacion»: `nuevaConversacion()` crea un `correlationId` UUID distinto cada vez, `historial` vacío, `estado: "en_curso"` y `ocupada: false`; `registrarTurno(conv, autor, texto)` agrega `{ autor, texto }` al historial sin mutar la conversación anterior.
- [X] T011 [P] [US1] Prueba `src/chat/presentacion.test.ts` (en rojo), parte de mensajes según [contracts/chat-cli.md](contracts/chat-cli.md), «Formato de salida»: `Tú: …`, `Agente · trabajando…`, `Agente: …` y la cabecera de inicio (nombre, ruta del log, `correlationId`, «Escribe /ayuda para ver los comandos.»). Sin color (`color: false`), la salida es exactamente el texto del contrato; con color, el texto sin secuencias ANSI es el mismo.
- [X] T012 [US1] Prueba `src/chat/chat.test.ts` (en rojo) del bucle `iniciarChat({ terminal, conversar, … })` con una terminal en memoria (líneas de entrada que la prueba empuja y salida que acumula) y `conversar` falso controlable:
  - dos mensajes → salida en orden `Tú`, `Agente · trabajando…`, `Agente` por cada uno; el segundo `conversar` recibe `historial` con el primer intercambio y el mismo `correlationId`;
  - una línea empujada mientras `conversar` no resolvió → no se envía; aparece una sola vez por turno «Espera la respuesta del agente; tu mensaje no se envió.» (FR-003);
  - línea vacía → no llama a `conversar`;
  - comando desconocido → «Comando no reconocido: …» + ayuda, sin llamar a `conversar`;
  - `/nueva` → `correlationId` nuevo en la salida y en el siguiente `conversar`, con `historial` vacío;
  - `/salir` y el fin de la entrada → el bucle termina y llama una vez a `cerrar` del core;
  - si `conversar` lanza, se registra el error, se muestra un aviso y el bucle sigue (Principio VI: no se silencia).

### Implementation for User Story 1

- [X] T013 [US1] Modificar `src/agente/agente.ts`: opción `historial` y composición del prompt, `persistSession: false` y las dos frases del `systemPrompt`, según [contracts/eventos.md](contracts/eventos.md). T009 en verde y todas las pruebas previas de `agente.test.ts` en verde.
- [X] T014 [P] [US1] Implementar `src/chat/sesion.ts`: tipos `Conversacion`, `TurnoHistorial` y `EstadoSolicitud`, `nuevaConversacion()` y `registrarTurno()` (funciones puras). T010 en verde.
- [X] T015 [P] [US1] Implementar en `src/chat/presentacion.ts` el formato de mensajes y de la cabecera, con `styleText` de `node:util` solo cuando `color` es `true` (R4). T011 en verde.
- [X] T016 [US1] Implementar `src/chat/chat.ts`: interfaz `Terminal` (`escribir`, suscripción a líneas, cierre), `iniciarChat` con `conversar` y el `ClienteCore` inyectados, bandera de ocupado y descarte con aviso, `/ayuda`, `/nueva`, `/salir`, comando desconocido y manejo de errores de `conversar`. Pasa `core`, `correlationId` e `historial` a cada `conversar`. T012 en verde.
- [X] T017 [US1] Implementar `src/chat/principal.ts`:
  - interpreta las opciones (`--demo`, `--caso <ruta>`; otra cosa → uso y código 2);
  - comprueba `ANTHROPIC_API_KEY` (si falta, el mensaje exacto de [contracts/chat-cli.md](contracts/chat-cli.md) por stderr y código 1, sin arrancar el core ni mostrar valores);
  - abre `logs/chat-<AAAAMMDD-HHMMSS>.jsonl`, llama a `fijarDestino` y arranca el core **una vez** con `crearClienteCore({ stderr: <descriptor del log> })`;
  - conecta `readline` sobre stdin/stdout como `Terminal`, con `color` según la terminal y `NO_COLOR`;
  - cierra el core al salir, también con Ctrl+C;
  - por ahora acepta `--demo` y `--caso` sin efecto: los conectan T029 y T042.
- [X] T018 [US1] Validación rápida sin modelo: `npm run chat` sin `ANTHROPIC_API_KEY` sale con código 1 y el mensaje del contrato (Escenario 2.1 de [quickstart.md](quickstart.md)); `npm test` y `npm run typecheck` en verde.

**Checkpoint**: chat turno a turno funcional; es el MVP.

---

## Phase 4: User Story 2 - Ver con claridad las decisiones y eventos de negocio (Priority: P1)

**Goal**: los eventos se muestran destacados y uniformes, el estado visible cambia solo con eventos, los estados finales cierran la conversación y el modo `--demo` muestra las herramientas.

**Independent Test**: con `conversar` falso que devuelve eventos de los cuatro tipos, cada uno aparece con su etiqueta y campos en el orden del contrato; `preaprobacion` y `escalamiento` cierran la conversación; un texto «quedó aprobada» sin evento no cambia el estado; con `--demo` aparecen las líneas de herramienta y sin él no.

### Tests for User Story 2

- [X] T019 [P] [US2] Ampliar `src/agente/adaptador.test.ts` (en rojo):
  - `crearEstado` inicia `eventos: []`;
  - `emitirEvento(estado, datos)` completa `correlationId` y `ts`, agrega el evento, registra `evento_negocio` con `tipo`, `regla`, `valores` y `correlationId`, y **lanza** si los datos no validan;
  - `alUsarHerramienta` recibe `{ herramienta, intento, resultado: "ok" | código, categoria? }` en cada intento contra el servidor real con la falla en `siempre` (3 llamadas, `transitorio`), sin argumentos ni datos devueltos;
  - una excepción del observador se registra y no interrumpe la llamada.
- [X] T020 [P] [US2] Ampliar `src/agente/agente.test.ts` (en rojo): `ResultadoConversacion.eventos` devuelve los de `estado.eventos` en orden; con resultado `"escalada"` (cada uno de los 4 motivos) incluye **un** evento `escalamiento` con `motivo` = motivo de la señal, `regla` = regla de la señal, `descripcion` = el aviso, `valores` = `{ herramienta, intentos }` solo cuando existen y **sin** `ultimoError`; nunca duplicado; con respuesta normal y sin emisiones, `eventos: []`.
- [X] T021 [P] [US2] Ampliar `src/chat/sesion.test.ts` (en rojo), según [data-model.md](data-model.md), «EstadoSolicitud y transiciones»:
  - `preaprobacion` → `preaprobada`; `escalamiento` → `escalada`; `solicitud_de_dato`, `bloqueo_por_regla` y no reconocido → sin cambio;
  - estados finales absorbentes: tras `preaprobada`, un `escalamiento` no cambia el estado (y viceversa);
  - varios eventos en un turno: «el primero que lleva a un estado final lo fija»;
  - `estaCerrada(conv)` es `true` solo en `preaprobada` y `escalada`;
  - `aplicarEventos` recibe `EventoMostrado[]` y nunca mira texto del agente.
- [X] T022 [P] [US2] Ampliar `src/chat/presentacion.test.ts` (en rojo), según [contracts/chat-cli.md](contracts/chat-cli.md):
  - etiquetas `[PREAPROBACIÓN]`, `[SOLICITUD DE DATO]`, `[ESCALAMIENTO]`, `[BLOQUEO POR REGLA]`;
  - primera línea = `descripcion`; luego solo los campos presentes, en el orden `Dato`, `Regla`, `Valores`, `Motivo`, `Qué sigue`;
  - `bloqueo_por_regla` muestra aviso, regla, valores y qué sigue (FR-008);
  - `Valores`: `clave = valor` separados por ` · `, en el orden de llegada; enteros con separador de miles `.` (`1250000` → `1.250.000`); strings tal cual;
  - línea de estado `══ Estado de la solicitud: <EN CURSO|PREAPROBADA|ESCALADA A ANALISTA> … ══`, con `(conversación cerrada)` en los finales;
  - línea de herramienta `   · herramienta <nombre> · intento <n> · <ok | código (categoría)>`.
- [X] T023 [US2] Ampliar `src/chat/chat.test.ts` (en rojo):
  - tras la respuesta se muestran los eventos en orden y, si el estado cambió, la línea de estado;
  - una respuesta «Tu solicitud quedó aprobada» sin eventos no muestra cambio de estado (FR-007);
  - con un `escalamiento`, el siguiente mensaje no llama a `conversar` y muestra «La solicitud está escalada a analista. Escribe /nueva para empezar otra conversación o /salir para terminar.»; `/adjuntar`, `/pegar` y `/caso` también se rechazan; `/nueva`, `/ayuda` y `/salir` funcionan (FR-007a);
  - con `demo: true`, las llamadas del observador que hace el `conversar` falso aparecen como líneas de herramienta **antes** de la respuesta; con `demo: false`, no aparecen y no se pasa `alUsarHerramienta`.

### Implementation for User Story 2

- [X] T024 [US2] Modificar `src/agente/adaptador.ts`: `eventos` en `EstadoConversacion`, `emitirEvento` exportado y la opción `alUsarHerramienta` conectada a `alIntentar` junto al registro existente, con la excepción del observador registrada e ignorada. T019 en verde.
- [X] T025 [US2] Modificar `src/agente/agente.ts`: opción `alUsarHerramienta` (se pasa al adaptador), `eventos` en `ResultadoConversacion` y la conversión de `SenalEscalamiento` en evento `escalamiento` en un solo punto (`escalar`), según [data-model.md](data-model.md), «Correspondencia con la señal de escalamiento del #7». T020 en verde.
- [X] T026 [P] [US2] Implementar en `src/chat/sesion.ts` el tipo `EventoMostrado`, `aplicarEventos(conv, eventos)` y `estaCerrada(conv)`. T021 en verde.
- [X] T027 [P] [US2] Implementar en `src/chat/presentacion.ts` `formatearEvento`, `formatearEstado` y `formatearHerramienta`, con `Intl.NumberFormat("es-CO")` para los enteros. T022 en verde.
- [X] T028 [US2] Modificar `src/chat/chat.ts`: valida cada evento recibido con `validarEvento` antes de mostrarlo, aplica los eventos, muestra el estado al cambiar, aplica el cierre por estado final y, con `demo`, pasa `alUsarHerramienta` para imprimir las líneas en vivo. T023 en verde.
- [X] T029 [US2] Conectar `--demo` en `src/chat/principal.ts` (`demo: true` en `iniciarChat`).

**Checkpoint**: eventos, estado y modo de demostración funcionando con el escalamiento real del #7.

---

## Phase 5: User Story 3 - Un solo catálogo de eventos para los tickets siguientes (Priority: P1)

**Goal**: un evento inválido se muestra como «evento no reconocido» sin cambiar el estado, y un evento del catálogo emitido desde el adaptador llega a la interfaz sin tocar `src/chat/`.

**Independent Test**: una prueba de punta a punta emite con `emitirEvento`, desde un manejador falso, un evento de cada tipo y los ve en la salida del chat con la estructura común; un evento crudo inválido aparece como `[EVENTO NO RECONOCIDO]` y en los logs con `nivel: "warn"`.

### Tests for User Story 3

- [X] T030 [P] [US3] Ampliar `src/chat/presentacion.test.ts` y `src/chat/chat.test.ts` (en rojo): un evento con `tipo` desconocido, sin `tipo` o con un campo obligatorio faltante se muestra como `[EVENTO NO RECONOCIDO]` con el `tipo` recibido (o `sin tipo`) y el problema de validación, **nunca** el evento completo; se registra `evento_no_reconocido` con `nivel: "warn"` y el `correlationId`; el estado no cambia (FR-011).
- [X] T031 [US3] Prueba de integración en `src/chat/chat.test.ts` (en rojo): `iniciarChat` con el `conversar` **real** y una `query()` falsa que, durante el turno, invoca un manejador que llama a `emitirEvento` con un evento de cada tipo del catálogo. Se comprueba que los cuatro aparecen con su etiqueta y que `preaprobacion` cierra la conversación, sin código específico por tipo en `src/chat/` (FR-006, SC-002). Cada evento mostrado figura en los logs con el `correlationId` de la conversación (US3, escenario 3).

### Implementation for User Story 3

- [X] T032 [US3] Completar en `src/chat/presentacion.ts` y `src/chat/chat.ts` la rama de evento no reconocido y su registro. T030 y T031 en verde. Si T031 obliga a tocar `conversar` o el adaptador, actualizar [contracts/eventos.md](contracts/eventos.md).

**Checkpoint**: contrato de eventos listo para #9–#16.

---

## Phase 6: User Story 4 - Entregar documentos pegados o como archivos de texto (Priority: P2)

**Goal**: `/pegar` … `/fin` envía texto de varias líneas como un mensaje y `/adjuntar` entrega `.txt`/`.md` al agente; los no soportados llegan solo como metadatos y los logs nunca llevan el contenido.

**Independent Test**: `/pegar`, tres líneas, `/fin` → un `conversar` con las tres líneas; `/adjuntar` de un `.md` ficticio → bloque `<documento>`; `/adjuntar` de un `.png` → bloque `<documento_no_soportado>` sin leer el contenido; el log no contiene ninguna frase del documento.

### Tests for User Story 4

- [X] T033 [P] [US4] Prueba `src/chat/documentos.test.ts` (en rojo), según [data-model.md](data-model.md), «Documento», con archivos creados en un directorio temporal:
  - `soportado`: «`.txt`/`.md`, ≤ 256 KiB, UTF-8 válido, sin bytes nulos, no vacío», con `nombre` (nombre base), `contenido` y `bytes`;
  - `no_soportado` con `motivo` `formato` (p. ej. `.pdf`, `.png`, sin extensión), `tamano` (256 KiB + 1 byte) y `codificacion` (UTF-8 inválido o un byte nulo en un `.txt`); para `formato` no se lee el archivo;
  - `vacio`: «0 bytes o solo espacios»; `inexistente`: ruta que no existe o que es una carpeta;
  - extensión en mayúsculas (`.MD`) cuenta como soportada;
  - `componerMensaje(documento)`: `Adjunto el documento <nombre>.` + `<documento nombre="…">…</documento>` o `<documento_no_soportado nombre="…" tipo="…" motivo="…"/>`; las comillas y `<`/`>` del nombre se reemplazan;
  - `metadatosParaLog(documento)` devuelve solo nombre, tipo, tamaño y soportado, nunca `contenido`.
- [X] T034 [US4] Ampliar `src/chat/chat.test.ts` (en rojo):
  - `/pegar`, tres líneas (una que empieza por `/`), `/fin` → un solo `conversar` con las tres líneas unidas por `\n`; un bloque vacío no se envía;
  - `/adjuntar <ruta .md>` → `Tú · adjunto <nombre> (<n> bytes)` y un `conversar` con el bloque `<documento>`; el historial guarda el bloque enviado;
  - `/adjuntar <ruta .png>` → `(no soportado: formato)` y un `conversar` con el bloque `<documento_no_soportado>`;
  - archivo vacío o inexistente → los avisos del contrato, sin llamar a `conversar`;
  - el destino de logs capturado contiene `documento_adjunto` con los metadatos y **no** contiene ninguna frase del contenido del documento (SC-006).

### Implementation for User Story 4

- [X] T035 [P] [US4] Implementar `src/chat/documentos.ts`: `leerDocumento(ruta, baseDir)`, `componerMensaje` y `metadatosParaLog`, con `TextDecoder("utf-8", { fatal: true })` y el límite `256 * 1024` bytes como constante nombrada (R7). T033 en verde.
- [X] T036 [US4] Modificar `src/chat/chat.ts`: modo `/pegar` … `/fin` (las líneas dentro del bloque no se interpretan como comandos, salvo `/fin`) y `/adjuntar`, con su presentación y el log `documento_adjunto`. Las rutas relativas se resuelven desde el directorio de inicio. T034 en verde.

**Checkpoint**: documentos y texto largo funcionando.

---

## Phase 7: User Story 5 - Iniciar con un comando y reproducir un caso de prueba (Priority: P2)

**Goal**: `npm run chat` documentado en el README, y casos de prueba ficticios que se reproducen turno a turno con `/caso` o `--caso`.

**Independent Test**: con `conversar` falso, `/caso casos/demo-consulta` envía cada paso en orden esperando cada respuesta; un caso inválido no envía nada; un caso que llega a un estado final se detiene informando los pasos sin enviar.

### Tests for User Story 5

- [X] T037 [P] [US5] Prueba `src/chat/casos.test.ts` (en rojo), según [data-model.md](data-model.md), «CasoPrueba», con carpetas temporales:
  - `cargarCaso(ruta)` acepta la carpeta o el propio `caso.json`;
  - `nombre`, `descripcion` «string no vacío»; `pasos` «1 o más; cada uno tiene exactamente `mensaje` (string no vacío) o `adjuntar` (ruta relativa a la carpeta del caso, sin salir de ella)»;
  - se rechazan: JSON mal formado, `pasos` vacío, un paso con las dos claves o con ninguna, un `adjuntar` con `..` o ruta absoluta que sale de la carpeta y un adjunto inexistente; el resultado es `{ ok: false, problema }` legible, sin lanzar;
  - el caso versionado `casos/demo-consulta` carga sin errores.
- [X] T038 [US5] Ampliar `src/chat/chat.test.ts` (en rojo):
  - `/caso <ruta válida>` → `▶ Caso <nombre>: <descripcion> (<n> pasos)`, `▶ paso i/n` por paso, cada `conversar` llamado solo después de que resolvió el anterior, adjuntos con la misma presentación que `/adjuntar` y `▶ Caso terminado.`;
  - `/caso <ruta inválida>` → `No pude cargar el caso: <problema>.` y ningún `conversar`;
  - un `conversar` que devuelve `escalamiento` en el paso 2 de 4 → `▶ Caso detenido: la solicitud está escalada a analista; 2 pasos sin enviar.`;
  - lo que se escribe durante el caso se descarta con el aviso de ocupado;
  - la opción `casoInicial` de `iniciarChat` (la que usa `--caso`) reproduce el caso apenas arranca.

### Implementation for User Story 5

- [X] T039 [P] [US5] Crear `casos/demo-consulta/caso.json` y `casos/demo-consulta/certificado-laboral.md`, según el ejemplo de [data-model.md](data-model.md):
  - 3 a 4 pasos: saludo con consulta de `SOL-0001000001`, una pregunta de seguimiento que depende del historial y el adjunto del certificado;
  - el certificado es ficticio: empleador y NIT inventados con prefijo `000` (p. ej. `NIT 000123456-7`), nombre «Ana Pérez Ficticia», documento `CC 0001234567`, correo `.example`, salario en pesos enteros y moneda COP.

  El guardián del #5 los revisa al escribirlos.
- [X] T040 [P] [US5] Implementar `src/chat/casos.ts` con `cargarCaso(ruta)` (esquema Zod estricto, rutas resueltas y verificadas dentro de la carpeta del caso, existencia de cada adjunto) antes de devolver el caso (R9). T037 en verde.
- [X] T041 [US5] Modificar `src/chat/chat.ts`: `/caso` y la opción `casoInicial`, que reproducen los pasos con la misma ruta de código que un mensaje o `/adjuntar` (los adjuntos se resuelven desde la carpeta del caso) y se detienen en un estado final. T038 en verde.
- [X] T042 [US5] Conectar `--caso <ruta>` en `src/chat/principal.ts` (`casoInicial`).
- [X] T043 [P] [US5] Crear `README.md` en la raíz: qué es Crediágil, requisitos (Node ≥ 22.18, `npm install`, `ANTHROPIC_API_KEY` en la sesión según `.env.example`), **el comando único** `npm run chat`, las opciones `--demo` y `--caso`, la tabla de comandos de [contracts/chat-cli.md](contracts/chat-cli.md), qué significa cada etiqueta de evento y cada estado, dónde quedan los logs, cómo activar la falla del core para la demo (`CREDIAGIL_FALLA`) y `npm test`. Enlazar la constitución y `DECISIONES.md`.
- [X] T044 [US5] Ampliar `.claude/hooks/lib/sin-datos-reales.test.ts` para que recorra también `casos/**` y `specs/006-interfaz-chat/**/*.md`, y espere 0 datos con forma real (Principio II, FR-020).

**Checkpoint**: todas las historias funcionando.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T045 [P] Actualizar el mapa del repositorio en `CLAUDE.md`: agregar `src/chat/` (interfaz de chat de terminal, #8) y `casos/` (casos de prueba ficticios para la demo).
- [X] T046 Comprobar que `npm test`, `npm run typecheck` y `npm run format:check` están en verde, **sin** `ANTHROPIC_API_KEY` definida (SC-007).
  - Resultado (2026-10-17): `npm test` 631/631 y `typecheck` en verde. `format:check` marca 18 archivos que este ticket **no** modifica (`src/mcp/*`, `tsconfig.json`, `.mcp.json`…): con `core.autocrlf=true` la copia local está en CRLF y el índice en LF (`git ls-files --eol`). Todos los archivos nuevos o modificados del #8 pasan Prettier.
- [X] T047 Validación manual con el modelo real, con `ANTHROPIC_API_KEY` en la terminal y confirmación del desarrollador, porque consume tokens: Escenarios 2 a 6 de [quickstart.md](quickstart.md), en PowerShell/Windows Terminal (riesgo de `styleText` del plan). Anotar los resultados en esta tarea.
  - Resultado (2026-10-17), con el modelo real y los escenarios conducidos con `--caso` y la entrada estándar cerrada (casos temporales fuera del repositorio):
    - Escenario 2: sin clave, código 1 y el mensaje del contrato; opción inválida, código 2; arranque con la ruta del log, el `correlationId` y el log del core en el mismo archivo.
    - Escenario 3: `SOL-0001000001` responde en estudio con monto, plazo y fecha; «¿Y en qué fecha la radiqué?» responde la fecha correcta sin repetir el identificador (historial). 17 s los dos turnos.
    - Escenario 4: el certificado llega completo (617 bytes) y el agente lo usa; el mensaje de 3 líneas llega como uno; el `.png` llega como `no soportado: formato` y el agente pide los datos en texto (todavía no escala: regla 5, #15). El log tiene 2 `documento_adjunto` solo con metadatos y 0 frases del certificado.
    - Escenario 5 con `--demo` y `CREDIAGIL_FALLA=siempre`: 3 líneas de herramienta `core_no_disponible (transitorio)`, el bloque `[ESCALAMIENTO]` con regla y valores, estado `ESCALADA A ANALISTA (conversación cerrada)` y el caso detenido con 1 paso sin enviar. En el log, `evento_negocio` de tipo `escalamiento` con el mismo `correlationId`. Sin `--demo`, no aparecen las líneas de herramienta.
    - Escenario 6: `casos/demo-consulta` reproduce los 4 pasos en orden y termina; `casos/no-existe` → «No pude cargar el caso» sin enviar nada.
    - Corregido en la validación: «1 pasos sin enviar» → singular y plural, con prueba nueva.
    - Observación para #10/#15: el agente remite a un «canal oficial de Crediágil para documentos» que no existe; es comportamiento del modelo, no de la interfaz.
    - Terminal interactiva (PowerShell/Windows Terminal), validada por el desarrollador: colores de `styleText` y su ausencia con `NO_COLOR`, una sola línea `Tú:` por entrada (sin eco duplicado), aviso al escribir durante un turno, `/pegar` a mano con el indicador `…`, `/nueva` sin historial, Ctrl+C a mitad de un turno, y la conversación cerrada tras el escalamiento con `--demo`. Todo según lo esperado.
- [ ] T048 Commit convencional en `8-interfaz-de-chat`, por ejemplo `feat: interfaz de chat con eventos de negocio y casos de prueba (#8)`. Antes:
  - `git status`, para confirmar que no entra `logs/`, ningún `.env` ni archivo temporal;
  - la búsqueda de tokens del quickstart del #3.
- [ ] T049 Con confirmación del desarrollador: `git push -u origin 8-interfaz-de-chat` y `/ticket-abrir-pr 8`. Se espera que la revisión de cumplimiento dé las 5 reglas como no aplicables; cualquier regla incumplida o hallazgo alto bloquea el PR y se corrige antes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de la Fase 1; bloquea a todas las historias.
- **US1 (Fase 3)**: depende de la Fase 2. Es el MVP.
- **US2 (Fase 4)**: depende de US1 (bucle del chat, sesión, presentación y `conversar`).
- **US3 (Fase 5)**: depende de US2 (emisión, validación y presentación de eventos).
- **US4 (Fase 6)**: depende de US1; independiente de US2 y US3, salvo que `chat.ts` se modifica en secuencia.
- **US5 (Fase 7)**: depende de US1 y US4 (los pasos `adjuntar` reutilizan la lectura de documentos); el cierre por estado final (T038) depende de US2.
- **Polish (Fase 8)**: depende de todas las historias.

### Within Each User Story

Prueba en rojo → implementación en verde. Los archivos compartidos se modifican en secuencia entre historias: `chat.ts` (T016 → T028 → T032 → T036 → T041), `agente.ts` (T013 → T025), `presentacion.ts` (T015 → T027 → T032) y `principal.ts` (T017 → T029 → T042).

### Parallel Opportunities

- En la Fase 2: T002/T003, T004/T005, T006 y T007/T008, todos en archivos distintos.
- En US1: T009, T010 y T011 en paralelo; después T013, T014 y T015 en paralelo.
- En US2: T019, T020, T021 y T022 en paralelo; T026 y T027 en paralelo.
- En US4: T033/T035 en paralelo con cualquier tarea de US2 o US3.
- En US5: T037/T040, T039 y T043 en paralelo.

---

## Parallel Example: Fase 2 y US1

```text
Task: "T002 eventos.test.ts → T003 eventos.ts"
Task: "T004 logs.test.ts → T005 logs.ts"
Task: "T006 cliente-core: opción stderr"
Task: "T007 comandos.test.ts → T008 comandos.ts"
# Después, en US1:
Task: "T009 agente.test.ts (historial)"
Task: "T010 sesion.test.ts"
Task: "T011 presentacion.test.ts (mensajes)"
```

---

## Implementation Strategy

### MVP First (US1)

1. T001 → T002–T008 (catálogo, logs, core y comandos).
2. T009–T017: historial en `conversar`, sesión, presentación, bucle y arranque.
3. **Parar y validar**: `npm test` en verde; con `ANTHROPIC_API_KEY`, `npm run chat` conversa turno a turno con contexto (Escenario 3 del quickstart).

### Incremental Delivery

1. MVP: US1.
2. US2: eventos, estado, cierre y `--demo` (T019–T029); el escalamiento real del #7 ya se ve.
3. US3: evento no reconocido y prueba de punta a punta del catálogo (T030–T032).
4. US4: documentos y `/pegar` (T033–T036).
5. US5: casos, `--caso`, README y datos ficticios verificados (T037–T044).
6. Validación, commit, PR y cierre (T045–T049).
