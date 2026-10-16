# Feature Specification: Revisión independiente y de cumplimiento antes del pull request

**Feature Branch**: `6-revision-independiente-y-de-cumplimiento`

**Created**: 2026-10-16

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#6 — Revisión independiente y de cumplimiento antes del pull request](https://github.com/fabisahe29/CREDIAGIL/issues/6)

**Épica / Milestone**: `epica:flujo-y-ecosistema` · M1 · Flujo y ecosistema · **Depende de**: #4 (Done)

**Trazabilidad con el enunciado**: Necesidades 8 y 9 · Mínimos: subagentes, skills

**Input**: Contenido del issue #6, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-16

- Q: Cuando una revisión encuentra problemas, ¿qué hallazgos impiden abrir el pull request y cuáles solo se informan? → A: Bloqueo por gravedad. Bloquean una regla de negocio **incumplida** o un hallazgo de código de severidad **alta o crítica**. Los hallazgos de severidad media o baja se informan en el registro, sin bloquear.
- Q: ¿Sobre qué código trabaja cada revisión: solo los cambios del ticket respecto de `main`, o todo el repositorio? → A: Diff con contexto, para ambas. Las dos revisiones trabajan sobre los archivos que cambia el ticket respecto de `main`, y pueden leer el resto del repositorio solo como contexto.
- Q: ¿Cómo se ponen en marcha las revisiones: las pide el desarrollador con comandos propios antes de abrir el PR, o las ejecuta `/ticket-abrir-pr` por su cuenta? → A: Solo automáticas. `/ticket-abrir-pr` ejecuta siempre las dos revisiones sobre el último commit y luego decide si abre el PR. No hay comandos de revisión aparte para el desarrollador.
- Q: Como las revisiones corren antes de que exista el pull request, ¿dónde se publica su resultado: en el issue, en el PR o en ambos? → A: En el issue, enlazado desde el PR. Cada revisión se publica como comentario con marcador en el issue del ticket; si el PR se abre, su cuerpo incluye un resumen y el enlace a esos comentarios.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Revisión de código desde un contexto independiente (Priority: P1)

Como líder técnico, quiero que el código de cada ticket lo revise un revisor que no comparte el contexto de la sesión que lo generó. Así, la revisión no hereda las suposiciones ni el razonamiento del autor, y encuentra errores que la sesión autora daría por buenos.

**Why this priority**: es el núcleo del ticket. Sin aislamiento, la revisión solo confirma las decisiones de quien escribió el código. Es la base de las demás historias.

**Independent Test**: en una rama con cambios, ejecutar la revisión de código (la dispara el comando que abre el pull request, FR-008) y comprobar tres cosas: el revisor trabaja sin el historial de la sesión autora, entrega un informe de hallazgos con archivo y línea, y no puede modificar ningún archivo.

**Acceptance Scenarios**:

1. **Given** una rama de ticket con cambios, **When** se ejecuta la revisión de código, **Then** la revisión se ejecuta en un contexto aislado, que recibe lo que necesita para revisar (alcance de FR-004, spec del ticket, constitución y memoria compartida del proyecto) y no la conversación de la sesión autora.
2. **Given** una revisión en curso, **When** el revisor intenta editar o escribir un archivo, ejecutar una acción con efectos o publicar en GitHub, **Then** la acción se rechaza, porque sus herramientas se limitan a leer y analizar.
3. **Given** una revisión terminada, **When** se lee su resultado, **Then** cada hallazgo indica severidad, archivo, línea, descripción y una sugerencia de corrección, y el informe dice explícitamente si no hubo hallazgos.

---

### User Story 2 - Verificación de cumplimiento de las reglas de negocio (Priority: P1)

Como líder técnico, quiero que una revisión de cumplimiento contraste el código con la constitución y con las especificaciones, y que informe el estado de cada regla de negocio (1 a 5) con evidencia. Así, una desviación de las reglas, que invalidaría la solución (constitución, Principio I), se detecta antes de fusionar.

**Why this priority**: las reglas de negocio son el criterio de evaluación del producto. Un solo caso que las viole invalida la entrega, sin importar la calidad del resto.

**Independent Test**: ejecutar la revisión de cumplimiento sobre una rama con código del agente, y comprobar que el informe tiene exactamente una entrada por cada regla de negocio, con su estado y su evidencia. Repetirla sobre una rama que introduce a propósito una violación (por ejemplo, un umbral cambiado) y comprobar que esa regla aparece como incumplida.

