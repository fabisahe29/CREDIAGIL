---

description: "Lista de tareas: guardarraíles del repositorio con hooks"
---

# Tasks: Guardarraíles del repositorio con hooks

**Input**: documentos de diseño en `specs/003-guardarrailes-hooks/`

**Issue de origen**: [fabisahe29/CREDIAGIL#5](https://github.com/fabisahe29/CREDIAGIL/issues/5)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/hooks.md](contracts/hooks.md), [contracts/convencion-datos-ficticios.md](contracts/convencion-datos-ficticios.md), [quickstart.md](quickstart.md)

**Tests**: la spec **exige** pruebas (FR-017, FR-018). Cada control se escribe primero como prueba (en rojo) y después se implementa (en verde), con `node --test`. Las validaciones manuales del quickstart van al final, después de activar los hooks.

**Organization**: las tareas se agrupan por historia de usuario. US1 a US4 dependen solo de la Fase 2 y son independientes entre sí, salvo el registro de cada control en `guardian.ts`, que es secuencial.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US5)

## Path Conventions

- Hooks en `.claude/hooks/`, con módulos en `.claude/hooks/lib/` y cada `*.test.ts` junto a su archivo (regla de tests).
- Nada va en `src/`: los hooks no son código de producción (aclaración Q1).

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable (sin `enum`, `namespace` ni propiedades de parámetro), imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Ningún archivo contiene un dato con forma real literal** (FR-018). Las pruebas generan tarjetas con un helper que calcula el dígito Luhn, y arman cédulas, NIT y cuentas por concatenación en tiempo de ejecución.
- Los bloqueos devuelven el tipo `Bloqueo` de `lib/bloqueo.ts`; nunca se imprime un dato completo, solo sus últimos 4 dígitos.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Crear `package.json` en la raíz según [contracts/hooks.md](contracts/hooks.md), sección "Scripts":
  - `"name": "crediagil"`, `"private": true`, `"type": "module"`, `"engines": {"node": ">=22.18"}`;
  - scripts: `test` = `node --test ".claude/hooks/**/*.test.ts"`, `typecheck` = `tsc --noEmit`, `format` = `prettier --write .`, `format:check` = `prettier --check .`;
  - `devDependencies`: `prettier`, `typescript` (5.8 o superior, por `erasableSyntaxOnly`) y `@types/node`.
- [X] T002 [P] Crear `tsconfig.json` con `strict: true`, `noEmit: true`, `erasableSyntaxOnly: true`, `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`, `module: "nodenext"`, `target: "es2023"`, `types: ["node"]` e `include: [".claude/hooks/**/*.ts"]` (R8).
- [X] T003 [P] Crear `.prettierrc.json` con `{"printWidth": 100}` y `.prettierignore` con `*.md`, `specs/`, `.specify/`, `node_modules/` y `package-lock.json` (R10).
- [X] T004 Ejecutar `npm install`, versionar `package-lock.json` y comprobar que `npm run typecheck` termina sin errores y que `npm test` corre aunque todavía no encuentre pruebas.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: el guardián que lee la entrada, falla cerrado y agrega bloqueos, todavía sin controles. Bloquea a todas las historias.

