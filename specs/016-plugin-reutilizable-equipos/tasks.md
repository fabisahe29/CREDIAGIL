---
description: "Lista de tareas: plugin reutilizable para otros equipos"
---

# Tasks: Plugin reutilizable para otros equipos

**Input**: documentos de diseño en `specs/016-plugin-reutilizable-equipos/`

**Issue de origen**: [fabisahe29/CREDIAGIL#18](https://github.com/fabisahe29/CREDIAGIL/issues/18)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/catalogo-y-manifiesto.md](contracts/catalogo-y-manifiesto.md), [contracts/configuracion-equipo.md](contracts/configuracion-equipo.md), [contracts/verificacion.md](contracts/verificacion.md), [quickstart.md](quickstart.md)

**Tests**: la constitución exige pruebas y la spec fija criterios medibles (SC-001 a SC-007). Cada módulo determinista se escribe primero como prueba (en rojo) y después se implementa (en verde), con `node --test`. El revisor y la skill se validan con el quickstart, en una sesión nueva, al final.

**Organization**: las tareas se agrupan por historia de usuario. US1 deja el plugin instalable con el hook. US2 agrega la configuración del equipo, el subagente y la skill. US3 limpia las fuentes de referencias propias. US4 verifica en un repositorio de prueba. US5 documenta. US6 detecta la deriva entre las dos copias.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US6)

## Path Conventions

