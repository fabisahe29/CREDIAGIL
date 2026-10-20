---

description: "Tareas del paquete de entrega (#19)"
---

# Tasks: Paquete de entrega

**Input**: documentos de diseño en `/specs/017-paquete-de-entrega/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: se incluyen porque el plan los pide para el módulo `src/entrega/` y para los documentos que tienen reglas medibles (README y `DECISIONES.md`). Todos corren con `npm test`, sin red ni modelo. Los datos con forma de secreto de las pruebas se construyen en tiempo de ejecución, nunca literales (regla de `.claude/rules/tests.md`).

**Organization**: las tareas se agrupan por historia de usuario. Las rutas son relativas a la raíz del repositorio.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencia de tareas incompletas)
- **[Story]**: historia de la spec (US1 a US6)
- Convenciones del repositorio: TypeScript `strict`, sin `any` sin justificación escrita, comentarios y mensajes en español, pruebas con `node:test` junto al archivo (`*.test.ts`), commits `tipo: … (#19)`
- Las acciones sobre GitHub (estado de tickets, comentarios) se hacen solo con herramientas `mcp__github__*` (Regla 1 de `.claude/flujo-github.md`)

## Phase 1: Setup

**Purpose**: andamiaje mínimo del módulo nuevo

- [x] T001 Agregar a `package.json` los scripts `"entrega:armar": "node src/entrega/principal.ts armar"` y `"entrega:verificar": "node src/entrega/principal.ts verificar"`, y comprobar que `tsconfig.json` incluye `src/entrega/`
- [x] T002 [P] Agregar `*.zip` a `.gitignore` (la carpeta `dist/` ya está ignorada) para que ningún `.zip` se versione por error
- [x] T003 [P] Crear la carpeta `src/entrega/`

---

## Phase 2: Foundational (bloquea las historias que tocan `src/entrega/`)

**Purpose**: tipos del informe y comprobación de los límites del lector de `.zip`, que usan US5 y US3

**⚠️ CRÍTICO**: US5 y US3 no pueden empezar hasta terminar esta fase. US1, US2, US4 y US6 no dependen de ella.

- [x] T004 Crear `src/entrega/tipos.ts` con los tipos de [data-model.md](data-model.md): `EntradaZip` (`ruta` con `/`, `tamano` entero en bytes sin comprimir, `contenido` en bytes), `Hallazgo` con `tipo` cerrado a `nombre-prohibido` · `falta-git` · `peso` · `secreto` · `spec-incompleta` · `historial`, `ubicacion` y `detalle` («nunca incluye el valor del secreto, solo su tipo»), e `InformeEntrega` con `zip`, `tamanoBytes` («debe ser ≤ 50 MB»), `comprobaciones` (`estado`: `ok` · `hallazgos` · `no verificable`), `hallazgos` y `veredicto` (`listo` · `bloqueado` · `incompleto`). Reglas verbatim: «un hallazgo de cualquier tipo deja el veredicto en `bloqueado`»; «"no verificable" nunca cuenta como éxito: deja el veredicto en `incompleto`»; una función `veredictoDe(comprobaciones, hallazgos)` aplica esas dos reglas
- [x] T005 [P] Crear `src/entrega/tipos.test.ts`: sin hallazgos y todo `ok` da `listo`; un hallazgo da `bloqueado`; una comprobación `no verificable` sin hallazgos da `incompleto`; un hallazgo y una `no verificable` dan `bloqueado`

**Checkpoint**: tipos listos; US5 puede empezar.

---

## Phase 3: User Story 1 - Correr el agente y las pruebas en menos de cinco minutos desde el README (Priority: P1) 🎯 MVP

**Goal**: el README abre con un «Inicio rápido» que lleva de un clon limpio al agente y las pruebas corriendo, con los enlaces al GitHub Project y al video.

**Independent Test**: una persona ajena sigue solo el README y mide el tiempo (paso 1 de [quickstart.md](quickstart.md)); además, una prueba comprueba que los enlaces y los comandos están.

### Tests for User Story 1

- [x] T006 [P] [US1] Crear `src/entrega/readme.test.ts`: lee `README.md` y comprueba que (a) tiene la sección «Inicio rápido» antes de «Requisitos»; (b) esa sección contiene `npm install`, `npm test` y `npm run casos`; (c) enlaza el GitHub Project (`https://github.com/users/fabisahe29/projects/1`) y el video (enlace de Google Drive ya presente); (d) dice qué se puede ejecutar sin credenciales y qué exige `ANTHROPIC_API_KEY`; (e) no contiene la cadena de ningún valor de secreto (usa los detectores de T014 una vez exista, o una expresión local mientras tanto)

### Implementation for User Story 1

- [x] T007 [US1] Editar `README.md`: agregar la sección «Inicio rápido» justo después de la introducción y antes de «Requisitos», con (1) los enlaces al GitHub Project y al video de funcionamiento (el enlace de Drive que hoy está en «Reproducir un caso en el chat»); (2) el camino sin credenciales: `npm install`, `npm test`, `npm run casos`; (3) el camino con credenciales: `ANTHROPIC_API_KEY` en la sesión y `npm run chat`; (4) una frase que diga qué no necesita credenciales. Sin repetir el detalle de las secciones siguientes: se enlaza a ellas
- [x] T008 [US1] Mover el enlace del video a una sola fuente: en «Reproducir un caso en el chat» dejar una referencia al «Inicio rápido» en lugar de repetir el enlace, de modo que el enlace del video aparezca una vez. Depende de T007

**Checkpoint**: US1 verificable por la prueba T006 y por el cronómetro del quickstart.

---

## Phase 4: User Story 2 - Entender las decisiones del ecosistema en dos páginas (Priority: P1)

**Goal**: `DECISIONES.md` es un resumen de máximo 1000 palabras con las 11 necesidades y el registro detallado se conserva, sin cambios, en `docs/registro-decisiones.md`.

**Independent Test**: `npm test` pasa la prueba que cuenta palabras y valida las 11 secciones y los enlaces ([contracts/decisiones.md](contracts/decisiones.md)).

### Tests for User Story 2

- [x] T009 [P] [US2] Crear `src/entrega/decisiones.test.ts`: lee `DECISIONES.md` y comprueba que (a) tiene como máximo 1000 palabras; (b) tiene exactamente 11 secciones `## N. …` numeradas de 1 a 11; (c) cada sección tiene las etiquetas **Mecanismo**, **Por qué**, **Descartado** y **Detalle**; (d) cada enlace de **Detalle** apunta a un archivo que existe; (e) enlaza a `docs/registro-decisiones.md`. Otra prueba comprueba que `docs/registro-decisiones.md` existe y empieza con el mismo encabezado «Registro de decisiones» que tenía `DECISIONES.md`

### Implementation for User Story 2

- [x] T010 [US2] Mover el registro: `git mv DECISIONES.md docs/registro-decisiones.md` sin cambiar su contenido, salvo las rutas relativas de sus enlaces (ahora está en `docs/`: `specs/…` pasa a `../specs/…`). No reescribe el historial
- [x] T011 [US2] Crear el nuevo `DECISIONES.md` en la raíz con la estructura de [contracts/decisiones.md](contracts/decisiones.md): una introducción de una o dos frases que enlaza a `docs/registro-decisiones.md`, y las 11 secciones con la numeración y la redacción del enunciado ([spec.md](spec.md#las-11-necesidades)). Para cada una, el mecanismo real que usa el repositorio (léelo de `.claude/`, `.specify/`, `.mcp.json`, `specs/` y `docs/`; el plugin está en la rama del #18, enlázalo a su spec `specs/016-plugin-reutilizable-equipos/` solo si ya está fusionada, y si no, a su issue #18), el motivo, la alternativa descartada y el enlace de **Detalle** a la spec, plan o investigación que la respalda. Depende de T010
- [x] T012 [P] [US2] Actualizar las tres referencias a `DECISIONES.md` (FR-006a): en `CLAUDE.md` la fila del mapa («Resumen de decisiones por necesidad; el detalle por ticket está en `docs/registro-decisiones.md`»), en `.claude/rules/specs.md` la línea «Las decisiones del plan… se registran también en `docs/registro-decisiones.md`», y en `README.md` el enlace de la introducción (resumen en `DECISIONES.md`, detalle en `docs/registro-decisiones.md`). Depende de T010
- [x] T013 [P] [US2] Agregar `"docs/registro-decisiones.md"` a la lista `REVISADOS` de `.claude/hooks/lib/sin-datos-reales.test.ts` (junto a `"DECISIONES.md"`, que se conserva) para que el registro movido siga cubierto por la prueba de datos con forma real. Depende de T010
- [x] T014 [US2] Registrar en `docs/registro-decisiones.md` una entrada nueva al principio («2026-10-19 · Paquete de entrega», con enlace al #19 y a [research.md](research.md)) con las decisiones R1 a R9, cada una con su alternativa descartada, en el formato de las entradas existentes. Depende de T010

**Checkpoint**: US2 verificable por T009; el registro detallado queda íntegro.

---

## Phase 5: User Story 5 - Armar el `.zip` de entrega sin secretos ni dependencias (Priority: P1)

**Goal**: `npm run entrega:armar` arma el `.zip` y `npm run entrega:verificar` lo revisa, informa los hallazgos sin mostrar valores y bloquea la entrega si hay alguno.

**Independent Test**: se arma el `.zip` y se verifica (paso 5 de [quickstart.md](quickstart.md)); las pruebas cubren un `.zip` con `.env` y otro con un token generado en ejecución.

### Tests for User Story 5

- [x] T015 [P] [US5] Crear `src/entrega/zip.test.ts`: lo que `escribirZip` escribe lo lee `leerZip` con las mismas rutas (con `/`), tamaños y contenido; una entrada de más de un bloque se comprime y se descomprime; una ruta con tildes o espacios se conserva; un archivo que no es `.zip` o está truncado lanza un error tipado con causa (no se silencia)
- [x] T016 [P] [US5] Crear `src/entrega/contenido.test.ts`: por cada nombre prohibido (`.env`, `.env.local`, `a/.env.production`, `node_modules/x/y.js`, `dist/a.js`, `logs/a.jsonl`, `CLAUDE.local.md`, `.claude/settings.local.json`) hay un hallazgo `nombre-prohibido`; `.env.example` y `src/a.ts` no lo disparan. Por cada detector (token de GitHub, clave de la API de Claude, `Authorization: Bearer` con valor, `GIT_HUB=` y `ANTHROPIC_API_KEY=` con valor, bloque de clave privada, credenciales dentro de una URL) hay un texto positivo **construido en tiempo de ejecución** (por ejemplo `"ghp_" + "x".repeat(36)`) y uno negativo; la plantilla `.env.example` real del repositorio (variables sin valor) no dispara ninguno; el `detalle` del hallazgo nunca contiene el valor construido

### Implementation for User Story 5

- [x] T017 [P] [US5] Crear `src/entrega/zip.ts` con `escribirZip(destino, entradas)` y `leerZip(origen)` usando solo `node:zlib` y `node:fs` (método `deflate` y directorio central; rutas siempre con `/`). Sin dependencias nuevas. Errores tipados con causa
- [x] T018 [P] [US5] Crear `src/entrega/contenido.ts` con `nombreProhibido(ruta)` y `detectarSecretos(texto)` según [contracts/comando-entrega.md](contracts/comando-entrega.md): nombres `.env` y `.env.*` salvo `.env.example`, `node_modules/`, `dist/`, `logs/`, `CLAUDE.local.md` y `.claude/settings.local.json`; detectores de token de GitHub (`ghp_…`, `github_pat_…`), clave `sk-ant-…`, `Authorization: Bearer` con valor literal, `GIT_HUB=` o `ANTHROPIC_API_KEY=` con valor no vacío, clave privada y credenciales en URL. Devuelven tipo y posición, **nunca el valor**. `esTexto(bytes)` decide qué entradas se escanean (las binarias se omiten)
- [x] T019 [US5] Crear `src/entrega/armar.ts`: `listaDeArchivos()` = `git ls-files` más todo `.git/` (con `/` y sin los archivos prohibidos); se niega con un error tipado si `git status --porcelain` no está vacío; `armar(salida)` lee los archivos y llama a `escribirZip`. Ruta por defecto `dist/crediagil-entrega.zip`. Solo lee `git`, no cambia el historial. Depende de T017
- [x] T020 [P] [US5] Crear `src/entrega/armar.test.ts` en un repositorio temporal creado por la propia prueba: el `.zip` incluye lo versionado y `.git/`, no incluye un `.env` sin versionar ni `node_modules/`, y se niega a armar con un cambio sin commit. Depende de T019
- [x] T021 [US5] Crear `src/entrega/verificar.ts` con las comprobaciones `nombres`, `git` (existe `.git/HEAD`), `peso` («el `.zip` pesa 50 MB o menos») y `secretos` (escanea los archivos de texto del `.zip`), más `historial`: aplica `detectarSecretos` al texto de `git log --all -p` y comprueba `git merge-base --is-ancestor origin/main HEAD`; sin `origin/main` el estado es `no verificable`, no `ok`. Devuelve un `InformeEntrega` (T004). Depende de T017, T018 y T004
- [x] T022 [P] [US5] Crear `src/entrega/verificar.test.ts`: un `.zip` válido da `listo`; con un `.env` da `bloqueado` y un hallazgo `nombre-prohibido`; con un archivo que contiene un token construido en ejecución da `bloqueado`, hallazgo `secreto`, y el informe impreso no contiene el valor; sin `.git/` da `falta-git`; de más de 50 MB (simulado con un tamaño declarado, sin escribir 50 MB) da `peso`; sin `origin/main` da `incompleto`. Depende de T021
- [x] T023 [US5] Crear `src/entrega/principal.ts`: CLI con `armar [--salida <ruta>]` y `verificar [--zip <ruta>] [--json]`, con los códigos de salida de [contracts/comando-entrega.md](contracts/comando-entrega.md) (0 listo, 1 bloqueado, 2 opciones inválidas o `.zip` ilegible, 3 incompleto) y la salida de una línea por comprobación, sin mostrar valores. Depende de T019 y T021
- [x] T024 [P] [US5] Crear `src/entrega/principal.test.ts`: opciones inválidas dan 2; cada veredicto da su código; la salida de `--json` es el `InformeEntrega`. Depende de T023
- [x] T025 [US5] Ejecutar de verdad `npm run entrega:armar` y `npm run entrega:verificar` sobre el repositorio con el árbol limpio y anotar en el PR el veredicto, el tamaño y cualquier hallazgo real; si hay un hallazgo real, no lo ocultes ni reescribas el historial: repórtalo. Depende de T023 y de los commits de las historias anteriores

**Checkpoint**: US5 verificable con el comando y las pruebas.

---

## Phase 6: User Story 3 - Revisar los artefactos de Spec Kit versionados (Priority: P2)

**Goal**: la verificación reporta, por carpeta de `specs/`, los artefactos que faltan, y confirma la constitución.

**Independent Test**: `npm run entrega:verificar` muestra la comprobación `specs` en `ok` sobre el repositorio, y las pruebas cubren una carpeta incompleta.

### Tests for User Story 3

- [x] T026 [P] [US3] Crear `src/entrega/specs.test.ts` sobre carpetas temporales: una carpeta completa (`spec.md`, `plan.md`, `tasks.md`, con la línea `**Issue de origen**`) no da hallazgos; sin `tasks.md` da un hallazgo `spec-incompleta` con la carpeta y el archivo; sin la línea de issue de origen también; sin `constitution.md` también; una numeración con huecos (001, 002, 004) no da hallazgo

### Implementation for User Story 3

- [x] T027 [US3] Crear `src/entrega/specs.ts` con `verificarSpecs(raiz)`: por cada carpeta de `specs/` exige `spec.md`, `plan.md`, `tasks.md` y la línea `**Issue de origen**` en `spec.md`, y exige `.specify/memory/constitution.md`. La numeración puede tener huecos. Devuelve hallazgos `spec-incompleta` con carpeta y archivo. Depende de T004
- [x] T028 [US3] Agregar la comprobación `specs` a `src/entrega/verificar.ts` y a la salida de `src/entrega/principal.ts`, usando `verificarSpecs`, con el `.zip` o el repositorio como fuente según el contrato. Depende de T027 y T021

**Checkpoint**: US3 verificable por el comando y T026.

---

## Phase 7: User Story 4 - Ver el video de funcionamiento sin pedir acceso (Priority: P1)

**Goal**: el video enlazado en el README dura 5 minutos o menos, muestra los siete casos y se abre sin sesión.

**Independent Test**: lista manual del paso 4 de [quickstart.md](quickstart.md). El video lo graba y publica la persona que entrega: ninguna herramienta puede comprobarlo de forma fiable ([research.md](research.md), R9).

- [ ] T029 [US4] Verificación manual del video por el desarrollador: abrir el enlace del README en una ventana de incógnito (se reproduce sin pedir acceso), medir la duración (5:00 o menos) y comprobar que aparecen los siete casos con su número y su resultado, según la numeración del README («Casos obligatorios»). Anotar el resultado en la descripción del PR. Si falla algo, regrabar o cambiar los permisos y actualizar el enlace en `README.md` (una sola fuente, T008) **Pendiente de la persona que entrega: no lo puede hacer la sesión (no abre Drive sin sesión).**
- [ ] T030 [US4] Si el video se regraba, actualizar el enlace en `README.md` y volver a ejecutar `npm test` (la prueba T006 comprueba que el enlace sigue presente). Solo si T029 lo exige **No aplica por ahora: depende del resultado de T029.**

**Checkpoint**: US4 verificada y registrada en el PR.

---

## Phase 8: User Story 6 - Dejar cada ticket del Project en Done o con su estado real explicado (Priority: P2)

**Goal**: cada ticket del Project queda en Done o con un comentario que explica su estado real.

**Independent Test**: al listar el Project, 0 tickets sin Done y sin el comentario `crediagil:entrega=estado` (paso 6 de [quickstart.md](quickstart.md)).

**⚠️ Momento**: esta fase se ejecuta al final, cuando ya está abierto el PR de este ticket y los demás tienen su estado definitivo. Todo por herramientas `mcp__github__*`.

- [x] T031 [US6] Listar todos los tickets del Project con `mcp__github__projects_list` (`list_project_items`, `owner: fabisahe29`, `project_number: 1`, `query: "is:issue"`, `field_names: ["Status"]`, `perPage: 50`, paginando mientras `pageInfo.hasNextPage`) y construir la tabla ticket → estado. No cambia nada
- [x] T032 [US6] Por cada ticket que no esté en Done, leer sus comentarios (`mcp__github__issue_read`, `get_comments`, `perPage: 100`) y, si no tiene el marcador `<!-- crediagil:entrega=estado -->`, publicar con `mcp__github__add_issue_comment` el comentario de [contracts/estado-tickets.md](contracts/estado-tickets.md) con su estado real, lo que falta y el motivo, con enlace al PR si existe. No cambia el estado del ticket. Los tickets conocidos al planificar: #18 (In review, PR #37) y este #19 (en revisión cuando se abra el PR; se cierra con `/ticket-cerrar`). Depende de T031
- [x] T033 [US6] Releer el Project y confirmar que 0 tickets están sin Done y sin comentario de estado; dejar la tabla final en la descripción del PR. Depende de T032

**Checkpoint**: US6 verificada.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T034 [P] Agregar a `CLAUDE.md` (mapa del repositorio) la fila de `src/entrega/` («Armado y verificación del `.zip` de entrega: `npm run entrega:armar` y `entrega:verificar` (#19)») y a `README.md` («Estructura») la fila equivalente
- [x] T035 [P] Documentar en `README.md`, sección «Pruebas», los comandos de entrega y cómo leer su veredicto (código de salida 0, 1, 2 y 3), con enlace a [contracts/comando-entrega.md](contracts/comando-entrega.md)
- [x] T036 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check`, y corregir lo que falle. Ningún cambio se integra con pruebas en rojo
- [ ] T037 Validar [quickstart.md](quickstart.md) de punta a punta (pasos 1 a 6) y anotar el resultado y el tiempo del paso 1 en la descripción del PR **Hecho: pasos 1 (clon limpio: 46 s + 49 s + 5 s = 100 s), 2, 3, 5 y 6. Falta el paso 4 (video, T029).**
- [x] T038 Preparar los commits de entrega con mensajes `tipo: … (#19)`. No se reescribe el historial (sin `rebase`, `amend` de commits publicados ni `push --force`). El `.zip` final se arma después de fusionar este PR y el #18, desde `main` con el árbol limpio

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; bloquea US5 y US3.
- **US1 (Phase 3)**, **US2 (Phase 4)**, **US4 (Phase 7)** y **US6 (Phase 8)**: no dependen de la Phase 2. US1 y US2 pueden hacerse en paralelo y solo comparten `README.md` (T007, T008 y T012 tocan el mismo archivo: hacerlos en ese orden).
- **US5 (Phase 5)**: depende de la Phase 2.
- **US3 (Phase 6)**: depende de US5 (T028 modifica `verificar.ts` y `principal.ts`).
- **US6 (Phase 8)**: al final, con el PR abierto.
- **Polish (Phase 9)**: depende de las historias que se quieran entregar.

### Within Each User Story

- Las pruebas se escriben antes y deben fallar antes de implementar.
- En US5: tipos → `zip.ts` y `contenido.ts` → `armar.ts` y `verificar.ts` → `principal.ts` → ejecución real.
- En US2: `git mv` antes de crear el nuevo `DECISIONES.md` y de actualizar referencias.

### Parallel Opportunities

- T002 y T003; T006 con T009; T015, T016, T017 y T018 (cuatro archivos distintos); T020, T022 y T024 tras sus implementaciones; T012, T013 y T014 tras T010.

---

## Parallel Example: User Story 5

```text
# Pruebas y módulos independientes juntos:
Task: "Crear src/entrega/zip.test.ts"
Task: "Crear src/entrega/contenido.test.ts"
Task: "Crear src/entrega/zip.ts"
Task: "Crear src/entrega/contenido.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 y 2)

1. Setup (Phase 1).
2. US1: README con «Inicio rápido» y su prueba.
3. US2: `DECISIONES.md` de dos páginas y registro movido.
4. **Parar y validar**: `npm test` y el cronómetro de los cinco minutos.

### Incremental Delivery

1. Setup + Foundational.
2. US1 y US2 (documentos, bajo riesgo).
3. US5 (el `.zip`: el riesgo de mayor costo) y luego US3.
4. US4 (manual) y US6 (al final, con el PR abierto).
5. Polish, quickstart completo y PR con `/ticket-abrir-pr`.

## Notes

- El #18 sigue en revisión: `specs/016-plugin-reutilizable-equipos/` no está en esta rama, y la verificación de `specs/` no exige numeración continua. Se repite `npm run entrega:verificar` en `main` cuando el #18 se fusione.
- El `.zip` y el video quedan fuera del repositorio: solo se versionan las herramientas de verificación y el enlace al video.
- Cada hallazgo real se reporta; ninguna tarea borra, oculta ni reescribe nada por su cuenta.