- [X] T005 [P] Prueba `.claude/hooks/lib/accion.test.ts` (en rojo) para `normalizarAccion(entrada: unknown)`:
  - una entrada sin `tool_name` o con `tool_input` que no es objeto lanza un error tipado;
  - Write extrae `content`; Edit, `new_string`; MultiEdit, cada `edits[].new_string`; NotebookEdit, `new_source`; Bash y PowerShell, `command`; una herramienta `mcp__*`, **todos** los valores de texto del objeto, incluidos los anidados;
  - las rutas `file_path`, `notebook_path` y `path` salen relativas a la raíz y con `/` aunque lleguen con `\` o absolutas (R6).
- [X] T006 [P] Prueba `.claude/hooks/lib/bloqueo.test.ts` (en rojo):
  - `enmascarar("…1234")` → `••••1234`;
  - `componerMensaje(bloqueos)` produce el formato de [contracts/hooks.md](contracts/hooks.md), "Mensaje de bloqueo", con los controles en orden fijo `secretos`, `datos-reales`, `spec-primero`, `error-interno` y la cuenta de motivos.
- [X] T007 [P] Implementar `.claude/hooks/lib/accion.ts`: tipo `Accion` con los campos de [data-model.md](data-model.md) ("Acción": `herramienta`, `rutas`, `textos`, `comando`), guardas de tipo propias sin Zod (Complexity Tracking del plan) y la normalización de T005. T005 en verde.
- [X] T008 [P] Implementar `.claude/hooks/lib/bloqueo.ts`: tipo `Bloqueo` con `control` de tipo `'datos-reales' | 'secretos' | 'spec-primero' | 'error-interno'`, `detectado`, `regla` y `correccion`, más `enmascarar` y `componerMensaje`. T006 en verde.
- [X] T009 Prueba `.claude/hooks/guardian.test.ts` (en rojo), que ejecuta `node .claude/hooks/guardian.ts` como proceso con un JSON por stdin:
  - con `{}`, sale con 0 y responde `permissionDecision: "deny"` con el control `error-interno` (FR-015);
  - con un `Read` normal, sale con 0 sin imprimir nada.
- [X] T010 Implementar `.claude/hooks/guardian.ts`:
  - lee stdin, normaliza con `accion.ts` y recorre una lista `CONTROLES` (vacía por ahora) de funciones `(accion, contexto) => Bloqueo[]`;
  - si hay bloqueos, imprime el JSON *deny* de [contracts/hooks.md](contracts/hooks.md) con `componerMensaje`;
  - envuelve todo en `try/catch`: cualquier error → *deny* `error-interno` con la causa (R5);
  - `contexto` incluye `raiz` (`CLAUDE_PROJECT_DIR` o `cwd`) y una función `obtenerRama()` inyectable para las pruebas.

  T009 en verde.

**Checkpoint**: `npm test` y `npm run typecheck` en verde; el guardián responde, pero todavía no bloquea nada.

---

## Phase 3: User Story 1 - Ningún dato con forma real entra al repositorio (Priority: P1) 🎯 MVP

**Goal**: bloquear tarjetas, cédulas, NIT y cuentas con forma real en archivos, comandos y textos MCP; aceptar la convención `000` y los montos.

**Independent Test**: `npm test` cubre los casos de [contracts/convencion-datos-ficticios.md](contracts/convencion-datos-ficticios.md); el guardián como proceso bloquea un Write con una tarjeta Luhn generada y permite un monto.

- [X] T011 [P] [US1] Prueba `.claude/hooks/lib/convencion-ficticia.test.ts` (en rojo):
  - `esFicticio(digitos)` es verdadero si los dígitos empiezan por `000`;
  - la prueba de sincronía falla si una palabra clave de `PALABRAS_CLAVE` o el prefijo `000` no aparecen en `docs/datos-ficticios.md`.
- [X] T012 [P] [US1] Crear `docs/datos-ficticios.md`, la convención para personas, con el contenido de [contracts/convencion-datos-ficticios.md](contracts/convencion-datos-ficticios.md):
  - la regla del prefijo `000`;
  - la tabla de ejemplos ficticios;
  - las palabras clave por tipo;
  - los casos que pasan.

  **No** incluye los casos que se bloquean con valores.
- [X] T013 [US1] Implementar `.claude/hooks/lib/convencion-ficticia.ts`: `PREFIJO_FICTICIO = '000'` y `PALABRAS_CLAVE` por tipo, exactamente las del contrato:
  - **cédula**: `CC`, en mayúsculas y como palabra completa, `C.C.`, `cédula`, `cedula`, `documento de identidad` y `número de documento`;
  - **NIT**: `NIT`, como palabra completa;
  - **cuenta**: `cuenta`, `IBAN`, `número de cuenta` y `nro. de cuenta`.

  Además, `esFicticio`. T011 en verde.
- [X] T014 [US1] Prueba `.claude/hooks/lib/datos-reales.test.ts` (en rojo), con un helper `tarjetaLuhn(base)` que calcula el dígito de control:
  - **se bloquean**: una tarjeta de 16 dígitos sin separadores, otra con espacios y otra con guiones; una cédula de 8 y otra de 10 dígitos con `cédula`/`CC`; un `NIT` de 9 dígitos con DV; una `cuenta` de 10 y otra de 20 dígitos; y la línea "la cuenta tiene saldo de" con 10 dígitos;
  - **pasan**:
    - al menos 10 montos del dominio en sus formatos (`5_000_000`, `$5.000.000 COP`, `5000000`, `285.432`, `1.250.000,50`, etc.);
    - una frase con la palabra de cuenta y un monto de 7 dígitos;
    - un número de 16 dígitos que **no** pasa Luhn;
    - los identificadores ficticios con prefijo `000` de cada tipo;
  - el bloqueo informa el tipo, el archivo y la línea, y el dato enmascarado (SC-001, SC-003).
- [X] T015 [US1] Implementar `.claude/hooks/lib/datos-reales.ts`, un control que revisa `accion.textos` línea por línea según la tabla "Patrón de dato con forma real" de [data-model.md](data-model.md):
  - **tarjeta**: 13–19 dígitos, con espacio o guion como separador y Luhn válido, en cualquier contexto;
  - **cédula**: 6–10 dígitos, con punto de miles, cuando hay en la línea una palabra clave de documento;
  - **NIT**: 9 dígitos más DV, cuando hay `NIT` en la línea;
  - **cuenta**: 10–20 dígitos, cuando hay una palabra clave de cuenta.

  Excluye todo número con `esFicticio`. La corrección apunta a `docs/datos-ficticios.md`. T014 en verde.
- [X] T016 [US1] Registrar `datos-reales` en `CONTROLES` de `.claude/hooks/guardian.ts` y ampliar `.claude/hooks/guardian.test.ts`:
  - Write con una tarjeta Luhn generada → *deny* con `datos-reales`;
  - Bash `git commit -m` con esa tarjeta → *deny* (FR-002);
  - `mcp__github__add_issue_comment` con una cédula y su palabra clave → *deny*;
  - Write con `$5.000.000 COP` → permitido.
- [X] T017 [US1] Agregar a `.claude/rules/tests.md` una viñeta que enlace `docs/datos-ficticios.md` (ruta relativa `../../docs/datos-ficticios.md`) como la convención de identificadores ficticios, sin copiar su contenido.

**Checkpoint**: MVP. El guardián bloquea datos con forma real y deja pasar montos y datos ficticios.

---

## Phase 4: User Story 2 - Los secretos quedan fuera del alcance de Claude Code (Priority: P1)

**Goal**: ni las herramientas de archivos ni la shell pueden leer o modificar `.env`; `.env.example` sigue accesible.

**Independent Test**: `npm test` cubre al menos 6 vías de acceso (SC-002) con un `.env` temporal creado por la prueba en una carpeta temporal.

- [X] T018 [US2] Prueba `.claude/hooks/lib/secretos.test.ts` (en rojo), con una raíz temporal (`fs.mkdtemp`) que contiene `.env`, `config/.env.local`, `.env.example` y `src/a.ts`:
  - **se bloquean**:
    - herramientas de archivos: Read, Write y Edit sobre `.env` y `config/.env.local`; Grep con `path: ".env"`;
    - comandos que nombran el archivo (FR-006): Bash `cat .env`, `cp .env x`, `cat ./config/.env.local`, `cat .env*` y `cat .*`; PowerShell `Get-Content .env` y `type .env`;
    - comandos recursivos (FR-006a): `grep -r GIT_HUB .`, `rg --no-ignore GIT_HUB`, `rg -uu GIT_HUB` y `find . -type f -exec cat {} +`;
  - **pasan**: Read y Edit de `.env.example`; `grep -r cuota src/`; `grep -r GIT_HUB . --exclude='.env*'`; `rg GIT_HUB` (respeta `.gitignore`); `git grep GIT_HUB`; `cat src/a.ts`;
  - cada bloqueo recursivo sugiere `--exclude='.env*'` o limitar la carpeta.
- [X] T019 [US2] Implementar `.claude/hooks/lib/secretos.ts`:
  - **archivo protegido**: nombre `.env` o que empieza por `.env.`, salvo `.env.example` ([data-model.md](data-model.md));
  - **herramientas de archivos**: revisa `accion.rutas`;
  - **shell**: separa el comando en palabras respetando comillas y lo divide por `;`, `&&`, `||` y `|`. Bloquea cuando:
    - un argumento es un archivo protegido;
    - un comodín coincide con uno existente bajo `contexto.raiz`;
    - un comando recursivo (lista de R4) tiene en su alcance un archivo protegido existente y no lo excluye.

  T018 en verde.
- [X] T020 [US2] Registrar `secretos` en `CONTROLES` de `.claude/hooks/guardian.ts` y ampliar `.claude/hooks/guardian.test.ts` con un Read de `.env` → *deny* y un Read de `.env.example` → permitido.
- [X] T021 [US2] Agregar a `.claude/settings.json` el bloque `permissions.deny` exacto de [contracts/hooks.md](contracts/hooks.md), con las negaciones `!` para `.env.example`, conservando `enabledMcpjsonServers`. Validar el JSON con `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`.

**Checkpoint**: secretos protegidos por el guardián (probado) y por `deny` (se valida en T032).

---

## Phase 5: User Story 3 - No hay código de producción sin especificación (Priority: P2)

**Goal**: escribir bajo `src/` exige una spec cuyo `Issue de origen` coincide con el ticket de la rama.

**Independent Test**: `npm test` con una rama inyectada y una carpeta `specs/` temporal.

- [X] T022 [US3] Prueba `.claude/hooks/lib/spec-primero.test.ts` (en rojo), con una raíz temporal que tiene `specs/003-x/spec.md` con la línea `**Issue de origen**: [fabisahe29/CREDIAGIL#5 — …](…)`:
  - **se bloquean**:
    - con la rama `7-y`: Write de `src/a.ts` y de `src/politica/cuota.test.ts` (Q1), con un mensaje que nombra el #7 y `/speckit-specify`;
    - con `main` y con `003-x`: Write de `src/a.ts`, con un mensaje que sugiere `/ticket-tomar`;
    - con `7-y`: Bash `echo x > src/a.ts`, `cp a.ts src/` y PowerShell `Set-Content src/a.ts x`;
  - **pasan**: con `5-x`, Write de `src/a.ts`; con `7-y`, Write de `docs/x.md`, `.claude/hooks/x.ts` y `specs/007-y/spec.md`;
  - una spec sin la línea `Issue de origen` no habilita ningún ticket.
- [X] T023 [US3] Implementar `.claude/hooks/lib/spec-primero.ts`:
  - **ticket**: `contexto.obtenerRama()` con el patrón `^([1-9][0-9]*)-`;
  - **spec**: búsqueda en `specs/*/spec.md` de una línea que empieza por `**Issue de origen**: [fabisahe29/CREDIAGIL#N ` ([data-model.md](data-model.md), "Ticket y spec");
  - **dónde aplica**: rutas que empiezan por `src/`, y escrituras por shell hacia `src/` (`>`, `>>`, `tee`, `cp`/`mv` con destino en `src/`, `Set-Content`, `Out-File`, `New-Item`).

  La rama real se obtiene con `git branch --show-current` en `guardian.ts`. T022 en verde.
- [X] T024 [US3] Registrar `spec-primero` en `CONTROLES` de `.claude/hooks/guardian.ts` y ampliar `.claude/hooks/guardian.test.ts`: con una rama inyectada sin spec, Write en `src/` de un archivo con una tarjeta Luhn generada → **un** *deny* con los dos motivos, `datos-reales` y `spec-primero` (FR-014).

**Checkpoint**: los tres controles del guardián en verde.

---

## Phase 6: User Story 4 - El código queda formateado después de cada edición (Priority: P2)

**Goal**: Prettier se aplica al archivo editado; si falla, la edición se conserva y se informa.

**Independent Test**: `npm test` ejecuta el formateador como proceso sobre archivos temporales.

- [X] T025 [US4] Prueba `.claude/hooks/formatear.test.ts` (en rojo), que ejecuta `node .claude/hooks/formatear.ts` con un JSON de PostToolUse:
  - un `.ts` mal indentado queda formateado y sale con 0;
  - un `.md` queda igual y sale con 0, sin salida;
  - un `.ts` con error de sintaxis queda igual, sale con 2 y stderr empieza por `Formato omitido en`;
  - una ruta incluida en `.prettierignore` queda igual.
- [X] T026 [US4] Implementar `.claude/hooks/formatear.ts`:
  - si `tool_input.file_path` tiene extensión `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` o `.json`, carga Prettier con `import()` desde la raíz, respeta `.prettierrc.json` y `.prettierignore` (`getFileInfo`) y reescribe solo si cambia;
  - si falta Prettier, sale con 2 y `Formato omitido: falta Prettier. Ejecuta npm install.`;
  - si Prettier falla, sale con 2 y `Formato omitido en <ruta>: <mensaje>`, sin tocar el archivo (FR-012).

  T025 en verde.

**Checkpoint**: formateador probado; todavía sin declarar en `settings.json`.

---

## Phase 7: User Story 5 - Controles probados y decisiones registradas (Priority: P3)

**Goal**: las pruebas cubren cada control y las decisiones quedan registradas.

**Independent Test**: [quickstart.md](quickstart.md), Escenarios 0 y 6.

- [X] T027 [US5] Agregar `.claude/hooks/lib/sin-datos-reales.test.ts`, que recorre todos los `*.ts` de `.claude/hooks/` y `docs/datos-ficticios.md`, pasa su contenido por el control `datos-reales` como si fuera un Write y espera 0 bloqueos (FR-018).
- [X] T028 [US5] Agregar al **principio** de `DECISIONES.md` la entrada `## 2026-10-15 · Guardarraíles del repositorio con hooks`, con enlace al issue #5 y a [research.md](research.md):
  - decisiones R1, R2, R3, R4, R5, R7, R8 y R10, cada una con su motivo, la alternativa descartada y sus consecuencias;
  - una sección de riesgos residuales con R9.

  Sigue el formato de las entradas del #3 y el #4 (FR-019, SC-007).

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T029 Comprobar que `npm test`, `npm run typecheck` y `npm run format:check` están en verde. Medir el tiempo del guardián con `Measure-Command`, o `time` en Git Bash, sobre un Write típico: el objetivo es menos de 300 ms.
- [X] T030 Declarar los hooks en `.claude/settings.json`: el bloque `hooks` exacto de [contracts/hooks.md](contracts/hooks.md), con PreToolUse del guardián (`timeout: 10`, `onFailure: "block"`) y PostToolUse del formateador (`timeout: 30`). Conservar `enabledMcpjsonServers` y `permissions`, y validar el JSON. **Se hace al final**, con las pruebas en verde (riesgos del plan).
- [X] T031 Validación manual en una **sesión nueva** de Claude Code (los hooks se leen al iniciar): prerrequisitos y Escenarios 1, 3, 4 y 5 de [quickstart.md](quickstart.md). Borrar al final los archivos y la rama `99-prueba` temporales.
- [ ] T032 Validación manual del Escenario 2 de [quickstart.md](quickstart.md), secretos, con un `.env` temporal creado a mano.
  - Si la negación `!` de `permissions.deny` no deja leer `.env.example`, aplicar la alternativa de [contracts/hooks.md](contracts/hooks.md) y registrarla en `DECISIONES.md`.
  - Al final, borrar el `.env`.
- [x] T033 Commit convencional en `5-guardarrailes-del-repositorio-con-hooks`, por ejemplo `feat: guardarraíles del repositorio con hooks (#5)`. Antes:
  - `git status`, para confirmar que no entra ningún `.env`, archivo temporal ni `node_modules/`;
  - la búsqueda de tokens del quickstart del #3.
- [ ] T034 Con confirmación del desarrollador: `git push -u origin 5-guardarrailes-del-repositorio-con-hooks` y `/ticket-abrir-pr 5`.
- [ ] T035 Con confirmación del desarrollador: `/ticket-cerrar`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001–T004)** → **Foundational (T005–T010)** → historias.
- **US1, US2, US3 y US4** dependen solo de la Fase 2. Sus módulos y pruebas son independientes; solo el registro en `guardian.ts` (T016, T020, T024) toca el mismo archivo y va en secuencia.
- **T024** usa la tarjeta Luhn de US1 para probar dos motivos a la vez: requiere T015.
- **US5**: T027 requiere los tres controles (T015, T019, T023); T028 puede escribirse en cualquier momento, aunque conviene al final.
- **T030** (activar hooks) requiere T029 en verde. **T031 y T032** requieren T030 y una sesión nueva.
- **T033 → T034 → T035**, en ese orden.

