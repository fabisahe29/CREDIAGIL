# Feature Specification: Simulación de cuota y capacidad de pago

**Feature Branch**: `12-simulacion-de-cuota-y-capacidad-de-pago`

**Created**: 2026-10-18

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#12 — Simulación de cuota y capacidad de pago](https://github.com/fabisahe29/CREDIAGIL/issues/12)

**Épica / Milestone**: `epica:agente-originacion` · M2 · Agente MVP · **Depende de**: #7 (Done)

**Trazabilidad con el enunciado**: Comportamiento 3 · Regla 2 · Casos de prueba 1 y 4

**Input**: Contenido del issue #12, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-18

- Q: ¿Cómo se redondea la cuota mensual a pesos enteros? → A: Al peso entero más cercano (206.723,34 → 206.723).
- Q: ¿Qué rango de monto y de plazo en meses acepta la simulación? → A: Solo exige monto y plazo enteros positivos; sin mínimos ni máximos adicionales.
- Q: Si el solicitante todavía no tiene ingreso verificado, ¿la simulación usa el ingreso que declara y lo marca como no vinculante? → A: Sí, usa el ingreso declarado y el resultado lo rotula como "declarado, no verificado, no vinculante".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber cuánto pagaría al mes y qué parte de mi ingreso es (Priority: P1)

Como solicitante, quiero indicar un monto, un plazo y mi ingreso mensual y recibir de inmediato el valor de la cuota mensual y la proporción de mi ingreso que esa cuota representa, para decidir si sigo con la solicitud.

**Why this priority**: es la pregunta más frecuente de los solicitantes ("¿en cuánto me quedaría la cuota?") y es el núcleo del comportamiento 3. Sin ella el agente no puede orientar la decisión del solicitante.

**Independent Test**: se pide la simulación de $4.000.000 a 24 meses con un ingreso dado y se verifica que la cuota es $206.723 y que la proporción cuota/ingreso coincide con el cálculo manual. Entrega valor por sí sola.

**Acceptance Scenarios**:

1. **Given** un monto de $4.000.000, un plazo de 24 meses y un ingreso mensual válido, **When** se pide la simulación, **Then** la cuota es $206.723 y la respuesta incluye la proporción cuota/ingreso, calculadas con la tasa fija del 1,8% mensual.
2. **Given** los mismos monto y plazo con dos ingresos distintos, **When** se piden ambas simulaciones, **Then** la cuota es la misma y solo cambia la proporción cuota/ingreso.
3. **Given** una simulación repetida con los mismos datos, **When** se pide varias veces, **Then** el resultado es idéntico en todas.

---

### User Story 2 - Simular sin comprometer nada ni haber verificado la identidad (Priority: P1)

Como fintech, quiero que simular sea una consulta pura: no registra, no reserva ni compromete nada, y puede hacerse antes de verificar la identidad, para que el solicitante explore opciones sin fricción y sin riesgo para Crediágil.

**Why this priority**: es la garantía que impide que una simulación se convierta en un compromiso. Va al mismo nivel que la historia 1 porque define el límite de lo que el agente puede responder.

**Independent Test**: se simula con un solicitante sin identidad verificada y se comprueba que la respuesta llega y que el estado del core de originación (solicitudes, preaprobaciones, escalamientos) no cambia.

**Acceptance Scenarios**:

1. **Given** un solicitante sin identidad verificada, **When** pide una simulación, **Then** la recibe y no se le exige identificarse.
2. **Given** cualquier simulación, **When** termina, **Then** no existe ninguna solicitud, preaprobación, reserva ni escalamiento nuevo asociado a ella.
3. **Given** una simulación cuya cuota queda dentro del 30% del ingreso y cuyo monto es ≤ $5.000.000, **When** se entrega el resultado, **Then** el resultado no se presenta como preaprobación ni como oferta vinculante.

---

### User Story 3 - Que el modelo distinga simular de preaprobar (Priority: P1)

Como equipo de producto, quiero que la descripción de la herramienta de simulación deje claro que solo simula, que no reemplaza a la preaprobación y cuándo corresponde cada una, para que el modelo no confunda ambas acciones ni prometa al solicitante lo que solo la política puede decidir.

