# Research: Memoria y convenciones del equipo

**Feature**: [spec.md](spec.md) · **Issue**: [#4](https://github.com/fabisahe29/CREDIAGIL/issues/4) · **Fecha**: 2026-10-15

**Fuentes**: documentación oficial de Claude Code, [memory](https://code.claude.com/docs/en/memory) y [settings](https://code.claude.com/docs/en/settings), consultadas el 2026-10-15. Cada decisión sigue el formato Decisión · Motivo · Alternativas descartadas. Las marcadas con ★ van a `DECISIONES.md` (FR-011).

## Hechos de la plataforma que condicionan el diseño

| Hecho (documentación oficial) | Consecuencia |
|-------------------------------|--------------|
| `./CLAUDE.md` o `./.claude/CLAUDE.md` se cargan al iniciar la sesión y se comparten por control de versiones. | La memoria del proyecto se carga sola al clonar (FR-001). |
| Los `CLAUDE.md` de subdirectorios se cargan **bajo demanda**, cuando Claude lee o edita un archivo de ese subárbol. | Sirven para contexto por carpeta, pero se pisarían con las reglas por ruta. |
| `CLAUDE.local.md` tiene soporte vigente (no está obsoleto), se carga después de `CLAUDE.md` y **no** se ignora automáticamente: hay que agregarlo a `.gitignore`. | Memoria personal por proyecto, más una regla de ignorado (FR-008, FR-010). |
| `@ruta` importa archivos con rutas relativas al archivo que importa, hasta 4 saltos, y lo importado **se carga al iniciar**. Las importaciones fuera del directorio de trabajo muestran un diálogo de aprobación. | Importar dentro del repositorio no pide aprobación. Importar desde `~` sí. |
| En `.claude/rules/*.md`, la clave `paths` del frontmatter es una lista YAML de globs, con soporte para `**` y llaves (`{ts,tsx}`). Una regla con `paths` se carga cuando Claude lee, escribe o edita un archivo que coincide; sin `paths`, se carga siempre. | Las reglas por ruta no cargan contexto de más (FR-005, FR-006). |
| Si el YAML de una regla no se puede leer, Claude Code **ignora el frontmatter y la carga siempre**. | Un error de sintaxis convierte una regla por ruta en global, así que hay que validar el YAML (riesgo R6). |
| `.claude/settings.json` es compartido; `.claude/settings.local.json` es personal y **tiene prioridad** sobre el compartido. Las listas, como `permissions.allow`, **se combinan**. Claude Code solo lo ignora automáticamente si él mismo crea el archivo, y lo hace en el *exclude* global, no en `.gitignore`. | Configuración separada y combinable (FR-009). El ignorado se declara de forma explícita en `.gitignore`. |
| Recomendación oficial: menos de 200 líneas por `CLAUDE.md`. | Meta de concisión (FR-002, SC-004). |

---

## R1 ★ Memoria del proyecto en `./CLAUDE.md`, en la raíz

- **Decisión**: la memoria del equipo vive en `./CLAUDE.md`, con menos de 60 líneas, y contiene exactamente las seis convenciones de FR-003.
- **Motivo**: es la ubicación más visible y la que Claude Code carga al iniciar sin configuración. Además, quien abre el repositorio la encuentra sin buscar.
- **Alternativas descartadas**: `./.claude/CLAUDE.md`, que funciona igual pero queda escondido en una carpeta de herramientas y no se ve en la raíz de GitHub.

## R2 ★ Uso justificado de `@import`: la constitución se importa, no se copia

- **Decisión**: `CLAUDE.md` importa la constitución con `@.specify/memory/constitution.md`.
- **Motivo**: las reglas de negocio y los datos ficticios (Principios I y II) son no negociables y aplican a todo el trabajo, así que deben estar siempre en contexto. Importar mantiene una sola fuente de verdad y cumple FR-002 (no duplicar). La ruta está dentro del repositorio, por lo que no aparece el diálogo de aprobación.
- **Costo aceptado**: la constitución, de unas 150 líneas, se carga en cada sesión. Es el contenido de mayor riesgo si se omite.
- **Alternativas descartadas**:
  - **Copiar un resumen de los principios en `CLAUDE.md`**: duplica contenido y se desincroniza en cada enmienda de la constitución.
  - **Solo un enlace en texto, sin importar**: Claude no lo carga salvo que alguien lo pida, y las reglas no negociables podrían ignorarse.
  - **`CLAUDE.md` por subdirectorio**, por ejemplo en `src/politica/`: se pisa con las reglas por ruta (R3), que ya cargan bajo demanda. Tener dos mecanismos para lo mismo complica saber qué se carga y cuándo.

## R3 ★ Cuatro reglas por ruta en `.claude/rules/`

- **Decisión**: cuatro archivos con `paths` (aclaración Q2 y FR-007):

  | Archivo | `paths` | Contenido |
  |---------|---------|-----------|
  | `.claude/rules/tests.md` | `**/*.test.ts` | Nombres y ubicación de los tests, solo datos ficticios, bordes obligatorios ($5.000.000, 30%, 10%) |
  | `.claude/rules/politica.md` | `src/politica/**` | Cómo se aplica la política en el código: aritmética exacta, orden de evaluación, módulo único; enlaza la constitución |
  | `.claude/rules/servidor-mcp.md` | `src/mcp/**` | Contratos tipados, revalidación del lado del servidor, idempotencia, errores explícitos; enlaza la constitución |
  | `.claude/rules/specs.md` | `specs/**` | Línea "Issue de origen" obligatoria, idioma y trazabilidad con el ticket |

- **Motivo**: cada zona carga su contexto solo cuando se trabaja en ella. La memoria general queda corta. El alcance por patrón cubre carpetas que todavía no existen.
- **Alternativas descartadas**: reglas sin `paths`, que se cargarían siempre y harían crecer el contexto sin necesidad; o una sola regla con todo, que mezcla zonas y no permite saber qué aplica dónde.

## R4 Qué cuenta como test (aclaración Q3)

- **Decisión**: solo los archivos con sufijo `.test`, en cualquier carpeta: `paths: ["**/*.test.ts"]`. Es la decisión del desarrollador en `/speckit.clarify` y reemplaza el supuesto inicial del plan (`.test` + `.spec` + `fixtures/`).
- **Motivo**: hay una sola convención de nombre en el proyecto, así que la regla y su verificación son inequívocas.
- **Consecuencia aceptada**: los documentos ficticios de `fixtures/` no cargan la regla de tests. Su protección (solo datos ficticios) sigue llegando por la constitución importada en `CLAUDE.md` (Principio II), que está siempre en contexto.
- **Alternativas descartadas**: `.test` + `.spec` + `fixtures/`, que era el supuesto inicial del plan y suma patrones y una segunda convención de nombre; o incluir además las carpetas `tests/` y `__tests__/`.

## R5 Rutas previstas para la política y el servidor MCP

- **Decisión**: `src/politica/` para el módulo de política y `src/mcp/` para el servidor de herramientas.
- **Motivo**: la constitución exige un módulo único de política y un servidor MCP propio. Fijar las rutas ahora permite escribir las reglas. El issue #7 (esqueleto) debe usar estas rutas o ajustar los `paths` de las reglas 2 y 3 en ese mismo ticket (supuesto de la spec).
- **Alternativas descartadas**: esperar al #7 para escribir esas dos reglas, lo que deja el ticket #4 con solo dos de las cuatro reglas acordadas en la aclaración.

## R6 Validación del YAML de las reglas

- **Decisión**: cada regla usa el frontmatter mínimo (solo `paths`, como lista YAML con cadenas entre comillas). El quickstart comprueba con `/memory` o `/context` que cada regla **no** se carga al iniciar, sino solo al tocar un archivo que coincide.
- **Motivo**: si el YAML no se puede leer, la regla se vuelve global sin aviso (hecho de la plataforma). La comprobación al iniciar detecta ese fallo.
- **Alternativas descartadas**: confiar en la revisión visual, que no detecta un error de YAML silencioso.

## R7 ★ Memoria personal: `CLAUDE.local.md` ignorado por `.gitignore`

- **Decisión**: las preferencias personales por proyecto van en `./CLAUDE.local.md`, que se agrega a `.gitignore`. Las preferencias para todos los proyectos van en `~/.claude/CLAUDE.md`, fuera del repositorio.
- **Motivo**: es el mecanismo documentado para memoria personal por proyecto, se carga solo y vive junto al proyecto. `.gitignore` evita que se versione por accidente (FR-010).
- **Alternativas descartadas**:
  - **Importar `@~/.claude/crediagil-personal.md` desde el `CLAUDE.md` compartido**: es lo que la documentación recomienda para varios *worktrees*, pero mostraría a **todo el equipo** un diálogo de aprobación por un archivo que solo existe en la máquina de una persona.
  - **Una sección "personal" dentro de `CLAUDE.md`**: se versionaría y afectaría a todos.

## R8 ★ Configuración: `.claude/settings.json` compartido y `.claude/settings.local.json` personal

- **Decisión**:
  - `.claude/settings.json`, versionado: `"enabledMcpjsonServers": ["github"]`, para que el MCP del proyecto, que necesitan los comandos `/ticket-*`, quede habilitado para el equipo sin que cada uno lo apruebe a mano.
  - `.claude/settings.local.json`, personal: permisos extra, modelo y demás preferencias de FR-003a. Se agrega a `.gitignore` de forma explícita.
- **Motivo**: la configuración local tiene prioridad y las listas se combinan, así que lo personal se suma sin modificar lo compartido (FR-009). El ignorado automático de Claude Code solo ocurre si él crea el archivo y va al *exclude* global, por eso se declara en `.gitignore`.
- **Alternativas descartadas**: no versionar ninguna configuración, con lo que no habría nada compartido que separar y cada persona aprobaría el MCP por su cuenta; o poner permisos amplios en la configuración compartida, que impondría a todos lo que es preferencia de cada uno.

## R9 Ubicación del registro de decisiones

- **Decisión**: una entrada nueva en `DECISIONES.md`, fechada 2026-10-15 y vinculada al issue #4, con R1, R2, R3, R7 y R8.
- **Motivo**: FR-011. Sigue el formato que ya usa el issue #3.
