# Feature Specification: Guardarraíles del repositorio con hooks

**Feature Branch**: `5-guardarrailes-del-repositorio-con-hooks`

**Created**: 2026-10-15

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#5 — Guardarraíles del repositorio con hooks](https://github.com/fabisahe29/CREDIAGIL/issues/5)

**Épica / Milestone**: `epica:flujo-y-ecosistema` · M1 · Flujo y ecosistema · **Depende de**: #4 (Done)

**Trazabilidad con el enunciado**: Necesidades 4, 5, 6 y 7 · Mínimo: hooks · Regla general de datos ficticios

**Input**: Contenido del issue #5, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-15

- Q: ¿Qué archivos cuentan como "código de producción" y deben tener la spec de su ticket antes de escribirse? → A: Todo archivo bajo `src/`, incluidos sus tests (`*.test.ts`). Los archivos fuera de `src/` (specs, documentación, configuración, `.claude/`, `.specify/`) no se bloquean por falta de spec.
- Q: ¿Qué formatos de documento de identidad, cuenta y tarjeta debe considerar el control "con forma real" para bloquearlos? → A: **Tarjeta**: de 13 a 19 dígitos, con o sin espacios o guiones, que pasan el dígito de control Luhn, en cualquier contexto. **Cédula** (6 a 10 dígitos), **NIT** (9 dígitos más dígito de verificación) y **cuenta** (10 a 20 dígitos): solo cuando una palabra clave que los nombra (CC, cédula, NIT, cuenta, IBAN…) aparece en la misma línea.
- Q: ¿Cómo sabe el control a qué ticket y a qué spec corresponde un archivo que se está editando bajo `src/`? → A: El número del ticket sale de la rama actual (`<N>-slug`, sin ceros a la izquierda). La escritura se permite si existe en `specs/` un `spec.md` cuya línea `**Issue de origen**` apunta al #N. En `main` o en una rama sin número, se bloquea toda escritura bajo `src/`.
- Q: ¿Qué hace el control con los comandos de shell genéricos que podrían leer un archivo de secretos sin nombrarlo, como una búsqueda recursiva en todo el repositorio? → A: Los bloquea si recorren carpetas o expanden comodines amplios que alcanzan un archivo de secretos y no lo excluyen explícitamente. El mensaje indica cómo excluirlo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ningún dato con forma real entra al repositorio (Priority: P1)

Como equipo de Crediágil, quiero que el entorno bloquee cualquier escritura con forma de documento de identidad, número de cuenta o número de tarjeta reales, en cualquier archivo del repositorio. Así, la regla de datos ficticios no depende de que alguien la recuerde. Los identificadores que siguen la convención de datos ficticios y los montos de dinero del dominio pasan sin problema.

**Why this priority**: la constitución declara no negociable el uso exclusivo de datos ficticios (Principio II). Un solo dato real en el repositorio invalida la entrega. Es el control de mayor impacto.

**Independent Test**: pedir a Claude Code que escriba, en archivos de distintas carpetas, contenido con forma de dato real, y comprobar que cada intento se bloquea con su motivo. Después, pedirle que escriba identificadores ficticios según la convención y montos del dominio, y comprobar que nada se bloquea.

**Acceptance Scenarios**:

1. **Given** cualquier archivo del repositorio, **When** se intenta escribir contenido con forma de documento de identidad, número de cuenta o número de tarjeta reales, **Then** la escritura se bloquea y el archivo queda sin cambios.
2. **Given** la convención documentada de identificadores ficticios, **When** se escribe un identificador que la cumple, **Then** la escritura se permite.
3. **Given** montos de dinero del dominio (por ejemplo, $5.000.000 COP o una cuota mensual), **When** se escriben en código, tests o documentación, **Then** la escritura se permite: no son falsos positivos.
4. **Given** una escritura bloqueada, **When** el modelo recibe el bloqueo, **Then** el mensaje explica qué se detectó, por qué está prohibido y cómo corregirlo (por ejemplo, usar la convención de identificadores ficticios).

---

### User Story 2 - Los secretos quedan fuera del alcance de Claude Code (Priority: P1)

