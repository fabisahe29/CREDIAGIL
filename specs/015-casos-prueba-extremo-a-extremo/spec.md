# Feature Specification: Casos de prueba obligatorios de extremo a extremo

**Feature Branch**: `17-casos-prueba-e2e`

**Created**: 2026-10-19

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#17 — Casos de prueba obligatorios de extremo a extremo](https://github.com/fabisahe29/CREDIAGIL/issues/17)

**Épica / Milestone**: `epica:entrega` · M3 · Validación y entrega · **Depende de**: #8, #14, #15 y #16

**Trazabilidad con el enunciado**: Casos de prueba 1 a 7

**Input**: Contenido del issue #17, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-19

- Q: ¿Cómo se controla que el modelo conteste distinto en cada ejecución de los casos de extremo a extremo? → A: Dos modos. Por defecto el modelo se reemplaza por respuestas guionadas por caso (sin credenciales, repetible); con una bandera explícita corre contra el modelo real. Ambos modos usan los mismos casos y el mismo informe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ejecutar los siete casos con un solo comando y ver el resultado de cada uno (Priority: P1)

Como evaluador, quiero ejecutar los casos obligatorios con un comando y ver que cada uno termina en el resultado esperado, para comprobar sin esfuerzo que las reglas de negocio funcionan juntas.

**Why this priority**: es el propósito del ticket. Sin una ejecución única y legible de los siete casos, el evaluador tiene que armar cada escenario a mano y el resultado deja de ser comparable entre ejecuciones.

**Independent Test**: se ejecuta el comando documentado en el README sobre un repositorio recién clonado y se verifica que el informe lista los siete casos, cada uno con su resultado esperado, su resultado obtenido y si coinciden.

**Acceptance Scenarios**:

1. **Given** el repositorio con sus dependencias instaladas, **When** el evaluador ejecuta el comando documentado, **Then** se ejecutan los siete casos y el informe muestra, por caso, el resultado esperado, el obtenido y el veredicto.
2. **Given** que los siete casos terminan en su resultado esperado, **When** el comando termina, **Then** reporta éxito global.
3. **Given** que al menos un caso termina en un resultado distinto del esperado, **When** el comando termina, **Then** reporta fallo global e identifica cuál caso falló y en qué difiere.
4. **Given** el README, **When** el evaluador lo lee, **Then** encuentra el comando, qué necesita para ejecutarlo y cómo interpretar el informe, sin consultar otro documento.

---

### User Story 2 - Que cada caso tenga documentos ficticios y un resultado esperado verificable (Priority: P1)

Como evaluador, quiero que cada uno de los siete casos traiga sus documentos de prueba y un resultado esperado que se pueda comprobar de forma objetiva, para no depender de una lectura subjetiva de la conversación.

**Why this priority**: un caso sin resultado verificable no prueba nada. Los siete resultados son el criterio con que se evalúa el producto: un solo caso que viole una regla invalida la solución.

**Independent Test**: para cada caso se comprueba que existen sus documentos (`.txt` o `.md`) y que su resultado esperado queda definido por una decisión y por las llamadas a herramientas que debe haber (o no) en la conversación.

**Acceptance Scenarios**:

1. **Given** el caso 1 (mensaje de ejemplo con documentos consistentes), **When** se ejecuta, **Then** la solicitud se registra y se preaprueba.
2. **Given** el caso 2 (certificado laboral sin salario), **When** se ejecuta, **Then** el campo del salario queda nulo, no se completa ni se supone un valor, y el agente solicita al solicitante el dato o el documento que lo contiene.
3. **Given** el caso 3 (ingreso declarado que difiere en más de un 10% del verificado), **When** se ejecuta, **Then** la solicitud se escala a un analista por discrepancia de ingreso y no se preaprueba.
4. **Given** el caso 4 (solicitud de $8.000.000), **When** se ejecuta, **Then** la solicitud se escala a un analista por superar el umbral de monto y no se preaprueba.
5. **Given** el caso 5 (intento de preaprobar sin identidad verificada), **When** se ejecuta, **Then** el intento queda bloqueado antes de producir efecto, no se registra ni se preaprueba nada, y queda constancia del bloqueo.
6. **Given** el caso 6 (ingresos en moneda extranjera), **When** se ejecuta, **Then** la solicitud se escala a un analista por caso no cubierto por la política, sin convertir la moneda ni estimar el ingreso.
7. **Given** el caso 7 (falla transitoria del servidor del core), **When** se ejecuta, **Then** la llamada fallida se reintenta un número acotado de veces, y la respuesta al solicitante dice con honestidad qué ocurrió: si el reintento funcionó, continúa con normalidad; si se agotó, informa que el caso pasa a un analista y no afirma una decisión que no se tomó.

