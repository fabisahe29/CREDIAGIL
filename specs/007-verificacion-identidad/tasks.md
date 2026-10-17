---

description: "Lista de tareas: identificación y verificación del solicitante"
---

# Tasks: Identificación y verificación del solicitante

**Input**: documentos de diseño en `specs/007-verificacion-identidad/`

**Issue de origen**: [fabisahe29/CREDIAGIL#9](https://github.com/fabisahe29/CREDIAGIL/issues/9)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/core-mcp.md](contracts/core-mcp.md), [contracts/agente.md](contracts/agente.md), [quickstart.md](quickstart.md)

**Tests**: la spec los **exige** (FR-018), y la constitución también (política en el borde exacto y herramientas MCP con rechazo del lado del servidor). Cada módulo se escribe primero como prueba, en rojo, y después se implementa, en verde, con `node --test`. Ninguna prueba depende de red ni del modelo real: el core, `query()` y el reloj se simulan o se inyectan.

**Organization**: por historia de usuario.
- La Fase 2 deja la política, los datos de ejemplo y el andamiaje del estado del core.
- US1 hace la búsqueda de punta a punta.
- US2 agrega la desambiguación por código.
- US3 hace la verificación con su límite de intentos.
- US4 agrega la consulta del estado y el control `PreToolUse`.
- US5 agrega casos de demostración.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US5)

## Path Conventions

- Código bajo `src/`: `src/politica/` (nuevo), `src/mcp/` y `src/agente/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).
- Casos de demostración en `casos/<nombre>/`.

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): documentos con prefijo `000`, identificadores `CLI-000…`, correos `.example` y nombres inventados.
- **La fecha de expedición nunca sale del core**: ni en respuestas, ni en mensajes de error, ni en logs, ni en la auditoría (FR-010, FR-015, SC-004). Cada prueba de servidor y de adaptador que toque la verificación comprueba que la fecha no aparece en la salida ni en los logs capturados.
- **El límite de intentos y la Regla 1 se toman de `src/politica/`**; ningún otro archivo repite el `3` como literal (regla de la zona MCP).
- **Los eventos y los escalamientos los decide el código**, nunca el modelo (R6).
- **Los cambios en `src/agente/` y `src/mcp/` son aditivos**: `consultar_solicitud` y el comportamiento del #7 y del #8 no cambian, y sus pruebas siguen en verde.
- Cada herramienta valida estricto en el manejador y responde con el contrato de errores del #7. Un campo extra, faltante o con el tipo equivocado responde `validacion` / `formato_invalido` con ese `campo`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Comprobar la línea base en la rama `9-identificacion-y-verificacion-del-solici`: `npm test`, `npm run typecheck` y `npm run format:check` en verde antes de tocar código. Anotar aquí el número de pruebas.
  - Resultado (2026-10-17): `npm test` 669/669 y `typecheck` en verde. `format:check` marca 48 archivos por el fin de línea CRLF de la copia local (`core.autocrlf=true`; índice en LF), como ya se anotó en el #8; los archivos de este ticket se revisan uno por uno.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: módulo de política, solicitantes de ejemplo y estado de identidad del core. Bloquea a todas las historias.

- [X] T002 [P] Prueba `src/politica/identidad.test.ts` (en rojo), según [data-model.md](data-model.md), «DecisionRegla1», y [research.md](research.md), R5:
  - `MAX_INTENTOS_VERIFICACION` vale 3, y `VERSION_POLITICA` es un string no vacío;
  - `evaluarRegla1({ verificada: true, … })` → `permitido: true`, `regla: "Regla 1 · identidad verificada antes de registrar"`, `valores: { identidad: "verificada" }`, `versionPolitica: VERSION_POLITICA` y un `motivo` no vacío;
  - `evaluarRegla1({ verificada: false, … })` → `permitido: false`, `valores: { identidad: "no verificada" }`;
  - `alcanzaLimite(fallidos)`, en el borde exacto: `alcanzaLimite(2) === false`, `alcanzaLimite(3) === true` y `alcanzaLimite(4) === true` (regla de tests: el borde y los valores vecinos).
- [X] T003 [P] Implementar `src/politica/politica.ts` (`VERSION_POLITICA`, `MAX_INTENTOS_VERIFICACION = 3`) y `src/politica/identidad.ts` (`evaluarRegla1`, `alcanzaLimite`, y los tipos `EstadoIdentidad` y `DecisionRegla1`). Funciones puras, sin E/S. Cabecera que remita a R5. T002 en verde.
- [X] T004 [P] Prueba en `src/mcp/datos-ejemplo.test.ts` (en rojo), según [data-model.md](data-model.md), «Solicitante» y «Datos de ejemplo (FR-017)»:
  - `SOLICITANTES_EJEMPLO` cumple: `idSolicitante` «`^CLI-000\d{7}$`, único»; `documento` «solo dígitos, 6 a 10, con prefijo `000`, único»; `fechaExpedicion` «`AAAA-MM-DD`, fecha de calendario válida, no futura»; `correo` «dominio `.example`»;
  - existen `ID_SOLICITANTE_UNICO` (Ana Pérez Ficticia, documento `0001234567`, el mismo de `SOL-0001000001`), `ID_HOMONIMO_1` y `ID_HOMONIMO_2` (los dos «Elena Martínez Inventada», con documentos `0002020202` y `0003030303` y **fechas de expedición distintas**);
  - `DOCUMENTO_SIN_COINCIDENCIAS` (`0009090909`) y `NOMBRE_SIN_COINCIDENCIAS` («Nadie Registrado Ficticio») no coinciden con ningún solicitante;
  - todo cumple la convención de [convencion-ficticia.ts](../../.claude/hooks/lib/convencion-ficticia.ts), igual que las pruebas existentes de `SOLICITUDES_EJEMPLO`.
- [X] T005 Agregar a `src/mcp/datos-ejemplo.ts`:
  - el tipo `Solicitante` (`idSolicitante`, `nombre`, `documento`, `fechaExpedicion`, `correo`);
  - `SOLICITANTES_EJEMPLO` y las constantes de T004.

  Las fechas de expedición quedan solo aquí; se eligen ficticias y pasadas. T004 en verde.
- [X] T006 Preparar el andamiaje de identidad en `src/mcp/core-simulado.ts`, sin herramientas todavía:
  - `OpcionesCore` suma `solicitantes` (por defecto `SOLICITANTES_EJEMPLO`) y `ahora: () => Date` (por defecto, el reloj real), inyectables en las pruebas;
  - estado interno: `Map<correlationId, EstadoIdentidad>` y `Map<\`${correlationId}|${idSolicitante}\`, { fallidos, bloqueada }>`;
  - esquemas Zod exportados `esquemaCoincidencia` (`idSolicitante`, `nombre`, `documentoEnmascarado`) y `esquemaEstadoIdentidad` (`correlationId` UUID, `verificada`, `idSolicitante: string | null`, `verificadaEn: ISO 8601 | null`), compartidos con el cliente del agente;
  - funciones puras exportadas `normalizarDocumento`, `normalizarNombre` y `enmascararDocumento`, con pruebas en `src/mcp/core-simulado.test.ts`:
    - documento «quitar `.`, espacios y `-`», válido con «6 a 10 dígitos»;
    - nombre «minúsculas, sin tildes (NFD), espacios colapsados y recortados», válido con «≥ 3 letras, solo letras y espacios»;
    - enmascarado «`*` por cada dígito salvo los 4 últimos» (`0001234567` → `******4567`).

