---
description: "Lista de tareas: registro de la solicitud con procedencia"
---

# Tasks: Registro de la solicitud con procedencia

**Input**: documentos de diseño en `specs/011-registro-solicitud-procedencia/`

**Issue de origen**: [fabisahe29/CREDIAGIL#13](https://github.com/fabisahe29/CREDIAGIL/issues/13)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/politica.md](contracts/politica.md), [contracts/core-mcp.md](contracts/core-mcp.md), [contracts/agente.md](contracts/agente.md), [quickstart.md](quickstart.md)

**Tests**: la constitución los exige (política en los bordes, herramientas MCP con rechazo del lado del servidor) y la spec pide una prueba de bloqueo sin el modelo (FR-013). Cada módulo se escribe primero como prueba, en rojo, y después se implementa, en verde, con `node --test`. Ninguna prueba usa red ni el modelo real.

**Organization**: por historia de usuario.

- La Fase 2 deja la función de política y el contrato compartido. Lo usan todas las historias.
- US1 entrega el registro de punta a punta: core, servidor MCP, cliente, herramienta del agente, prompt y casos de la demo. Incluye la idempotencia, la solicitud abierta y el registro tras una señal de la Regla 3.
- US2 agrega la Regla 1 en sus dos capas: la revalidación del servidor y el hook, con la prueba de bloqueo sin modelo.
- US3 agrega el rechazo de datos sin procedencia, en el core y en el adaptador.

**Alcance mínimo**: US1 y US2 son el mínimo seguro: no se debe usar `registrar_solicitud` sin US2. US3 completa la garantía de procedencia (SC-003); sin ella el registro acepta citas sin comprobar.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US3)

## Path Conventions

