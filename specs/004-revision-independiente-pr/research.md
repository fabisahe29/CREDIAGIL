# Research: Revisión independiente y de cumplimiento antes del pull request

**Feature**: [spec.md](spec.md) · **Issue**: [#6](https://github.com/fabisahe29/CREDIAGIL/issues/6) · **Fecha**: 2026-10-16

**Fuentes**: documentación oficial de Claude Code, consultada el 2026-10-16: [subagentes](https://code.claude.com/docs/en/sub-agents), [skills](https://code.claude.com/docs/en/skills) y [hooks](https://code.claude.com/docs/en/hooks). Código existente: guardián del #5 ([specs/003-guardarrailes-hooks/](../003-guardarrailes-hooks/)) y flujo de tickets del #3 ([specs/001-sincronizacion-backlog-github/](../001-sincronizacion-backlog-github/)).

Cada decisión sigue el formato Decisión · Motivo · Alternativas descartadas. Las marcadas con ★ van a `DECISIONES.md` (FR-014).

## Hechos de la plataforma que condicionan el diseño

| Hecho (documentación oficial) | Consecuencia |
|-------------------------------|--------------|
| Un subagente (`.claude/agents/<nombre>.md`) arranca con un contexto nuevo: su prompt de sistema, el mensaje de la tarea, `CLAUDE.md` y el estado de git. **No** ve la conversación de la sesión que lo lanza. Devuelve solo su mensaje final. | El aislamiento de FR-001 lo da la plataforma; el revisor recibe todo lo que necesita en el mensaje de la tarea (R4). |
| En un subagente, `tools` es una lista permitida y `disallowedTools` se aplica primero. Hereda las herramientas MCP si no se restringen. **No está documentado** que `tools` acepte especificadores por argumento, como `Bash(git diff:*)`; un especificador en `disallowedTools` quita la herramienta entera. | El revisor no recibe Bash: el diff se le entrega ya calculado (R4). Se niegan explícitamente las herramientas con efectos y las MCP (R2). |
| Campos de subagente útiles: `maxTurns` (al agotarse, la salida se marca como parcial), `model`, `permissionMode`, `hooks`. No hay tiempo límite de reloj documentado. | `maxTurns` acota cada revisión (R8). |
| Una skill con `context: fork` se ejecuta en un subagente sin el historial de la conversación; el cuerpo de `SKILL.md` es la tarea. `agent:` elige el tipo de subagente, incluidos los propios de `.claude/agents/`. Con `background: false` el resultado vuelve en el mismo turno. | Cada revisión es una skill `context: fork` que corre en su subagente revisor y devuelve el informe al flujo (R3). |
| En skills, `allowed-tools` **solo preaprueba** herramientas (sin pedir permiso); no restringe. Para restringir existe `disallowed-tools`. `argument-hint` solo es ayuda de autocompletado. `user-invocable: false` oculta la skill del menú `/`, pero el modelo la puede invocar. | Las skills usan `allowed-tools` para no pedir permisos y `disallowed-tools` para restringir; la restricción efectiva vive en el subagente (R2, R3). Se ocultan del menú (aclaración Q3). |
| Los hooks `PreToolUse` y `PostToolUse` de `settings.json` **también se disparan dentro de los subagentes**, y su entrada trae `agent_id` y `agent_type`. | El guardián del #5 puede imponer, como tercera capa, que un revisor solo lea (R2). |
| Existe el evento `SubagentStop`, con `agent_type` como valor del matcher y `last_assistant_message` en la entrada. Si sale con código 2, el subagente no termina y sigue trabajando. | El informe se captura de forma determinista al terminar el revisor, sin que la sesión principal lo copie, y un informe inválido se devuelve al revisor para que lo corrija (R5). |
| Los subagentes pueden lanzar subagentes, hasta tres niveles. | El revisor no recibe la herramienta `Agent`: no delega su revisión (R2). |
| **No confirmado en la documentación**: que una skill normal (como `/ticket-abrir-pr`) invoque una skill `context: fork` por la herramienta Skill y reciba su resultado. | Se valida al principio del quickstart (Escenario 0). Si falla, se usa la alternativa de R3. |

---

## R1 ★ Dos revisores como subagentes propios

- **Decisión**: dos subagentes en `.claude/agents/`:
  - **`revisor-codigo`**: revisa el diff y entrega hallazgos con severidad, archivo, línea, descripción y sugerencia (FR-002, FR-008a).
  - **`revisor-cumplimiento`**: contrasta el diff con la constitución y la spec del ticket, y entrega el estado de las reglas 1 a 5 con evidencia o motivo (FR-005 a FR-007).
- **Motivo**: dos roles con instrucciones, criterios y formatos distintos. Separados, cada prompt es más corto y cada uno tiene su propio contexto aislado: el de cumplimiento no se contamina con los hallazgos de estilo del de código. Cumple el mínimo de 2 subagentes (FR-013).
- **Alternativas descartadas**:
  - **Un solo revisor que hace las dos revisiones**: mezcla criterios, alarga el prompt y no cumple el mínimo de 2 subagentes.
  - **Subagente `general-purpose` con instrucciones en la skill**: no permite fijar herramientas por rol en el subagente (FR-003).

## R2 ★ Herramientas de solo lectura en tres capas

- **Decisión**: los revisores solo leen (FR-003), y se impone en tres capas:
  1. **Subagente**: `tools: Read, Grep, Glob` y `disallowedTools` con `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Bash`, `PowerShell`, `Agent` y `mcp__*`.
  2. **Skill**: `disallowed-tools` con la misma lista, y `allowed-tools: Read, Grep, Glob` para que la revisión no pida permisos.
  3. **Guardián** (`PreToolUse`, del #5): un control nuevo, `revisores`, niega cualquier herramienta distinta de `Read`, `Grep` y `Glob` cuando `agent_type` es un revisor.
- **Motivo**: un revisor con Bash podría escribir archivos aunque no tenga Edit ni Write. La primera capa basta en la práctica; la tercera es determinista y tiene pruebas (SC-004), igual que la defensa en profundidad del Principio IV.
- **Alternativas descartadas**:
  - **Bash con especificadores** (`Bash(git diff:*)`): no está documentado para `tools`, y un comando de shell es difícil de acotar con certeza (R4 del #5).
  - **Solo `allowed-tools` en la skill**: no restringe nada; solo preaprueba.
  - **`permissionMode: plan`**: depende del modo de la sesión y no fija una lista explícita.

## R3 ★ Dos skills `context: fork`, invocadas solo por el flujo

- **Decisión**: dos skills, `.claude/skills/revisar-codigo/` y `.claude/skills/revisar-cumplimiento/`, con:
  - `context: fork` y `agent: revisor-codigo` o `agent: revisor-cumplimiento`;
  - `background: false`, para que el resultado vuelva en el turno de `/ticket-abrir-pr`;
  - `argument-hint: "<sha del commit revisado>"`;
  - `allowed-tools` y `disallowed-tools` según R2;
  - `user-invocable: false`, porque no son comandos del desarrollador (aclaración Q3).

  `/ticket-abrir-pr` las invoca con la herramienta Skill, una después de otra.
- **Motivo**: cumple el mínimo de 2 skills con `context: fork`, `allowed-tools` y `argument-hint` (FR-013). El cuerpo de la skill es la tarea autocontenida del revisor (qué leer, cómo informar), y el subagente fija las herramientas.
- **Alternativa de respaldo** (si el Escenario 0 del quickstart muestra que una skill no recibe el resultado de otra): `/ticket-abrir-pr` lanza los subagentes con la herramienta Agent (`subagent_type: revisor-…`) y les pasa como tarea el cuerpo de la skill. Las skills se conservan como fuente única de la tarea. El resto del diseño no cambia, porque la captura del informe (R5) depende del subagente, no de la skill.
- **Alternativas descartadas**:
  - **Skills invocables por el usuario** (`/revisar-codigo`): contradice la aclaración Q3.
  - **Skills sin `context: fork`, ejecutadas en la sesión principal**: no hay aislamiento (FR-001).

## R4 ★ Paquete de revisión preparado de forma determinista

- **Decisión**: antes de revisar, el flujo ejecuta `node .claude/revision/revision.ts preparar`, que calcula el diff y escribe un **paquete de revisión** en `.git/crediagil/revisiones/<sha>/`:
  - `paquete.json`: rama, issue, `sha` (head de `origin/<rama>`), `base` (`merge-base` con `origin/main`), lista de archivos cambiados, ruta de la spec del ticket y ruta de la constitución;
  - `diff.patch`: `git diff <base>...<sha>`.

  El revisor recibe como argumento solo el `sha` y lee el paquete con Read. Si el diff está vacío, `preparar` falla y el flujo se detiene, igual que hoy con una rama sin cambios.

  Para validar sin publicar ramas de prueba, `preparar --local` usa `HEAD` y `main` locales. Una decisión sobre un `sha` local nunca habilita un PR, porque `puerta-pr` (R9) la compara con el head de `origin`.
- **Motivo**:
  - El revisor no necesita Bash (R2).
  - El alcance es exactamente el diff del ticket (FR-004, aclaración Q2) y queda fijado por un `sha`, no por lo que el revisor decida mirar.
  - Se revisa `origin/<rama>`, que es lo que contendrá el PR.
  - `.git/` no se versiona, así que el paquete nunca entra en un commit.
- **Alternativas descartadas**:
  - **Pasar el diff completo en el mensaje de la tarea**: un diff grande ocupa el prompt, y la sesión principal lo copiaría (y podría alterarlo) a mano.
  - **Carpeta temporal del sistema**: no está bajo la raíz del proyecto y las rutas cambian entre plataformas.

## R5 ★ Informe estructurado capturado por `SubagentStop`

- **Decisión**: cada revisor termina con un único bloque ` ```json ` que sigue el esquema de [contracts/informe.md](contracts/informe.md). Un hook `SubagentStop` (matcher `revisor-codigo|revisor-cumplimiento`) ejecuta `node .claude/revision/capturar.ts`, que:
  1. extrae el bloque de `last_assistant_message`;
  2. lo valida con guardas de tipo, incluidas las reglas de FR-005 y FR-006: las 5 reglas exactamente una vez, evidencia en las cumplidas e incumplidas y motivo en las no aplicables;
  3. si es válido, lo guarda en `.git/crediagil/revisiones/<sha>/informe-<tipo>.json`;
  4. si es inválido y `stop_hook_active` es falso, sale con código 2 y el motivo, y el revisor corrige su informe. Si vuelve a fallar, guarda `fallo-<tipo>.json` con la causa y deja terminar al revisor.
- **Motivo**: la decisión de abrir el PR depende del informe. Que la sesión principal lo copie a un archivo a mano introduce un paso no determinista, que podría alterarlo (Principio III). El hook lo captura tal como lo produjo el revisor y lo valida en código. Un dato que no pasa el esquema se trata como faltante: la revisión cuenta como fallida (FR-009).
- **Alternativas descartadas**:
  - **La sesión principal escribe el informe con Write**: paso manual, alterable y no auditable.
  - **El revisor escribe su propio archivo**: necesitaría Write, lo que contradice R2.
  - **Validar con Zod**: obligaría a `npm install` antes de que funcione el flujo. Se mantiene el criterio del #5 (desviación menor justificada en el plan).

## R6 ★ Decisión determinista por gravedad

- **Decisión**: `node .claude/revision/revision.ts decidir <sha>` lee los dos informes del paquete y calcula la decisión con la regla de la aclaración Q1: **bloquea** si hay alguna regla `incumplida` o algún hallazgo de severidad `alta` o `critica`; si falta un informe o hay un `fallo-<tipo>.json`, la revisión cuenta como **fallida** y también bloquea. Escribe `decision.json` en el paquete y devuelve, en JSON, la decisión, los motivos y el cuerpo de los dos comentarios de registro.
- **Motivo**: el modelo clasifica (severidad, estado de cada regla), igual que extrae datos en el agente; la decisión sobre esa clasificación es código con pruebas (Principio III). Así la misma entrada da siempre la misma decisión.
- **Alternativas descartadas**: que `/ticket-abrir-pr` decida leyendo los informes; es el modelo aplicando la regla «a criterio».

## R7 ★ Registro en el issue, reutilizable y enlazado desde el PR

- **Decisión**:
  - Cada revisión se publica como comentario en el issue del ticket (aclaración Q4), con el marcador `<!-- crediagil:revision=<tipo>;commit=<sha> -->` en la primera línea, un resumen legible y el informe completo en un bloque `<details>`. El cuerpo lo genera `decidir` (R6); la sesión principal solo lo publica con `mcp__github__add_issue_comment`.
  - **Idempotencia** (FR-011): antes de publicar, se buscan en el issue los comentarios con ese marcador; si existe, no se publica.
  - **Reutilización** (FR-009): antes de preparar un paquete, `/ticket-abrir-pr` busca los dos marcadores del `sha` actual. Si ambos existen, `revision.ts reutilizar` reconstruye los informes desde el bloque `<details>` y recalcula la decisión sin volver a lanzar los revisores.
  - **PR** (FR-010a): la plantilla del cuerpo del PR gana una sección `## Revisiones`, con el `sha`, la decisión, los conteos y el enlace a cada comentario.
- **Motivo**: es el mismo mecanismo de marcadores del #3 (Regla 4 del flujo), que ya es idempotente. El informe embebido hace el registro autosuficiente: permite auditar y reutilizar sin depender de `.git/` local, que no existe en otro clon.
- **Alternativas descartadas**: comentarios en el PR (no existe si se bloquea); un archivo versionado de revisiones (ensucia el diff del ticket y se vuelve parte de lo que se revisa).

## R8 Tiempo y reintentos acotados

- **Decisión**: cada revisor tiene `maxTurns: 40`. Si una revisión falla (salida parcial por `maxTurns`, error o informe inválido tras la corrección de R5), `/ticket-abrir-pr` la reintenta **una vez**; si vuelve a fallar, no abre el PR e informa la causa (FR-009).
- **Motivo**: el Principio VI exige límites y reintentos acotados, y que nunca se decida sin respuesta.
  - **Tiempo límite**: la plataforma no documenta un tiempo límite de reloj para subagentes; `maxTurns` es el límite disponible.
  - **Sin backoff**: el único reintento es secuencial y ocurre cuando la revisión anterior ya terminó. Las fallas que cubre (turnos agotados, informe inválido) no son transitorias de red, y una espera no cambia su resultado.
- **Dimensionamiento de `maxTurns`**: el revisor lee primero `diff.patch`, que contiene todos los cambios en una sola lectura, y abre archivos completos solo como contexto puntual. Así los turnos crecen con lo que necesita contrastar, no con el número de archivos del diff. El valor 40 se **mide** antes de usarlo en la puerta: el Escenario 0 del quickstart se ejecuta con el paquete real de este ticket, cuyo diff tiene unos 40 archivos. Si el revisor agota los turnos o queda cerca del límite, se sube `maxTurns` y se registra en `DECISIONES.md` antes de T041.
- **Alternativas descartadas**: sin límite (una revisión podría no terminar); reintentos ilimitados (pueden ocultar un revisor mal configurado); backoff exponencial (no aporta ante fallas no transitorias).

## R9 ★ Puerta del PR en dos capas

- **Decisión**:
  1. **Flujo**: `/ticket-abrir-pr` ejecuta preparar → revisores → decidir antes de crear el PR, y se detiene si la decisión bloquea (FR-008).
  2. **Guardián**: un control nuevo, `puerta-pr`, niega `mcp__github__create_pull_request` si no existe `.git/crediagil/revisiones/<sha>/decision.json`, con `permite: true` y los dos informes válidos, para el head de `origin/<head>` del PR. El mismo control niega Write, Edit y MultiEdit sobre `.git/crediagil/`, para que la decisión no se escriba a mano.
- **Motivo**: «no se abre un PR sin revisión» (criterio del issue) no puede depender solo de que el modelo siga los pasos de la skill. El guardián lo vuelve determinista y probado, como los controles del #5. Leer un archivo local mantiene al guardián sin red y rápido.
- **Alternativas descartadas**:
  - **Solo el flujo**: el modelo podría crear el PR saltándose los pasos.
  - **El guardián consulta el issue en GitHub**: necesita red y credenciales en el camino del bloqueo, y sería más lento y frágil.
  - **Protección de rama en GitHub**: fuera de alcance (Assumptions de la spec) y no distingue revisiones hechas con el flujo.
- **Riesgo residual**: un comando de shell que escribe en `.git/crediagil/` con una redirección no se puede analizar con certeza. Se acepta y se registra (como los comandos ofuscados del #5).

## R10 Código de la revisión fuera de `src/`, con el mismo stack del #5

- **Decisión**: el código determinista vive en `.claude/revision/` (`revision.ts`, `capturar.ts` y `lib/`), en TypeScript ejecutado por Node sin compilar ni dependencias, con pruebas `node --test`. El script `test` de `package.json` pasa a cubrir `.claude/**/*.test.ts`.
- **Motivo**: es herramienta de desarrollo, como los hooks del #5: no es código de producción y no lo bloquea el control de spec primero. Reutiliza la ejecución, las pruebas y el formato que ya funcionan.
- **Alternativas descartadas**: ponerlo en `src/` (lo mezclaría con el agente y exigiría spec del agente); scripts de shell (no portables entre Git Bash y PowerShell, y sin tipos).

## R11 Pruebas

- **Unitarias** (`node --test`): validación de informes (casos válidos e inválidos por cada regla de FR-005 y FR-006), decisión por gravedad (los bordes: solo media o baja pasa; una alta, una crítica o una incumplida bloquea; un fallo bloquea), render y parseo del comentario (ida y vuelta), y extracción del bloque JSON.
- **Guardián**: casos de `revisores` (un revisor con Write, Bash o MCP se niega; con Read, Grep o Glob pasa; la sesión principal no se afecta) y de `puerta-pr` (sin decisión, con decisión que bloquea, con decisión de otro `sha` o con Write sobre `.git/crediagil/` se niega; con decisión que permite pasa).
- **Manuales** ([quickstart.md](quickstart.md)): composición skill → skill (Escenario 0), aislamiento, detección de violaciones de las 5 reglas en una rama de prueba (SC-003), puerta y registro.
- Los datos de prueba son ficticios y siguen [docs/datos-ficticios.md](../../docs/datos-ficticios.md).
