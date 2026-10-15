---
name: "ticket-cerrar"
description: "En un solo paso: verifica que el pull request del ticket se pueda fusionar, lo fusiona (squash) por el MCP de GitHub, pasa el ticket a Done y publica el comentario final en el issue."
argument-hint: "[número de issue o de PR] (opcional; por defecto el PR abierto de la rama actual)"
user-invocable: true
disable-model-invocation: false
---

# /ticket-cerrar

Fusiona el pull request del ticket y lo lleva a **Done**, en un solo paso (FR-008, FR-008a, FR-008b). Esta transición la hace este comando, no un workflow del Project (Clarificación Q2).

Contrato: [contracts/comandos.md](../../../specs/001-sincronizacion-backlog-github/contracts/comandos.md#ticket-cerrar)

## Entrada

```text
$ARGUMENTS
```

- Vacío: el PR abierto de la rama actual. Se busca con `mcp__github__list_pull_requests`, `head: fabisahe29:<rama>` y `state: all`, y se toma el más reciente.
- Un número: primero se interpreta como PR (`pull_request_read` · `get`). Si no existe un PR con ese número, se interpreta como issue y se busca el PR cuya `head` es la rama de trabajo del issue o cuyo cuerpo contiene `Closes #<N>`.

## Precondiciones

1. Lee `.claude/flujo-github.md` y aplica sus reglas comunes.
2. Resuelve el PR y el issue `<N>`. El issue sale del `Closes #<N>` del cuerpo del PR o, si no, de la Regla 2. Si no se puede resolver alguno, pregunta.

## Flujo

1. **Leer el PR** con `mcp__github__pull_request_read`, `method: get`.
   - Si `merged` es verdadero, ya está fusionado: ↺ y salta al paso 4 (FR-008b).
   - Si `state` es `closed` y no está fusionado, ⛔ "PR cerrado sin fusionar; el ticket no pasa a Done" y termina.
2. **Verificar que se puede fusionar** (R9, FR-008a). Lee `get`, `get_status`, `get_check_runs` y `get_reviews` del PR. Se fusiona **solo si** se cumple todo esto:
   - `draft` es falso;
   - `mergeable` es verdadero (si es `null`, GitHub aún lo está calculando: vuelve a leer `get` una vez; si sigue en `null`, ⛔ "fusionabilidad desconocida, reintenta");
   - ningún check run tiene `conclusion` igual a `failure`, `cancelled` o `timed_out`, ninguno está pendiente (`status` distinto de `completed`) y el estado combinado no es `failure` ni `pending` (si no hay checks configurados, se considera en verde);
   - ningún revisor tiene como última revisión `CHANGES_REQUESTED`.

   Si algo falla, ⛔ con el motivo concreto y termina. El ticket sigue en `In review`.
3. **Fusionar.** Antes de hacerlo, muestra el PR (número, título y rama) y pide confirmación al desarrollador: es una acción irreversible. Luego llama a `mcp__github__merge_pull_request` con `merge_method: squash`, `commit_title: <título del PR>` (formato convencional `<tipo>: <resumen> (#<N>)`) y `expectedHeadSha: <head.sha leído en el paso 1>`, para no fusionar commits que no se verificaron.
4. **Status → `Done`** (Regla 3, origen esperado `In review`).
5. **Verificar el cierre del issue** con `mcp__github__issue_read`, `method: get`. Si el issue sigue abierto, ⛔ "el issue no se cerró: el PR no tenía `Closes #<N>`". **No lo cierres a mano**; informa al desarrollador.
6. **Comentario `cierre`** (Regla 4) con la plantilla `cierre`:
   - el número del PR y el SHA corto del commit de fusión (`merge_commit_sha` del PR releído);
   - el resultado en una o dos líneas;
   - lo que quedó fuera: lo mismo que la sección "Pendiente" del comentario `pr`, si existe, o "nada".
7. **Recordatorio local**: sugiere `git switch main` y `git pull --ff-only`.

## Errores

| Situación | Comportamiento |
|-----------|----------------|
| PR cerrado sin fusionar | ⛔, sin cambios |
| PR no fusionable (borrador, conflictos, checks, cambios pedidos) | ⛔ con el motivo; sigue `In review` |
| PR ya fusionado (por ejemplo, desde la web) | ↺ en la fusión y se completan los pasos 4 a 6 |
| El desarrollador no confirma la fusión | Termina sin cambios |
| El issue no se cerró | ⛔ informativo; no se cierra a mano |
| Falla el MCP | Regla 1 |

## Salida

El resumen de la Regla 6, con estos efectos: `fusión PR #<pr> (squash)`, `issue #<N> cerrado`, `Status → Done` y `comentario cierre`.