Como equipo, quiero que los archivos de secretos y de variables de entorno no se puedan leer ni modificar desde Claude Code, ni directamente ni con comandos de shell. Así, una clave no termina en el contexto del modelo, en un log ni en un commit.

**Why this priority**: una fuga de credenciales tiene un costo inmediato y difícil de revertir. La constitución exige que los secretos vivan solo en el entorno.

**Independent Test**: intentar leer, editar, copiar, mostrar y sobrescribir un archivo de variables de entorno por todas las vías que ofrece Claude Code, incluidos varios comandos de shell. Comprobar que todas se bloquean y que la plantilla versionada sin valores reales sigue siendo accesible.

**Acceptance Scenarios**:

1. **Given** un archivo de secretos o de variables de entorno, **When** se intenta leerlo o modificarlo con las herramientas de archivos de Claude Code, **Then** la acción se bloquea con su motivo.
2. **Given** el mismo archivo, **When** se intenta leerlo, copiarlo, moverlo o sobrescribirlo con un comando de shell que lo nombra por su ruta o por un comodín que lo incluye, **Then** el comando se bloquea antes de ejecutarse.
3. **Given** un comando de búsqueda recursiva sobre una carpeta que contiene un archivo de secretos, **When** no excluye ese archivo, **Then** se bloquea con el motivo y la forma de excluirlo. **When** lo excluye, **Then** se permite.
4. **Given** la plantilla versionada de variables de entorno sin valores reales, **When** se lee o se edita, **Then** la acción se permite.

---

### User Story 3 - No hay código de producción sin especificación (Priority: P2)

Como equipo, quiero que no se pueda escribir código de producción de un ticket si su especificación no existe en `specs/`. Así, el flujo Spec Kit (especificar antes de implementar) se cumple siempre.

**Why this priority**: protege el flujo de trabajo y la trazabilidad. Su impacto es de proceso, no de seguridad.

**Independent Test**: en una rama de trabajo cuyo ticket no tiene spec, intentar crear un archivo de código de producción y comprobar que se bloquea. Crear la spec y repetir: la escritura se permite. Comprobar también que un test bajo `src/` se bloquea igual, y que un archivo de documentación o de configuración fuera de `src/` se permite.

**Acceptance Scenarios**:

1. **Given** un ticket sin especificación en `specs/`, **When** se intenta escribir código de producción de ese ticket, **Then** la escritura se bloquea con un mensaje que indica crear primero la spec con el flujo del equipo.
2. **Given** un ticket con su especificación en `specs/`, **When** se escribe código de producción de ese ticket, **Then** la escritura se permite.
3. **Given** un test bajo `src/` (por ejemplo, `src/politica/cuota.test.ts`) de un ticket sin spec, **When** se intenta escribir, **Then** se bloquea igual que el resto del código de producción.
4. **Given** un archivo fuera de `src/` (documentación, configuración o specs), **When** se escribe sin que exista la spec, **Then** la escritura se permite.
5. **Given** la rama `main` o una rama sin número de ticket, **When** se intenta escribir bajo `src/`, **Then** se bloquea con un mensaje que indica tomar el ticket con `/ticket-tomar`.

---

### User Story 4 - El código queda formateado después de cada edición (Priority: P2)

Como desarrollador, quiero que cada archivo de código que Claude Code edita quede formateado automáticamente con el formato del proyecto. Así, el formato no depende de nadie y las diferencias entre versiones muestran solo cambios reales.

**Why this priority**: mejora la calidad y la revisión, pero no previene daños. Puede llegar después de los bloqueos.

**Independent Test**: pedir a Claude Code que edite un archivo de código dejando un formato incorrecto a propósito, y comprobar que al terminar la edición el archivo cumple el formato del proyecto.

**Acceptance Scenarios**:

1. **Given** un archivo de código editado por Claude Code, **When** termina la edición, **Then** el archivo queda con el formato del proyecto, sin intervención manual.
2. **Given** un archivo que no se puede formatear (por ejemplo, con un error de sintaxis), **When** termina la edición, **Then** la edición se conserva y el modelo recibe el motivo por el que no se formateó.
3. **Given** un archivo de un tipo sin formato definido en el proyecto, **When** termina la edición, **Then** no se modifica y no se informa ningún error.

