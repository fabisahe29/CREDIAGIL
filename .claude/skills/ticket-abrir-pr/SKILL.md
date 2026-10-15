---
name: "ticket-abrir-pr"
description: "En un solo paso: crea el pull request del ticket hacia main con 'Closes #N', pasa el ticket a In review en el Project y publica en el issue el comentario con lo pendiente."
argument-hint: "[número de issue] (opcional; por defecto el de la spec o rama activa)"
user-invocable: true
disable-model-invocation: false
---

# /ticket-abrir-pr

Abre el pull request del ticket en curso y lo lleva a **In review**, en un solo paso (FR-007, FR-009).

Contrato: [contracts/comandos.md](../../../specs/001-sincronizacion-backlog-github/contracts/comandos.md#ticket-abrir-pr)

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
   - Si hay commits locales sin publicar (`git rev-list --count origin/<rama>..<rama>` mayor que 0), adviértelo y pregunta si se continúa con lo publicado.
2. **Buscar un PR existente.** Llama a `mcp__github__list_pull_requests` con `owner: fabisahe29`, `repo: CREDIAGIL`, `head: fabisahe29:<rama>`, `state: open` y `fields: ["number", "html_url", "title", "body"]`.
   - Si hay uno, reutilízalo (↺). Si su cuerpo no contiene `Closes #<N>`, adviértelo como ⛔ "falta la referencia de cierre", sin editar el PR.
3. **Crear el PR** si no existe. Usa `mcp__github__create_pull_request` con `owner: fabisahe29`, `repo: CREDIAGIL`, `head: <rama>` y `base: main`, más:
   - **Título**: en formato de commit convencional en español, `<tipo>: <resumen> (#<N>)`. El tipo es `feat`, `fix`, `docs`, `chore`, etc., según el cambio.
   - **Cuerpo**: la plantilla "Cuerpo del pull request" de [comentarios.md](../../../specs/001-sincronizacion-backlog-github/contracts/comentarios.md), con `Closes #<N>` en la sección Trazabilidad y el enlace a la carpeta de la spec. El resumen sale de `git log origin/main..origin/<rama> --oneline` y de la spec.
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
| Ya existe un PR abierto | Se reutiliza (↺) y se completan los pasos 4 y 5 |
| Estado inesperado en el Project | Confirmación (Regla 3) |
| Falla el MCP | Regla 1 |

## Salida

El resumen de la Regla 6, con estos efectos: `PR #<pr>`, `Status → In review` y `comentario pr`. Incluye el enlace al PR.
