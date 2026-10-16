---

description: "Lista de tareas: revisión independiente y de cumplimiento antes del pull request"
---

# Tasks: Revisión independiente y de cumplimiento antes del pull request

**Input**: documentos de diseño en `specs/004-revision-independiente-pr/`

**Issue de origen**: [fabisahe29/CREDIAGIL#6](https://github.com/fabisahe29/CREDIAGIL/issues/6)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/revisores.md](contracts/revisores.md), [contracts/informe.md](contracts/informe.md), [contracts/ticket-abrir-pr.md](contracts/ticket-abrir-pr.md), [quickstart.md](quickstart.md)

**Tests**: la constitución exige pruebas y la spec fija criterios medibles (SC-002 a SC-006). Cada módulo determinista se escribe primero como prueba (en rojo) y después se implementa (en verde), con `node --test`. Los subagentes y las skills se validan con el quickstart, en una sesión nueva, al final.

**Organization**: las tareas se agrupan por historia de usuario. US1 y US2 dependen solo de la Fase 2. US3 usa los informes de US1 y US2. US4 extiende la decisión de US3 con el registro. US5 cierra con las decisiones.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US5)

## Path Conventions

- Código determinista en `.claude/revision/` y `.claude/revision/lib/`; controles del guardián en `.claude/hooks/lib/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Subagentes en `.claude/agents/`; skills en `.claude/skills/<nombre>/SKILL.md`.
- Nada va en `src/` (R10).

## Reglas comunes a todas las tareas de código

- Las mismas del #5: TypeScript `strict` con solo sintaxis borrable, imports con extensión `.ts`, `unknown` en lugar de `any`, guardas de tipo propias sin Zod (Complexity Tracking del plan).
- **Ningún archivo contiene un dato con forma real literal**. Los informes de prueba usan rutas y textos ficticios y, si hace falta un dato con forma real (V8), se genera en tiempo de ejecución con el helper `tarjetaLuhn` de las pruebas del #5.
- Los `sha` de prueba son cadenas de 40 caracteres hexadecimales inventadas (por ejemplo, `"a".repeat(40)`).
- Las rutas del paquete se construyen siempre desde la raíz del repositorio: `<raiz>/.git/crediagil/revisiones/<sha>/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Ampliar `package.json`: el script `test` pasa a `node --test ".claude/**/*.test.ts"` (R10). No se agregan dependencias.
- [X] T002 [P] Ampliar `tsconfig.json`: `include` pasa a `[".claude/hooks/**/*.ts", ".claude/revision/**/*.ts"]`.
- [X] T003 Comprobar que `npm test` y `npm run typecheck` siguen en verde con las 135 pruebas del #5.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: el paquete de revisión (R4) y los tipos y la validación común de los informes (R5), que necesitan las dos revisiones.

- [X] T004 [P] Prueba `.claude/revision/lib/paquete.test.ts` (en rojo), con un repositorio git temporal creado en `fs.mkdtemp` (`git init`, commits en `main` y en una rama `6-prueba`):
  - `rutaPaquete(raiz, sha)` → `<raiz>/.git/crediagil/revisiones/<sha>`;
  - `prepararPaquete({raiz, local: true})` escribe `paquete.json` con los campos de [data-model.md](data-model.md), «Paquete de revisión»: `issue` («entero > 0»), `rama`, `sha` («40 hex»), `base` («`git merge-base`»), `archivos` («lista de `{ruta, estado}`», con `estado` ∈ `agregado`, `modificado`, `eliminado`, `renombrado`, «no vacía»), `spec` y `constitucion`; y `diff.patch` con `git diff <base>...<sha>`;
  - sin cambios respecto de `main` lanza `DiffVacio`;
  - sin spec con `**Issue de origen**` para el número de la rama lanza `SinSpec`;
  - `leerPaquete(raiz, sha)` devuelve el paquete o lanza `PaqueteInexistente`.