---

### User Story 5 - Controles probados y decisiones registradas (Priority: P3)

Como líder técnico o evaluador, quiero que cada control tenga pruebas con casos que deben bloquearse y casos que deben pasar, y que `DECISIONES.md` explique cada mecanismo elegido y la alternativa descartada.

**Why this priority**: da confianza y trazabilidad a los controles. No bloquea su funcionamiento, pero sin pruebas un cambio futuro podría desactivarlos sin que nadie lo note.

**Independent Test**: ejecutar las pruebas de los controles y comprobar que cubren, para cada control, al menos un caso bloqueado y uno permitido. Para cada mecanismo, localizar su entrada en `DECISIONES.md` con la alternativa descartada.

**Acceptance Scenarios**:

1. **Given** las pruebas de los controles, **When** se ejecutan, **Then** cada control tiene casos que deben bloquearse y casos que deben pasar, y todos dan el resultado esperado.
2. **Given** los mecanismos elegidos, **When** se lee `DECISIONES.md`, **Then** cada uno tiene su decisión, su motivo y la alternativa descartada.

---

### Edge Cases

- **Monto con forma parecida a un documento de identidad** (por ejemplo, un monto de 7 dígitos sin separadores en un cálculo de cuota): no se bloquea mientras en su línea no haya ninguna palabra clave de documento o de cuenta (FR-001).
- **Monto y palabra clave en la misma línea** (por ejemplo, "la cuota de la cuenta es 1250000"): se bloquea como cuenta. El mensaje indica cómo reescribir la línea o usar la convención ficticia. Las pruebas de FR-017 incluyen este caso.
- **Números de tarjeta de prueba públicos** (los que publican las pasarelas de pago, que pasan Luhn): se bloquean como cualquier tarjeta con forma real. La convención de FR-003 define cómo escribir una tarjeta ficticia que el control acepta.
- **Identificador ficticio mal formado** (casi cumple la convención, pero no del todo): se trata como dato con forma real y se bloquea, y el mensaje indica en qué no cumple la convención.
- **Pruebas del propio control**: los casos que deben bloquearse necesitan datos con forma real. Esas pruebas no pueden escribir esos valores en el repositorio. Deben construirlos de modo que el archivo de pruebas no contenga ningún dato con forma real.
- **Escritura por shell**: un comando de shell que escribe en un archivo contenido con forma de dato real (por ejemplo, una redirección) se bloquea igual que una edición directa.
- **Spec de otro ticket**: en la rama `7-…`, si solo existe la spec del #5, escribir bajo `src/` se bloquea. Una spec ajena no habilita el código de otro ticket.
- **Spec sin línea `Issue de origen`**: no cuenta para ningún ticket. El mensaje de bloqueo indica agregar esa línea.
- **Mensaje de commit o comentario con un dato con forma real**: se bloquea, porque termina versionado o publicado.
- **Comando genérico que podría leer secretos sin nombrarlos** (por ejemplo, una búsqueda recursiva en todo el repositorio): se bloquea salvo que excluya los archivos de secretos (FR-006a).
- **Búsqueda recursiva en una carpeta sin secretos** (por ejemplo, solo en `src/`): se permite sin exclusión, porque su alcance no incluye ningún archivo de secretos.
- **Archivo que coincide con varios controles** (por ejemplo, un archivo de código nuevo con un dato real y sin spec): se bloquea, y el mensaje informa todos los motivos que apliquen, no solo el primero.
- **Edición bloqueada**: el formato automático no se ejecuta, porque no hubo edición.
- **El control falla** (error interno, no un bloqueo): la acción no se permite en silencio. El modelo recibe el error con su causa (constitución, Principio VI).

## Requirements *(mandatory)*

### Functional Requirements

**Datos con forma real (Principio II)**