**Checkpoint**: política, datos y normalización en verde; `consultar_solicitud` sin cambios.

---

## Phase 3: User Story 1 - Encontrar al solicitante en el core (Priority: P1) 🎯 MVP

**Goal**: `buscar_solicitante` por documento o por nombre, de punta a punta: core, servidor MCP, cliente y adaptador.

**Independent Test**: con los datos de ejemplo, buscar por el documento del solicitante único, por el nombre de los homónimos y por los valores sin coincidencias → 1, 2 y 0 coincidencias, sin error en ninguno de los tres casos.

- [X] T007 [P] [US1] Prueba de `buscarSolicitante(criterio, correlationId)` en `src/mcp/core-simulado.test.ts` (en rojo), según [contracts/core-mcp.md](contracts/core-mcp.md), «`buscar_solicitante`»:
  - documento del único → 1 coincidencia; con puntos, espacios y guiones (`000.123.4567`, `000 123-4567`) → la misma;
  - nombre de los homónimos → 2, ordenadas por `idSolicitante`; en mayúsculas y sin tildes (`ELENA MARTINEZ INVENTADA`) → las mismas;
  - `DOCUMENTO_SIN_COINCIDENCIAS` y `NOMBRE_SIN_COINCIDENCIAS` → `ok: true`, `coincidencias: []`;
  - ambos criterios o ninguno → `validacion`, `campo: "criterio"`;
  - documento con letras o con 5 u 11 dígitos tras normalizar → `campo: "documento"`;
  - nombre de 2 letras o con dígitos → `campo: "nombre"`;
  - ninguna coincidencia trae `fechaExpedicion` ni el documento completo;
  - con la falla simulada activa → `transitorio`, `core_no_disponible`.