### User Story Dependencies

- **US1 (P1)**: independiente. Es el MVP.
- **US2 (P1)**: independiente.
- **US3 (P2)**: independiente, salvo la prueba combinada de T024, que requiere US1.
- **US4 (P2)**: independiente del guardián.
- **US5 (P3)**: requiere US1 a US3 para la prueba de T027.

### Within Each User Story

Prueba en rojo → implementación en verde → registro en el guardián con su prueba de punta a punta.

### Parallel Opportunities

- T002 y T003 junto con T001.
- T005, T006, T007 y T008: dos pares de prueba e implementación en archivos distintos.
- T011 y T012.
- Las pruebas de distintas historias (T014, T018, T022, T025) y sus implementaciones (T015, T019, T023, T026) tocan archivos distintos y pueden avanzar en paralelo después de la Fase 2.

---

## Parallel Example: tras la Fase 2

```text
Task: "T014 [US1] datos-reales.test.ts → T015 datos-reales.ts"
Task: "T018 [US2] secretos.test.ts → T019 secretos.ts"
Task: "T022 [US3] spec-primero.test.ts → T023 spec-primero.ts"
Task: "T025 [US4] formatear.test.ts → T026 formatear.ts"
# Después, en secuencia: T016 → T020 → T024 (guardian.ts)
```

