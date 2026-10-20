# Feature Specification: Paquete de entrega

**Feature Branch**: `19-paquete-de-entrega`

**Created**: 2026-10-19

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#19 — Paquete de entrega](https://github.com/fabisahe29/CREDIAGIL/issues/19)

**Épica / Milestone**: `epica:entrega` · M3 · Validación y entrega · **Depende de**: #17 y #18

**Trazabilidad con el enunciado**: Entregables 1, 2 y 3 · Sección "Entregables y sustentación"

**Input**: Contenido del issue #19, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-19

- Q: Al reducir `DECISIONES.md` a dos páginas, ¿dónde se conserva el registro detallado de decisiones por ticket? → A: Se mueve sin cambios a un documento aparte (por ejemplo `docs/registro-decisiones.md`), enlazado desde `DECISIONES.md`; las decisiones futuras del plan se anotan en ese documento detallado.
- Q: ¿De dónde sale la lista de las 11 necesidades del ecosistema que `DECISIONES.md` debe cubrir? → A: Del texto del enunciado aportado por el desarrollador (sección "Necesidades que tu ecosistema debe resolver"), resumido en la sección "Las 11 necesidades" de esta spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correr el agente y las pruebas en menos de cinco minutos desde el README (Priority: P1)

Como evaluador, quiero abrir el README, instalar y correr el agente y sus pruebas en pocos minutos, y llegar desde ahí al GitHub Project y al video, para calificar la entrega con la evidencia del repositorio sin pedir ayuda.

**Why this priority**: es la primera puerta de la calificación. Si el evaluador no logra correr el agente o las pruebas rápido, el resto de la entrega no se llega a ver.

**Independent Test**: una persona que no participó en el desarrollo clona el repositorio, sigue solo el README y mide el tiempo hasta tener el agente corriendo y las pruebas en verde.

**Acceptance Scenarios**:

1. **Given** un repositorio recién clonado y un equipo con los requisitos que el README declara, **When** el evaluador sigue los pasos del README para instalar, correr el agente y correr las pruebas, **Then** lo logra en menos de 5 minutos sin consultar otro documento.
2. **Given** el README, **When** el evaluador busca el GitHub Project y el video de funcionamiento, **Then** encuentra el enlace a cada uno en la primera pantalla de lectura o en una sección claramente rotulada.
3. **Given** que el evaluador no tiene credenciales del modelo, **When** sigue el README, **Then** sabe qué puede correr sin ellas (pruebas y casos guionados) y qué necesita credenciales.

---

### User Story 2 - Entender las decisiones del ecosistema en dos páginas (Priority: P1)

Como evaluador, quiero un documento corto que, para cada una de las 11 necesidades del ecosistema, diga qué mecanismo se eligió, por qué y qué alternativa se descartó, para calificar el criterio técnico sin leer todo el repositorio.

**Why this priority**: es el entregable que sustenta las decisiones. Hoy el registro de decisiones es un historial extenso por ticket; el evaluador necesita una vista condensada por necesidad.

**Independent Test**: se cuentan las páginas del documento y se verifica que cada una de las 11 necesidades tiene su mecanismo, su motivo y su alternativa descartada.

**Acceptance Scenarios**:

1. **Given** `DECISIONES.md`, **When** se mide su extensión, **Then** no supera dos páginas.
2. **Given** `DECISIONES.md`, **When** se revisa cada una de las 11 necesidades del ecosistema, **Then** cada una tiene mecanismo elegido, motivo y alternativa descartada, sin omitir ninguna.
3. **Given** una decisión del documento, **When** el evaluador quiere más detalle, **Then** encuentra un enlace a la especificación o al plan que la respalda.
4. **Given** el detalle de las decisiones por ticket que hoy vive en `DECISIONES.md`, **When** el documento se reduce a dos páginas, **Then** ese detalle no se pierde: se conserva sin cambios en un documento aparte, enlazado desde `DECISIONES.md`.

---

