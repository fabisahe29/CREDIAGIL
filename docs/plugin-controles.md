# Plugin `crediagil-controles`: instalación y uso

Un plugin de Claude Code con los controles reutilizables de este proyecto. Sirve a cualquier equipo que quiera los mismos controles sin copiar archivos a mano: bloqueo de secretos y de datos con forma real, un revisor que solo lee y una revisión contra las reglas que declare el propio equipo.

## Qué incluye

| Pieza | Qué hace |
|-------|----------|
| **Hook** `guardian-controles` | Antes de cada acción de Claude Code bloquea los archivos `.env`, los datos con forma real (cédula, NIT, cuenta, tarjeta) y que un revisor escriba. |
| **Subagente** `revisor-reglas` | Revisa un cambio contra las reglas del equipo. Solo tiene `Read`, `Grep` y `Glob`: informa, no modifica nada. |
| **Skill** `revisar-reglas` | Obtiene el diff, se lo entrega al revisor y explica cómo leer el informe. |

Lo propio de originación de crédito y del flujo de tickets de este proyecto no viaja en el plugin.

**Convención de nombres de revisores.** El hook trata como revisor, y lo deja en solo lectura, a todo subagente cuyo nombre empiece por `revisor-`, con o sin prefijo de plugin (`revisor-reglas`, `crediagil-controles:revisor-reglas`). Si un equipo crea un subagente que sí necesita escribir, no debe llamarlo `revisor-…`.

## Requisitos

- Claude Code 2.1.275 o posterior.
- Node.js 22.18 o posterior. El hook ejecuta TypeScript directamente, sin compilar. Si el equipo usa una versión anterior, el hook no arranca y la acción se bloquea con un error legible.

## Instalar

Desde el repositorio del equipo, en un solo paso:

```text
claude plugin install crediagil-controles --marketplace fabisahe29/CREDIAGIL --scope project
```

O en dos pasos, para ver primero el catálogo:

```text
claude plugin marketplace add fabisahe29/CREDIAGIL --scope project
claude plugin install crediagil-controles@crediagil --scope project
```

También se puede hacer desde una sesión de Claude Code con `/plugin`. El alcance `project` deja la instalación declarada en `.claude/settings.json` del repositorio, así que todo el equipo la recibe al abrirlo.

Para comprobar que quedó instalado:

```text
claude plugin list
```

Debe aparecer `crediagil-controles@crediagil` con su versión y el estado `enabled`.

## Usar cada pieza

### El hook

No hay nada que invocar: actúa solo. Si Claude intenta escribir un archivo con un dato con forma real, la acción se bloquea y el mensaje dice qué se detectó, en qué archivo y línea (con el valor enmascarado) y cómo corregirlo.

La convención por defecto es que todo número de identificación, cuenta o tarjeta ficticio **empieza por `000`**, contando solo los dígitos. Un equipo puede cambiar ese prefijo (ver [Configurar](#configurar-el-plugin)).

### La skill y el subagente

```text
/crediagil-controles:revisar-reglas main...HEAD
```

El argumento es un rango de git: `main...HEAD` revisa todo lo que la rama agrega respecto de `main`, `HEAD~1` el último commit, y sin argumento los cambios que aún no confirmas.

El revisor lee las reglas de `.claude/reglas-equipo.md` y devuelve, para cada una, `cumplida`, `incumplida` o `no_aplicable`. Una regla `cumplida` o `incumplida` cita archivo y línea. Una regla que no entiende la informa como `no_aplicable` con el motivo, sin interpretarla por analogía.

Sin `.claude/reglas-equipo.md`, el revisor responde `sin_configuracion` y no audita: no aplica reglas que el equipo no haya escrito.

## Configurar el plugin

La configuración vive en **el repositorio del equipo**, no en el plugin. Por eso actualizar el plugin no la toca.

### Reglas del revisor: `.claude/reglas-equipo.md`

Un encabezado de segundo nivel por regla y, debajo, el criterio que se exige:

```markdown
# Reglas del equipo

## Los montos se manejan en enteros

Ningún monto se calcula ni se compara con flotantes. Se usa un entero en la moneda local.

## Un solo módulo define los límites

Los límites de cada proceso viven en un único archivo con pruebas en el borde exacto.
```

### Ajuste del hook: `.claude/controles-equipo.json` (opcional)

```json
{ "prefijoFicticio": "999" }
```

`prefijoFicticio` es una cadena de **3 a 6 dígitos**. Un prefijo más corto coincidiría con numeración real y dejaría pasar datos reales, por eso se rechaza. Sin el archivo se usa `"000"` y el mensaje de bloqueo lo dice.

Si el archivo existe y no es válido (un prefijo con letras o de menos de 3 dígitos, un campo desconocido o un JSON roto), el hook bloquea las acciones que traen texto que revisar, con un mensaje que indica qué corregir; no lo ignora. Las acciones sin texto, como leer un archivo, no se bloquean.

**El agente no puede escribir este archivo.** El hook bloquea cualquier escritura o comando que lo nombre, para que el agente no relaje por su cuenta el control de datos con forma real. Una persona lo edita fuera de la sesión de Claude Code. Leerlo con la herramienta `Read` sí está permitido.

## Actualizar

```text
claude plugin update crediagil-controles@crediagil
```

Reinicia Claude Code para aplicar la versión nueva. La configuración del equipo, que está en su repositorio, queda intacta.

## Desinstalar

```text
claude plugin uninstall crediagil-controles@crediagil --scope project
```

Las piezas dejan de estar disponibles. El plugin no copia archivos dentro del repositorio del equipo, así que no queda nada suyo que borrar; solo conviene quitar `.claude/reglas-equipo.md` y `.claude/controles-equipo.json` si el equipo ya no los quiere.

## Si ya existe una pieza con el mismo nombre

Los componentes del plugin llevan el prefijo `crediagil-controles:` (por ejemplo, `crediagil-controles:revisor-reglas`), así que no pisan un subagente o una skill del equipo con el mismo nombre. Si el equipo ya tiene un hook propio que bloquea lo mismo, ambos se ejecutan: bloquean lo mismo y no hay un efecto adicional.

## Para quien mantiene el plugin

- **Las fuentes están en este repositorio**, en `.claude/hooks/`, `.claude/agents/` y `.claude/skills/`. La carpeta `plugins/crediagil-controles/` guarda copias generadas: no se edita a mano.
- **Generar las copias**: `npm run plugin:generar`. Si una fuente contiene una referencia propia de este repositorio, las pruebas fallan señalando la pieza y el término.
- **Detectar deriva**: `npm test` falla, nombrando la pieza, si una copia difiere de su fuente.
- **Verificar la instalación en un repositorio de prueba**: `npm run plugin:verificar`. Crea un repositorio temporal con otra estructura de carpetas, instala el plugin con una configuración aislada y deja un resultado por pieza. Si la CLI de Claude Code no está disponible, las piezas quedan como `no_verificable`.
- **Versión**: al cambiar una pieza, sube `version` en `plugins/crediagil-controles/.claude-plugin/plugin.json` con SemVer y regenera.