- [X] T008 [US1] Implementar `buscarSolicitante` en `src/mcp/core-simulado.ts` y sumarlo a la interfaz `Core`. La comparación de nombre es por **igualdad del nombre completo normalizado** (R3). T007 en verde.
- [X] T009 [P] [US1] Prueba de la herramienta `buscar_solicitante` en `src/mcp/servidor.test.ts` (en rojo), con el cliente MCP en memoria que ya usan esas pruebas:
  - los casos de la tabla del contrato, incluido `isError`;
  - un campo extra → `validacion` con ese `campo`;
  - `correlationId` que no es UUID → `campo: "correlationId"`;
  - el log `herramienta` lleva `criterio` y `coincidencias` y **no** el valor buscado (capturar stderr).
- [X] T010 [US1] Registrar `buscar_solicitante` en `src/mcp/servidor.ts`:
  - esquema anunciado laxo, con `documento`, `nombre` y `correlationId` opcionales y descritos;
  - validación estricta en el manejador;
  - `outputSchema` con `coincidencias: z.array(esquemaCoincidencia)`;
  - la descripción para el modelo es la del contrato.

  Factorizar la validación de entrada para que `consultar_solicitud` y las herramientas nuevas compartan el patrón, sin cambiar las respuestas de `consultar_solicitud`. T009 en verde.
- [X] T011 [P] [US1] Prueba de `buscarSolicitante(criterio, correlationId)` en `src/agente/cliente-core.test.ts` (en rojo), con el `LlamadorMcp` falso: respuesta válida, respuesta fuera de contrato → `respuesta_fuera_de_contrato`, tiempo agotado → `tiempo_agotado`, y conexión cerrada.
- [X] T012 [US1] Implementar `buscarSolicitante` en `src/agente/cliente-core.ts`, validando con `esquemaRespuesta(z.object({ coincidencias: z.array(esquemaCoincidencia) }))`. T011 en verde.
- [X] T013 [P] [US1] Prueba en `src/agente/adaptador.test.ts` (en rojo):
  - la herramienta `buscar_solicitante` del adaptador llama al core con el `correlationId` de la conversación;
  - reintenta ante un transitorio y escala con `falla_transitoria_persistente` si se agotan los reintentos;
  - con 0 o 1 coincidencias no emite eventos;
  - el observador `alUsarHerramienta` recibe `buscar_solicitante`.
- [X] T014 [US1] Agregar `buscar_solicitante` a `src/agente/adaptador.ts`:
  - esquema para el modelo con `documento` y `nombre` opcionales (la regla «exactamente uno» la aplica el core);
  - anotación `readOnlyHint`;
  - descripción del contrato;
  - el manejador pasa por `llamarConReintentos` y se suma a `herramientas`.

  T013 en verde.

**Checkpoint**: desde Claude Code (`crediagil-core`), los pasos 1 a 3 del Escenario 2 del [quickstart](quickstart.md) funcionan.

---

## Phase 4: User Story 2 - Desambiguar sin adivinar (Priority: P1)

**Goal**: ante homónimos, el código pide el número de documento; una segunda búsqueda ambigua escala.

**Independent Test**: con un core falso que devuelve 2 coincidencias, la primera búsqueda emite `solicitud_de_dato` y no hay ninguna verificación; la segunda deja la señal `identidad_ambigua`, y `conversar` responde escalada.

- [X] T015 [P] [US2] Prueba en `src/agente/adaptador.test.ts` (en rojo), según [contracts/agente.md](contracts/agente.md), «Efectos deterministas del manejador»:
  - la 1.ª búsqueda con ≥ 2 coincidencias deja `busquedasAmbiguas === 1` y emite exactamente el evento `solicitud_de_dato` del contrato (`motivo: "varias_coincidencias"`, `dato: "número de documento de identidad"`, `regla: "Regla 1 · coincidencias sin desambiguar"`, `valores: { coincidencias: 2 }`);
  - la 2.ª búsqueda ambigua deja `estado.escalamiento.motivo === "identidad_ambigua"`, con `herramienta: "buscar_solicitante"` y `coincidencias` igual al número de coincidencias;
  - una búsqueda de 1 coincidencia reinicia el contador (ya se desambiguó), y una sin coincidencias no lo reinicia. Corregido tras la validación manual (T044): la versión original pedía no reiniciarlo, y eso escalaba por error cuando el modelo repetía la búsqueda por nombre.
- [X] T016 [US2] En `src/agente/adaptador.ts`:
  - `EstadoConversacion` suma `busquedasAmbiguas: number`, que `crearEstado` inicia en 0;
  - `SenalEscalamiento.motivo` suma `"identidad_ambigua"`, y `SenalEscalamiento` suma el campo opcional `coincidencias`;
  - el manejador de `buscar_solicitante` aplica la tabla del contrato.

  T015 en verde.