### User Story 3 - Revisar los artefactos de Spec Kit versionados (Priority: P2)

Como evaluador, quiero encontrar en el repositorio la constitución y, por cada ticket implementado, su especificación, su plan y sus tareas, para verificar que el desarrollo siguió el flujo.

**Why this priority**: es evidencia de proceso. Casi todo está ya versionado; falta comprobar que no falta nada y que cada ticket implementado queda enlazado a sus artefactos.

**Independent Test**: se recorre la lista de tickets implementados y se verifica que cada uno tiene su carpeta en `specs/` con especificación, plan y tareas, y que la constitución está en `.specify/memory/`.

**Acceptance Scenarios**:

1. **Given** el repositorio en `main` tras fusionar los tickets pendientes, **When** se lista `specs/`, **Then** cada ticket implementado tiene una carpeta con su especificación, su plan y sus tareas.
2. **Given** el repositorio, **When** se busca la constitución, **Then** está en `.specify/memory/constitution.md`.
3. **Given** un ticket sin carpeta o con artefactos incompletos, **When** se hace la verificación, **Then** queda reportado con el ticket y el artefacto que falta, y no se da por entregado.

---

### User Story 4 - Ver el video de funcionamiento sin pedir acceso (Priority: P1)

Como evaluador, quiero ver un video de máximo 5 minutos que muestre los siete casos de prueba y poder abrirlo sin solicitar acceso, para ver el agente funcionando sin montar nada.

**Why this priority**: es uno de los tres entregables calificados. Un enlace que pide acceso equivale a no tener video.

**Independent Test**: se abre el enlace del README en una ventana sin sesión iniciada, se mide la duración y se comprueba que aparecen los siete casos.

**Acceptance Scenarios**:

1. **Given** el enlace del video en el README, **When** se abre sin sesión iniciada, **Then** se reproduce sin pedir acceso.
2. **Given** el video, **When** se mide su duración, **Then** dura 5 minutos o menos.
3. **Given** el video, **When** se mira completo, **Then** muestra los siete casos obligatorios, cada uno identificable por su número y su resultado.

---

### User Story 5 - Armar el `.zip` de entrega sin secretos ni dependencias (Priority: P1)

Como persona que entrega la prueba, quiero armar el `.zip` con una revisión previa que me garantice que no incluye credenciales ni dependencias instaladas, para no cometer la falta grave de entregar un secreto.

**Why this priority**: un `.env` o una credencial dentro del `.zip` es falta grave según el enunciado. Es el riesgo de mayor costo de toda la entrega.

**Independent Test**: se arma el `.zip`, se lista su contenido y se verifica que incluye `.git`, que no incluye dependencias instaladas, `.env` ni credenciales, y que pesa 50 MB o menos.

**Acceptance Scenarios**:

1. **Given** el repositorio listo, **When** se arma el `.zip`, **Then** incluye el historial (`.git`) completo.
2. **Given** el `.zip`, **When** se revisa su contenido, **Then** no contiene dependencias instaladas, archivos `.env` ni credenciales en ningún archivo, incluidos los de `.git`.
3. **Given** el `.zip`, **When** se mide su tamaño, **Then** pesa como máximo 50 MB.
4. **Given** que la revisión encuentra un secreto o una dependencia instalada, **When** termina, **Then** reporta el hallazgo y la entrega no se da por lista hasta corregirlo.
5. **Given** el repositorio, **When** se prepara la entrega, **Then** el historial no se reescribe: ningún commit ya publicado se altera ni se elimina.

---

### User Story 6 - Dejar cada ticket del Project en Done o con su estado real explicado (Priority: P2)

Como evaluador, quiero que cada ticket del GitHub Project esté en Done o tenga explicado por qué está en otro estado, para ver el avance real sin tener que interpretarlo.

**Why this priority**: da transparencia sobre lo entregado, pero no bloquea correr el agente ni ver el video.

**Independent Test**: se lista cada ticket del Project y se verifica que está en Done o que su issue tiene un comentario que explica su estado real.

