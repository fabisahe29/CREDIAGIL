# Research: Plugin reutilizable para otros equipos

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Cada decisión indica qué se descartó. Los puntos que no se pudieron confirmar en la documentación de Claude Code están en R9, con su plan B y el resultado de probarlos en la implementación.

## R1. Plugin y catálogo dentro de este repositorio

**Decisión**: el catálogo es `.claude-plugin/marketplace.json` en la raíz y el plugin es `plugins/crediagil-controles/`. Otro equipo registra este repositorio como catálogo e instala el plugin por nombre.

**Motivo**: un solo lugar para versionar fuentes, copias, catálogo y pruebas. No hay segundo repositorio que sincronizar ni que dar de alta para los evaluadores.

**Descartado**: un repositorio aparte solo para el plugin, porque añade un tercer lugar donde puede derivar la copia (aclaración Q2) y exige otro acceso para evaluar.

## R2. Qué viaja: las piezas de FR-019 y su origen

**Decisión**: viajan estas piezas, definidas en `scripts/plugin/piezas.ts`:

| Pieza | Fuente en este repositorio |
|-------|----------------------------|
| Hook (entrada) | `.claude/hooks/guardian-controles.ts` y `.claude/hooks/guardian-base.ts` (nuevos) |
| Controles | `.claude/hooks/lib/` → `accion`, `bloqueo`, `shell`, `secretos`, `datos-reales`, `convencion-ficticia`, `revisores`, `config-equipo`. `generadores` es solo de pruebas y no viaja |
| Subagente | `.claude/agents/revisor-reglas.md` (nuevo) |
| Skill | `.claude/skills/revisar-reglas/SKILL.md` (nuevo) |

Quedan fuera, por FR-020: `spec-primero`, `puerta-pr`, `formatear`, `.claude/revision/`, `revisor-codigo`, `revisor-cumplimiento`, los `/ticket-*`, las skills `speckit-*` y todo `src/`.

**Motivo**: son los controles que no dependen de originación ni del flujo de tickets de este proyecto. `revisor-cumplimiento` queda fuera porque tiene las reglas 1 a 5 escritas dentro; el plugin trae un revisor nuevo que lee las reglas del equipo.

**Descartado**: empaquetar también `puerta-pr`, que depende de `.git/crediagil/revisiones/` y del flujo de tickets. Y empaquetar `revisor-codigo`, que tampoco depende de originación pero no se pidió: el mínimo del ticket es un subagente, una skill y un hook.

## R3. El generador copia byte a byte, sin transformar

**Decisión**: `scripts/plugin/generar.ts` copia cada fuente a su destino sin modificarla. La prueba de sincronía compara contenido y falla nombrando la pieza que difiere (FR-021).

**Motivo**: una copia idéntica se verifica con una comparación. Si el generador reescribiera texto, habría que probar también la reescritura, y la copia ya no sería la fuente.

**Descartado**: enlaces simbólicos, porque `init-options.json` fija `allow_symlinks: false` y en Windows exigen permisos. Y reescribir referencias al copiar, porque oculta en el generador lo que debería estar bien en la fuente.

## R4. Dejar neutras las fuentes genéricas

**Decisión**: los archivos que viajan no contienen referencias propias de este repositorio. Hay que cambiar:

- Los campos `regla` y `correccion` de `secretos` y `datos-reales`, que hoy citan la constitución, «FR-005» y `docs/datos-ficticios.md`. Pasan a explicar la regla en una frase, sin rutas.
- Los comentarios de cabecera, que citan `contracts/hooks.md`, `research.md` y números de requisito.
- El tipo `Control` en `bloqueo.ts`, que hoy enumera `spec-primero` y `puerta-pr`. Pasa a `string`.
- Las pruebas de esos archivos que afirman el texto de `regla` o `correccion`. En `datos-reales.test.ts` hay una que busca `docs/datos-ficticios.md`.
- `convencion-ficticia.test.ts`, que lee `docs/datos-ficticios.md`. La prueba se queda con la fuente, no viaja (las pruebas no se copian).

**Motivo**: FR-005 y FR-022 exigen que la copia no contenga referencias propias. Es más barato corregir la fuente una vez que reescribir en cada copia (R3).

**Descartado**: parametrizar los mensajes por configuración, porque añade un mecanismo para un texto que ningún equipo necesita cambiar.

**Efecto en este repositorio**: el guardián sigue bloqueando lo mismo. Los mensajes pierden la cita a la constitución; la trazabilidad queda en `docs/datos-ficticios.md` y en las specs, no en el mensaje.

## R5. Guardián partido en una base y dos entradas

**Decisión**: se extrae `guardian-base.ts` con `evaluar`, `respuestaDeny`, la lectura de la entrada y el arranque. `guardian.ts` (este repositorio) usa la base con sus 5 controles. `guardian-controles.ts` (plugin) la usa con `secretos`, `datosReales` y `revisores`. El contexto de la base es solo `{ raiz }`; `obtenerRama` y `obtenerHeadRemoto` pasan a la entrada de este repositorio.

