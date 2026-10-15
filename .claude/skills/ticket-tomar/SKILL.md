---
name: "ticket-tomar"
description: "Lista los tickets en Todo del GitHub Project, deja elegir uno, lo pasa a In Progress, comenta el inicio en el issue, crea la rama de trabajo y entrega su contenido para /speckit.specify."
argument-hint: "[número de issue] (opcional; sin él se muestra la lista para elegir)"
user-invocable: true
disable-model-invocation: false
---

# /ticket-tomar

Toma el siguiente ticket del backlog. **El siguiente ticket lo elige el desarrollador** (Clarificación Q1 de la spec).

Contrato: [contracts/comandos.md](../../../specs/001-sincronizacion-backlog-github/contracts/comandos.md#ticket-tomar)

## Entrada

```text
$ARGUMENTS
```

Si contiene un número (`4` o `#4`), es el issue elegido: se salta la lista, pero se valida igual que una elección (paso 3).

## Precondiciones

1. Lee `.claude/flujo-github.md` y aplica sus reglas comunes durante todo el comando.
2. El servidor MCP `github` está disponible. Si la primera llamada falla, aplica la Regla 1 (detenerse e informar).

## Flujo

1. **Listar.** Llama a `mcp__github__projects_list` con `method: list_project_items`, `owner: fabisahe29`, `project_number: 1`, `query: "is:issue status:Todo"`, `field_names: ["Status"]` y `perPage: 50`. Mientras `pageInfo.hasNextPage` sea verdadero, repite la llamada con `after: pageInfo.nextCursor`, sin cambiar los demás parámetros.
   - Conserva solo los ítems con `content_type: "Issue"` y Status `Todo`, en el orden en que llegan, que es el orden del Project.
   - Si no queda ninguno, informa "No hay tickets en Todo en el Project" y **termina sin cambios**.
2. **Elegir.** Muestra una tabla con `#`, título y etiquetas, y pregunta cuál tomar. Si el desarrollador cancela o no elige, **termina sin cambios**.
3. **Validar la elección.** Comprueba que el número elegido está en la lista. Luego vuelve a ejecutar el paso 1 y verifica que el ítem **sigue en `Todo`**. Si no está o ya no está en `Todo`, explícalo, muestra la lista actualizada y vuelve al paso 2.
4. **Leer el issue.** Llama a `mcp__github__issue_read` (`method: get`, `owner: fabisahe29`, `repo: CREDIAGIL`, `issue_number: <N>`) para obtener título, cuerpo, `html_url`, etiquetas y milestone.
5. **Status → `In Progress`** (Regla 3). Si la escritura falla, ⛔ y **termina antes de comentar**.
6. **Rama de trabajo.**
   - Si la rama actual es `main`: ejecuta `git switch main`, `git pull --ff-only` y `git switch -c <N>-<slug>`. El slug sale del título: minúsculas, sin tildes ni signos, palabras unidas por `-` y como máximo 40 caracteres.
   - Si ya estás en otra rama: no crees ninguna, informa la rama actual y pregunta si se usa esa para el ticket.
   - Si hay cambios sin commit que impiden cambiar de rama, ⛔ con el motivo. Los efectos ya aplicados quedan; el resto se completa al reintentar.
7. **Comentario `inicio`** (Regla 4) con la plantilla `inicio` de [comentarios.md](../../../specs/001-sincronizacion-backlog-github/contracts/comentarios.md), rellenando `{rama}`.
8. **Entregar el ticket.** Muestra:
   - el título, el enlace, las etiquetas, el milestone y el **cuerpo completo** del issue;
   - la instrucción de que el siguiente paso es `/speckit.specify` usando ese contenido como descripción;
   - la línea que la spec **debe** llevar en su cabecera, ya rellenada: `**Issue de origen**: [fabisahe29/CREDIAGIL#<N> — <título>](<html_url>)`.

## Errores

| Situación | Comportamiento |
|-----------|----------------|
| No hay tickets en `Todo` | Aviso, sin cambios |
| Elección inválida o que ya no está en `Todo` | Explicación y lista actualizada |
| Falla la escritura del Status | ⛔, sin comentario ni rama |
| Cambios locales impiden crear la rama | ⛔ en la rama; Status y comentario quedan, y el reintento completa |
| Falla el MCP (credencial, permisos, red) | Regla 1 |

## Salida

El resumen de la Regla 6, con estos efectos: `Status → In Progress`, `rama <nombre>` y `comentario inicio`. Después, el contenido del ticket del paso 8.