**Acceptance Scenarios**:

1. **Given** el Project al cierre de la entrega, **When** se lista cada ticket, **Then** todos están en Done o tienen un comentario en su issue que explica su estado real.
2. **Given** un ticket que no se terminó, **When** se revisa su issue, **Then** el comentario dice qué falta y por qué quedó así, sin afirmar que está terminado.

---

### Edge Cases

- ¿Qué pasa si el README promete menos de 5 minutos pero una dependencia o un paso tarda más en un equipo limpio? El tiempo se mide en un equipo sin caché y, si no se cumple, se ajusta el README o los pasos.
- ¿Qué pasa si el enlace del video cambia de permisos tras publicarlo? La verificación se repite justo antes de entregar.
- ¿Qué pasa si un secreto aparece solo en el historial de `.git` y no en el árbol de trabajo? La revisión del `.zip` incluye el historial; como no se reescribe, se reporta y la persona que entrega decide cómo resolverlo.
- ¿Qué pasa si un ticket del Project sigue en In review porque su PR aún no se fusiona? Su estado real se explica en un comentario; no se fuerza a Done.
- ¿Qué pasa si `.env.example` está en el repositorio? Debe seguir incluido y sin valores reales; solo `.env` y credenciales quedan fuera.
- ¿Qué pasa si el documento de decisiones queda en dos páginas pero omite una necesidad? Falla el criterio: las 11 son obligatorias.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El README MUST explicar cómo instalar, correr el agente y correr las pruebas de modo que una persona ajena al proyecto lo logre en menos de 5 minutos.
- **FR-002**: El README MUST enlazar el GitHub Project y el video de funcionamiento.
- **FR-003**: El README MUST indicar qué se puede ejecutar sin credenciales del modelo y qué las exige.
- **FR-004**: `DECISIONES.md` MUST tener una extensión máxima de dos páginas.
- **FR-005**: `DECISIONES.md` MUST cubrir las 11 necesidades del ecosistema y, para cada una, el mecanismo elegido, el motivo y la alternativa descartada. Las 11 son las de la sección "Las 11 necesidades" de esta spec, con la numeración del enunciado.
- **FR-006**: Cada decisión de `DECISIONES.md` MUST enlazar al artefacto que la respalda (especificación, plan o investigación).
- **FR-006a**: El registro detallado de decisiones por ticket MUST conservarse íntegro y sin cambios de contenido en un documento aparte enlazado desde `DECISIONES.md`, y las referencias que hoy apuntan a `DECISIONES.md` (convenciones del equipo y reglas de specs) MUST actualizarse para señalar dónde se anotan las decisiones del plan.
- **FR-007**: Los artefactos de Spec Kit MUST estar versionados: la constitución en `.specify/memory/` y, por cada ticket implementado, su especificación, plan y tareas en `specs/`.
- **FR-008**: La entrega MUST incluir una verificación que reporte, por ticket implementado, los artefactos de Spec Kit que faltan.
- **FR-009**: El video MUST durar como máximo 5 minutos, mostrar los siete casos obligatorios y poder verse sin solicitar acceso.
- **FR-010**: El `.zip` MUST incluir `.git`.
- **FR-011**: El `.zip` MUST NOT incluir dependencias instaladas, archivos `.env` ni credenciales, y MUST pesar como máximo 50 MB.
- **FR-012**: La entrega MUST incluir una revisión del contenido del `.zip` antes de subirlo, con un resultado que identifique cada hallazgo y bloquee la entrega si hay uno.
- **FR-013**: El historial del repositorio MUST NOT reescribirse al preparar la entrega.
- **FR-014**: Cada ticket del GitHub Project MUST quedar en Done o con un comentario en su issue que explique su estado real.
- **FR-015**: Ningún documento de la entrega MUST contener datos reales ni secretos (constitución, Principio II).

### Las 11 necesidades

Fuente: enunciado, sección "Necesidades que tu ecosistema debe resolver". Cada una se justifica en `DECISIONES.md`.