- [X] T005 [P] Implementar `.claude/revision/lib/paquete.ts` con `execFileSync("git", …)`:
  - modo remoto: `sha` = `git rev-parse origin/<rama>`, `base` = `git merge-base origin/main <sha>`;
  - modo `local`: `HEAD` y `main`;
  - el número de issue sale de la rama (`^<N>-`, sin ceros a la izquierda) y la spec, de `specs/*/spec.md` con `Issue de origen` #N (mismo criterio que `spec-primero` del #5; reutilizar su función si se puede exportar sin romper sus pruebas);
  - los errores son clases tipadas.

  T004 en verde.
- [X] T006 [P] Prueba `.claude/revision/lib/informe.test.ts` (en rojo), con la parte común de [contracts/informe.md](contracts/informe.md), «Validación»:
  - `extraerBloqueJson(mensaje)`: un bloque → su contenido; cero o dos bloques → error V1;
  - `validarInformeCodigo(valor, paquete)`:
    - el ejemplo del contrato es válido;
    - `hallazgos: []` es válido;
    - `tipo` distinto o `sha` distinto del paquete → V2;
    - severidad fuera de «`critica` · `alta` · `media` · `baja`» → V3;
    - `archivo` fuera de `paquete.archivos` sin `contexto` → V6;
    - `preexistente: true` con severidad distinta de `baja` → V7;
    - un texto con una tarjeta generada con `tarjetaLuhn` → V8;
  - el resultado inválido lista **todas** las condiciones incumplidas, no solo la primera.
- [X] T007 Implementar `.claude/revision/lib/informe.ts`:
  - tipos `Hallazgo`, `InformeCodigo`, `EstadoRegla`, `InformeCumplimiento` y `ResultadoValidacion` (`{valido: true, informe} | {valido: false, errores: string[]}`), con los campos de [data-model.md](data-model.md);
  - `extraerBloqueJson`, `validarInformeCodigo` y la validación común de hallazgos (que reutilizará `restricciones` en US2);
  - V8 reutiliza el detector de `.claude/hooks/lib/datos-reales.ts`.

  T006 en verde.
- [X] T008 [P] Ampliar `.claude/hooks/lib/accion.ts` y su prueba: `Accion` gana `agente?: string`, tomado de `agent_type` de la entrada cuando es un texto no vacío. Las pruebas del #5 siguen en verde.
- [X] T009 [P] Ampliar `.claude/hooks/lib/bloqueo.ts` y su prueba: `Control` gana `"revisores"` y `"puerta-pr"`, y `ORDEN` queda `secretos`, `datos-reales`, `spec-primero`, `revisores`, `puerta-pr`, `error-interno`.

**Checkpoint**: `npm test` y `npm run typecheck` en verde; ya se puede preparar un paquete y validar un informe de código.

---

## Phase 3: User Story 1 - Revisión de código desde un contexto independiente (Priority: P1) 🎯 MVP

**Goal**: un revisor aislado y de solo lectura revisa el paquete y su informe queda capturado y validado sin intervención de la sesión principal.

**Independent Test**: `npm test` cubre `capturar.ts` y el control `revisores`; en una sesión nueva, [quickstart.md](quickstart.md), Escenarios 0 y 1.

- [X] T010 [US1] Prueba `.claude/revision/capturar.test.ts` (en rojo), que ejecuta `node .claude/revision/capturar.ts` como proceso, con un JSON de `SubagentStop` por stdin y un paquete preparado en una raíz temporal:
  - informe válido → sale con 0 y escribe `informe-codigo.json`;
  - informe inválido con `stop_hook_active: false` → sale con 2, con las condiciones en stderr, y no escribe nada;
  - inválido con `stop_hook_active: true` → sale con 0 y escribe `fallo-codigo.json` con la causa;
  - `agent_type` que no es revisor → sale con 0 sin escribir;
  - `sha` sin paquete → `fallo-codigo.json`, nunca un informe;
  - entrada que no es JSON → sale con 0 sin escribir informe (falla cerrado: sin informe, la revisión cuenta como fallida).
- [X] T011 [US1] Implementar `.claude/revision/capturar.ts` según [contracts/informe.md](contracts/informe.md), «Respuesta del hook `SubagentStop`»:
  - lee `agent_type`, `last_assistant_message`, `stop_hook_active` y `cwd`;
  - mapea `revisor-codigo` → `codigo` y `revisor-cumplimiento` → `cumplimiento`;
  - valida con `informe.ts`;
  - raíz = `CLAUDE_PROJECT_DIR` o `cwd`.

  T010 en verde (el caso de cumplimiento se completa en T020).
