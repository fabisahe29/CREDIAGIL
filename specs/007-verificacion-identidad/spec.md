# Feature Specification: Identificación y verificación del solicitante

**Feature Branch**: `9-identificacion-y-verificacion-del-solici`

**Created**: 2026-10-17

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#9 — Identificación y verificación del solicitante](https://github.com/fabisahe29/CREDIAGIL/issues/9)

**Épica / Milestone**: `epica:agente-originacion` · `regla-de-negocio` · M2 · Agente MVP · **Depende de**: #7 (Done)

**Trazabilidad con el enunciado**: Regla 1 · Comportamiento 4 · Casos de prueba 1 y 5

**Input**: Contenido del issue #9, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-17

- Q: ¿Qué dato adicional confirma la identidad del solicitante encontrado? → A: La fecha de expedición del documento de identidad (AAAA-MM-DD).
- Q: ¿Cuántos intentos fallidos de verificación se permiten y qué pasa al agotarlos? → A: 3 intentos por solicitante en la conversación; al tercer fallo el core bloquea la verificación de ese solicitante y el agente escala a un analista.
- Q: ¿En qué momento pide el agente la identificación del solicitante? → A: Al inicio del trámite: en cuanto el solicitante quiere iniciar una solicitud y antes de pedir o procesar documentos. Las preguntas generales se responden sin identificar, y las reglas 4 y 5 siguen yendo primero.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Encontrar al solicitante en el core (Priority: P1)

Como agente de originación, quiero buscar al solicitante en el core por su número de documento o por su nombre y recibir todas las coincidencias, para saber con quién estoy hablando antes de verificarlo.

**Why this priority**: sin encontrar al solicitante no se puede verificar su identidad, y sin identidad verificada ninguna solicitud se registra (Regla 1). Es el primer paso de todo el flujo.

**Independent Test**: con los datos ficticios del core, buscar por el documento del solicitante único, por el nombre compartido por los dos homónimos y por un dato que no existe; comprobar que se obtienen una, dos y cero coincidencias, respectivamente, y que ninguna de las tres búsquedas es un error.

**Acceptance Scenarios**:

1. **Given** un solicitante único en el core, **When** se busca por su número de documento, **Then** se obtiene exactamente esa coincidencia.
2. **Given** un solicitante único en el core, **When** se busca por su nombre, **Then** se obtiene exactamente esa coincidencia.
3. **Given** dos solicitantes con el mismo nombre (homónimos), **When** se busca por ese nombre, **Then** se obtienen las dos coincidencias, sin que el core elija una.
4. **Given** un documento o nombre que no está en el core, **When** se busca, **Then** el resultado es una búsqueda exitosa con cero coincidencias, no un error.
5. **Given** un criterio de búsqueda mal formado (vacío, o un documento con caracteres no permitidos), **When** se busca, **Then** el core responde con un error de validación que indica el campo, y no se ejecuta la búsqueda.

---

### User Story 2 - Desambiguar sin adivinar (Priority: P1)

Como responsable de riesgo, quiero que, cuando la búsqueda devuelve varias coincidencias, el agente pida al solicitante un dato que permita distinguirlas, para que ninguna solicitud quede a nombre de la persona equivocada.

**Why this priority**: elegir entre homónimos "a criterio" del modelo es exactamente el error que la Regla 1 busca evitar.

**Independent Test**: con el modelo simulado, dar el nombre compartido por los homónimos; comprobar que el agente emite un evento de solicitud de dato pidiendo un dato desambiguador, que no llama a la verificación de identidad con ninguno de los dos y que ninguno queda marcado como verificado.

**Acceptance Scenarios**:

1. **Given** una búsqueda con varias coincidencias, **When** el agente responde al solicitante, **Then** le pide un dato que desambigüe (por ejemplo, su número de documento) mediante un evento `solicitud_de_dato`, y no elige una coincidencia por su cuenta.
2. **Given** que el solicitante entrega el dato desambiguador, **When** el agente busca de nuevo, **Then** obtiene una sola coincidencia y continúa con la verificación de esa persona.
3. **Given** que el dato desambiguador tampoco reduce las coincidencias a una, **When** el agente lo detecta, **Then** no elige ninguna y escala a un analista con el motivo y el número de coincidencias (constitución, Principio V).
4. **Given** una búsqueda sin coincidencias, **When** el agente responde, **Then** le informa al solicitante que no lo encontró y le pide revisar el dato, sin inventar un solicitante.

---

### User Story 3 - Verificar la identidad con un dato adicional (Priority: P1)

Como responsable de riesgo, quiero que la identidad del solicitante encontrado se confirme con un dato adicional que solo él debería conocer, y que el sistema distinga un dato que no coincide de un dato mal escrito, para que la verificación sea confiable y el solicitante sepa qué corregir.