---

## Implementation Strategy

### MVP First (US1)

1. T001–T004 (setup) → T005–T010 (guardián vacío que falla cerrado).
2. T011–T017: datos con forma real.
3. **Parar y validar**: `npm test` en verde; el guardián como proceso bloquea una tarjeta generada y deja pasar montos.

### Incremental Delivery

1. MVP: US1.
2. US2: secretos (T018–T021).
3. US3: spec primero (T022–T024).
4. US4: formato (T025, T026).
5. US5: prueba de no-datos-reales y decisiones (T027, T028).
6. Polish: verde total, activación de hooks, validación manual, commit, PR y cierre (T029–T035).

---

## Notes

- **Activación tardía**: hasta T030, los hooks no están declarados y las sesiones de Claude Code no los aplican. Después de T030, todo cambio posterior en el repositorio pasa por el guardián, incluido el de este ticket.
- **Rama de este ticket**: tiene spec del #5, así que spec-primero no bloquea nada en ella. Las pruebas del bloqueo usan ramas inyectadas.
- **Validaciones manuales**: requieren sesiones nuevas. Sus archivos temporales (`.env`, `src/ejemplo.ts`, la rama `99-prueba`) nunca se commitean.
- **Push, PR y fusión** (T034, T035) se confirman con el desarrollador antes de ejecutarse.
