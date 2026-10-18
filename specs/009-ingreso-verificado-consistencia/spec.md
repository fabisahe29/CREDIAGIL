# Feature Specification: Ingreso verificado y validación de consistencia

**Feature Branch**: `11-ingreso-verificado-y-validacion-de-consistencia`

**Created**: 2026-10-18

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#11 — Ingreso verificado y validación de consistencia](https://github.com/fabisahe29/CREDIAGIL/issues/11)

**Épica / Milestone**: `epica:agente-originacion` · `regla-de-negocio` · M2 · Agente MVP · **Depende de**: #10 (Done)

**Trazabilidad con el enunciado**: Reglas 3 y 5 · Comportamiento 6 · Casos de prueba 3 y 6

**Input**: Contenido del issue #11, entregado por `/ticket-tomar`.

## Clarifications

Las cuatro preguntas que el issue reservó para `/speckit.clarify` quedan respondidas en la sesión de abajo.

### Session 2026-10-18

- Q: Cuando hay certificado laboral y extractos, ¿cómo se calcula el ingreso mensual verificado? → A: El menor entre el salario del certificado y el promedio mensual de abonos de nómina de los extractos. Si falta uno de los dos documentos, se usa el que haya.

- Q: Si el solicitante no declara ningún ingreso, ¿qué hace el agente con la comparación del 10%? → A: Pide el dato; sin declaración no se avanza a la comparación ni a la preaprobación. Escalar si no lo da es del #15.
- Q: ¿Sobre qué base se mide el 10%? → A: Sobre el ingreso verificado, como fija la constitución (Principio I, Regla 3): |declarado − verificado| / verificado. No hace falta decidirlo: ya está establecido.

- Q: Cuando se detecta una inconsistencia que sigue en pie tras los reintentos, ¿cuáles hacen que la solicitud pase a un analista y cuáles solo se reportan? → A: Detienen las dos comprobaciones mínimas (titular del extracto frente al solicitante y empleador frente al pagador). Cualquier otra solo se reporta, salvo que afecte identidad o ingreso.

**Abiertas**: ninguna.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ingreso verificado que sale solo de los documentos (Priority: P1)

Como analista de crédito, quiero que el ingreso mensual con el que se decide se calcule por código a partir de los datos ya extraídos de los documentos, para no aprobar con base en lo que el solicitante declara.