- [X] T012 [P] [US1] Prueba `.claude/hooks/lib/revisores.test.ts` (en rojo), con la tabla `revisores` de [contracts/revisores.md](contracts/revisores.md):
  - `agente: "revisor-codigo"` con Write, Edit, Bash, PowerShell, Agent, WebFetch o `mcp__github__add_issue_comment` → un bloqueo `revisores`;
  - con Read, Grep o Glob → ninguno;
  - sin `agente`, o con `agente: "Explore"` → ninguno.
- [X] T013 [US1] Implementar `.claude/hooks/lib/revisores.ts` y registrarlo en `CONTROLES` de `.claude/hooks/guardian.ts`. La corrección dice: «el revisor solo informa; la corrección la hace la sesión de desarrollo». Ampliar `.claude/hooks/guardian.test.ts`: un Write con `agent_type: "revisor-codigo"` → *deny* `revisores`. T012 en verde.
- [X] T014 [P] [US1] Crear `.claude/agents/revisor-codigo.md` con el frontmatter exacto de [contracts/revisores.md](contracts/revisores.md) (`tools: Read, Grep, Glob`, `disallowedTools: Write, Edit, MultiEdit, NotebookEdit, Bash, PowerShell, Agent, mcp__*`, `model: inherit`, `maxTurns: 40`) y un cuerpo en español con las secciones de la tabla del contrato:
  - rol;
  - entrada (paquete, diff, spec, constitución, `.claude/rules/`);
  - criterios;
  - las 4 severidades con las definiciones literales de FR-008a;
  - alcance (FR-004: diff más contexto, y `preexistente` con severidad baja);
  - orden de lectura: primero `paquete.json` y `diff.patch` completo, y después solo lo que haga falta contrastar, sin abrir uno por uno los archivos del diff ([contracts/revisores.md](contracts/revisores.md), R8);
  - la regla «no corrijas, informa»;
  - el formato de salida: un único bloque `json` según [contracts/informe.md](contracts/informe.md).
- [X] T015 [P] [US1] Crear `.claude/skills/revisar-codigo/SKILL.md` con el frontmatter exacto de [contracts/revisores.md](contracts/revisores.md) (`context: fork`, `agent: revisor-codigo`, `background: false`, `user-invocable: false`, `argument-hint`, `allowed-tools`, `disallowed-tools`). El cuerpo es la tarea autocontenida, que no asume nada de la conversación:
  1. leer `.git/crediagil/revisiones/$ARGUMENTS/paquete.json` y `diff.patch`;
  2. leer la spec y la constitución indicadas en el paquete;
  3. revisar;
  4. terminar con el bloque `json`.
- [X] T016 [US1] Agregar a `.claude/revision/revision.ts` (CLI) el subcomando `preparar [--local]`, que llama a `prepararPaquete`, imprime `{sha, ruta}` en JSON y sale con 1 y un mensaje legible ante `DiffVacio` o `SinSpec`. Agregar su caso a `.claude/revision/revision.test.ts` (proceso, repositorio temporal).

**Checkpoint**: MVP. Con `preparar --local` y la skill `revisar-codigo` se obtiene un informe de código aislado, validado y guardado (Escenario 0 en la Fase 8).

---

## Phase 4: User Story 2 - Verificación de cumplimiento de las reglas de negocio (Priority: P1)

**Goal**: un auditor aislado informa las reglas 1 a 5, cada una con estado y evidencia o motivo, y las restricciones de FR-007.

**Independent Test**: `npm test` cubre V4 y V5; [quickstart.md](quickstart.md), Escenario 2 (5 violaciones detectadas en una rama local de prueba).

