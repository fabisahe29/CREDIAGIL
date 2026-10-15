---

description: "Lista de tareas: memoria y convenciones del equipo"
---

# Tasks: Memoria y convenciones del equipo

**Input**: documentos de diseño en `specs/002-memoria-convenciones-equipo/`

**Issue de origen**: [fabisahe29/CREDIAGIL#4](https://github.com/fabisahe29/CREDIAGIL/issues/4)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/archivos-memoria.md](contracts/archivos-memoria.md), [quickstart.md](quickstart.md)

**Tests**: la spec no pide pruebas automatizadas y la feature no tiene código ejecutable. Cada historia cierra con una tarea de **validación manual** que sigue un escenario de [quickstart.md](quickstart.md), usando `/memory` y `/context`.

**Organization**: las tareas se agrupan por historia de usuario. Todas las historias dependen solo de la Fase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US4)

## Path Conventions

Archivos en la raíz del repositorio (`CLAUDE.md`, `.gitignore`, `DECISIONES.md`) y en `.claude/` (`settings.json`, `rules/`). No se crean `src/politica/` ni `src/mcp/`: los crea el #7 (research R5).

**Estilo común**: todo el contenido va en español; cada viñeta de una regla es una instrucción verificable, no una explicación; nada se copia de la constitución, se enlaza o se importa.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Comprobar las precondiciones sin crear archivos:
  - existe `.specify/memory/constitution.md`;
  - existen `.gitignore` y `DECISIONES.md`, ambos del #3;
  - no existen todavía `CLAUDE.md`, `.claude/settings.json` ni `.claude/rules/`.

  Si algo de lo nuevo ya existe, leerlo y fusionarlo en lugar de sobrescribirlo.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: que ningún archivo personal pueda versionarse antes de que alguien lo cree, incluso durante las validaciones.

- [X] T002 Agregar a `.gitignore`, al final, el bloque del contrato ([contracts/archivos-memoria.md](contracts/archivos-memoria.md), sección `.gitignore`):
  - el comentario `# Preferencias personales de Claude Code (no se versionan)`;
  - las líneas `CLAUDE.local.md` y `.claude/settings.local.json`.

  Verificar con `git check-ignore -v CLAUDE.local.md .claude/settings.local.json` que ambas rutas quedan ignoradas por `.gitignore` (FR-010).

**Checkpoint**: lo personal ya está protegido.

---

## Phase 3: User Story 1 - Recibir las convenciones del equipo al clonar (Priority: P1) 🎯 MVP

**Goal**: al abrir Claude Code en un clon limpio, se cargan solas las convenciones del equipo y la constitución.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 1.

