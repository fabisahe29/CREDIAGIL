# Registro de decisiones

Decisiones de diseño del proyecto, con su motivo y las alternativas descartadas. La más reciente va primero. Cada entrada enlaza al issue y a la investigación que la respalda.

---

## 2026-10-15 · Guardarraíles del repositorio con hooks

**Issue**: [#5 — Guardarraíles del repositorio con hooks](https://github.com/fabisahe29/CREDIAGIL/issues/5)

**Detalle**: [specs/003-guardarrailes-hooks/research.md](specs/003-guardarrailes-hooks/research.md), decisiones R1, R2, R3, R4, R5, R7, R8 y R10; riesgos en R9

### Decisión 1: hooks de Claude Code en la configuración compartida

Los controles son dos hooks `command` declarados en `.claude/settings.json`:

- el guardián (`PreToolUse`), que bloquea antes de ejecutar;
- el formateador (`PostToolUse`), que actúa después de cada edición.

**Motivo**: se ejecutan de forma determinista en cada acción del modelo, sin depender de que alguien los recuerde, y llegan a todos al clonar.

**Alternativas descartadas**:

- **Solo reglas en `CLAUDE.md` o `.claude/rules/`**: el modelo puede ignorarlas.
- **Hooks de Git (`pre-commit`)**: actúan cuando el dato ya se escribió y no cubren la lectura de secretos.

### Decisión 2: un solo guardián que agrega todos los motivos

`.claude/hooks/guardian.ts` ejecuta los tres controles (`secretos`, `datos-reales` y `spec-primero`) y devuelve un único *deny* con todos los motivos.

**Motivo**: el modelo recibe en un solo mensaje todo lo que tiene que corregir. Además, Node arranca una sola vez por acción.

**Alternativas descartadas**:

- **Un hook por control**: los hooks corren en paralelo, así que el modelo recibiría mensajes fragmentados, y Node arrancaría N veces por acción.
- **Matcher `.*`**: ejecutaría el guardián también en herramientas sin riesgo.

### Decisión 3: datos con forma real y convención ficticia "prefijo `000`"

**Qué se detecta**:

- **Tarjetas**: por dígito de control Luhn, en cualquier contexto.
- **Cédulas, NIT y cuentas**: solo cuando hay una palabra clave en la misma línea.
- **Convención ficticia**: todo identificador ficticio empieza por `000`. Su fuente única es `.claude/hooks/lib/convencion-ficticia.ts`, y [docs/datos-ficticios.md](docs/datos-ficticios.md) es su versión para personas; una prueba mantiene ambos sincronizados.

**Dónde se revisa**: el contenido escrito, el texto completo de los comandos y los textos de las herramientas MCP.

**Motivo**:

- Luhn distingue una tarjeta de un monto.
- Para los demás tipos, la palabra clave es la única señal simple que los separa de un monto.
- Ningún identificador real empieza por `000`.

**Alternativas descartadas**:

- **Detección por longitud**: bloquea montos.
- **Marcador textual** (`FICTICIO-…`): rompe los campos numéricos.
- **Lista blanca de valores**: hay que mantenerla en cada ticket.
- **Revisar solo los comandos que escriben**: no se puede decidir con certeza qué comando escribe.

**Consecuencias**: un monto de 10 o más dígitos en la misma línea que la palabra "cuenta" se bloquea, y hay que reformular la línea. La propia implementación lo encontró en tres líneas de la documentación del ticket, que se reescribieron.

### Decisión 4: secretos en dos capas

1. **El guardián** bloquea:
   - las herramientas de archivos sobre `.env` y `.env.*`;
   - los comandos que nombran esos archivos o los alcanzan con un comodín;
   - los comandos recursivos que los alcanzan sin excluirlos.
2. **`permissions.deny`** en `.claude/settings.json` bloquea `Read` y `Edit` de esos archivos, con una negación para `.env.example`.

**Motivo**: el guardián cubre la shell, que las reglas de permisos no cubren. Las reglas `deny` siguen activas aunque alguien apague los hooks.

**Alternativas descartadas**:

- **Solo `permissions.deny`**: no cubre Bash ni PowerShell.
- **Reglas `Bash(cat .env)`**: la documentación advierte que no son un límite de seguridad.
- **Sandbox**: va más allá de lo que pide el ticket.
- **Confiar en `.gitignore`**: Read y Glob no lo respetan.

### Decisión 5: fallar cerrado

El guardián convierte cualquier error en un *deny* con su causa. Además, el hook declara `onFailure: "block"` y `timeout: 10`.

**Motivo**: por defecto, un hook que falla deja pasar la acción. `onFailure` cubre lo que el `try/catch` no alcanza: que falte Node, un error de sintaxis o un tiempo agotado.

**Alternativa descartada**: el comportamiento por defecto (*fail-open*).

**Consecuencias**: requiere Claude Code v2.1.295 o posterior.

### Decisión 6: spec primero, por rama e `Issue de origen`

El número del ticket sale de la rama `<N>-slug`. Escribir bajo `src/` exige una spec cuya línea `**Issue de origen**` apunte al #N.

- Los tests bajo `src/` también cuentan como código de producción (aclaración Q1).
- Se revisan también las escrituras por shell hacia `src/`.

**Motivo**: reutiliza la convención de ramas de `/ticket-tomar` y la línea obligatoria de las specs, sin estado adicional.

**Alternativas descartadas**:

- **La feature activa de `.specify/feature.json`**: no ata la edición al ticket de la rama.
- **"Cualquier spec"**: casi nunca bloquea.

### Decisión 7: TypeScript ejecutado por Node, sin compilar ni dependencias en el bloqueo

Los hooks están en TypeScript `strict` y se ejecutan con `node` directamente (Node 22.18 o superior). Las pruebas usan `node --test`. La entrada se valida con guardas de tipo propias en lugar de Zod.

**Motivo**: es el stack de la constitución, y los bloqueos funcionan al clonar, sin `npm install`.

**Alternativas descartadas**:

- **Scripts Bash o PowerShell**: no son portables.
- **`tsx` o Zod**: suman dependencias al camino del bloqueo.
- **Vitest**: no hace falta para probar funciones puras.

### Decisión 8: Prettier en `PostToolUse`, solo para código

El formateador aplica Prettier a los archivos `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` y `.json` editados. Si falla, conserva la edición y avisa al modelo.

**Motivo**: es el formateador estándar del stack, y Markdown queda fuera para no reescribir specs.

**Alternativas descartadas**:

- **Biome**: menos extendido.
- **Formatear en un hook de commit**: no cumple "después de cada edición".
- **Incluir Markdown**: reescribiría las specs.

**Consecuencias**: el formateador necesita `npm install`; los bloqueos no.

### Riesgos residuales aceptados

- **`disableAllHooks`** en la configuración local o de usuario apaga los hooks. Las reglas `deny` siguen protegiendo `.env`, y bloquearlo de verdad requiere configuración gestionada.
- **Comandos ofuscados** (nombres armados en tiempo de ejecución, `eval`): el análisis estático no los detecta.
- **Ediciones fuera de Claude Code**: fuera del alcance de este ticket.

---

## 2026-10-15 · Memoria y convenciones del equipo: dónde vive cada cosa

**Issue**: [#4 — Memoria y convenciones del equipo](https://github.com/fabisahe29/CREDIAGIL/issues/4)

**Detalle**: [specs/002-memoria-convenciones-equipo/research.md](specs/002-memoria-convenciones-equipo/research.md), decisiones R1, R2, R3, R4, R7 y R8

### Decisión 1: memoria del proyecto en `./CLAUDE.md`

Las convenciones del equipo están en `CLAUDE.md`, en la raíz, en menos de 60 líneas.

**Motivo**: Claude Code lo carga al iniciar sin configuración, y quien abre el repositorio lo ve sin buscarlo.

**Alternativa descartada**: `.claude/CLAUDE.md`. Funciona igual, pero queda escondido entre la configuración de herramientas.

**Consecuencias**: lo específico de una zona no va aquí, va a su regla por ruta, para que la memoria siga siendo corta.

### Decisión 2: `@import` de la constitución

`CLAUDE.md` importa la constitución con `@.specify/memory/constitution.md`. Es el uso justificado de importación que pide el ticket.

**Motivo**: las reglas no negociables deben estar siempre en contexto, y con la importación se mantiene una sola fuente de verdad, sin duplicar contenido. La ruta está dentro del repositorio, así que no aparece el diálogo de aprobación de importaciones externas.

**Alternativas descartadas**:

- **Copiar un resumen de los principios**: se desincroniza en cada enmienda de la constitución.
- **Poner solo un enlace en texto**: Claude no lo carga salvo que alguien lo pida.
- **Un `CLAUDE.md` por subdirectorio**: también se carga bajo demanda, igual que las reglas por ruta, y tener dos mecanismos para lo mismo hace difícil saber qué se carga y cuándo.

**Consecuencias**: la constitución, de unas 150 líneas, se carga en cada sesión. Es un costo aceptado, porque es el contenido de mayor riesgo si se omite.

### Decisión 3: cuatro reglas por ruta en `.claude/rules/`

Hay una regla para cada zona:

- `tests.md`: `**/*.test.ts`
- `politica.md`: `src/politica/**`
- `servidor-mcp.md`: `src/mcp/**`
- `specs.md`: `specs/**`

Cada una tiene solo la clave `paths` en el frontmatter. Solo cuenta como test un archivo con sufijo `.test`; los `.spec` y los fixtures no, según la aclaración Q3 de la spec.

**Motivo**: cada zona carga su contexto solo cuando se trabaja en ella, y al definir el alcance por patrón la regla cubre también las carpetas que todavía no existen.

**Alternativas descartadas**:

- **Reglas sin `paths`**: se cargarían siempre.
- **Una sola regla para todo**: mezclaría zonas.
- **Incluir `.spec` y `fixtures/` en la regla de tests**: sumaría una segunda convención de nombre. Los fixtures ya quedan protegidos por la constitución importada (Principio II).

**Consecuencias**: `src/politica/` y `src/mcp/` se fijan antes de existir. El issue #7 debe usar esas rutas o ajustar los `paths`. Además, un YAML inválido haría que la regla se cargue siempre, así que la validación comprueba que ninguna regla se cargue al iniciar.

### Decisión 4: memoria personal en `CLAUDE.local.md`

Las preferencias personales del proyecto van en `CLAUDE.local.md`, que está en `.gitignore`. Las preferencias que valen para todos los proyectos van en `~/.claude/CLAUDE.md`.

**Motivo**: es el mecanismo documentado para memoria personal por proyecto. Claude Code no lo ignora de forma automática, por eso se declara en `.gitignore`.

**Alternativas descartadas**:

- **Importar `@~/.claude/…` desde el `CLAUDE.md` compartido**: mostraría a todo el equipo un diálogo de aprobación por un archivo que solo existe en una máquina.
- **Una sección "personal" dentro de `CLAUDE.md`**: se versionaría para todos.

### Decisión 5: configuración compartida y configuración personal separadas

- `.claude/settings.json` está versionado y habilita el MCP `github` del proyecto (`enabledMcpjsonServers`), que necesitan los comandos `/ticket-*`.
- `.claude/settings.local.json` es personal y está en `.gitignore`.

**Motivo**: la configuración local tiene prioridad y las listas se combinan, así que lo personal se suma sin modificar lo compartido. Claude Code solo ignora el archivo local de forma automática cuando él mismo lo crea, y lo hace en el *exclude* global, no en `.gitignore`; por eso se declara aquí de forma explícita.

**Alternativas descartadas**:

- **No versionar ninguna configuración**: cada persona tendría que aprobar el MCP por su cuenta.
- **Permisos amplios en la configuración compartida**: impondría a todos lo que es preferencia de cada uno.

---

## 2026-10-15 · Sincronización del backlog: comandos propios por MCP y hooks de Spec Kit

**Issue**: [#3 — Sincronización autónoma del backlog con GitHub](https://github.com/fabisahe29/CREDIAGIL/issues/3)

**Detalle**: [specs/001-sincronizacion-backlog-github/research.md](specs/001-sincronizacion-backlog-github/research.md), R1 y R2

### Decisión 1: mecanismo de sincronización

El ciclo de vida del ticket lo gestionan cuatro **comandos propios de Claude Code**, versionados en `.claude/skills/`:

- `/ticket-tomar`
- `/ticket-avance`
- `/ticket-abrir-pr`
- `/ticket-cerrar`

Los comandos actúan sobre GitHub **solo** con el servidor MCP oficial de GitHub, configurado en `.mcp.json` con el token en la variable de entorno `GIT_HUB`. Cada transición del ticket (Todo → In Progress → In review → Done) ocurre en un solo paso, junto con su efecto en GitHub (rama, PR o fusión) y su comentario de avance.

**Motivo**:

- Cumple dos mínimos del enunciado a la vez: usar el servidor MCP de GitHub y tener comandos propios compartidos por control de versiones.
- No exige secretos en el repositorio ni en GitHub.
- Sigue el Principio IV de la constitución: actuar sobre sistemas externos solo mediante herramientas MCP.
- La fusión la hace el mismo comando que mueve el ticket a Done, así que ese paso no depende de que alguien se acuerde de hacerlo.

**Alternativas descartadas**:

- **GitHub Actions + workflows integrados del Project** ("Item closed → Done"). El `GITHUB_TOKEN` de Actions no tiene acceso a Projects de usuario, así que habría que guardar un token personal como secreto del repositorio. Además, los workflows del Project se configuran en la web y no quedan versionados.
- **Script propio** (Node/TypeScript con Octokit o `gh`). Duplica lo que ya ofrece el MCP, agrega dependencias y una segunda vía de autenticación, y no cumple el mínimo de usar el servidor MCP de GitHub. Contradice el principio de simplicidad (YAGNI) de la constitución.

**Consecuencias**:

- No hay pruebas automatizadas del flujo, porque no hay código. La validación es manual con [quickstart.md](specs/001-sincronizacion-backlog-github/quickstart.md).
- Si un PR se fusiona desde la web, el ticket no pasa a Done hasta que se ejecuta `/ticket-cerrar`. El comando detecta que la fusión ya ocurrió y completa lo que falta.

### Decisión 2: comentarios de especificación y plan

Los comentarios de los hitos "especificación terminada" y "plan terminado" los publican **hooks de Spec Kit**. Son hooks obligatorios, `after_specify` y `after_plan`, definidos en `.specify/extensions.yml`, y ambos invocan `/ticket-avance`.

**Motivo**: los hitos se publican sin intervención manual y sin modificar los comandos de Spec Kit, que se regeneran al actualizar Spec Kit.

**Alternativas descartadas**:

- **Invocar `/ticket-avance` a mano**: el hito depende de la memoria de quien trabaja, que es justo lo que el issue quiere evitar.
- **Editar los comandos `speckit-specify` y `speckit-plan`**: los cambios se pierden en cada actualización de Spec Kit.

**Consecuencias**: el hook también corre al especificar algo sin issue de origen. En ese caso `/ticket-avance` lo informa y termina sin error.
