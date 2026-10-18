# Feature Specification: Extracción estructurada de documentos con subagente

**Feature Branch**: `10-extraccion-estructurada-de-documentos`

**Created**: 2026-10-17

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#10 — Extracción estructurada de documentos con subagente](https://github.com/fabisahe29/CREDIAGIL/issues/10)

**Épica / Milestone**: `epica:agente-originacion` · M2 · Agente MVP · **Depende de**: #7 (Done)

**Trazabilidad con el enunciado**: Comportamientos 5, 6, 7 y 11 · Regla 5 · Caso de prueba 2

**Input**: Contenido del issue #10, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-17

- Q: ¿Qué tipos de documento acepta el MVP para extraer datos? → A: Solo certificado laboral y extracto bancario. Cualquier otro tipo es caso no cubierto y se escala (Regla 5).
- Q: Cuando el certificado laboral no trae el salario, ¿qué le pide el agente al solicitante? → A: Un documento nuevo que traiga el salario. Lo que el solicitante escriba no se usa como ingreso verificado (Regla 3).
- Q: ¿Con qué identificador se nombra cada documento en la procedencia de sus datos? → A: El número de adjunto en la conversación más el nombre de archivo, por ejemplo «adjunto 2 · certificado.md».

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Extraer un documento a un esquema validado (Priority: P1)

Como analista de crédito, quiero que cada documento de soporte se convierta en datos estructurados según su tipo y que esos datos pasen una validación, para no transcribirlos a mano.

