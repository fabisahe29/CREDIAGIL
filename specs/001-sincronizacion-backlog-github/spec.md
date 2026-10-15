# Feature Specification: Sincronización autónoma del backlog con GitHub

**Feature Branch**: `001-sincronizacion-backlog-github`

**Created**: 2026-10-15

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#3 — Sincronización autónoma del backlog con GitHub](https://github.com/fabisahe29/CREDIAGIL/issues/3)

**Épica / Milestone**: `epica:flujo-y-ecosistema` · M1 · Flujo y ecosistema

**Trazabilidad con el enunciado**: Necesidad 10 · Mínimos: servidor MCP de GitHub, comandos propios · Sección "Gestión del proyecto en GitHub"

**Input**: Contenido del issue #3, leído con el servidor MCP de GitHub. Según la nota de arranque del issue, este ticket se especifica a mano porque la automatización todavía no existe; desde el siguiente ticket el flujo es autónomo.

## Clarifications

### Session 2026-10-15

- Q: Cuando se pide "tomar el siguiente ticket", ¿cuál de los tickets en **Todo** se elige? → A: Lo elige el desarrollador en cada ocasión, entre los tickets en **Todo** que Claude Code le muestra.
- Q: Cuando se fusiona el pull request de un ticket, ¿quién pasa el ticket a **Done**? → A: Claude Code, y la fusión misma la hace Claude Code. Un comando propio de cierre, en un solo paso, fusiona el pull request a través del servidor MCP de GitHub, pasa el ticket a **Done** y publica el comentario final en el issue.
- Q: ¿En qué momentos se publica un comentario de avance en el issue? → A: En cinco hitos: inicio, especificación terminada (resumen y ruta en `specs/`), plan terminado (decisiones), pull request abierto (lo pendiente) y cierre (comentario final).
- Q: ¿Quién abre el pull request de un ticket y lo pasa a **In review**? → A: Un comando propio de apertura. En un solo paso, Claude Code crea el pull request con la referencia de cierre al issue, pasa el ticket a **In review** y publica el comentario con lo pendiente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tomar el siguiente ticket del backlog (Priority: P1)

Como desarrollador del equipo, le pido a Claude Code que tome el siguiente ticket. Claude Code consulta el GitHub Project, me muestra los tickets en estado **Todo** y, cuando elijo uno, lo pasa a **In Progress**, comenta en el issue que se inicia el trabajo y entrega el contenido del ticket como insumo para especificarlo (`/speckit.specify`), sin que yo copie ni pegue nada.

**Why this priority**: es el punto de entrada del flujo. Sin él, cada ticket se arranca a mano y la trazabilidad depende de la disciplina de cada persona, que es justo el problema que el issue quiere resolver.

**Independent Test**: con al menos un ticket en **Todo** en el Project, invocar el comando compartido y comprobar que (a) se listan todos los tickets en **Todo** y se trabaja exactamente el que eligió el desarrollador, (b) su estado cambia a **In Progress**, (c) el issue recibe un comentario de inicio y (d) la especificación generada incluye el enlace al issue.

**Acceptance Scenarios**:

1. **Given** un Project con varios tickets en **Todo**, **When** el desarrollador invoca el comando para tomar el siguiente ticket, **Then** Claude Code muestra la lista de esos tickets (número, título y etiquetas) en el orden en que aparecen en el Project, y no cambia nada hasta que el desarrollador elige uno.
2. **Given** la lista mostrada, **When** el desarrollador elige un ticket, **Then** se trabaja exactamente ese ticket, y su título y cuerpo completos se entregan como insumo de la especificación.
3. **Given** un ticket elegido, **When** se inicia el trabajo, **Then** su estado en el Project pasa a **In Progress** y el issue recibe un comentario que indica el inicio del trabajo.
4. **Given** un ticket especificado, **When** se crea su carpeta en `specs/`, **Then** la especificación contiene el enlace al issue de origen y el issue recibe un comentario con la ruta de esa carpeta.
5. **Given** la lista mostrada, **When** el desarrollador no elige ningún ticket o cancela, **Then** no se modifica nada.
6. **Given** un Project sin tickets en **Todo**, **When** el desarrollador invoca el comando, **Then** se informa que no hay tickets pendientes y no se modifica nada.

---

