---
description: "Lista de tareas: extracción estructurada de documentos con subagente"
---

# Tasks: Extracción estructurada de documentos con subagente

**Input**: documentos de diseño en `specs/008-extraccion-documentos/`

**Issue de origen**: [fabisahe29/CREDIAGIL#10](https://github.com/fabisahe29/CREDIAGIL/issues/10)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/subagente.md](contracts/subagente.md), [contracts/agente.md](contracts/agente.md), [contracts/core-mcp.md](contracts/core-mcp.md), [quickstart.md](quickstart.md)

**Tests**: la spec los **exige** (FR-020), y la constitución también: política en el borde exacto y herramientas MCP con rechazo del lado del servidor. Cada módulo se escribe primero como prueba, en rojo, y después se implementa, en verde, con `node --test`. Ninguna prueba depende de red ni del modelo real: el core, `query()`, el subagente y el reloj se simulan o se inyectan.

**Organization**: por historia de usuario.
- La Fase 2 deja la política de documentos, la validación compartida, la numeración de documentos en el chat y el motivo nuevo de escalamiento.
- US1 hace la extracción de punta a punta con un intento: subagente, validación, registro en el core y control de identidad.
- US2 agrega los datos faltantes y su `solicitud_de_dato`.
- US3 agrega la procedencia completa, la revalidación del core y `consultar_extracciones`.
- US4 agrega el ciclo de reintentos y el escalamiento por documento no extraíble.
- US5 agrega los casos no cubiertos de la Regla 5.
- US6 agrega los documentos y casos de demo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US6)

## Path Conventions

- Código bajo `src/`: `src/politica/`, `src/compartido/`, `src/mcp/`, `src/agente/` y `src/chat/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).
- Casos de demostración en `casos/<nombre>/`.

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): NIT, documentos y cuentas con prefijo `000`, correos `.example`, nombres y empleadores inventados. Un monto nunca comparte línea con una palabra clave de documento o de cuenta.
- **Montos como enteros de pesos**, nunca flotantes (Principio III).
- **El contenido de los documentos y los fragmentos nunca van a los logs** (FR-017). Cada prueba de adaptador, core y servidor que extraiga comprueba que los logs capturados no contienen el contenido ni los fragmentos.
- **Los límites y la Regla 5 se toman de `src/politica/`**: ningún otro archivo repite `3`, `"COP"` ni la lista de tipos como literal.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar el punto de partida.

- [X] T001 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check` en la rama `10-extraccion-estructurada-de-documentos` y confirmar que todo está en verde antes de cambiar nada

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: piezas que usan todas las historias.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

### Política de documentos (R5)

- [X] T002 [P] Escribir en rojo `src/politica/documentos.test.ts`:
  - `deducirMoneda`: "COP", "pesos", "pesos colombianos" → `COP`; "USD", "US$", "dólares", "EUR", "euros" → extranjera con el código; "$3.800.000" solo → `null` (no reconocida); mayúsculas y tildes indiferentes;
  - `evaluarDocumento`: `tipo: "otro"` → no cubierto `documento_no_soportado`; moneda extranjera → no cubierto `moneda_extranjera`; `conflictos` no vacío → no extraíble; certificado completo → extraído sin faltantes; certificado sin salario → extraído con `faltantes: ["salario"]`; extracto con movimientos vacíos → extraído sin faltantes;
  - cada decisión trae `regla`, `valores`, `motivo` y `version` igual a `VERSION_POLITICA`;
  - `MAX_INTENTOS_EXTRACCION` vale 3 y `TIPOS_DOCUMENTO_SOPORTADOS` son exactamente `certificado_laboral` y `extracto_bancario`