1. Todo desarrollador que clone el repositorio recibe las convenciones del equipo sin configurar nada.
2. Las preferencias personales no afectan a los compañeros.
3. Los tests viven junto al código que prueban, en muchas carpetas, y todos siguen las mismas convenciones.
4. No se escribe código de un ticket sin que exista su especificación en `specs/`.
5. Ningún archivo del repositorio puede contener algo con forma de documento de identidad, cuenta o tarjeta reales.
6. Los archivos de secretos y variables de entorno no se leen ni se modifican desde Claude Code.
7. El código queda formateado después de cada edición.
8. Antes de abrir un pull request, el código pasa por una revisión independiente de la sesión que lo generó.
9. Una revisión de cumplimiento verifica que las reglas de negocio estén implementadas como se especificaron.
10. El estado de los tickets en GitHub se mantiene sincronizado con el avance real, sin intervención manual.
11. Otro equipo de la fintech puede instalar las piezas reutilizables en su propio repositorio.

Mínimos de componentes que el enunciado exige y que el documento debe poder mapear: reglas con `paths` (2), subagentes con herramientas restringidas (2), skills con `context: fork`, `allowed-tools` y `argument-hint` (2), hooks, uno que bloquee y uno posterior a la edición (2), comando propio compartido (1), servidores MCP: GitHub y el propio (2), plugin con subagente, skill y hook (1).

### Key Entities *(include if feature involves data)*

- **Paquete de entrega**: el conjunto de los tres entregables calificados: el repositorio con su `.zip`, el documento de decisiones y el video de funcionamiento.
- **Necesidad del ecosistema**: cada una de las 11 áreas del enunciado que exigen un mecanismo (por ejemplo, comandos propios o plugin), con su decisión asociada.
- **Hallazgo de la revisión del `.zip`**: un archivo o contenido que incumple la entrega (secreto, dependencia instalada, exceso de peso), con su ubicación.
- **Estado real de un ticket**: el estado del ticket en el Project y, si no es Done, la explicación publicada en su issue.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona ajena al proyecto corre el agente y las pruebas siguiendo solo el README en menos de 5 minutos.
- **SC-002**: El 100% de las 11 necesidades del ecosistema aparece en el documento de decisiones con mecanismo, motivo y alternativa descartada, en un máximo de 2 páginas.
- **SC-003**: El 100% de los tickets implementados tiene su especificación, plan y tareas versionados, y la constitución está presente.
- **SC-004**: El video dura 5 minutos o menos, muestra los 7 casos y lo abre sin pedir acceso el 100% de las personas que prueban el enlace sin sesión.
- **SC-005**: El `.zip` pesa 50 MB o menos y la revisión previa encuentra 0 credenciales, 0 archivos `.env` y 0 dependencias instaladas.
- **SC-006**: 0 commits del historial publicado se reescriben o eliminan.
- **SC-007**: El 100% de los tickets del Project está en Done o tiene su estado real explicado en su issue.

## Assumptions

- Los siete casos y su ejecución con un comando ya existen (#17) y el README ya documenta el comando y enlaza un video; este ticket verifica, completa y ajusta, no reconstruye.
- El plugin reutilizable (#18) está en revisión (PR #37); su carpeta en `specs/` entra a `main` con ese PR. Este ticket depende de que se fusione para verificar la completitud de `specs/`.
- El enunciado fija el domingo 18 de octubre de 2026 como fecha límite de los entregables; hoy es 19 de octubre, así que esa fecha ya pasó y se trata como un riesgo a informar, no como una condición que cambie el alcance.
- El video y el `.zip` son artefactos fuera del código: el repositorio solo versiona el enlace al video y la verificación del `.zip`; el video lo graba y publica la persona que entrega.
- Los datos de los documentos de la entrega son ficticios, según `docs/datos-ficticios.md`.
- Fuera de alcance: cambiar reglas de negocio, el comportamiento del agente o de los casos, y reescribir el historial.
