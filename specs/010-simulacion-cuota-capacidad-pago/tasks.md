---
description: "Lista de tareas: simulación de cuota y capacidad de pago"
---

# Tasks: Simulación de cuota y capacidad de pago

**Input**: documentos de diseño en `specs/010-simulacion-cuota-capacidad-pago/`

**Issue de origen**: [fabisahe29/CREDIAGIL#12](https://github.com/fabisahe29/CREDIAGIL/issues/12)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/politica.md](contracts/politica.md), [contracts/core-mcp.md](contracts/core-mcp.md), [contracts/agente.md](contracts/agente.md), [quickstart.md](quickstart.md)

**Tests**: la spec los **exige** (FR-016) y la constitución también: política en los bordes exactos y herramientas MCP con rechazo del lado del servidor. Cada módulo se escribe primero como prueba, en rojo, y después se implementa, en verde, con `node --test`. Ninguna prueba usa red ni el modelo real.

**Organization**: por historia de usuario.
- La Fase 2 deja la tasa, la cuota, el contrato compartido (esquemas, validación, avisos y descripción) y sus pruebas. Lo usan todas las historias.
- US1 entrega la simulación de punta a punta: core, servidor MCP, cliente y herramienta del agente, con la fuente del ingreso.
- US2 comprueba que simular no tiene efectos y que no exige identidad.
- US3 deja al modelo distinguiendo simular de preaprobar: prueba de la descripción, cambio del prompt y la prueba de que no se decide la Regla 2.
- US4 comprueba, en cada capa, el rechazo de las entradas inválidas.

**Alcance mínimo**: US1 y US2 son el mínimo que cumple el comportamiento 3 sin comprometer a la fintech. US3 no se omite: sin el cambio del prompt el modelo se niega a simular. US4 solo agrega pruebas de capa y arreglos de lo que fallen, porque la validación base se implementa en la Fase 2 (T006).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US4)

## Path Conventions