**Motivo**: el plugin copia la base y su entrada sin arrastrar `spec-primero` ni `puerta-pr`. El comportamiento de fallar cerrado se mantiene en un solo código.

**Descartado**: copiar `guardian.ts` con una bandera que apague controles (deja código propio en el plugin) y mantener dos guardianes sin base común (duplica el manejo de errores).

## R6. Configuración del equipo

**Decisión**: dos archivos opcionales en el repositorio del equipo, ambos en `.claude/`:

- `reglas-equipo.md`: las reglas que el revisor audita, una por encabezado. Formato en [contracts/configuracion-equipo.md](contracts/configuracion-equipo.md).
- `controles-equipo.json`: ajustes del hook. Solo `prefijoFicticio` (por defecto `"000"`).

**Motivo**: FR-007 pide que reglas y patrones se declaren en el repositorio del equipo, y FR-013 que una actualización no los pierda: viven fuera del plugin, así que una actualización no los toca. Solo se expone lo que un equipo necesita cambiar hoy.

**Sin configuración**: el revisor responde que falta `reglas-equipo.md` y no audita (FR-008). El hook aplica la convención por defecto y lo dice en el motivo del bloqueo. Un `controles-equipo.json` ilegible o inválido bloquea con un error legible (FR-011).

**Descartado**: un solo archivo con reglas y ajustes mezclados (el revisor lee Markdown y el hook lee JSON; separarlos evita que cada uno parsee lo del otro). Y exponer también las palabras clave y los patrones de detección, porque ningún equipo lo pidió.

## R7. El revisor recibe el diff como archivo, no calcula nada

**Decisión**: `revisor-reglas` tiene solo `Read`, `Grep` y `Glob`. La skill `revisar-reglas` obtiene el diff y se lo entrega al revisor; el revisor no ejecuta `git`.

**Motivo**: es lo que mantiene el solo lectura (FR-009). El revisor de este repositorio recibe un paquete con el diff ya preparado por la misma razón.

**Descartado**: darle `Bash` para que ejecute `git diff`, porque rompe el solo lectura.

**Cómo obtiene la skill el diff**: ejecutando `git diff` al cargarse y entregando el resultado al revisor (R9, punto b). Plan B si eso no está disponible: la skill pide una ruta a un archivo con el diff.

## R8. Los revisores se reconocen por prefijo de nombre

**Decisión**: `revisores` trata como revisor a todo subagente cuyo nombre empiece por `revisor-`, con o sin el prefijo de plugin delante (`crediagil-controles:revisor-reglas`).

**Motivo**: hoy el control tiene una lista fija de dos nombres y el plugin añade uno. Con la lista fija, el revisor del plugin no quedaría restringido por el hook.

**Descartado**: ampliar la lista a mano en cada revisor nuevo, porque lo olvida quien añada el siguiente.

**Confirmado** en R9, punto a: llega como `crediagil-controles:revisor-reglas`.

## R9. Puntos por verificar antes de construir

La CLI de Claude Code no estaba disponible al planificar. Cada punto se probó en la primera tarea de implementación (T004), con la CLI 2.1.301 que incluye la extensión de VS Code, sobre el plugin real y en repositorios temporales con una configuración aislada. Si un punto fallaba, se aplicaba su plan B.

| Punto | Qué se debe confirmar | Plan B | Resultado |
|-------|-----------------------|--------|-----------|
| a | El nombre con el que un subagente de plugin llega a un hook `PreToolUse` (R8). | Reconocer los revisores por herramienta permitida en lugar de por nombre. | **Confirmado.** Llega como `agent_type: "crediagil-controles:revisor-reglas"`, con el prefijo del plugin. El control `revisores` lo reconoce con su patrón `revisor-`. |
| b | Que una skill de plugin puede ejecutar `git diff` al cargarse y llamar al subagente del plugin por su nombre con prefijo (R7). | La skill pide la ruta de un archivo con el diff. | **Confirmado, con una corrección.** La inyección `` !`git diff $ARGUMENTS` `` funciona y el revisor recibe el diff. Pero con `agent: revisor-reglas` la skill **no** encontró el subagente del plugin y corrió como `general-purpose`, sin las restricciones de solo lectura. Con `agent: crediagil-controles:revisor-reglas` corre como el revisor y devuelve el informe en el formato pedido. La skill usa el nombre con prefijo. |
| c | Los comandos exactos de la CLI: validar un plugin, registrar un catálogo desde una ruta o un repositorio, instalar con alcance de proyecto y listar lo instalado (R11). | Verificar la instalación por inspección de la carpeta de plugins y documentar el paso manual. | **Confirmado.** `claude plugin validate <ruta>`, `claude plugin marketplace add <ruta o repositorio> --scope project`, `claude plugin install crediagil-controles@crediagil --scope project`, `claude plugin list`, `claude plugin uninstall` y `claude plugin update`. Hay también una instalación en un paso: `claude plugin install crediagil-controles --marketplace <repositorio>`. |
| d | Que Node ejecuta TypeScript desde la carpeta donde Claude Code copia el plugin, y que el comando del hook funciona en Windows sin Bash (R10). | Documentar el requisito o añadir un envoltorio mínimo en JavaScript. | **Confirmado en Windows, con un límite.** El guardián del plugin se ejecutó con Node desde una ruta con espacios y bloqueó una escritura con un dato con forma real en una sesión real. No se probó la copia a la carpeta de caché que se hace con un catálogo de GitHub: con un catálogo de carpeta local el plugin se lee en su sitio. |

