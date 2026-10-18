# Feature Specification: Registro de la solicitud con procedencia

**Feature Branch**: `13-registro-de-la-solicitud-con-procedencia`

**Created**: 2026-10-18

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#13 — Registro de la solicitud con procedencia](https://github.com/fabisahe29/CREDIAGIL/issues/13)

**Épica / Milestone**: `epica:agente-originacion` · `regla-de-negocio` · M2 · Agente MVP · **Depende de**: #9, #10 y #11 (Done)

**Trazabilidad con el enunciado**: Regla 1 · Comportamientos 2 y 7 · Caso de prueba 5

**Input**: Contenido del issue #13, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-18

- Q: Si la identidad está verificada pero ya se sabe que la solicitud irá a un analista, ¿se registra igual? → A: Sí, se registra siempre que la identidad esté verificada; la decisión posterior (preaprobar o escalar) es de #14 y #15 y el registro no la anticipa.
- Q: Además del hook, ¿el servidor del core rechaza por su cuenta el registro sin identidad verificada? → A: Sí, como defensa en profundidad (Principio IV): rechaza con un error explícito el registro sin identidad verificada o de otra persona, aunque el hook lo haya dejado pasar.
- Q: Si el solicitante ya tiene una solicitud abierta y se intenta registrar otra con una clave de idempotencia distinta, ¿qué pasa? → A: Se rechaza con un error explícito que indica la solicitud abierta; no se guarda nada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar una solicitud con la procedencia de cada dato (Priority: P1)

Como responsable de cumplimiento, quiero que una solicitud se registre con solicitante, monto, plazo, ingreso declarado, ingreso verificado, discrepancias y datos extraídos, y que cada dato lleve su origen (el documento y el fragmento de donde salió), para poder auditar cualquier solicitud y explicar de dónde salió cada cifra.

**Why this priority**: es el producto de la feature. Sin un registro con procedencia, el analista y el auditor no pueden reconstruir ni justificar una solicitud (Comportamiento 7).

**Independent Test**: con un solicitante de identidad verificada, documentos extraídos y un ingreso verificado, se registra la solicitud y se consulta: aparecen todos los datos y cada uno trae su documento y su fragmento de origen.

**Acceptance Scenarios**:

1. **Given** un solicitante con identidad verificada, un monto y un plazo dichos por él, y un ingreso verificado a partir de sus documentos, **When** se registra la solicitud, **Then** queda guardada con solicitante, monto, plazo, ingreso declarado, ingreso verificado, discrepancias y datos extraídos.
2. **Given** una solicitud registrada, **When** se consulta, **Then** cada dato guardado indica el documento y el fragmento de origen, o la afirmación del solicitante de la que salió cuando no viene de un documento.
3. **Given** una solicitud cuyo ingreso declarado difiere del verificado, **When** se registra, **Then** la discrepancia queda guardada con los dos valores y el porcentaje de diferencia, y no se oculta ni se corrige.
4. **Given** la misma solicitud enviada dos veces con la misma clave de idempotencia, **When** se registra la segunda vez, **Then** se devuelve la solicitud ya registrada y no se crea otra.

---

### User Story 2 - Ninguna solicitud se registra sin identidad verificada (Priority: P1)

Como responsable de cumplimiento, quiero que el registro se bloquee si la identidad del solicitante no está verificada, sin importar lo que digan el prompt o el modelo, para cumplir la Regla 1 con una garantía de código y no con una instrucción al modelo.

**Why this priority**: la Regla 1 es no negociable y un solo registro sin identidad verificada invalida la solución. Va al mismo nivel que la historia 1: sin ella, registrar no es seguro.

**Independent Test**: una prueba intenta registrar sin identidad verificada, sin llamar al modelo, y comprueba que el registro se bloquea y que no queda ninguna solicitud guardada.

**Acceptance Scenarios**:

1. **Given** una conversación sin identidad verificada, **When** se intenta registrar una solicitud, **Then** el registro se bloquea y no se guarda nada.
2. **Given** un bloqueo por identidad, **When** el modelo recibe la respuesta, **Then** recibe un motivo accionable que le dice qué falta (verificar la identidad) y la interfaz de chat muestra el bloqueo al solicitante.
3. **Given** una conversación con identidad verificada de una persona y un intento de registrar a otra, **When** se intenta registrar, **Then** se bloquea: la verificación no se transfiere.
4. **Given** un modelo que afirma o argumenta que la identidad ya está verificada, **When** intenta registrar, **Then** la decisión sale del estado de verificación que guarda el sistema, no de lo que diga el modelo ni de los argumentos que envíe.

---

### User Story 3 - Un dato sin procedencia se rechaza (Priority: P2)

Como responsable de cumplimiento, quiero que un dato sin procedencia se rechace como error de validación, para que no entre al registro nada que no se pueda auditar.

**Why this priority**: protege la calidad del registro, pero depende de que el registro de la historia 1 exista.

**Independent Test**: se intenta registrar con un dato al que le falta el documento o el fragmento de origen y se comprueba un error de validación que nombra el dato, sin que se guarde la solicitud.

**Acceptance Scenarios**:

1. **Given** un registro en el que un dato no trae procedencia, **When** se intenta registrar, **Then** se rechaza con un error de validación no reintentable que indica qué dato no tiene procedencia.
2. **Given** un dato cuya procedencia apunta a un documento que no está entre los extraídos de la conversación, **When** se intenta registrar, **Then** se rechaza como error de validación.
3. **Given** un registro rechazado por falta de procedencia, **When** se consulta el estado, **Then** no existe ninguna solicitud guardada ni parcial.

---

### Edge Cases

