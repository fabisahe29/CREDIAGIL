---
description: "Lista de tareas: escalamiento con criterio y handoff al analista"
---

# Tasks: Escalamiento con criterio y handoff al analista

**Input**: documentos de diseño en `specs/013-escalamiento-analista/`

**Issue de origen**: [fabisahe29/CREDIAGIL#15](https://github.com/fabisahe29/CREDIAGIL/issues/15)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/politica.md](contracts/politica.md), [contracts/core-mcp.md](contracts/core-mcp.md), [contracts/agente.md](contracts/agente.md), [quickstart.md](quickstart.md)

**Tests**: la constitución los exige (política en sus bordes, herramientas MCP con validación del lado del servidor, escenarios de petición de humano, cuota alta, ingreso inconsistente, moneda extranjera y datos faltantes). Cada módulo se escribe primero como prueba, en rojo, y después se implementa, en verde, con `node --test`. Ninguna prueba usa red ni el modelo real.

**Organization**: por historia de usuario.

- La Fase 2 deja la política (catálogos, causa, acción, regla), el contrato compartido y el movimiento de constantes a la política. Lo usan todas las historias.
- US1 entrega el resumen para el analista de punta a punta: core, servidor MCP, cliente, señales acumuladas, `solicitar_analista` con monto y plazo y la entrega al core al cerrar el turno.
- US2 agrega la Regla 4 por código antes del modelo y el caso de demostración de la petición de persona.
- US3 agrega la decisión explicable de la Regla 2 al resumen y verifica la causa de cada umbral, discrepancia y caso no cubierto.
- US4 fija con pruebas lo que no debe escalar y agrega la línea del prompt.
- US5 cambia los avisos, suma la causa y la entrega al evento y agrega la vista del resumen en `--demo`.

**Alcance mínimo**: US1 y US2 son el mínimo seguro: el resumen que recibe el analista y la Regla 4 sin depender del modelo. US3 completa las causas con su decisión explicable, US4 cierra el contrapeso (no escalar de más) y US5 la experiencia del solicitante.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US5)

## Path Conventions