---

### User Story 3 - Verificar decisiones y llamadas a herramientas, no el texto de la respuesta (Priority: P1)

Como evaluador, quiero que las verificaciones de los casos se hagan sobre las decisiones tomadas y las herramientas invocadas, para que el resultado no cambie porque el modelo redacte distinto de una ejecución a otra.

**Why this priority**: el modelo no es determinista; una prueba que compara texto exacto fallaría sin que ninguna regla se haya roto. Es el criterio que hace creíbles las demás pruebas.

**Independent Test**: se ejecuta dos veces el mismo caso y se comprueba que el veredicto es el mismo aunque el texto de la respuesta difiera; luego se altera a propósito una decisión (por ejemplo, una preaprobación que no debía ocurrir) y se comprueba que el veredicto cambia.

**Acceptance Scenarios**:

1. **Given** un caso ejecutado dos veces con redacciones distintas del modelo, **When** se comparan, **Then** el veredicto es el mismo mientras las decisiones y las llamadas a herramientas sean las mismas.
2. **Given** un caso que debía escalar pero terminó preaprobado, **When** se evalúa, **Then** el veredicto es fallo, aunque la respuesta al solicitante suene correcta.
3. **Given** un caso, **When** se define su resultado esperado, **Then** este se expresa en términos de la decisión final, las herramientas que debieron llamarse, las que no debieron llamarse y los datos clave registrados; no en frases de la respuesta.
4. **Given** un caso, **When** se muestran sus resultados, **Then** el informe indica qué decisión y qué llamadas observó, para que el evaluador pueda auditar el veredicto.

---

### User Story 4 - Probar la lógica determinista sin llamar al modelo (Priority: P2)

Como equipo, quiero que la lógica que no depende del modelo (los bloqueos por hook, el cálculo de la cuota, la validación de consistencia y el contrato de errores) tenga pruebas que no invoquen al modelo, para que corran siempre, sean rápidas y no tengan ruido de variabilidad.

**Why this priority**: son las reglas que no se pueden romper. Si sus pruebas dependieran del modelo, un fallo podría ser ruido o un defecto real, y no habría forma de distinguirlos.

**Independent Test**: se ejecutan estas pruebas sin credenciales ni red y se comprueba que pasan; se introduce un defecto en una regla y se comprueba que alguna falla.

**Acceptance Scenarios**:

1. **Given** un entorno sin credenciales del modelo ni red, **When** se ejecutan las pruebas de la lógica determinista, **Then** corren completas y pasan.
2. **Given** cada una de las cuatro piezas (bloqueo por hook, cálculo, consistencia y contrato de errores), **When** se revisa la cobertura, **Then** tiene pruebas explícitas, incluidos los bordes exactos de $5.000.000, 30% y 10%.
3. **Given** cada uno de los siete casos, **When** se revisa qué parte de su resultado depende solo de código, **Then** esa parte está cubierta por una prueba que no llama al modelo, y solo lo que requiere comprender la conversación queda para la ejecución de extremo a extremo.

---

### User Story 5 - Reproducir cada caso en el chat para el video (Priority: P2)

Como persona que graba el video de funcionamiento, quiero reproducir cada caso en la interfaz de chat, para mostrar en vivo el mismo escenario que verifican las pruebas.

**Why this priority**: el video es un entregable del enunciado y debe mostrar los mismos casos que se prueban, no escenarios distintos que puedan comportarse diferente.

**Independent Test**: se reproduce cada uno de los siete casos en el chat y se comprueba que el desenlace visible coincide con el resultado esperado del caso.

**Acceptance Scenarios**:

1. **Given** cada uno de los siete casos, **When** se reproduce en el chat, **Then** se carga con los mismos documentos y pasos que usa la ejecución automática.
2. **Given** un caso reproducido en el chat, **When** termina, **Then** la persona ve en pantalla la decisión final y el motivo, de modo que puede contrastarla con el resultado esperado.
3. **Given** los siete casos, **When** la persona consulta cómo reproducirlos, **Then** encuentra en el README la instrucción de cada uno.

---

### User Story 6 - Que ningún documento de prueba contenga datos con forma real (Priority: P2)

Como responsable del cumplimiento de la constitución, quiero que ningún documento de prueba contenga datos con forma real, para que nadie confunda un caso de prueba con información de una persona o empresa existente.