- [X] T017 [US2] Ampliar `.claude/revision/lib/informe.test.ts` (en rojo) con `validarInformeCumplimiento(valor, paquete)`:
  - el ejemplo del contrato es válido;
  - faltan reglas, alguna está repetida o aparece una regla 6 → V4 («cada valor aparece **exactamente una vez**»);
  - `cumplida` o `incumplida` con `evidencia` vacía → V5;
  - `no_aplicable` sin `motivo` → V5;
  - estado fuera de «`cumplida` · `incumplida` · `no_aplicable`» → V3;
  - `restricciones` se valida como una lista de hallazgos (V3, V6, V7, V8).
- [X] T018 [US2] Implementar `validarInformeCumplimiento` en `.claude/revision/lib/informe.ts`. T017 en verde.
- [X] T019 [P] [US2] Crear `.claude/agents/revisor-cumplimiento.md`, con el mismo frontmatter que T014 y `name: revisor-cumplimiento`. Cuerpo en español:
  - las 5 reglas del Principio I copiadas literalmente de la constitución, con el orden de evaluación 4 → 5 → 1 → 3 → 2;
  - las restricciones de FR-007: umbrales y tasa en un único módulo de política, aritmética exacta y decisiones deterministas fuera del modelo;
  - la regla «`cumplida` solo con evidencia de archivo y línea; ante la duda, `incumplida` o `no_aplicable` con motivo»;
  - un ticket sin código del agente informa las 5 reglas como `no_aplicable`, con motivo;
  - salida: un único bloque `json` según [contracts/informe.md](contracts/informe.md).
- [X] T020 [US2] Crear `.claude/skills/revisar-cumplimiento/SKILL.md`, análogo a T015 con `agent: revisor-cumplimiento`. Completar en `.claude/revision/capturar.test.ts` el caso de cumplimiento (válido → `informe-cumplimiento.json`; V4 → sale con 2).

**Checkpoint**: las dos revisiones producen informes validados y guardados en el paquete.

---

## Phase 5: User Story 3 - Sin revisión no hay pull request (Priority: P2)

**Goal**: la decisión por gravedad es código; `/ticket-abrir-pr` ejecuta las revisiones antes de crear el PR, y el guardián niega crear un PR sin decisión favorable.

**Independent Test**: `npm test` cubre `decidir` y `puerta-pr`; [quickstart.md](quickstart.md), Escenario 3.

- [X] T021 [P] [US3] Prueba `.claude/revision/lib/decision.test.ts` (en rojo) para `decidir(paquete, informes, fallos)`, con los bordes de la aclaración Q1:
  - solo hallazgos `media` y `baja`, y reglas `cumplida` o `no_aplicable` → `permite: true`, `motivos: []`;
  - un hallazgo `alta` → `false`; un `critica` → `false`; una restricción `alta` → `false`; una regla `incumplida` → `false`;
  - falta `informe-codigo.json` o hay un `fallo-cumplimiento.json` → `false`, con la revisión `fallida`;
  - cada motivo incluye `archivo:línea` (FR-008, punto 3);
  - `conteos` suma bien («`{critica, alta, media, baja, cumplidas, incumplidas, no_aplicables}`»).
- [X] T022 [US3] Implementar `.claude/revision/lib/decision.ts`. T021 en verde.
- [X] T023 [US3] Agregar a `.claude/revision/revision.ts` el subcomando `decidir <sha>`: lee el paquete, los informes y los fallos, escribe `decision.json` y la imprime en JSON (sin `comentarios` todavía; se agregan en T029). Caso en `.claude/revision/revision.test.ts`.
- [X] T024 [P] [US3] Prueba `.claude/hooks/lib/puerta-pr.test.ts` (en rojo), con la tabla `puerta-pr` de [contracts/revisores.md](contracts/revisores.md) y una función `obtenerHeadRemoto(rama)` inyectable:
  - `mcp__github__create_pull_request` (`head: "6-x"`):
    - sin `decision.json` → bloqueo;
    - con `decision.json` de otro `sha` → bloqueo;
    - con `permite: false` → bloqueo con sus motivos;
    - con `decision.json` corrupta → bloqueo;
    - si `obtenerHeadRemoto` lanza → bloqueo;
    - con `decision.json` del `sha` actual, `permite: true` y las dos revisiones `valida` → ninguno;
  - Write, Edit o MultiEdit con ruta bajo `.git/crediagil/` → bloqueo;
  - Read de esa ruta → ninguno.
