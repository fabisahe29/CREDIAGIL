# Feature Specification: Escalamiento con criterio y handoff al analista

**Feature Branch**: `15-escalamiento-con-criterio-y-handoff-al`

**Created**: 2026-10-18

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#15 — Escalamiento con criterio y handoff al analista](https://github.com/fabisahe29/CREDIAGIL/issues/15)

**Épica / Milestone**: `epica:agente-originacion` · `regla-de-negocio` · M2 · Agente MVP · **Depende de**: #10 y #11

**Trazabilidad con el enunciado**: Reglas 2, 3, 4 y 5 · Comportamientos 9 y 10 · Casos de prueba 3, 4 y 6

**Input**: Contenido del issue #15, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-18

- Q: Si el solicitante pide una persona antes de identificarse, ¿qué datos lleva el resumen? → A: Solo lo que el solicitante dijo hasta ese momento; la identidad y demás datos aparecen como pendientes, sin inventarlos ni buscarlos antes de escalar.
- Q: ¿Qué acción recomendada debe acompañar a cada causa de escalamiento? → A: Catálogo fijo, una acción por causa, definido en el sistema: petición de persona → contactar al solicitante; monto o cuota por encima del umbral → revisar con la simulación de cuota; discrepancia de ingresos → verificar ingresos con soporte; caso no cubierto → revisar manualmente el tipo de documento o la moneda.
- Q: ¿Un caso puede escalarse al analista aunque la solicitud aún no esté registrada? → A: Sí. El caso se escala con los datos que hay; el registro solo se crea cuando la identidad del solicitante está verificada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recibir un resumen autocontenido del caso escalado (Priority: P1)

Como analista de crédito, quiero recibir un resumen estructurado y autocontenido de cada caso escalado, para decidir sin tener que reconstruir la conversación.

**Why this priority**: sin resumen útil, el escalamiento no aporta valor: el analista no tiene acceso a la conversación. Es la base de los demás escenarios.

**Independent Test**: se provoca un escalamiento con datos conocidos y se verifica que el resumen contiene solicitante, monto y plazo, datos extraídos con su procedencia, discrepancias, causa y acción recomendada, sin necesidad de leer la conversación.

**Acceptance Scenarios**:

1. **Given** un caso escalado por discrepancia de ingresos, **When** se genera el handoff, **Then** el resumen incluye solicitante, monto y plazo, cada dato extraído con su procedencia (documento o declaración), la discrepancia encontrada, la causa y la acción recomendada.
2. **Given** un resumen con un campo obligatorio ausente, **When** se valida antes de entregarlo, **Then** el escalamiento no se entrega como completo y el motivo del faltante queda registrado.
3. **Given** un caso escalado, **When** el analista lo abre, **Then** puede decidir solo con el resumen, sin acceder a la conversación.

---

### User Story 2 - Escalar de inmediato cuando el solicitante pide una persona (Priority: P1)

Como solicitante, quiero que, si pido hablar con una persona, el agente me pase de inmediato a un analista, sin que me haga preguntas ni busque mis datos antes.

**Why this priority**: es la Regla 4 de la política, de primer orden en la evaluación. Incumplirla es un error de alto impacto.

**Independent Test**: se envía al agente una petición explícita de hablar con una persona y se verifica que no se invoca ninguna otra herramienta antes del escalamiento.

**Acceptance Scenarios**:

1. **Given** un solicitante que pide hablar con una persona, **When** el agente procesa el mensaje, **Then** el caso se escala sin invocar consulta de identidad, verificación, extracción ni registro.
2. **Given** un mensaje que pide una persona junto con otros datos, **When** se procesa, **Then** la petición de persona prevalece y el escalamiento ocurre antes de cualquier otra acción sobre el caso.

---

### User Story 3 - Escalar cuando el caso supera umbrales, tiene discrepancia o queda fuera de política (Priority: P2)

