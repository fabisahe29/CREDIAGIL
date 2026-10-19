# Research: Paquete de entrega

Cada decisión lleva su motivo y la alternativa descartada. Las decisiones con alternativa descartada se registran también en `docs/registro-decisiones.md` (que desde este ticket es el registro detallado; ver R1).

## R1: `DECISIONES.md` es el resumen de dos páginas y el detalle se mueve a `docs/registro-decisiones.md`

- **Decisión**: `git mv DECISIONES.md docs/registro-decisiones.md` y un `DECISIONES.md` nuevo, de máximo 1000 palabras, con una sección por cada una de las 11 necesidades (mecanismo, por qué, descartado, enlace). Se actualizan `CLAUDE.md`, `.claude/rules/specs.md` y `README.md` para que digan dónde se anotan las decisiones del plan.
- **Motivo**: el criterio del issue pide dos páginas como máximo y el registro actual pesa unos 77 KB. `git mv` conserva la historia del archivo. «Dos páginas» se vuelve comprobable como un tope de palabras (unas 500 por página) más la estructura obligatoria de cada necesidad.
- **Descartado**: dejar el registro en `DECISIONES.md` con un resumen al inicio (rompe el límite de páginas); borrar el detalle y confiar en los `research.md` (se pierde la vista cronológica y el enlace desde el README).

## R2: comandos propios en TypeScript, sin dependencias, con el `.zip` escrito con `node:zlib`