- Código bajo `src/`: `src/politica/`, `src/compartido/`, `src/mcp/`, `src/agente/` y `src/chat/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Los casos de demostración van bajo `casos/<nombre>/caso.json`, con el formato de `casos/preaprobacion-monto-alto/caso.json` (`nombre`, `descripcion` y `pasos`).
- Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): Ana Pérez Ficticia de `src/mcp/datos-ejemplo.ts`, documentos `000…`, correos `.example`. Un dato con forma real se genera en la prueba, nunca se escribe literal.
- **Montos como enteros de pesos**. Ninguna comparación con un umbral usa flotantes.
- **El umbral de monto, el porcentaje de cuota y la tolerancia de ingreso viven solo en `src/politica/politica.ts`**: ningún archivo nuevo de producción repite `5_000_000`, `5.000.000`, el 30 ni el 10 como porcentaje, y ni la descripción de la herramienta ni el prompt los dan al modelo. Los **literales de umbral** que las pruebas comprueban que no aparecen son: `5.000.000`, `5_000_000`, `30 %`, `30%`, `10 %` y `10%`.
- **La causa, la acción y la regla salen de las funciones de `src/politica/escalamiento.ts`**: nunca de texto libre ni del modelo.
- **El resumen lo arma el core con su estado**: la entrada de `escalar_a_analista` no lleva el solicitante, los ingresos, los documentos ni las discrepancias.
- **Escalar nunca se rechaza por sustancia ni falla por la entrega**: un error de entrega deja `entrega: "pendiente"` y un log de error, y la conversación se escala igual.
- **Los logs y la auditoría no llevan nombres, montos extraídos, citas ni contenido**.
- Los errores son los del contrato `Respuesta` de `src/compartido/errores.ts`: `errorValidacion`, `errorNegocio`, `errorTransitorio`.

---

## Phase 1: Setup

**Purpose**: confirmar la línea base antes de tocar código.

- [x] T001 Ejecutar `npm test` y `npm run typecheck` en la rama `15-escalamiento-con-criterio-y-handoff-al` y confirmar que están en verde antes de cambiar nada; si algo falla, anotarlo y no seguir (no es de esta feature).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la política del escalamiento, el contrato compartido y el movimiento de constantes a la política.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [x] T002 [P] Escribir `src/politica/escalamiento.test.ts` (en rojo) con las pruebas de [contracts/politica.md](contracts/politica.md#las-combinaciones): cada fila de la tabla de causas de [R1](research.md#r1-dos-niveles-de-clasificación-la-causa-cerrada-y-el-motivo) y de la tabla de acciones de [R2](research.md#r2-la-acción-recomendada-sale-de-un-catálogo-cerrado-de-la-política) (los doce motivos, y `preaprobacion_fuera_de_politica` con cada uno de los cinco códigos de `CODIGOS_BLOQUEO` de `src/compartido/preaprobacion.ts`); una combinación inválida lanza (un `codigo` con un motivo distinto de `preaprobacion_fuera_de_politica`, y ese motivo sin `codigo`); `reglaDeEscalamiento` devuelve un texto no vacío para los doce motivos; `REGLA_4` es «Regla 4 · el solicitante pide hablar con una persona» y `REGLA_PIDE_PERSONA` es igual a `REGLA_4`; cada causa devuelta pertenece a `CAUSAS_ESCALAMIENTO` y cada acción a `ACCIONES_RECOMENDADAS`; los catálogos tienen exactamente los valores de [data-model.md](data-model.md#catálogos-de-política).
- [x] T003 Implementar `src/politica/escalamiento.ts` (depende de T002): `CAUSAS_ESCALAMIENTO` (`peticion_de_persona`, `monto_sobre_umbral`, `cuota_sobre_porcentaje`, `discrepancia_de_ingreso`, `caso_no_cubierto`), `MOTIVOS_ESCALAMIENTO` (los doce: `pide_persona`, `caso_no_cubierto`, `identidad_ambigua`, `identidad_no_verificable`, `discrepancia_de_ingreso`, `inconsistencia_documental`, `documento_no_extraible`, `preaprobacion_fuera_de_politica`, `falla_transitoria_persistente`, `falla_del_agente`, `limite_de_turnos`, `respuesta_incompleta`), `ACCIONES_RECOMENDADAS` (las siete de [R2](research.md#r2-la-acción-recomendada-sale-de-un-catálogo-cerrado-de-la-política)), `PENDIENTES` (`identidad`, `monto`, `plazo`, `ingreso_verificado`, `documentos`), `REGLA_4`, `REGLA_PIDE_PERSONA`, `reglaDeEscalamiento(motivo)`, `causaDeEscalamiento({ motivo, codigo? })` y `accionRecomendada({ motivo, codigo? })`, puras, y `ORDEN_REGLA` (la tabla motivo → número de regla que hoy vive en `src/agente/adaptador.ts`). Los textos de regla de los motivos técnicos y de identidad se mueven aquí con los mismos valores que hoy tienen `REGLAS` de `agente.ts` y las constantes de `adaptador.ts`; importar `REGLA_2`, `REGLA_3` y `REGLA_5` de sus módulos. Subir `VERSION_POLITICA` en `src/politica/politica.ts` de `2026-10-18.3` a `2026-10-18.4` y actualizar las pruebas que fijan la versión. No repetir ningún umbral.
- [x] T004 [P] Escribir `src/compartido/escalamiento.test.ts` (en rojo): `esquemaEntradaEscalamiento` estricto (`claveIdempotencia` de 1 a 64 caracteres; `causa` y `motivo` de los catálogos; `codigo` solo con `preaprobacion_fuera_de_politica` y obligatorio entonces; `causasAdicionales` de hasta 8 con `{ causa, motivo, codigo? }` coherentes y ninguna que repita la principal; `declarado` con `monto` y `plazoMeses` opcionales, cada uno `{ valor, procedencia }`; un campo extra como `solicitante`, `ingresoVerificado` o `accionRecomendada` falla); `validarEntradaEscalamiento` con los errores `formato_invalido` (con su campo), `causa_incoherente` (campo `causa`) y `procedencia_faltante` o `procedencia_invalida` (campo `procedencia.<dato>`); `esquemaResumenAnalista` con las variantes de `solicitante` (`identificado: true` con `idSolicitante`, `nombre` y `documentoEnmascarado`, o `identificado: false`), las de `Discrepancia` (`tipo: "ingreso"` y `tipo: "documental"`) y los invariantes de [data-model.md](data-model.md#invariantes-del-esquema) (`pendientes` exactamente lo que falta; `causa` y `accionRecomendada` coherentes con `motivo` y `codigo`; `idEscalamiento` con la forma `ESC-000` + 7 dígitos; sin campos con el texto de los archivos); `claveIdempotenciaEscalamiento(correlationId)` es determinista, distinta por conversación y de 64 caracteres como máximo; `DESCRIPCION_ESCALAR_A_ANALISTA` con las cinco frases clave de [contracts/core-mcp.md](contracts/core-mcp.md#texto-de-la-descripción) y sin ninguno de los literales de umbral de las reglas comunes.
- [x] T005 Implementar `src/compartido/escalamiento.ts` (depende de T003 y T004): `esquemaEntradaEscalamiento`, `validarEntradaEscalamiento` (forma, coherencia y procedencia de `declarado` con `validarProcedenciaDato` de `src/compartido/solicitud.ts`), `esquemaResumenAnalista`, `esquemaResultadoEscalamiento` (`{ escalamiento, repetida }`), los tipos inferidos, `claveIdempotenciaEscalamiento` (`huella(JSON.stringify([correlationId, "escalamiento"]))` con `huella` de `src/compartido/extraccion.ts`) y `DESCRIPCION_ESCALAR_A_ANALISTA`. Reutiliza `esquemaRegistroExtraccion`, `esquemaVerificacionRegistrada` y `esquemaProcedenciaRegistro`. Una entrada que no pasa el esquema no se completa ni se corrige.
- [x] T006 Mover las constantes a la política (depende de T003): en `src/agente/adaptador.ts`, `SenalEscalamiento["motivo"]` pasa a derivarse de `MOTIVOS_ESCALAMIENTO`, `ORDEN_REGLA` se importa de la política, y `REGLA_PIDE_PERSONA`, `REGLA_AMBIGUA`, `REGLA_NO_VERIFICABLE` y `REGLA_NO_EXTRAIBLE` se reexportan desde la política con los mismos nombres; en `src/agente/agente.ts`, la tabla `REGLAS` se reemplaza por `reglaDeEscalamiento`. El comportamiento no cambia: ejecutar `npm test` y `npm run typecheck` y arreglar solo lo que el movimiento rompa.

**Checkpoint**: la política y el contrato compartido pasan sus pruebas; `npm test` y `npm run typecheck` en verde.

---

## Phase 3: User Story 1 - Recibir un resumen autocontenido del caso escalado (Priority: P1) 🎯 MVP

**Goal**: cada escalamiento entrega al analista un resumen estructurado y validado, que arma el core con lo que guardó: solicitante, monto y plazo, datos extraídos con su procedencia, discrepancias, causa y acción recomendada, con lo que falta como pendiente. Funciona sin identidad verificada y sin solicitud registrada, es idempotente y su entrega no puede hacer fallar el escalamiento.

**Independent Test**: [Escenario 1 del quickstart](quickstart.md) y la prueba del core con identidad de Ana, solicitud registrada con discrepancia de ingresos y todos los archivos: el resumen trae todos los campos, `pendientes` vacío, la causa `discrepancia_de_ingreso` y la acción `verificar_ingresos_con_soporte`.

### Tests for User Story 1 ⚠️

> Escribir primero y verificar que fallan.

- [x] T007 [P] [US1] Agregar a `src/mcp/core-simulado.test.ts` las pruebas de `escalarAAnalista` y `consultarEscalamiento` (en rojo), con el core preparado como en las pruebas de preaprobación del #14:
  - sin identidad ni solicitud, con `peticion_de_persona`: `solicitante` con `identificado: false`, `solicitud` `null`, `monto`, `plazoMeses`, `ingresoDeclarado` y `verificacionIngreso` `null`, `datosExtraidos` vacía, `pendientes` con los cinco valores, acción `contactar_al_solicitante`, `idEscalamiento` con la forma `ESC-000` + 7 dígitos y `repetida: false`;
  - sin solicitud y con `declarado` de monto y plazo con procedencia válida: `monto` y `plazoMeses` con su procedencia y `pendientes` sin `monto` ni `plazo`; con `procedencia` ausente o mal formada, `procedencia_faltante` o `procedencia_invalida` con el campo `procedencia.monto`, sin guardar nada;
  - con solicitud registrada, `declarado` se ignora y mandan el monto y el plazo de la solicitud;
  - con la identidad de Ana verificada y una solicitud registrada con discrepancia de ingresos: `solicitante` con `idSolicitante`, `nombre` y `documentoEnmascarado` (solo los 4 últimos dígitos), `solicitud` con `idSolicitud` y `estado`, `monto`, `plazoMeses` e `ingresoDeclarado` con procedencia, `verificacionIngreso` con el ingreso verificado, una `Discrepancia` de `tipo: "ingreso"` con `declarado`, `verificado`, `diferenciaPorcentaje` y `umbralPorcentaje`, `datosExtraidos` con los registros de las extracciones, `pendientes` vacía, causa `discrepancia_de_ingreso` y acción `verificar_ingresos_con_soporte`;
  - una inconsistencia entre archivos que detiene produce una `Discrepancia` de `tipo: "documental"` con `regla` y `adjuntos`;
  - `datosExtraidos` incluye las extracciones `no_cubierto` y `no_extraible`, y ningún campo del resumen trae el texto de un archivo;
  - `causasAdicionales` con la acción de cada una; una adicional que repite la principal es `formato_invalido` con el campo `causasAdicionales`;
  - `causa_incoherente` cuando la causa no corresponde al motivo; `formato_invalido` con un `codigo` y otro motivo, y con `preaprobacion_fuera_de_politica` sin `codigo`; un campo extra es `formato_invalido` con ese campo; la falla simulada es `core_no_disponible`;
  - repetir con la misma clave devuelve el mismo resumen con `repetida: true` y `auditoria: null`; llegar con otra clave o con otra causa devuelve el primero;
  - `consultarEscalamiento` devuelve `null` sin escalamiento y el resumen con él; un `correlationId` que no es UUID es `formato_invalido`;
  - escalar no cambia el `estado` de la solicitud registrada (sigue `en_estudio`) ni toca otra conversación;
  - la auditoría trae `resultado: "escalada"`, `regla`, `causa`, `motivo`, `codigo` si lo hay, el número de causas adicionales, `idEscalamiento`, `idSolicitud` e `idSolicitante` si los hay, `pendientes` y `versionPolitica`, y no trae nombres ni citas.
- [x] T008 [P] [US1] Agregar a `src/mcp/servidor.test.ts` las pruebas por el cliente MCP en memoria (un servidor por prueba, como en el #14): `escalar_a_analista` está anunciada sin `readOnlyHint` y con `DESCRIPCION_ESCALAR_A_ANALISTA`, y `consultar_escalamiento` con `readOnlyHint: true`; el esquema anunciado de `escalar_a_analista` no tiene `solicitante`, `ingresoVerificado`, `accionRecomendada` ni `regla`; el caso feliz devuelve `escalamiento` y `repetida`; un campo extra es `formato_invalido` con ese campo; sin `correlationId` es `formato_invalido` sobre `correlationId`; el log `herramienta` lleva `idEscalamiento` y el resultado, y no lleva nombres, montos, contenido ni citas; una repetición no deja otra `auditoria_escalamiento`.
- [x] T009 [P] [US1] Agregar a `src/agente/cliente-core.test.ts` las pruebas de `escalarAAnalista` y `consultarEscalamiento` con el `LlamadorMcp` falso: envían el nombre de herramienta y los argumentos con el `correlationId`; validan la respuesta con `esquemaResultadoEscalamiento`; una respuesta fuera de contrato es `respuesta_fuera_de_contrato`; un tiempo agotado y una falla de conexión son transitorios; un cliente cerrado es `core_no_disponible`.
- [x] T010 [P] [US1] Agregar a `src/agente/adaptador.test.ts` (en rojo): `dejarSenal` agrega cada señal a `estado.senales` con su `motivo` y `codigo`, también la que no prevalece, sin repetir `motivo` y `codigo`, y `estado.escalamiento` sigue siendo la de mayor precedencia en el orden 4 → 5 → 1 → 3 → 2; `solicitar_analista` con `monto`, `plazoMeses` y una cita literal de lo que dijo el solicitante guarda el dato con procedencia en `estado.declarado`; con una cita que no está en lo que dijo el solicitante, o sin cita, escala igual y el dato queda pendiente, sin error; con un `adjunto` que no existe o no es soportado, igual; sin esos campos funciona como antes; la herramienta no llama al core.
- [x] T011 [P] [US1] Agregar a `src/agente/agente.test.ts` (en rojo), con un core falso y una consulta inyectada, las pruebas de `entregarHandoff` por [contracts/agente.md](contracts/agente.md#pruebas-sin-el-modelo): con el core que responde, `entrega: "entregada"` y `handoff` con el resumen; la entrada enviada trae `claveIdempotencia` igual a `claveIdempotenciaEscalamiento(correlationId)`, la causa y el motivo de la señal principal, las `causasAdicionales` de `estado.senales` y el `declarado` de `estado.declarado`, y ningún dato del solicitante; con los reintentos agotados, `entrega: "pendiente"`, `handoff: null`, un log de error con la causa y la conversación escalada igual; con un error de forma, de causa incoherente o `resumen_invalido`, `entrega: "pendiente"` y sin reintentos; con una conversación sin escalamiento, `entrega: null` y el core no recibe `escalar_a_analista`; el hook de identidad sigue negando toda herramienta con una señal vigente y la entrega no pasa por él.

### Implementation for User Story 1

- [x] T012 [P] [US1] Implementar en `src/mcp/core-simulado.ts` (depende de T005 y T007) `escalarAAnalista(entrada)` y `consultarEscalamiento(correlationId)`, con el almacén `escalamientos: Map<correlationId, ResumenAnalista>` y el siguiente `idEscalamiento` libre (`ESC-000` + 7 dígitos, como el contador de las solicitudes registradas), siguiendo el orden de [contracts/core-mcp.md](contracts/core-mcp.md#comportamiento-del-core): falla simulada, forma y coherencia con `validarEntradaEscalamiento`, procedencia de `declarado` solo sin solicitud registrada, repetición, armado del resumen y validación con `esquemaResumenAnalista`. Armar del estado del core: identidad (`identidades`) y el nombre y el documento enmascarado con `enmascararDocumento` del solicitante, la solicitud registrada, la verificación con `verificacionRegistrada` (la de la solicitud o, si no hay, la última del core), las discrepancias del ingreso (si el estado es `discrepancia`) y las documentales que detienen, todos los registros de extracción de la conversación y los `pendientes`. `decision` queda en `null` por ahora. Agregar `AuditoriaEscalamiento` y los dos métodos a la interfaz `Core`. Sin identidad ni solicitud no se rechaza nada.
- [x] T013 [US1] Registrar las dos herramientas en `src/mcp/servidor.ts` (depende de T008 y T012): una entrada `.strict()` para cada una en `ENTRADAS`, con los campos de [contracts/core-mcp.md](contracts/core-mcp.md#entrada) como `z.unknown()` para que el core los valide con su código y su campo; `registerTool` de `escalar_a_analista` (sin `readOnlyHint`, con `DESCRIPCION_ESCALAR_A_ANALISTA` y salida `escalamiento` y `repetida`) y de `consultar_escalamiento` (`readOnlyHint: true`), con el log `herramienta` sin datos del caso y `auditoria_escalamiento` solo si hay auditoría.
- [x] T014 [P] [US1] Implementar en `src/agente/cliente-core.ts` (depende de T005 y T009) `escalarAAnalista` y `consultarEscalamiento` en `ClienteCore`, validadas con `esquemaResultadoEscalamiento`, y en `src/agente/core-no-simulado.ts` los dos métodos que fallan como los demás.
- [x] T015 [US1] Implementar en `src/agente/adaptador.ts` (depende de T006 y T010): `senales` en `EstadoConversacion` y `crearEstado`, y su acumulación en `dejarSenal` (cada señal, sin repetir `motivo` y `codigo`; la principal sigue siendo `estado.escalamiento`); `declarado` en el estado; `solicitar_analista` con los campos opcionales `monto`, `plazoMeses` y `origen` con la cita de cada uno, comprobados con `armarProcedencia` del #13, de modo que un dato cuya cita no pasa queda pendiente y no falla; ampliar la descripción de la herramienta con la frase de [contracts/agente.md](contracts/agente.md#herramienta-solicitar_analista-cambios).
- [x] T016 [US1] Implementar en `src/agente/agente.ts` (depende de T011, T014 y T015) `entregarHandoff` y su llamada en `conversar`, después de `cerrarTurnoIdentidad` y antes de `escalar(...)`, según [contracts/agente.md](contracts/agente.md#entregarhandoff): arma la entrada con la señal principal, las adicionales y `declarado`; llama a `core.escalarAAnalista` con `conReintentos` de `src/agente/reintentos.ts`; nunca lanza; un error no transitorio no se reintenta; en una entrega pendiente deja un log de error con la causa y el `correlationId`. `ResultadoConversacion` suma `handoff` y `entrega`. La conversación se escala siempre.

**Checkpoint**: el core entrega el resumen completo con y sin identidad y solicitud, el servidor lo valida y el agente lo entrega sin que su falla impida escalar; `npm test` y `npm run typecheck` en verde.

---

## Phase 4: User Story 2 - Escalar de inmediato cuando el solicitante pide una persona (Priority: P1)

**Goal**: la petición explícita de una persona se detecta por código antes de llamar al modelo y escala sin invocar ninguna otra herramienta, aunque el mensaje traiga más datos, y la Regla 4 prevalece sobre la 5.

**Independent Test**: [Escenarios 2 y 3 del quickstart](quickstart.md): con «Quiero hablar con una persona» no aparece ninguna línea `herramienta`, la consulta al modelo no se invoca y el estado final es «ESCALADA A ANALISTA».

### Tests for User Story 2 ⚠️

- [x] T017 [P] [US2] Agregar a `src/politica/escalamiento.test.ts` (en rojo) las pruebas de `detectarPeticionPersona` con la tabla de [contracts/politica.md](contracts/politica.md#casos-de-la-prueba): las seis frases que coinciden (con mayúsculas, con puntuación, con datos en el mismo mensaje) y las seis que no (con negación inmediata, sin verbo de petición, sin sustantivo de persona, vacío y solo espacios); la negación solo cuenta dentro de las tres palabras anteriores al verbo; el sustantivo debe estar a menos de ocho palabras del verbo.
- [x] T018 [P] [US2] Agregar a `src/agente/agente.test.ts` (en rojo), con la consulta inyectada como espía y un core falso: «Quiero hablar con una persona» da resultado `escalada` con causa `peticion_de_persona`, la consulta al modelo **no se invoca** y el core falso solo recibe `escalar_a_analista`; la misma petición con el core que no arranca da `escalada`, causa `peticion_de_persona` y `entrega: "pendiente"`; una petición con un archivo en moneda extranjera en el mismo turno da causa principal `peticion_de_persona` y la Regla 5 no se evalúa ni se llama al clasificador; señales de la Regla 4 y de la 5 en el mismo turno dan principal la 4 y adicional la 5; un mensaje con negación («No quiero hablar con una persona») sí llega al modelo; el modelo que llama a `solicitar_analista` con `pide_persona` sigue funcionando.

### Implementation for User Story 2

- [x] T019 [US2] Implementar `detectarPeticionPersona(texto)` en `src/politica/escalamiento.ts` (depende de T017) con la normalización, las listas cerradas y la negación de [contracts/politica.md](contracts/politica.md#detectarpeticionpersona): minúsculas, sin tildes (NFD sin marcas), puntuación como espacios y espacios colapsados; verbo de petición, sustantivo de persona a menos de ocho palabras y sin negación en las tres anteriores al verbo. Pura: no lee el core ni llama al modelo.
- [x] T020 [US2] Implementar en `src/agente/agente.ts` (depende de T016, T018 y T019) el paso 1 de [contracts/agente.md](contracts/agente.md#orden-de-un-turno): `conversar` evalúa `detectarPeticionPersona(mensaje)` antes de conectar el core y de `query()`; si coincide, deja la señal `pide_persona` con `REGLA_4`, no llama al modelo, no revisa la Regla 5 de los archivos ni cierra por identidad, y sigue a conectar el core para la entrega; si el core no arranca, la causa sigue siendo `peticion_de_persona` y la entrega queda pendiente.
- [x] T021 [P] [US2] Crear `casos/escalamiento-pide-persona/caso.json` (un paso: «Quiero hablar con una persona») y `casos/escalamiento-pide-persona-con-datos/caso.json` (un paso: «Hola, quiero 4 millones a 24 meses, pero prefiero hablar con una persona»), con `nombre`, `descripcion` (caso de prueba 6, Regla 4) y `pasos`; agregar a `src/chat/casos.test.ts` que ambos cargan y que sus pasos son los esperados.

**Checkpoint**: la petición de persona escala sin modelo ni herramientas y prevalece sobre la Regla 5; `npm test` y `npm run typecheck` en verde.

---

## Phase 5: User Story 3 - Escalar cuando el caso supera umbrales, tiene discrepancia o queda fuera de política (Priority: P2)

**Goal**: cada umbral superado, discrepancia de ingresos y caso no cubierto escala con la causa correcta, y los de la Regla 2 llevan en el resumen la decisión explicable con la regla, los valores usados y el motivo.

**Independent Test**: [Escenarios 4, 5 y 6 del quickstart](quickstart.md): la cuota alta da `cuota_sobre_porcentaje` con su decisión, la discrepancia da `discrepancia_de_ingreso`, la moneda extranjera da `caso_no_cubierto`.

### Tests for User Story 3 ⚠️

- [x] T022 [P] [US3] Agregar a `src/mcp/core-simulado.test.ts` (en rojo): con una solicitud registrada de 6 millones, el resumen de `monto_sobre_umbral` trae `decision` con la regla, los valores, el motivo y la versión que devuelve `evaluarRegla2` para esa solicitud; igual con `cuota_sobre_porcentaje` y con `discrepancia_de_ingreso` por `discrepancia_registrada`; con las causas `peticion_de_persona` y `caso_no_cubierto`, o sin solicitud registrada, `decision` es `null`; cada uno de los cinco códigos de `preaprobacion_fuera_de_politica` produce su causa y su acción de la tabla de [R1](research.md#r1-dos-niveles-de-clasificación-la-causa-cerrada-y-el-motivo); la `decision` no trae más valores que los que ya devuelve la política.
- [x] T023 [P] [US3] Agregar a `src/agente/agente.test.ts` (en rojo), con la consulta inyectada y el core simulado como en las pruebas de escalamiento del #14: una solicitud registrada de 6 millones bloqueada por el hook da `escalada` con causa `monto_sobre_umbral` y el resumen entregado; una cuota alta da `cuota_sobre_porcentaje`; la discrepancia de ingresos de `verificar_ingreso` da `discrepancia_de_ingreso`; la moneda extranjera y el tipo no soportado dan `caso_no_cubierto` con la acción `revisar_tipo_de_documento_o_moneda`; una inconsistencia entre archivos da `caso_no_cubierto` con `revisar_documentos_manualmente`; la identidad no verificable da `caso_no_cubierto` con `verificar_identidad_manualmente`; una falla transitoria persistente da `caso_no_cubierto` con `atender_falla_tecnica`; dos señales en el mismo turno (la Regla 2 y la Regla 3) dejan una principal por el orden 4 → 5 → 1 → 3 → 2 y la otra como adicional.

### Implementation for User Story 3

- [x] T024 [US3] Implementar en `src/mcp/core-simulado.ts` (depende de T012 y T022) el campo `decision` del resumen: con una solicitud registrada y una causa de monto, cuota o discrepancia de ingreso, llamar a `evaluarRegla2` de `src/politica/preaprobacion.ts` con el monto, el plazo y la verificación de la solicitud y guardar `regla`, `motivo`, `valores` y `versionPolitica`; en cualquier otro caso, `null`. No repetir ningún umbral ni recalcular la cuota fuera de la política.
- [x] T025 [P] [US3] Crear `casos/escalamiento-moneda-extranjera/caso.json` (un paso: «Quiero 4 millones a 24 meses y mi sueldo me lo pagan en dólares») con `nombre`, `descripcion` (caso de prueba 7, Regla 5 antes de identificar, con monto y plazo) y `pasos`; agregar a `src/chat/casos.test.ts` que carga y que su paso es el esperado.

**Checkpoint**: cada umbral, discrepancia y caso no cubierto escala con su causa y, los de la Regla 2, con su decisión explicable; `npm test` y `npm run typecheck` en verde.

---

## Phase 6: User Story 4 - No escalar lo que el agente puede resolver (Priority: P2)

**Goal**: un dato faltante que se puede pedir y varias coincidencias que se pueden desambiguar no escalan, y queda fijado con pruebas y con una línea del prompt.

**Independent Test**: [Escenario 7 del quickstart](quickstart.md): el certificado sin salario pide un documento y los homónimos piden el número de documento, sin `[ESCALAMIENTO]`.

### Tests for User Story 4 ⚠️

- [x] T026 [P] [US4] Agregar a `src/agente/agente.test.ts` y `src/agente/adaptador.test.ts` (en rojo) las pruebas de regresión de SC-003: un archivo al que le falta un dato emite `solicitud_de_dato` y el resultado es `respuesta`, sin señal ni entrega; una verificación de ingreso en `falta_declarado` o `sin_ingreso` pide el dato y no escala; una primera búsqueda con varias coincidencias pide el número de documento y no escala; una búsqueda ambigua repetida en el mismo turno cuenta una sola; después de desambiguar, una búsqueda ambigua posterior no escala. Agregar una prueba del prompt: contiene la línea «No escales por un dato que puedes pedir al solicitante ni por varias coincidencias que puedes desambiguar», y ni el prompt ni la descripción de `solicitar_analista` contienen ninguno de los literales de umbral de las reglas comunes.

### Implementation for User Story 4

- [x] T027 [US4] Agregar a `SYSTEM_PROMPT` de `src/agente/agente.ts` (depende de T020 y T026), junto a las reglas de escalamiento, la línea «No escales por un dato que puedes pedir al solicitante ni por varias coincidencias que puedes desambiguar: pídelo y sigue.» Las reglas actuales de la Regla 4 y la Regla 5 no cambian.

**Checkpoint**: las pruebas de regresión fijan que lo resoluble no escala; `npm test` y `npm run typecheck` en verde.

---

## Phase 7: User Story 5 - Informar al solicitante que un analista revisará su caso (Priority: P3)

**Goal**: el solicitante recibe un aviso claro de que un analista revisará su caso, sin promesas de resultado ni de contacto, y la interfaz muestra la causa, si la entrega quedó pendiente y, en modo de demostración, el resumen.

**Independent Test**: [Escenarios 2 a 6 del quickstart](quickstart.md): el aviso dice «Un analista de crédito revisará tu caso», aparece `[ESCALAMIENTO]` con `causaEscalamiento`, `entrega` e `idEscalamiento`, y con `--demo` se imprime el resumen.

### Tests for User Story 5 ⚠️

- [x] T028 [P] [US5] Agregar a `src/agente/agente.test.ts` (en rojo): los textos de `AVISOS` de la tabla de [contracts/agente.md](contracts/agente.md#aviso-al-solicitante-cambios) fijados fila por fila; ningún aviso contiene «te contactará», «aprobada», «rechazada» ni un dígito; la respuesta termina con «Referencia: » y los 8 primeros caracteres del `correlationId`; el evento `escalamiento` suma a `valores` `causaEscalamiento`, `entrega` (`entregada` o `pendiente`) e `idEscalamiento` solo si se entregó; las claves de antes, incluida la `causa` de un caso no cubierto del #9, no cambian; el evento valida con el catálogo de `src/compartido/eventos.ts`.
- [x] T029 [P] [US5] Agregar a `src/chat/presentacion.test.ts` (en rojo) las pruebas de `formatearHandoff` con un resumen de ejemplo armado en la prueba: imprime el bloque de [contracts/agente.md](contracts/agente.md#chat) (causa y regla, acción, solicitante con el documento enmascarado, solicitud con monto y plazo, ingreso declarado y verificado, discrepancias, número de extracciones, decisión y pendientes); con y sin color el texto es el mismo; no imprime el texto de los archivos ni fragmentos de procedencia; con una entrega pendiente imprime «Entrega al analista: pendiente». Agregar a `src/chat/chat.test.ts`: con `demo` el resumen se imprime después de los eventos de un turno escalado, y sin `demo` no se imprime.

### Implementation for User Story 5

- [x] T030 [US5] Implementar en `src/agente/agente.ts` (depende de T027 y T028): los textos de `AVISOS` de la tabla del contrato, el evento `escalamiento` con `causaEscalamiento` (`causaDeEscalamiento` de la señal principal), `entrega` e `idEscalamiento`, y la línea del prompt «Cuando solicites un analista, no digas qué decidirá ni cuándo responderá: solo que un analista revisará su caso.»
- [x] T031 [US5] Implementar `formatearHandoff(resumen, color)` en `src/chat/presentacion.ts` y su uso en `src/chat/chat.ts` (depende de T016 y T029): solo con `demo`, después de los eventos de un turno cuyo resultado trae `handoff`, o la línea «Entrega al analista: pendiente» si `entrega` es `pendiente`. Texto fijo, sin depender del color; sin el texto de los archivos ni fragmentos.
- [x] T032 [US5] Actualizar las pruebas existentes que fijan los textos viejos de `AVISOS` (depende de T030): buscar «te contactará» y «Te comunico con un analista» en `src/**/*.test.ts` y cambiarlos por los nuevos, sin tocar la lógica que prueban.

**Checkpoint**: los avisos, el evento y la vista del resumen pasan sus pruebas; `npm test` y `npm run typecheck` en verde.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: documentación, verificación de las reglas y validación punta a punta.

- [x] T033 Agregar el #15 al mapa del repositorio de `CLAUDE.md`: en las filas de `src/politica/` (`escalamiento.ts`: catálogos, causa, acción y detección de la petición de persona), `src/agente/` (`entregarHandoff`, Regla 4 antes del modelo), `src/mcp/` (`escalar_a_analista` y `consultar_escalamiento`), `src/compartido/` (esquemas del resumen) y `casos/` (los tres casos nuevos).
- [x] T034 [P] Comprobar que los umbrales no se repiten: con la herramienta de búsqueda, buscar los literales de umbral de las reglas comunes en los archivos nuevos y modificados de producción (no en pruebas) y confirmar que solo aparecen en `src/politica/politica.ts`; comprobar que la descripción de `escalar_a_analista`, la de `solicitar_analista` y el prompt no los contienen.
- [x] T035 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check`; si el formato falla, `npm run format` y volver a comprobar. Ningún cambio se integra con pruebas en rojo.
- [x] T036 Ejecutar los Escenarios 2 a 7 del [quickstart](quickstart.md) con `ANTHROPIC_API_KEY` definida en la sesión y anotar el resultado de cada uno; el Escenario 4 depende del modelo (con o sin citas de monto y plazo, los dos resultados son válidos). Si no hay clave en el equipo, anotarlo y dejar solo el Escenario 1 verificado.
- [x] T037 Revisar que la entrada del #15 de `DECISIONES.md` y la sección «Riesgos y pendientes» de `plan.md` siguen siendo ciertas tras la implementación; si algo cambió, corregirlo ahí y no en un documento nuevo.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup y **bloquea** todas las historias.
  - T003 depende de T002; T005 de T003 y T004; T006 de T003.