- [X] T017 [P] [US2] Prueba en `src/agente/agente.test.ts` (en rojo), con la `query()` falsa:
  - si el adaptador deja la señal `identidad_ambigua`, `conversar` devuelve `tipo: "escalada"`, con el aviso «No pude identificarte con certeza. Tu caso pasa a un analista, que te contactará.» y un evento `escalamiento` con la regla `Regla 1 · coincidencias sin desambiguar` y `valores.coincidencias`;
  - el `systemPrompt` contiene las instrucciones de identificación al inicio y «Si hay varias coincidencias, no elijas: pide el número de documento.» (R8);
  - **contador entre turnos** ([contracts/agente.md](contracts/agente.md), «Contador entre turnos»): con `busquedasAmbiguas: 1`, una sola búsqueda ambigua escala; el resultado devuelve `busquedasAmbiguas`; un intento del modelo que falla y se reintenta no suma;
  - en `src/chat/chat.test.ts`: el chat pasa a `conversar` el contador del turno anterior, y `/nueva` lo vuelve a 0.
- [X] T018 [US2] En `src/agente/agente.ts`:
  - `AVISOS` y `REGLAS` suman `identidad_ambigua`, y `escalar` copia `coincidencias` de la señal a `valores`;
  - `SYSTEM_PROMPT` suma las dos primeras instrucciones de [contracts/agente.md](contracts/agente.md), «System prompt»;
  - `OpcionesConversar` y `ResultadoConversacion` suman `busquedasAmbiguas`, y cada intento parte del valor recibido;
  - `src/chat/sesion.ts`: `Conversacion` suma `busquedasAmbiguas` (0 al crearla); `src/chat/chat.ts` lo pasa y lo actualiza en cada turno.

  T017 en verde.

**Checkpoint**: Escenario 4 del quickstart listo para validar con el modelo real.

---

## Phase 5: User Story 3 - Verificar la identidad con un dato adicional (Priority: P1)

**Goal**: `verificar_identidad` con la fecha de expedición, errores distinguibles, 3 intentos con bloqueo, auditoría sin la fecha y escalamiento.

**Independent Test**: con los datos de ejemplo:
- la fecha correcta → `verificada: true`;
- una fecha válida distinta → `dato_no_coincide`;
- una fecha mal formada → `validacion`;
- tres fallos → `verificacion_bloqueada`, aun con la fecha correcta después;
- el adaptador escala con `identidad_no_verificable`.

- [X] T019 [P] [US3] Prueba de `verificarIdentidad(idSolicitante, fechaExpedicion, idIntento, correlationId)` en `src/mcp/core-simulado.test.ts` (en rojo), con `ahora` fijo, en el orden de [research.md](research.md), R4:
  - `fechaExpedicion` `"2020-1-5"`, `"2020-13-40"`, `"2021-02-29"` y una fecha posterior a `ahora` → `validacion`, `campo: "fechaExpedicion"`, sin sumar intento;
  - `idSolicitante` sin el formato `^CLI-000\d{7}$` → `campo: "idSolicitante"`;
  - `CLI-0009999999` → `negocio`, `solicitante_inexistente`, sin sumar intento;
  - **borde de intentos**: 1.er y 2.º fallo → `dato_no_coincide`, con mensajes que dicen que quedan 2 y 1; 3.er fallo → `verificacion_bloqueada`; después, la fecha correcta → `verificacion_bloqueada`;
  - fecha correcta → `ok: true` con `identidad: { verificada: true, idSolicitante, verificadaEn }`; repetirla → la misma `verificadaEn` (FR-016); verificar al otro homónimo después → lo reemplaza;
  - los intentos y el bloqueo son por `(correlationId, idSolicitante)`: otro `correlationId` empieza en 0, y fallar con el homónimo 1 no afecta al homónimo 2;
  - ningún `mensaje` de error contiene la fecha guardada ni la presentada;
  - **idempotencia**: repetir el mismo `idIntento` tras un `dato_no_coincide` devuelve la misma respuesta sin sumar intento; tras un éxito, devuelve la misma respuesta sin auditar.
- [X] T020 [US3] Implementar `verificarIdentidad` en `src/mcp/core-simulado.ts`. Toma `alcanzaLimite` de `src/politica/identidad.ts`; ningún literal de intentos. Guarda la respuesta por `(correlationId, idIntento)` (data-model, «RespuestaPorIntento»). Devuelve, además de la respuesta, el `resultado` para la auditoría (`verificada`, `no_coincide`, `bloqueada`, `inexistente` o `formato_invalido`, con su `campo`), los `intentosFallidos` y si fue una repetición (verificación exitosa repetida o `idIntento` repetido), que no se audita. T019 en verde.
- [X] T021 [P] [US3] Prueba de la herramienta `verificar_identidad` en `src/mcp/servidor.test.ts` (en rojo):
  - cada fila de la tabla del contrato, con `isError`;
  - `idIntento` faltante o con más de 64 caracteres → `validacion`, `campo: "idIntento"`;
  - el registro `auditoria` (`regla: "Regla 1"`, `correlationId`, `idSolicitante`, `resultado`, `intentosFallidos`, `ts`) aparece en todos los casos, también en el 1 con `resultado: "formato_invalido"` y su `campo`. No aparece en una repetición exitosa ni con un `idIntento` repetido;
  - **ninguna línea de stderr ni de `structuredContent` contiene una fecha `AAAA-MM-DD`** del solicitante (SC-004).