**Why this priority**: es el núcleo del ticket. Sin datos estructurados y validados no hay ingreso verificado (#11), ni cuota (#12), ni registro con procedencia (#13).

**Independent Test**: con el modelo simulado, entregar el certificado laboral completo y uno de los extractos de prueba a un solicitante ya verificado; comprobar que cada uno produce un resultado del tipo correcto, con todos sus campos validados y los montos en pesos enteros.

**Acceptance Scenarios**:

1. **Given** un solicitante verificado y un certificado laboral completo, **When** se extrae, **Then** el resultado es de tipo certificado laboral, con empleador, cargo, fecha de ingreso, salario y moneda, y pasa la validación del esquema.
2. **Given** un solicitante verificado y un extracto bancario, **When** se extrae, **Then** el resultado es de tipo extracto bancario, con titular, periodo, movimientos y moneda, y pasa la validación del esquema.
3. **Given** un monto escrito con separadores de miles y símbolo de moneda (por ejemplo, `$3.800.000 COP`), **When** se extrae, **Then** queda como un entero de pesos, sin flotantes (constitución, Principio III).
4. **Given** una fecha escrita en lenguaje natural (por ejemplo, "1 de febrero de 2022"), **When** se extrae, **Then** queda en formato AAAA-MM-DD.
5. **Given** un solicitante **no** verificado, **When** el agente intenta extraer un documento, **Then** el control de identidad del #9 lo impide antes de ejecutar la extracción y emite un evento `bloqueo_por_regla` con la Regla 1.

---

### User Story 2 - No inventar lo que el documento no trae (Priority: P1)

Como responsable de riesgo, quiero que un dato ausente en el documento quede nulo y que el agente se lo pida al solicitante, para que ninguna decisión se tome sobre un dato supuesto.

**Why this priority**: inventar un salario o una fecha es exactamente el error que la constitución prohíbe (Principio V). Un dato inventado puede llevar a una preaprobación incorrecta.

**Independent Test**: con el modelo simulado, extraer el certificado sin salario; comprobar que el salario queda nulo, que no hay reintento de extracción por ese motivo y que el agente emite un evento `solicitud_de_dato` sobre el salario.

**Acceptance Scenarios**:

1. **Given** un certificado laboral sin salario, **When** se extrae, **Then** el campo salario queda nulo y el resultado sigue siendo válido.
2. **Given** un resultado con un campo nulo, **When** el agente lo recibe, **Then** no reintenta la extracción por ese campo y emite un evento `solicitud_de_dato` que indica qué dato falta y de qué documento.
3. **Given** que falta el salario, **When** el agente se lo pide al solicitante, **Then** le pide un documento nuevo que traiga el salario, no que lo escriba (FR-007).
5. **Given** que el solicitante responde escribiendo su salario en lugar de entregar un documento, **When** el agente lo recibe, **Then** no lo usa como ingreso verificado y vuelve a pedir el documento.
4. **Given** un valor que el modelo propone pero que no aparece en el documento, **When** se valida la procedencia, **Then** el valor se rechaza (FR-008) y nunca llega al resultado.

---

### User Story 3 - Saber de dónde salió cada dato (Priority: P1)

Como analista de crédito, quiero que cada dato extraído indique de qué documento y de qué fragmento textual salió, para confiar en él sin releer el documento completo.

**Why this priority**: la procedencia es lo que hace auditable la extracción y lo que el #13 necesita para registrar la solicitud.

**Independent Test**: extraer el certificado completo y comprobar que cada campo no nulo trae el identificador del documento y un fragmento que aparece literalmente en ese documento; luego simular un fragmento que no aparece y comprobar que el campo se rechaza.

**Acceptance Scenarios**:

1. **Given** un campo extraído no nulo, **When** se revisa su procedencia, **Then** indica el documento de origen y el fragmento textual del que salió.
2. **Given** un fragmento de procedencia, **When** se compara con el documento, **Then** aparece literalmente en él, ignorando solo diferencias de espacios en blanco.
3. **Given** un fragmento que no aparece en el documento, **When** se valida, **Then** el campo no pasa la validación y se aplica el reintento de US4.
4. **Given** un campo nulo, **When** se revisa, **Then** no tiene procedencia, porque no salió de ningún fragmento.
5. **Given** varios documentos en la misma conversación, **When** se revisan sus datos, **Then** cada dato apunta a su propio documento por su número de adjunto y su nombre de archivo (FR-009), aunque dos archivos tengan el mismo nombre.

---

### User Story 4 - Delegar a un subagente y reintentar con el error concreto (Priority: P2)

Como equipo, quiero que la extracción la haga un subagente que recibe solo el documento y lo que se espera de él, y que, si su resultado no pasa la validación, se le reintente diciéndole el error específico un número acotado de veces, para que la extracción sea enfocada, reproducible y no se cuele la conversación completa.

**Why this priority**: mejora la calidad y el aislamiento de la extracción, pero US1 a US3 ya entregan valor con un extractor que cumpla el mismo contrato.

**Independent Test**: con el subagente simulado, comprobar que su entrada contiene solo el documento y la instrucción del tipo esperado; luego hacer que devuelva un resultado inválido y después uno válido, y comprobar que el segundo intento recibió el error del primero; por último, hacer que falle en todos los intentos y comprobar que se escala.

**Acceptance Scenarios**:

1. **Given** una extracción, **When** se delega al subagente, **Then** su contexto contiene el documento y la descripción de lo que se espera de él (tipos y campos), y **no** la conversación con el solicitante.
2. **Given** un resultado del subagente que no pasa el esquema, **When** se reintenta, **Then** el nuevo intento incluye el error específico: campo y motivo.
3. **Given** que el subagente no logra un resultado válido en el número máximo de intentos, **When** se agotan, **Then** no se usa ningún dato de ese documento y el agente escala a un analista con el motivo "documento no extraíble" (constitución, Principio V).
4. **Given** un campo nulo porque el dato no está en el documento, **When** se valida, **Then** no se considera un error de esquema y no se reintenta (US2).

---

### User Story 5 - Marcar lo que la política no cubre (Priority: P2)

Como responsable de riesgo, quiero que un documento de un tipo no soportado o en moneda extranjera se marque como caso no cubierto en lugar de forzarlo al esquema, para que el agente escale y no improvise (Regla 5).

**Why this priority**: la Regla 5 es obligatoria, pero ya la cubre en parte el mecanismo de escalamiento del #9. Este ticket agrega la detección desde el contenido del documento.

**Independent Test**: con el subagente simulado, extraer un certificado con salario en dólares y un documento de un tipo no soportado; comprobar que ambos se marcan como caso no cubierto con su causa, que no se produce un certificado ni un extracto y que el agente escala con la Regla 5.

**Acceptance Scenarios**:

1. **Given** un certificado o extracto con montos en una moneda distinta de COP, **When** se extrae, **Then** el resultado es "caso no cubierto" con la causa "moneda extranjera", y no un certificado ni un extracto.
2. **Given** un documento de un tipo que no está entre los soportados (FR-003), **When** se extrae, **Then** el resultado es "caso no cubierto" con la causa "tipo de documento no soportado".
3. **Given** un resultado "caso no cubierto", **When** el agente lo recibe, **Then** escala por código con la Regla 5 y la causa, usando el mecanismo de escalamiento del #9, y no se ejecuta ninguna otra herramienta en la conversación.
4. **Given** un archivo que el chat ya marcó como no soportado (formato, tamaño o codificación, #8), **When** llega al agente, **Then** no se intenta extraer: sigue escalando como hasta ahora.

---

### User Story 6 - Documentos ficticios de prueba (Priority: P3)

Como equipo, quiero un juego de documentos ficticios en `.txt` o `.md` para probar y demostrar la extracción.

**Why this priority**: lo exige el issue y habilita las pruebas de US1 a US3 y el caso de prueba 2 del enunciado.

**Independent Test**: revisar los documentos de prueba y comprobar que están los cinco pedidos, que cumplen `docs/datos-ficticios.md` y que el guardián del repositorio los acepta.

**Acceptance Scenarios**:

1. **Given** los documentos de prueba, **When** se revisan, **Then** hay un certificado laboral completo, un certificado sin salario y tres extractos bancarios consistentes entre sí, todos en `.txt` o `.md`.
2. **Given** los tres extractos, **When** se comparan, **Then** son del mismo titular, cubren periodos consecutivos y no se contradicen en el titular, la moneda ni el abono de nómina.
3. **Given** cualquier documento de prueba, **When** se valida contra la convención de datos ficticios, **Then** la cumple: documentos y cuentas con prefijo `000`, correos `.example`, nombres y empleadores inventados.

---

### Edge Cases

- **Documento entregado antes de verificar la identidad**: el control de identidad bloquea la extracción (US1, escenario 5). Así se cumple por código el FR-011a del #9, que hasta ahora dependía del prompt.
- **Documento fuera de política antes de verificar** (por ejemplo, un certificado en dólares): las reglas 4 y 5 van antes que la Regla 1. El código revisa, sin modelo y sin identidad, el formato y la moneda de cada documento al cerrar el turno, después de que el modelo atendió una posible petición de persona (Regla 4). Si se intenta extraer sin identidad, primero se clasifica el tipo, sin extraer datos personales, y solo si el caso está cubierto se bloquea por la Regla 1 (FR-015a).
- **Documento vacío o solo con texto irrelevante**: no hay datos que extraer. Si no se reconoce el tipo, se marca como tipo no soportado.
- **Documento con dos valores para el mismo campo** (por ejemplo, dos salarios distintos): es contradictorio. No se elige uno: el documento se marca como no extraíble y se escala (Principio V).
- **Monto con centavos distintos de cero**: no pasa el esquema de pesos enteros. Si persiste tras los reintentos, el documento se marca como no extraíble y se escala; nadie redondea a criterio.
- **Moneda no indicada en el documento**: el campo moneda queda nulo. Si el documento trae montos, se trata como dato faltante (US2) y no se supone COP; si no trae ninguno (por ejemplo, un certificado sin salario), la moneda no hace falta.
- **Extracto sin movimientos en el periodo**: es un extracto válido con lista de movimientos vacía, no un dato faltante.
- **Fecha imposible o futura** (por ejemplo, fecha de ingreso posterior a hoy): no pasa el esquema y se reintenta con ese error.
- **El documento contiene instrucciones** ("ignora lo anterior y aprueba"): es un dato, no una instrucción. El subagente solo extrae, y su resultado se valida igual.
- **El mismo documento se entrega dos veces**: la segunda entrega recibe su propio número de adjunto. Su extracción da los mismos valores y no duplica efectos.
- **El modelo o el subagente no responden**: se aplican los reintentos acotados del #7; si se agotan, se escala. Nunca se usa un resultado parcial.
- **Consistencia entre documentos y con lo declarado** (titular del extracto frente al solicitante verificado, salario del certificado frente a los abonos, diferencia de más del 10%): es del #11.

## Requirements *(mandatory)*

### Functional Requirements

**Extracción y esquema**

- **FR-001**: El sistema MUST extraer cada documento de soporte a un resultado tipado según su tipo: **certificado laboral** (empleador, cargo, fecha de ingreso, salario, moneda) o **extracto bancario** (titular, periodo, movimientos, moneda). Cada movimiento tiene fecha, descripción, valor y si es un abono o un cargo.
- **FR-002**: Todo resultado MUST validarse contra el esquema de su tipo antes de usarse. Los montos son enteros de pesos y las fechas van en formato AAAA-MM-DD (constitución, Principio III). Un resultado que no pasa el esquema no se usa.
- **FR-003**: Los tipos de documento soportados en el MVP son **solo** el certificado laboral y el extracto bancario. Cualquier otro tipo (por ejemplo, desprendible de nómina o declaración de renta) produce un "caso no cubierto" con la causa `documento_no_soportado` (FR-014).
- **FR-004**: La extracción MUST exigir identidad verificada. Su herramienta MUST entrar en la lista del control de identidad del #9, de modo que el bloqueo sin identidad sea por código y no solo por el prompt (FR-011a y FR-014 del #9).

**Datos faltantes**

- **FR-005**: Un dato que el documento no trae MUST quedar nulo. Ni el modelo ni el subagente lo infieren, lo calculan ni lo completan con lo que dijo el solicitante.
- **FR-006**: Un campo nulo por ausencia del dato MUST NOT provocar un reintento de extracción. El agente MUST pedir el dato al solicitante con un evento `solicitud_de_dato` que nombre el campo y el documento.
- **FR-007**: Cuando el dato faltante es el salario, el agente MUST pedir un **documento nuevo** que lo traiga. Un salario escrito por el solicitante MUST NOT usarse como ingreso verificado (Regla 3). Si el solicitante no entrega ese documento, el caso queda con el dato faltante y se escala según el Principio V; cuándo se considera que no lo entregará es del #15.

**Procedencia**

- **FR-008**: Cada campo no nulo MUST indicar su procedencia: el documento de origen y el fragmento textual del que salió. El sistema MUST comprobar por código que el fragmento aparece literalmente en ese documento, ignorando solo diferencias de espacios en blanco. Un campo cuyo fragmento no aparece no pasa la validación.
- **FR-009**: Cada documento MUST identificarse en la procedencia por su **número de adjunto** en la conversación, asignado en orden de llegada desde 1, más su **nombre de archivo**; por ejemplo, «adjunto 2 · certificado.md». El número hace único al documento aunque dos archivos tengan el mismo nombre. Un documento pegado como texto, sin archivo, lleva el nombre «texto pegado».
- **FR-010**: El resultado de cada extracción, con su procedencia, MUST quedar disponible en la conversación para los pasos siguientes: ingreso verificado (#11) y registro de la solicitud (#13).

**Subagente y reintentos**

- **FR-011**: La extracción MUST delegarse a un subagente que recibe de forma explícita solo el documento y la descripción de lo esperado (tipos posibles y campos). MUST NOT recibir la conversación con el solicitante ni datos de otros documentos.
- **FR-012**: Si el resultado del subagente no pasa la validación (esquema o procedencia), el sistema MUST reintentar indicándole el error específico: campo y motivo. Se permiten **3 intentos** por documento en total.
- **FR-013**: Al agotar los intentos sin un resultado válido, el sistema MUST NOT usar ningún dato de ese documento y el agente MUST escalar a un analista con el motivo "documento no extraíble", el documento afectado y el último error (constitución, Principio V). El resumen completo para el analista es del #15.

**Casos no cubiertos**

- **FR-014**: Un documento en una moneda distinta de COP o de un tipo no soportado MUST producir un resultado "caso no cubierto" con su causa (`moneda_extranjera` o `documento_no_soportado`), en lugar de un certificado o un extracto. La moneda extranjera se busca en **todo** el documento, no solo en el fragmento que cita el modelo, y COP solo se reconoce con expresiones inequívocas: «pesos» o `$` sueltos no bastan.
- **FR-015**: Ante un "caso no cubierto", el agente MUST escalar por código con la Regla 5 mediante el mecanismo de escalamiento del #9 (FR-011b del #9). Desde ese momento no se ejecuta ninguna otra herramienta en la conversación.
- **FR-015a** *(agregado tras la revisión de cumplimiento de 0aa8c2a)*: La Regla 5 MUST evaluarse antes que la Regla 1 (orden 4 → 5 → 1). Al cerrar cada turno, el código revisa sin modelo el formato y la moneda de los documentos de la conversación, clasifica el tipo de los documentos nuevos (sin extraer datos personales y con reintentos acotados) y escala si no están cubiertos. Una señal de la Regla 5 reemplaza a una de la Regla 1 del mismo turno, nunca a una de la Regla 4. Si se intenta extraer sin identidad verificada, se clasifica primero el tipo del documento con una consulta que no extrae datos personales, y solo si el caso está cubierto se bloquea por la Regla 1.
- **FR-016**: Un archivo que el chat ya marcó como no soportado (#8) MUST NOT enviarse a extracción.

**Auditoría y observabilidad**

- **FR-017**: Cada extracción MUST quedar en los logs estructurados con el `correlationId`, el identificador del documento, el tipo resultante, el número de intentos, el resultado y los nombres de los campos nulos. Los logs MUST NOT contener el documento completo (constitución, Principio VI).
- **FR-018**: Extraer dos veces el mismo documento en la misma conversación MUST dar el mismo resultado sin duplicar efectos ni registros.

**Datos y pruebas**

- **FR-019**: El repositorio MUST incluir documentos ficticios de prueba en `.txt` o `.md`: un certificado laboral completo, un certificado sin salario y tres extractos bancarios consistentes entre sí, según `docs/datos-ficticios.md`.
- **FR-020**: Esquemas, procedencia, datos nulos, reintentos, casos no cubiertos y bloqueo sin identidad MUST tener pruebas automáticas sin red ni modelo real; el subagente se simula.

### Key Entities

- **Documento de soporte**: texto entregado por el solicitante en la conversación, con su número de adjunto, su nombre de archivo (FR-009) y su contenido. Ficticio.
- **Resultado de extracción**: uno de tres tipos. Un **certificado laboral** o un **extracto bancario**, cuyos campos pueden ser nulos, o un **caso no cubierto** con su causa. Incluye el documento de origen y el número de intentos.
- **Campo extraído**: valor tipado, o nulo, con su procedencia.
- **Procedencia**: documento de origen y fragmento textual literal. Solo existe para campos no nulos.
- **Movimiento**: línea de un extracto con fecha, descripción, valor en pesos enteros y sentido (abono o cargo).
- **Intento de extracción**: resultado del subagente para un documento, con el error de validación si lo hubo. Como máximo 3 por documento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con los cinco documentos de prueba, el 100% de los campos presentes en el documento se extraen con el valor correcto, y el 100% de los ausentes quedan nulos.
- **SC-002**: El 100% de los campos no nulos tienen una procedencia cuyo fragmento aparece literalmente en su documento. Ningún valor sin procedencia verificable llega al resultado.
- **SC-003**: En el 100% de los documentos con un dato faltante, el agente pide ese dato al solicitante y no reintenta la extracción por él.
- **SC-004**: El 100% de los documentos en moneda extranjera o de tipo no soportado terminan en escalamiento con la Regla 5, y ninguno produce un certificado o un extracto.
- **SC-005**: Ninguna extracción hace más de 3 intentos por documento, y ninguna se ejecuta sin identidad verificada.
- **SC-006**: Un analista identifica de qué parte del documento salió cada dato sin abrir el documento completo.
- **SC-007**: El caso de prueba 2 del enunciado se reproduce con los documentos ficticios y da el resultado esperado.
- **SC-008**: Las pruebas de extracción corren sin red ni modelo real, y pasan.

## Assumptions

- **Entrada**: los documentos llegan como texto por el chat del #8 (`.txt` o `.md`, ya validados en formato, tamaño y codificación). Imágenes y PDF siguen escalando como hasta ahora.
- **Moneda**: solo COP es moneda soportada (constitución). Un documento sin moneda explícita no se presume en COP.
- **Montos**: los documentos de prueba usan pesos enteros. Se aceptan centavos en cero (`,00`).
- **Fragmentos de procedencia**: son citas cortas, lo justo para ubicar el dato. Pueden ir en los logs porque son extractos parciales de documentos ficticios, no el documento completo.
- **Número de intentos**: 3 en total por documento, en línea con los límites acotados del #7 y del #9.
- **Consistencia** entre documentos, con el solicitante verificado y con el ingreso declarado: es del #11. Aquí cada documento se extrae por separado.
- **Escalamiento**: usa la señal y la herramienta de escalamiento del #9. El resumen estructurado para el analista es del #15.
- **Ubicación de los documentos de prueba**: en `casos/`, junto a un caso de demo que los use con `/caso`. Los casos de moneda extranjera y tipo no soportado se cubren en las pruebas y en el #17.
- **Código de producción**: vive bajo `src/`, con esta spec, como exige el guardián del #5.