### User Story 2 - Estado del ticket alineado con el ciclo del pull request (Priority: P2)

Como desarrollador, cuando la implementación está lista, invoco el comando de apertura y Claude Code, en un solo paso, crea el pull request con la referencia de cierre al issue, pasa el ticket a **In review** y publica el comentario con lo pendiente. Cuando el pull request está listo, invoco el comando de cierre y Claude Code, en un solo paso, fusiona el pull request, pasa el ticket a **Done** y publica el comentario final en el issue. El pull request referencia el issue y lo cierra al fusionarse.

**Why this priority**: completa el ciclo de vida del ticket. Sin esto, el backlog muestra trabajo "en progreso" que en realidad ya está en revisión o terminado.

**Independent Test**: tomar un ticket en **In Progress**, invocar el comando de apertura y comprobar que se creó el pull request con la referencia de cierre, que el ticket pasó a **In review** y que se publicó el comentario con lo pendiente. Luego invocar el comando de cierre y comprobar que el pull request quedó fusionado, el issue cerrado, el ticket en **Done** y el comentario final publicado.

**Acceptance Scenarios**:

1. **Given** un ticket en **In Progress** con su rama de trabajo publicada, **When** el desarrollador invoca el comando de apertura, **Then** se crea el pull request referenciando el issue con una palabra clave de cierre, el ticket pasa a **In review** y el issue recibe el comentario con lo pendiente.
2. **Given** un pull request abierto que referencia su issue y está en condiciones de fusionarse, **When** el desarrollador invoca el comando de cierre, **Then** el pull request se fusiona, el issue se cierra, el ticket queda en **Done** y el issue recibe el comentario final.
3. **Given** un pull request que no puede fusionarse (conflictos, verificaciones en rojo o revisión pendiente), **When** el desarrollador invoca el comando de cierre, **Then** no se fusiona nada, el ticket sigue en **In review** y se informa el motivo.
4. **Given** un pull request que se cierra sin fusionar, **When** ocurre el cierre, **Then** el ticket no pasa a **Done** y el issue sigue abierto.

---

### User Story 3 - Historial de avance en el issue (Priority: P3)

Como miembro del equipo o evaluador, puedo reconstruir el avance de un ticket leyendo solo su issue: qué se especificó, qué se decidió en el plan y qué quedó pendiente.

**Why this priority**: es lo que hace auditable el trabajo solo mirando GitHub. Depende de que existan los pasos de las historias 1 y 2.

**Independent Test**: recorrer un ticket desde el inicio hasta el cierre y verificar que el issue contiene exactamente cinco comentarios de avance (inicio, especificación, plan, pull request abierto y cierre), cada uno con el contenido requerido en FR-012.

**Acceptance Scenarios**:

1. **Given** un ticket cuya especificación se acaba de generar, **When** termina la especificación, **Then** el issue recibe un comentario con un resumen de lo especificado y la ruta de la carpeta en `specs/`.
2. **Given** un ticket cuyo plan se acaba de generar, **When** termina el plan, **Then** el issue recibe un comentario con las decisiones principales del plan.
3. **Given** un ticket cuyo pull request se acaba de abrir, **When** pasa a **In review**, **Then** el issue recibe un comentario con el enlace al pull request y lo que quedó pendiente (o la indicación explícita de que no queda nada pendiente).
4. **Given** un ticket cerrado con el comando de cierre, **When** termina el cierre, **Then** el issue recibe el comentario final y no hay otros comentarios de avance fuera de los cinco hitos.

---

### User Story 4 - Configuración compartida y segura del acceso a GitHub (Priority: P1)

Como desarrollador que clona el repositorio, obtengo la configuración del servidor MCP oficial de GitHub y los comandos propios del equipo desde el control de versiones, y solo aporto mi credencial personal por fuera del repositorio.

**Why this priority**: es un prerrequisito de todas las demás historias y un mínimo explícito del enunciado. Además, una credencial filtrada en el repositorio es un incidente de seguridad.

**Independent Test**: clonar el repositorio en limpio, definir la credencial solo en el entorno local y comprobar que Claude Code puede leer issues y el Project, y que una búsqueda en el repositorio no encuentra ningún token ni secreto.

**Acceptance Scenarios**:

1. **Given** un clon limpio del repositorio, **When** se inspecciona la configuración del proyecto, **Then** existe la configuración del servidor MCP oficial de GitHub con el toolset de projects habilitado, y la credencial se toma de una variable de entorno.
2. **Given** el historial y el contenido del repositorio, **When** se buscan tokens o secretos, **Then** no aparece ninguno.
3. **Given** un clon limpio, **When** el desarrollador lista los comandos disponibles en Claude Code, **Then** aparecen, versionados en el repositorio, al menos los comandos propios de apertura y de cierre del equipo.

---

### Edge Cases

- **No hay tickets en Todo**: se informa y no se cambia nada (Story 1, escenario 6).
- **El desarrollador elige un ticket que no está en la lista** (o uno que ya no está en **Todo** cuando confirma): se rechaza la elección y se vuelve a mostrar la lista actualizada.
- **Un ticket del Project no es un issue** (borrador o pull request): no se incluye en la lista de tickets para elegir.
- **El issue ya está en otro estado** (alguien lo movió a mano): se informa la discrepancia antes de sobrescribir el estado.
- **Falta la credencial o no tiene permisos** sobre el Project: el comando falla con un mensaje claro que indica qué falta, sin cambios parciales.
- **Los nombres de estado del Project no coinciden** con los esperados (p. ej. "In progress" frente a "In Progress"): se usan los nombres exactos configurados en el Project. Hoy son **Todo**, **In Progress**, **In review** y **Done**.
- **Pull request cerrado sin fusionar**: el ticket no pasa a **Done** (Story 2, escenario 4).
- **Ya existe un pull request abierto para el ticket** al invocar el comando de apertura: no se crea otro; se completan solo los pasos que falten (**In review** y comentario).
- **La rama de trabajo no está publicada o no tiene cambios** respecto de la rama base: el comando de apertura no crea el pull request e informa el motivo.
- **Pull request no fusionable** (conflictos, verificaciones en rojo o revisión pendiente): el comando de cierre no fusiona y lo informa (Story 2, escenario 3).
- **Pull request fusionado fuera del comando de cierre** (por ejemplo, desde la web de GitHub): el issue se cierra, pero el ticket no pasa a **Done** por sí solo. Al invocar después el comando de cierre sobre ese ticket, este detecta que la fusión ya ocurrió y completa solo los pasos que faltan: **Done** y comentario final.
- **Fallo a mitad del cierre** (fusionado, pero sin **Done** o sin comentario): al reintentar el comando de cierre se completan los pasos que faltan, sin volver a fusionar ni duplicar el comentario.
- **Un pull request referencia varios issues**: cada issue referenciado sigue su propio ciclo.
- **Fallo de red a mitad de una transición** (estado cambiado sin comentario, o al revés): se puede reintentar sin duplicar comentarios ni transiciones.

## Requirements *(mandatory)*

### Functional Requirements

**Configuración y acceso**

- **FR-001**: El proyecto MUST incluir, versionada, la configuración del servidor MCP oficial de GitHub a nivel de proyecto, con el toolset de projects habilitado.
- **FR-002**: El repositorio MUST NOT contener credenciales. La credencial de acceso a GitHub MUST suministrarse por variable de entorno de cada desarrollador.
- **FR-003**: El repositorio MUST incluir comandos propios de Claude Code compartidos con el equipo vía control de versiones. Como mínimo, el comando de apertura (FR-007) y el comando de cierre (FR-008).

**Toma del siguiente ticket**

- **FR-004**: Un mecanismo versionado MUST listar los tickets (issues) en estado **Todo** del GitHub Project, en el orden en que aparecen en el Project, y dejar que el desarrollador elija cuál es el siguiente. Hasta que haya una elección, el mecanismo MUST NOT modificar ningún ticket.
- **FR-005**: El mecanismo MUST entregar el contenido del ticket (título, cuerpo, enlace, etiquetas y milestone) como insumo de `/speckit.specify`.
- **FR-006**: Al iniciar un ticket, su estado en el Project MUST pasar a **In Progress**.

**Ciclo de vida**

