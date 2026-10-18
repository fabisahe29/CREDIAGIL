# Feature Specification: Preaprobación automática dentro de la política

**Feature Branch**: `14-preaprobacion-automatica-dentro-de-la`

**Created**: 2026-10-18

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#14 — Preaprobación automática dentro de la política](https://github.com/fabisahe29/CREDIAGIL/issues/14)

**Épica / Milestone**: `epica:agente-originacion` · `regla-de-negocio` · M2 · Agente MVP · **Depende de**: #12 y #13 (Done)

**Trazabilidad con el enunciado**: Reglas 1 y 2 · Comportamientos 2 y 3 · Casos de prueba 1, 4 y 5

**Input**: Contenido del issue #14, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-18

- Q: ¿Qué incluye la preaprobación emitida: solo la constancia de que cumple la política, o además una vigencia y condiciones? → A: Solo la constancia: la solicitud pasa a «preaprobada» con la decisión explicable (regla, valores usados, motivo y marca de tiempo), sin vigencia ni condiciones; el agente aclara que la decisión definitiva la toma un analista.
- Q: Ante un monto fuera del umbral, ¿el agente puede ofrecer un monto o plazo alternativo que sí cumpla, o siempre escala? → A: Siempre escala: el caso va a un analista sin que el agente ofrezca alternativas; el solicitante puede explorar montos y plazos con la simulación de cuota (#12), que no compromete a nada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preaprobar automáticamente un caso simple que cumple la política (Priority: P1)

Como Crediágil, quiero que el agente preapruebe automáticamente solo los casos simples que cumplen la política, para agilizar la originación sin asumir riesgos por fuera de ella.

**Why this priority**: es el producto de la feature y la única decisión automática que compromete a la fintech (Regla 2). Sin ella, todo caso simple espera a un analista.

**Independent Test**: con una solicitud registrada de un solicitante con identidad verificada, de hasta $5.000.000, cuya cuota no supera el 30% del ingreso verificado y sin discrepancia de ingresos, se pide la preaprobación y queda emitida, con la regla aplicada, los valores usados y el motivo.

**Acceptance Scenarios**:

1. **Given** una solicitud registrada de $4.000.000 a 24 meses, con ingreso verificado de $3.800.000 y sin discrepancia, **When** se pide la preaprobación, **Then** se emite y se explica con la regla, los valores usados y el motivo.
2. **Given** una solicitud registrada de exactamente $5.000.000 cuya cuota está dentro del 30% del ingreso verificado, **When** se pide la preaprobación, **Then** se emite: el monto límite se preaprueba.
3. **Given** una solicitud registrada cuya cuota es exactamente el 30% del ingreso verificado, y de hasta $5.000.000, **When** se pide la preaprobación, **Then** se emite: la relación límite se preaprueba.
4. **Given** una solicitud ya preaprobada, **When** se pide la preaprobación otra vez, **Then** se devuelve la misma preaprobación y no se crea otra.

---

### User Story 2 - La preaprobación se bloquea fuera de la política y el agente escala (Priority: P1)

Como Crediágil, quiero que la preaprobación se bloquee por código cuando el caso no cumple la política, sin importar lo que digan el prompt o el modelo, y que el agente escale en lugar de insistir, para no asumir riesgos por fuera de ella.

**Why this priority**: la preaprobación compromete a la fintech: una sola emitida fuera de política invalida la solución. Va al mismo nivel que la historia 1, porque sin esta garantía emitir no es seguro.

**Independent Test**: una prueba intenta preaprobar sin identidad verificada, con un monto de $5.000.001, con una cuota por encima del 30% y con una discrepancia registrada, sin llamar al modelo, y comprueba que cada intento se bloquea y que no queda ninguna preaprobación.

**Acceptance Scenarios**:

1. **Given** una conversación sin identidad verificada, **When** se intenta preaprobar, **Then** se bloquea y no se emite nada.
2. **Given** una solicitud registrada de $5.000.001, **When** se intenta preaprobar, **Then** se bloquea porque el monto supera el tope.
3. **Given** una solicitud registrada cuya cuota supera el 30% del ingreso verificado, **When** se intenta preaprobar, **Then** se bloquea porque la cuota supera el porcentaje máximo.
4. **Given** una solicitud registrada con una discrepancia de ingresos, **When** se intenta preaprobar, **Then** se bloquea.
5. **Given** un bloqueo de la preaprobación, **When** el modelo recibe la respuesta, **Then** recibe un motivo accionable y el agente escala el caso a un analista, sin insistir ni buscar otra vía, y la interfaz de chat muestra el bloqueo y el escalamiento al solicitante.
6. **Given** un modelo que envía un monto, una cuota o un ingreso distintos de los de la solicitud registrada, **When** intenta preaprobar, **Then** la decisión se toma con los datos de la solicitud registrada y no con lo que el modelo envíe.

---

### User Story 3 - Solo se preaprueba una solicitud registrada y el modelo distingue simular de preaprobar (Priority: P2)

Como responsable de cumplimiento, quiero que la preaprobación solo opere sobre una solicitud registrada y que su descripción deje claro que compromete a la fintech y cuándo corresponde frente a la simulación de cuota, para que el modelo no preapruebe cuando solo se explora.

**Why this priority**: protege el orden del flujo (identificar, registrar, decidir), pero depende de que la preaprobación de la historia 1 exista.

**Independent Test**: se intenta preaprobar sin una solicitud registrada y se comprueba el rechazo; y se revisa que la descripción de la herramienta diga que compromete a la fintech y cuándo se usa cada una.

**Acceptance Scenarios**:

1. **Given** una conversación sin solicitud registrada, **When** se intenta preaprobar, **Then** se rechaza y no se emite nada.
2. **Given** el texto con el que se anuncia la preaprobación al modelo, **When** se lee, **Then** dice que compromete a la fintech, que solo corresponde con una solicitud registrada y que, para explorar o preguntar cuánto se pagaría, se usa la simulación de cuota.

---

### Edge Cases

- Monto de exactamente $5.000.000 y cuota de exactamente el 30% del ingreso verificado: se preaprueban (US1, escenarios 2 y 3).
- Monto de $5.000.001 o cuota un peso por encima del 30%: se bloquean y el caso va a un analista; el agente no propone un monto o plazo alternativo (FR-017).
- Solicitud registrada sin verificación de ingreso, o con un estado de verificación que no es «verificado» (inconsistencia, ingreso declarado faltante, sin ingreso): no hay ingreso verificado sobre el cual decidir y no se preaprueba; el caso va a un analista.
- Solicitud registrada con discrepancia de ingresos, aunque el ingreso verificado exista: se bloquea.
- Una cuota que no se puede calcular (monto o plazo fuera de rango): no se preaprueba y el caso va a un analista.
- El core no responde al consultar la solicitud o la identidad tras los reintentos: se bloquea y se escala; nunca se decide sin respuesta.
- Conversación ya escalada por la Regla 4 o la Regla 5 (petición de humano, moneda extranjera o documento no soportado): la preaprobación no se ejecuta.
- Reintento de una preaprobación por una falla transitoria: no duplica la preaprobación.
- El solicitante verificado en la conversación es otra persona que el dueño de la solicitud registrada: se bloquea, la verificación no se transfiere.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST ofrecer una acción de preaprobar que solo opere sobre una solicitud registrada (#13) y devuelva la preaprobación con la regla aplicada, los valores usados y el motivo.
- **FR-002**: La descripción de la acción MUST decir que compromete a la fintech, que solo corresponde con una solicitud registrada y cuándo se usa frente a la simulación de cuota (#12), sin dar al modelo el tope ni el porcentaje.
- **FR-003**: Un hook del Agent SDK MUST bloquear la preaprobación si la identidad del solicitante no está verificada, si el monto supera $5.000.000, si la cuota supera el 30% del ingreso verificado o si hay una discrepancia de ingresos registrada.
- **FR-004**: El hook MUST decidir con los datos de la solicitud registrada, recalculando la cuota y su relación con el ingreso verificado; no MUST confiar en montos, cuotas ni ingresos que el modelo pase como argumento.
- **FR-005**: Los límites MUST preaprobarse: $5.000.000 exactos y una relación cuota/ingreso del 30% exacto.
- **FR-006**: La Regla 2 MUST evaluarse con aritmética entera, sin comparaciones sobre flotantes sin redondeo definido, y el tope y el porcentaje MUST vivir en el módulo único de política, versionado.
- **FR-007**: Cuando la preaprobación se bloquea, el agente MUST escalar el caso a un analista en lugar de insistir o buscar otra vía; el bloqueo MUST devolver al modelo un motivo accionable y mostrarse en la interfaz de chat con su regla.
- **FR-008**: El servidor MUST aplicar por su cuenta las reglas críticas: rechaza la preaprobación sin identidad verificada, sin solicitud registrada, fuera de política o con discrepancia registrada, aunque el hook ya la haya dejado pasar.
- **FR-009**: Una solicitud sin ingreso verificado, o con un estado de verificación distinto de «verificado», MUST NOT preaprobarse y MUST ir a un analista.
- **FR-010**: Si no se puede comprobar el estado de la identidad o de la solicitud (el core no responde tras los reintentos), la preaprobación MUST bloquearse y la conversación escalar; nunca se decide sin respuesta.
- **FR-011**: La preaprobación MUST ser idempotente por una clave de idempotencia por solicitud: repetirla devuelve la misma preaprobación sin duplicarla.
- **FR-012**: Cada decisión (preaprobación o bloqueo) MUST dejar un registro de auditoría con la regla aplicada, las entradas relevantes, el resultado y la marca de tiempo, y un log con el `correlationId`, sin el contenido completo de los documentos.
- **FR-013**: Los hooks MUST tener pruebas que no dependen del modelo, incluidos los límites exactos y el valor inmediatamente por encima y por debajo de cada uno.
- **FR-014**: Una preaprobación MUST respetar el orden de evaluación obligatorio: las reglas 4, 5, 1 y 3 se evalúan antes que la Regla 2.
- **FR-015**: Los datos de los casos y de las pruebas MUST ser exclusivamente ficticios.
- **FR-016**: La preaprobación emitida MUST ser solo la constancia de que el caso cumple la política: deja la solicitud registrada en estado «preaprobada» y guarda la decisión explicable (regla, valores usados, motivo y marca de tiempo). No lleva vigencia ni condiciones, y el agente MUST aclarar al solicitante que la decisión definitiva la toma un analista.
- **FR-017**: Ante una solicitud fuera de la política, incluido un monto por encima de $5.000.000, el agente MUST escalar el caso a un analista sin ofrecer ni proponer un monto o plazo alternativo que sí cumpla; el solicitante puede explorar alternativas por su cuenta con la simulación de cuota (#12), que no compromete a nada.

### Key Entities *(include if feature involves data)*

- **Preaprobación**: la decisión automática de que una solicitud registrada cumple la política. Lleva la solicitud a la que corresponde, la regla aplicada, los valores usados (monto, cuota, ingreso verificado y la relación), el motivo y la marca de tiempo. Es solo una constancia, sin vigencia ni condiciones, y deja la solicitud en estado «preaprobada». Compromete a la fintech.
- **Solicitud registrada**: la solicitud guardada en el core por el #13, con solicitante verificado, monto, plazo, ingreso declarado, verificación de ingreso y datos extraídos con su procedencia. Es la única fuente de la decisión.
- **Decisión de política**: el resultado explicable de evaluar la Regla 2: permitida o bloqueada, con la regla, los valores y el motivo. Se calcula en código, nunca por el modelo.
- **Umbrales de la Regla 2**: el tope de monto de $5.000.000 y el 30% máximo de la relación cuota/ingreso verificado, en el módulo único de política.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los intentos de preaprobar fuera de la política (sin identidad verificada, monto por encima del tope, cuota por encima del 30% o con discrepancia registrada) se bloquean y no dejan ninguna preaprobación.
- **SC-002**: El 100% de los casos que están exactamente en el límite ($5.000.000 y 30% de relación cuota/ingreso) se preaprueban, y el 100% de los que están un peso por encima se bloquean.
- **SC-003**: Ninguna preaprobación se emite sobre una conversación sin solicitud registrada.
- **SC-004**: Las pruebas de los hooks corren sin red ni modelo y dan el mismo resultado en todas las ejecuciones.
- **SC-005**: Cuando se bloquea una preaprobación, el solicitante ve en el chat, en el mismo turno, el motivo y que su caso pasa a un analista.
- **SC-006**: Repetir una preaprobación con la misma clave de idempotencia deja una sola preaprobación en el 100% de los casos.

## Assumptions

- La solicitud registrada, el ingreso verificado y la discrepancia ya existen en el core por el #13 y el #11; esta feature los lee y recalcula la decisión, no los modifica.
- La cuota se calcula con la misma función de la simulación del #12 (sistema francés, tasa fija de 1,8% mensual), de modo que la cifra que ve el solicitante al simular es la que usa la política al decidir.
- Una solicitud con «discrepancia de ingresos registrada» es la que tiene un estado de verificación de discrepancia; cualquier estado de verificación distinto de «verificado» también impide preaprobar (FR-009).
- Si el modelo no registró una solicitud (por ejemplo, tras una discrepancia, fallo conocido del #13), la preaprobación se rechaza por falta de solicitud registrada: el caso queda a salvo.
- El escalamiento con entrega completa al analista (resumen estructurado, handoff) es del #15; aquí el agente escala por el mecanismo existente y muestra el motivo.
- La moneda es el peso colombiano; otras monedas y documentos no soportados ya escalan por la Regla 5 antes de llegar a la preaprobación.
- El tope y el porcentaje de la Regla 2 se agregan en este ticket al módulo único de política, con la versión de la política incrementada.
- Las dos preguntas que el issue reservó para la aclaración se resolvieron en la sesión de `/speckit.clarify` del 2026-10-18 (ver Clarifications).