- **User Stories (Phase 3+)**: dependen de Foundational. US1 es la base de las demás por la entrega del resumen; US2 y US3 pueden seguir en paralelo a US1 solo en sus pruebas.
- **Polish (Fase 8)**: depende de las historias que se quieran entregar.

### User Story Dependencies

- **US1 (P1)**: tras Foundational. Sin dependencias de otras historias.
- **US2 (P1)**: tras Foundational y T016 de US1, porque la Regla 4 entrega el resumen por `entregarHandoff`.
- **US3 (P2)**: tras US1 (el core que arma el resumen). `decision` y los casos de causa no cambian lo que entregó US1.
- **US4 (P2)**: tras US2, porque agrega una línea al prompt de `agente.ts` ya tocado por US2.
- **US5 (P3)**: tras US1 (`handoff` y `entrega`) y US4 (el prompt).

### Within Each User Story

- Las pruebas se escriben primero y deben fallar antes de implementar.
- Contrato compartido → core → servidor → cliente → adaptador → agente → chat.

### Parallel Opportunities

- Fase 2: T002 y T004 (archivos de prueba distintos).
- US1: las cinco pruebas T007 a T011 (cinco archivos distintos); y T012 y T014 (core y cliente).
- US2: T017, T018 y T021.
- US3: T022, T023 y T025.
- US5: T028 y T029.
- Fase 8: T034.
- Tareas que editan el mismo archivo no van en paralelo: `agente.ts` (T016, T020, T027, T030), `adaptador.ts` (T006, T015) y `core-simulado.ts` (T012, T024).

