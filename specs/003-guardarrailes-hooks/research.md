# Research: Guardarraíles del repositorio con hooks

**Feature**: [spec.md](spec.md) · **Issue**: [#5](https://github.com/fabisahe29/CREDIAGIL/issues/5) · **Fecha**: 2026-10-15

**Fuentes**: documentación oficial de Claude Code, consultada el 2026-10-15: [hooks](https://code.claude.com/docs/en/hooks), [permissions](https://code.claude.com/docs/en/permissions) y [tools-reference](https://code.claude.com/docs/en/tools-reference). Entorno local: Node v24.21.0, npm 11.19.0 y Git 2.55 en Windows.

Cada decisión sigue el formato Decisión · Motivo · Alternativas descartadas. Las marcadas con ★ van a `DECISIONES.md` (FR-019).

## Hechos de la plataforma que condicionan el diseño

| Hecho (documentación oficial) | Consecuencia |
|-------------------------------|--------------|
| Los hooks se declaran en `.claude/settings.json` bajo `hooks`, por evento (`PreToolUse`, `PostToolUse`), con `matcher` (regex sobre el nombre de la herramienta) y `hooks: [{type: "command", command, timeout}]`. | Los controles viajan con el repositorio, sin pasos de configuración (FR-016, SC-006). |
| El hook recibe por stdin un JSON con `tool_name`, `tool_input`, `cwd`, `session_id`, `hook_event_name`, `transcript_path`, `permission_mode` y `tool_use_id`. Read, Grep y Glob traen `file_path`, `pattern` y `path`. **No se verificó** el esquema de `MultiEdit` ni el de `Write`/`Edit`. | La entrada se valida contra un esquema y se extraen los textos de forma defensiva (R6). |
| PreToolUse bloquea con JSON `hookSpecificOutput.permissionDecision: "deny"` y `permissionDecisionReason`, con salida 0. Es el método recomendado. La salida 2 también bloquea, con stderr como motivo. | El guardián responde en JSON y el motivo llega al modelo (FR-014). |
| PostToolUse con salida 2 muestra stderr al modelo; la herramienta ya se ejecutó. | El formateador no puede deshacer la edición: solo informa (FR-012). |
| **Fail-open**: una salida distinta de 0 o 2, o un tiempo agotado, **no** bloquean: la acción sigue. Para fallar cerrado existe `"onFailure": "block"` (Claude Code v2.1.295 o posterior). | Doble defensa: el guardián captura todo error y responde *deny*, y el hook declara `onFailure: "block"` (FR-015, R5). |
| Tiempo límite por defecto: 600 para hooks `command`. | Se fija explícito (R5). |
| `${CLAUDE_PROJECT_DIR}` apunta a la raíz del proyecto. | Rutas de los scripts independientes del directorio actual. |
| En Windows, los hooks corren en Git Bash por defecto, o en PowerShell si no hay Git Bash. `node "<ruta>"` funciona en ambos porque `node` es un ejecutable real. Las rutas llegan con barras invertidas. | Un único comando `node …` multiplataforma; el guardián normaliza `\` a `/` (R4). |
| Todos los hooks que coinciden corren **en paralelo**; basta un *deny* para bloquear. | Un solo guardián que agrega todos los motivos, en lugar de varios hooks independientes (R2). |
| Las reglas `permissions.deny` se evalúan antes que `allow`, y un `allow` no hace excepción a un `deny`. Dentro del **mismo** archivo, una negación `!` en `deny` sí excluye. Las reglas `Read(...)` aplican, *best effort*, a Grep y Glob, **no** a Bash. | Segunda capa para `.env` con `deny` y negación para `.env.example` (R4). |
| `disableAllHooks: true` en la configuración local o de usuario desactiva los hooks del proyecto. Sin configuración gestionada (*managed*), el proyecto no puede impedirlo. Las reglas `deny` no son hooks y no se desactivan con esa opción. | Riesgo residual documentado; las reglas `deny` mantienen la protección de secretos aunque se apaguen los hooks (R9). |
| Grep respeta `.gitignore`; Glob y Read con ruta directa no. | `.gitignore` no es un control de secretos: hace falta el guardián (R4). |

---

## R1 ★ Mecanismo: hooks de Claude Code en la configuración compartida

- **Decisión**: los controles son hooks `command` de Claude Code declarados en `.claude/settings.json`: uno `PreToolUse` (el guardián) y uno `PostToolUse` (el formateador). Esto cumple FR-013.
- **Motivo**: es el mínimo que exige el issue. Se ejecuta de forma determinista en cada acción del modelo, sin depender de que alguien lo recuerde, y llega a todos al clonar.
- **Alternativas descartadas**:
  - **Solo reglas en `CLAUDE.md` o `.claude/rules/`**: el modelo las puede ignorar; no son deterministas.
  - **Hooks de Git (`pre-commit`)**: actúan al hacer commit, cuando el dato ya se escribió en disco y quizá ya pasó por el contexto del modelo. Además, no cubren lecturas de secretos. Pueden sumarse después, pero no reemplazan el control en el momento de la acción.

## R2 ★ Un guardián PreToolUse que agrega todos los controles

- **Decisión**: un único script, `.claude/hooks/guardian.ts`, recibe la acción, ejecuta los tres controles que apliquen (`datos-reales`, `secretos`, `spec-primero`) y devuelve un solo *deny* con **todos** los motivos, o nada.
  - **Matcher**: `Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Bash|PowerShell|mcp__.*`.
- **Motivo**: FR-014 pide informar todos los motivos. Con varios hooks en paralelo, cada uno informaría solo el suyo y se repetiría el arranque de Node. Un solo punto de entrada también simplifica las pruebas.
- **Alternativas descartadas**: un hook por control, que da mensajes fragmentados y N arranques por acción; o un matcher `.*`, que ejecutaría el guardián también en herramientas sin riesgo, como Glob o TodoWrite.

## R3 ★ Detección de datos con forma real y convención ficticia "prefijo `000`"

- **Decisión**:
  - Detección según la aclaración Q2 ([data-model.md](data-model.md)):
    - **Tarjeta**: Luhn, en cualquier contexto.
    - **Cédula, NIT y cuenta**: palabra clave en la misma línea y rango de dígitos.
  - **Convención ficticia**: todo identificador ficticio empieza por `000`. Fuente única en `.claude/hooks/lib/convencion-ficticia.ts`, con su versión legible en `docs/datos-ficticios.md`, sincronizadas por una prueba.
  - **Qué se revisa**: el contenido escrito (Write, Edit, MultiEdit), el texto completo de los comandos de shell y todos los textos de entrada de las herramientas MCP, por ejemplo comentarios y cuerpos de PR (FR-002).
  - **Datos detectados**: se muestran enmascarados en el mensaje (solo los últimos 4 dígitos).
- **Motivo**:
  - Luhn distingue una tarjeta de un monto casi sin falsos positivos.
  - Para cédula, NIT y cuenta, sin contexto no hay forma de separarlas de un monto, y la palabra clave en la línea es la señal más simple.
  - Ningún identificador real empieza por `000`, así que la convención se verifica sin listas y se reconoce a simple vista.
  - Revisar todo el texto del comando es más simple y más seguro que decidir si un comando escribe.
- **Alternativas descartadas**:
  - **Detección solo por longitud**: bloquea montos (opción B de Q2).
  - **Marcador textual** (por ejemplo, `FICTICIO-…`): rompe los campos numéricos en el código.
  - **Rango reservado distinto por tipo**: más reglas que recordar.
  - **Lista blanca de valores ficticios**: hay que mantenerla en cada ticket.
  - **Revisar solo comandos que escriben**: no se puede decidir con certeza qué comando escribe.

## R4 ★ Secretos: guardián más reglas `deny` como segunda capa

- **Decisión**:
  - **Archivo protegido**: nombre `.env` o `.env.*`, en cualquier carpeta, salvo `.env.example`.
  - **Capa 1, el guardián**:
    - Bloquea Read, Write, Edit y MultiEdit sobre un archivo protegido.
    - Bloquea Grep con `path` que apunte a uno.
    - En Bash y PowerShell bloquea dos casos:
      - (a) un comando con un argumento que nombra un archivo protegido o un comodín que lo alcanza (FR-006);
      - (b) comandos recursivos o de comodín amplio (`grep -r`, `rg --no-ignore`/`-uu`/`--hidden`, `find … -exec`, `xargs`, `cat .*`, `Get-ChildItem -Recurse | Get-Content`, `Select-String -Path` con comodín…) cuyo alcance contiene un archivo protegido existente y que no lo excluyen (por ejemplo, `--exclude=.env*`), según FR-006a.
    - El alcance se resuelve contra el sistema de archivos en el momento del hook. Por eso una búsqueda en `src/` sin `.env` se permite.
    - `rg` sin opciones de no-ignorar respeta `.gitignore`, y `.env` está ignorado, así que se permite.
  - **Capa 2, permisos**: `permissions.deny` en `.claude/settings.json` con `Read(**/.env)`, `Read(**/.env.*)`, `Edit(**/.env)`, `Edit(**/.env.*)` y la negación `Read(!**/.env.example)`, `Edit(!**/.env.example)` en el mismo archivo.
- **Motivo**: el guardián cubre shell y recursión (FR-006, FR-006a), que las reglas de permisos no cubren. Las reglas `deny` siguen activas aunque alguien apague los hooks (R9).
- **Alternativas descartadas**:
  - **Solo `permissions.deny`**: no cubre Bash ni PowerShell.
  - **`Bash(cat .env)` en `deny`**: la documentación advierte que no es un límite de seguridad, y la lista de comandos posibles es infinita.
  - **Sandbox de sistema de archivos**: depende de la plataforma y va más allá de lo que pide el ticket (YAGNI).
  - **Confiar en `.gitignore`**: Read y Glob no lo respetan.

## R5 ★ Fallar cerrado y tiempo límite

- **Decisión**:
  - El guardián envuelve todo en un `try/catch`. Cualquier error, incluido un JSON de entrada que no cumple el esquema, se responde con *deny* y la causa (control `error-interno`).
  - El hook declara `"onFailure": "block"` y `"timeout": 10`, este último para el guardián.
  - Se exige Claude Code v2.1.295 o posterior, y el quickstart lo verifica.
- **Motivo**: FR-015 y el Principio VI de la constitución, que pide errores con tipo y causa, nunca silenciados. `onFailure: "block"` cubre lo que el `try/catch` no alcanza: Node ausente, un error de sintaxis o un tiempo agotado.
- **Alternativas descartadas**: el comportamiento por defecto (*fail-open*), que deja pasar la acción si el script falla, contradice FR-015.

## R6 Entrada defensiva y normalización de rutas

- **Decisión**: un esquema de entrada tolerante (`tool_name` obligatorio, `tool_input` como objeto).
  - Los textos se extraen de los campos conocidos (`content`, `new_string`, `edits[].new_string`, `command`, `new_source`) y, en herramientas MCP, de **todos** los valores de texto del objeto.
  - Las rutas se normalizan: `\` → `/` y se pasan a relativas a `${CLAUDE_PROJECT_DIR}`.
- **Motivo**: el esquema de MultiEdit, Write y Edit no se verificó en la documentación, y Windows envía barras invertidas. Extraer de más es seguro: solo puede bloquear de más, nunca dejar pasar.
- **Alternativas descartadas**: un esquema estricto por herramienta, que fallaría cerrado ante cualquier campo nuevo y bloquearía todo el trabajo.

## R7 ★ Spec primero: rama → `Issue de origen`

- **Decisión**: según la aclaración Q3, el ticket sale de `git branch --show-current` con el patrón `^([1-9][0-9]*)-`. La spec es la `specs/*/spec.md` cuya línea `**Issue de origen**` apunta al #N.
  - Aplica a Write, Edit y MultiEdit con ruta bajo `src/` (Q1, tests incluidos).
  - Aplica también a comandos de shell que escriben bajo `src/` con una redirección (`>`, `>>`), con `tee`, con `cp` o `mv` hacia `src/`, o con `Set-Content`, `Out-File` o `New-Item`. Esto es *best effort*: un comando ofuscado queda como riesgo residual.
- **Motivo**: reutiliza la convención de ramas de `/ticket-tomar` y la línea obligatoria de las specs (regla de `specs/`), sin estado adicional.
- **Alternativas descartadas**: la feature activa de `.specify/feature.json`, que no ata la edición al ticket de la rama; o "cualquier spec", que casi nunca bloquea (opciones B y D de Q3).

## R8 ★ Lenguaje y ejecución: TypeScript con Node, sin compilar

- **Decisión**: los hooks se escriben en TypeScript `strict` y se ejecutan con `node` directamente. Node 24 elimina los tipos de forma nativa.
  - `tsconfig.json`: `strict`, `noEmit`, `erasableSyntaxOnly`, `allowImportingTsExtensions` y `verbatimModuleSyntax`.
  - `package.json`: `"type": "module"` y `engines.node >= 22.18`.
  - Pruebas con el corredor nativo `node --test`.
  - Los controles bloqueantes **no tienen dependencias**: con Node instalado funcionan al clonar (SC-006).
- **Motivo**: es el stack de la constitución, sin paso de compilación ni dependencias en el camino crítico.
- **Alternativas descartadas**:
  - **Scripts Bash o PowerShell**: no son portables entre Windows y Unix y no son el stack del proyecto.
  - **`tsx` o `ts-node`**: suman una dependencia al camino crítico del bloqueo.
  - **JavaScript plano**: pierde el tipado `strict` que exige la constitución.
  - **Vitest o Jest**: dependencia innecesaria para probar funciones puras (YAGNI). El #7 puede adoptarlos para el agente.

## R9 Riesgos residuales aceptados

- **`disableAllHooks`** en la configuración local o de usuario apaga el guardián y el formateador. Mitigaciones:
  - las reglas `deny` de R4 siguen protegiendo `.env` de las herramientas de archivos;
  - `.claude/settings.local.json` es personal y su uso para apagar controles va contra las convenciones del equipo.

  Bloquearlo de verdad requiere configuración gestionada, fuera de alcance.
- **Comandos ofuscados** (nombres armados en tiempo de ejecución, `eval`, codificación): el análisis estático no los detecta.
- **Ediciones fuera de Claude Code**: fuera de alcance, según el supuesto de la spec.
- **Monto y palabra clave de cuenta en la misma línea con 10 o más dígitos**: falso positivo aceptado en la aclaración Q2; el mensaje explica cómo reescribir.

## R10 ★ Formato: Prettier en PostToolUse

- **Decisión**:
  - `.claude/hooks/formatear.ts`, en `PostToolUse` con matcher `Write|Edit|MultiEdit`, formatea con la API de Prettier el archivo editado si su extensión es `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` o `.json`.
  - Las demás extensiones quedan sin cambios y sin aviso.
  - Si Prettier falla, por ejemplo por un error de sintaxis o porque no está instalado, sale con 2 y el motivo, y la edición se conserva.
  - Archivos de configuración: `.prettierrc.json` (`printWidth: 100`) y `.prettierignore` (`*.md`, `specs/`, `.specify/`, `node_modules/`), para que `format:check` tampoco revise Markdown.
  - `npm run format:check` verifica todo el repositorio (SC-004).
- **Motivo**: Prettier es el formateador estándar de TypeScript y no tiene opciones de estilo que discutir. Markdown queda fuera para no reescribir specs y documentos.
- **Costo aceptado**: Prettier es una dependencia de desarrollo y requiere `npm install`. Sin ella, el formateador informa al modelo en cada edición, y los controles bloqueantes siguen funcionando.
- **Alternativas descartadas**:
  - **Biome**: también válido, pero menos extendido.
  - **`tsc` o ESLint `--fix`**: no son formateadores.
  - **Formatear en un hook de commit**: no cumple "después de cada edición".
  - **Incluir Markdown**: reformatearía tablas y specs sin pedirlo.

## R11 Pruebas de los controles

- **Decisión**:
  - Cada módulo de control tiene su `*.test.ts` al lado (regla de tests), con casos que se bloquean y casos que pasan.
  - Hay una prueba de punta a punta que ejecuta `guardian.ts` como proceso con un JSON de entrada y verifica la salida.
  - Los valores con forma real se generan en tiempo de ejecución (Luhn calculado, concatenación), así que ningún archivo de pruebas los contiene literalmente (FR-018).
  - Los casos de la rama se prueban inyectando la rama, sin depender del repositorio real.
- **Motivo**: FR-017, FR-018 y SC-001. Si las pruebas escribieran datos reales literales, el propio guardián las bloquearía.
- **Alternativas descartadas**: probar solo de punta a punta, que es lento y da diagnósticos pobres; o desactivar el guardián para escribir las pruebas, que contradice el ticket.
