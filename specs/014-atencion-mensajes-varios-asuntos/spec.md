# Feature Specification: Atención de mensajes con varias preocupaciones

**Feature Branch**: `16-atencion-de-mensajes-con-varias`

**Created**: 2026-10-18

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#16 — Atención de mensajes con varias preocupaciones](https://github.com/fabisahe29/CREDIAGIL/issues/16)

**Épica / Milestone**: `epica:agente-originacion` · M2 · Agente MVP · **Depende de**: #12, #14 y #15

**Trazabilidad con el enunciado**: Comportamiento 8 · Caso de prueba 1

**Input**: Contenido del issue #16, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-18

- Q: Si el solicitante pide hablar con una persona y en el mismo mensaje pregunta por la cuota, ¿el agente escala de inmediato sin calcular la cuota, o la calcula antes de escalar? → A: Escala de inmediato sin calcular la cuota. La pregunta por la cuota queda en el resumen para el analista como asunto pendiente, y la respuesta al solicitante la menciona como pendiente de revisión por el analista.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Que cada asunto del mensaje reciba atención (Priority: P1)

Como solicitante, quiero que el agente atienda todo lo que pregunté en un mismo mensaje, para no tener que repetir mis preguntas.

**Why this priority**: un mensaje típico mezcla la solicitud, los documentos y la pregunta por la cuota. Si el agente atiende solo uno, el solicitante se queda sin respuesta en los demás; es el núcleo del ticket.

**Independent Test**: se envía un mensaje que mezcla una solicitud de crédito, un documento adjunto y una pregunta por la cuota, y se verifica que cada asunto fue identificado y resuelto.

**Acceptance Scenarios**:

1. **Given** un mensaje con una solicitud, un documento adjunto y una pregunta por la cuota, **When** el agente lo procesa, **Then** identifica los tres asuntos y resuelve cada uno.
2. **Given** un mensaje con un solo asunto, **When** el agente lo procesa, **Then** lo resuelve igual que antes, sin pasos ni preguntas adicionales.
3. **Given** un mensaje con varios asuntos, **When** el agente termina, **Then** ningún asunto planteado por el solicitante queda sin atender ni sin mencionar.

---

### User Story 2 - Recibir una sola respuesta que indique el estado de cada asunto (Priority: P1)

Como solicitante, quiero recibir una única respuesta que cubra todos los asuntos e indique el estado de cada uno, para entender de un vistazo qué se resolvió y qué no.

**Why this priority**: resolver todo pero contestar por partes, o sin decir cómo quedó cada asunto, deja al solicitante sin saber dónde está parado.

**Independent Test**: se envía un mensaje con varios asuntos y se cuenta cuántas respuestas finales recibe el solicitante y qué estado se informa por asunto.

**Acceptance Scenarios**:

1. **Given** un mensaje con varios asuntos, **When** el agente responde, **Then** el solicitante recibe una sola respuesta final.
2. **Given** esa respuesta, **When** el solicitante la lee, **Then** cada asunto aparece con su estado: resuelto, pendiente o escalado a un analista.
3. **Given** un asunto resuelto con un resultado (por ejemplo, la cuota simulada), **When** se informa su estado, **Then** el resultado aparece en la respuesta junto con el estado.

---

### User Story 3 - Que un asunto pendiente o escalado no bloquee a los demás (Priority: P2)

Como solicitante, quiero que, si un asunto queda pendiente o se escala, los demás se resuelvan igual cuando es posible, para no perder la parte del mensaje que sí se podía atender.

**Why this priority**: sin esto, un solo problema (un dato faltante, un caso escalado) deja todo el mensaje sin respuesta, que es el defecto que el ticket quiere evitar.

**Independent Test**: se envía un mensaje cuyo asunto A queda pendiente o escalado y cuyo asunto B es independiente, y se verifica que B se resuelve.

**Acceptance Scenarios**:

1. **Given** un mensaje con un asunto que queda pendiente por un dato faltante y otro independiente, **When** el agente lo procesa, **Then** el segundo se resuelve y el primero se informa como pendiente con lo que falta.
2. **Given** un mensaje con un asunto que se escala a un analista y otro independiente que la política sí cubre, **When** el agente lo procesa, **Then** el segundo se resuelve y el primero se informa como escalado.
3. **Given** un asunto que depende de otro que no se pudo resolver, **When** el agente responde, **Then** el dependiente queda pendiente con el motivo, sin inventar datos para completarlo.

---

### User Story 4 - Responder el mensaje de ejemplo del enunciado con la cuota y el estado de la solicitud (Priority: P2)

Como evaluador del producto, quiero que, con el mensaje de ejemplo del enunciado, la respuesta incluya la cuota simulada y el estado de la solicitud, para validar el caso de prueba 1.

**Why this priority**: es el caso de prueba que el enunciado fija para este comportamiento; sin él no hay forma objetiva de dar el ticket por cumplido.

**Independent Test**: se ejecuta el caso de prueba con el mensaje de ejemplo y se verifica que la respuesta única trae la cuota simulada y el estado de la solicitud.

El mensaje de ejemplo del enunciado es, literalmente: «Hola, quiero pedir un crédito de $4.000.000 a 24 meses. Te pego mi certificado laboral y mis extractos de los últimos tres meses. Gano más o menos $3.500.000 al mes. ¿En cuánto me quedaría la cuota?»

**Acceptance Scenarios**:

1. **Given** el mensaje de ejemplo del enunciado, **When** el agente responde, **Then** la respuesta incluye la cuota simulada.
2. **Given** el mismo mensaje, **When** el agente responde, **Then** la respuesta incluye el estado de la solicitud.
3. **Given** el mismo mensaje con el certificado y los tres extractos adjuntos, **When** el agente responde, **Then** identifica tres asuntos (la solicitud de $4.000.000 a 24 meses, los documentos y la pregunta por la cuota) y la respuesta indica el estado de cada uno.

