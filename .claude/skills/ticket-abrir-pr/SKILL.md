---
name: "ticket-abrir-pr"
description: "En un solo paso: crea el pull request del ticket hacia main con 'Closes #N', pasa el ticket a In review en el Project y publica en el issue el comentario con lo pendiente."
argument-hint: "[número de issue] (opcional; por defecto el de la spec o rama activa)"
user-invocable: true
disable-model-invocation: false
---

# /ticket-abrir-pr

Revisa el ticket en curso desde dos contextos independientes y, solo si el resultado lo permite, abre el pull request y lo lleva a **In review**, en un solo paso (FR-007, FR-009 del #3; FR-008 a FR-011 del #6).

Contratos: [contracts/comandos.md](../../../specs/001-sincronizacion-backlog-github/contracts/comandos.md#ticket-abrir-pr) · revisiones: [specs/004-revision-independiente-pr/contracts/ticket-abrir-pr.md](../../../specs/004-revision-independiente-pr/contracts/ticket-abrir-pr.md)

## Entrada

```text
$ARGUMENTS
```

Si contiene un número, es el issue (Regla 2, paso 1). Si no, el issue se resuelve con la Regla 2.

## Precondiciones

1. Lee `.claude/flujo-github.md` y aplica sus reglas comunes.
2. Rama actual: `git branch --show-current`. Si es `main`, ⛔ "no se abre un PR desde main" y termina.

## Flujo

1. **Verificar la rama remota.**
   - Ejecuta `git fetch origin` y comprueba que `origin/<rama>` existe y que `git rev-list --count origin/main..origin/<rama>` es mayor que 0.
   - Si la rama no existe en el remoto, ⛔ "la rama no está publicada; ejecuta `git push -u origin <rama>`" y termina **sin cambios**. Si no tiene commits respecto de `main`, ⛔ "la rama no tiene cambios respecto de main" y termina sin cambios.
   - Si hay commits locales sin publicar (`git rev-list --count origin/<rama>..<rama>` mayor que 0), adviértelo y pregunta si se continúa con lo publicado. Las revisiones y el PR usan siempre lo publicado.

### Revisiones antes del PR

Se ejecutan **siempre**, también si ya hay un PR abierto. Nada de esta sección lo redactas tú: los cuerpos y la decisión los genera `revision.ts`, y el informe de cada revisor lo captura el hook `SubagentStop`. Todas las órdenes `node` se ejecutan desde la raíz del repositorio.

- **R1 · Buscar registros del commit.** `sha` = `git rev-parse origin/<rama>`. Lee **todos** los comentarios del issue (`mcp__github__issue_read`, `method: get_comments`, `perPage: 100`, paginando) y busca los que empiezan por `<!-- crediagil:revision=codigo;commit=<sha> -->` y `<!-- crediagil:revision=cumplimiento;commit=<sha> -->` (Regla 7). Anota el cuerpo y el `html_url` de cada uno.
- **R2 · Reutilizar.** Si están **los dos**, pásalos por stdin a `node .claude/revision/revision.ts reutilizar <sha>`, como un JSON `{"codigo": "<cuerpo>", "cumplimiento": "<cuerpo>"}`. Para no reescribir los cuerpos a mano, guárdalos con un script de Node o pásalos con un heredoc sin interpolación.
  - Código 0: la decisión se reconstruyó desde los registros (↺ revisiones). Salta a R7.
  - Código 3: los registros no sirven (por ejemplo, una revisión fallida). Sigue en R3.
  - Si falta alguno de los dos, sigue en R3.
- **R3 · Preparar el paquete.** `node .claude/revision/revision.ts preparar`. Imprime `{sha, paquete}`: anota el `sha` (head de `origin/<rama>`). Si sale con código distinto de 0, ⛔ con el mensaje de stderr (por ejemplo, diff vacío o spec sin `Issue de origen`) y termina.
- **R4 · Revisar.** Invoca con la herramienta Skill, una después de otra:
  1. `revisar-codigo` con argumento `<sha>`;
  2. `revisar-cumplimiento` con argumento `<sha>`.

  Cada skill corre en su subagente revisor, aislado y de solo lectura, y devuelve su resultado en este mismo turno. No leas ni copies su informe: el hook ya lo guardó en `.git/crediagil/revisiones/<sha>/`.

  **Reintento acotado (una vez por revisión).** Después de las dos, ejecuta `node .claude/revision/revision.ts decidir <sha>`. Si en `revisiones` alguna figura como `fallida`, vuelve a invocar **solo esa** skill una vez y ejecuta `decidir` de nuevo. No reintentes más.
- **R5 · Decidir.** El resultado del último `decidir` es la decisión: `permite`, `motivos`, `conteos` y `revisiones`. Queda guardada en `decision.json`, que el guardián exige para crear el PR (control `puerta-pr`).
- **R6 · Registrar en el issue.** El último `decidir` devuelve también `comentarios.codigo` y `comentarios.cumplimiento`. Publica **tal cual** cada uno que todavía no exista en el issue (busca su marcador, Regla 7) con `mcp__github__add_issue_comment`. Anota el `html_url` de cada registro, publicado o existente. Se registra tanto si el PR se abre como si se bloquea.
- **R7 · Si `permite` es `false`**: ⛔ «PR no abierto», con la lista de `motivos` (cada uno con archivo y línea) y, si una revisión falló, su causa. El Status sigue en `In Progress`. **Termina** sin crear el PR ni comentar el hito `pr`. Si ya había un PR abierto, no lo cierres: informa que su último commit no pasa las revisiones.

2. **Buscar un PR existente.** Llama a `mcp__github__list_pull_requests` con `owner: fabisahe29`, `repo: CREDIAGIL`, `head: fabisahe29:<rama>`, `state: open` y `fields: ["number", "html_url", "title", "body"]`.
   - Si hay uno, reutilízalo (↺). Si su cuerpo no contiene `Closes #<N>`, adviértelo como ⛔ "falta la referencia de cierre", sin editar el PR.
3. **Crear el PR** si no existe. Usa `mcp__github__create_pull_request` con `owner: fabisahe29`, `repo: CREDIAGIL`, `head: <rama>` y `base: main`, más:
   - **Título**: en formato de commit convencional en español, `<tipo>: <resumen> (#<N>)`. El tipo es `feat`, `fix`, `docs`, `chore`, etc., según el cambio.
   - **Cuerpo**: la plantilla "Cuerpo del pull request" de [comentarios.md](../../../specs/001-sincronizacion-backlog-github/contracts/comentarios.md), con `Closes #<N>` en la sección Trazabilidad y el enlace a la carpeta de la spec. El resumen sale de `git log origin/main..origin/<rama> --oneline` y de la spec.
   - **Sección `## Revisiones`**: `sha` corto, decisión y la tabla con los `conteos` de la decisión y el `html_url` de los dos registros (R1 o R6). Los números salen de la decisión, no los cuentes tú.
4. **Status → `In review`** (Regla 3, origen esperado `In Progress`).
5. **Comentario `pr`** (Regla 4) con la plantilla `pr`. La sección **Pendiente** se arma así:
   - las tareas sin marcar (`- [ ]`) de `tasks.md` de la carpeta activa, si existe;
   - los elementos que la spec o el plan marcan como diferidos o fuera de alcance para después;
   - si no queda nada: "Nada pendiente: todos los criterios de aceptación quedan cubiertos por el PR."

## Errores

| Situación | Comportamiento |
|-----------|----------------|
| Rama actual `main` | ⛔, sin cambios |
| Rama no publicada o sin cambios | ⛔ con la instrucción, sin cambios |
| `preparar` falla (diff vacío, spec sin `Issue de origen`) | ⛔ con el mensaje, sin cambios |
| Una revisión falla dos veces | `decidir` la marca `fallida` → ⛔ «PR no abierto» con la causa; Status en `In Progress` |
| La decisión bloquea (regla incumplida, hallazgo alto o crítico) | ⛔ «PR no abierto» con los motivos; Status en `In Progress` |
| El guardián niega `create_pull_request` (`puerta-pr`) | ⛔ con su motivo; no se reintenta por otra vía |
| Ya existe un PR abierto | Se ejecutan igual las revisiones; si permiten, se reutiliza (↺) y se completan los pasos 4 y 5 |
| Estado inesperado en el Project | Confirmación (Regla 3) |
| Falla el MCP | Regla 1 |

## Salida

El resumen de la Regla 6, con estos efectos: `revisión de código`, `revisión de cumplimiento` (con el `sha` corto y la decisión), `PR #<pr>`, `Status → In review` y `comentario pr`. Incluye el enlace al PR. Si la decisión bloquea, la salida termina en las revisiones, con los motivos.