- [X] T003 Agregar a `src/politica/politica.ts` `TIPOS_DOCUMENTO_SOPORTADOS`, `MONEDA_SOPORTADA = "COP"`, la tabla de expresiones de moneda y `MAX_INTENTOS_EXTRACCION = 3`, con comentario que cite la aclaración Q1 del #10, y subir `VERSION_POLITICA`
- [X] T004 Implementar `deducirMoneda` y `evaluarDocumento` en `src/politica/documentos.ts` hasta poner en verde T002. Reglas: `"Regla 5 · caso no cubierto por la política"` para no cubierto y `"constitución, Principio V"` para no extraíble o con faltantes (data-model.md, DecisionDocumento)

### Validación compartida (R4)

- [X] T005 [P] Escribir en rojo `src/compartido/extraccion.test.ts`, con documentos ficticios inline:
  - `esquemaSalidaSubagente` acepta la forma de contracts/subagente.md y rechaza `certificado` no nulo con `tipo: "extracto_bancario"`;
  - `validarSalida`: fragmento presente; ausente → `fragmento_no_encontrado`; con otros saltos de línea y espacios → válido; monto 3800000 con fragmento "$3.800.000" → válido; con "$3.800.000,00" → válido; con "$3.800.000,50" → `centavos_no_soportados`; con "$3.500.000" → `valor_no_coincide_con_fragmento`; fecha futura con reloj inyectado → `fecha_futura`; moneda "$" solo → `moneda_no_reconocida`; varios errores se acumulan con su `campo` (por ejemplo `movimientos.1.valor`);
  - un `fragmento` de más de 300 caracteres no pasa el esquema;
  - `huella` devuelve el SHA-256 en hexadecimal y es igual para el mismo contenido;
  - `validarResultado` acepta un `ResultadoExtraccion` correcto y rechaza uno con un fragmento ajeno
- [X] T006 Implementar `src/compartido/extraccion.ts` hasta poner en verde T005: `esquemaSalidaSubagente`, tipos `Procedencia`, `Campo<T>`, `CertificadoLaboral`, `ExtractoBancario`, `Movimiento`, `ErrorExtraccion` y `ResultadoExtraccion` (unión por `estado`: `extraido`, `no_cubierto`, `no_extraible`, todas con `adjunto`, `nombre`, `huella` e `intentos` de 1 a 3), y las funciones `validarSalida(salida, documento, hoy)`, `validarResultado(resultado, contenido, hoy)` y `huella(contenido)`. El monto se compara quitando separadores de miles y unos centavos `,00`. La moneda se deduce con `deducirMoneda`

### Documentos numerados en el chat (R2)

