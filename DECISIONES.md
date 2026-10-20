# Decisiones del ecosistema

Para cada una de las 11 necesidades del enunciado: el mecanismo elegido, por qué y la alternativa descartada. El detalle por ticket, con todas las decisiones, está en [docs/registro-decisiones.md](docs/registro-decisiones.md).

## 1. Las convenciones del equipo llegan al clonar, sin configurar nada

**Mecanismo**: `CLAUDE.md` en la raíz, versionado, que importa la constitución con `@` y trae las reglas por zona en `.claude/rules/`.

**Por qué**: Claude Code lo carga solo y la constitución queda como única fuente de verdad.

**Descartado**: copiar un resumen de los principios, porque se desincroniza en cada enmienda.

**Detalle**: [specs/002-memoria-convenciones-equipo/research.md](specs/002-memoria-convenciones-equipo/research.md)

## 2. Las preferencias personales no afectan a los compañeros

**Mecanismo**: `CLAUDE.local.md` y `.claude/settings.local.json`, ambos en `.gitignore`.

**Por qué**: es el mecanismo documentado para lo personal por proyecto, y git no lo versiona por accidente.

**Descartado**: importar un archivo personal desde el `CLAUDE.md` compartido, porque a todo el equipo le saldría un diálogo de aprobación por un archivo ajeno.

**Detalle**: [specs/002-memoria-convenciones-equipo/research.md](specs/002-memoria-convenciones-equipo/research.md)

## 3. Los tests viven junto al código y siguen las mismas convenciones

**Mecanismo**: la regla `.claude/rules/tests.md`, con alcance por ruta `**/*.test.ts`. Un test se llama `<archivo>.test.ts` y vive al lado de su archivo.

**Por qué**: la regla solo carga cuando se toca un test y deja una sola convención de nombre.

**Descartado**: `.test` más `.spec` más carpetas `tests/`, que suman patrones y una segunda convención.

**Detalle**: [specs/002-memoria-convenciones-equipo/research.md](specs/002-memoria-convenciones-equipo/research.md)

## 4. No se escribe código de un ticket sin su especificación

**Mecanismo**: el control `spec-primero` del guardián (hook `PreToolUse`). Escribir bajo `src/` exige una `spec.md` cuyo «Issue de origen» sea el ticket de la rama.

**Por qué**: es determinista, no depende de que alguien lo recuerde, y reutiliza la convención de ramas.

**Descartado**: la feature activa de `.specify/feature.json`, que no ata la edición al ticket de la rama.

**Detalle**: [specs/003-guardarrailes-hooks/research.md](specs/003-guardarrailes-hooks/research.md)

## 5. Ningún archivo contiene documento, cuenta o tarjeta con forma real

**Mecanismo**: el control `datos-reales` del mismo guardián. La tarjeta se detecta con Luhn y la cédula, el NIT y la cuenta, con palabra clave. Lo ficticio empieza por `000`, según [docs/datos-ficticios.md](docs/datos-ficticios.md).

**Por qué**: una convención simple deja distinguir lo ficticio de lo real sin listas que mantener.

**Descartado**: detectar solo por longitud, porque bloquea los montos.

**Detalle**: [specs/003-guardarrailes-hooks/research.md](specs/003-guardarrailes-hooks/research.md)

## 6. Los archivos de secretos no se leen ni se modifican desde Claude Code

**Mecanismo**: el control `secretos` del guardián más reglas `deny` en `.claude/settings.json`, como segunda capa.

**Por qué**: `deny` no cubre los comandos de shell; el guardián sí, y falla cerrado.

**Descartado**: solo `permissions.deny`, que no alcanza a Bash ni a PowerShell. Tampoco `.gitignore`, que Read y Glob no respetan.

**Detalle**: [specs/003-guardarrailes-hooks/research.md](specs/003-guardarrailes-hooks/research.md)

## 7. El código queda formateado después de cada edición

**Mecanismo**: hook `PostToolUse` sobre Write, Edit y MultiEdit que formatea con Prettier.

**Por qué**: es el formateador estándar y no deja estilo que discutir.

**Descartado**: formatear en un hook de commit, porque no cumple «después de cada edición».

**Detalle**: [specs/003-guardarrailes-hooks/research.md](specs/003-guardarrailes-hooks/research.md)

## 8. Antes de abrir un PR, una revisión independiente de la sesión que escribió el código

**Mecanismo**: el subagente `revisor-codigo`, invocado por la skill `revisar-codigo` con `context: fork`, solo lectura. El control `puerta-pr` del guardián niega crear el PR sin una decisión favorable.

**Por qué**: un contexto aislado no hereda el razonamiento del autor, y la puerta lo vuelve obligatorio.

**Descartado**: confiar solo en los pasos de la skill, porque el modelo podría saltárselos.

**Detalle**: [specs/004-revision-independiente-pr/research.md](specs/004-revision-independiente-pr/research.md)

## 9. Una revisión de cumplimiento verifica las reglas de negocio

**Mecanismo**: el subagente `revisor-cumplimiento` y la skill `revisar-cumplimiento`, con la misma estructura. Contrasta el diff con las reglas 1 a 5 de la constitución y entrega el estado de cada una.

**Por qué**: un rol propio mantiene cada prompt corto y sin hallazgos de estilo mezclados.

**Descartado**: un solo revisor para las dos revisiones, que mezcla criterios y no cumple el mínimo de dos subagentes.

**Detalle**: [specs/004-revision-independiente-pr/research.md](specs/004-revision-independiente-pr/research.md)

## 10. El estado de los tickets se sincroniza con el avance real, sin intervención manual

**Mecanismo**: comandos propios `/ticket-tomar`, `/ticket-abrir-pr` y `/ticket-cerrar`, que actúan solo por el servidor MCP de GitHub. Los hooks de Spec Kit publican los avances de especificación y plan.

**Por qué**: cumple a la vez los mínimos de MCP y de comandos propios, sin secretos en el repositorio.

**Descartado**: GitHub Actions, cuyo token no accede a los Projects de usuario, y un script propio, que duplica lo que ya da el MCP.

**Detalle**: [specs/001-sincronizacion-backlog-github/research.md](specs/001-sincronizacion-backlog-github/research.md)

## 11. Otro equipo puede instalar las piezas reutilizables

**Mecanismo**: el plugin `crediagil-controles` y su catálogo `.claude-plugin/marketplace.json`, dentro de este repositorio. Trae un hook, un subagente y una skill genéricos.

**Por qué**: un solo lugar para fuentes, copias y catálogo, sin segundo repositorio que sincronizar.

**Descartado**: un repositorio aparte solo para el plugin, que añade otro lugar donde la copia puede derivar.

**Detalle**: [specs/016-plugin-reutilizable-equipos/research.md](specs/016-plugin-reutilizable-equipos/research.md)