- Solicitante con identidad verificada de otra persona distinta de la que se quiere registrar: se bloquea (Regla 1).
- La identidad se verificó, pero el core no responde al consultar su estado: se bloquea y no se registra; nunca se decide sin respuesta.
- Registro sin ingreso verificado (no hay documentos de ingreso o el ingreso no se pudo verificar): se registra igual (FR-015) con el ingreso verificado sin valor y sin procedencia inventada; no se inventa ni se completa.
- Datos faltantes en los documentos extraídos: el campo queda sin valor y sin procedencia inventada; no se rellena.
- Moneda extranjera o documento no soportado: ya escalan por la Regla 5 antes de llegar al registro; no se registran como solicitud.
- Un fragmento de procedencia que no aparece en el contenido del documento: se rechaza como error de validación.
- Reintento de un registro por una falla transitoria: no duplica la solicitud.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST ofrecer una acción de registrar la solicitud que guarde solicitante, monto, plazo, ingreso declarado, ingreso verificado, discrepancias y datos extraídos, cada uno con su procedencia.
- **FR-002**: La procedencia de un dato extraído de un documento MUST incluir el documento (número de adjunto y nombre) y el fragmento literal de donde salió.
- **FR-003**: Un dato que el solicitante dice en la conversación y que no viene de un documento (monto, plazo e ingreso declarado) MUST registrarse con su procedencia, que es la afirmación del solicitante de la que salió.
- **FR-004**: El ingreso verificado y las discrepancias MUST tomarse de la verificación de ingreso que ya guarda el sistema, nunca de valores que envíe el modelo.
- **FR-005**: Un dato sin procedencia, o con una procedencia que no se puede comprobar, MUST rechazarse como error de validación no reintentable que nombra el dato; no se guarda ninguna solicitud parcial.
- **FR-006**: Un hook del Agent SDK MUST bloquear el registro si la identidad del solicitante no está verificada, sin importar lo que digan el prompt o el modelo.
- **FR-007**: El hook MUST decidir con el estado de verificación confiable que guarda el sistema (#9), no con argumentos que le pase el modelo.
- **FR-008**: La identidad verificada MUST ser la del solicitante que se registra; la verificación de una persona no habilita el registro de otra.
- **FR-009**: Si no se puede comprobar el estado de la identidad (el core no responde tras los reintentos), el registro MUST bloquearse y la conversación escalar; nunca se decide sin respuesta.
- **FR-010**: El bloqueo MUST devolver al modelo un motivo accionable y mostrarse en la interfaz de chat como un evento de negocio con su regla (Regla 1).
- **FR-011**: El registro MUST ser idempotente por una clave de idempotencia por solicitud: repetirlo con la misma clave devuelve la solicitud ya registrada sin duplicarla.
- **FR-012**: Cada registro MUST dejar un registro de auditoría con regla aplicada, entradas relevantes, resultado y marca de tiempo, y un log con el `correlationId`, sin el contenido completo de los documentos.
- **FR-013**: La prueba de bloqueo MUST ejecutarse sin el modelo real: simula la llamada de registro con la identidad sin verificar y comprueba el bloqueo.
- **FR-014**: Los datos de los casos y de las pruebas MUST ser exclusivamente ficticios.
- **FR-015**: El registro MUST aceptar toda solicitud con identidad verificada, incluso una que ya se sabe que irá a un analista (discrepancia de ingreso, monto alto o inconsistencia entre documentos). El registro no decide ni anticipa la preaprobación ni el escalamiento (#14 y #15) y conserva la discrepancia tal cual.
- **FR-016**: Además del hook, el servidor MUST aplicar la Regla 1 por su cuenta: rechaza con un error explícito el registro sin identidad verificada, o con una identidad verificada que no es la del solicitante que se registra, aunque el hook lo haya dejado pasar. No se guarda nada al rechazar.
- **FR-017**: Si el solicitante ya tiene una solicitud abierta, un registro nuevo con una clave de idempotencia distinta MUST rechazarse con un error explícito que indica la solicitud abierta; no se guarda nada. Repetir la misma clave sigue devolviendo la solicitud ya registrada (FR-011).

### Key Entities *(include if feature involves data)*

- **Solicitud registrada**: la solicitud guardada en el core. Reúne el solicitante verificado, el monto, el plazo, el ingreso declarado, el ingreso verificado, las discrepancias y los datos extraídos, y la clave de idempotencia con la que se registró. Está ligada a una conversación.
- **Dato registrado**: un valor de la solicitud junto con su procedencia. Un dato sin procedencia no existe.
- **Procedencia**: el origen de un dato. Para un dato de un documento es el documento (adjunto y nombre) y el fragmento literal. Para un dato dicho por el solicitante es su afirmación en la conversación.
- **Discrepancia**: diferencia entre el ingreso declarado y el verificado, con los dos valores y su diferencia porcentual.
- **Estado de identidad verificada**: lo que guarda el sistema sobre quién fue verificado en la conversación (#9). Es la única fuente para autorizar el registro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los intentos de registrar sin identidad verificada se bloquean y no dejan ninguna solicitud guardada.
- **SC-002**: El 100% de las solicitudes registradas permite ver, para cada dato, de qué documento y de qué fragmento salió, o la afirmación del solicitante de la que salió.
- **SC-003**: El 100% de los intentos de registrar con un dato sin procedencia se rechazan con un error que nombra el dato.
- **SC-004**: La prueba de bloqueo corre sin red ni modelo y da el mismo resultado en todas las ejecuciones.
- **SC-005**: Repetir un registro con la misma clave de idempotencia deja una sola solicitud en el 100% de los casos.
- **SC-006**: Cuando se bloquea un registro, el solicitante ve en el chat el motivo y el siguiente paso en el mismo turno.

## Assumptions

- Un dato que el solicitante dice en la conversación y no viene de un documento (monto, plazo e ingreso declarado) lleva como procedencia su afirmación; el issue pide «documento y fragmento» para los datos extraídos, y se confirma en el plan cómo se expresa.
- La identidad verificada, el ingreso verificado, las discrepancias y los datos extraídos ya existen en el core por el #9, el #10 y el #11; esta feature los lee, no los recalcula.
- La preaprobación, la decisión de la Regla 2 y el escalamiento con handoff son de otros tickets (#14 y #15); aquí solo se registra.
- La moneda es el peso colombiano; otras monedas y documentos no soportados ya escalan por la Regla 5.
- Se reutiliza el control de identidad del #9, que ya reserva un lugar para la herramienta de registro.
- Las tres preguntas que el issue reservó para la aclaración se resolvieron en la sesión de `/speckit.clarify` del 2026-10-18 (ver Clarifications).