- [X] T007 [P] Escribir en rojo pruebas en `src/chat/sesion.test.ts` para `registrarDocumento`: asigna 1, 2, 3 en orden; guarda `{ adjunto, nombre, soportado, contenido? }`; un no soportado también recibe número y no guarda contenido; `nuevaConversacion` empieza con `documentos: []`
- [X] T008 [P] Escribir en rojo pruebas en `src/chat/documentos.test.ts`: `componerMensaje(documento, adjunto)` produce `<documento adjunto="2" nombre="certificado.md">` y `<documento_no_soportado adjunto="3" …/>`; `componerPegado(texto, adjunto)` produce `<documento adjunto="N" nombre="texto pegado">` con las etiquetas neutralizadas
- [X] T009 Implementar `Conversacion.documentos` y `registrarDocumento` en `src/chat/sesion.ts`, y el atributo `adjunto` y `componerPegado` en `src/chat/documentos.ts`, hasta poner en verde T007 y T008
- [X] T010 Escribir en rojo pruebas en `src/chat/chat.test.ts`: `/adjuntar` registra el documento antes del turno y `conversar` recibe `documentos` con el número correcto; `/pegar … /fin` registra un `texto pegado`, lo envía como bloque de documento y el texto llega completo en un solo mensaje (FR-012 del #8); `/nueva` reinicia la numeración; el aviso muestra "adjunto N · nombre"
- [X] T011 Implementar en `src/chat/chat.ts` y `src/chat/presentacion.ts` el registro de `/adjuntar` y `/pegar` y el paso de `documentos` a `conversar`, hasta poner en verde T010. Ajustar las pruebas existentes del #8 que esperaban `/pegar` como mensaje plano

### Agente: opciones y motivo nuevo

- [X] T012 Agregar a `src/agente/adaptador.ts` el motivo `documento_no_extraible` en `SenalEscalamiento`, el campo opcional `adjunto?: number` y `REGLA_NO_EXTRAIBLE = "constitución, Principio V · documento no extraíble"`; y en `src/agente/agente.ts` su entrada en `AVISOS` ("No pude leer con certeza los datos de tu documento. Tu caso pasa a un analista, que te contactará.") y en `REGLAS`, y el `adjunto` en los `valores` del evento `escalamiento`
- [X] T013 Agregar a `OpcionesConversar` en `src/agente/agente.ts` las opciones `documentos?: readonly DocumentoConversacion[]` y `ejecutarSubagente?: EjecutarSubagente`, y pasarlas al adaptador. Exportar `DocumentoConversacion` desde un único lugar que importen el chat y el agente

**Checkpoint**: política, validación y numeración listas y en verde. Empiezan las historias.

---

## Phase 3: User Story 1 - Extraer un documento a un esquema validado (Priority: P1) 🎯 MVP

**Goal**: un solicitante verificado entrega un certificado o un extracto y obtiene sus datos tipados y validados, registrados en el core.

**Independent Test**: con el subagente falso, extraer un certificado completo y un extracto de un solicitante verificado; comprobar el tipo, los montos enteros, las fechas AAAA-MM-DD y el registro en el core. Sin identidad, comprobar el `bloqueo_por_regla` con la Regla 1.

### Tests for User Story 1 ⚠️

- [X] T014 [P] [US1] Escribir en rojo pruebas en `src/agente/extraccion.test.ts` para `crearSubagente({ ejecutarConsulta })`: con una `query()` falsa, las `Options` tienen `tools: []`, sin `mcpServers`, `settingSources: []`, `persistSession: false`, `maxTurns: 2` y `outputFormat.type: "json_schema"`; el prompt contiene el bloque `<documento adjunto="N" nombre="…">` con el contenido neutralizado y no contiene historial ni otros documentos; un `result` con `structured_output` devuelve `{ ok: true, salida }`; sin `structured_output` → `sin_salida_estructurada`; `error_max_structured_output_retries` → `sin_salida_estructurada`; superar 25 s con reloj inyectado → `tiempo_agotado`
- [X] T015 [P] [US1] Escribir en rojo pruebas en `src/mcp/core-simulado.test.ts` para `registrarExtraccion` y `consultarExtracciones`: sin identidad verificada → `negocio` `identidad_no_verificada`; con identidad, guarda y devuelve el registro con `huella` y `registradoEn`; misma huella en la misma conversación → el mismo registro, con el adjunto nuevo en `adjuntos`, sin duplicar; otra conversación no ve las extracciones; el almacén no guarda `contenido`
- [X] T016 [P] [US1] Escribir en rojo pruebas en `src/mcp/servidor.test.ts` para `registrar_extraccion` y `consultar_extracciones` con el cliente MCP en memoria: entrada mal formada con `campo`; `contenido` de más de 262 144 caracteres → `validacion`; la auditoría `auditoria_extraccion` lleva `correlationId`, `adjunto`, huella corta, `estado`, `regla`, `version` y `ts`, y los logs no contienen el contenido ni los fragmentos
- [X] T017 [P] [US1] Escribir en rojo pruebas en `src/agente/cliente-core.test.ts` para `registrarExtraccion` y `consultarExtracciones`, incluida la validación de la respuesta con los esquemas compartidos
- [X] T018 [P] [US1] Escribir en rojo pruebas en `src/agente/adaptador.test.ts` para `extraer_documento` con un intento válido: certificado completo → `exito({ resultado })` con `estado: "extraido"`, `salario` entero y `fechaIngreso` AAAA-MM-DD, y `registrarExtraccion` llamado con el contenido exacto del adjunto; extracto → `estado: "extraido"` con sus movimientos; `adjunto` inexistente → `validacion` `adjunto_inexistente` sin llamar al subagente; el log `extraccion` tiene los campos de R10 y no el contenido
- [X] T019 [P] [US1] Escribir en rojo pruebas en `src/agente/control-identidad.test.ts`: `HERRAMIENTAS_CON_IDENTIDAD` es `["extraer_documento"]`; sin identidad verificada, `mcp__originacion__extraer_documento` se deniega con `bloqueo_por_regla` y la Regla 1; con identidad, se permite

### Implementation for User Story 1

- [X] T020 [US1] Implementar en `src/mcp/core-simulado.ts` el almacén `extracciones: Map<correlationId, Map<huella, RegistroExtraccion>>`, `registrarExtraccion` (pasos 1 a 3 y 6 de contracts/core-mcp.md; la revalidación llega en US3) y `consultarExtracciones`, hasta poner en verde T015
- [X] T021 [US1] Registrar `registrar_extraccion` y `consultar_extracciones` en `src/mcp/servidor.ts` con esquema laxo anunciado y validación estricta en el manejador, la auditoría y los logs, hasta poner en verde T016
- [X] T022 [US1] Agregar `registrarExtraccion` y `consultarExtracciones` a `src/agente/cliente-core.ts`, hasta poner en verde T017
- [X] T023 [US1] Implementar en `src/agente/extraccion.ts` `PROMPT_EXTRACCION` con las 7 reglas de contracts/subagente.md, `componerPromptExtraccion` y `crearSubagente`, que usa `query()` con las `Options` del contrato y un `AbortController` de 25 s enlazado con el de la conversación, hasta poner en verde T014
- [X] T024 [US1] Implementar `extraer_documento` en `src/agente/adaptador.ts`, con un solo intento por ahora: buscar el adjunto, llamar al subagente, `validarSalida`, `evaluarDocumento`, `registrarExtraccion` con los reintentos del #7, devolver el resultado y registrar el log `extraccion`, hasta poner en verde T018
- [X] T025 [US1] Poner `HERRAMIENTAS_CON_IDENTIDAD = ["extraer_documento"]` en `src/agente/control-identidad.ts` y actualizar su comentario, hasta poner en verde T019
- [X] T026 [US1] Actualizar `SYSTEM_PROMPT` en `src/agente/agente.ts` según contracts/agente.md: quitar "No pidas ni uses documentos de soporte antes de verificar" y agregar las instrucciones de `extraer_documento` y de no leer datos por cuenta propia. Agregar en `src/agente/agente.test.ts` una prueba de que `conversar` pasa `documentos` y `ejecutarSubagente` al adaptador

**Checkpoint**: US1 funciona sola. Un certificado y un extracto se extraen, se validan y se registran, y sin identidad no se extrae.

---

## Phase 4: User Story 2 - No inventar lo que el documento no trae (Priority: P1)

**Goal**: un dato ausente queda nulo, no se reintenta, y el código pide un documento que lo traiga.

**Independent Test**: con el subagente falso, extraer un certificado sin salario; comprobar `salario: null`, un solo intento y un `solicitud_de_dato` sobre el salario que pide un documento.

### Tests for User Story 2 ⚠️

- [X] T027 [P] [US2] Escribir en rojo pruebas en `src/agente/adaptador.test.ts`: certificado sin salario → `estado: "extraido"`, `faltantes: ["salario"]`, el subagente se llama una sola vez y se emite un `solicitud_de_dato` con `motivo: "dato_faltante_en_documento"`, `dato: "salario"`, `regla: "constitución, Principio V"` y `valores` con `adjunto`, `documento` y `faltantes`; la `descripcion` pide un documento y no pide escribir el dato; dos campos nulos → un solo evento con `dato: "salario, moneda"`; un extracto sin movimientos no emite evento
- [X] T028 [P] [US2] Escribir en rojo una prueba en `src/agente/agente.test.ts`: con una `query()` falsa que simula un turno donde el solicitante escribe su salario, ninguna llamada al core registra un salario que no venga de `extraer_documento`

### Implementation for User Story 2

- [X] T029 [US2] Implementar en `extraer_documento` de `src/agente/adaptador.ts` el evento de faltantes de contracts/agente.md, uno por documento, con la descripción que pide un documento nuevo (aclaración Q2), hasta poner en verde T027
- [X] T030 [US2] Agregar al `SYSTEM_PROMPT` en `src/agente/agente.ts` que un dato escrito por el solicitante no reemplaza a un documento y que, si la herramienta ya pidió un dato, no lo pida de nuevo con otras palabras, hasta poner en verde T028

**Checkpoint**: US1 y US2 funcionan. Ningún dato ausente se completa.

---

## Phase 5: User Story 3 - Saber de dónde salió cada dato (Priority: P1)

**Goal**: cada dato no nulo trae documento y fragmento comprobados, el core lo revalida y los turnos siguientes lo consultan.

**Independent Test**: extraer el certificado completo y comprobar que cada campo no nulo trae `adjunto`, `nombre` y un fragmento presente en el documento; enviar al core un resultado con un fragmento ajeno y comprobar el rechazo.

### Tests for User Story 3 ⚠️

- [X] T031 [P] [US3] Escribir en rojo pruebas en `src/agente/adaptador.test.ts`: cada campo no nulo del resultado tiene `procedencia: { adjunto, nombre, fragmento }` con el número y el nombre del documento correcto; un campo nulo no tiene procedencia; dos documentos con el mismo nombre y distinto número mantienen cada procedencia en su documento; `consultar_extracciones` devuelve los resultados ordenados por adjunto
- [X] T032 [P] [US3] Escribir en rojo pruebas en `src/mcp/core-simulado.test.ts` y `src/mcp/servidor.test.ts`: `registrar_extraccion` con un `extraido` cuyo fragmento no está en `contenido` → `validacion` `extraccion_invalida` con el `campo`; con un monto que no está en su fragmento → igual; un `no_cubierto` cuya causa no coincide con `evaluarDocumento` → `extraccion_invalida` con `campo: "resultado.causa"`

### Implementation for User Story 3

- [X] T033 [US3] En `extraer_documento` de `src/agente/adaptador.ts`, construir la procedencia agregando `adjunto` y `nombre` a cada fragmento validado, y agregar la herramienta `consultar_extracciones` (sin entrada, `readOnlyHint: true`), hasta poner en verde T031
- [X] T034 [US3] Agregar a `registrarExtraccion` en `src/mcp/core-simulado.ts` los pasos 4 y 5 de contracts/core-mcp.md con `validarResultado` y `evaluarDocumento`, hasta poner en verde T032
- [X] T035 [US3] Agregar al `SYSTEM_PROMPT` en `src/agente/agente.ts` la instrucción de usar `consultar_extracciones` para recordar datos de turnos anteriores, y una prueba en `src/agente/agente.test.ts` de que la herramienta está disponible

**Checkpoint**: la procedencia se comprueba en el agente y en el core.

---

## Phase 6: User Story 4 - Delegar a un subagente y reintentar con el error concreto (Priority: P2)

**Goal**: hasta 3 intentos, cada uno con los errores del anterior; si se agotan, se escala.

**Independent Test**: con el subagente falso, un intento inválido y luego uno válido; comprobar que el segundo recibió los errores. Tres inválidos escalan con `documento_no_extraible`.

### Tests for User Story 4 ⚠️

- [X] T036 [P] [US4] Escribir en rojo pruebas en `src/agente/adaptador.test.ts`:
  - inválido y luego válido → éxito con `intentos: 2`, y la segunda llamada recibe `erroresPrevios` con el `campo` y el `motivo` del primero;
  - tres inválidos → señal `documento_no_extraible` con `REGLA_NO_EXTRAIBLE`, `adjunto` y `ultimoError`, un `registrarExtraccion` con `estado: "no_extraible"` y ningún dato devuelto al modelo; nunca un cuarto intento;
  - `conflictos: ["salario"]` → no extraíble sin reintentar;
  - tres intentos sin respuesta (`tiempo_agotado`) → `falla_transitoria_persistente` con `intentos: 3`;
  - un nulo nunca cuenta como error (vuelve a cubrir US2);
  - el mismo contenido en otro adjunto reutiliza la extracción del core sin llamar al subagente (FR-018);
  - un log `intento_extraccion` por intento, con número, resultado y duración
- [X] T037 [P] [US4] Escribir en rojo pruebas en `src/agente/extraccion.test.ts`: con `erroresPrevios`, el prompt incluye `<errores_intento_anterior>` con cada `campo: motivo`; sin errores, no lo incluye
- [X] T038 [P] [US4] Escribir en rojo una prueba en `src/agente/agente.test.ts`: una conversación cuyo adaptador deja `documento_no_extraible` termina como escalada con el aviso y el evento `escalamiento` con `adjunto` en `valores`

### Implementation for User Story 4

- [X] T039 [US4] Implementar en `src/agente/extraccion.ts` el bloque `<errores_intento_anterior>` y la función `extraerConIntentos(documento, ejecutarSubagente, hoy)`, que repite hasta `MAX_INTENTOS_EXTRACCION` y devuelve el resultado o el motivo del fallo, hasta poner en verde T037
- [X] T040 [US4] Usar `extraerConIntentos` en `extraer_documento` de `src/agente/adaptador.ts`, con la reutilización por huella antes de llamar al subagente, las señales de no extraíble y de falla transitoria y el log por intento, hasta poner en verde T036 y T038

**Checkpoint**: la extracción es acotada y escala ante la duda.

---

## Phase 7: User Story 5 - Marcar lo que la política no cubre (Priority: P2)

**Goal**: moneda extranjera, tipo no soportado y adjunto no soportado escalan por código con la Regla 5.

**Independent Test**: con el subagente falso, un certificado en USD y un `tipo: "otro"` escalan con `caso_no_cubierto` y su causa, sin certificado ni extracto. Un adjunto no soportado escala sin llamar al subagente.

### Tests for User Story 5 ⚠️

- [X] T041 [P] [US5] Escribir en rojo pruebas en `src/agente/adaptador.test.ts`: certificado con fragmento de moneda "USD 1.200" → señal `caso_no_cubierto`, causa `moneda_extranjera`, `REGLA_NO_CUBIERTO`, `herramienta: "extraer_documento"` y `adjunto`, y registro `no_cubierto` en el core; `tipo: "otro"` → causa `documento_no_soportado`; adjunto con `soportado: false` → señal `documento_no_soportado` sin llamar al subagente ni al core
- [X] T042 [P] [US5] Escribir en rojo una prueba en `src/agente/control-identidad.test.ts`: tras la señal de caso no cubierto, cualquier herramienta posterior, incluida `extraer_documento`, se deniega por conversación escalada

### Implementation for User Story 5

- [X] T043 [US5] Implementar en `extraer_documento` de `src/agente/adaptador.ts` el paso 2 (adjunto no soportado) y el efecto `no_cubierto` con `dejarSenal`, hasta poner en verde T041 y T042

**Checkpoint**: la Regla 5 se decide por código también desde el contenido del documento.

---

## Phase 8: User Story 6 - Documentos ficticios de prueba (Priority: P3)

**Goal**: los cinco documentos de FR-019 y tres casos de demo que los usan.

**Independent Test**: los documentos existen, cumplen la convención ficticia, el guardián los acepta y un subagente falso que devuelve los valores esperados pasa la validación contra ellos.

- [X] T044 [P] [US6] Crear `casos/extraccion-certificado/certificado-completo.md`: certificado ficticio de Industrias Imaginarias del Valle S.A.S. para Ana Pérez Ficticia, con el NIT y la identificación de `casos/demo-consulta/certificado-laboral.md`, cargo analista de operaciones, ingreso el 1 de febrero de 2022, salario básico mensual de $3.800.000 COP en una línea propia y correo `.example`
- [X] T045 [P] [US6] Crear `casos/extraccion-sin-salario/certificado-sin-salario.md`: el mismo empleador, solicitante, cargo y fecha de ingreso, sin ninguna cifra de salario
- [X] T046 [P] [US6] Crear `casos/extraccion-extractos/extracto-2026-07.md`, `extracto-2026-08.md` y `extracto-2026-09.md`: titular Ana Pérez Ficticia, una misma cuenta de ahorros con número `000…` (siguiendo docs/datos-ficticios.md), periodos de mes completo consecutivos, montos en COP, un abono "Nómina Industrias Imaginarias" de $3.800.000 por mes y de 3 a 5 cargos
- [X] T047 [US6] Crear `caso.json` en las tres carpetas: los tres pasos de identificación de `casos/identidad-unico/caso.json`, luego el adjunto o los adjuntos, y en `extraccion-extractos` un mensaje final "¿Qué datos tienes de mis extractos?"
- [X] T048 [US6] Escribir en `src/compartido/extraccion.test.ts` una prueba que lea los cinco documentos y, con las salidas esperadas escritas en la prueba, compruebe que `validarSalida` las acepta, que el certificado sin salario da `faltantes: ["salario"]` y que los tres extractos comparten titular y moneda; y en `src/chat/casos.test.ts` que los tres `caso.json` cargan con `cargarCaso`

**Checkpoint**: todas las historias funcionan y hay demo reproducible.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T049 [P] Actualizar el mapa de `CLAUDE.md`: extracción en `src/agente/extraccion.ts`, validación en `src/compartido/extraccion.ts` y política de documentos en `src/politica/documentos.ts`, con el #10
- [X] T050 [P] Actualizar la ayuda de `src/chat/comandos.ts` y, si existe, el README: `/pegar` envía un documento «texto pegado», y cada documento se numera
- [X] T051 Comprobar con `grep` que `3`, `"COP"`, `certificado_laboral` y `extracto_bancario` como límites o listas solo aparecen en `src/politica/` y en los esquemas de `src/compartido/extraccion.ts`, y que ningún umbral de las reglas 2 y 3 aparece como literal
- [X] T052 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check`, y corregir hasta tener todo en verde
- [X] T053 Ejecutar los Escenarios 2 a 6 de [quickstart.md](quickstart.md) con el modelo real, anotar en este archivo el resultado y la duración del Escenario 4, y registrar en `DECISIONES.md` cualquier ajuste del límite de 120 s

### Resultado de la validación con el modelo real (2026-10-17, `claude-opus-5-5`)

| Escenario | Resultado |
|-----------|-----------|
| 2 · certificado completo | ✅ Cinco campos con su fragmento, un intento, sin eventos. 31 s el caso completo |
| 3 · sin salario | ✅ Salario nulo, un intento, `solicitud_de_dato` que pide un documento. Un salario escrito después no se acepta y el agente vuelve a pedir el documento |
| 4 · tres extractos | ✅ Tres adjuntos numerados, cada uno extraído al primer intento; `consultar_extracciones` en el turno siguiente. 75 s los siete turnos; ningún turno se acerca al límite de 120 s, que no cambia |
| 5.1 · sin identidad | ✅ El agente pide identificarse y no intenta extraer |
| 5.2 · en dólares | ✅ Escala por código con la Regla 5 y `moneda_extranjera` |
| 5.3 · desprendible | ✅ El modelo escala con `solicitar_analista` y `documento_no_soportado` antes de extraer (orden 4 → 5 → 1) |
| 6 · core desde Claude Code | ➖ Cubierto por las pruebas del servidor por un cliente MCP real (registro, revalidación, idempotencia, identidad) |

**Hallazgo corregido**: el primer intento con el modelo real falló en los 3 intentos con `error_sdk`: el CLI del Agent SDK rechaza el JSON Schema draft 2020-12 que Zod genera por defecto. La conversación escaló, sin usar ningún dato. El esquema ahora va en draft-07 y sin `$schema`, con una prueba que lo cubre, y el log `intento_extraccion` incluye el detalle del SDK.

### Correcciones de la revisión de `0aa8c2a`

Las revisiones de código y de cumplimiento bloquearon el PR por la Regla 5. Se corrigió:
- COP solo con expresiones inequívocas; «pesos» suelto ya no es COP, y los pesos de otros países y las formas en inglés del dólar son moneda extranjera.
- La moneda extranjera se busca en todo el documento, en el agente y en el core.
- La Regla 5 va antes que la Regla 1: revisión sin modelo al cerrar cada turno, y clasificación del tipo antes de bloquear una extracción sin identidad (FR-015a).
- Cada valor se contrasta con su cita: textos, fechas y sentido de los movimientos.
- «Hoy» es el día en Bogotá.

Cada corrección tiene sus pruebas: política, validación compartida, core, clasificador, adaptador, control de identidad y agente.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de la Fase 1 y bloquea todas las historias.
- **US1 (Fase 3)**: depende de la Fase 2.
- **US2, US3, US4 y US5 (Fases 4 a 7)**: dependen de US1, porque extienden `extraer_documento`. Entre ellas no dependen unas de otras, pero tocan el mismo archivo del adaptador, así que se hacen en orden.
- **US6 (Fase 8)**: solo depende de la Fase 2, salvo T048, que usa `validarSalida`.
- **Polish (Fase 9)**: depende de todas las historias.

### Within Each User Story

- Las pruebas se escriben primero y fallan.
- Core antes que servidor, servidor antes que cliente y cliente antes que adaptador.
- Cada historia termina con su checkpoint en verde.

### Parallel Opportunities

- Fase 2: T002, T005, T007 y T008 en paralelo; luego T003 y T004, T006 y T009.
- US1: T014 a T019 en paralelo; luego T020 → T021 → T022, y T023 en paralelo con ellos; T024 al final.
- US6: T044, T045 y T046 en paralelo, y en paralelo con US2 a US5.
- Polish: T049 y T050 en paralelo.

## Parallel Example: User Story 1

```text
T014 Pruebas del subagente en src/agente/extraccion.test.ts
T015 Pruebas del almacén en src/mcp/core-simulado.test.ts
T016 Pruebas del servidor en src/mcp/servidor.test.ts
T017 Pruebas del cliente en src/agente/cliente-core.test.ts
T018 Pruebas de extraer_documento en src/agente/adaptador.test.ts
T019 Pruebas del control en src/agente/control-identidad.test.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Fase 1 y Fase 2.
2. Fase 3 (US1).
3. **Parar y validar**: el Escenario 2 del quickstart con un certificado completo.

### Incremental Delivery

1. US1 → extracción validada y registrada.
2. US2 → faltantes sin inventar.
3. US3 → procedencia comprobada en el core y consultable.
4. US4 → reintentos acotados.
5. US5 → Regla 5 desde el contenido.
6. US6 → demo completa.

Cada paso deja las pruebas en verde y no rompe lo anterior.

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Hacer commit al cerrar cada fase, con `feat: … (#10)` o `test: … (#10)`.
- No integrar con pruebas en rojo (constitución).
- Las revisiones del #6 corren en `/ticket-abrir-pr`.