---

## Parallel Example: User Story 1

```text
# Escribir las pruebas de US1 en paralelo (archivos distintos):
Task: "Pruebas de escalarAAnalista y consultarEscalamiento en src/mcp/core-simulado.test.ts"
Task: "Pruebas de las herramientas en src/mcp/servidor.test.ts"
Task: "Pruebas del cliente en src/agente/cliente-core.test.ts"
Task: "Pruebas de señales acumuladas y solicitar_analista en src/agente/adaptador.test.ts"
Task: "Pruebas de entregarHandoff en src/agente/agente.test.ts"

# Implementar el core y el cliente en paralelo:
Task: "escalarAAnalista y consultarEscalamiento en src/mcp/core-simulado.ts"
Task: "escalarAAnalista y consultarEscalamiento en src/agente/cliente-core.ts"
```

---

## Implementation Strategy

### MVP First (US1 y US2)

1. Completar la Fase 1 y la Fase 2.
2. Completar US1: el analista recibe el resumen y el escalamiento no falla por la entrega.
3. Completar US2: la Regla 4 escala sin modelo ni herramientas.
4. **PARAR Y VALIDAR**: Escenarios 1, 2 y 3 del quickstart.
5. Es un incremento seguro: con esto la Regla 4 deja de depender del prompt.

