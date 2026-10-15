# Feature Specification: Memoria y convenciones del equipo

**Feature Branch**: `4-memoria-y-convenciones-del-equipo`

**Created**: 2026-10-15

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#4 — Memoria y convenciones del equipo](https://github.com/fabisahe29/CREDIAGIL/issues/4)

**Épica / Milestone**: `epica:flujo-y-ecosistema` · M1 · Flujo y ecosistema · **Depende de**: #3 (Done)

**Trazabilidad con el enunciado**: Necesidades 1, 2 y 3 · Mínimos: CLAUDE.md, reglas en `.claude/rules/`

**Input**: Contenido del issue #4, entregado por `/ticket-tomar`. Es el primer ticket del flujo autónomo.

## Clarifications

### Session 2026-10-15

- Q: ¿Qué convenciones son del equipo y cuáles son preferencias personales? → A: **Del equipo**: idioma español en documentación, issues y commits; flujo Spec Kit con los comandos `/ticket-*`; commits convencionales; TypeScript strict; mapa del repositorio; enlace a la constitución para las reglas no negociables. **Personal**: estilo y extensión de las respuestas, permisos extra, editor y modelo.
- Q: ¿Qué contenido se carga siempre y cuál solo al trabajar en ciertas rutas? → A: **Siempre**: las convenciones de FR-003. **Por ruta, 4 reglas**: tests (cualquier archivo de test, en cualquier carpeta), módulo de política (reglas de negocio, bordes exactos, aritmética exacta), servidor MCP de originación (contratos tipados, validación del lado del servidor) y `specs/` (formato y trazabilidad).
- Q: ¿Qué archivos cuentan como test para la regla de tests? → A: Solo los archivos con sufijo `.test` (por ejemplo, `*.test.ts`), en cualquier carpeta. Los `.spec` y los documentos de `fixtures/` no cuentan como test.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recibir las convenciones del equipo al clonar (Priority: P1)

Como desarrollador que clona el repositorio, abro Claude Code y este ya conoce las convenciones del equipo: idioma, flujo de trabajo, reglas no negociables y comandos propios. No tengo que configurar nada ni copiar archivos.

**Why this priority**: es el valor central del ticket. Sin esto, cada persona trabaja con convenciones distintas y el resultado depende de quién esté al teclado.

**Independent Test**: clonar el repositorio en una carpeta limpia, abrir Claude Code y preguntarle por las convenciones del equipo. Debe responderlas sin que se le haya dado ningún contexto adicional.

**Acceptance Scenarios**:

1. **Given** un clon limpio del repositorio, **When** se abre una sesión de Claude Code en su raíz, **Then** las convenciones del equipo se cargan solas, sin pasos de configuración.
2. **Given** la memoria del proyecto cargada, **When** se compara con la constitución y con las reglas por ruta, **Then** no repite su contenido: lo referencia.
3. **Given** contenido que solo hace falta en ciertas partes del repositorio, **When** se organiza la memoria, **Then** existe al menos un uso justificado de importación (`@import`) o de una memoria por subdirectorio.

---

### User Story 2 - Reglas que aplican según la ruta, incluidos todos los tests (Priority: P1)

Como desarrollador, cuando trabajo en un archivo de test, en cualquier carpeta del repositorio, Claude Code aplica las reglas de los tests. Cuando trabajo en otras partes con reglas propias, aplica esas. Las reglas no se cargan cuando no corresponden.

**Why this priority**: los tests viven junto al código que prueban, repartidos en muchas carpetas. Sin reglas por patrón de ruta, las convenciones de test se aplicarían de forma inconsistente o habría que repetirlas en cada carpeta.

**Independent Test**: abrir o editar un archivo de test en dos carpetas distintas y profundas, y comprobar que en ambos casos aplica la regla de tests. Abrir un archivo que no es de test y comprobar que esa regla no aplica.

**Acceptance Scenarios**:

1. **Given** las 4 reglas por ruta en `.claude/rules/` (tests, política, servidor MCP y specs), **When** se revisa su definición, **Then** cada una declara su alcance con patrones de ruta (glob).
2. **Given** la regla de tests, **When** se trabaja sobre un archivo de test en cualquier carpeta y a cualquier profundidad, **Then** la regla aplica.
3. **Given** la regla de tests, **When** se trabaja sobre un archivo que no es de test, **Then** la regla no aplica.

---

### User Story 3 - Preferencias personales aparte (Priority: P2)

Como desarrollador, guardo mis preferencias personales (memoria y configuración) en ubicaciones que no se versionan, de modo que no afectan a nadie más y nunca terminan en un commit.

**Why this priority**: protege al resto del equipo de preferencias ajenas y evita que se filtre configuración local. Depende de que exista la configuración compartida de la Historia 1.