**Consecuencia de b**: en este repositorio la skill `revisar-reglas` apunta a un subagente con el prefijo del plugin, así que sola, sin el plugin instalado, no encuentra su subagente. No afecta a nadie: este repositorio no instala su propio plugin (aclaración Q2) y la skill se usa desde el plugin.

Un punto que no se pueda confirmar en una máquina concreta se marca como «no verificable» en la verificación (R11), nunca como aprobado.

## R10. Requisito de Node para el equipo destino

**Decisión**: el plugin ejecuta TypeScript directamente, como los hooks de este repositorio. El equipo destino necesita Node ≥ 22.18 y lo dice la guía de instalación. El hook que no pueda arrancar falla de forma legible (FR-011).

**Descartado**: compilar a JavaScript. Añade un paso de compilación y artefactos generados al repositorio, y rompe la copia byte a byte (R3).

## R11. Verificación en un repositorio de prueba distinto

**Decisión**: `scripts/plugin/verificar-instalacion.ts` crea un repositorio temporal con otra estructura de carpetas, registra el catálogo desde la ruta de este repositorio, instala el plugin y comprueba cada pieza. Escribe un resultado por pieza según [contracts/verificacion.md](contracts/verificacion.md).

| Pieza | Comprobación automática |
|-------|-------------------------|
| Hook | Ejecuta el guardián instalado con una entrada con forma real (generada en ejecución) y espera `deny`. Con una ficticia espera que no bloquee. Con una configuración inválida espera `deny` legible. |
| Subagente | El archivo instalado declara solo `Read`, `Grep` y `Glob`. |
| Skill | El archivo instalado existe y no contiene referencias propias. |

**Lo que no se automatiza**: que el revisor audite bien con un modelo real. Se comprueba una vez a mano con la guía de `quickstart.md`.

Si la CLI `claude` no está disponible, el resultado es «no verificable» con la causa. Es repetible desde cero (FR-014, SC-007) porque usa una carpeta nueva en cada ejecución.

**Descartado**: verificar solo con pruebas unitarias del guardián, porque no prueba que el plugin se instale. Y automatizar la skill y el subagente con el modelo real, porque requiere credenciales y su resultado varía.

## R12. Portabilidad: términos prohibidos

**Decisión**: `scripts/plugin/portabilidad.ts` define qué no puede aparecer en ningún archivo del plugin, y `generar.test.ts` lo aplica a todo `plugins/crediagil-controles/`:

- Rutas absolutas (`C:\`, `/Users/`, `/home/`).
- Patrones de credenciales que ya reconoce el control `secretos`, y los prefijos de claves conocidos.
- Referencias propias: `specs/`, `src/`, `.specify`, `constitución`, `CLAUDE.md`, `DECISIONES.md`, `docs/datos-ficticios`, números de requisito (`FR-\d+`) y de issue (`#\d+`), y el nombre de usuario propietario del repositorio.

**Motivo**: FR-005 pide cero coincidencias (SC-003). Una lista explícita es revisable.

**Descartado**: una revisión manual antes de cada versión, porque no es repetible.

**Efecto**: el `README.md` del plugin no repite la dirección de este repositorio. Las instrucciones con la dirección van en `docs/plugin-controles.md`, fuera del plugin.

## R13. Versión y actualización

**Decisión**: `plugin.json` declara `version: "1.0.0"` y se sube a mano con SemVer cuando cambia el contenido generado. La versión no se repite en `marketplace.json`, para que no haya dos valores que sincronizar.

**Motivo**: la configuración del equipo está fuera del plugin (R6), así que actualizar no la pierde (FR-013).

**Descartado**: dejar el plugin sin versión y que se identifique por commit, porque el equipo destino no sabría qué versión tiene.

## R14. Conflictos de nombre al instalar

**Decisión**: los componentes del plugin llevan el prefijo del plugin, así que no pisan un subagente, una skill o un hook del equipo. Si el equipo ya tiene un control propio equivalente, ambos corren y bloquean lo mismo, sin efecto adicional. La guía lo documenta (FR-012).

**Descartado**: detectar el conflicto con un script de instalación. Claude Code gestiona la instalación y no hay punto donde correrlo.

**Confirmado** en R9, punto b: los nombres con prefijo son obligatorios al referirse a un subagente del plugin desde una skill.