---

### Edge Cases

- ¿Qué pasa si el solicitante pide hablar con una persona y además pregunta por la cuota? Se escala de inmediato sin calcular la cuota; la pregunta queda como asunto pendiente para el analista (FR-006).
- ¿Qué pasa si un asunto no se puede entender o clasificar? Se informa como pendiente con lo que falta; no se supone ni se rellena.
- ¿Qué pasa si el mismo mensaje trae dos asuntos del mismo tipo (por ejemplo, dos preguntas por la cuota con montos distintos)? Cada uno se atiende y aparece por separado en la respuesta.
- ¿Qué pasa si el solicitante no está identificado y su mensaje incluye registrar la solicitud? El registro queda pendiente hasta verificar la identidad (Regla 1); los asuntos independientes se resuelven.
- ¿Qué pasa si un documento adjunto es de un tipo no soportado o está en moneda extranjera? La política obliga a escalar (Regla 5); el asunto se informa como escalado y los independientes se resuelven.
- ¿Qué pasa si el mensaje incluye datos de solicitantes reales? Está fuera de lo permitido; solo se manejan datos ficticios (Principio II).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El agente MUST identificar cada asunto distinto de un mensaje del solicitante, como la solicitud, los documentos adjuntos y la pregunta por la cuota, y MUST resolver cada uno cuando la política lo permite.
- **FR-002**: El agente MUST dar una sola respuesta final por mensaje, que cubra todos los asuntos identificados.
- **FR-003**: La respuesta final MUST indicar el estado de cada asunto: resuelto, pendiente o escalado a un analista; los asuntos resueltos MUST incluir su resultado.
- **FR-004**: Si un asunto queda pendiente o se escala, el agente MUST resolver igualmente los asuntos independientes de él cuando sea posible, y MUST NOT dejar sin atender ninguno por ese motivo.
- **FR-005**: Un asunto que depende de otro no resuelto MUST quedar pendiente con el motivo explícito; el agente MUST NOT inventar datos ni suponer valores para completarlo.
- **FR-006**: Cuando el solicitante pide hablar con una persona y además plantea otros asuntos, como la pregunta por la cuota, el sistema MUST aplicar la Regla 4: escalar de inmediato, sin calcular la cuota ni ejecutar otra acción sobre el caso. Los demás asuntos del mensaje MUST quedar en el resumen para el analista como pendientes, y la respuesta al solicitante MUST indicarlos como pendientes de revisión por el analista.
- **FR-007**: La atención de varios asuntos MUST NOT relajar ni reordenar las reglas de negocio: el orden de evaluación (Regla 4, Regla 5, Regla 1, Regla 3, Regla 2) y los umbrales se aplican igual que con un mensaje de un solo asunto.
- **FR-008**: Con el mensaje de ejemplo del enunciado, la respuesta MUST incluir la cuota simulada y el estado de la solicitud.
- **FR-009**: Un mensaje con un solo asunto MUST seguir atendiéndose como hasta ahora, sin pasos ni preguntas adicionales.
- **FR-010**: Cada decisión tomada al atender un mensaje con varios asuntos MUST dejar el mismo registro de auditoría que si se hubiera tomado en mensajes separados, bajo un mismo identificador de correlación.

### Key Entities *(include if feature involves data)*

- **Mensaje del solicitante**: entrada con uno o más asuntos, que puede traer documentos adjuntos.
- **Asunto**: cada petición o pregunta distinta del mensaje. Atributos: tipo (solicitud, documentos, cuota), estado (resuelto, pendiente, escalado), resultado o motivo, dependencia de otro asunto.
- **Respuesta unificada**: la única respuesta final al mensaje. Contiene el estado y el resultado o motivo de cada asunto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100% de los mensajes de prueba con varios asuntos, la respuesta indica el estado de cada asunto planteado.
- **SC-002**: En el 100% de los mensajes de prueba, el solicitante recibe una sola respuesta final.
- **SC-003**: Con el mensaje de ejemplo del enunciado, la respuesta incluye la cuota simulada y el estado de la solicitud.
- **SC-004**: En los mensajes de prueba donde un asunto queda pendiente o escalado, el 100% de los asuntos independientes se resuelve.
- **SC-005**: Los casos de prueba de las reglas de negocio ya existentes (identidad, ingreso, preaprobación y escalamiento) mantienen el mismo resultado después del cambio.

## Assumptions

- Los asuntos que el agente identifica son los que ya sabe atender: la solicitud de crédito, los documentos de soporte y la pregunta por la cuota; añadir otros tipos de asunto queda fuera de este ticket.
- El mensaje de ejemplo del enunciado es el que cita la historia 4, tal como lo entregó el desarrollador. El ingreso que dice («más o menos $3.500.000») es una declaración, no un dato verificado: la cuota simulada se presenta como no vinculante con ingreso declarado.
- Un asunto es independiente de otro cuando puede resolverse sin el resultado del otro: por ejemplo, la cuota simulada no necesita que la solicitud esté registrada, mientras que registrar la solicitud sí necesita la identidad verificada.
- Escalar la solicitud no impide responder los asuntos informativos que la política cubre, salvo en el caso de la petición de persona, donde la Regla 4 prevalece y los demás asuntos quedan pendientes para el analista (FR-006).
- Los cálculos, la cuota simulada y las decisiones de política son los de #12, #14 y #15; este ticket no los cambia, solo organiza cómo se atienden cuando llegan juntos.
- Todos los datos de solicitantes, documentos e ingresos son ficticios.