**Why this priority**: el uso exclusivo de datos ficticios es una regla no negociable del producto y del enunciado.

**Independent Test**: se revisan todos los documentos de los siete casos y se comprueba que cada identificador, nombre, empleador y cuenta es reconocible como ficticio.

**Acceptance Scenarios**:

1. **Given** los documentos de los siete casos, **When** se revisan, **Then** ningún dato (nombre, documento, empleador, NIT, cuenta, correo) tiene forma de dato real.
2. **Given** un documento de prueba nuevo con un dato con forma real, **When** se intenta incorporarlo, **Then** la verificación automática lo señala antes de integrarlo.

---

### Edge Cases

- ¿Qué pasa si el modelo no responde o responde distinto en una ejecución? El veredicto depende solo de decisiones y llamadas a herramientas, así que una redacción distinta no falla el caso; una ejecución que no termina se informa como fallo del caso con su causa, sin detener los demás.
- ¿Qué pasa si falla un caso a media ejecución? Los demás casos se ejecutan igual y el informe global lista cuál falló.
- ¿Qué pasa si falta un documento de un caso o no se puede leer? El caso se informa como no ejecutable, con el documento ausente, sin dar por pasado ni por fallido su resultado esperado.
- ¿Qué pasa si la falla del servidor del core no es transitoria y persiste? Se cumple el límite de reintentos, el caso pasa a un analista y la respuesta no afirma una decisión que no se tomó.
- ¿Qué pasa si el mismo caso se ejecuta varias veces? Cada ejecución parte de un estado limpio y no depende de lo que dejó la anterior.
- ¿Qué pasa si una verificación pasa solo porque el texto de la respuesta contiene ciertas palabras? No se admite: toda verificación obligatoria se basa en una decisión o en una llamada a herramienta.
- ¿Qué pasa si el entorno no tiene credenciales del modelo? Las pruebas de lógica determinista y el modo guionado corren igual; si se pide el modo con modelo real sin credenciales, la ejecución informa con claridad que no puede correr y por qué, en lugar de fallar de forma ambigua.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El repositorio MUST incluir los siete casos obligatorios: (1) mensaje de ejemplo con documentos consistentes, (2) certificado laboral sin salario, (3) ingreso declarado con diferencia de más del 10%, (4) solicitud de $8.000.000, (5) intento de preaprobar sin identidad verificada, (6) ingresos en moneda extranjera y (7) falla transitoria del servidor del core.
- **FR-002**: Cada caso MUST tener sus documentos ficticios en formato `.txt` o `.md`, y una definición de su resultado esperado.
- **FR-003**: El resultado esperado de cada caso MUST ser verificable de forma objetiva, expresado como la decisión final y las llamadas a herramientas que deben (o no deben) ocurrir, junto con los datos clave que deben quedar registrados.
- **FR-004**: Las verificaciones MUST hacerse sobre decisiones y llamadas a herramientas; MUST NOT depender del texto exacto de la respuesta del modelo.
- **FR-005**: El caso 1 MUST terminar con la solicitud registrada y preaprobada, con el ingreso verificado a partir de los documentos.
- **FR-006**: El caso 2 MUST terminar con el campo del salario nulo, sin suposición ni completado, y con el agente solicitando el dato o documento faltante; no se preaprueba.
- **FR-007**: El caso 3 MUST terminar escalado a un analista con la discrepancia de ingreso como causa, sin preaprobación.
- **FR-008**: El caso 4 MUST terminar escalado a un analista con el superar el umbral de monto como causa, sin preaprobación.
- **FR-009**: El caso 5 MUST terminar con el intento de preaprobar sin identidad verificada bloqueado antes de producir efecto, con constancia del bloqueo, y sin registro ni preaprobación. Con el modelo real, el bloqueo se exige solo si el modelo intenta la acción; lo que se exige siempre es la ausencia de efecto (research R9).
- **FR-010**: El caso 6 MUST terminar escalado a un analista por caso no cubierto por la política, sin convertir la moneda ni estimar el ingreso.
- **FR-011**: El caso 7 MUST mostrar un reintento acotado ante la falla transitoria del servidor del core y una respuesta honesta: continúa si el reintento funciona, o informa la derivación a un analista si se agotan los reintentos; nunca afirma una decisión que no se tomó.
- **FR-012**: La lógica determinista (bloqueos por hook, cálculo de la cuota, consistencia entre documentos y contrato de errores) MUST tener pruebas que no llamen al modelo, incluidos los bordes exactos de $5.000.000, 30% y 10%.
- **FR-013**: Todos los casos MUST ejecutarse con un único comando documentado en el README, que entregue un informe por caso (esperado, obtenido, veredicto) y un veredicto global.
- **FR-014**: El comando MUST terminar con fallo global si cualquier caso no termina en su resultado esperado, e identificar el caso y la diferencia.
- **FR-015**: Cada caso MUST poder reproducirse en la interfaz de chat con los mismos documentos y pasos que la ejecución automática.
- **FR-016**: Ningún documento de prueba MUST contener datos con forma real; los identificadores MUST ser reconocibles como ficticios.
- **FR-017**: El resultado de la ejecución de los casos MUST NO depender de ejecuciones anteriores: cada caso parte de un estado limpio.
- **FR-018**: Un caso que no pueda ejecutarse (documento ausente, o modo con modelo real sin credenciales) MUST informarse como no ejecutable con su causa, nunca como pasado.
- **FR-019**: La ejecución de los casos MUST tener dos modos con los mismos casos y el mismo informe: (a) modo por defecto, con el modelo reemplazado por respuestas guionadas por caso, que corre sin credenciales ni red y es repetible; (b) modo con modelo real, que se activa solo con una bandera explícita. El informe MUST indicar en qué modo se ejecutó. En modo guionado, las decisiones y llamadas a herramientas que dependen de código (hooks, política, servidor MCP) MUST ejecutarse reales; solo se sustituye lo que comprende el modelo.