- Código bajo `src/`: `src/politica/`, `src/compartido/`, `src/mcp/` y `src/agente/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): Ana Pérez Ficticia de `src/mcp/datos-ejemplo.ts`, documentos `000…`, correos `.example`. Un dato con forma real, como un documento de otra persona, se genera en tiempo de ejecución, nunca literal.
- **Montos como enteros de pesos**. Ninguna comparación ni cálculo con flotantes; el porcentaje de diferencia usa `BigInt`.
- **Ningún umbral como literal fuera de `src/politica/politica.ts`**: ni el 10%, ni el 30%, ni los $5.000.000. Este ticket no agrega constantes de política y `VERSION_POLITICA` no cambia.
- **Los logs y la auditoría no llevan fragmentos, nombres de documentos ni texto de la conversación**.
- Los errores son los del contrato `Respuesta` de `src/compartido/errores.ts`: `errorValidacion`, `errorNegocio`, `errorTransitorio`.

---

## Phase 1: Setup

**Purpose**: confirmar la línea base antes de tocar código.

- [x] T001 Ejecutar `npm test` y `npm run typecheck` sobre la rama y confirmar que están en verde antes de cambiar nada; si algo falla, anotarlo y no seguir (no es de esta feature).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la función de política y el contrato compartido que usan el core, el servidor, el cliente y el adaptador.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [x] T002 [P] Agregar a `src/politica/ingreso.test.ts` las pruebas de `calcularDiferenciaPorcentaje(declarado, verificado)` con la tabla de [contracts/politica.md](contracts/politica.md) (en rojo): `3.800.000/3.800.000 → 0`; `4.180.000/3.800.000 → 10`; `4.180.001/3.800.000 → 10`; `4.300.000/3.800.000 → 13,16`; `3.420.000/3.800.000 → 10`; `3.419.999/3.800.000 → 10`; `1/3 → 66,67`; `0/3.800.000 → 100`; `RangeError` con `-1`, `1,5`, `NaN` como declarado y con verificado `0`. Agregar la prueba de que `evaluarDiscrepancia` da `supera: false` para 4.180.000 y `supera: true` para 4.180.001 y que el porcentaje de ambos es `10`.
- [x] T003 Implementar `calcularDiferenciaPorcentaje` en `src/politica/ingreso.ts`: `|declarado − verificado| / verificado · 100`, dos decimales, mitad hacia arriba, con `BigInt` (`round(|d − v| · 10.000 / v) / 100`), como `calcularRelacionCuotaIngreso` de `src/politica/cuota.ts`. Entrada: `declarado` entero seguro `≥ 0` y `verificado` entero seguro `> 0`; cualquier otra cosa lanza `RangeError`. No cambia `evaluarDiscrepancia`, el umbral ni `VERSION_POLITICA` (depende de T002).
- [x] T004 [P] Escribir `src/compartido/solicitud.test.ts` (en rojo) para el contrato de [data-model.md](data-model.md):
  - `Procedencia` de dos clases: `afirmacion` con `fragmento` (1 a 300 caracteres) y `documento` con `adjunto` (≥ 1), `nombre` (1 a 255) y `fragmento` (1 a 300); un campo extra, un fragmento vacío o de 301 caracteres, un `adjunto` 0 y un `tipo` desconocido se rechazan.
  - `EntradaRegistroSolicitud`: `idSolicitante` con la forma `CLI-` y 10 dígitos; `monto` y `plazoMeses` enteros seguros `> 0`; `claveIdempotencia` de 1 a 64; `procedencia.monto` y `procedencia.plazoMeses` obligatorias; `procedencia.ingresoDeclarado` opcional; `.strict()`: `ingresoVerificado`, `discrepancias`, `datosExtraidos` e `ingresoDeclarado` como campos de entrada se rechazan.
  - `SolicitudRegistrada`: `idSolicitud` con la forma `SOL-000` y 7 dígitos, `estado` solo `en_estudio`, un dato sin `procedencia` no pasa, `datosExtraidos` solo con registros `extraido`, un estado con ingreso (`verificado`, `discrepancia`, `falta_declarado`) trae `ingresoVerificado` y los demás no, una `discrepancia` trae `diferenciaPorcentaje ≥ 0`.
  - `DESCRIPCION_REGISTRAR_SOLICITUD` contiene las frases clave de [contracts/core-mcp.md](contracts/core-mcp.md#texto-de-la-descripción) y no contiene el `30%`, el tope de monto ni el `10%`.
  - `contieneFragmento(textos, fragmento)`: coincide sin tildes ni mayúsculas y con espacios colapsados; no coincide con un fragmento ausente; con una lista vacía no coincide.
- [x] T005 Implementar `src/compartido/solicitud.ts` (depende de T004): esquemas Zod de `Procedencia`, `DatoRegistrado`, `EntradaRegistroSolicitud`, `VerificacionRegistrada` y `SolicitudRegistrada` reutilizando `esquemaRegistroExtraccion`, `esquemaIngresoVerificado`, `esquemaDiscrepancia` e `esquemaInconsistencia`; el texto `DESCRIPCION_REGISTRAR_SOLICITUD`; `contieneFragmento`, sin tocar los privados de `src/compartido/extraccion.ts`; y los tipos inferidos. Usa `LARGO_MAXIMO_FRAGMENTO` de `src/politica/documentos.ts` para el largo máximo del fragmento.

**Checkpoint**: la política y el contrato compartido pasan sus pruebas; `npm run typecheck` en verde.

---

## Phase 3: User Story 1 - Registrar una solicitud con la procedencia de cada dato (Priority: P1) 🎯 MVP

**Goal**: con un solicitante de identidad verificada, documentos extraídos y un ingreso verificado, se registra la solicitud y se consulta con todos sus datos y la procedencia de cada uno; repetir la misma clave no duplica; una discrepancia se guarda sin ocultarse, también tras la señal de la Regla 3.

**Independent Test**: [Escenario 1 y Escenario 2 del quickstart](quickstart.md): el core registra y `consultar_solicitud_registrada` devuelve cada dato con su procedencia; la repetición devuelve la misma solicitud; el modelo registra tras una discrepancia en el mismo turno.

### Tests for User Story 1 ⚠️

> Escribir primero y verificar que fallan.

- [x] T006 [US1] Agregar a `src/mcp/core-simulado.test.ts` las pruebas de `registrarSolicitud` y `consultarSolicitudRegistrada` (en rojo), con el core del #9 a #11 preparado con identidad verificada de Ana Pérez Ficticia, extracciones y una verificación de ingreso:
  - registro completo: trae solicitante verificado con documento enmascarado, `monto` y `plazoMeses` con su procedencia, `ingresoDeclarado` con el valor que guarda el core y la procedencia recibida, `verificacionIngreso` con el ingreso verificado y sus `usos`, `datosExtraidos` ordenados por adjunto; `idSolicitud` `SOL-0002000001` y luego `SOL-0002000002` en otro core; `estado` `en_estudio`;
  - con una discrepancia: queda guardada con los dos valores y `diferenciaPorcentaje` `13,16` para 4.300.000 contra 3.800.000, sin corregir; y con una inconsistencia que detiene, ésta queda en `inconsistencias`;
  - sin verificación de ingreso: se registra con `verificacionIngreso: null`; sin documentos: `datosExtraidos` vacío; la verificación de otra persona (cambió el verificado) se ignora y queda `null`;
  - `ingresoVerificado`, `discrepancias` o `datosExtraidos` enviados por la entrada no existen: ningún valor del core cambia por lo que envíe el llamador;
  - repetición con la misma `claveIdempotencia` en la misma conversación: devuelve la misma solicitud con `repetida: true`, sin segundo identificador, sin cambiar el contador y con `auditoria: null`;
  - otra clave con el mismo solicitante y la solicitud abierta: error de negocio `solicitud_abierta` con el identificador de la existente, sin guardar nada; las solicitudes de ejemplo del #7 (`SOL-0001000001`) no cuentan como abiertas;
  - cualquier extracción `no_cubierto` o `no_extraible` en la conversación: `documentos_no_aptos` con los números de adjunto y sin guardar nada;
  - `monto` y `plazoMeses` no enteros, `≤ 0` o fuera del rango seguro: `monto_invalido` y `plazo_invalido` con su campo;
  - `consultarSolicitudRegistrada` devuelve la solicitud de la conversación o `null`, es una copia (modificarla no cambia el core) y no ve la de otra conversación;
  - `consultarSolicitud` encuentra la solicitud registrada por su identificador, con `estado: "en_estudio"`.
- [x] T007 [P] [US1] Agregar a `src/mcp/servidor.test.ts` las pruebas por el cliente MCP en memoria: `registrar_solicitud` está anunciada sin `readOnlyHint`; `consultar_solicitud_registrada` con `readOnlyHint: true`; el registro feliz devuelve `solicitud` y `repetida`; un campo extra (`ingresoVerificado`, `discrepancias`, `datosExtraidos`) es `formato_invalido` con ese campo; la entrada sin `correlationId` es `formato_invalido` con el campo `correlationId`; la lectura de la conversación sin registro devuelve `null`. Y en `src/mcp/registro.test.ts`: una línea `auditoria_solicitud` por registro nuevo con `correlationId`, `regla`, `resultado: registrada`, `idSolicitud`, los enteros y `versionPolitica`; ninguna por una repetición; ningún log ni auditoría contiene fragmentos, nombres de documentos ni texto de la conversación.
- [x] T008 [P] [US1] Agregar a `src/agente/cliente-core.test.ts` las pruebas de `registrarSolicitud` y `consultarSolicitudRegistrada`: envían los argumentos y el `correlationId` al llamador; validan la respuesta con `esquemaSolicitudRegistrada`; una respuesta fuera de contrato es `respuesta_fuera_de_contrato`; una falla del llamador es el error transitorio `core_no_disponible`.
- [x] T009 [P] [US1] Agregar a `src/agente/adaptador.test.ts` las pruebas de la herramienta `registrar_solicitud` con un core falso: arma `procedencia` `afirmacion` con una cita sin `adjunto` y `documento` con el `nombre` del adjunto cuando hay `adjunto`; la `claveIdempotencia` enviada al core es la huella de `[idSolicitante, monto, plazoMeses]` y es la misma con otro adaptador creado de nuevo (otro turno); el modelo recibe solo `{ idSolicitud, estado, repetida }`; un error del core pasa tal cual; reintentos agotados dejan la señal `falla_transitoria_persistente`; con la señal `discrepancia_de_ingreso` o `inconsistencia_documental` la llamada **sí** llega al core y con `pide_persona`, `caso_no_cubierto` o `falla_transitoria_persistente` **no** llega y devuelve `transitorio_agotado`; ninguna otra herramienta cambia ese comportamiento (con la señal de la Regla 3, `consultar_solicitud` sigue cortando); no emite eventos de negocio; el modo de demostración la muestra con `alUsarHerramienta`.
- [x] T010 [P] [US1] Agregar a `src/agente/agente.test.ts` las pruebas del prompt: nombra `registrar_solicitud`, dice que el ingreso verificado, las discrepancias y los datos extraídos los toma el sistema, indica registrar tras una escalada por discrepancia o inconsistencia, y conserva «no apruebas ni rechazas»; y que `agente.ts` entrega al adaptador `mensajesSolicitante` con los turnos `solicitante` del historial más el mensaje nuevo (y no los del agente).

### Implementation for User Story 1

- [x] T011 [US1] Implementar en `src/mcp/core-simulado.ts` (depende de T005, T003 y T006): `registrarSolicitud` y `consultarSolicitudRegistrada` en la interfaz `Core` y en `crearCore`; el estado `registradas`, `registradaPorConversacion` y el contador desde `SOL-0002000001`; el tipo `AuditoriaRegistro`; la forma de la entrada con `esquemaEntradaRegistroSolicitud`; y los pasos 1, 2, 4, 5, 6 y 8 de [contracts/core-mcp.md](contracts/core-mcp.md#comportamiento-del-core): falla simulada, forma, repetición por clave, solicitud abierta, documentos aptos y guardar. Armar la `SolicitudRegistrada` solo con lo que ya sabe el core (identidad, `declarados`, `verificaciones`, `extracciones`), calculando `diferenciaPorcentaje` con `calcularDiferenciaPorcentaje`; guardar también la `Solicitud` resumida en `almacen`. Ningún paso escribe antes de que todos los que le preceden pasen.
- [x] T012 [US1] Registrar en `src/mcp/servidor.ts` (depende de T007 y T011) las herramientas `registrar_solicitud` (sin `readOnlyHint`, descripción `DESCRIPCION_REGISTRAR_SOLICITUD`, `ENTRADAS` estricta y esquema anunciado `z.looseObject` con campos opcionales) y `consultar_solicitud_registrada` (`readOnlyHint: true`). El log `herramienta` lleva `idSolicitud` si fue correcta y nunca montos, fragmentos ni nombres; emite `auditoria_solicitud` solo si la auditoría no es `null`.
- [x] T013 [P] [US1] Agregar a `src/agente/cliente-core.ts` (depende de T005 y T008) los métodos `registrarSolicitud(entrada, correlationId)` y `consultarSolicitudRegistrada(correlationId)` a `ClienteCore`, con sus esquemas de respuesta validados.
- [x] T014 [US1] Agregar a `src/agente/adaptador.ts` (depende de T009, T012 y T013): la herramienta `registrar_solicitud` con el esquema de [contracts/agente.md](contracts/agente.md#herramienta-del-adaptador) (`idSolicitante`, `monto`, `plazoMeses` y `origen.{monto,plazoMeses,ingresoDeclarado?}` con `Cita` `{ fragmento, adjunto? }`) y sin `readOnlyHint`; su manejador, que arma la `procedencia`, calcula la `claveIdempotencia` con `huella(JSON.stringify([idSolicitante, monto, plazoMeses]))`, llama al core con `llamarConReintentos` y devuelve `{ idSolicitud, estado, repetida }`; la constante exportada `MOTIVOS_QUE_ADMITEN_REGISTRO` (`discrepancia_de_ingreso` e `inconsistencia_documental`) y la excepción en `llamarConReintentos` para `registrar_solicitud`; la opción `mensajesSolicitante`; y la entrada de la herramienta en el mapa `herramientas`.
- [x] T015 [US1] Cambiar `src/agente/agente.ts` (depende de T010 y T014): agregar al `SYSTEM_PROMPT` las instrucciones de [contracts/agente.md](contracts/agente.md#prompt-agentets) sin tocar las existentes, y pasar a `crearAdaptador` la opción `mensajesSolicitante` con los textos de los turnos `solicitante` del historial más `mensaje`.
- [x] T016 [P] [US1] Crear los casos de la demo: `casos/registro-solicitud/caso.json` (los pasos del caso `ingreso-consistente`, que terminan con «Quiero registrar mi solicitud de 4 millones a 24 meses») y `casos/registro-discrepancia/caso.json` (los del caso `ingreso-inflado`, con el mismo mensaje final), cada uno con `nombre` y `descripcion`, y copiar los documentos ficticios del #11 a su carpeta. Comprobar con `npm test` que `src/chat/casos.test.ts` y las pruebas que recorren `casos/` siguen en verde.

**Checkpoint**: US1 funciona sola: el core registra con procedencia, repite sin duplicar, rechaza la solicitud abierta y deja registrar tras la Regla 3. Todavía no está listo para usarse: falta US2.

---

## Phase 4: User Story 2 - Ninguna solicitud se registra sin identidad verificada (Priority: P1)

**Goal**: el registro se bloquea sin identidad verificada, o con la de otra persona, en dos capas de código: el hook del Agent SDK y el servidor, sin importar lo que digan el prompt o el modelo.

**Independent Test**: [Escenarios 3 y 4 del quickstart](quickstart.md) y la tabla de [contracts/agente.md](contracts/agente.md#pruebas-fr-013-sin-el-modelo): una prueba intenta registrar sin identidad verificada, sin llamar al modelo, y comprueba el bloqueo y que no queda ninguna solicitud.

### Tests for User Story 2 ⚠️

- [x] T017 [US2] Agregar a `src/mcp/core-simulado.test.ts` y a `src/mcp/servidor.test.ts` (en rojo) el rechazo del lado del servidor (FR-016, SC-001): conversación sin identidad verificada, identidad verificada de otra persona, `idSolicitante` con formato válido pero que no existe en el core y el estado de identidad que el solicitante no tiene, todos con `identidad_no_verificada` (categoría negocio, no reintentable), sin guardar nada y con `consultarSolicitudRegistrada` en `null`; que la Regla 1 va **antes** de la repetición y de la solicitud abierta (una conversación sin identidad no se entera de solicitudes ajenas); que deja `auditoria_solicitud` con `resultado: rechazada`, `codigo: identidad_no_verificada` y sin fragmentos, y que lo hace por el cliente MCP en memoria aunque no haya hook.
- [x] T018 [P] [US2] Agregar a `src/agente/control-identidad.test.ts` las pruebas del hook para `mcp__originacion__registrar_solicitud`, **sin el modelo** (FR-013, SC-004) y con un core falso, una por fila de la tabla de [contracts/agente.md](contracts/agente.md#pruebas-fr-013-sin-el-modelo): identidad sin verificar (`deny`, evento `bloqueo_por_regla` con la Regla 1 y el siguiente paso, el core falso no recibió ningún registro); verificada de otra persona (`deny`, el motivo dice que es de otro solicitante); verificada y coincide (`{}`); el modelo afirma en su entrada que está verificada, con la identidad sin verificar en el core (`deny`); el core no responde tras los reintentos (`deny` y señal `falla_transitoria_persistente`); señal `discrepancia_de_ingreso` o `inconsistencia_documental` con identidad verificada (`{}`); señal `pide_persona`, `caso_no_cubierto` o `falla_transitoria_persistente` (`deny` por escalada); señal de la Regla 3 con identidad sin verificar (`deny` por identidad); `solicitar_analista` con señal de la Regla 3 (`deny` por escalada).

### Implementation for User Story 2

- [x] T019 [US2] Agregar el paso 3 (Regla 1) a `registrarSolicitud` en `src/mcp/core-simulado.ts` (depende de T017 y T011): `evaluarRegla1(identidad, idSolicitante)` sobre la identidad que el core guarda para la conversación; si no se permite, o el solicitante verificado no existe en el core, `identidad_no_verificada` y auditoría `rechazada`. Va después de la forma y antes de la repetición, y el solicitante que se guarda es siempre el verificado.
- [x] T020 [US2] Cambiar `src/agente/control-identidad.ts` (depende de T018 y T014): agregar `registrar_solicitud` a `HERRAMIENTAS_CON_IDENTIDAD` y actualizar el comentario que anunciaba el #13; y dejar pasar la herramienta `registrar_solicitud`, antes de la denegación por «conversación escalada», si el motivo de la señal está en `MOTIVOS_QUE_ADMITEN_REGISTRO` (importada de `src/agente/adaptador.ts`), para que después siga el flujo normal de consulta de identidad. El hook decide solo con lo que guarda el core; `tool_input.idSolicitante` solo se compara con el verificado.

**Checkpoint**: US1 y US2 juntas son el mínimo seguro. Sin identidad verificada no se guarda nada, aunque se salte el hook.

---

## Phase 5: User Story 3 - Un dato sin procedencia se rechaza (Priority: P2)

**Goal**: un dato sin procedencia, o con una que no se puede comprobar, se rechaza como error de validación no reintentable que nombra el dato, sin guardar nada, ni parcial.

**Independent Test**: [Escenario 6 del quickstart](quickstart.md): una cita que el solicitante no dijo se rechaza con `procedencia_invalida` y el campo `procedencia.monto`, y no queda ninguna solicitud.

### Tests for User Story 3 ⚠️

- [x] T021 [US3] Agregar a `src/mcp/core-simulado.test.ts` y a `src/mcp/servidor.test.ts` (en rojo) el paso 7 de [contracts/core-mcp.md](contracts/core-mcp.md#comportamiento-del-core): `procedencia_faltante` con campo `procedencia.monto`, `procedencia.plazoMeses` y `procedencia.ingresoDeclarado` cuando falta o es `null`; `procedencia_invalida` con un fragmento vacío o de 301 caracteres, un `tipo` desconocido o un campo extra; `procedencia_documento_desconocida` con `tipo: "documento"` cuyo `adjunto` o `nombre` no están entre las extracciones de la conversación; `ingreso_declarado_no_verificado` si el core no tiene un ingreso declarado y llega su procedencia; `procedencia_faltante` si el core tiene uno y falta su procedencia; el primer problema se informa en el orden `monto`, `plazoMeses`, `ingresoDeclarado`; cada rechazo es de categoría validación y no reintentable, deja `consultarSolicitudRegistrada` en `null`, el contador y las demás estructuras del core sin cambios (ni solicitud parcial) y una `auditoria_solicitud` `rechazada` con `codigo` y `campo`.
- [x] T022 [P] [US3] Agregar a `src/agente/adaptador.test.ts` las pruebas de la comprobación de citas (en rojo): una afirmación que no está literal en `mensajesSolicitante` es `procedencia_invalida` con el campo `procedencia.monto` (o el del dato) y **no llama al core**; una afirmación que sí está (con otras tildes, mayúsculas y espacios) pasa; una cita de un mensaje del agente no cuenta; un `adjunto` que no existe en los documentos de la conversación, o cuyo fragmento no está en su contenido, es `procedencia_invalida`; un `adjunto` no soportado también; un documento válido arma la procedencia con el `nombre` real del adjunto; el error nombra el dato y no repite el fragmento.

### Implementation for User Story 3

- [x] T023 [US3] Agregar el paso 7 (procedencia) a `registrarSolicitud` en `src/mcp/core-simulado.ts` (depende de T021 y T011): orden `monto`, `plazoMeses`, `ingresoDeclarado`; cada rechazo con su código y su campo `procedencia.<dato>` (por ejemplo `procedencia.monto`), sin escribir nada; la afirmación solo se comprueba de forma y el documento contra las extracciones de la conversación (adjunto y nombre).
- [x] T024 [US3] Agregar a `src/agente/adaptador.ts` (depende de T022 y T014) la comprobación de citas antes de llamar al core: una afirmación debe estar en `mensajesSolicitante` con `contieneFragmento`; un documento debe existir, ser soportado y su `contenido` contener el fragmento; un fallo devuelve `errorValidacion("procedencia_invalida", …, "procedencia.<dato>")` por el contrato MCP, sin llamar al core y sin repetir el fragmento en el mensaje ni en los logs.

**Checkpoint**: los tres criterios de seguridad del registro pasan: identidad (SC-001), procedencia (SC-002 y SC-003) y repetición (SC-005).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: cierre, documentación y validación de punta a punta.

- [x] T025 [P] Actualizar `CLAUDE.md` (mapa del repositorio): agregar el #13 a las filas de `src/mcp/` (registro de la solicitud con `registrar_solicitud` y `consultar_solicitud_registrada`), `src/compartido/` (contrato del registro con procedencia), `src/agente/` (herramienta `registrar_solicitud`, hook con la Regla 1) y `src/politica/` (diferencia porcentual), y la fila de `casos/` si lista los casos.
- [x] T026 Revisar que ningún archivo fuera de `src/politica/politica.ts` repita un umbral como literal: buscar `10`, `30` y `5.000.000`/`5_000_000` en lo agregado por esta feature; y que ningún log ni auditoría de `src/mcp/` y `src/agente/` incluya `fragmento`, `contenido` o `nombre` de documentos (`registrar(` con esos campos).
- [x] T027 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check`; todo en verde y sin `ANTHROPIC_API_KEY` (Escenario 1 del quickstart). Ninguna prueba omitida ni desactivada.
- [x] T028 Ejecutar los Escenarios 2 a 7 del [quickstart](quickstart.md) con el modelo real. **Resultado:** 2 ✅, 3 ✅ y 4 ✅ (sin registro en el log), 6 ⚠️ (registro con citas literales; el rechazo `procedencia_invalida` no se disparó), 7.2 ✅ (`solicitud_abierta`), 7.1 ⚠️ (el modelo no llamó al registro). **5 ❌ fallo conocido:** tras la discrepancia de ingreso el modelo no llama a `registrar_solicitud`; ver Riesgos en DECISIONES.md. Se cierra con el fallo registrado, sin resolverlo.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup y bloquea las historias.
- **US1 (Phase 3)**: depende de la Fase 2.
- **US2 (Phase 4)**: depende de US1: agrega el paso de la Regla 1 a la misma función del core y usa `MOTIVOS_QUE_ADMITEN_REGISTRO` del adaptador.
- **US3 (Phase 5)**: depende de US1 y puede ir en paralelo con US2 en archivos distintos, pero los pasos del core son del mismo archivo (T019 y T023): hacerlos uno tras otro.
- **Polish (Phase 6)**: depende de todas las historias.

### Orden entre tareas

- Cada prueba (en rojo) va antes de su implementación.
- T002 → T003; T004 → T005.
- T006 y T007 → T011 → T012; T008 → T013; T009 → T014; T010 → T015.
- T017 → T019; T018 → T020 (y T020 depende de T014 por `MOTIVOS_QUE_ADMITEN_REGISTRO`).
- T021 → T023; T022 → T024.
- T019 y T023 modifican el mismo archivo que T011: hacerlas después, no en paralelo.

### Parallel Opportunities

- Fase 2: T002 y T004 en paralelo (archivos distintos).
- US1: T007, T008, T009 y T010 en paralelo (archivos distintos); T013 y T016 en paralelo con lo demás una vez listas sus dependencias.
- US2: T018 en paralelo con T017.
- US3: T022 en paralelo con T021.
- Polish: T025 en paralelo con T026.

### Parallel Example: User Story 1

```text
# Pruebas de US1 en archivos distintos, en paralelo:
Task: "T007 pruebas del servidor y de la auditoría en src/mcp/servidor.test.ts y src/mcp/registro.test.ts"
Task: "T008 pruebas del cliente en src/agente/cliente-core.test.ts"
Task: "T009 pruebas del adaptador en src/agente/adaptador.test.ts"
Task: "T010 pruebas del prompt en src/agente/agente.test.ts"
```

---

## Implementation Strategy

### MVP primero (US1 + US2)

1. Fase 1 y Fase 2.
2. US1: el registro con procedencia, la idempotencia, la solicitud abierta y la Regla 3.
3. US2: la Regla 1 en el servidor y en el hook. **No usar la herramienta sin esta historia.**
4. **Parar y validar**: Escenarios 1 a 4 del quickstart.

### Entrega incremental

1. Fase 2 → contrato y política listos.
2. US1 → registro completo (Escenarios 2 y 5).
3. US2 → seguro por la Regla 1 (Escenarios 3 y 4).
4. US3 → la procedencia se comprueba (Escenarios 6 y 7).
5. Polish → documentación y la validación con el modelo real.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [Story] enlaza la tarea con su historia para la trazabilidad.
- Verificar que las pruebas fallan antes de implementar.
- Confirmar cada commit con el número de issue: `feat: … (#13)`.
- El escalamiento con entrega completa y la preaprobación son de otros tickets (#14 y #15): aquí solo se registra.
