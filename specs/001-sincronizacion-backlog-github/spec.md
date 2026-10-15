# Feature Specification: Sincronización autónoma del backlog con GitHub

**Feature Branch**: `feature/Configuración`

**Created**: 2026-10-15

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#3 — Sincronización autónoma del backlog con GitHub](https://github.com/fabisahe29/CREDIAGIL/issues/3)

**Épica / Milestone**: `epica:flujo-y-ecosistema` · M1 · Flujo y ecosistema

**Trazabilidad con el enunciado**: Necesidad 10 · Mínimos: servidor MCP de GitHub, comandos propios · Sección "Gestión del proyecto en GitHub"

**Input**: Contenido del issue #3, leído con el servidor MCP de GitHub. Según la nota de arranque del issue, este ticket se especifica a mano porque la automatización todavía no existe; desde el siguiente ticket el flujo es autónomo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tomar el siguiente ticket del backlog (Priority: P1)

Como desarrollador del equipo, le pido a Claude Code que tome el siguiente ticket. Claude Code consulta el GitHub Project, identifica el siguiente ticket en estado **Todo**, lo pasa a **In Progress**, comenta en el issue que se inicia el trabajo y entrega el contenido del ticket como insumo para especificarlo (`/speckit.specify`), sin que yo copie ni pegue nada.

**Why this priority**: es el punto de entrada del flujo. Sin él, cada ticket se arranca a mano y la trazabilidad depende de la disciplina de cada persona, que es justo el problema que el issue quiere resolver.

**Independent Test**: con al menos un ticket en **Todo** en el Project, invocar el comando compartido y comprobar que (a) el ticket elegido es el correcto según la regla de "siguiente ticket", (b) su estado cambia a **In Progress**, (c) el issue recibe un comentario de inicio y (d) la especificación generada incluye el enlace al issue.

**Acceptance Scenarios**:

1. **Given** un Project con varios tickets en **Todo**, **When** el desarrollador invoca el comando para tomar el siguiente ticket, **Then** se selecciona exactamente un ticket según la regla de "siguiente ticket", y su título y cuerpo completos se entregan como insumo de la especificación.
2. **Given** un ticket seleccionado, **When** se inicia el trabajo, **Then** su estado en el Project pasa a **In Progress** y el issue recibe un comentario que indica el inicio del trabajo.
3. **Given** un ticket especificado, **When** se crea su carpeta en `specs/`, **Then** la especificación contiene el enlace al issue de origen y el issue recibe un comentario con la ruta de esa carpeta.
4. **Given** un Project sin tickets en **Todo**, **When** el desarrollador invoca el comando, **Then** se informa que no hay tickets pendientes y no se modifica nada.

---

### User Story 2 - Estado del ticket alineado con el ciclo del pull request (Priority: P2)

Como desarrollador, cuando abro el pull request de un ticket, el ticket pasa a **In review**, y cuando el pull request se fusiona, pasa a **Done**. El pull request referencia el issue y lo cierra al fusionarse.

**Why this priority**: completa el ciclo de vida del ticket. Sin esto, el backlog muestra trabajo "en progreso" que en realidad ya está en revisión o terminado.

**Independent Test**: tomar un ticket en **In Progress**, abrir su pull request y comprobar el paso a **In review**; fusionarlo y comprobar el paso a **Done** y el cierre del issue.

**Acceptance Scenarios**:

1. **Given** un ticket en **In Progress**, **When** se abre su pull request, **Then** el pull request referencia el issue con una palabra clave de cierre y el ticket pasa a **In review**.
2. **Given** un pull request abierto que referencia su issue, **When** se fusiona, **Then** el issue se cierra y el ticket queda en **Done**.
3. **Given** un pull request que se cierra sin fusionar, **When** ocurre el cierre, **Then** el ticket no pasa a **Done** y el issue sigue abierto.

---

### User Story 3 - Historial de avance en el issue (Priority: P3)

Como miembro del equipo o evaluador, puedo reconstruir el avance de un ticket leyendo solo su issue: qué se especificó, qué se decidió en el plan y qué quedó pendiente.

**Why this priority**: es lo que hace auditable el trabajo solo mirando GitHub. Depende de que existan los pasos de las historias 1 y 2.