### Key Entities *(include if feature involves data)*

- **Caso obligatorio**: escenario de prueba de extremo a extremo con un nombre, los pasos de la conversación, sus documentos ficticios y su resultado esperado. Hay siete.
- **Resultado esperado**: lo que debe cumplirse al terminar el caso. Incluye la decisión final, las llamadas a herramientas requeridas y prohibidas y los datos clave registrados.
- **Resultado observado**: lo que ocurrió en la ejecución: decisión final, llamadas a herramientas hechas y datos registrados.
- **Veredicto de caso**: pasó, falló o no ejecutable, con la diferencia entre lo esperado y lo observado.
- **Informe de ejecución**: lista de los veredictos de los siete casos y el veredicto global.
- **Documento de prueba**: archivo `.txt` o `.md` con datos ficticios, incluidos los que son incompletos o inconsistentes a propósito.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un evaluador ejecuta los siete casos con un solo comando y obtiene un veredicto por caso y uno global, sin pasos manuales intermedios.
- **SC-002**: Los 7 casos terminan en su resultado esperado en el 100% de las ejecuciones en modo guionado, y en modo con modelo real el veredicto no cambia por cómo redacte el modelo.
- **SC-003**: Si se rompe a propósito cualquiera de las reglas que cubren los siete casos, al menos un caso reporta fallo e indica cuál.
- **SC-004**: El 100% de la lógica determinista nombrada en el ticket (bloqueos, cálculo, consistencia y contrato de errores) tiene pruebas que corren sin credenciales del modelo ni red.
- **SC-005**: Los bordes exactos de $5.000.000, 30% y 10% están cubiertos con un caso por cada lado del borde.
- **SC-006**: Los siete casos se pueden reproducir en el chat y el desenlace visible coincide con el esperado en los siete.
- **SC-007**: 0 documentos de prueba contienen datos con forma real.
- **SC-008**: Una persona sin conocimiento previo del repositorio llega a ejecutar los casos siguiendo solo el README.

## Assumptions

- Las funcionalidades de las que depende el ticket (#8 el chat, #14 la preaprobación, #15 el escalamiento y #16 los mensajes con varios asuntos) ya están integradas; este ticket no las construye, las verifica en conjunto.
- Existen casos de prueba de tickets anteriores (carpeta `casos/`) que cubren partes de estos escenarios; se reutilizan o se completan en lugar de duplicarse, y el plan define cuáles.
- La numeración de los casos es la del issue #17. Tickets anteriores citan otra numeración del enunciado (por ejemplo, la moneda extranjera como caso 7 en #15); el plan fija la correspondencia para evitar ambigüedad.
- La ejecución con el modelo real requiere credenciales; el modo guionado y la lógica determinista no.
- El tope de reintentos y el tiempo límite ante la falla del servidor del core son los ya definidos por el producto; este ticket los verifica, no los redefine.
- Los datos de los casos son pesos colombianos (COP) ficticios, salvo el caso 6, que es en moneda extranjera ficticia.