- **FR-001**: El entorno MUST bloquear cualquier escritura desde Claude Code, en cualquier archivo del repositorio, cuyo contenido tenga forma de documento de identidad, número de cuenta o número de tarjeta reales. Tienen forma real:
  1. **Tarjeta**: de 13 a 19 dígitos, con o sin espacios o guiones, que pasan el dígito de control Luhn. Se detecta en cualquier contexto.
  2. **Cédula**: de 6 a 10 dígitos, con o sin puntos de miles, cuando en la misma línea aparece una palabra clave de documento de identidad (por ejemplo, CC, C.C. o cédula).
  3. **NIT**: 9 dígitos más un dígito de verificación, cuando en la misma línea aparece la palabra NIT.
  4. **Cuenta**: de 10 a 20 dígitos, cuando en la misma línea aparece una palabra clave de cuenta (por ejemplo, cuenta, IBAN o número de cuenta).

  La lista completa de palabras clave vive junto a la convención de FR-003, en un único lugar.
- **FR-002**: El bloqueo de FR-001 MUST aplicar también a comandos de shell cuyo texto contenga esos datos y que escriban en archivos, creen commits o publiquen contenido.
- **FR-003**: El repositorio MUST incluir una convención documentada de identificadores ficticios (documentos, cuentas, tarjetas), y el control MUST aceptar los identificadores que la cumplen.
- **FR-004**: Los montos de dinero del dominio, en los formatos en que aparecen en el código, los tests y la documentación del proyecto, MUST NOT generar bloqueos.

**Secretos**

- **FR-005**: Los archivos de secretos y de variables de entorno MUST NOT poder leerse ni modificarse con las herramientas de archivos de Claude Code.
- **FR-006**: Los comandos de shell que nombran un archivo de secretos, por su ruta o por un comodín que lo incluye, para leerlo, copiarlo, moverlo, borrarlo o sobrescribirlo MUST bloquearse antes de ejecutarse.
- **FR-006a**: Los comandos de shell que recorren carpetas o expanden comodines amplios (búsquedas recursivas, listados con ejecución sobre cada archivo, concatenación de todos los archivos de una carpeta) MUST bloquearse si su alcance incluye un archivo de secretos y no lo excluyen explícitamente. El mensaje de bloqueo MUST indicar cómo excluirlo. Con la exclusión, el comando se permite.
- **FR-007**: La plantilla versionada de variables de entorno, que no contiene valores reales, MUST seguir siendo legible y editable.

**Especificación antes del código**

- **FR-008**: El entorno MUST bloquear la escritura de código de producción de un ticket cuando su especificación no existe en `specs/`. Es código de producción todo archivo bajo `src/`, a cualquier profundidad, incluidos sus tests (`*.test.ts`).
- **FR-009**: Los archivos fuera de `src/` MUST NOT bloquearse por falta de especificación: specs, documentación, configuración, `.claude/`, `.specify/` y tests que vivan fuera de `src/`.
- **FR-010**: El ticket de una escritura bajo `src/` MUST determinarse por la rama actual, con el patrón `<N>-slug` y `N` sin ceros a la izquierda. Su especificación es el `spec.md` de `specs/` cuya línea `**Issue de origen**` apunta al #N. Si la rama es `main` o no tiene número, o si ninguna spec apunta al #N, la escritura se bloquea (FR-008).

**Formato**

- **FR-011**: Cada archivo de código que Claude Code edita MUST quedar formateado automáticamente con el formato del proyecto al terminar la edición.
- **FR-012**: Si el formato falla, la edición MUST conservarse y el modelo MUST recibir el motivo. Los archivos de tipos sin formato definido MUST quedar sin cambios y sin error.

**Comportamiento común de los controles**

- **FR-013**: Debe haber al menos un control que bloquea antes de ejecutar una acción y al menos uno que actúa después de una edición.
- **FR-014**: Cada bloqueo MUST explicar al modelo qué se detectó, qué regla lo prohíbe y cómo corregirlo, para que corrija en lugar de reintentar a ciegas. Si aplican varios motivos, el mensaje MUST incluirlos todos.
- **FR-015**: Un error interno de un control MUST NOT permitir la acción en silencio: el modelo recibe el error con su causa.
- **FR-016**: Los controles MUST cumplirse sin intervención de nadie. Viven en la configuración compartida del repositorio y se aplican a cualquiera que lo clone.

**Pruebas y trazabilidad**

