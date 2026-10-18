---
description: "Lista de tareas: preaprobación automática dentro de la política"
---

# Tasks: Preaprobación automática dentro de la política

**Input**: documentos de diseño en `specs/012-preaprobacion-automatica-politica/`

**Issue de origen**: [fabisahe29/CREDIAGIL#14](https://github.com/fabisahe29/CREDIAGIL/issues/14)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/politica.md](contracts/politica.md), [contracts/core-mcp.md](contracts/core-mcp.md), [contracts/agente.md](contracts/agente.md), [quickstart.md](quickstart.md)

**Tests**: la constitución los exige (política en los bordes exactos, herramientas MCP con rechazo del lado del servidor) y la spec pide hooks con pruebas que no dependen del modelo (FR-013). Cada módulo se escribe primero como prueba, en rojo, y después se implementa, en verde, con `node --test`. Ninguna prueba usa red ni el modelo real.

**Organization**: por historia de usuario.

- La Fase 2 deja la política (`evaluarRegla2`), el contrato compartido y el cambio de esquema de la solicitud registrada. Lo usan todas las historias.
- US1 entrega la preaprobación de punta a punta de un caso simple: core, servidor MCP, cliente, herramienta del agente, evento de negocio, prompt y caso de demo.
- US2 agrega el bloqueo y el escalamiento: el hook de la Regla 2, la señal `preaprobacion_fuera_de_politica` y los casos de demo de monto alto y cuota alta.
- US3 agrega la precondición de la solicitud registrada y la descripción de la herramienta.

**Alcance mínimo**: US1 y US2 son el mínimo seguro: no se debe usar `preaprobar_credito` sin US2, porque compromete a la fintech. US3 completa el orden del flujo (registrar antes de preaprobar).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US3)

## Path Conventions