- Fuentes genéricas en `.claude/hooks/`, `.claude/hooks/lib/`, `.claude/agents/` y `.claude/skills/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Generador, lista de piezas, portabilidad y verificación en `scripts/plugin/`.
- Plugin en `plugins/crediagil-controles/`; catálogo en `.claude-plugin/marketplace.json`.
- Nada va en `src/` (FR-020).

## Reglas comunes a todas las tareas de código

- TypeScript `strict` con solo sintaxis borrable, imports con extensión `.ts`, `unknown` en lugar de `any`, igual que los hooks existentes.
- Los archivos que viajan al plugin no contienen referencias propias de este repositorio (R4, R12). Eso incluye comentarios, mensajes y nombres de tipo.
- **Ningún archivo contiene un dato con forma real literal** (constitución, Principio II). Si una prueba necesita un número con forma real, lo genera en tiempo de ejecución con los helpers de `.claude/hooks/lib/generadores.ts` o con una función propia; nunca lo escribe literal.
- Las pruebas no usan red, la CLI de Claude Code ni el modelo: la CLI se inyecta como función en las pruebas.
- Un test que falla no se desactiva ni se omite para poder integrar.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Ampliar `package.json`: el script `test` pasa a `node --test ".claude/**/*.test.ts" "scripts/**/*.test.ts" "src/**/*.test.ts"`, y se agregan `"plugin:generar": "node scripts/plugin/generar.ts"` y `"plugin:verificar": "node scripts/plugin/verificar-instalacion.ts"`. No se agregan dependencias.
- [X] T002 [P] Ampliar `tsconfig.json`: `include` incorpora `"scripts/**/*.ts"`.
- [X] T003 Comprobar que `npm test` y `npm run typecheck` siguen en verde antes de tocar nada. Anotar cuántas pruebas pasan; es la línea base de US6.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: confirmar lo que no se pudo probar al planificar y partir el guardián en base y entradas (R5), que necesitan todas las historias.

**CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [X] T004 En una máquina con la CLI de Claude Code, confirmar los cuatro puntos de [R9](research.md#r9-puntos-por-verificar-antes-de-construir) con un plugin de juguete en una carpeta temporal fuera del repositorio:
  - (a) el nombre con el que un subagente de plugin llega a un hook `PreToolUse`;
  - (b) que una skill de plugin puede ejecutar `git diff` al cargarse y llamar al subagente del plugin por su nombre con prefijo;
  - (c) los comandos de la CLI para validar un plugin, registrar un catálogo desde una ruta o un repositorio, instalar con alcance de proyecto, listar lo instalado y desinstalar;
  - (d) que Node ejecuta TypeScript desde la carpeta donde Claude Code copia el plugin, y que el comando del hook funciona en Windows sin Bash.

  Anotar el resultado de cada punto en la tabla de R9 de `research.md`. Si un punto falla, aplicar su plan B y corregir los contratos y el quickstart antes de seguir. Si no hay CLI disponible, anotarlo y dejar el punto como «no verificable»; T029 y T042 no pueden marcarse aprobados mientras tanto.
- [X] T005 [P] Prueba `.claude/hooks/guardian-base.test.ts` (en rojo): `evaluar(entrada, controles, contexto)` ejecuta todos los controles recibidos y junta sus bloqueos; un error dentro de un control devuelve un bloqueo `error-interno` con tipo y causa y nunca lanza (FR-011); `respuestaDeny(bloqueos)` produce el JSON `hookSpecificOutput.permissionDecision: "deny"` con todos los motivos; el contexto base es solo `{ raiz }`.
- [X] T006 [P] Prueba en `.claude/hooks/lib/bloqueo.test.ts`: `Control` acepta cualquier cadena (el control que bloquea se nombra a sí mismo) y `componerMensaje` sigue produciendo el mismo mensaje para los controles actuales.
- [X] T007 Implementar `.claude/hooks/guardian-base.ts`: mover desde `.claude/hooks/guardian.ts` `evaluar`, `respuestaDeny`, `errorInterno`, la lectura de la entrada estándar (con el BOM de PowerShell) y el arranque. `ControlGuardian` pasa a ser genérico sobre un contexto que extiende `{ raiz: string }`. Sin referencias propias en comentarios ni mensajes (R4).
- [X] T008 [P] Cambiar el tipo `Control` de `.claude/hooks/lib/bloqueo.ts` a `string` y quitar de los comentarios las referencias a `contracts/hooks.md` y a requisitos de otras specs.
- [X] T009 Reescribir `.claude/hooks/guardian.ts` para usar la base: conserva `CONTROLES` (los 5 de hoy) y su contexto con `obtenerRama` y `obtenerHeadRemoto`. `.claude/hooks/guardian.test.ts` pasa sin cambios de comportamiento; solo se ajusta lo que importaba de `guardian.ts` y ahora vive en la base.
- [X] T010 Crear `.claude/hooks/guardian-controles.ts`: entrada del plugin, con solo `secretos`, `datosReales` y `revisores`, sobre la base. Sin `spec-primero`, `puerta-pr`, ramas ni head remoto.
- [X] T011 Comprobar que `npm test` y `npm run typecheck` siguen en verde con las mismas pruebas de T003.

**Checkpoint**: la base y las dos entradas del guardián existen; el guardián de este repositorio se comporta igual que antes.

---

## Phase 3: User Story 1 - Instalar los controles en otro repositorio sin copiar archivos (Priority: P1) 🎯 MVP

**Goal**: un catálogo y un plugin con manifiestos válidos y las piezas del hook generadas, instalables sin copiar archivos a mano.

**Independent Test**: `npm run plugin:generar` deja `plugins/crediagil-controles/` completo y las pruebas de manifiestos pasan. En el repositorio de prueba, el catálogo se registra y el plugin se instala (comandos de T004).

### Tests for User Story 1

- [X] T012 [P] [US1] Prueba `scripts/plugin/manifiestos.test.ts` (en rojo), según [contracts/catalogo-y-manifiesto.md](contracts/catalogo-y-manifiesto.md): `.claude-plugin/marketplace.json` lista `crediagil-controles` con `name`, `source` relativo y `description`, y **sin** `version` (R13); `owner.name` es un nombre de equipo; `plugin.json` tiene `name` igual al del catálogo y `version` con forma SemVer; `hooks/hooks.json` registra `PreToolUse` con un comando que usa `${CLAUDE_PLUGIN_ROOT}` y ninguna ruta absoluta (FR-003, FR-005, FR-006); el directorio de `source` existe.
- [X] T013 [P] [US1] Prueba `scripts/plugin/piezas.test.ts` (en rojo): cada `fuente` de la lista existe, cada `destino` es único, y ninguna `fuente` está en las exclusiones de FR-020 (`spec-primero`, `puerta-pr`, `formatear`, `.claude/revision/`, `/ticket-*`, `speckit-*`, `src/`).
- [X] T014 [P] [US1] Prueba `scripts/plugin/generar.test.ts` (en rojo), con una raíz temporal: `generar(raiz)` crea cada `destino` con contenido idéntico a su `fuente` (R3); una segunda ejecución no cambia nada; los manifiestos escritos a mano no se tocan.

### Implementation for User Story 1

- [X] T015 [US1] Crear `scripts/plugin/piezas.ts`: la lista `{ fuente, destino, clase }` según [data-model.md](data-model.md), «Pieza», con `clase` ∈ `hook`, `control`, `subagente`, `skill`. Por ahora incluye `guardian-base.ts`, `guardian-controles.ts` y los controles de R2: `accion`, `bloqueo`, `shell`, `secretos`, `datos-reales`, `convencion-ficticia`, `revisores`. Exporta también la lista de exclusiones de FR-020.
- [X] T016 [US1] Crear `scripts/plugin/generar.ts`: copia cada fuente a `plugins/crediagil-controles/<destino>` sin transformarla, crea las carpetas que falten, y sale con código distinto de cero si una fuente no existe. Exporta `generar(raiz)` y arranca solo desde la línea de comandos.
- [X] T017 [P] [US1] Crear `.claude-plugin/marketplace.json` y `plugins/crediagil-controles/.claude-plugin/plugin.json` con el contenido exacto del contrato (`version: "1.0.0"` solo en `plugin.json`).
- [X] T018 [P] [US1] Crear `plugins/crediagil-controles/hooks/hooks.json` con el contrato: mismo `matcher` que el guardián de este repositorio, comando `node "${CLAUDE_PLUGIN_ROOT}/hooks/guardian-controles.ts"` y `timeout` de 10 s.
- [X] T019 [US1] Ejecutar `npm run plugin:generar` y dejar versionado el contenido generado de `plugins/crediagil-controles/`. Comprobar que T012 a T014 pasan.

**Checkpoint**: el plugin existe con el hook y los controles, y se puede registrar e instalar desde el catálogo.

---

## Phase 4: User Story 2 - Piezas genéricas útiles de verdad (Priority: P1)

**Goal**: el hook usa la configuración del equipo, y el plugin incluye el subagente revisor y la skill.

**Independent Test**: en el repositorio de prueba con el plugin instalado, invocar el subagente, ejecutar la skill y provocar el bloqueo del hook, sin editar nada.

### Tests for User Story 2

- [X] T020 [P] [US2] Prueba `.claude/hooks/lib/config-equipo.test.ts` (en rojo), según [contracts/configuracion-equipo.md](contracts/configuracion-equipo.md): sin `.claude/controles-equipo.json` devuelve `{ prefijoFicticio: "000", porDefecto: true }`; con `{"prefijoFicticio":"999"}` lo devuelve; `prefijoFicticio` debe ser «cadena de 1 a 6 dígitos» y un valor como `"abc"`, `""` o de 7 dígitos lanza `ConfiguracionInvalida` con el valor encontrado; un campo desconocido o un JSON ilegible también lanzan `ConfiguracionInvalida` (FR-007, FR-011).
- [X] T021 [P] [US2] Ampliar `.claude/hooks/lib/datos-reales.test.ts`: un número que empieza por el prefijo del equipo no bloquea; uno con forma real sí; con la convención por defecto, el motivo dice «convención por defecto (no hay .claude/controles-equipo.json)» (FR-008, FR-010); las pruebas actuales de `datosReales(accion)` siguen pasando.
- [X] T022 [P] [US2] Ampliar `.claude/hooks/lib/revisores.test.ts`: se restringe a cualquier subagente cuyo nombre empiece por `revisor-`, con o sin prefijo de plugin delante (`crediagil-controles:revisor-reglas`), y solo permite `Read`, `Grep` y `Glob`; un subagente con otro nombre no se restringe (R8; ajustar a lo que confirme T004, punto a).
- [X] T023 [P] [US2] Prueba `.claude/hooks/guardian-controles.test.ts` (en rojo), ejecutando `evaluar` con los controles de la entrada del plugin sobre una raíz temporal con otra estructura de carpetas: una escritura con una cédula con forma real, generada en ejecución y junto a la palabra «cédula», se bloquea y sale enmascarada; una con prefijo ficticio no; una lectura de `.env` se bloquea; una entrada que no es JSON bloquea con tipo y causa; un `controles-equipo.json` inválido bloquea con mensaje legible (FR-010, FR-011).
- [X] T024 [P] [US2] Prueba `.claude/agents/revisor-reglas.test.ts` (en rojo): el encabezado del subagente declara `tools: Read, Grep, Glob` y `disallowedTools` con `Bash`, `PowerShell`, `Write`, `Edit` y `mcp__*`; el cuerpo menciona `.claude/reglas-equipo.md` y el estado `sin_configuracion`; no contiene los términos prohibidos de R12 (FR-005, FR-009).

### Implementation for User Story 2

- [X] T025 [US2] Implementar `.claude/hooks/lib/config-equipo.ts`: lee `.claude/controles-equipo.json` bajo la raíz y valida con guardas de tipo propias, sin dependencias. Errores tipados con el valor encontrado y qué se esperaba.
- [X] T026 [US2] Parametrizar `.claude/hooks/lib/convencion-ficticia.ts` y `.claude/hooks/lib/datos-reales.ts`: `esFicticio(valor, prefijo)` con `"000"` por defecto, y `datosReales(accion, contexto?)` lee el prefijo de la configuración. Si usó el valor por defecto, el bloqueo lo indica. La corrección dice «Usa un número ficticio que empiece por `<prefijo>`».
- [X] T027 [US2] Cambiar `.claude/hooks/lib/revisores.ts` para reconocer los revisores por el prefijo `revisor-` (R8) en lugar de la lista fija.
- [X] T028 [US2] Conectar `.claude/hooks/guardian-controles.ts` y `.claude/hooks/guardian-base.ts` con la configuración: un `ConfiguracionInvalida` se convierte en un bloqueo con el mensaje de [contracts/configuracion-equipo.md](contracts/configuracion-equipo.md), «Ejemplo de error de configuración».
- [X] T029 [US2] Crear `.claude/agents/revisor-reglas.md` según el contrato: encabezado exigido, lectura de `.claude/reglas-equipo.md` (un `##` por regla), informe con un único bloque `json` de tipo `reglas` y estado `revisado` o `sin_configuracion`. `cumplida` exige evidencia con archivo y línea; una regla que no entiende se informa como `no_aplicable` con motivo. Sin reglas, carpetas ni comandos de este repositorio.
- [X] T030 [US2] Crear `.claude/skills/revisar-reglas/SKILL.md`: guía de cómo declarar las reglas del equipo, cómo obtener el diff y cómo leer el informe. Usar el método que confirme T004, punto b (plan B: pedir la ruta de un archivo con el diff). Sin referencias propias.
- [X] T031 [US2] Agregar a `scripts/plugin/piezas.ts` el subagente (`.claude/agents/revisor-reglas.md`), la skill (`.claude/skills/revisar-reglas/SKILL.md`) y los archivos nuevos `config-equipo.ts`. Agregar a `scripts/plugin/piezas.test.ts` la comprobación de FR-001: la lista tiene al menos una pieza de clase `hook`, una `subagente` y una `skill`. Ejecutar `npm run plugin:generar`.