**Independent Test**: crear una memoria personal y una configuración personal en las ubicaciones previstas, y comprobar que el control de versiones las ignora y que Claude Code las aplica solo en esa máquina.

**Acceptance Scenarios**:

1. **Given** una preferencia personal de memoria, **When** se guarda en la ubicación personal prevista, **Then** Claude Code la aplica y el control de versiones no la detecta como cambio.
2. **Given** una configuración personal (por ejemplo, un permiso adicional), **When** se guarda en la ubicación personal prevista, **Then** se combina con la compartida sin modificarla y no se versiona.
3. **Given** el repositorio, **When** se inspeccionan los archivos versionados, **Then** la configuración compartida y la personal están en archivos distintos.

---

### User Story 4 - Decisiones de ubicación registradas (Priority: P3)

Como miembro del equipo o evaluador, encuentro en `DECISIONES.md` por qué cada pieza de memoria, regla o configuración vive donde vive, y qué alternativa se descartó.

**Why this priority**: da trazabilidad a decisiones que, sin registro, parecen arbitrarias. No bloquea el uso diario.

**Independent Test**: para cada ubicación elegida (memoria del proyecto, reglas, configuración compartida y personal, importaciones), localizar su entrada en `DECISIONES.md` con la decisión y la alternativa descartada.

**Acceptance Scenarios**:

1. **Given** las ubicaciones elegidas, **When** se lee `DECISIONES.md`, **Then** cada una tiene su decisión, su motivo y la alternativa descartada.

---

### Edge Cases

- **Test en una carpeta nueva** que no existía al escribir la regla: la regla de tests aplica igual, porque el alcance se define por patrón y no por lista de carpetas.
- **Documento de prueba ficticio en `fixtures/`**: no es un test, así que la regla de tests no aplica al editarlo. La exigencia de datos ficticios sigue vigente para él a través de la constitución importada (Principio II).
- **Archivo que coincide con dos reglas** (por ejemplo, un test del módulo de política): aplican las dos, sin contradecirse.
- **Preferencia personal que contradice una convención del equipo** (por ejemplo, una memoria personal que pide commits en inglés): prevalecen las convenciones de FR-003. Lo personal solo ajusta lo listado en FR-003a.
- **Desarrollador sin memoria ni configuración personal**: todo funciona solo con lo compartido.
- **Un archivo personal se crea antes de que exista la regla de ignorado**: no debe poder versionarse por accidente; la regla de ignorado se versiona con este ticket.
- **Memoria del proyecto que crece con el tiempo**: debe seguir siendo concisa; el contenido específico de una ruta va a su regla y no a la memoria general.

## Requirements *(mandatory)*

### Functional Requirements

**Convenciones compartidas**

- **FR-001**: El repositorio MUST incluir una memoria de proyecto versionada que Claude Code cargue automáticamente al abrir una sesión en el repositorio, sin pasos adicionales.
- **FR-002**: La memoria del proyecto MUST ser concisa y MUST NOT duplicar la constitución (`.specify/memory/constitution.md`) ni el contenido de las reglas por ruta: las referencia.
- **FR-003**: La memoria del proyecto MUST contener exactamente las convenciones del equipo:
  1. idioma español en documentación, issues, comentarios de avance y mensajes de commit;
  2. flujo de trabajo: Spec Kit (especificar → aclarar → planificar → tareas → implementar) con los comandos `/ticket-tomar`, `/ticket-abrir-pr` y `/ticket-cerrar`;
  3. commits convencionales (`feat:`, `fix:`, `docs:`…);
  4. stack: TypeScript strict en Node.js LTS;
  5. mapa del repositorio (qué hay en cada carpeta principal);
  6. enlace a la constitución para las reglas no negociables, sin copiarlas.
- **FR-003a**: La memoria del proyecto MUST NOT fijar preferencias personales: estilo o extensión de las respuestas, permisos adicionales, editor ni modelo. Estas viven en las ubicaciones personales (FR-008, FR-009).
- **FR-004**: El repositorio MUST incluir al menos un uso justificado de importación (`@import`) o de una memoria por subdirectorio. La justificación queda en `DECISIONES.md`.

**Reglas por ruta**