- [X] T025 [US3] Implementar `.claude/hooks/lib/puerta-pr.ts` (`obtenerHeadRemoto` real: `git rev-parse origin/<head>` con `execFileSync`) y registrarlo en `CONTROLES` de `.claude/hooks/guardian.ts`. Ampliar `.claude/hooks/guardian.test.ts` con un caso de *deny* `puerta-pr` como proceso. T024 en verde.
- [X] T026 [US3] Modificar `.claude/skills/ticket-abrir-pr/SKILL.md` con los pasos **R3, R4, R5 y R7** de [contracts/ticket-abrir-pr.md](contracts/ticket-abrir-pr.md), «Flujo nuevo», entre la verificación de la rama remota y la búsqueda del PR. Los pasos R1, R2 y R6 (búsqueda de registros, reutilización y publicación) los agrega T032.
  - R3: `revision.ts preparar`;
  - R4: invocar las skills `revisar-codigo` y `revisar-cumplimiento` con la herramienta Skill y el `sha`, y reintentar una vez la revisión que quede fallida (R8);
  - R5: `revision.ts decidir <sha>`;
  - R7: con `permite: false`, terminar sin crear el PR y con el Status en `In Progress`;
  - si ya hay PR abierto, ejecutar igual las revisiones.

  Actualizar la tabla de errores y la salida.
- [X] T027 [US3] Actualizar [specs/001-sincronizacion-backlog-github/contracts/comandos.md](../001-sincronizacion-backlog-github/contracts/comandos.md), sección `/ticket-abrir-pr`: lecturas, escrituras y flujo con los pasos R1 a R7, con un enlace a [contracts/ticket-abrir-pr.md](contracts/ticket-abrir-pr.md) como origen del cambio.

**Checkpoint**: sin una decisión favorable para el head remoto no se puede crear el PR, ni por el flujo ni directamente.

---

## Phase 6: User Story 4 - El resultado de las revisiones queda registrado (Priority: P2)

**Goal**: cada revisión deja un comentario idempotente en el issue, reutilizable al reintentar, y el PR lo resume.

**Independent Test**: `npm test` cubre el render, el parseo y `reutilizar`; [quickstart.md](quickstart.md), Escenario 4.

- [X] T028 [P] [US4] Prueba `.claude/revision/lib/registro.test.ts` (en rojo):
  - `marcador(tipo, sha)` → `<!-- crediagil:revision=<tipo>;commit=<sha> -->`;
  - `renderComentario(tipo, informe, decision, fecha)` sigue la plantilla de [contracts/informe.md](contracts/informe.md), «Comentario de registro»: marcador en la primera línea, encabezado con ✅ o ⛔, conteos y lo que bloquea con `archivo:línea`, y el informe completo en `<details>`;
  - `parsearComentario(cuerpo)` recupera el informe (ida y vuelta: `parsear(render(x))` = `x`); un cuerpo sin marcador o con JSON roto → `null`;
  - el comentario renderizado no contiene datos con forma real: pasa por `datos-reales` sin bloqueos.
- [X] T029 [US4] Implementar `.claude/revision/lib/registro.ts`. `decidir` (T023) pasa a incluir `comentarios: {codigo, cumplimiento}` en su salida. T028 en verde.
- [X] T030 [US4] Agregar a `.claude/revision/revision.ts` el subcomando `reutilizar <sha>`:
  - recibe por stdin un JSON con los cuerpos de los dos comentarios;
  - los parsea y los valida de nuevo contra el paquete, o contra un paquete mínimo reconstruido con `sha` y `archivos` si no hay paquete local;
  - escribe los informes y `decision.json`, e imprime la decisión;
  - si alguno no valida, sale con 3 («revisar de nuevo», paso R2 → R3).

  Casos en `.claude/revision/revision.test.ts`.
- [X] T031 [US4] Actualizar [specs/001-sincronizacion-backlog-github/contracts/comentarios.md](../001-sincronizacion-backlog-github/contracts/comentarios.md):
  - agregar la plantilla «Registro de revisión», que enlaza [contracts/informe.md](contracts/informe.md);
  - agregar la sección `## Revisiones` en «Cuerpo del pull request», entre «Trazabilidad» y «Verificación», según [contracts/ticket-abrir-pr.md](contracts/ticket-abrir-pr.md).