**Acceptance Scenarios**:

1. **Given** una rama de ticket, **When** se ejecuta la revisión de cumplimiento, **Then** el informe lista las reglas de negocio 1 a 5 de la constitución, cada una como **cumplida**, **incumplida** o **no aplicable**.
2. **Given** una regla cumplida o incumplida, **When** se lee su entrada, **Then** la evidencia cita archivo y línea del código y, cuando aplica, el requisito de la spec o el principio de la constitución contra el que se contrastó.
3. **Given** una regla no aplicable (por ejemplo, porque el ticket no toca código del agente), **When** se lee su entrada, **Then** el informe explica por qué no aplica.
4. **Given** código que viola una regla (por ejemplo, un umbral distinto de $5.000.000, una comparación sobre flotantes sin redondeo definido o un orden de evaluación distinto de 4 → 5 → 1 → 3 → 2), **When** se revisa, **Then** la regla aparece como incumplida, con la evidencia.
5. **Given** la revisión de cumplimiento, **When** se ejecuta, **Then** cumple las mismas condiciones de aislamiento y de herramientas de solo lectura que la revisión de código (FR-001 y FR-003).

---

### User Story 3 - Sin revisión no hay pull request (Priority: P2)

Como líder técnico, quiero que el comando que abre el pull request ejecute siempre las dos revisiones sobre el último commit de la rama, y que solo abra el pull request si el resultado lo permite. Así, la revisión no depende de que alguien se acuerde de pedirla.

**Why this priority**: convierte las revisiones de las historias 1 y 2 en una puerta del flujo. Depende de que ellas existan.

**Independent Test**: en una rama con cambios, ejecutar el comando que abre el pull request y comprobar que, antes de abrirlo, ejecuta las dos revisiones sobre el último commit. Repetirlo en una rama con una regla incumplida a propósito: se niega. Añadir un commit y repetir: las revisiones se ejecutan de nuevo sobre el commit nuevo.

**Acceptance Scenarios**:

1. **Given** una rama de ticket con cambios, **When** se ejecuta el comando que abre el pull request, **Then** ejecuta la revisión de código y la de cumplimiento sobre el último commit de la rama antes de decidir, sin que el desarrollador las pida aparte.
2. **Given** revisiones terminadas sin reglas incumplidas ni hallazgos altos o críticos, **When** el comando decide, **Then** abre el pull request, y los hallazgos medios o bajos quedan informados en el registro.
3. **Given** revisiones con una regla de negocio incumplida o un hallazgo de severidad alta o crítica, **When** el comando decide, **Then** no abre el pull request, y el mensaje lista lo que lo bloquea, con archivo y línea.
4. **Given** una revisión que falla (error, tiempo agotado o respuesta incompleta), **When** el comando decide, **Then** no abre el pull request y el mensaje informa la causa.
5. **Given** una rama que recibió commits después de una ejecución anterior, **When** se vuelve a ejecutar el comando, **Then** las revisiones se ejecutan sobre el commit nuevo; el resultado anterior no cuenta.

---

### User Story 4 - El resultado de las revisiones queda registrado (Priority: P2)

Como líder técnico o evaluador, quiero que el resultado de ambas revisiones quede registrado en el issue del ticket, y que el pull request lo resuma y lo enlace. Así, cualquiera puede ver qué se revisó, qué se encontró y sobre qué versión del código, sin depender de la sesión que lo pidió.

**Why this priority**: da trazabilidad y permite auditar la decisión de fusionar. Sin registro, la revisión no se puede demostrar.

**Independent Test**: ejecutar el comando que abre el pull request y comprobar que el issue tiene un comentario por revisión, con el commit revisado, y que el cuerpo del pull request los resume y enlaza. Repetirlo en una rama que se bloquea: los comentarios quedan en el issue aunque no haya pull request. Repetir el registro y comprobar que no se duplica.

**Acceptance Scenarios**:

1. **Given** una revisión terminada, **When** se registra, **Then** el issue del ticket recibe un comentario con el tipo de revisión, el commit revisado, el resumen de hallazgos (o de estados por regla), la decisión y la fecha, tanto si el pull request se abre como si se bloquea.
2. **Given** un pull request que se abre, **When** se lee su cuerpo, **Then** resume ambas revisiones y enlaza a sus comentarios del issue.
3. **Given** un registro ya publicado para el mismo tipo de revisión y el mismo commit, **When** se vuelve a registrar, **Then** no se publica un duplicado.
4. **Given** un registro, **When** se lee, **Then** no contiene datos de solicitantes ni secretos, solo hallazgos sobre el código (constitución, Principio II).