**Why this priority**: el riesgo central de la historia es que el modelo trate una simulación como una decisión. La descripción de la herramienta es lo único que el modelo lee para elegir entre ambas.

**Independent Test**: se revisa la descripción de la herramienta y se comprueba que dice (a) que solo simula, (b) que no sustituye a `preaprobar_credito` y (c) en qué momento se usa cada una. Se comprueba además con una conversación donde el solicitante pregunta por la cuota y no pide preaprobación.

**Acceptance Scenarios**:

1. **Given** la descripción de `calcular_capacidad_pago`, **When** se lee, **Then** declara que solo simula, que no registra ni compromete nada y que no reemplaza a `preaprobar_credito`.
2. **Given** la descripción de `calcular_capacidad_pago`, **When** se lee, **Then** indica cuándo corresponde simular (el solicitante explora o pregunta por la cuota) y cuándo corresponde preaprobar (solicitud con identidad e ingreso verificados).
3. **Given** un solicitante que pregunta "¿cuánto pagaría al mes?", **When** el agente responde, **Then** usa la simulación y no inicia ninguna preaprobación.

---

### User Story 4 - Rechazar entradas inválidas con un motivo claro (Priority: P2)

Como solicitante o agente, quiero que una entrada inválida produzca un error que explique el motivo y que no se pueda reintentar con los mismos datos, para corregir la entrada en lugar de insistir.

**Why this priority**: protege la corrección del cálculo, pero el flujo feliz aporta más valor inmediato.

**Independent Test**: se envían simulaciones con monto cero o negativo, plazo cero o negativo, e ingreso ausente, y se verifica en cada caso un error de validación con el motivo y marcado como no reintentable.

**Acceptance Scenarios**:

1. **Given** un monto no positivo, **When** se pide la simulación, **Then** devuelve un error de validación no reintentable que indica que el monto debe ser positivo.
2. **Given** un plazo no positivo, **When** se pide la simulación, **Then** devuelve un error de validación no reintentable que indica que el plazo debe ser positivo.
3. **Given** un ingreso ausente, **When** se pide la simulación, **Then** devuelve un error de validación no reintentable que indica que falta el ingreso.
4. **Given** una entrada inválida, **When** se devuelve el error, **Then** no se entrega ninguna cuota parcial ni estimada.

---

### Edge Cases