**Why this priority**: es la Regla 3. Sin ingreso verificado no hay comparación con lo declarado (US2), ni cuota sobre ingreso (#12), ni preaprobación (#14).

**Independent Test**: con los documentos ficticios de `casos/` ya extraídos por el #10, calcular el ingreso verificado y comprobar que es el mismo con cualquier ingreso declarado, y que el resultado indica de qué documentos y de qué campos salió.

**Acceptance Scenarios**:

1. **Given** un certificado laboral con salario y extractos con abonos de nómina, **When** se calcula el ingreso verificado, **Then** el resultado es un entero de pesos obtenido solo de esos datos, con la lista de campos y documentos usados.
2. **Given** dos solicitudes idénticas salvo el ingreso declarado, **When** se calcula el ingreso verificado, **Then** el valor es idéntico: lo declarado no interviene (Principio III).
3. **Given** un documento cuyos datos no pasaron la validación del #10 o quedaron nulos, **When** se calcula el ingreso, **Then** esos datos no se usan y el cálculo no inventa ni completa el faltante.
4. **Given** que no hay datos suficientes para calcular un ingreso verificado, **When** se intenta, **Then** no hay ingreso verificado y el agente pide el documento que falta; si el solicitante no lo entrega, se escala (criterio del #15).
5. **Given** los mismos datos de entrada, **When** se calcula dos veces, **Then** el resultado es el mismo y no duplica efectos ni registros.

---

### User Story 2 - Discrepancia con lo declarado envía al analista (Priority: P1)

Como responsable de riesgo, quiero que una diferencia de más del 10% entre el ingreso declarado y el verificado quede registrada y lleve la solicitud a un analista, para que nadie decida sobre un ingreso declarado que los documentos no respaldan.

**Why this priority**: es el segundo criterio de la Regla 3 y el caso de prueba 3 del enunciado.

**Independent Test**: con un ingreso verificado conocido, probar la frontera: diferencia exactamente del 10% (no escala), apenas por encima (escala), apenas por debajo (no escala).

**Acceptance Scenarios**:

1. **Given** un ingreso declarado cuya diferencia con el verificado es **exactamente** el 10%, **When** se evalúa, **Then** NO hay discrepancia y no se escala por este motivo.
2. **Given** una diferencia **apenas por encima** del 10% (un peso más), **When** se evalúa, **Then** se registra la discrepancia y la solicitud se dirige a un analista.
3. **Given** una discrepancia, **When** se registra, **Then** el registro trae el ingreso declarado, el verificado, la diferencia relativa, el umbral y la regla aplicada, en formato estructurado (Principio III).
4. **Given** una discrepancia en cualquier sentido (declarado mayor o menor que el verificado), **When** supera el umbral, **Then** se escala igual.
5. **Given** que la comparación se hace en código con aritmética entera o decimal exacta, **When** la diferencia cae en el borde, **Then** el resultado no depende de redondeos de flotantes.

---

### User Story 3 - Consistencia entre documentos y con el solicitante (Priority: P1)

Como analista de crédito, quiero que los documentos se contrasten entre sí y con el solicitante verificado, y que cada inconsistencia quede registrada con su procedencia, para no aprobar con base en datos contradictorios.

**Why this priority**: es el tercer criterio del issue; una contradicción entre documentos invalida el ingreso verificado aunque cada documento sea válido por separado.

**Independent Test**: con documentos ficticios, cambiar el titular de un extracto y el empleador del certificado; comprobar que cada cambio produce una inconsistencia distinta con los campos y documentos que la originan.

**Acceptance Scenarios**:

1. **Given** un extracto cuyo titular no coincide con el solicitante verificado, **When** se valida la consistencia, **Then** se registra la inconsistencia «titular del extracto frente al solicitante» con la procedencia de ambos datos.
2. **Given** un certificado cuyo empleador no coincide con el pagador de los abonos de nómina en los extractos, **When** se valida, **Then** se registra la inconsistencia «empleador frente al pagador» con la procedencia de ambos datos.
3. **Given** documentos consistentes entre sí, **When** se valida, **Then** no se registra ninguna inconsistencia.
4. **Given** una inconsistencia registrada, **When** se revisa, **Then** indica la regla que falló, los valores comparados y, de cada uno, el documento (adjunto y nombre de archivo) y el fragmento de origen (FR-008 y FR-009 del #10).
5. **Given** una inconsistencia que según FR-010 detiene el proceso, **When** se registra, **Then** la solicitud no avanza hacia la preaprobación y se dirige a un analista con el motivo.

---

### User Story 4 - Ingresos en moneda extranjera escalan (Priority: P2)

Como responsable de riesgo, quiero que un ingreso en moneda extranjera se trate como caso no cubierto, para que el agente escale en lugar de convertir o improvisar (Regla 5).

**Why this priority**: la Regla 5 es obligatoria, pero la detección de moneda y el escalamiento ya existen desde el #10 y el #9; aquí se garantiza que el cálculo del ingreso nunca opere sobre ellos.

**Independent Test**: con un certificado cuyo salario está en dólares, comprobar que no se calcula ingreso verificado y que la causa de escalamiento es la Regla 5, «moneda extranjera».

**Acceptance Scenarios**:

1. **Given** un documento marcado como caso no cubierto por moneda extranjera, **When** se intenta calcular el ingreso, **Then** no se calcula ni se convierte a pesos, y el agente escala con la Regla 5 y la causa.
2. **Given** documentos de monedas distintas entre sí (uno en COP y otro en otra moneda), **When** se valida la consistencia, **Then** se trata como caso no cubierto, no como una inconsistencia corregible.
3. **Given** el orden de evaluación 4 → 5 → 1 → 3 → 2, **When** concurren moneda extranjera y discrepancia, **Then** prevalece la Regla 5 y no se evalúa la discrepancia.

---

### User Story 5 - Reintentar una inconsistencia corregible con la regla que falló (Priority: P2)

Como equipo, quiero que una inconsistencia que puede deberse a una mala extracción se reintente indicando la regla específica que falló, para distinguir un error del extractor de una contradicción real entre documentos.

**Why this priority**: evita escalar por un error de lectura y mantiene el escalamiento para las contradicciones reales (Principio V). Depende de US3.

**Independent Test**: con el subagente simulado, hacer que el primer intento lea mal el titular del extracto y el segundo lo lea bien; comprobar que el segundo intento recibió la regla específica que falló y que no se registró inconsistencia. Luego hacer que persista en todos los intentos y comprobar que queda registrada.

**Acceptance Scenarios**:

1. **Given** una inconsistencia que según FR-011 es corregible volviendo a extraer, **When** se detecta, **Then** se reintenta la extracción del documento afectado indicándole la regla que falló y el valor que extrajo, sin decirle el valor esperado.
2. **Given** que el reintento resuelve la inconsistencia, **When** se vuelve a validar, **Then** no queda inconsistencia registrada y se usan los datos corregidos, con su procedencia verificada.
3. **Given** que la inconsistencia persiste tras los intentos permitidos, **When** se agotan, **Then** queda registrada como inconsistencia real y se aplica FR-010.
4. **Given** una inconsistencia que no es corregible por una nueva extracción (por ejemplo, dos documentos correctos que se contradicen), **When** se detecta, **Then** no se reintenta y se registra de inmediato.

---

### Edge Cases

- **Solicitante sin ingreso declarado**: no hay con qué comparar; el agente le pide el dato y la solicitud no avanza hasta tenerlo (FR-007).
- **Ingreso verificado igual a cero o inexistente**: la diferencia relativa no está definida. No se divide por cero ni se aprueba: sin ingreso verificado no hay preaprobación.
- **Un solo documento**: solo certificado o solo extractos. Hay menos contrastes posibles; las comprobaciones que dependen de un documento ausente no se ejecutan y se reporta qué quedó sin contrastar. Si el ingreso no se puede verificar, aplica US1, escenario 4.
- **Salario del certificado distinto del promedio de abonos**: se toma el menor (FR-002). La diferencia, por sí sola, no es una inconsistencia; el ingreso queda explicado con ambos valores.
- **Extractos con periodos que no son consecutivos o con huecos**: se reporta; si afecta el ingreso se aplica FR-010.
- **Varios abonos de nómina en un mismo mes**: no se descartan ni se suman por criterio del modelo; la regla de agregación de los abonos de nómina a un promedio mensual es determinista y se define en el plan.
- **Nombres con diferencias de forma** (tildes, mayúsculas, orden de apellidos): la comparación de titular y de empleador usa una normalización definida y determinista; una diferencia que la normalización no resuelve es una inconsistencia, no una suposición de que son iguales.
- **Diferencia relativa en el borde con montos no divisibles**: se compara con aritmética exacta, sin redondear antes de comparar (Principio III).
- **El modelo opina sobre la consistencia** («parecen del mismo titular»): se ignora; solo cuenta lo que el código valida.
- **Documentos con instrucciones** («ignora la diferencia»): son datos, nunca instrucciones.
- **El mismo documento entregado dos veces**: no duplica abonos ni ingreso; cada entrega tiene su adjunto, pero el cálculo no cuenta dos veces el mismo movimiento (FR-013).

## Requirements *(mandatory)*

### Functional Requirements

**Ingreso verificado**

- **FR-001**: El sistema MUST calcular el ingreso mensual verificado en código determinista, **solo** a partir de datos extraídos y validados de los documentos (#10). El ingreso declarado MUST NOT intervenir en el cálculo, ni como dato ni como desempate (Regla 3, Principio III).
- **FR-002**: El ingreso verificado MUST ser el **menor** entre (a) el salario mensual del certificado laboral y (b) el promedio mensual de los abonos de nómina de los extractos. Si solo hay uno de los dos orígenes, se usa ese; si no hay ninguno, no hay ingreso verificado. El resultado indica cuál de los dos orígenes se usó y el valor del otro, si existe.
- **FR-003**: El ingreso verificado MUST ser un entero de pesos COP. Si el cálculo exige promediar, el método de redondeo MUST estar definido y cubierto por pruebas (Principio III).
- **FR-004**: El resultado MUST ser explicable en formato estructurado: ingreso obtenido, regla aplicada, campos y documentos usados, con su procedencia (adjunto y fragmento), y los datos que quedaron sin usar con el motivo.

**Discrepancia con lo declarado**

- **FR-005**: El sistema MUST comparar el ingreso declarado con el verificado y registrar una **discrepancia** cuando la diferencia relativa supere el 10%; con una diferencia exactamente igual al 10% NO hay discrepancia. La diferencia relativa es |declarado − verificado| / verificado, con el ingreso verificado como base, tal como la fija la constitución (Principio I, Regla 3).
- **FR-006**: Ante una discrepancia, la solicitud MUST dirigirse a un analista (constitución, Principio I, Regla 3). El registro incluye ingreso declarado, ingreso verificado, diferencia relativa, umbral y regla, en formato estructurado. El umbral del 10% MUST vivir en el módulo único de política (`src/politica/`), versionado y cubierto por pruebas, no repetido como literal en otro archivo.
- **FR-007**: Si el solicitante **no declara** ingreso, el agente MUST pedírselo antes de evaluar la discrepancia. Sin ingreso declarado no se compara contra cero ni se omite la comparación, y la solicitud no avanza a la preaprobación. La declaración no cambia el ingreso verificado (FR-001). Cuándo se considera que el solicitante no lo dará, y por tanto se escala, es del #15.

**Consistencia entre documentos**

- **FR-008**: El sistema MUST validar por código, como mínimo: (a) titular de cada extracto frente al solicitante verificado; (b) empleador del certificado frente al pagador de los abonos de nómina en los extractos. Otras comprobaciones entre documentos que se identifiquen en el plan MUST seguir el mismo contrato.
- **FR-009**: Cada inconsistencia MUST registrarse con: la regla de consistencia que falló, los valores comparados y, de cada valor, su documento (adjunto y nombre de archivo) y fragmento de origen. Una inconsistencia sin procedencia no es válida.
- **FR-010**: Una inconsistencia que persiste tras los reintentos **detiene** el proceso (la solicitud no avanza a la preaprobación y se dirige a un analista) cuando es una de las dos comprobaciones mínimas de FR-008: titular del extracto distinto del solicitante, o empleador del certificado distinto del pagador de los abonos. Cualquier otra comprobación que agregue el plan solo se **reporta** al analista, salvo que afecte la identidad o el ingreso verificado, en cuyo caso también detiene (Principio V: ante la duda, escalar).
- **FR-011**: Una inconsistencia que puede deberse a un error de extracción MUST reintentarse volviendo a extraer el documento afectado, indicando al subagente la **regla específica** que falló y el valor que él extrajo de ese documento. MUST NOT revelarle el valor con el que se contrasta (por ejemplo, el nombre del solicitante verificado): un extractor que conoce la respuesta esperada tiende a copiarla en lugar de leer el documento. Reutiliza el mecanismo de reintentos del #10 con una sola ronda de reextracción por documento y regla, de hasta 3 intentos. Una inconsistencia entre documentos correctos MUST NOT reintentarse.
- **FR-012**: Si tras los reintentos la inconsistencia persiste, MUST quedar registrada y aplicarse FR-010. Nunca se descarta en silencio.

**Moneda extranjera y casos no cubiertos**

- **FR-013**: Un ingreso en moneda extranjera MUST tratarse como caso no cubierto (Regla 5): no se convierte, no se calcula ingreso verificado y el agente escala con la Regla 5. La detección de moneda es la del #10; esta feature solo garantiza que el cálculo no opere sobre esos documentos. Un mismo movimiento o documento entregado dos veces MUST NOT contarse dos veces en el cálculo.
- **FR-014**: El orden de evaluación MUST respetar la constitución: regla 4 → regla 5 → regla 1 → regla 3 → regla 2. Esta feature implementa la Regla 3 y no altera el orden de las anteriores.

**Servidor MCP y observabilidad**

- **FR-015**: El servidor MCP MUST aplicar de nuevo del lado del servidor lo que la Regla 3 exige sobre lo registrado: no aceptar como ingreso verificado un valor que no provenga de las extracciones registradas, ni una preaprobación sobre una solicitud con discrepancia o inconsistencia que detiene (defensa en profundidad, Principio IV). El alcance exacto de las herramientas nuevas o modificadas se define en el plan.
- **FR-016**: Cada cálculo de ingreso, discrepancia e inconsistencia MUST dejar un registro de auditoría con `correlationId`, regla aplicada, entradas relevantes, resultado y marca de tiempo. Los logs MUST NOT contener el documento completo (Principio VI).
- **FR-017**: Las operaciones con efectos MUST ser idempotentes por solicitud: repetir el cálculo con los mismos datos no duplica registros (Principio VI).

**Pruebas**

- **FR-018**: MUST haber pruebas automáticas, sin red ni modelo real, de: el cálculo del ingreso verificado y su independencia del ingreso declarado; la frontera de la discrepancia (exactamente 10% no escala, apenas por encima escala); cada comprobación de consistencia; moneda extranjera; y el reintento con la regla específica.
- **FR-019**: MUST haber documentos ficticios nuevos en `casos/`, conforme a `docs/datos-ficticios.md`, para: un caso consistente, ingreso declarado inflado más del 10%, titular distinto, empleador distinto del pagador y salario en moneda extranjera.

### Key Entities

- **Ingreso verificado**: monto mensual en pesos enteros calculado por código a partir de datos extraídos, con la regla aplicada y la lista de campos y documentos que lo originan.
- **Discrepancia de ingreso**: diferencia relativa entre ingreso declarado y verificado, el umbral aplicado y si lo supera.
- **Inconsistencia**: contradicción detectada entre dos datos, con la regla que falló, los valores comparados, la procedencia de cada uno, si es corregible por nueva extracción y si detiene el proceso.
- **Resultado de verificación de ingreso**: conjunto explicable de ingreso verificado, discrepancia e inconsistencias de una solicitud; es lo que consumen la cuota (#12), el registro (#13), la preaprobación (#14) y el escalamiento (#15).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100% de los casos de prueba, el ingreso verificado es independiente del ingreso declarado: variar solo lo declarado nunca cambia el ingreso verificado.
- **SC-002**: En la frontera, el 100% de los casos con diferencia exactamente del 10% no escalan por discrepancia y el 100% de los casos apenas por encima escalan.
- **SC-003**: El 100% de las inconsistencias registradas traen la regla que falló y la procedencia (documento y fragmento) de cada valor comparado.
- **SC-004**: El 100% de los ingresos en moneda extranjera terminan en escalamiento con la Regla 5 y ninguno produce un ingreso verificado.
- **SC-005**: Ninguna solicitud con discrepancia o con inconsistencia que detiene el proceso llega a preaprobación, ni siquiera si el agente la pide: el servidor la rechaza.
- **SC-006**: Un analista entiende por qué se escaló una solicitud (discrepancia o inconsistencia) a partir del registro, sin releer los documentos.
- **SC-007**: Los casos de prueba 3 y 6 del enunciado se reproducen con los documentos ficticios y dan el resultado esperado.
- **SC-008**: Las pruebas de esta feature corren sin red ni modelo real y pasan.

## Assumptions

- **Entrada**: los datos llegan ya extraídos, validados y con procedencia por el #10; esta feature no vuelve a leer documentos salvo para reintentar (FR-011).
- **Solicitante verificado**: el nombre del solicitante contra el cual se compara el titular sale de la identidad verificada del #9.
- **Moneda**: solo COP es soportada; no hay conversión de monedas.
- **Cuota y monto**: la cuota, el monto y el 30% son del #12 y de la Regla 2 (#14); aquí solo se entrega el ingreso verificado y su estado.
- **Escalamiento**: usa el mecanismo del #9; el resumen estructurado completo para el analista es del #15. Esta feature aporta el motivo y los datos.
- **Umbral del 10%**: es parte del enunciado (Regla 3) y vive en el módulo único de política; no se parametriza para relajarlo.
- **Código de producción**: vive bajo `src/`, con esta spec, como exige el guardián del #5.
- **Preguntas del issue**: las cuatro están respondidas en `## Clarifications`; no queda ninguna abierta.