- [X] T022 [US3] Registrar `verificar_identidad` en `src/mcp/servidor.ts`, con la descripción del contrato, la validación estricta, el `outputSchema` con `identidad: esquemaEstadoIdentidad` y el log `auditoria` de R9. T021 en verde.
- [X] T023 [P] [US3] Prueba de `verificarIdentidad` en `src/agente/cliente-core.test.ts` (en rojo): respuesta válida, error de negocio que pasa tal cual, fuera de contrato y tiempo agotado.
- [X] T024 [US3] Implementar `verificarIdentidad` en `src/agente/cliente-core.ts`. T023 en verde.
- [X] T025 [P] [US3] Prueba en `src/agente/adaptador.test.ts` (en rojo):
  - `verificar_identidad` pasa `idSolicitante`, `fechaExpedicion`, un `idIntento` y el `correlationId`;
  - los reintentos de una misma llamada repiten el mismo `idIntento`, y dos llamadas del modelo usan dos distintos (inyectar el generador de UUID);
  - `dato_no_coincide` y la verificación exitosa no emiten eventos;
  - `verificacion_bloqueada` deja `estado.escalamiento.motivo === "identidad_no_verificable"`, con `herramienta: "verificar_identidad"`;
  - los logs `llamada_core` capturados no contienen la fecha presentada.
- [X] T026 [US3] En `src/agente/adaptador.ts`: herramienta `verificar_identidad` (sin `readOnlyHint`), con la descripción del contrato, y `SenalEscalamiento.motivo` suma `"identidad_no_verificable"`. T025 en verde.
- [X] T027 [P] [US3] Prueba en `src/agente/agente.test.ts` (en rojo):
  - con la señal `identidad_no_verificable`, `conversar` escala con el aviso «No pude verificar tu identidad. Tu caso pasa a un analista, que te contactará.» y la regla `Regla 1 · 3 intentos fallidos de verificación`;
  - el `systemPrompt` contiene la instrucción de verificar con la fecha de expedición, no usar documentos antes de verificar y no revelar el dato correcto.
- [X] T028 [US3] En `src/agente/agente.ts`: `AVISOS` y `REGLAS` suman `identidad_no_verificable`, y `SYSTEM_PROMPT` suma la tercera instrucción del contrato. T027 en verde.

**Checkpoint**: pasos 4 a 9 del Escenario 2 del quickstart (salvo `consultar_identidad`) y Escenarios 3 y 5 listos para validar.

---

## Phase 6: User Story 4 - Estado de identidad confiable y consultable (Priority: P1)

**Goal**: `consultar_identidad` en el core y un control `PreToolUse` que bloquea, sin pasar por el modelo, las herramientas que exigen identidad.

**Independent Test**: el modelo "afirma" que hay identidad, pero `consultar_identidad` responde `verificada: false`. El control, con una herramienta de prueba en la lista, responde `deny` y emite `bloqueo_por_regla`. Con la identidad verificada, deja seguir.

- [X] T029 [P] [US4] Prueba de `consultarIdentidad(correlationId)` en `src/mcp/core-simulado.test.ts` y de la herramienta `consultar_identidad` en `src/mcp/servidor.test.ts` (en rojo):
  - una conversación desconocida → `verificada: false`, `idSolicitante: null`, `verificadaEn: null`;
  - tras una verificación → `verificada: true`, con el solicitante y la marca de tiempo;
  - otro `correlationId` → `verificada: false`;
  - `correlationId` inválido → `validacion`;
  - falla simulada → `transitorio`;
  - la consulta no cambia el estado.
- [X] T030 [US4] Implementar `consultarIdentidad` en `src/mcp/core-simulado.ts` y registrar `consultar_identidad` en `src/mcp/servidor.ts`, con la descripción del contrato y la anotación `readOnlyHint`. T029 en verde.
- [X] T031 [P] [US4] Prueba de `consultarIdentidad` en `src/agente/cliente-core.test.ts` (en rojo): válida, fuera de contrato y tiempo agotado.
- [X] T032 [US4] Implementar `consultarIdentidad` en `src/agente/cliente-core.ts`. T031 en verde. **No** se agrega como herramienta del adaptador (R6): comprobar en `adaptador.test.ts` que el servidor `originacion` no la expone.
- [X] T033 [P] [US4] Prueba `src/agente/control-identidad.test.ts` (en rojo), según [contracts/agente.md](contracts/agente.md), «Control de identidad». El callback se llama directamente, con un `PreToolUseHookInput` armado a mano y un core falso:
  - herramienta fuera de la lista, o evento distinto de `PreToolUse` → `{}`, sin consultar al core;
  - en la lista y verificada → `{}`;
  - en la lista y no verificada → `hookSpecificOutput.permissionDecision === "deny"`, con el motivo del contrato, y emite exactamente el `bloqueo_por_regla` del contrato, con `valores.herramienta`;
  - en la lista y `consultarIdentidad` con un error transitorio dos veces y después ok → reintenta y deja seguir;
  - con un error transitorio siempre → `deny`, `bloqueo_por_regla` y `estado.escalamiento.motivo === "falla_transitoria_persistente"`, con `herramienta: "consultar_identidad"`;
  - fuera de contrato → `deny` y `bloqueo_por_regla`, sin reintentar y sin escalar;
  - nunca lanza; `dormir` y `azar` se inyectan para no esperar;
  - `HERRAMIENTAS_CON_IDENTIDAD` está vacía hoy.