- Ingreso igual a cero o negativo: se trata como entrada inválida (no se divide por cero ni se entrega una proporción absurda).
- Valores no numéricos o no enteros en monto, plazo o ingreso: no pasan el esquema y se tratan como inválidos, no se adivinan.
- Monto o plazo muy altos: se simulan igual, porque no hay límites adicionales al ser enteros positivos.
- Monto o plazo con decimales: se rechazan como inválidos, no se redondean.
- Moneda distinta de pesos colombianos: la simulación no cubre ese caso; se devuelve un error explícito y no se convierte (Regla 5, se escala en el flujo del agente).
- Cuota que excede el ingreso (proporción > 100%): se informa el cálculo tal cual, sin ocultarlo ni convertirlo en una decisión.
- El resultado de una simulación no debe confundirse con la decisión de la Regla 2: que la proporción quede por debajo del 30% no implica preaprobación.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST ofrecer la herramienta `calcular_capacidad_pago`, que a partir de un monto, un plazo en meses y un ingreso mensual devuelve la cuota mensual y la proporción cuota/ingreso.
- **FR-002**: El sistema MUST calcular la cuota con cuota fija (amortización francesa) y la tasa fija ficticia del 1,8% mensual, tomada del módulo único de política (constitución, Principios I y III). No se permite repetir la tasa como literal fuera de ese módulo.
- **FR-003**: El cálculo MUST ejecutarse en código determinista; el modelo no estima ni redondea la cuota (Principio III). Con las mismas entradas el resultado es siempre idéntico.
- **FR-004**: El sistema MUST devolver para $4.000.000 a 24 meses una cuota de $206.723 (valor de referencia verificado en pruebas).
- **FR-005**: La herramienta MUST ser de solo consulta: no registra solicitudes, no reserva, no preaprueba ni escala, y no deja efecto alguno en el core de originación.
- **FR-006**: La herramienta MUST poder usarse sin identidad verificada y sin un ingreso ya verificado.
- **FR-007**: La descripción de la herramienta MUST declarar que solo simula, que no reemplaza a `preaprobar_credito` y cuándo corresponde usar cada una.
- **FR-008**: El resultado MUST indicar de forma explícita que es una simulación no vinculante y no una decisión de crédito.
- **FR-009**: El resultado MUST NOT evaluar ni afirmar la Regla 2 (monto ≤ $5.000.000 y cuota ≤ 30%): informa la proporción, pero la decisión de preaprobación corresponde solo a la política y a `preaprobar_credito`.
- **FR-010**: Monto o plazo no positivos, e ingreso ausente o no positivo, MUST producir un error de validación **no reintentable** con el motivo legible por el agente, siguiendo el contrato de errores del proyecto, y sin cuota parcial.
- **FR-011**: Toda entrada MUST validarse contra un esquema tipado; un dato que no lo cumple se rechaza como inválido y no se adivina (Principio III).
- **FR-012**: Los montos MUST manejarse en pesos enteros. La cuota MUST redondearse al peso entero más cercano (p. ej. 206.723,34 → 206.723); la función de redondeo MUST estar nombrada y cubierta por pruebas, incluidos los bordes de .5.
- **FR-013**: El sistema MUST aceptar cualquier monto y plazo que sean enteros positivos, sin mínimos ni máximos adicionales. Que un monto o un plazo queden fuera de la política (p. ej. monto > $5.000.000) no invalida la simulación: eso lo decide la política en la preaprobación.
- **FR-014**: Cuando no hay ingreso verificado, la simulación MUST usar el ingreso declarado por el solicitante y el resultado MUST rotularlo como "declarado, no verificado, no vinculante", aclarando que no reemplaza al ingreso verificado de la Regla 3. La preaprobación sigue usando únicamente el ingreso verificado.
- **FR-015**: La herramienta MUST producir un registro de observabilidad con el `correlationId` cuando exista, sin incluir datos de documentos (Principio VI).
- **FR-016**: Las pruebas MUST cubrir el valor de referencia, los bordes de las entradas inválidas y la ausencia de efectos en el core.

### Key Entities *(include if feature involves data)*

- **Simulación de capacidad de pago**: resultado de una consulta puntual. Contiene el monto, el plazo, el ingreso usado, el origen del ingreso (declarado o verificado), la tasa aplicada, la cuota mensual, la proporción cuota/ingreso y la marca de que no es vinculante. No se persiste ni se asocia a una solicitud.
- **Entrada de simulación**: monto en COP, plazo en meses e ingreso mensual en COP. Se valida antes de calcular.
- **Error de validación**: tipo de error no reintentable con el campo afectado y el motivo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para $4.000.000 a 24 meses la cuota informada es exactamente $206.723 en el 100% de las ejecuciones.
- **SC-002**: El solicitante recibe la cuota y la proporción de su ingreso en una sola respuesta, sin tener que identificarse.
- **SC-003**: El 100% de las simulaciones deja el core de originación sin cambios (0 solicitudes, preaprobaciones, reservas o escalamientos nuevos).
- **SC-004**: El 100% de las entradas inválidas probadas (monto, plazo e ingreso) devuelve un error no reintentable con el motivo y sin cuota parcial.
- **SC-005**: En las conversaciones de prueba donde el solicitante solo pregunta por la cuota, el agente no inicia ninguna preaprobación (0 casos).
- **SC-006**: La tasa y los umbrales de la política existen en un único lugar del código; ningún otro archivo los repite.

## Assumptions

- La cuota usa amortización francesa con la tasa del 1,8% mensual, fijada por la constitución; no se parametriza.
- La moneda es el peso colombiano (COP); otras monedas quedan fuera de la simulación y se tratan por la Regla 5 en el flujo del agente.
- La simulación no evalúa la Regla 2 ni la Regla 3: no decide, solo informa cuota y proporción.
- El valor de referencia de $206.723 está declarado en el issue y se verifica en pruebas; si el redondeo aclarado lo cambiara, se revisa con el desarrollador.
- Queda fuera de alcance preaprobar, registrar y escalar (#13, #14 y #15), y la verificación del ingreso (#11, ya hecha).
- Depende del servidor MCP y del contrato de errores del #7, ya disponibles.