- **FR-007**: El repositorio MUST incluir un comando propio de apertura que, en un solo paso, (1) cree el pull request del ticket a través del servidor MCP de GitHub, referenciando el issue con una palabra clave de cierre, (2) pase el ticket a **In review** y (3) publique el comentario del hito "pull request abierto". Si ya existe un pull request abierto para el ticket, MUST completar solo los pasos que falten, sin crear otro.
- **FR-008**: El repositorio MUST incluir un comando propio de cierre que, en un solo paso, (1) fusione el pull request del ticket a través del servidor MCP de GitHub, (2) pase el ticket a **Done** y (3) publique el comentario final en el issue. La transición a **Done** la hace este comando, no un workflow del Project ni un GitHub Action.
- **FR-008a**: El comando de cierre MUST NOT fusionar un pull request con conflictos, con verificaciones en rojo o con revisión requerida pendiente. En ese caso MUST informar el motivo y dejar el ticket en **In review**.
- **FR-008b**: Si el pull request ya está fusionado cuando se invoca el comando de cierre, este MUST completar solo los pasos que falten (**Done** y comentario final) sin intentar fusionarlo de nuevo.
- **FR-009**: Cada pull request MUST referenciar su issue con una palabra clave de cierre, de modo que la fusión cierre el issue.

**Trazabilidad**

- **FR-010**: La especificación generada MUST contener el enlace al issue de origen.
- **FR-011**: El issue MUST recibir un comentario con la ruta de la carpeta de su especificación en `specs/`.
- **FR-012**: El issue MUST recibir exactamente un comentario de avance en cada uno de estos cinco hitos, con este contenido mínimo:
  1. **Inicio**: el ticket se toma y pasa a **In Progress**.
  2. **Especificación terminada**: resumen de lo especificado y ruta de la carpeta en `specs/` (cubre FR-011).
  3. **Plan terminado**: decisiones principales del plan.
  4. **Pull request abierto**: enlace al pull request y lo que quedó pendiente, o la indicación explícita de que no queda nada.
  5. **Cierre**: comentario final publicado por el comando de cierre, con el pull request fusionado y el estado **Done**.
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
- **Comentario de avance**: registro en el issue de uno de los cinco hitos (inicio, especificación terminada, plan terminado, pull request abierto, cierre) con su contenido mínimo según FR-012. Hay un solo comentario por hito y ticket.
- **Registro de decisión**: entrada en `DECISIONES.md` con el mecanismo elegido, la alternativa descartada y el motivo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los tickets iniciados después de este, desde el issue #4 en adelante, se toman con el comando compartido, sin copiar ni pegar su contenido a mano.
- **SC-002**: El 100% de los tickets cerrados recorren Todo → In Progress → In review → Done sin que nadie cambie el estado a mano en el Project. El 100% de los pull requests se abren con el comando de apertura y el 100% de las fusiones se hacen con el comando de cierre, cada uno en un solo paso.
- **SC-003**: El 100% de los pull requests fusionados cierran su issue.
- **SC-004**: Para cualquier ticket cerrado, una persona sin acceso al equipo puede reconstruir en menos de 5 minutos qué se especificó, qué se decidió y qué quedó pendiente, leyendo solo el issue y los enlaces que contiene.
- **SC-005**: Una búsqueda de secretos sobre el repositorio y su historial devuelve 0 credenciales.
- **SC-006**: Un desarrollador con un clon limpio y su credencial en el entorno puede tomar el siguiente ticket en menos de 2 minutos, sin pasos de configuración adicionales.

## Assumptions

- Se usa el GitHub Project 1 del usuario `fabisahe29`, vinculado al repositorio `fabisahe29/CREDIAGIL`. Sus valores de Status son exactamente **Todo**, **In Progress**, **In review** y **Done**. El issue escribe "In progress", pero prevalece el nombre configurado en el Project.
- Cada desarrollador tiene una credencial personal de GitHub con permisos sobre el repositorio y el Project, y la define en su entorno local.
- La configuración del servidor MCP ya existe localmente (`.mcp.json`, con la credencial tomada de una variable de entorno). Esta funcionalidad la incorpora al control de versiones.
- El trabajo es individual (constitución). El "siguiente ticket" lo decide el desarrollador al elegirlo de la lista; no hace falta manejar a varios desarrolladores tomando tickets en paralelo.
- El issue #3 se arrancó a mano: ya está en **In Progress** y tiene su comentario de inicio. La automatización aplica a los tickets siguientes.
- **Fuera de alcance**: la creación inicial del backlog (issues, milestones, etiquetas y el Project ya existen).