Como Crediágil, quiero que los casos que superan umbrales, presentan discrepancia de ingresos o quedan fuera de la política se envíen a un analista, para no decidir automáticamente lo que no puedo sostener.

**Why this priority**: son los casos que la política obliga a revisar humanamente (Reglas 2, 3 y 5).

**Independent Test**: se procesan casos de prueba que cumplen cada condición de escalamiento y se verifica la causa registrada en cada uno.

**Acceptance Scenarios**:

1. **Given** una solicitud de monto superior a $5.000.000 COP, **When** se evalúa, **Then** se escala con causa de monto por encima del umbral.
2. **Given** una solicitud cuya cuota supera el 30% del ingreso verificado, **When** se evalúa, **Then** se escala con causa de cuota por encima del porcentaje.
3. **Given** un ingreso declarado que difiere más del 10% del verificado, **When** se evalúa, **Then** se escala con causa de discrepancia de ingresos.
4. **Given** un documento en moneda extranjera o de un tipo no soportado, **When** se procesa, **Then** se escala con causa de caso no cubierto por la política.

---

### User Story 4 - No escalar lo que el agente puede resolver (Priority: P2)

Como Crediágil, quiero que el agente resuelva por sí mismo los casos que puede resolver, para no saturar a los analistas.

**Why this priority**: escalar de más satura a los analistas; es el contrapeso de la historia 3.

**Independent Test**: se procesan casos con un dato faltante que se puede pedir y con varias coincidencias de solicitante que se pueden desambiguar, y se verifica que no hay escalamiento.

**Acceptance Scenarios**:

1. **Given** un caso con un dato faltante que el solicitante puede aportar, **When** se procesa, **Then** el agente pide el dato y no escala.
2. **Given** una búsqueda con varias coincidencias que se pueden desambiguar, **When** se procesa, **Then** el agente desambigua y no escala.

---

### User Story 5 - Informar al solicitante que un analista revisará su caso (Priority: P3)

Como solicitante escalado, quiero una respuesta clara de que un analista revisará mi caso, y que la interfaz lo muestre de forma evidente.

**Why this priority**: cierra la experiencia del escalamiento; no cambia la decisión, pero evita que el solicitante quede esperando sin saber qué pasa.

**Independent Test**: se escala un caso desde la interfaz y se verifica el mensaje al solicitante y el indicador visible de escalamiento.

**Acceptance Scenarios**:

1. **Given** un caso escalado, **When** el agente responde al solicitante, **Then** indica que un analista revisará su caso, sin prometer un resultado.
2. **Given** un caso escalado en la interfaz, **When** se muestra la respuesta, **Then** un indicador visible señala que el caso pasó a un analista.

---

### Edge Cases