**Independent Test**: recorrer un ticket desde la especificación hasta la fusión y verificar que el issue contiene un comentario por cada hito definido, con el contenido requerido.

**Acceptance Scenarios**:

1. **Given** un ticket cuya especificación se acaba de generar, **When** termina la especificación, **Then** el issue recibe un comentario con un resumen de lo especificado y la ruta de la carpeta en `specs/`.
2. **Given** un ticket cuyo plan se acaba de generar, **When** termina el plan, **Then** el issue recibe un comentario con las decisiones principales del plan.
3. **Given** un ticket que pasa a revisión o se cierra, **When** ocurre la transición, **Then** el issue recibe un comentario con lo que quedó pendiente (o la indicación explícita de que no queda nada pendiente).

---

### User Story 4 - Configuración compartida y segura del acceso a GitHub (Priority: P1)

Como desarrollador que clona el repositorio, obtengo la configuración del servidor MCP oficial de GitHub y los comandos propios del equipo desde el control de versiones, y solo aporto mi credencial personal por fuera del repositorio.

**Why this priority**: es un prerrequisito de todas las demás historias y un mínimo explícito del enunciado. Además, una credencial filtrada en el repositorio es un incidente de seguridad.

**Independent Test**: clonar el repositorio en limpio, definir la credencial solo en el entorno local y comprobar que Claude Code puede leer issues y el Project, y que una búsqueda en el repositorio no encuentra ningún token ni secreto.

**Acceptance Scenarios**:

1. **Given** un clon limpio del repositorio, **When** se inspecciona la configuración del proyecto, **Then** existe la configuración del servidor MCP oficial de GitHub con el toolset de projects habilitado, y la credencial se toma de una variable de entorno.
2. **Given** el historial y el contenido del repositorio, **When** se buscan tokens o secretos, **Then** no aparece ninguno.
3. **Given** un clon limpio, **When** el desarrollador lista los comandos disponibles en Claude Code, **Then** aparece al menos un comando propio del equipo, versionado en el repositorio.

---

### Edge Cases

- **No hay tickets en Todo**: se informa y no se cambia nada (Story 1, escenario 4).
- **Un ticket del Project no es un issue** (borrador o pull request): se ignora al elegir el siguiente ticket.
- **El issue ya está en otro estado** (alguien lo movió a mano): se informa la discrepancia antes de sobrescribir el estado.
- **Falta la credencial o no tiene permisos** sobre el Project: el comando falla con un mensaje claro que indica qué falta, sin cambios parciales.
- **Los nombres de estado del Project no coinciden** con los esperados (p. ej. "In progress" frente a "In Progress"): se usan los nombres exactos configurados en el Project. Hoy son **Todo**, **In Progress**, **In review** y **Done**.
- **Pull request cerrado sin fusionar**: el ticket no pasa a **Done** (Story 2, escenario 3).
- **Un pull request referencia varios issues**: cada issue referenciado sigue su propio ciclo.
- **Fallo de red a mitad de una transición** (estado cambiado sin comentario, o al revés): se puede reintentar sin duplicar comentarios ni transiciones.

## Requirements *(mandatory)*

### Functional Requirements

**Configuración y acceso**

- **FR-001**: El proyecto MUST incluir, versionada, la configuración del servidor MCP oficial de GitHub a nivel de proyecto, con el toolset de projects habilitado.
- **FR-002**: El repositorio MUST NOT contener credenciales. La credencial de acceso a GitHub MUST suministrarse por variable de entorno de cada desarrollador.
- **FR-003**: El repositorio MUST incluir al menos un comando propio de Claude Code compartido con el equipo vía control de versiones.

**Toma del siguiente ticket**

- **FR-004**: Un mecanismo versionado MUST identificar el siguiente ticket en estado **Todo** del GitHub Project según [NEEDS CLARIFICATION: ¿qué define "el siguiente ticket": la posición en el Project, un campo de prioridad o el número de issue?].
- **FR-005**: El mecanismo MUST entregar el contenido del ticket (título, cuerpo, enlace, etiquetas y milestone) como insumo de `/speckit.specify`.
- **FR-006**: Al iniciar un ticket, su estado en el Project MUST pasar a **In Progress**.

**Ciclo de vida**