---

### User Story 5 - Mecanismos explícitos y decisiones registradas (Priority: P3)

Como evaluador, quiero que las revisiones se construyan con los mecanismos que pide el enunciado (subagentes y skills, con aislamiento de contexto, herramientas restringidas y ayuda de argumentos), y que `DECISIONES.md` explique cada mecanismo elegido y la alternativa descartada.

**Why this priority**: es un requisito de la entrega y da trazabilidad. No cambia el comportamiento de las historias anteriores.

**Independent Test**: localizar en el repositorio al menos 2 subagentes y 2 skills de revisión, y comprobar que entre las skills se usan las opciones de contexto aislado, herramientas permitidas y ayuda de argumentos. Para cada mecanismo, localizar su entrada en `DECISIONES.md` con la alternativa descartada.

**Acceptance Scenarios**:

1. **Given** el repositorio, **When** se buscan los mecanismos de revisión, **Then** hay al menos 2 subagentes y al menos 2 skills, y entre las skills se usan `context: fork`, `allowed-tools` y `argument-hint`.
2. **Given** cada mecanismo elegido, **When** se lee `DECISIONES.md`, **Then** tiene su decisión, su motivo y la alternativa descartada.

---

### Edge Cases

- **Ticket sin código del agente** (por ejemplo, un ticket de flujo como este): la revisión de cumplimiento informa las 5 reglas como no aplicables, cada una con su motivo. No las da por cumplidas.
- **Regla parcialmente implementada** (por ejemplo, un ticket que implementa la regla 2 pero no el orden de evaluación completo): se informa como incumplida o no aplicable según lo que el ticket declara en su spec, nunca como cumplida sin evidencia.
- **Revisión desactualizada**: si hay commits posteriores a una revisión anterior, esa revisión no cuenta; el comando revisa de nuevo el último commit (US3, escenario 5).
- **Reintento sobre el mismo commit** (por ejemplo, tras un fallo de red al publicar): el comando reutiliza el registro de la revisión ya terminada sobre ese commit, sin repetirla ni duplicarlo (FR-009, FR-011).
- **Revisión que falla** (error, tiempo agotado o respuesta incompleta del revisor): no cuenta como revisión hecha. El pull request no se abre y el mensaje informa la causa (constitución, Principio VI: nunca se decide sin respuesta).
- **Revisor que intenta corregir lo que encuentra**: no puede; el hallazgo queda en el informe y la corrección la hace la sesión de desarrollo.
- **Hallazgo que menciona datos con forma real del código revisado**: el registro no los reproduce literalmente; cita archivo y línea y, si hace falta, el dato enmascarado.
- **Pull request ya abierto sin revisión** (por ejemplo, abierto a mano desde la web): queda fuera de la puerta, que solo vive en `/ticket-abrir-pr` (ver Assumptions). Si después se ejecuta `/ticket-abrir-pr` sobre esa rama, reutiliza el PR, pero ejecuta igual las revisiones y las registra en el issue.
- **Cambios solo en documentación o specs**: se revisan igual; la revisión de cumplimiento informa las reglas como no aplicables si no hay código del agente.
- **Violación fuera del diff**: si el cambio del ticket rompe una regla cuya implementación vive en un archivo no modificado, el revisor la detecta leyendo ese archivo como contexto y la informa como incumplida, citando la línea cambiada y la afectada. Una violación preexistente que el ticket no toca no bloquea; se puede informar como observación (FR-004).
- **Diff vacío** (la rama no tiene cambios respecto de `main`): no hay nada que revisar; la revisión lo informa y no habilita el pull request, coherente con `/ticket-abrir-pr`, que ya rechaza ramas sin cambios.
- **Varios ciclos de revisión** en la misma rama (el PR se niega, se corrige y se reintenta): cada ciclo se registra con su commit; la decisión usa solo el del último commit.

## Requirements *(mandatory)*

### Functional Requirements

**Revisión de código independiente**