- Código bajo `src/`: `src/politica/`, `src/compartido/`, `src/mcp/` y `src/agente/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): montos e ingresos inventados; si una prueba necesita identidad, usa a Ana Pérez Ficticia de `src/mcp/datos-ejemplo.ts`.
- **Montos como enteros de pesos**. La única aritmética con flotantes es la potencia de la fórmula de la cuota, y su resultado entra a `redondearAlPesoMasCercano`. La proporción usa `BigInt`.
- **La tasa se toma de `src/politica/politica.ts`**: ningún otro archivo repite `0.018`, `1.8` ni `180` como la tasa.
- **Los logs no llevan montos de la simulación** (monto, ingreso ni cuota): solo herramienta, `correlationId`, resultado y `fuenteIngreso`.
- **La herramienta no escribe en el core**: ningún mapa de `src/mcp/core-simulado.ts` cambia por simular.
- **No se menciona el 30% ni el tope de $5.000.000** en la descripción de la herramienta ni en su resultado.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar el punto de partida.

- [X] T001 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check` en la rama `12-simulacion-de-cuota-y-capacidad-de-pago` y confirmar que todo está en verde antes de cambiar nada

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la tasa, la aritmética y el contrato que usan todas las historias.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [X] T002 Agregar en `src/politica/politica.ts` `TASA_MENSUAL_PUNTOS_BASE = 180` y `TASA_MENSUAL = TASA_MENSUAL_PUNTOS_BASE / 10_000`, con su comentario, y subir `VERSION_POLITICA` de `2026-10-18.1` a `2026-10-18.2`; actualizar el comentario de cabecera, que dice que la tasa llega con el #12
- [X] T003 [P] Escribir `src/politica/cuota.test.ts` (rojo) según [contracts/politica.md](contracts/politica.md#pruebas-cuotatestts): 4.000.000 a 24 meses da 206.723; 1.000.000 a 1 mes da 1.018.000; 5.000.000 a 12 meses contra la fórmula escrita en la propia prueba; monto 1; plazo muy largo; `redondearAlPesoMasCercano` con `206723.34`, `206723.5` (sube a 206.724) y `206723.49999`; `ErrorCuota` ante un resultado no seguro y ante precondiciones rotas; `calcularRelacionCuotaIngreso` con 206.723 sobre 1.000.000 (20,67), con cuota mayor que el ingreso (más de 100, sin recortar) y con bordes de .5 en el tercer decimal; `TASA_MENSUAL === 0.018`; y una prueba de convención que recorre `src/` y falla si fuera de `politica.ts` y de `*.test.ts` aparece la tasa como literal
- [X] T004 Implementar `src/politica/cuota.ts` (verde): `redondearAlPesoMasCercano` (la mitad hacia arriba), `calcularCuota` con `P · i / (1 − (1 + i)^−n)` y `i = TASA_MENSUAL`, `calcularRelacionCuotaIngreso` con `BigInt` y dos decimales, y `class ErrorCuota extends Error`, según [contracts/politica.md](contracts/politica.md#cuotats-nuevo); depende de T002 y T003
- [X] T005 [P] Escribir `src/compartido/capacidad-pago.test.ts` (rojo): el esquema de entrada acepta enteros positivos y rechaza `0`, negativos, decimales, cadenas, campos ausentes y campos extra; la validación devuelve el primer campo inválido en el orden `monto`, `plazoMeses`, `ingresoMensual`, `correlationId` con el código de [data-model.md](data-model.md#entradasimulacion) (`monto_invalido`, `plazo_invalido`, `ingreso_invalido`, `formato_invalido`), categoría `validacion` y `reintentable: false`; el esquema de salida acepta una simulación válida y rechaza `vinculante: true`, `tipo` distinto de `"simulacion"` y campos extra; cada fuente de ingreso tiene su aviso exacto de [data-model.md](data-model.md#avisos)
- [X] T006 Implementar `src/compartido/capacidad-pago.ts` (verde) según [data-model.md](data-model.md) y [contracts/core-mcp.md](contracts/core-mcp.md): `esquemaEntradaCapacidadPago` con `monto`, `plazoMeses` e `ingresoMensual` como «entero seguro `> 0`», y `.strict()`; `validarEntradaCapacidadPago(entrada: unknown)`, que devuelve la entrada tipada o el `ErrorCore` de `errorValidacion` con su `campo` y su mensaje de motivo; `esquemaSimulacionCapacidadPago` con `tipo: "simulacion"`, `vinculante: false`, `monto`, `plazoMeses`, `ingresoMensual`, `fuenteIngreso` (`"declarado"` o `"verificado"`), `tasaMensualPuntosBase`, `cuotaMensual`, `relacionCuotaIngresoPorcentaje`, `aviso` y `versionPolitica`; el mapa de avisos por fuente; y `DESCRIPCION_CAPACIDAD_PAGO` con las cinco ideas, en ese orden, de [contracts/core-mcp.md](contracts/core-mcp.md#texto-de-la-descripción-fr-007); depende de T005

**Checkpoint**: la tasa, la cuota, la validación y el contrato compartido están en verde; ninguna historia toca todavía el core ni el agente.

---

## Phase 3: User Story 1 - Saber cuánto pagaría al mes y qué parte de mi ingreso es (Priority: P1) 🎯 MVP

**Goal**: el solicitante pide una simulación y recibe la cuota y la proporción de su ingreso, con la fuente del ingreso rotulada.

**Independent Test**: simular 4.000.000 a 24 meses con un ingreso dado y comprobar, por el servidor MCP y por el adaptador, que la cuota es 206.723 y que la proporción coincide con el cálculo manual (quickstart, Escenarios 1 y 2).

### Tests for User Story 1 ⚠️

> Escribirlas primero y verlas fallar.

- [X] T007 [P] [US1] Agregar a `src/mcp/core-simulado.test.ts` las pruebas de `calcularCapacidadPago`: el valor de referencia (206.723) con su proporción; el mismo resultado en llamadas repetidas; la fuente `declarado` cuando no hay verificación guardada; la fuente `verificado` cuando la verificación guardada está en estado `verificado` y su `ingreso.monto` es igual al `ingresoMensual` recibido; la fuente `declarado` cuando el monto recibido es distinto del verificado y cuando la verificación está en otro estado; y la falla transitoria simulada devuelve `core_no_disponible` reintentable
- [X] T008 [P] [US1] Agregar a `src/mcp/servidor.test.ts`, con el cliente MCP en memoria del #7, que `calcular_capacidad_pago` figura en el listado de herramientas y que una llamada válida devuelve `structuredContent` que cumple `esquemaSimulacionCapacidadPago`, con la cuota 206.723
- [X] T009 [P] [US1] Agregar a `src/agente/cliente-core.test.ts` que `calcularCapacidadPago` llama a la herramienta con el `correlationId`, devuelve la simulación validada y convierte una respuesta fuera de contrato en `respuesta_fuera_de_contrato`
- [X] T010 [P] [US1] Agregar a `src/agente/adaptador.test.ts` con el core falso que la herramienta `calcular_capacidad_pago` está en `herramientas`, que su manejador llama al core con el `correlationId` del estado de la conversación, y que ante un error transitorio se reintenta y, agotados los reintentos, deja la señal `falla_transitoria_persistente`

### Implementation for User Story 1

- [X] T011 [US1] Implementar `calcularCapacidadPago` en `src/mcp/core-simulado.ts` según [contracts/core-mcp.md](contracts/core-mcp.md#comportamiento-del-core): agregarlo a la interfaz `Core` con su comentario; falla simulada primero; validar con `validarEntradaCapacidadPago`; calcular con `calcularCuota` y `calcularRelacionCuotaIngreso`; un `ErrorCuota` es `monto_invalido` sobre `monto`; decidir `fuenteIngreso` leyendo `verificaciones` (solo si el `estado` es `verificado` y `ingreso.monto` es igual al recibido); devolver `tasaMensualPuntosBase` desde `TASA_MENSUAL_PUNTOS_BASE`, el aviso de la fuente y `VERSION_POLITICA`; depende de T007
- [X] T012 [US1] Registrar `calcular_capacidad_pago` en `src/mcp/servidor.ts` según [contracts/core-mcp.md](contracts/core-mcp.md#anuncio): entrada en `ENTRADAS` con `.strict()`, esquema anunciado con `z.looseObject` y los cuatro campos opcionales (`anunciado(...)`), `title`, `description: DESCRIPCION_CAPACIDAD_PAGO`, `outputSchema`, `annotations: { readOnlyHint: true }`, y el log con `registrarHerramienta(..., { fuenteIngreso })` solo si la respuesta fue correcta; depende de T008 y T011
- [X] T013 [US1] Agregar `calcularCapacidadPago(entrada, correlationId)` a `ClienteCore` en `src/agente/cliente-core.ts`, con su esquema de respuesta (`esquemaRespuesta(z.object({ simulacion: esquemaSimulacionCapacidadPago }).strict())`) y el tipo `RespuestaCapacidadPago`; `ingresoMensual` es opcional en el tipo y solo se envía si está presente; depende de T009 y T012
- [X] T014 [US1] Agregar la herramienta `calcular_capacidad_pago` a `src/agente/adaptador.ts` según [contracts/agente.md](contracts/agente.md#herramienta-del-adaptador): esquema `{ monto: z.number(), plazoMeses: z.number(), ingresoMensual: z.number().optional() }` con las descripciones de la tabla, manejador `calcularCapacidadPago` con `llamarConReintentos`, entrada en el objeto `herramientas` y en `createSdkMcpServer` con `DESCRIPCION_CAPACIDAD_PAGO` y `annotations: { readOnlyHint: true }`; sin señales, sin eventos y sin llamar a otra herramienta; depende de T010 y T013

**Checkpoint**: US1 funciona sola: una pregunta por la cuota recibe cuota, proporción, fuente y aviso, con el valor de referencia exacto.

---

## Phase 4: User Story 2 - Simular sin comprometer nada ni haber verificado la identidad (Priority: P1)

**Goal**: simular es una consulta pura: no deja efectos en el core y se puede hacer antes de verificar la identidad.

**Independent Test**: simular con un solicitante sin identidad verificada y comprobar que la respuesta llega y que el estado del core no cambia (quickstart, Escenario 3).

### Tests for User Story 2 ⚠️

- [X] T015 [P] [US2] Agregar a `src/mcp/core-simulado.test.ts`: con una conversación nueva (sin identidad) `calcularCapacidadPago` responde correctamente y no devuelve `identidad_no_verificada`; y llamarla varias veces, con y sin verificación guardada, deja igual los resultados de `consultarSolicitud`, `consultarIdentidad`, `consultarExtracciones` y `consultarVerificacionIngreso` antes y después, y no produce auditoría
- [X] T016 [P] [US2] Agregar a `src/mcp/servidor.test.ts`: la herramienta se anuncia con `readOnlyHint: true`, y capturando los logs, la llamada deja una línea `herramienta` con `correlationId`, `resultado` y `fuenteIngreso` que no contiene el monto, el ingreso ni la cuota, y no deja ninguna línea `auditoria*`
- [X] T017 [P] [US2] Agregar a `src/agente/control-identidad.test.ts`: con la identidad sin verificar, el hook devuelve `{}` para `mcp__originacion__calcular_capacidad_pago`, no emite `bloqueo_por_regla` y `HERRAMIENTAS_CON_IDENTIDAD` no la incluye; con una conversación ya escalada la deniega, como a las demás
- [X] T018 [P] [US2] Agregar a `src/agente/adaptador.test.ts`: una llamada correcta a la herramienta no deja `estado.escalamiento`, no agrega eventos a `estado.eventos` y no llama a ningún otro método del core falso

### Implementation for User Story 2

- [X] T019 [US2] Si T015 a T018 fallan, corregir la causa: que el core no lea `identidades` en `calcularCapacidadPago` de `src/mcp/core-simulado.ts`, que el log de `src/mcp/servidor.ts` no incluya los montos ni la cuota, y que `src/agente/control-identidad.ts` no agregue la herramienta a `HERRAMIENTAS_CON_IDENTIDAD`; si pasan sin cambios, dejar constancia en el mensaje del commit

**Checkpoint**: US1 y US2 juntas son el mínimo: simula, sin identidad y sin efectos.

---

## Phase 5: User Story 3 - Que el modelo distinga simular de preaprobar (Priority: P1)

**Goal**: el modelo sabe cuándo simular, no presenta la simulación como decisión y no estima cuotas por su cuenta.

**Independent Test**: leer la descripción de la herramienta y el prompt, y comprobar en una conversación de prueba que una pregunta por la cuota no inicia ninguna preaprobación (quickstart, Escenario 5).

### Tests for User Story 3 ⚠️

- [X] T020 [P] [US3] Agregar a `src/compartido/capacidad-pago.test.ts` que `DESCRIPCION_CAPACIDAD_PAGO` contiene las frases de FR-007 (que solo simula; que no registra, reserva ni compromete nada; que puede usarse sin identidad verificada; que no reemplaza a `preaprobar_credito`; cuándo corresponde simular y cuándo preaprobar; que no es una decisión) y que **no** contiene `30` ni `5.000.000` ni `5000000`
- [X] T021 [P] [US3] Agregar a `src/mcp/core-simulado.test.ts` que el resultado de `calcularCapacidadPago` no contiene ningún campo de decisión (ni `aprobado`, ni `preaprobado`, ni `dentroDePolitica`, ni una comparación con el 30%), incluso con una proporción menor al 30% y un monto menor o igual a $5.000.000, y que `tipo` es `"simulacion"` y `vinculante` es `false` (FR-008, FR-009)
- [X] T022 [P] [US3] Agregar a `src/agente/agente.test.ts` que el prompt del sistema ya no contiene «estimas cuotas», que nombra `calcular_capacidad_pago` y que contiene las dos instrucciones nuevas de [contracts/agente.md](contracts/agente.md#prompt-agentets): pasar solo los datos dichos por el solicitante y no afirmar que la simulación equivale a una preaprobación

### Implementation for User Story 3

- [X] T023 [US3] Cambiar el prompt en `src/agente/agente.ts` según [contracts/agente.md](contracts/agente.md#prompt-agentets): reemplazar la frase de la línea «No tomas decisiones de crédito: no apruebas, no rechazas ni estimas cuotas.» por la versión nueva y agregar las dos instrucciones junto a las de `verificar_ingreso`; no tocar el resto del prompt; depende de T022
- [X] T024 [US3] Si T020 o T021 fallan, corregir `DESCRIPCION_CAPACIDAD_PAGO` en `src/compartido/capacidad-pago.ts` o el resultado de `calcularCapacidadPago` en `src/mcp/core-simulado.ts`; si pasan sin cambios, dejar constancia en el mensaje del commit

**Checkpoint**: el prompt y la descripción dicen lo mismo: simular informa, preaprobar decide.

---

## Phase 6: User Story 4 - Rechazar entradas inválidas con un motivo claro (Priority: P2)

**Goal**: cada entrada inválida produce un error de validación no reintentable con el motivo y sin cuota parcial, en el core, en el servidor y en el agente.

**Independent Test**: enviar monto, plazo e ingreso inválidos y comprobar, en cada capa, el error tipado con su campo y que no se reintenta (quickstart, Escenario 4).

### Tests for User Story 4 ⚠️

- [X] T025 [P] [US4] Agregar a `src/mcp/core-simulado.test.ts` una tabla de casos: monto `0`, negativo, decimal y ausente (`monto_invalido`, campo `monto`); plazo `0`, negativo, decimal y ausente (`plazo_invalido`, campo `plazoMeses`); ingreso `0`, negativo, decimal y ausente (`ingreso_invalido`, campo `ingresoMensual`); `correlationId` no UUID (`formato_invalido`); un monto cuya cuota no es un entero seguro (`monto_invalido`); en todos, `categoria: "validacion"`, `reintentable: false`, un mensaje que dice el motivo y ninguna cuota ni dato parcial; y un monto muy alto pero seguro con un plazo grande se simula igual (sin límites adicionales, aclaración Q2)
- [X] T026 [P] [US4] Agregar a `src/mcp/servidor.test.ts`, con el cliente MCP en memoria, que cada entrada inválida de T025 llega como `isError: true` con el contrato `validacion` y su `campo` (no el error genérico del SDK), y que un campo extra devuelve `formato_invalido` sobre ese campo
- [X] T027 [P] [US4] Agregar a `src/agente/adaptador.test.ts` con el core falso que un error de validación del core pasa tal cual al modelo, **no se reintenta** (el core se llama una sola vez), no deja señal de escalamiento y no incluye ninguna cuota; y que la falta de `ingresoMensual` llega al core sin completarse ni inventarse

### Implementation for User Story 4

- [X] T028 [US4] Si T025 a T027 fallan, corregir `validarEntradaCapacidadPago` en `src/compartido/capacidad-pago.ts`, el mapeo de `ErrorCuota` en `src/mcp/core-simulado.ts`, la validación estricta de `src/mcp/servidor.ts` o el paso de errores del manejador en `src/agente/adaptador.ts`; si pasan sin cambios, dejar constancia en el mensaje del commit

**Checkpoint**: las cuatro historias funcionan; ninguna entrada inválida produce una cuota.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: documentación y verificación final.

- [X] T029 [P] Actualizar `CLAUDE.md` en la fila `src/politica/` del mapa del repositorio (cuota y tasa desde el #12) y en la fila `src/compartido/` (contrato de la simulación de capacidad de pago, #12); y en las filas `src/mcp/` y `src/agente/` la herramienta `calcular_capacidad_pago`
- [X] T030 [P] Revisar que ningún archivo de `src/` fuera de `src/politica/politica.ts` repite la tasa como literal y que `src/politica/politica.ts` ya no promete el #12 en su comentario de cabecera para la tasa
- [X] T031 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check`, todo en verde
- [X] T032 Ejecutar el [quickstart](quickstart.md), Escenarios 1 a 6, con `npm run chat -- --demo` y el modelo real, y anotar el resultado en el PR; el Escenario 5 comprueba que el modelo no simula por su cuenta ni afirma una aprobación
  - Resultado parcial (2026-10-18, modelo real): E1 pasa (`npm test`). E2 pasa: 206.723 y 5,44 % con aviso «declarado». E3 pasa en lo visible: sin bloqueo de identidad ni `control_identidad` en el log; el «sin efectos» lo cubren las pruebas de US2. E4 pasa en sus cinco casos, sin cuota en ninguno (0 pesos, ingreso ausente, monto sin ingreso, «Un millón a 0 meses» en `chat-20261018-143902`, y «Gano -500.000» con `ingreso_invalido`). E5 pasa: «¿me aprueban?» devuelve simulación 280.206 y no afirma aprobación. E6 pasa (`chat-20261018-143137`): tras verificar el ingreso (3.800.000), 4 millones a 24 meses dan 206.723 con `fuenteIngreso: verificado`. Pendiente: el cambio a un declarado distinto.
  - Cierre (2026-10-18): E6 completo con `chat-20261018-144730`. Con «si ganara 6.000.000», la respuesta muestra cuota 206.723 y 3,45 % con aviso de ingreso declarado (`fuenteIngreso: declarado`). El agente añadió una comparación con el ingreso verificado de 3.800.000 que no se pidió; está etiquetada y no se presenta como aprobación.
  - Hallazgo: con «Gano -500.000», el modelo sugirió en los tres turnos un ingreso de 500.000 («¿Quisiste decir $500.000?», «confírmame que tu ingreso es 500.000», «sin el signo menos, por ejemplo 500.000»). Viola «no completar ni suponer» (Principio V). Aceptado por el desarrollador: no se corrige en este ticket. La herramienta nunca recibió el valor sugerido, así que no hay cuota ni decisión con él. Ver [plan.md](plan.md#riesgos-y-pendientes).
- [X] T033 Confirmar que ningún log de `npm run chat` contiene un monto de ingreso, de crédito o de cuota de la simulación
  - Verificado en `logs/chat-20261018-140849`, `-141352` y `-141751`: los eventos `herramienta` y `llamada_core` de `calcular_capacidad_pago` no traen montos ni cuota. El ingreso 3.800.000 aparece solo en `auditoria_ingreso` del #11 (Regla 3), auditoría obligatoria por la constitución (Principio VI) y previa a este ticket.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup y **bloquea** todas las historias. Dentro de la fase: T002 → T004 (con T003); T005 → T006.
- **User Stories (Phase 3 a 6)**: dependen de la Fase 2. US1 va primero porque crea la herramienta; US2, US3 y US4 son pruebas y ajustes sobre ella, y pueden hacerse en paralelo entre sí después de T014.
- **Polish (Phase 7)**: depende de las historias que se entreguen.

### User Story Dependencies

- **US1 (P1)**: tras la Fase 2. Sin dependencias de otras historias. Crea la herramienta en el core, el servidor, el cliente y el adaptador.
- **US2 (P1)**: tras US1 (necesita la herramienta). Solo pruebas, y un arreglo si algo falla.
- **US3 (P1)**: tras US1 para sus pruebas de core (T021); el cambio del prompt (T022, T023) y la prueba de la descripción (T020) solo dependen de la Fase 2.
- **US4 (P2)**: tras US1. Solo pruebas, y un arreglo si algo falla.

### Within Each User Story

- Las pruebas se escriben y fallan antes de implementar.
- Core antes que servidor, servidor antes que cliente y cliente antes que adaptador.

### Parallel Opportunities

- T003 y T005 (archivos distintos) en paralelo en la Fase 2.
- T007 a T010 en paralelo (cuatro archivos de prueba).
- T015 a T018 en paralelo, y T025 a T027 en paralelo.
- T020 a T022 en paralelo.
- US2, US3 y US4 en paralelo una vez cerrada US1.
- T029 y T030 en paralelo.

---

## Parallel Example: User Story 1

```text
# Pruebas de US1 en paralelo (archivos distintos):
Task: "T007 Pruebas de calcularCapacidadPago en src/mcp/core-simulado.test.ts"
Task: "T008 Pruebas de la herramienta en src/mcp/servidor.test.ts"
Task: "T009 Pruebas del cliente en src/agente/cliente-core.test.ts"
Task: "T010 Pruebas del adaptador en src/agente/adaptador.test.ts"

# Implementación en cadena (cada capa usa la anterior):
T011 core → T012 servidor → T013 cliente → T014 adaptador
```

---

## Implementation Strategy

### MVP First (US1 y US2)

1. Fase 1: Setup (T001).
2. Fase 2: Foundational (T002 a T006), en rojo y luego en verde.
3. Fase 3: US1 (T007 a T014).
4. Fase 4: US2 (T015 a T019).
5. **Detenerse y validar**: Escenarios 1 a 3 del quickstart. Con US1 y US2 ya se simula sin comprometer nada.

### Incremental Delivery

1. Setup + Foundational → la cuota y el contrato en verde.
2. US1 → simulación de punta a punta (MVP).
3. US2 → garantía de solo lectura y sin identidad.
4. US3 → el modelo distingue simular de preaprobar.
5. US4 → entradas inválidas probadas en cada capa.
6. Polish → documentación y verificación con el modelo real.

---

## Notes

- Las tareas T019, T024 y T028 son de verificación con arreglo: si la prueba ya pasa, no se cambia código y se deja constancia en el commit.
- La Regla 2 (monto ≤ $5.000.000 y cuota ≤ 30%) no se implementa aquí: es del #14. Esta feature solo informa la proporción.
- `preaprobar_credito` se cita en la descripción pero se crea en el #14; no se crea ninguna herramienta con ese nombre.
- Los commits referencian el issue: `feat: … (#12)`.