### Incremental Delivery

1. Setup + Foundational → la política y el contrato listos.
2. US1 → resumen entregado (MVP parcial).
3. US2 → Regla 4 por código (MVP).
4. US3 → decisión explicable y causa de cada umbral.
5. US4 → lo resoluble no escala, fijado con pruebas.
6. US5 → avisos, evento y vista del resumen.
7. Cada historia suma valor sin romper las anteriores.

---

## Trazabilidad de requisitos

| Requisito | Tareas |
|-----------|--------|
| FR-001, FR-002 (resumen estructurado y validado) | T004, T005, T007, T012 |
| FR-003 (Regla 4, inmediata) | T017 a T020 |
| FR-004 (umbrales, discrepancia, no cubierto) | T022 a T024 |
| FR-005 (no escalar lo resoluble) | T026, T027 |
| FR-006 (causa cerrada y acción fija) | T002 a T005 |
| FR-007 (orden determinista) | T010, T018, T020, T023 |
| FR-008 (todas las causas, principal por precedencia) | T010, T015, T018, T023 |
| FR-009 (aviso al solicitante) | T028, T030, T032 |
| FR-010 (indicador visible) | T028, T029, T030, T031 |
| FR-011 (auditoría) | T007, T008, T012, T013 |
| FR-012 (sin contenido de documentos) | T004, T007, T029 |
| FR-013 (escalar sin registro) | T007, T012 |

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [Story] enlaza cada tarea con su historia de la spec.
- Cada historia se puede completar y probar sola.
- Verificar que las pruebas fallan antes de implementar.
- Commit tras cada tarea o grupo lógico, con mensajes convencionales y el número del issue: `feat: … (#15)`.
- Evitar tareas vagas, conflictos en el mismo archivo y dependencias entre historias que rompan su independencia.