- Código bajo `src/`: `src/politica/`, `src/compartido/`, `src/mcp/` y `src/agente/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): Ana Pérez Ficticia de `src/mcp/datos-ejemplo.ts`, documentos `000…`, correos `.example`.
- **Montos como enteros de pesos**. La comparación con el 30% usa `BigInt` y enteros (`cuota · 100 ≤ 30 · ingreso`), nunca la relación redondeada del #12 ni flotantes.
- **El tope y el porcentaje viven solo en `src/politica/politica.ts`**: ningún otro archivo de producción repite `5_000_000`, `5.000.000` ni el 30 como porcentaje, y la descripción que lee el modelo no los da.
- **La decisión sale de la solicitud registrada**: nunca de un argumento del modelo; `preaprobar_credito` no tiene campos de entrada.
- **Los logs y la auditoría no llevan montos de la herramienta en su log, ni fragmentos, nombres de documentos ni contenido**.
- Los errores son los del contrato `Respuesta` de `src/compartido/errores.ts`: `errorValidacion`, `errorNegocio`, `errorTransitorio`.

---

## Phase 1: Setup

**Purpose**: confirmar la línea base antes de tocar código.

- [x] T001 Ejecutar `npm test` y `npm run typecheck` en la rama y confirmar que están en verde antes de cambiar nada; si algo falla, anotarlo y no seguir (no es de esta feature).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la política, el contrato compartido y el cambio de esquema de la solicitud registrada.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [x] T002 [P] Escribir `src/politica/preaprobacion.test.ts` (en rojo) con los casos de [contracts/politica.md](contracts/politica.md#casos-de-la-prueba): caso simple 4.000.000 a 24 meses con ingreso 3.800.000 (cuota 206.723, permitido); borde del monto, `5.000.000` permitido, `4.999.999` permitido y `5.000.001` con `monto_sobre_tope`; borde de la relación con `cuota · 100 = 30 · ingreso` exacto permitido, con ingreso − 1 `cuota_sobre_porcentaje` y con ingreso + 1 permitido (la prueba busca un par monto y plazo cuya cuota sea múltiplo de 3 y lo fija como dato); un caso con 30,004% que redondea a 30,00% y se bloquea; `cuota_no_calculable` con un monto o plazo fuera de rango; `ingreso_no_verificado` sin verificación y con los estados `inconsistencia`, `sin_ingreso`, `falta_declarado` y `no_cubierto`; `discrepancia_registrada` con el estado `discrepancia`; el orden (discrepancia y monto alto a la vez da `discrepancia_registrada`, monto alto y cuota alta a la vez da `monto_sobre_tope`); cada decisión trae `regla`, `valores` y `versionPolitica`.
- [x] T003 Implementar la política (depende de T002): en `src/politica/politica.ts` agregar `TOPE_MONTO_PREAPROBACION = 5_000_000` y `PORCENTAJE_MAXIMO_CUOTA_INGRESO = 30`, y subir `VERSION_POLITICA` de `2026-10-18.2` a `2026-10-18.3` (actualizar la cabecera, que anunciaba los umbrales para el #14); crear `src/politica/preaprobacion.ts` con `REGLA_2` («Regla 2 · preaprobación dentro de la política») y `evaluarRegla2({ monto, plazoMeses, verificacion })` pura, que evalúa en el orden verificación de ingreso (Regla 3), monto y cuota con `calcularCuota` de `src/politica/cuota.ts`, compara con `BigInt` y devuelve la `DecisionRegla2` de [data-model.md](data-model.md#decisionregla2) (`codigo` solo en un bloqueo: `ingreso_no_verificado`, `discrepancia_registrada`, `monto_sobre_tope`, `cuota_no_calculable` o `cuota_sobre_porcentaje`). Nunca lanza. Verificar que ningún test existente falla por el cambio de versión.
- [x] T004 [P] Escribir `src/compartido/preaprobacion.test.ts` (en rojo): el esquema de `Preaprobacion` (`preaprobadaEn` fecha ISO 8601 y `decision` con `permitido: true`; una decisión con `permitido: false` no pasa; un campo extra no pasa); el esquema de `DecisionRegla2` (`codigo` solo cuando `permitido` es falso, `valores` con textos o enteros); y `DESCRIPCION_PREAPROBAR_CREDITO` con las frases clave de [contracts/core-mcp.md](contracts/core-mcp.md#texto-de-la-descripción-fr-002) («Compromete a la fintech», solo con una solicitud registrada, `calcular_capacidad_pago` para explorar, no recibe montos ni cuotas ni ingresos, no ofrece alternativas), que no contiene `5.000.000`, `5_000_000`, `30 %` ni `30%`, y que nombra `preaprobar_credito` igual que la descripción de `calcular_capacidad_pago` del #12.
- [x] T005 Implementar `src/compartido/preaprobacion.ts` (depende de T004): esquemas Zod `esquemaDecisionRegla2` y `esquemaPreaprobacion`, los tipos inferidos, la lista de códigos de bloqueo y `DESCRIPCION_PREAPROBAR_CREDITO`. Reutiliza `esquemaResultadoRegistro` de `src/compartido/solicitud.ts` para la respuesta de la herramienta.
- [x] T006 [P] Agregar a `src/compartido/solicitud.test.ts` (en rojo) las pruebas del cambio de esquema: `estado` es `"en_estudio"` o `"preaprobada"`, y cualquier otro valor se rechaza; `preaprobacion` es `Preaprobacion` o `null`; `estado = preaprobada` si y solo si `preaprobacion` no es `null`; actualizar la solicitud de ejemplo del archivo para que lleve `preaprobacion: null`.
- [x] T007 Cambiar `src/compartido/solicitud.ts` (depende de T005 y T006): `esquemaSolicitudRegistrada.estado` pasa de `z.literal("en_estudio")` a `z.enum(["en_estudio", "preaprobada"])`, se agrega `preaprobacion: esquemaPreaprobacion.nullable()` y una regla de esquema que exige que `estado = preaprobada` si y solo si `preaprobacion` no es `null`.
- [x] T008 Adaptar el core a la solicitud nueva (depende de T007): en `src/mcp/datos-ejemplo.ts` agregar `"preaprobada"` a `EstadoSolicitud`; en `src/mcp/core-simulado.ts` agregar `"preaprobada"` al `estado` de `esquemaSolicitud` y crear cada solicitud registrada con `preaprobacion: null`. Ejecutar `npm test` y `npm run typecheck` y arreglar solo lo que el cambio de esquema rompa (por ejemplo ejemplos de solicitudes en pruebas del #13); el comportamiento no cambia.

**Checkpoint**: la política, el contrato compartido y el esquema de la solicitud pasan sus pruebas; `npm test` y `npm run typecheck` en verde.

---

## Phase 3: User Story 1 - Preaprobar automáticamente un caso simple que cumple la política (Priority: P1) 🎯 MVP

**Goal**: con una solicitud registrada de un solicitante con identidad verificada, de hasta $5.000.000, con cuota dentro del 30% del ingreso verificado y sin discrepancia, `preaprobar_credito` emite la preaprobación con la regla, los valores y el motivo; los límites exactos se preaprueban; repetir no duplica.

**Independent Test**: [Escenarios 1 y 2 del quickstart](quickstart.md): el core preaprueba y deja la solicitud en `preaprobada`; el chat muestra el evento `[PREAPROBACIÓN]` y cierra la conversación.

### Tests for User Story 1 ⚠️

> Escribir primero y verificar que fallan.

- [x] T009 [US1] Agregar a `src/mcp/core-simulado.test.ts` las pruebas de `preaprobarSolicitud` (en rojo), con el core preparado como en las pruebas del registro del #13 (identidad verificada de Ana, certificado y tres extractos, ingreso verificado, solicitud registrada):
  - caso simple de 4.000.000 a 24 meses con ingreso verificado de 3.800.000: devuelve la solicitud con `estado: "preaprobada"` y `preaprobacion` con `preaprobadaEn` (reloj del core) y una `decision` con `permitido: true`, `regla`, `motivo`, `valores` (monto, plazo, cuota 206.723, ingreso verificado, tope y porcentaje máximo) y `versionPolitica`; `repetida: false`;
  - borde del monto: una solicitud de exactamente 5.000.000 con una cuota dentro del 30% se preaprueba; borde de la relación: una solicitud cuya cuota es exactamente el 30% del ingreso verificado, de hasta 5.000.000, se preaprueba (la prueba arma un ingreso verificado exacto con `ejemploCertificado({ salario })` y `extractosTrimestre({ nomina })`);
  - repetir con la solicitud ya preaprobada devuelve la misma con `repetida: true`, sin otro efecto y con `auditoria: null`;
  - una solicitud preaprobada cuenta como abierta: registrar otra con otra clave da `solicitud_abierta` con el identificador de la existente;
  - `consultarSolicitudRegistrada` devuelve el estado y la preaprobación, y `consultarSolicitud` devuelve `estado: "preaprobada"` en el resumen;
  - la auditoría trae `resultado: "preaprobada"`, `regla`, `idSolicitud`, `idSolicitante`, `monto`, `plazoMeses`, `cuotaMensual`, `ingresoVerificado` (enteros) y `versionPolitica`, y no trae fragmentos ni nombres de documentos;
  - preaprobar no cambia la solicitud de otra conversación.
- [x] T010 [P] [US1] Agregar a `src/mcp/servidor.test.ts` las pruebas por el cliente MCP en memoria (un servidor por prueba, como en el #13): `preaprobar_credito` está anunciada sin `readOnlyHint` y con la descripción `DESCRIPCION_PREAPROBAR_CREDITO`; el esquema anunciado solo tiene `correlationId` (ni `monto`, ni `cuota`, ni `ingresoMensual`, ni `idSolicitud`); el caso feliz devuelve `solicitud` con `estado: "preaprobada"` y `repetida`; un campo extra (`monto`, `cuota`, `ingresoMensual` o `idSolicitud`) es `formato_invalido` con ese campo; sin `correlationId` es `formato_invalido` sobre `correlationId`; el log `herramienta` lleva `idSolicitud` y el resultado, y no lleva montos, cuotas ni ingresos; una repetición no deja otra `auditoria_preaprobacion`.
- [x] T011 [P] [US1] Agregar a `src/agente/cliente-core.test.ts` las pruebas de `preaprobarSolicitud`: contra el servidor real preaprueba tras identidad, registro y verificación; envía solo el `correlationId` al llamador; valida la respuesta con `esquemaResultadoRegistro`; una respuesta fuera de contrato es `respuesta_fuera_de_contrato`; una falla del llamador es `core_no_disponible` y un tiempo agotado `tiempo_agotado`.
- [x] T012 [P] [US1] Agregar a `src/agente/adaptador.test.ts` las pruebas de la herramienta `preaprobar_credito` con un core falso: su esquema de entrada está vacío; llama al core con el `correlationId` de la conversación; una preaprobación nueva emite el evento `preaprobacion` desde el código, con la regla `REGLA_2` y los valores de la decisión como textos o enteros, y una repetición no emite otro; al modelo le devuelve solo `{ idSolicitud, estado, repetida }`, sin la decisión ni la procedencia; un error del core pasa tal cual; reintentos agotados dejan la señal `falla_transitoria_persistente`; el modo de demostración la muestra con `alUsarHerramienta`; la lista de herramientas del adaptador incluye `preaprobar_credito` (actualizar la prueba que fija la lista).
- [x] T013 [P] [US1] Agregar a `src/agente/agente.test.ts` las pruebas del prompt: nombra `preaprobar_credito`, dice que compromete a la fintech, dice que no la use para explorar ni para decir cuánto pagaría (para eso `calcular_capacidad_pago`), dice que una preaprobación es solo la constancia y que la decisión definitiva la toma un analista, y no contiene `5.000.000` ni el porcentaje.

### Implementation for User Story 1

- [x] T014 [US1] Implementar en `src/mcp/core-simulado.ts` (depende de T003, T005, T008 y T009): `preaprobarSolicitud` en la interfaz `Core` y en `crearCore`, con los pasos de [contracts/core-mcp.md](contracts/core-mcp.md#comportamiento-del-core) en este orden, sin escribir nada hasta el último: falla simulada, forma (solo `correlationId`, `.strict()`), Regla 1 con `evaluarRegla1` (la identidad debe ser la dueña de la solicitud), solicitud registrada (`solicitud_no_registrada`), repetición, `evaluarRegla2` con el monto, el plazo y la verificación de la solicitud, y guardar: la solicitud pasa a `preaprobada` con `preaprobacion` (`preaprobadaEn` del reloj del core y la decisión), se actualiza el resumen del almacén y se devuelve con `repetida: false`. Un bloqueo devuelve un error de negocio con el código de la decisión (`identidad_no_verificada`, `monto_sobre_tope`, `cuota_sobre_porcentaje`, `discrepancia_registrada`, `ingreso_no_verificado` o `cuota_no_calculable`). Agregar el tipo `AuditoriaPreaprobacion` (`resultado` `preaprobada` o `bloqueada`, `regla`, `codigo` solo en un bloqueo, `idSolicitud`, `idSolicitante`, `monto`, `plazoMeses`, `cuotaMensual`, `ingresoVerificado` como enteros o `null`, `versionPolitica`), con auditoría en la preaprobación nueva y en los bloqueos de la Regla 1 y la Regla 2, y sin auditoría en una repetición, en la falta de solicitud ni en un error de forma. Cambiar la comprobación de «solicitud abierta» del registro para que cuente `en_estudio` y `preaprobada`. Los mensajes de error no llevan el tope ni el porcentaje.
- [x] T015 [US1] Registrar en `src/mcp/servidor.ts` (depende de T010 y T014) la herramienta `preaprobar_credito` (sin `readOnlyHint`, descripción `DESCRIPCION_PREAPROBAR_CREDITO`, `ENTRADAS` estricta con solo `correlationId`, esquema anunciado `z.looseObject`). El log `herramienta` lleva `idSolicitud` si fue correcta y nunca montos, cuotas ni ingresos; emite `auditoria_preaprobacion` solo si la auditoría no es `null`.
- [x] T016 [P] [US1] Agregar a `src/agente/cliente-core.ts` (depende de T011 y T005) `preaprobarSolicitud(correlationId)` a `ClienteCore`, con la respuesta validada por `esquemaResultadoRegistro`, y a `src/agente/core-no-simulado.ts` su entrada `preaprobarSolicitud: () => noSimulado("preaprobarSolicitud")`.
- [x] T017 [US1] Agregar a `src/agente/adaptador.ts` (depende de T012, T015 y T016) la herramienta `preaprobar_credito` con esquema vacío y la descripción compartida, y sin `readOnlyHint`; su manejador, que llama al core con `llamarConReintentos`, emite con `emitirEvento` el evento `preaprobacion` solo en una preaprobación nueva (regla `REGLA_2`, valores de la decisión) y devuelve `{ idSolicitud, estado, repetida }`; y su entrada en el mapa `herramientas`.
- [x] T018 [US1] Cambiar `src/agente/agente.ts` (depende de T013 y T017): agregar al `SYSTEM_PROMPT` las instrucciones de [contracts/agente.md](contracts/agente.md#prompt-agentets) sin tocar las existentes.
- [x] T019 [P] [US1] Crear `casos/preaprobacion-simple/caso.json` (los pasos del caso `registro-solicitud` del #13, que terminan pidiendo registrar 4.000.000 a 24 meses y la preaprobación) con `nombre` y `descripcion`, y copiar los documentos ficticios de `casos/registro-solicitud/`. Agregar a `src/chat/casos.test.ts` el bloque de este caso y de los dos de la Fase 4, con las mismas comprobaciones del #13: carga sin errores, verifica primero la identidad, pide registrar y preaprobar, documentos idénticos a los del caso de origen y convención de datos ficticios.

**Checkpoint**: US1 funciona sola: el core preaprueba, repite sin duplicar y el chat muestra la preaprobación. Todavía no está listo para usarse: falta US2.

---

## Phase 4: User Story 2 - La preaprobación se bloquea fuera de la política y el agente escala (Priority: P1)

**Goal**: la preaprobación se bloquea por código, sin importar lo que digan el prompt o el modelo, cuando falta la identidad, el monto supera el tope, la cuota supera el 30% o hay una discrepancia, y el agente escala en lugar de insistir.

**Independent Test**: [Escenarios 3, 4 y 5 del quickstart](quickstart.md) y la tabla de [contracts/agente.md](contracts/agente.md#pruebas-fr-013-sin-el-modelo): una prueba intenta preaprobar cada caso fuera de política, sin llamar al modelo, y comprueba el bloqueo, la señal de escalamiento y que no queda preaprobación.

### Tests for User Story 2 ⚠️

- [x] T020 [US2] Agregar a `src/mcp/core-simulado.test.ts` los bloqueos de `preaprobarSolicitud` (en rojo, aunque T014 ya los implementa): sin identidad verificada y con la identidad de otra persona dan `identidad_no_verificada` con auditoría `bloqueada`; monto de 5.000.001 da `monto_sobre_tope`; cuota un peso de ingreso por encima del 30% da `cuota_sobre_porcentaje`; solicitud con discrepancia registrada da `discrepancia_registrada`; verificación `inconsistencia` o sin verificación da `ingreso_no_verificado`; una cuota no calculable da `cuota_no_calculable`; el orden (discrepancia antes que el monto, monto antes que la cuota, la Regla 1 antes que todo); cada error es de categoría negocio y no reintentable; un bloqueo deja la solicitud en `en_estudio` y sin `preaprobacion`, y la auditoría `bloqueada` trae el código y los enteros; un campo del modelo (`monto`, `cuota`, `ingresoMensual`) se rechaza y no cambia la decisión; los mensajes de error no traen `5.000.000` ni `30%`.
- [x] T021 [P] [US2] Agregar a `src/mcp/servidor.test.ts` el rechazo del lado del servidor, sin pasar por ningún hook (SC-001): `preaprobar_credito` sin identidad verificada es `identidad_no_verificada`; con una solicitud de monto alto es `monto_sobre_tope`; con una cuota alta es `cuota_sobre_porcentaje`; cada bloqueo deja `auditoria_preaprobacion` con `resultado: bloqueada` y el código, sin montos en el log de la herramienta, y la consulta de la solicitud la muestra en `en_estudio`.
- [x] T022 [P] [US2] Escribir `src/agente/control-preaprobacion.test.ts` (en rojo, sin el modelo) con un core falso y una entrada de hook para `mcp__originacion__preaprobar_credito`, una por fila de la tabla de [contracts/agente.md](contracts/agente.md#pruebas-fr-013-sin-el-modelo): solicitud de 4.000.000 a 24 meses con ingreso verificado de 3.800.000 pasa (`{}`); monto de 5.000.000 con cuota dentro del 30% pasa; monto de 5.000.001 es `deny` con la señal `preaprobacion_fuera_de_politica` y el código `monto_sobre_tope`; cuota exactamente al 30% pasa; cuota un peso de ingreso por encima del 30% es `deny` con `cuota_sobre_porcentaje`; verificación `discrepancia` es `deny` con `discrepancia_registrada`; `inconsistencia`, `sin_ingreso`, `falta_declarado` o sin verificación son `deny` con `ingreso_no_verificado`; sin solicitud registrada es `deny` sin señal y con «regístrala antes de preaprobar»; si el modelo envía monto, cuota o ingreso en la entrada se ignoran; si el core no responde tras los reintentos es `deny` y señal `falla_transitoria_persistente`; otra herramienta pasa sin consultar al core; un evento que no es `PreToolUse` pasa; un bloqueo emite `bloqueo_por_regla` con la Regla 2 y los valores, y no emite `preaprobacion`.
- [x] T023 [P] [US2] Agregar a `src/agente/adaptador.test.ts` las pruebas de la señal: cuando el core rechaza con un código de la Regla 2 (`monto_sobre_tope`, `cuota_sobre_porcentaje`, `discrepancia_registrada`, `ingreso_no_verificado` o `cuota_no_calculable`) el adaptador deja la señal `preaprobacion_fuera_de_politica` con la regla `REGLA_2`, la herramienta `preaprobar_credito` y el `codigo`, y devuelve el error; no emite el evento `preaprobacion`; `solicitud_no_registrada` e `identidad_no_verificada` no dejan esa señal; `ORDEN_REGLA` da 2 al motivo nuevo y la señal de la Regla 2 no reemplaza a una de las reglas 4, 5, 1 o 3, pero cada una de ellas la reemplaza a ella.
- [x] T024 [P] [US2] Agregar a `src/agente/agente.test.ts` las pruebas del escalamiento: una señal `preaprobacion_fuera_de_politica` escala con el aviso «Tu solicitud no cumple las condiciones para una preaprobación automática. Pasa a un analista, que te contactará.», con la regla `REGLA_2` y un evento `escalamiento`; `revisarRegla5AlCerrarTurno` deja que una señal de la Regla 5 reemplace a una de la Regla 2; el prompt dice que ante un rechazo no se insiste, no se intenta con otros datos y no se ofrece un monto ni un plazo alternativo, y que si falta registrar la solicitud se registra y se vuelve a intentar una vez.
- [x] T025 [P] [US2] Agregar a `src/agente/control-identidad.test.ts`: `HERRAMIENTAS_CON_IDENTIDAD` incluye `preaprobar_credito`; con la identidad sin verificar el hook deniega `preaprobar_credito` con el evento `bloqueo_por_regla` de la Regla 1 y el siguiente paso de identificarse, sin señal de la Regla 2; la excepción de la Regla 3 del #13 sigue siendo solo del registro: con una señal de la Regla 3 `preaprobar_credito` se deniega por escalada (actualizar la prueba que fija la lista).

### Implementation for User Story 2

- [x] T026 [US2] Cambiar `src/agente/adaptador.ts` (depende de T023): agregar `preaprobacion_fuera_de_politica` a `SenalEscalamiento["motivo"]` y el campo `codigo?: string`; que el tipo de `ORDEN_REGLA` admita la Regla 2 y asignarle 2 al motivo nuevo; y en el manejador de `preaprobar_credito`, dejar esa señal cuando el core rechaza con un código de la Regla 2.
- [x] T027 [US2] Cambiar `src/agente/agente.ts` (depende de T024 y T026): agregar el motivo nuevo a `AVISOS` y a `REGLAS` (`REGLA_2` de `src/politica/preaprobacion.ts`), dejar que `revisarRegla5AlCerrarTurno` reemplace también una señal de la Regla 2, y completar el prompt con las instrucciones del bloqueo.
- [x] T028 [US2] Crear `src/agente/control-preaprobacion.ts` (depende de T022 y T026): el hook `PreToolUse` de [contracts/agente.md](contracts/agente.md#hook-nuevo-de-la-regla-2) que, solo para `preaprobar_credito`, consulta la solicitud registrada al core con reintentos acotados y decide con `evaluarRegla2`, nunca con `tool_input`; deniega con un motivo accionable sin el tope ni el porcentaje, deja la señal `preaprobacion_fuera_de_politica`, emite `bloqueo_por_regla` con la Regla 2 y registra el log; sin solicitud deniega sin señal; ante un core que no responde o una excepción, deniega y deja la señal de falla persistente.
- [x] T029 [US2] Cambiar `src/agente/control-identidad.ts` y `src/agente/agente.ts` (depende de T025 y T028): agregar `preaprobar_credito` a `HERRAMIENTAS_CON_IDENTIDAD` y registrar el hook nuevo junto al de identidad en `hooks.PreToolUse` de las opciones del agente, con el mismo `matcher`, sin cambiar el de identidad.
- [x] T030 [P] [US2] Crear `casos/preaprobacion-monto-alto/caso.json` (los pasos de `preaprobacion-simple`, pero pidiendo registrar 6.000.000) y `casos/preaprobacion-cuota-alta/caso.json` (4.500.000 a 3 meses, con ingreso verificado de 3.800.000), cada uno con `nombre` y `descripcion`, y copiar los documentos ficticios de `casos/registro-solicitud/`. Comprobar con `npm test` que el bloque de `src/chat/casos.test.ts` de T019 los cubre.

**Checkpoint**: US1 y US2 juntas son el mínimo seguro. Fuera de la política no se preaprueba, aunque se salte el hook.

---

## Phase 5: User Story 3 - Solo se preaprueba una solicitud registrada y el modelo distingue simular de preaprobar (Priority: P2)

**Goal**: la preaprobación solo opera sobre una solicitud registrada, y su descripción deja claro que compromete a la fintech y cuándo corresponde frente a la simulación.

**Independent Test**: [Escenario 6 del quickstart](quickstart.md): sin solicitud registrada se rechaza y no queda preaprobación; y la descripción de la herramienta se revisa en las pruebas del contrato compartido.

### Tests for User Story 3 ⚠️

- [x] T031 [US3] Agregar a `src/mcp/core-simulado.test.ts`, `src/mcp/servidor.test.ts` y `src/agente/adaptador.test.ts` las pruebas de la precondición: en una conversación con identidad verificada y sin solicitud registrada, `preaprobarSolicitud` da `solicitud_no_registrada` (negocio, no reintentable), sin auditoría de la Regla 2 y sin guardar nada; por el cliente MCP en memoria devuelve el mismo error; el adaptador pasa el error al modelo sin dejar señal de escalamiento; y una conversación nueva de otro solicitante no ve la preaprobación de otra.
- [x] T032 [P] [US3] Agregar a `src/compartido/preaprobacion.test.ts` y `src/compartido/capacidad-pago.test.ts` la coherencia entre las dos descripciones: la de `calcular_capacidad_pago` sigue diciendo que no reemplaza a `preaprobar_credito` y esa herramienta existe con ese nombre en el servidor y en el adaptador; la de `preaprobar_credito` manda explorar con `calcular_capacidad_pago`; ninguna da el tope ni el porcentaje.

### Implementation for User Story 3

- [x] T033 [US3] Verificar y, si falta, completar la precondición en `src/mcp/core-simulado.ts`, `src/agente/control-preaprobacion.ts` y `src/agente/adaptador.ts` (depende de T031): el core devuelve `solicitud_no_registrada` antes de evaluar la Regla 2; el hook deniega sin señal y con «regístrala antes de preaprobar»; el adaptador no escala por ese error. Los tests de T031 y T032 deben pasar sin tocar el comportamiento de US1 y US2.

**Checkpoint**: los tres criterios del #14 pasan: la Regla 2 se aplica por código (SC-001, SC-002), solo sobre una solicitud registrada (SC-003) y con una sola preaprobación por solicitud (SC-006).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: cierre, documentación y validación de punta a punta.

- [x] T034 [P] Actualizar `CLAUDE.md` (mapa del repositorio): agregar el #14 a las filas de `src/politica/` (Regla 2 desde el #14, `preaprobacion.ts`), `src/agente/` (herramienta `preaprobar_credito` y hook de la Regla 2), `src/mcp/` (preaprobación desde el #14) y `src/compartido/` (contrato de la preaprobación), y la fila de `casos/` si lista los casos.
- [x] T035 Revisar que ningún archivo de producción fuera de `src/politica/politica.ts` repita `5_000_000`, `5.000.000` ni el 30 como porcentaje, que `DESCRIPCION_PREAPROBAR_CREDITO` y los mensajes de error no los den, y que ningún log ni auditoría de `src/mcp/` y `src/agente/` incluya montos de la herramienta en su log, fragmentos ni nombres de documentos.
- [x] T036 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check`; todo en verde y sin `ANTHROPIC_API_KEY` (Escenario 1 del quickstart). Ninguna prueba omitida ni desactivada. `format:check` ya reporta archivos de otras features por los saltos de línea de Windows: comprobar solo los archivos de esta feature.
- [x] T037 Ejecutar los Escenarios 2 a 6 del [quickstart](quickstart.md) con el modelo real y `ANTHROPIC_API_KEY` en la terminal: caso simple preaprobado, monto alto escalado, cuota alta escalada, sin identidad y sin solicitud registrada. Anotar el resultado de cada uno; si el modelo no llama a `preaprobar_credito` tras registrar, o insiste tras un bloqueo, ajustar la instrucción del prompt con su prueba o dejarlo anotado como riesgo. **Resultado:** 2 ✅, 3 ✅ (monto alto bloqueado), 4 ✅ (cuota 1.554.321 sobre el 30% de 3.800.000), 5 ✅ (pide identificarse, no llama a la herramienta), 6 ✅ (pide los datos, no preaprueba sin solicitud registrada). El modelo no llegó a llamar a `preaprobar_credito` sin solicitud: ese camino lo cubren las pruebas del hook.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup y bloquea las historias.
- **US1 (Phase 3)**: depende de la Fase 2.
- **US2 (Phase 4)**: depende de US1: agrega el hook y la señal sobre la herramienta del adaptador y el core que ya existen.
- **US3 (Phase 5)**: depende de US1 y US2: comprueba la precondición sobre lo ya construido.
- **Polish (Final Phase)**: depende de todas las historias.