- **FR-001**: La revisión de código MUST ejecutarse en un contexto aislado de la sesión que generó el código: el revisor MUST NOT recibir la conversación, el razonamiento ni las notas de la sesión autora. Recibe el alcance a revisar (FR-004), la spec del ticket, la constitución y la memoria compartida del proyecto (`CLAUDE.md` y `.claude/rules/`), que no es de ninguna sesión en particular.
- **FR-002**: El informe de la revisión de código MUST listar cada hallazgo con severidad, archivo, línea, descripción y sugerencia, en un formato estructurado. Si no hay hallazgos, MUST decirlo explícitamente.
- **FR-003**: Cada revisor MUST tener herramientas restringidas a su rol: puede leer y analizar el repositorio, pero MUST NOT editar ni escribir archivos, ejecutar comandos con efectos ni publicar en GitHub. El registro de FR-010 lo hace el flujo, no el revisor.
- **FR-004**: El alcance de ambas revisiones MUST ser el diff del ticket: los archivos que la rama cambia respecto de `main`. El revisor MAY leer el resto del repositorio solo como contexto, para entender o contrastar el cambio.
  1. Los hallazgos y estados de regla MUST referirse al diff: un hallazgo cita una línea cambiada, o una línea de contexto a la que el cambio afecta (por ejemplo, un cambio que rompe el orden de evaluación definido en otro archivo), y en ese caso cita ambas.
  2. Un defecto preexistente en código que el ticket no toca MUST NOT bloquear el pull request; MAY informarse como observación de severidad baja.

**Revisión de cumplimiento**

- **FR-005**: La revisión de cumplimiento MUST contrastar el diff del ticket (FR-004) con la constitución y con la spec del ticket, y MUST informar las reglas de negocio 1 a 5 del Principio I, cada una exactamente una vez, como **cumplida**, **incumplida** o **no aplicable**.
- **FR-006**: Cada regla cumplida o incumplida MUST citar evidencia de archivo y línea. Cada regla no aplicable MUST explicar por qué no aplica. Una regla sin evidencia MUST NOT informarse como cumplida.
- **FR-007**: La revisión de cumplimiento MUST verificar también las restricciones de la constitución que sostienen las reglas: umbrales y tasa en un único módulo de política, orden de evaluación 4 → 5 → 1 → 3 → 2, aritmética exacta sobre montos y decisiones deterministas fuera del modelo.

**Puerta antes del pull request**

- **FR-008**: El comando del flujo que abre el pull request (`/ticket-abrir-pr`) MUST ejecutar la revisión de código y la de cumplimiento sobre el último commit de la rama antes de abrirlo, y MUST NOT abrirlo sin el resultado de ambas. Las revisiones MUST NOT exponerse como comandos aparte para el desarrollador: solo las dispara el flujo. La revisión es bloqueante por gravedad:
  1. MUST impedir abrir el pull request una regla de negocio informada como **incumplida** o un hallazgo de código de severidad **alta** o **crítica**.
  2. Los hallazgos de severidad **media** o **baja** MUST NOT impedirlo; MUST quedar informados en el registro (FR-010).
  3. El mensaje de bloqueo MUST listar los hallazgos o reglas que lo causan, con archivo y línea.
- **FR-008a**: La revisión de código MUST clasificar cada hallazgo en una de cuatro severidades: **crítica** (rompe una regla de negocio, expone un secreto o un dato con forma real, o corrompe datos), **alta** (error de comportamiento o de seguridad reproducible), **media** (riesgo o defecto sin efecto inmediato, como falta de una prueba de borde) o **baja** (legibilidad, estilo o mejora menor).
- **FR-009**: Solo cuenta el resultado de una revisión hecha sobre el último commit de la rama. Una revisión fallida, incompleta o sobre un commit anterior MUST NOT permitir abrir el pull request. Si ya existe el registro de una revisión terminada sobre ese mismo commit (por ejemplo, al reintentar el comando), el flujo MAY reutilizarlo en lugar de repetir la revisión, para que el reintento sea idempotente y la decisión no cambie.

**Registro**

- **FR-010**: El resultado de cada revisión MUST registrarse como un comentario en el issue del ticket, con el tipo de revisión, el commit revisado, el resumen (hallazgos por severidad o estados por regla), la decisión (bloquea o no) y la fecha. Se registra tanto si el pull request se abre como si se bloquea.
- **FR-010a**: Si el pull request se abre, su cuerpo MUST incluir un resumen de ambas revisiones (commit revisado, decisión y número de hallazgos por severidad o de reglas por estado) y el enlace a cada comentario de registro del issue.
- **FR-011**: El registro MUST ser idempotente: como máximo un comentario por tipo de revisión y commit revisado, identificado por un marcador, como los comentarios de avance del flujo de tickets.
- **FR-012**: El registro MUST NOT contener datos de solicitantes, secretos ni datos con forma real; los hallazgos los citan por archivo y línea.