**Why this priority**: es el corazón de la Regla 1. Encontrar a alguien no es verificarlo.

**Independent Test**: con los datos ficticios, verificar al solicitante único con el dato correcto, con un dato bien formado pero distinto y con un dato mal formado; comprobar que el primero queda verificado, que el segundo es un error de negocio y que el tercero es un error de validación, y que solo el primero cambia el estado de identidad.

**Acceptance Scenarios**:

1. **Given** un solicitante encontrado, **When** se verifica con el dato adicional correcto, **Then** la identidad queda verificada y se emite un registro de auditoría con la regla, los valores usados (sin el dato secreto en claro) y la marca de tiempo.
2. **Given** un solicitante encontrado, **When** se verifica con un dato adicional bien formado que no coincide, **Then** el core responde con un **error de negocio** (dato no coincide) y la identidad sigue sin verificar.
3. **Given** un solicitante encontrado, **When** se verifica con un dato adicional mal formado, **Then** el core responde con un **error de validación** que indica el campo, la identidad sigue sin verificar y el intento no cuenta como fallido.
4. **Given** un solicitante con 2 intentos fallidos, **When** el tercer intento tampoco coincide, **Then** el core bloquea la verificación de ese solicitante en la conversación y el agente escala a un analista con el motivo "identidad no verificable" (FR-009).
5. **Given** un identificador de solicitante que no existe en el core, **When** se intenta verificar, **Then** el core responde con un error de negocio y no se verifica nada.
6. **Given** un dato adicional que no coincide, **When** el agente responde al solicitante, **Then** no le revela cuál es el dato correcto ni en qué parte falló.
7. **Given** un solicitante con la verificación bloqueada, **When** se intenta de nuevo, aun con el dato correcto, **Then** el core responde con un error de negocio de verificación bloqueada y la identidad sigue sin verificar.

---

### User Story 4 - Estado de identidad confiable y consultable (Priority: P1)

Como responsable de riesgo, quiero que el estado "identidad verificada" quede guardado en el core, y que cualquier control del agente pueda consultarlo, para que el registro de una solicitud dependa de un hecho comprobado y no de lo que afirme el modelo.

**Why this priority**: es la defensa en profundidad de la constitución (Principio IV). Si el modelo dice "ya está verificado" sin estarlo, nada debe registrarse.

**Independent Test**: con el modelo simulado, hacer que el agente afirme en su texto que el solicitante está verificado sin haber llamado a la verificación; consultar el estado en el core y comprobar que figura como no verificado, y que un control del agente que lo consulta impide la acción que lo requiere.

**Acceptance Scenarios**:

1. **Given** un solicitante verificado en la conversación, **When** un control del agente consulta el estado de identidad, **Then** el core responde "verificada" con el identificador del solicitante y la marca de tiempo de la verificación.
2. **Given** un solicitante no verificado, **When** el modelo afirma lo contrario en su texto, **Then** el estado consultado en el core sigue siendo "no verificada".
3. **Given** una conversación nueva, **When** se consulta el estado de identidad, **Then** es "no verificada": la verificación de una conversación no se hereda en otra.
4. **Given** una acción que exige identidad verificada (registrar la solicitud, en #13), **When** se intenta sin verificación, **Then** el control del agente la impide antes de llegar al core y emite un evento `bloqueo_por_regla` con la Regla 1, y el core también la rechazaría por su lado.

---

### User Story 5 - Datos ficticios para todos los casos (Priority: P2)

Como equipo, quiero un juego de datos ficticios con un solicitante único, dos homónimos y un caso sin coincidencias, para probar y demostrar cada camino de la identificación.

**Why this priority**: lo exige el issue y habilita las pruebas de US1 a US4 y los casos de prueba 1 y 5 del enunciado.

**Independent Test**: revisar los datos de ejemplo del core y comprobar que contienen los tres casos, que todos cumplen `docs/datos-ficticios.md` y que el guardián del repositorio los acepta.

**Acceptance Scenarios**:

1. **Given** los datos de ejemplo del core, **When** se revisan, **Then** hay al menos un solicitante único, dos homónimos con documento y dato adicional distintos, y un documento y un nombre documentados que no tienen coincidencias.
2. **Given** cualquier dato de solicitante de ejemplo, **When** se valida contra la convención de datos ficticios, **Then** la cumple (documentos con prefijo `000`, correos `.example`, nombres inventados).

---

### Edge Cases

- **El solicitante pide hablar con una persona antes de identificarse**: la Regla 4 va antes que la Regla 1; el agente no busca ni verifica, escala de inmediato (lo implementa #15/#16; aquí solo no se interpone).
- **El solicitante hace solo preguntas generales** (tasa, requisitos): el agente responde sin pedir identificación; la pide cuando quiere iniciar la solicitud (FR-011).
- **El solicitante adjunta un certificado o extracto antes de identificarse**: el agente no lo procesa y pide primero la identificación (FR-011a).
- **El solicitante da un documento con puntos, espacios o guiones**: se normaliza antes de buscar; no cuenta como dato mal formado.
- **El nombre se escribe con otras mayúsculas o sin tildes**: la búsqueda por nombre no distingue mayúsculas ni tildes.
- **Búsqueda por nombre parcial** (solo nombre de pila): ver Assumptions; si devuelve varias coincidencias, se aplica US2.
- **El solicitante cambia de identidad a mitad de la conversación** (da otro documento después de verificarse): la verificación previa no se transfiere; el nuevo solicitante debe verificarse desde cero.
- **El core falla de forma transitoria durante la búsqueda o la verificación**: se aplican los reintentos acotados del #7; si se agotan, se escala. Nunca se da por verificada una identidad sin respuesta del core.
- **Se llama a la verificación sin haber buscado antes**: el core la acepta solo si el identificador de solicitante existe; no depende del orden de llamadas del agente.
- **La misma verificación correcta se repite**: el resultado es el mismo y no se duplica el registro de auditoría (idempotencia, Principio VI).
- **Moneda, documentos de soporte e ingresos**: fuera de este ticket.

## Requirements *(mandatory)*

### Functional Requirements

**Búsqueda**

- **FR-001**: El core MUST ofrecer una herramienta `buscar_solicitante` que busque por número de documento o por nombre y devuelva **todas** las coincidencias, con los datos mínimos para desambiguar (identificador del solicitante, nombre y documento parcialmente enmascarado).
- **FR-002**: Una búsqueda sin coincidencias MUST responder con éxito y una lista vacía, no con un error.
- **FR-003**: Un criterio de búsqueda mal formado MUST responder con un error de validación que indique el campo, según el contrato de errores del #7.
- **FR-004**: La búsqueda por documento MUST normalizar puntos, espacios y guiones; la búsqueda por nombre MUST ignorar mayúsculas y tildes.

**Desambiguación**

- **FR-005**: Con más de una coincidencia, el agente MUST pedir al solicitante un dato que desambigüe, mediante un evento `solicitud_de_dato`, y MUST NOT verificar ni elegir ninguna coincidencia por su cuenta.
- **FR-006**: Si tras pedir el dato desambiguador sigue habiendo más de una coincidencia, el agente MUST escalar a un analista con el motivo y el número de coincidencias. El resumen detallado para el analista es del #15.

**Verificación**

- **FR-007**: El core MUST ofrecer una herramienta `verificar_identidad` que reciba el identificador del solicitante y un dato adicional, y confirme la identidad solo si el dato coincide con el que tiene el core. El dato adicional es la **fecha de expedición del documento de identidad**, en formato AAAA-MM-DD. Es mal formada si no sigue ese formato, no es una fecha de calendario válida o es posterior a la fecha actual.
- **FR-008**: `verificar_identidad` MUST distinguir: (a) dato bien formado que no coincide → **error de negocio**; (b) dato mal formado → **error de validación** con el campo; (c) solicitante inexistente → **error de negocio**. Solo un error de negocio por dato que no coincide cuenta como intento fallido.
- **FR-009**: Se permiten **3 intentos fallidos** por solicitante en una misma conversación. Al tercero, el core MUST bloquear la verificación de ese solicitante en esa conversación: cualquier intento posterior, aun con el dato correcto, responde con un error de negocio de verificación bloqueada. El agente MUST escalar entonces a un analista con el motivo "identidad no verificable" (constitución, Principio V). El límite lo aplica el core, no el modelo.
- **FR-010**: Ninguna respuesta de verificación fallida MUST revelar el dato correcto ni pistas sobre él.
- **FR-011**: El agente MUST pedir la identificación **al inicio del trámite**: en cuanto el solicitante expresa que quiere iniciar una solicitud, y antes de pedir, recibir o procesar documentos de soporte o datos de la solicitud. Las preguntas generales (tasa, requisitos, cómo funciona) se responden sin identificar. Las reglas 4 (pedir una persona) y 5 (caso no cubierto) se evalúan antes y, si aplican, se escala sin pedir identificación (orden 4 → 5 → 1 → 3 → 2).
- **FR-011a**: Si el solicitante entrega un documento de soporte antes de estar verificado, el agente MUST NOT extraer ni usar su contenido; MUST pedir primero la identificación y, una vez verificada, solicitar de nuevo el documento o retomarlo. En este ticket se cumple por la instrucción del sistema. La garantía por código llega cuando la herramienta de extracción del #10 entre en la lista del control de identidad (FR-014).

**Estado de identidad**

- **FR-012**: El estado de identidad (verificada / no verificada, solicitante y marca de tiempo) MUST guardarse en el core, asociado al `correlationId` de la conversación, y MUST poder consultarse desde los controles del agente sin pasar por el modelo.
- **FR-013**: El estado de identidad MUST cambiar a "verificada" solo como resultado de una verificación exitosa en el core; ninguna afirmación del modelo lo cambia.
- **FR-014**: Una acción que exige identidad verificada MUST bloquearse en dos capas: el control del agente la impide antes de invocar la herramienta (evento `bloqueo_por_regla`, Regla 1), y el core la rechaza por su lado si llega (constitución, Principio IV). La acción concreta (registrar) la entrega #13; aquí se deja disponible la consulta y el control.

**Auditoría y observabilidad**

- **FR-015**: Cada búsqueda y cada verificación MUST quedar en los logs estructurados con el `correlationId`. Cada verificación (exitosa o fallida) MUST dejar un registro de auditoría con regla, resultado y marca de tiempo, sin el dato adicional en claro.
- **FR-016**: `verificar_identidad` MUST ser idempotente: repetir una verificación exitosa no duplica efectos ni registros de auditoría.

**Datos y pruebas**

- **FR-017**: Los datos de ejemplo del core MUST incluir al menos: un solicitante único, dos homónimos (mismo nombre, documentos y fechas de expedición distintos) y un documento y un nombre documentados sin coincidencias, todos según `docs/datos-ficticios.md`.
- **FR-018**: Búsqueda, verificación, distinción de errores, límite de intentos y bloqueo sin identidad MUST tener pruebas automáticas sin red ni modelo real.

### Key Entities

- **Solicitante**: persona registrada en el core, con identificador, nombre, número de documento y fecha de expedición del documento (dato adicional de verificación). Ficticio.
- **Coincidencia de búsqueda**: vista reducida de un solicitante (identificador, nombre, documento enmascarado) que devuelve la búsqueda; nunca incluye el dato adicional.
- **Intento de verificación**: dato adicional presentado para un solicitante, con su resultado (verificado, no coincide, mal formado, bloqueado) y marca de tiempo. El core cuenta los fallidos por solicitante y conversación; al tercero, la verificación queda bloqueada.
- **Estado de identidad**: por conversación (`correlationId`): verificada o no, solicitante verificado y marca de tiempo. Lo guarda el core y lo consultan los controles del agente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las llamadas a herramientas que exigen identidad se bloquean si el core no tiene la identidad verificada, incluso cuando el modelo afirma lo contrario. Cuando exista el registro (#13), el 0% de las solicitudes se registra sin verificación.
- **SC-002**: En el 100% de las búsquedas con homónimos, el agente pide un dato desambiguador y no verifica a ninguno por su cuenta.
- **SC-003**: El 100% de las búsquedas sin coincidencias terminan sin error, y el 100% de los datos mal formados se reportan como error de validación, distinto del dato que no coincide.
- **SC-004**: Ninguna respuesta, log ni registro de auditoría contiene el dato adicional de verificación en claro.
- **SC-005**: Los casos de prueba 1 y 5 del enunciado se reproducen con los datos ficticios del core y dan el resultado esperado.
- **SC-006**: Las pruebas de búsqueda, verificación y bloqueo corren sin red ni modelo real, y pasan.

## Assumptions

- **Búsqueda por nombre**: coincide por nombre completo normalizado (sin mayúsculas ni tildes). La búsqueda parcial o aproximada queda fuera de este ticket.
- **Enmascarado del documento** en las coincidencias: se muestran solo los últimos dígitos, para que el solicitante reconozca el suyo sin exponer el número completo.
- **Alcance de la verificación**: vale solo para la conversación (`correlationId`) en que se hizo; no se persiste entre ejecuciones, como el resto del core simulado.
- **Registrar la solicitud** es del #13: aquí se entregan la consulta del estado y el control que bloquea; #13 lo conecta a su herramienta y agrega el rechazo del lado del servidor en ella.
- **Escalar a analista** usa la señal de escalamiento existente del #7/#8; el resumen estructurado completo para el analista es del #15.
- **Reintentos ante fallas transitorias** reutilizan los del #7.
- **Documentos antes de verificar**: el chat del #8 ya entrega su contenido al modelo. Bloquear su uso de forma determinista depende de la herramienta de extracción del #10.
- **Código de producción**: vive bajo `src/` (herramientas en `src/mcp/`, controles en `src/agente/`), con esta spec, como exige el guardián del #5.
