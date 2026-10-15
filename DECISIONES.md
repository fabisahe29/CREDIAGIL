# Registro de decisiones

Decisiones de diseño del proyecto, con su motivo y las alternativas descartadas. La más reciente va primero. Cada entrada enlaza al issue y a la investigación que la respalda.

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