- [X] T034 [US4] Implementar `src/agente/control-identidad.ts`:
  - `HERRAMIENTAS_CON_IDENTIDAD`;
  - `crearControlIdentidad({ core, estado, herramientas, dormir, azar })`, que devuelve un `HookCallback` del SDK;
  - consulta con `conReintentos` de `src/agente/reintentos.ts`, decide con `evaluarRegla1` de `src/politica/identidad.ts` y emite con `emitirEvento`;
  - si se agotan los reintentos, deja la señal de escalamiento, igual que `llamarConReintentos` del adaptador;
  - registra `control_identidad` con `correlationId`, `herramienta` y `decision`.

  T033 en verde.
- [X] T035 [P] [US4] Prueba en `src/agente/agente.test.ts` (en rojo): las `Options` que recibe la `query()` falsa traen `hooks.PreToolUse`, con `matcher` `mcp__originacion__.*` y un callback, y sin identidad las pruebas existentes del #7 y del #8 siguen igual.
- [X] T036 [US4] En `src/agente/agente.ts`, crear el control con el core en uso y el estado de la conversación, y registrarlo en `options.hooks` de cada intento. T035 en verde.

**Checkpoint**: paso 8 del Escenario 2 del quickstart; `npm test` en verde.

---

## Phase 7: User Story 5 - Datos ficticios para todos los casos (Priority: P2)

**Goal**: además de los datos del core (T004–T005), casos de demostración que reproducen los casos de prueba 1 y 5 del enunciado y los homónimos.

**Independent Test**: `npm run chat -- --caso casos/<nombre>` carga cada caso sin error de formato.

Cada `caso.json` sigue el formato de `casos/demo-consulta/caso.json`: `nombre` (igual a la carpeta), `descripcion` y `pasos`, con pasos `{ "mensaje": … }`. Los datos pasan el guardián de datos ficticios y la prueba de casos del #8.

- [X] T037 [P] [US5] Crear `casos/identidad-unico/caso.json` (caso de prueba 1): el solicitante pide un crédito, da el documento de Ana Pérez Ficticia y la fecha de expedición correcta de `src/mcp/datos-ejemplo.ts`.
- [X] T038 [P] [US5] Crear `casos/identidad-homonimos/caso.json`: el solicitante da solo el nombre «Elena Martínez Inventada», después el documento del homónimo 1 y su fecha correcta.
- [X] T039 [P] [US5] Crear `casos/identidad-no-verificable/caso.json` (caso de prueba 5): documento de Ana Pérez Ficticia y tres fechas de expedición válidas pero incorrectas.
- [X] T040 [US5] Extender `src/chat/casos.test.ts` para que cargue y valide los tres casos nuevos, como ya hace con `casos/demo-consulta`.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T041 [P] Actualizar `CLAUDE.md`: en el mapa del repositorio, `src/politica/` pasa de «previsto, issue #7» a «módulo único de política (Regla 1 desde el #9)».
- [X] T042 [P] Revisar que ningún archivo fuera de `src/politica/` contenga el límite de intentos como literal, y que ningún umbral de las reglas 2 y 3 (`5_000_000`, `0.3`, `0.1`, `0.018`) aparezca en el código nuevo (regla de la zona de política; riesgo del plan).
- [X] T043 Comprobar que `npm test`, `npm run typecheck` y `npm run format:check` están en verde, **sin** `ANTHROPIC_API_KEY` definida (Escenario 1 del quickstart; SC-006). Anotar aquí el número de pruebas.
  - Resultado (2026-10-17): `npm test` 791/791 tras la corrección del contador (669 antes del ticket; 122 nuevas) y `typecheck` en verde, sin `ANTHROPIC_API_KEY`. Todos los archivos nuevos o modificados del #9 pasan Prettier; `format:check` sigue marcando los archivos con CRLF en la copia local (ver T001).
  - Desvío respecto del plan, ya reflejado en [contracts/agente.md](contracts/agente.md), «Contador entre turnos»: `conversar` crea un estado nuevo por turno, así que el contador de búsquedas ambiguas viaja entre turnos por `OpcionesConversar`/`ResultadoConversacion` y la `Conversacion` del chat (T017–T018).
  - Para no tocar cada doble de prueba al crecer `ClienteCore`, se agregó `src/agente/core-no-simulado.ts` (solo para pruebas), y `dejarSenal` del adaptador pasó a ser una función exportada que también usa el control de identidad.