- **Decisión**: `src/entrega/` con `npm run entrega:armar` y `npm run entrega:verificar`. El `.zip` se escribe y se lee con `node:zlib` y `node:fs` (entradas `deflate`, directorio central).
- **Motivo**: funciona igual en Windows y Linux, deja un informe con código de salida y no suma dependencias (YAGNI, constitución).
- **Descartado**: `Compress-Archive` o el comando `zip` (según el sistema, no filtran por lista y, en Windows PowerShell 5.1, escriben rutas con `\`); una librería de zip (dependencia nueva para pocas líneas de código); armar el `.zip` a mano (el error humano es el riesgo que se quiere eliminar).

## R3: el `.zip` se arma desde `git ls-files` más `.git/`, con el árbol limpio

- **Decisión**: la lista de archivos es la de `git ls-files` más todo `.git/`. El armado se niega si hay cambios sin commit.
- **Motivo**: lo versionado es, por construcción, lo que `.gitignore` deja pasar. Así quedan fuera `node_modules/`, `dist/`, `logs/`, `.env*`, `CLAUDE.local.md` y `.claude/settings.local.json` sin repetir esas reglas. Un árbol limpio garantiza que el `.zip` y el commit entregado son lo mismo.
- **Descartado**: recorrer el disco con patrones de exclusión propios (duplica `.gitignore` y puede colar archivos locales); `git archive` (no incluye `.git`, que el criterio exige).

## R4: la verificación recorre el `.zip` real, con detectores sobre nombres y contenido

- **Decisión**: `entrega:verificar` abre el `.zip` y comprueba: (a) nombres prohibidos (`.env` y `.env.*` salvo `.env.example`, `node_modules/`, `dist/`, `logs/`, `CLAUDE.local.md`, `.claude/settings.local.json`); (b) presencia de `.git/`; (c) tamaño ≤ 50 MB; (d) contenido de los archivos de texto con detectores de secretos: token de GitHub (`ghp_`, `github_pat_`), clave de la API de Claude (`sk-ant-`), `Authorization: Bearer` con valor literal, variables `GIT_HUB=` o `ANTHROPIC_API_KEY=` con valor, bloques de clave privada y credenciales dentro de una URL (`https://usuario:token@…`, como en `.git/config`).
- **Motivo**: el criterio habla del `.zip` que se sube, no del árbol de trabajo. El informe da tipo y ubicación, nunca el valor.
- **Descartado**: una herramienta externa de escaneo de secretos (dependencia nueva fuera del enunciado); revisar solo el árbol (no detecta `.git/config` ni lo que ya estaba empaquetado).

## R5: el historial se revisa con `git log`, sin reescribirlo

- **Decisión**: los mismos detectores de contenido se aplican al texto de `git log --all -p`. Además, `git merge-base --is-ancestor origin/main HEAD` comprueba que lo publicado sigue siendo antepasado de lo que se entrega. Si no hay `origin/main`, el resultado es «no verificable», no «correcto».
- **Motivo**: dentro del `.zip` los objetos de `.git` están comprimidos y no se leen como texto. Revisar el historial con `git` local es la forma fiable. El historial no se reescribe: si aparece un hallazgo, se reporta y decide la persona que entrega.
- **Descartado**: descomprimir los objetos de git a mano (frágil y lento); reescribir el historial para borrar un hallazgo (el issue lo prohíbe).

## R6: los artefactos de Spec Kit se comprueban por carpeta, sin exigir numeración continua

- **Decisión**: `src/entrega/specs.ts` exige que cada carpeta de `specs/` tenga `spec.md`, `plan.md` y `tasks.md`, y que `spec.md` declare su `Issue de origen`. También exige `.specify/memory/constitution.md`. La numeración puede tener huecos.
- **Motivo**: hoy hay carpetas de la 001 a la 015 completas y la 017 en curso. La 016 es del #18, que está en revisión (PR #37), así que el hueco es legítimo. Si falta algo, el informe da la carpeta y el archivo.
- **Descartado**: exigir contigüidad (rompe mientras el #18 no se fusione); cruzar con los issues cerrados desde el código (en GitHub solo se actúa por el servidor MCP, Regla 1; ese cruce lo hace la sesión en la tarea de cierre).

## R7: el README abre con «Inicio rápido» y la prueba de los 5 minutos se mide en un clon limpio

- **Decisión**: se agrega una sección «Inicio rápido» antes de «Requisitos», con los enlaces al GitHub Project y al video, los tres comandos que no necesitan credenciales y el chat con credenciales. Una prueba comprueba que los enlaces y los comandos están. El tiempo real se mide en un clon limpio y se anota en `quickstart.md`.
- **Motivo**: el criterio se refiere al README, y el evaluador no debe leer secciones de detalle para empezar. El orden hoy exige credenciales antes de mostrar algo que corre sin ellas.
- **Descartado**: un documento aparte de «cómo empezar» (el criterio dice README); medir el tiempo con un script (depende del equipo y de la red; se mide una vez, a mano).

## R8: el estado de los tickets lo revisa la sesión por el servidor MCP, con un comentario de estado real

- **Decisión**: al cierre, la sesión lista los tickets del Project con `projects_list`, y en cada uno que no esté en Done publica un comentario con el marcador `<!-- crediagil:entrega=estado -->` y el estado real. Antes de publicar lee los comentarios y no repite si el marcador ya está.
- **Motivo**: es la Regla 1 (solo el servidor MCP de GitHub) y la Regla 4 (idempotencia por marcador). El marcador no es un hito: el flujo solo define cinco hitos, y este comentario no es de avance.
- **Descartado**: agregar un hito `entrega` a `flujo-github.md` (cambia el flujo compartido por un caso único); mover tickets a Done a la fuerza (el issue pide el estado real).

## R9: el video se verifica a mano con una lista

- **Decisión**: el enlace ya está en el README. La lista de `quickstart.md` fija cómo comprobarlo: ventana sin sesión, duración ≤ 5:00, los siete casos con su número. Si se vuelve a grabar, se actualiza el enlace.
- **Motivo**: no hay forma fiable de comprobar por código una página de Drive que exige JavaScript.
- **Descartado**: pedir la página con HTTP y buscar texto (falsos positivos y negativos); incrustar el video en el repositorio (supera el límite de 50 MB del `.zip`).