- **FR-005**: El repositorio MUST incluir las 4 reglas de FR-007 en `.claude/rules/`, cada una con alcance por ruta definido con `paths` y patrones glob. El mínimo exigido por el issue es 2.
- **FR-006**: Una de las reglas MUST aplicar a todos los archivos de test del repositorio, estén en la carpeta que estén y a cualquier profundidad, y MUST NOT aplicar a archivos que no son de test. Un archivo es de test si y solo si su nombre tiene el sufijo `.test` antes de la extensión (por ejemplo, `cuota.test.ts`). Los `.spec` y los documentos de `fixtures/` no son tests.
- **FR-007**: Lo que vale para todo el repositorio (FR-003) MUST cargarse siempre, desde la memoria del proyecto. Lo que solo importa en una zona MUST ir en una regla por ruta. Las reglas son exactamente cuatro:
  1. **Tests**: aplica a cualquier archivo de test, en cualquier carpeta (FR-006). Contenido: cómo se nombran y organizan los tests, uso exclusivo de datos ficticios y casos de borde obligatorios.
  2. **Módulo de política**: aplica a los archivos del módulo de política de crédito. Contenido: reglas de negocio inmutables, orden de evaluación, bordes exactos ($5.000.000, 30%, 10%) y aritmética exacta (sin flotantes en umbrales).
  3. **Servidor MCP de originación**: aplica a los archivos del servidor de herramientas. Contenido: contratos tipados de entrada y salida, revalidación de las reglas críticas del lado del servidor, idempotencia y errores explícitos.
  4. **Especificaciones**: aplica a `specs/`. Contenido: enlace obligatorio al issue de origen, formato de las specs y trazabilidad con el ticket.
- **FR-007a**: Las reglas 2 y 3 MUST referenciar la constitución para las reglas no negociables, en lugar de copiarlas (FR-002). Solo agregan cómo se aplican en el código de esa zona.

**Separación personal / compartido**

- **FR-008**: Las preferencias personales de memoria MUST vivir en una ubicación que no se versiona.
- **FR-009**: La configuración personal MUST vivir en un archivo distinto de la configuración compartida, que no se versiona y que se combina con la compartida sin modificarla.
- **FR-010**: El repositorio MUST incluir las reglas de ignorado necesarias para que las ubicaciones personales nunca se versionen por accidente.

**Trazabilidad**

- **FR-011**: Cada decisión de ubicación (memoria del proyecto, importación o memoria por subdirectorio, reglas, configuración compartida y personal) y la alternativa descartada MUST quedar registradas en `DECISIONES.md`.

### Key Entities

- **Memoria del proyecto**: convenciones del equipo que se cargan siempre. Es versionada y concisa, y referencia la constitución y las reglas en lugar de copiarlas.
- **Regla por ruta**: convenciones que aplican solo a archivos que coinciden con sus patrones glob. Es versionada.
- **Memoria personal**: preferencias de una persona. No se versiona.
- **Configuración compartida**: permisos y ajustes del equipo. Es versionada.
- **Configuración personal**: ajustes de una persona que se combinan con los compartidos. No se versiona.
- **Registro de decisión**: entrada en `DECISIONES.md` con la ubicación elegida, el motivo y la alternativa descartada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un desarrollador con un clon limpio recibe el 100% de las convenciones del equipo en su primera sesión, con 0 pasos de configuración.
- **SC-002**: La regla de tests aplica al 100% de los archivos de test de prueba, ubicados en al menos 3 carpetas distintas y de distinta profundidad, y a 0 archivos que no son de test.
- **SC-003**: 0 archivos de preferencias personales aparecen como cambios versionables tras crearlos en sus ubicaciones previstas.
- **SC-004**: La memoria del proyecto se lee completa en menos de 2 minutos y no contiene ningún párrafo copiado de la constitución ni de las reglas.
- **SC-005**: El 100% de las decisiones de ubicación tienen entrada en `DECISIONES.md`, con la alternativa descartada.

## Assumptions

- El repositorio aún no tiene código del agente, que empieza en el issue #7. Las reglas por ruta se definen por patrón para que apliquen a los archivos que se creen después. Su validación usa archivos de ejemplo o los primeros archivos reales.
- Los tests seguirán la convención de vivir junto al código con el sufijo `.test` (por ejemplo, `*.test.ts`), según el stack de la constitución (TypeScript). El sufijo `.spec` no se usa en el proyecto.
- Las carpetas del módulo de política y del servidor MCP todavía no existen, porque llegan con los issues #7 y siguientes. El plan fija sus rutas previstas y las reglas usan esos patrones. Si al implementar el #7 las rutas cambian, se ajustan los patrones de las reglas en ese ticket.
- La constitución sigue siendo la fuente de las reglas no negociables. La memoria del proyecto la referencia y no la reemplaza.
- Ya existen en el repositorio comandos propios (`.claude/skills/`), la configuración del MCP de GitHub (`.mcp.json`) y `DECISIONES.md`, todos del issue #3. Este ticket los reutiliza y no los cambia.
- **Fuera de alcance**: hooks y controles automáticos (#5); subagentes y skills de revisión (#6).