**Mecanismos y trazabilidad**

- **FR-013**: Las revisiones MUST construirse con al menos 2 subagentes y al menos 2 skills. Entre las skills MUST usarse `context: fork`, `allowed-tools` y `argument-hint`.
- **FR-014**: Cada mecanismo elegido y la alternativa descartada MUST quedar registrados en `DECISIONES.md`.
- **FR-015**: Los mecanismos de revisión MUST vivir en la configuración compartida del repositorio, para que cualquiera que lo clone los tenga sin pasos adicionales.

### Key Entities

- **Revisión**: ejecución de un revisor sobre un alcance y un commit. Tiene tipo (código o cumplimiento), commit revisado, alcance, resultado y fecha.
- **Revisor**: rol aislado que ejecuta una revisión con herramientas de solo lectura. Hay uno por tipo de revisión.
- **Hallazgo**: resultado de la revisión de código. Tiene severidad, archivo, línea, descripción y sugerencia.
- **Estado de regla**: resultado de la revisión de cumplimiento para una regla de negocio (1 a 5): cumplida, incumplida o no aplicable, con evidencia o motivo.
- **Registro de revisión**: comentario con marcador en el issue del ticket, único por tipo de revisión y commit; el cuerpo del pull request lo resume y lo enlaza.
- **Puerta de pull request**: paso del comando que abre el pull request: ejecuta las dos revisiones sobre el último commit y decide, según la gravedad (FR-008), si lo abre.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los pull requests abiertos con el flujo del equipo tienen una revisión de código y una de cumplimiento registradas sobre su último commit.
- **SC-002**: El 100% de los informes de cumplimiento listan las 5 reglas de negocio, cada una con estado y evidencia o motivo.
- **SC-003**: En una rama con una violación introducida a propósito en cada una de las 5 reglas, la revisión de cumplimiento marca como incumplida el 100% de las reglas violadas.
- **SC-004**: 0 archivos modificados por un revisor: cada intento de edición o escritura durante una revisión se rechaza.
- **SC-005**: El 100% de las ejecuciones del comando que abre el pull request ejecutan (o reutilizan, sobre el mismo commit) las dos revisiones antes de decidir, y el 100% de las que tienen una revisión fallida o incompleta se niegan con la causa.
- **SC-005a**: El 100% de los intentos de abrir un pull request con una regla incumplida o un hallazgo alto o crítico se niegan, y el 0% de los que solo tienen hallazgos medios o bajos se niegan.
- **SC-006**: Repetir el registro de una misma revisión produce 0 registros duplicados.
- **SC-007**: El 100% de los mecanismos de revisión tienen entrada en `DECISIONES.md`, con la alternativa descartada.

## Assumptions

- **Revisores automatizados**: las revisiones las hacen revisores automatizados dentro de Claude Code, en un contexto aislado. La revisión humana del pull request sigue siendo posible y no se reemplaza.
- **Puerta en el flujo del equipo**: la puerta de FR-008 vive en el comando que abre el pull request (`/ticket-abrir-pr`, del #3), que ejecuta las revisiones antes de crear el PR. Un pull request abierto a mano desde la web queda fuera de la puerta; reforzarlo con protección de rama en GitHub no forma parte de este ticket.
- **Fuentes de la revisión de cumplimiento**: la constitución (reglas de negocio del Principio I y restricciones de los Principios III y IV) y la spec del ticket. Las reglas por zona de `.claude/rules/` sirven de apoyo.
- **Ticket sin código del agente**: hoy el repositorio no tiene código del agente (`src/` llega con el #7). La revisión de cumplimiento debe funcionar igual, informando las reglas como no aplicables con su motivo.
- **Registro**: se usa el mismo mecanismo de comentarios con marcador e idempotencia del flujo de tickets (#3), a través del servidor MCP de GitHub.
- **Fuera de alcance**: corregir automáticamente los hallazgos, revisar pull requests de otros repositorios y la protección de rama en GitHub.