**Checkpoint**: el plugin trae las tres clases de pieza, y el hook respeta la configuración del equipo.

---

## Phase 5: User Story 3 - Paquete limpio de supuestos de este repositorio (Priority: P1)

**Goal**: ningún archivo del plugin contiene credenciales, rutas absolutas ni referencias propias, y el plugin funciona en un repositorio con otra estructura.

**Independent Test**: `npm test` pasa la prueba de portabilidad sobre todo `plugins/crediagil-controles/` con cero coincidencias, y la entrada del plugin funciona sobre una raíz temporal con otras carpetas.

### Tests for User Story 3

- [X] T032 [P] [US3] Prueba `scripts/plugin/portabilidad.test.ts` (en rojo): el analizador detecta, en archivos temporales, una ruta absoluta de Windows y una de Unix, un patrón de credencial (armado en ejecución, nunca literal), `specs/`, `src/`, `.specify`, `constitución`, `CLAUDE.md`, `DECISIONES.md`, `docs/datos-ficticios`, un número de requisito (`FR-` seguido de dígitos), un número de issue (`#` seguido de dígitos) y el nombre de usuario propietario del repositorio; no marca un texto limpio. Cada hallazgo informa archivo, línea y término (R12, FR-005).
- [X] T033 [P] [US3] Prueba en `scripts/plugin/portabilidad.test.ts`: recorre todo `plugins/crediagil-controles/` y falla con la lista de hallazgos si hay alguno (SC-003).
- [X] T034 [P] [US3] Prueba en `scripts/plugin/portabilidad.test.ts`: ejecuta `plugins/crediagil-controles/hooks/guardian-controles.ts` como proceso hijo con la raíz en una carpeta temporal de estructura distinta (`app/`, `docs/`) y sin ningún archivo de este proyecto, y comprueba que bloquea un dato con forma real generado en ejecución (FR-006).