- [X] T044 Validación manual, con confirmación del desarrollador:
  - Escenario 2 del [quickstart](quickstart.md) desde Claude Code;
  - Escenarios 3 a 6 con el modelo real y `ANTHROPIC_API_KEY` en la terminal, porque consumen tokens.

  Comprobar en `logs/chat-<fecha>.jsonl` que no hay fechas de expedición (SC-004). Anotar aquí los resultados.
  - Resultado (2026-10-17), conducido a mano por el desarrollador en PowerShell con el modelo real, 8 sesiones:
    - Escenario 3 (único): `000.123.4567` → una coincidencia con `******4567`; el agente pide la fecha de expedición y no se deja convencer de saltarse la verificación («no quiero verificar»).
    - Escenario 4 (homónimos): «Soy Elena Martínez Inventada» → `[SOLICITUD DE DATO]` con «Regla 1 · coincidencias sin desambiguar» y `coincidencias = 2`; con el documento del homónimo 1 y su fecha queda verificada. No se probó la segunda búsqueda ambigua con el modelo real (cubierta por pruebas).
    - Escenario 5 (no verificable, con `--demo`): «quedan 2» y «queda 1» sin revelar la fecha correcta; el 3.er fallo responde `verificacion_bloqueada`, aparece `[ESCALAMIENTO]` con «Regla 1 · 3 intentos fallidos de verificación» y la conversación se cierra. En el log: `auditoria` `no_coincide` 1 y 2, `bloqueada` 3 y el `escalamiento` con el mismo `correlationId`.
    - Escenario 6 y sin coincidencias: «Nadie Registrado Ficticio» → éxito vacío; el agente lo informa y ofrece responder preguntas generales sin identificar.
    - SC-004: 0 fechas de expedición (ni presentadas ni guardadas) en los 8 archivos de log.
    - Escenario 2 (Claude Code): no se ejecutó a mano; las tres herramientas quedan cubiertas por las pruebas del servidor por stdio.
    - Observaciones:
      - Una fecha imposible (`2020-13-40`) la descartó el propio modelo sin llamar al core, así que no hay auditoría `formato_invalido` en esa sesión; el camino del core está cubierto por pruebas.
      - Con `--demo` se ve que el modelo repite `buscar_solicitante` en cada turno (el historial solo lleva textos). Si repitiera una búsqueda **por nombre** después de desambiguar, el contador de búsquedas ambiguas escalaría por error. **Corregido**: una búsqueda con una sola coincidencia reinicia el contador (R6; prueba en `adaptador.test.ts`).
      - Sin herramienta de registro (#13), el agente dice que no puede radicar la solicitud: esperado.
- [X] T045 Commit convencional en `9-identificacion-y-verificacion-del-solici`, por ejemplo `feat: identificación y verificación del solicitante (#9)`. Antes:
  - `git status`, para confirmar que no entran `logs/`, ningún `.env` ni archivos temporales;
  - la búsqueda de tokens del quickstart del #3.
- [ ] T046 Con confirmación del desarrollador: `git push -u origin 9-identificacion-y-verificacion-del-solici` y `/ticket-abrir-pr 9`. Se espera que la revisión de cumplimiento dé la Regla 1 ✅ y las demás no aplicables. Cualquier regla incumplida o hallazgo alto bloquea el PR y se corrige antes.
  - Primera revisión (2026-10-17) sobre `d37d3a7`: ⛔ bloquea. Cumplimiento: Regla 1 ✅, reglas 2 y 3 ➖, reglas 4 y 5 ⛔ por una restricción crítica: el prompt pedía identificar «primero» sin precedencia para las reglas 4 y 5. Código: 0 críticos, 0 altos, 3 medios y 2 bajos. Registros en el issue: [código](https://github.com/fabisahe29/CREDIAGIL/issues/9#issuecomment-6241873596) y [cumplimiento](https://github.com/fabisahe29/CREDIAGIL/issues/9#issuecomment-6241879418).
  - Corregido en un commit nuevo, cada punto con su prueba (806 pruebas en verde):
    - **Crítico**: el prompt antepone las reglas 4 y 5 a la identificación, y una prueba fija el orden (DECISIONES.md, Decisión 6).
    - **Idempotencia**: el `idIntento` es por dato del turno, así que el reintento del turno del modelo ya no cuenta dos fallos.
    - **Homónimos**: dentro de un turno cuenta una sola búsqueda ambigua (`ambiguaEnTurno`).
    - **Cambio de solicitante**: el core invalida la verificación anterior y `evaluarRegla1` puede exigir el solicitante de la acción (Decisión 7).
  - Segunda revisión (2026-10-17) sobre `dea0951`: ⛔ bloquea. Cumplimiento: reglas 4 y 5 ⛔ (crítica): el prompt solo dice «pasa a un analista», pero nada escala de verdad. Código: 0 críticos, 0 altos, 3 medios y 2 bajos. Registros: [código](https://github.com/fabisahe29/CREDIAGIL/issues/9#issuecomment-6242186264) y [cumplimiento](https://github.com/fabisahe29/CREDIAGIL/issues/9#issuecomment-6242196308).
  - Corregido con la opción A, elegida por el desarrollador: FR-011b agregado a la spec y Decisión 6 de DECISIONES.md reescrita.
    - Herramienta `solicitar_analista` con motivo tipado; el código escala con las reglas 4 y 5, el evento y la auditoría.
    - El control niega cualquier herramienta en una conversación escalada.
    - El core guarda por `idIntento` solo los fallos.
    - El escalamiento por ambigüedad se decide al cerrar el turno, y `desambiguada` viaja entre turnos.
    - Prueba del orden inverso, nombre y después documento.
    - DECISIONES.md, Decisión 5, recompuesta.
  - Quedan pendientes los hallazgos bajos: la fecha «hoy» en UTC frente a Bogotá; los fallos sobre un solicitante ya verificado (el bloqueo convive con la verificación); `/nueva` reinicia el contador de intentos; y que el adaptador acepte verificar mientras la última búsqueda es ambigua. También quedan para el #10 y el #13 la lista vacía de herramientas protegidas y FR-011a por código.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de la Fase 1; bloquea a todas las historias.
- **US1 (Fase 3)**: depende de la Fase 2. Es el MVP.
- **US2 (Fase 4)**: depende de US1, porque usa el manejador de `buscar_solicitante`.
- **US3 (Fase 5)**: depende de la Fase 2. Su lado del core (T019–T024) es independiente de US1 y US2. El lado del agente (T025–T028) modifica `adaptador.ts` y `agente.ts` después de US2.
- **US4 (Fase 6)**: depende de US3, porque `consultar_identidad` refleja lo que deja la verificación.
- **US5 (Fase 7)**: depende de la Fase 2 (datos), y para validarse con el modelo real, de US1 a US3.
- **Polish (Fase 8)**: depende de todas las historias.

### Within Each User Story

Prueba en rojo → implementación en verde. Los archivos compartidos se modifican en secuencia entre historias:
- `core-simulado.ts`: T006 → T008 → T020 → T030;
- `servidor.ts`: T010 → T022 → T030;
- `cliente-core.ts`: T012 → T024 → T032;
- `adaptador.ts`: T014 → T016 → T026 → T032;
- `agente.ts`: T018 → T028 → T036.

### Parallel Opportunities

- **Fase 2**: T002/T003 (política) en paralelo con T004/T005 (datos).
- **Dentro de cada historia**: las pruebas marcadas [P] van en archivos distintos y se escriben juntas. Por ejemplo, en US1: T007, T009, T011 y T013.
- **US3, lado del core** (T019–T022): en paralelo con US2, que solo toca `src/agente/`.
- **US5** (T037–T039): en paralelo con cualquier historia, porque solo crea archivos en `casos/`.

---

## Parallel Example: Fase 2 y US1

```text
Task: "T002 identidad.test.ts → T003 politica.ts + identidad.ts"
Task: "T004 datos-ejemplo.test.ts → T005 datos-ejemplo.ts"
# Después de T006, en US1:
Task: "T007 core-simulado.test.ts (buscar)"
Task: "T009 servidor.test.ts (buscar_solicitante)"
Task: "T011 cliente-core.test.ts (buscarSolicitante)"
Task: "T013 adaptador.test.ts (buscar_solicitante)"
```

---

## Implementation Strategy

### MVP First (US1)

1. T001 → T002–T006: política, datos y normalización.
2. T007–T014: búsqueda de punta a punta.
3. **Parar y validar**: `npm test` en verde y, desde Claude Code, los pasos 1 a 3 del Escenario 2.

### Incremental Delivery

1. MVP: US1.
2. US2: homónimos sin adivinar (T015–T018).
3. US3: verificación, intentos, auditoría y escalamiento (T019–T028). Con esto, la Regla 1 ya se cumple en la conversación.
4. US4: estado consultable y control `PreToolUse` (T029–T036), listo para el #10 y el #13.
5. US5: casos de demostración (T037–T040).
6. Validación, commit, PR y cierre (T041–T046).