- [X] T003 [US1] Crear `CLAUDE.md` en la raíz con la estructura del contrato ([contracts/archivos-memoria.md](contracts/archivos-memoria.md), sección `CLAUDE.md`), con un tope de **menos de 60 líneas**:
  - **Título**: `# Crediágil — convenciones del equipo`.
  - **Constitución importada**: una línea que diga que las reglas no negociables están en la constitución, seguida de `@.specify/memory/constitution.md` en una línea propia, fuera de bloques de código. No se resume ningún principio.
  - **Convenciones** (exactamente las 6 de FR-003):
    1. Idioma: español en documentación, issues, comentarios de avance y mensajes de commit.
    2. Flujo de trabajo: Spec Kit (especificar → aclarar → planificar → tareas → implementar) con `/ticket-tomar`, `/ticket-abrir-pr` y `/ticket-cerrar`; los comentarios de especificación y plan los publican los hooks; enlace a `.claude/flujo-github.md`.
    3. Commits convencionales (`feat:`, `fix:`, `docs:`, `chore:`…).
    4. Stack: TypeScript `strict` en Node.js LTS.
    5. Mapa del repositorio: `specs/` (una carpeta por feature), `.specify/` (Spec Kit y constitución), `.claude/` (comandos, reglas y configuración compartida), `src/politica/` y `src/mcp/` (previstos para el #7) y `DECISIONES.md`.
    6. Reglas por zona: se cargan solas al tocar archivos de cada zona en `.claude/rules/` (tests, política, servidor MCP, specs).
  - **Lo personal va aparte**: `CLAUDE.local.md` y `.claude/settings.local.json` no se versionan. Solo pueden ajustar el estilo de las respuestas, los permisos extra, el editor y el modelo. Las convenciones de este archivo prevalecen sobre lo personal (FR-003a).
- [X] T004 [US1] Validación manual del Escenario 1 de [quickstart.md](quickstart.md):
  - abrir una sesión nueva y ejecutar `/memory`, que debe mostrar `CLAUDE.md` y la constitución importada, sin reglas de `.claude/rules/` cargadas;
  - preguntar por el idioma y el formato de los commits sin dar contexto;
  - `wc -l CLAUDE.md` debe dar menos de 60;
  - confirmar que no hay frases copiadas de la constitución (FR-002, SC-001, SC-004).

**Checkpoint**: MVP. Las convenciones del equipo se reciben al clonar.

---

## Phase 4: User Story 2 - Reglas que aplican según la ruta, incluidos todos los tests (Priority: P1)

**Goal**: cuatro reglas en `.claude/rules/` que se cargan solo al tocar archivos de su zona.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 2.

**Formato de cada regla** (contrato, sección `.claude/rules/<nombre>.md`):

- frontmatter YAML con **solo** la clave `paths`, como lista de globs entre comillas dobles;
- un título `# <Zona>: reglas`;
- viñetas con instrucciones verificables;
- donde aplique, una viñeta final que enlaza la constitución con la ruta relativa `../../.specify/memory/constitution.md` y el número de principio.

- [X] T005 [P] [US2] Crear `.claude/rules/tests.md` con `paths: ["**/*.test.ts"]`, exactamente ese único patrón (aclaración Q3). Instrucciones:
  - un test vive junto al archivo que prueba y se llama `<archivo>.test.ts`; no se usa `.spec`;
  - solo datos ficticios reconocibles como tales (dominios `.example`, nombres y NIT inventados), con enlace al Principio II;
  - los tests del módulo de política cubren los bordes exactos (monto igual a $5.000.000, cuota igual al 30% del ingreso, diferencia igual al 10%) y los valores inmediatamente por encima y por debajo;
  - un test describe el comportamiento en español (`it("escala si…")`);
  - ningún test depende de red ni de servicios reales: el core de originación y el modelo se simulan.
- [X] T006 [P] [US2] Crear `.claude/rules/politica.md` con `paths: ["src/politica/**"]`. Instrucciones:
  - los umbrales y la tasa viven solo en este módulo, que tiene una única fuente de configuración versionada;
  - montos en pesos enteros o con aritmética decimal exacta; prohibido comparar umbrales con flotantes;
  - la evaluación respeta el orden de la constitución; enlace al Principio I, sin repetir las reglas;
  - cada decisión devuelve regla aplicada, valores usados y motivo (enlace al Principio III);
  - todo cambio en este módulo va acompañado de su test de bordes.
- [X] T007 [P] [US2] Crear `.claude/rules/servidor-mcp.md` con `paths: ["src/mcp/**"]`. Instrucciones:
  - cada herramienta declara un esquema de entrada y otro de salida tipados y validados;
  - el servidor vuelve a aplicar las reglas críticas aunque el agente ya las haya aplicado (enlace al Principio IV);
  - las herramientas con efectos (registrar, preaprobar, escalar) exigen una clave de idempotencia;
  - los errores son explícitos, tipados y legibles por el agente, nunca silenciados (enlace al Principio VI);
  - los logs no contienen el contenido completo de los documentos.
- [X] T008 [P] [US2] Crear `.claude/rules/specs.md` con `paths: ["specs/**"]`. Instrucciones:
  - cada `spec.md` lleva en su cabecera la línea `**Issue de origen**: [fabisahe29/CREDIAGIL#<N> — <título>](<url>)`;
  - el contenido va en español;
  - los criterios de aceptación del issue se respetan y se trazan en la spec;
  - lo que el issue declara fuera de alcance no se especifica;
  - las decisiones del plan con alternativa descartada van a `DECISIONES.md`.
- [X] T009 [US2] Validación manual del Escenario 2 de [quickstart.md](quickstart.md):
  - crear los archivos de ejemplo **temporales** (`src/politica/cuota.test.ts`, `src/mcp/herramientas/registrar.test.ts`, `pruebas/e2e/flujo-preaprobable.test.ts`, `src/politica/cuota.ts` y `pruebas/e2e/fixtures/certificado-laboral.md`), todos ficticios;
  - comprobar en sesiones nuevas, con `/context`, qué regla carga cada uno;
  - comprobar que al iniciar ninguna regla está cargada (R6: si el YAML no se puede leer, la regla se carga siempre);
  - **borrar** los archivos de ejemplo y las carpetas creadas, y confirmar con `git status` que no queda nada (SC-002).

**Checkpoint**: las reglas por ruta funcionan, incluida la de tests en 3 carpetas de distinta profundidad.

---

## Phase 5: User Story 3 - Preferencias personales aparte (Priority: P2)

**Goal**: configuración compartida versionada y personal ignorada, combinables.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 3.

- [X] T010 [US3] Crear `.claude/settings.json` con el JSON estricto del contrato, `{"enabledMcpjsonServers": ["github"]}`, sin comentarios ni comas finales (R8, FR-009). Validar que el JSON es legible, por ejemplo con `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`.
- [ ] T011 [US3] Validación manual del Escenario 3 de [quickstart.md](quickstart.md):
  - crear un `CLAUDE.local.md` temporal con "Responde de forma muy breve" y un `.claude/settings.local.json` temporal con un permiso extra;
  - verificar con `/memory` y `/status` que se aplican, y con `git status` que ninguno de los dos aparece;
  - probar el conflicto "commits en inglés": el mensaje de commit sigue saliendo en español;
  - después **borrar** los dos archivos temporales (SC-003).

---

## Phase 6: User Story 4 - Decisiones de ubicación registradas (Priority: P3)

**Goal**: cada ubicación tiene su motivo y su alternativa descartada.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 4.

- [X] T012 [US4] Agregar al **principio** de `DECISIONES.md` (la más reciente va primero) la entrada `## 2026-10-15 · Memoria y convenciones del equipo`, con enlace al issue #4 y a [research.md](research.md). Debe tener 5 decisiones con su motivo, alternativa descartada y consecuencias:
  - R1: `CLAUDE.md` en la raíz;
  - R2: `@import` de la constitución;
  - R3: cuatro reglas por ruta, incluida la aclaración de que solo `*.test.ts` cuenta como test;
  - R7: `CLAUDE.local.md`;
  - R8: `settings.json` frente a `settings.local.json`.

  Seguir el formato de la entrada del #3 (FR-011, SC-005).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T013 Revisión cruzada:
  - con `grep`, confirmar que `CLAUDE.md` y las 4 reglas no contienen frases literales de `.specify/memory/constitution.md` (FR-002, FR-007a);
  - cada regla tiene frontmatter con `paths` y nada más;
  - `CLAUDE.md` no menciona preferencias personales como norma.
- [X] T014 Commit convencional en `4-memoria-y-convenciones-del-equipo`, por ejemplo `feat: memoria y convenciones del equipo (#4)`. Incluye `CLAUDE.md`, `.gitignore`, `.claude/settings.json`, `.claude/rules/*.md`, `DECISIONES.md`, `specs/002-memoria-convenciones-equipo/` y el cambio pendiente de `specs/001-sincronizacion-backlog-github/tasks.md` (T016 y T017 marcadas). Antes:
  - `git status`, para confirmar que no entra ningún archivo personal ni temporal;
  - la búsqueda de secretos del quickstart del #3.
- [ ] T015 Con confirmación del desarrollador: `git push -u origin 4-memoria-y-convenciones-del-equipo` y `/ticket-abrir-pr 4`. Se espera un PR hacia `main` con `Closes #4`, el Status en `In review` y el comentario `pr`.
- [ ] T016 Con confirmación del desarrollador: `/ticket-cerrar`. Se espera squash merge, el issue #4 cerrado, el Status en `Done` y el comentario `cierre`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **T001 → T002**: T002 bloquea las historias, porque protege lo personal antes de las validaciones.
- **US1, US2, US3 y US4**: dependen solo de T002 y son independientes entre sí.
- **T013** depende de T003 a T012.
- **T014 → T015 → T016**, en ese orden.

### User Story Dependencies

- **US1 (P1)**: independiente. Es el MVP.
- **US2 (P1)**: independiente. El mapa de `CLAUDE.md` menciona las reglas, pero estas no dependen de él.
- **US3 (P2)**: independiente. Usa el `.gitignore` de T002.
- **US4 (P3)**: se puede escribir en cualquier momento; conviene al final, para reflejar lo que de verdad quedó.

### Within Each User Story

Contrato → archivo → validación manual. Los archivos temporales de validación se borran en la misma tarea.

### Parallel Opportunities

- T005, T006, T007 y T008 son cuatro reglas en archivos distintos.
- T003, T010 y T012 tocan archivos distintos y se pueden hacer en paralelo con las reglas.

---

## Parallel Example: tras la Fase 2

```text
Task: "T003 [US1] CLAUDE.md"
Task: "T005 [US2] .claude/rules/tests.md"
Task: "T006 [US2] .claude/rules/politica.md"
Task: "T007 [US2] .claude/rules/servidor-mcp.md"
Task: "T008 [US2] .claude/rules/specs.md"
Task: "T010 [US3] .claude/settings.json"
```

---

## Implementation Strategy

### MVP First (US1)

1. T001 → T002.
2. T003 → T004: `CLAUDE.md` con la constitución importada.
3. **Parar y validar**: un clon limpio recibe las convenciones.

### Incremental Delivery

1. MVP: US1.
2. US2: reglas por ruta (T005 a T009).
3. US3: configuración compartida y personal (T010, T011).
4. US4: decisiones (T012).
5. Polish: revisión, commit, PR y cierre con los comandos del flujo (T013 a T016).

---

## Notes

- Las validaciones de T004, T009 y T011 necesitan **sesiones nuevas** de Claude Code: las reglas y la memoria se cargan al iniciar o al tocar archivos, y una sesión ya abierta puede tener contexto de antes.
- Los archivos temporales de T009 y T011 nunca se commitean.
- Push, PR y fusión (T015, T016) se confirman con el desarrollador antes de ejecutarse.