### Implementation for User Story 3

- [X] T035 [US3] Crear `scripts/plugin/portabilidad.ts`: la lista de términos y patrones prohibidos de [R12](research.md#r12-portabilidad-términos-prohibidos) y `analizar(ruta)` que devuelve `{ archivo, linea, termino }[]`.
- [X] T036 [P] [US3] Dejar neutros `.claude/hooks/lib/secretos.ts`, `.claude/hooks/lib/shell.ts` y `.claude/hooks/lib/accion.ts` (R4): los campos `regla` y `correccion` explican la regla en una frase, sin citar la constitución, requisitos ni documentos; los comentarios de cabecera no remiten a specs de este repositorio.
- [X] T037 [P] [US3] Dejar neutros `.claude/hooks/lib/datos-reales.ts`, `.claude/hooks/lib/convencion-ficticia.ts`, `.claude/hooks/lib/bloqueo.ts`, `.claude/hooks/lib/revisores.ts`, `.claude/hooks/guardian-base.ts`, `.claude/hooks/guardian-controles.ts` y `.claude/hooks/lib/config-equipo.ts`, con el mismo criterio. En particular, la corrección de `datos-reales` ya no cita `docs/datos-ficticios.md`.
- [X] T038 [US3] Ajustar las pruebas que afirmaban el texto antiguo de `regla` o `correccion`: `.claude/hooks/lib/secretos.test.ts`, `.claude/hooks/lib/datos-reales.test.ts` (la que busca `docs/datos-ficticios.md`), `.claude/hooks/lib/bloqueo.test.ts` y `.claude/hooks/guardian.test.ts`. Los controles siguen bloqueando lo mismo; solo cambia el texto. `convencion-ficticia.test.ts` sigue leyendo `docs/datos-ficticios.md` porque esa prueba no viaja.
- [X] T039 [US3] Ejecutar `npm run plugin:generar` y comprobar que T032 a T034 pasan, incluida la prueba de que el plugin no tiene ningún término prohibido.

**Checkpoint**: el plugin es portable y las pruebas lo demuestran.

---

## Phase 6: User Story 4 - Verificación en un repositorio de prueba distinto (Priority: P2)

**Goal**: un procedimiento repetible que instala el plugin en un repositorio temporal y deja un resultado por pieza.

**Independent Test**: `npm run plugin:verificar` termina con `aprobada`, `reprobada` o `no_verificable` por cada pieza, y dos ejecuciones seguidas dan el mismo resultado.

### Tests for User Story 4

- [X] T040 [P] [US4] Prueba `scripts/plugin/verificar-instalacion.test.ts` (en rojo), con la CLI inyectada como función falsa y según [contracts/verificacion.md](contracts/verificacion.md): con una CLI que instala bien y un guardián que bloquea, las tres piezas quedan `aprobada`; si el guardián no bloquea el dato con forma real, el hook queda `reprobada` con su causa; si la CLI no existe, las piezas quedan `no_verificable` con la causa y **nunca** `aprobada`; hay una entrada por clase de pieza; el código de salida es distinto de cero solo con `reprobada`; dos ejecuciones dan el mismo `estado` por pieza; la salida no contiene el contenido de ningún archivo ni datos con forma real; la carpeta temporal se borra al terminar.

### Implementation for User Story 4

- [X] T041 [US4] Implementar `scripts/plugin/verificar-instalacion.ts` según el contrato: crea un repositorio temporal con carpetas propias, registra el catálogo desde la ruta de este repositorio e instala el plugin con los comandos confirmados en T004, ejecuta las comprobaciones de la tabla «Comprobaciones por pieza» y escribe el resultado. Los datos con forma real de las comprobaciones se generan en ejecución. Con `--guardar` escribe `verificacion.json` en la carpeta de la spec.
- [X] T042 [US4] Ejecutar `npm run plugin:verificar` en una máquina con la CLI y anotar el resultado por pieza en la descripción del pull request. Si no hay CLI, anotar «no verificable» con su causa; no se declara aprobado. Con las piezas en verde, hacer una vez el paso 4 del [quickstart](quickstart.md) a mano para comprobar el revisor con un modelo real.

**Checkpoint**: hay evidencia por pieza de que el plugin se instala y funciona fuera de este repositorio.

---

## Phase 7: User Story 5 - Instalación documentada y decisión registrada (Priority: P2)

**Goal**: una guía que una persona ajena pueda seguir sin ayuda, y la decisión registrada.

**Independent Test**: una persona ajena al proyecto instala y usa cada pieza siguiendo solo `docs/plugin-controles.md`.

- [X] T043 [US5] Crear `docs/plugin-controles.md` en español: requisitos (Node ≥ 22.18, R10), registrar el catálogo e instalar con los comandos confirmados en T004, usar el hook, el subagente y la skill, declarar `.claude/reglas-equipo.md` y `.claude/controles-equipo.json` según [contracts/configuracion-equipo.md](contracts/configuracion-equipo.md), actualizar sin perder la configuración (FR-013), desinstalar (FR-004), qué pasa si ya existe una pieza con el mismo nombre (R14, FR-012), y para quien mantiene el plugin, cómo se genera y se verifica. Datos de ejemplo solo ficticios.
- [X] T044 [P] [US5] Crear `plugins/crediagil-controles/README.md`: descripción corta y genérica de las tres piezas y de la configuración, sin la dirección de este repositorio ni referencias propias (R12). La prueba de T033 lo cubre.
- [X] T045 [P] [US5] Actualizar `DECISIONES.md`: la entrada del #18 ya existe; completar la «Decisión 5» con lo que confirmó T004 (qué puntos de R9 pasaron y cuáles aplicaron el plan B).
- [X] T046 [P] [US5] Actualizar la tabla «Mapa del repositorio» de `CLAUDE.md` con `.claude-plugin/`, `plugins/` y `scripts/plugin/` (#18), y mencionar que las fuentes genéricas de `.claude/hooks/` se copian al plugin y no deben editarse en `plugins/`.
- [ ] T047 [US5] Pedir a una persona ajena al proyecto que haga los pasos 4 a 6 del [quickstart](quickstart.md) usando solo `docs/plugin-controles.md`. Anotar si lo logró sin ayuda y en cuánto tiempo (SC-001 y SC-005). **No se hizo: no hay una persona ajena disponible por ahora (decisión del 2026-10-19). SC-005 queda sin verificar.**

**Checkpoint**: la instalación está documentada y la decisión queda registrada.

---

## Phase 8: User Story 6 - El paquete se genera desde las piezas del proyecto sin deriva (Priority: P3)

**Goal**: detectar cuando una copia difiere de su fuente y detener la generación si una pieza trae una referencia propia.

**Independent Test**: cambiar una pieza sin regenerar hace fallar las pruebas y nombra la pieza; agregar una referencia propia a una fuente detiene la generación.

### Tests for User Story 6

- [X] T048 [P] [US6] Ampliar `scripts/plugin/generar.test.ts`: con una raíz temporal, `generar(raiz, { verificar: true })` no escribe nada y falla nombrando cada pieza cuya copia difiere de su fuente (FR-021); con las copias al día termina sin error.
- [X] T049 [P] [US6] Ampliar `scripts/plugin/generar.test.ts`: si una fuente contiene un término prohibido (por ejemplo `specs/` en un comentario), `generar` se detiene antes de copiar, señala pieza, línea y término, y no deja el plugin a medias (FR-022).
- [X] T050 [P] [US6] Prueba en `scripts/plugin/generar.test.ts` que recorre el repositorio real: el plugin versionado coincide con sus fuentes (SC-006). Es la prueba que falla en `npm test` cuando alguien edita una fuente y olvida regenerar.

### Implementation for User Story 6

- [X] T051 [US6] Ampliar `scripts/plugin/generar.ts`: opción `--verificar` (compara sin escribir) y análisis previo de las fuentes con `analizar` de `scripts/plugin/portabilidad.ts` antes de copiar. Un error por pieza, con su causa.
- [X] T052 [US6] Ejecutar el paso 2 del [quickstart](quickstart.md): editar una línea de una fuente sin regenerar, comprobar que `npm test` falla nombrando la pieza, y revertir. Repetir con un término prohibido y `npm run plugin:generar`.
- [X] T053 [US6] Comprobar que los controles de este repositorio siguen igual: `npm test` pasa el mismo número de pruebas de T003 más las nuevas, y `.claude/hooks/guardian.test.ts` no tuvo que cambiar de comportamiento (FR-017, SC-006).

**Checkpoint**: la deriva entre las dos copias se detecta en cada ejecución de las pruebas.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T054 [P] Ejecutar `npm run format` y `npm run format:check`; corregir lo que reporte en los archivos nuevos.
- [X] T055 [P] Ejecutar `npm run typecheck`: sin errores y sin ningún `any`.
- [X] T056 Ejecutar `npm test` completo y comprobar que no hay pruebas omitidas ni en rojo.
- [ ] T057 Ejecutar los seis pasos del [quickstart](quickstart.md) y marcar contra FR-001 a FR-022 y SC-001 a SC-007 qué quedó cubierto. Lo que dependa de un punto de R9 sin confirmar se anota como «no verificable», no como aprobado.
- [X] T058 Buscar en el repositorio que ningún archivo nuevo contenga un dato con forma real literal ni una credencial (constitución, Principios II y de secretos).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup y bloquea todas las historias. T004 se puede hacer en paralelo con T005 a T010, pero T028, T030 y T041 dependen de su resultado.
- **US1 (Phase 3)**: depende de T007 a T011 (la base y las entradas del guardián).
- **US2 (Phase 4)**: depende de US1 (`piezas.ts` y el generador) y de T004.
- **US3 (Phase 5)**: depende de US1; sus pruebas de portabilidad cubren también las piezas de US2, así que se cierra después de US2.
- **US4 (Phase 6)**: depende de US1 a US3 y de T004, punto c.
- **US5 (Phase 7)**: depende de T004 para los comandos; T047 depende de US4.
- **US6 (Phase 8)**: depende de US1 (generador) y de US3 (`portabilidad.ts`).
- **Polish (Phase 9)**: depende de todas las historias.

### User Story Dependencies

- **US1 (P1)**: tras Foundational. Es el MVP: plugin instalable con el hook.
- **US2 (P1)**: tras US1. Añade el subagente, la skill y la configuración.
- **US3 (P1)**: tras US1; se cierra tras US2.
- **US4 (P2)**: tras US3.
- **US5 (P2)**: tras T004; T047 tras US4.
- **US6 (P3)**: tras US1 y US3.

### Within Each User Story

- La prueba se escribe primero y debe fallar antes de implementar.
- La lista de piezas antes del generador; el generador antes de ejecutar `plugin:generar`.
- Cualquier cambio a una fuente genérica va seguido de `npm run plugin:generar`.

### Parallel Opportunities

- T002 junto con T001.
- T005, T006 y T008 son archivos distintos.
- En US1: T012, T013 y T014 juntas; T017 y T018 juntas.
- En US2: T020 a T024 juntas.
- En US3: T032 a T034 juntas; T036 y T037 juntas.
- US5 (T044 a T046) puede avanzar mientras corre US4.
- US6 (T048 a T050) puede avanzar en paralelo con US4 y US5 una vez cerrada US3.

---

## Parallel Example: User Story 2

```text
# Pruebas de US2 juntas:
Task: "Prueba config-equipo.test.ts en .claude/hooks/lib/config-equipo.test.ts"
Task: "Ampliar datos-reales.test.ts en .claude/hooks/lib/datos-reales.test.ts"
Task: "Ampliar revisores.test.ts en .claude/hooks/lib/revisores.test.ts"
Task: "Prueba guardian-controles.test.ts en .claude/hooks/guardian-controles.test.ts"
Task: "Prueba revisor-reglas.test.ts en .claude/agents/revisor-reglas.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Setup y Foundational, con T004 incluido.
2. Completar US1: plugin con el hook, catálogo y generador.
3. **Parar y validar**: registrar el catálogo e instalar el plugin en un repositorio de prueba.

El MVP del ticket exige también el subagente y la skill (FR-001), así que no se cierra sin US2. US1 sola es el primer punto de control.

### Incremental Delivery

1. Setup y Foundational: la base del guardián lista.
2. US1: plugin instalable con el hook.
3. US2: subagente, skill y configuración del equipo. Aquí se cumple FR-001.
4. US3: plugin portable y probado. Aquí se cumple FR-005.
5. US4 y US5: evidencia de instalación y guía.
6. US6: defensa contra la deriva. Cierra el riesgo que acepta el plan.

### Notas

- T004 es el riesgo principal: si un punto de R9 falla, se corrige el contrato antes de construir sobre él.
- Cada edición de una fuente genérica exige `npm run plugin:generar`; la prueba de T050 lo comprueba.
- Commit por tarea o grupo lógico, con mensajes convencionales y el número de issue: `feat: … (#18)`.