- [X] T032 [US4] Agregar a `.claude/flujo-github.md` la **Regla 7: registros de revisión**, con el texto de [contracts/ticket-abrir-pr.md](contracts/ticket-abrir-pr.md), y la mención en «Constantes» del prefijo de marcador `crediagil:revision=`. Agregar a `.claude/skills/ticket-abrir-pr/SKILL.md` los pasos **R1, R2 y R6** de [contracts/ticket-abrir-pr.md](contracts/ticket-abrir-pr.md): búsqueda de registros por `sha`, reutilización con `revision.ts reutilizar` y publicación idempotente de los comentarios que genera `decidir`. Agregar también la sección `## Revisiones` del cuerpo del PR. T026 ya agregó R3, R4, R5 y R7.

**Checkpoint**: el registro es completo, idempotente y reutilizable.

---

## Phase 7: User Story 5 - Mecanismos explícitos y decisiones registradas (Priority: P3)

**Goal**: los mecanismos cumplen el mínimo del enunciado y cada uno queda en `DECISIONES.md`.

**Independent Test**: [quickstart.md](quickstart.md), Escenario 5; lectura de `DECISIONES.md`.

- [X] T033 [P] [US5] Ampliar `.claude/hooks/lib/sin-datos-reales.test.ts` para que recorra también `.claude/revision/**/*.ts`, `.claude/agents/*.md` y `.claude/skills/revisar-*/SKILL.md` (FR-012).
- [X] T034 [P] [US5] Agregar `.claude/revision/mecanismos.test.ts`, que lee el frontmatter de los archivos y comprueba (FR-013):
  - hay 2 subagentes con `tools: Read, Grep, Glob` y `Write`, `Bash` y `mcp__*` en `disallowedTools`;
  - hay 2 skills con `context: fork`, `allowed-tools`, `argument-hint`, `user-invocable: false` y un `agent` que existe en `.claude/agents/`.
- [X] T035 [US5] Agregar al **principio** de `DECISIONES.md` la entrada `## 2026-10-16 · Revisión independiente y de cumplimiento antes del pull request`, con enlace al issue #6 y a [research.md](research.md):
  - las decisiones ★ (R1 a R7 y R9), cada una con su motivo, la alternativa descartada y sus consecuencias;
  - riesgos residuales: redirecciones de shell sobre `.git/crediagil/`, la calidad de la clasificación del modelo y, si aplicó, la alternativa de R3.

  Sigue el formato de las entradas del #3, el #4 y el #5 (FR-014, SC-007).

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T036 Comprobar que `npm test`, `npm run typecheck` y `npm run format:check` están en verde. Medir el guardián sobre un `mcp__github__create_pull_request` típico: el objetivo sigue siendo menos de 300 ms.
- [X] T037 Declarar en `.claude/settings.json`:
  - el bloque `SubagentStop` exacto de [contracts/revisores.md](contracts/revisores.md);
  - el matcher del guardián ampliado con `Glob|Agent|WebFetch|WebSearch`.

  Conservar lo demás y validar el JSON. **Se hace al final**, con las pruebas en verde (riesgos del plan).
- [ ] T038 Validación manual en una **sesión nueva** de Claude Code: Escenarios 0, 1 y 2 de [quickstart.md](quickstart.md).
  - El Escenario 0 se ejecuta con el paquete **real** del ticket y anota los turnos que usa cada revisor. Si alguno agota `maxTurns` o queda cerca del límite, subirlo en `.claude/agents/revisor-codigo.md` y `.claude/agents/revisor-cumplimiento.md` y registrarlo en `DECISIONES.md` antes de T041 (R8).
  - Si el Escenario 0 falla, aplicar la alternativa de R3 en `.claude/skills/ticket-abrir-pr/SKILL.md` y registrarla en `DECISIONES.md` antes de seguir.
  - Al final, borrar la rama local `6-prueba-cumplimiento` y los paquetes de prueba de `.git/crediagil/revisiones/`.