- **FR-017**: Cada control MUST tener pruebas automatizadas con casos que deben bloquearse y casos que deben pasar. Los casos de FR-004 (montos del dominio) y FR-003 (identificadores ficticios) MUST estar entre los que deben pasar.
- **FR-018**: Los archivos de prueba de los controles MUST NOT contener datos con forma real escritos de forma literal.
- **FR-019**: Cada mecanismo elegido y la alternativa descartada MUST quedar registrados en `DECISIONES.md`.

### Key Entities

- **Control (guardarraíl)**: regla que el entorno aplica sola. Tiene un momento (antes de ejecutar o después de editar), un alcance (qué acciones y archivos vigila) y un resultado (permitir, bloquear o corregir).
- **Bloqueo**: resultado de un control que impide una acción. Incluye qué se detectó, la regla que lo prohíbe y cómo corregirlo.
- **Patrón de dato con forma real**: forma de una tarjeta (con dígito de control Luhn válido) o de una cédula, un NIT o una cuenta (con su palabra clave en la misma línea) que el control reconoce como posible dato real (FR-001).
- **Convención de identificadores ficticios**: reglas documentadas para que un identificador sea reconocible como inventado y el control lo acepte.
- **Archivo protegido**: archivo de secretos o de variables de entorno, fuera del alcance de Claude Code. La plantilla sin valores reales no es un archivo protegido.
- **Caso de prueba de control**: entrada y resultado esperado (bloquear o pasar) para un control.
- **Registro de decisión**: entrada en `DECISIONES.md` con el mecanismo elegido, el motivo y la alternativa descartada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los casos de prueba que deben bloquearse se bloquean, y el 0% de los que deben pasar se bloquean. Esto incluye al menos 10 montos del dominio en sus distintos formatos y al menos un identificador ficticio de cada tipo.
- **SC-002**: 0 lecturas o modificaciones exitosas de un archivo de secretos en al menos 6 vías de acceso distintas, entre herramientas de archivos y comandos de shell.
- **SC-003**: El 100% de los mensajes de bloqueo nombran lo detectado, la regla y la acción correctiva.
- **SC-004**: Después de cualquier edición de código hecha por Claude Code, una verificación de formato de todo el repositorio encuentra 0 diferencias.
- **SC-005**: El 100% de los intentos de escribir código de producción de un ticket sin spec se bloquean, y el 100% de los intentos con spec se permiten.
- **SC-006**: Un desarrollador con un clon limpio tiene todos los controles activos con 0 pasos de configuración.
- **SC-007**: El 100% de los mecanismos elegidos tienen entrada en `DECISIONES.md`, con la alternativa descartada.

## Assumptions

- **Ámbito**: los controles aplican a las acciones hechas desde Claude Code, que es lo que pide el issue (mínimo: hooks). Las ediciones manuales fuera de Claude Code y los controles del lado de GitHub (por ejemplo, revisiones de PR) no forman parte de este ticket.
- **Lecturas indirectas de secretos**: el control cubre los comandos que nombran un archivo de secretos (FR-006) y los recursivos o con comodines amplios que lo alcanzan sin excluirlo (FR-006a). Un comando ofuscado a propósito (por ejemplo, con el nombre armado en tiempo de ejecución) no se puede analizar con certeza. Ese riesgo residual se registra en `DECISIONES.md`.
- **Archivos de secretos**: son los de variables de entorno ya ignorados en `.gitignore` (`.env` y `.env.*`). La plantilla `.env.example` está versionada, no tiene valores reales y no se protege.
- **Formato**: el formato del proyecto aplica a los tipos de archivo del stack (TypeScript y los que el plan defina). El proyecto aún no tiene código; el plan define la herramienta de formato y su configuración.
- **Convención de identificadores ficticios**: complementa la constitución, que ya pide identificadores reconocibles como ficticios (dominios `.example`, nombres y NIT inventados). Vive en un único lugar documentado y la referencian los controles y las reglas de tests.
- **Configuración compartida**: los controles se declaran en la configuración versionada del repositorio, creada en el #4. Desactivarlos desde la configuración personal no es un uso previsto. El plan evalúa si la plataforma permite impedirlo y, si no, lo registra como riesgo en `DECISIONES.md`.
- **Fuera de alcance**: los documentos ficticios de prueba del agente, que se crean en cada ticket del agente.