### Orden entre tareas

- Cada prueba (en rojo) va antes de su implementación.
- T002 → T003; T004 → T005; T006 y T005 → T007 → T008.
- T009 → T014 → T015; T010 → T015; T011 → T016; T012 y T015 y T016 → T017; T013 y T017 → T018.
- T020 y T023 → T026 → T027; T022 y T026 → T028; T025 y T028 → T029.
- T014 implementa de una vez todos los pasos del core: los bloqueos de T020 y la precondición de T031 pasan en cuanto se escriben. Si prefieres rojo antes de verde, escribe T020 y T031 antes de T014.
- T014 y T017 modifican los mismos archivos que T026 y T033: hacerlas después, no en paralelo.

### Parallel Opportunities

- Fase 2: T002, T004 y T006 en paralelo (archivos distintos).
- US1: T010, T011, T012 y T013 en paralelo; T016 y T019 en paralelo con lo demás una vez listas sus dependencias.
- US2: T021, T022, T023, T024 y T025 en paralelo; T030 en paralelo con T028.
- US3: T032 en paralelo con T031.
- Polish: T034 en paralelo con T035.

### Parallel Example: User Story 1

```text
# Pruebas de US1 en archivos distintos, en paralelo:
Task: "T010 pruebas del servidor en src/mcp/servidor.test.ts"
Task: "T011 pruebas del cliente en src/agente/cliente-core.test.ts"
Task: "T012 pruebas del adaptador en src/agente/adaptador.test.ts"
Task: "T013 pruebas del prompt en src/agente/agente.test.ts"
```

---

## Implementation Strategy

### MVP primero (US1 + US2)

1. Fase 1 y Fase 2.
2. US1: la preaprobación de un caso simple, con idempotencia y el evento de negocio.
3. US2: el bloqueo por código y el escalamiento. **No usar la herramienta sin esta historia.**
4. **Parar y validar**: Escenarios 1 a 4 del quickstart.

### Entrega incremental

1. Fase 2 → política, contrato y esquema listos.
2. US1 → caso simple preaprobado (Escenario 2).
3. US2 → seguro por la Regla 2 (Escenarios 3, 4 y 5).
4. US3 → orden del flujo y descripción (Escenario 6).
5. Polish → documentación y la validación con el modelo real.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [Story] enlaza la tarea con su historia para la trazabilidad.
- Verificar que las pruebas fallan antes de implementar.
- Confirmar cada commit con el número de issue: `feat: … (#14)`.
- El escalamiento con entrega completa al analista es del #15: aquí el agente escala por el mecanismo existente y muestra el motivo.