- [ ] T039 Validación manual del Escenario 3, pasos 2 y 3, de [quickstart.md](quickstart.md): crear el PR o escribir `decision.json` directamente se niega.
- [X] T040 Commit convencional en `6-revision-independiente-y-de-cumplimiento`, por ejemplo `feat: revisión independiente y de cumplimiento antes del PR (#6)`. Antes:
  - `git status`, para confirmar que no entra ningún `.env`, archivo temporal, `.git/crediagil/` ni `node_modules/`;
  - la búsqueda de tokens del quickstart del #3.
- [ ] T041 Con confirmación del desarrollador: `git push -u origin 6-revision-independiente-y-de-cumplimiento` y `/ticket-abrir-pr 6`. Es la validación de punta a punta (Escenarios 3, paso 4, y 4): las revisiones se ejecutan sobre el head remoto, se registran en el issue y solo entonces se abre el PR. Ejecutarlo una segunda vez para comprobar la idempotencia (↺, sin duplicados).
- [ ] T042 Con confirmación del desarrollador: `/ticket-cerrar`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T003)** → **Foundational (T004–T009)** → historias.
- **US1 (T010–T016)** y **US2 (T017–T020)** dependen solo de la Fase 2. T020 completa `capturar.test.ts`, así que va después de T011.
- **US3 (T021–T027)**: `decidir` usa los tipos de informe de US1 y US2; `puerta-pr` solo necesita la Fase 2.
- **US4 (T028–T032)**: T029 extiende `decidir` (T023); T032 completa la skill de T026.
- **US5**: T033 y T034 requieren los archivos de US1 a US4; T035 puede escribirse en cualquier momento, aunque conviene al final.
- **T037** (activar `SubagentStop` y ampliar el matcher) requiere T036 en verde. **T038 y T039** requieren T037 y una sesión nueva.
- **T040 → T041 → T042**, en ese orden.

### User Story Dependencies

- **US1 (P1)**: independiente. Es el MVP.
- **US2 (P1)**: independiente de US1, salvo `capturar.ts` (T011), que comparten.
- **US3 (P2)**: requiere los informes de US1 y US2 para decidir.
- **US4 (P2)**: requiere la decisión de US3.
- **US5 (P3)**: requiere US1 a US4.

### Within Each User Story

Prueba en rojo → implementación en verde → registro en el guardián o en el CLI, con su prueba de proceso. Los archivos `.md` de subagentes y skills se escriben cuando su módulo de validación ya existe.

### Parallel Opportunities

- T002 junto con T001.
- T004/T005, T006/T007, T008 y T009: archivos distintos.
- En US1: T012 y T014 y T015, mientras se hacen T010 y T011.
- En US3: T021 y T024 (decisión y guardián) en paralelo.
- US1 y US2 pueden avanzar en paralelo después de la Fase 2, coordinando `capturar.ts` e `informe.ts`.

---

## Parallel Example: tras la Fase 2

```text
Task: "T010 [US1] capturar.test.ts → T011 capturar.ts"
Task: "T012 [US1] revisores.test.ts → T013 revisores.ts"
Task: "T014 [US1] .claude/agents/revisor-codigo.md"
Task: "T015 [US1] .claude/skills/revisar-codigo/SKILL.md"
Task: "T017 [US2] informe.test.ts (cumplimiento) → T018"
# Después, en secuencia en guardian.ts: T013 → T025
```

---

## Implementation Strategy

### MVP First (US1)

1. T001–T003 (setup) → T004–T009 (paquete, informe y tipos del guardián).
2. T010–T016: revisor de código, captura y solo lectura.
3. **Parar y validar**: `npm test` en verde; con `preparar --local` y la skill `revisar-codigo` se obtiene un informe validado (Escenario 0, tras activar `SubagentStop`).

### Incremental Delivery

1. MVP: US1.
2. US2: revisor de cumplimiento (T017–T020).
3. US3: decisión y puerta (T021–T027).
4. US4: registro, reutilización y PR (T028–T032).
5. US5: comprobaciones de mecanismos y decisiones (T033–T035).
6. Activación, validación manual y cierre (T036–T042).