- **FR-007**: Al abrir el pull request de un ticket, su estado MUST pasar a **In review**.
- **FR-008**: Al fusionar el pull request, el ticket MUST quedar en **Done**. El responsable de esta transición es [NEEDS CLARIFICATION: ¿quién mueve el ticket a Done: Claude Code después del merge o un workflow integrado del Project?].
- **FR-009**: Cada pull request MUST referenciar su issue con una palabra clave de cierre, de modo que la fusión cierre el issue.

**Trazabilidad**

- **FR-010**: La especificación generada MUST contener el enlace al issue de origen.
- **FR-011**: El issue MUST recibir un comentario con la ruta de la carpeta de su especificación en `specs/`.
- **FR-012**: El issue MUST recibir comentarios de avance que incluyan lo que se especificó, lo que se decidió en el plan y lo que quedó pendiente, en estos momentos: [NEEDS CLARIFICATION: ¿en qué momentos exactos se comenta el issue?].
- **FR-013**: La decisión sobre el mecanismo elegido y la alternativa descartada MUST quedar registradas en `DECISIONES.md`.

**Robustez**

- **FR-014**: Si no hay tickets en **Todo**, el mecanismo MUST informarlo y no modificar nada.
- **FR-015**: Ante falta de credencial o de permisos, el mecanismo MUST fallar con un mensaje que indique la causa, sin dejar cambios parciales que no se informen.
- **FR-016**: Las transiciones y comentarios MUST poder reintentarse sin duplicar efectos.

### Key Entities

- **Ticket (issue)**: unidad de trabajo del backlog. Atributos relevantes: número, título, cuerpo, etiquetas, milestone, estado abierto o cerrado, comentarios.
- **Item del Project**: representación del ticket en el GitHub Project. Tiene un campo **Status** con los valores Todo, In Progress, In review y Done.
- **Especificación**: carpeta en `specs/` asociada a un ticket. Referencia el issue y el issue la referencia a ella.
- **Pull request**: cambio que implementa un ticket. Referencia el issue y lo cierra al fusionarse.
- **Comentario de avance**: registro en el issue de un hito (inicio, especificación, plan, revisión, cierre) con su contenido.
- **Registro de decisión**: entrada en `DECISIONES.md` con el mecanismo elegido, la alternativa descartada y el motivo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los tickets iniciados después de este, desde el issue #4 en adelante, se toman con el comando compartido, sin copiar ni pegar su contenido a mano.
- **SC-002**: El 100% de los tickets cerrados recorren Todo → In Progress → In review → Done sin que nadie cambie el estado a mano en el Project.
- **SC-003**: El 100% de los pull requests fusionados cierran su issue.
- **SC-004**: Para cualquier ticket cerrado, una persona sin acceso al equipo puede reconstruir en menos de 5 minutos qué se especificó, qué se decidió y qué quedó pendiente, leyendo solo el issue y los enlaces que contiene.
- **SC-005**: Una búsqueda de secretos sobre el repositorio y su historial devuelve 0 credenciales.
- **SC-006**: Un desarrollador con un clon limpio y su credencial en el entorno puede tomar el siguiente ticket en menos de 2 minutos, sin pasos de configuración adicionales.

## Assumptions

- Se usa el GitHub Project 1 del usuario `fabisahe29`, vinculado al repositorio `fabisahe29/CREDIAGIL`. Sus valores de Status son exactamente **Todo**, **In Progress**, **In review** y **Done**. El issue escribe "In progress", pero prevalece el nombre configurado en el Project.
- Cada desarrollador tiene una credencial personal de GitHub con permisos sobre el repositorio y el Project, y la define en su entorno local.
- La configuración del servidor MCP ya existe localmente (`.mcp.json`, con la credencial tomada de una variable de entorno). Esta funcionalidad la incorpora al control de versiones.
- El trabajo es individual (constitución). Basta con que el "siguiente ticket" sea único y determinista; no hace falta manejar a varios desarrolladores tomando tickets en paralelo.
- El issue #3 se arrancó a mano: ya está en **In Progress** y tiene su comentario de inicio. La automatización aplica a los tickets siguientes.
- **Fuera de alcance**: la creación inicial del backlog (issues, milestones, etiquetas y el Project ya existen).