- ¿Qué pasa si el solicitante pide una persona y, al mismo tiempo, el caso supera un umbral? La petición de persona prevalece (Regla 4 antes que Regla 2).
- ¿Qué pasa si el caso tiene moneda extranjera y además discrepancia de ingresos? Ambas causas se registran; la causa principal es la de mayor orden en la evaluación.
- ¿Qué pasa si el resumen no puede construirse por datos faltantes? El caso se escala igual, con el faltante explícito, sin inventar datos (Principio V).
- ¿Qué pasa si el escalamiento se pide dos veces para el mismo caso? Se entrega una sola vez; la repetición devuelve el mismo resultado.
- ¿Qué pasa si el resumen contiene datos de solicitantes reales? Está fuera de lo permitido; solo se manejan datos ficticios (Principio II).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST entregar al analista un resumen estructurado y validado con: solicitante, monto y plazo, datos extraídos con su procedencia, discrepancias encontradas, causa del escalamiento y acción recomendada.
- **FR-002**: El sistema MUST rechazar la entrega de un resumen que no pase la validación, e informar qué campo falta o no es válido.
- **FR-003**: Si el solicitante pide explícitamente hablar con una persona, el sistema MUST escalar de inmediato, sin ejecutar ninguna otra acción sobre el caso antes. En ese caso el resumen incluye solo lo que el solicitante dijo hasta ese momento; la identidad y los demás datos aparecen como pendientes (FR-001).
- **FR-004**: El sistema MUST escalar cuando el monto supera $5.000.000 COP, cuando la cuota supera el 30% del ingreso verificado, cuando hay discrepancia de ingresos superior al 10%, y cuando la política no cubre el caso (moneda extranjera, tipo de documento no soportado).
- **FR-005**: El sistema MUST NOT escalar los casos que puede resolver por sí mismo, como un dato faltante que se puede pedir al solicitante o varias coincidencias que se pueden desambiguar.
- **FR-006**: La causa del escalamiento MUST pertenecer a un conjunto cerrado de categorías definido en el sistema; no se acepta texto libre como causa. Cada causa tiene una acción recomendada fija de ese mismo catálogo; el agente no la redacta.
- **FR-007**: El sistema MUST aplicar el orden de evaluación de la política (Regla 4, Regla 5, Regla 1, Regla 3, Regla 2) de forma determinista, y no depender de que el modelo lo respete.
- **FR-008**: Cuando aplican varias causas, el sistema MUST registrar todas y usar como principal la de mayor precedencia en el orden de evaluación.
- **FR-009**: El agente MUST informar al solicitante que un analista revisará su caso, sin prometer un resultado.
- **FR-010**: La interfaz MUST mostrar un indicador visible cuando un caso pasa a un analista.
- **FR-011**: Cada escalamiento MUST dejar un registro de auditoría con la causa, las entradas relevantes y la marca de tiempo.
- **FR-012**: El resumen MUST NOT incluir el contenido completo de los documentos; solo los campos extraídos necesarios para decidir.
- **FR-013**: El escalamiento MUST poder hacerse sobre una solicitud aún no registrada. En ese caso no se crea el registro hasta que la identidad del solicitante esté verificada.

### Key Entities *(include if feature involves data)*

- **Caso escalado**: solicitud que pasa a un analista. Atributos: causa principal, causas adicionales, marca de tiempo, estado de entrega.
- **Resumen para el analista**: contenido autocontenido del caso. Atributos: solicitante, monto y plazo, datos extraídos con procedencia, discrepancias, causa, acción recomendada, campos pendientes.
- **Causa de escalamiento**: categoría cerrada. Valores: petición de persona, monto por encima del umbral, cuota por encima del porcentaje, discrepancia de ingresos, caso no cubierto por la política.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los casos escalados en las pruebas tiene un resumen con todos los campos obligatorios o con el faltante explícito.
- **SC-002**: En el 100% de las peticiones explícitas de persona, el caso se escala sin ejecutar otra acción previa.
- **SC-003**: En los casos de prueba que no deben escalarse (dato faltante recuperable, coincidencias desambiguables), la tasa de escalamiento es 0%.
- **SC-004**: Un analista puede decidir cada caso de prueba usando solo el resumen, sin consultar la conversación.
- **SC-005**: Todas las causas registradas pertenecen al conjunto cerrado definido.

## Assumptions

- Las causas de escalamiento se limitan al conjunto cerrado de la sección Key Entities; cualquier caso fuera de él se escala como "no cubierto por la política".
- La detección de casos no cubiertos y el orden de evaluación se hacen en código determinista, no en el prompt del modelo.
- La decisión de preaprobación en sí (Regla 2 dentro de la política) pertenece al #14; este ticket solo escala cuando la Regla 2 no se cumple.
- La atención de mensajes con varias preocupaciones a la vez pertenece al #16; este ticket cubre la precedencia entre causas de escalamiento.
- Las acciones recomendadas por causa son el catálogo fijo de FR-006. La aclaración que aún queda abierta en la sección Clarifications se resuelve en `/speckit.clarify`.
- Todos los datos de solicitantes, documentos e ingresos son ficticios.
