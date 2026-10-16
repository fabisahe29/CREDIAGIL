# Contrato: cambios en `/ticket-abrir-pr` y en el flujo de tickets

**Requisitos**: FR-008 a FR-011, FR-010a · **Decisiones**: [research.md](../research.md), R4, R6 a R9

Este contrato **modifica** el de [specs/001-sincronizacion-backlog-github/contracts/comandos.md](../../001-sincronizacion-backlog-github/contracts/comandos.md#ticket-abrir-pr) y [comentarios.md](../../001-sincronizacion-backlog-github/contracts/comentarios.md). Al implementar, se actualizan esos archivos, `.claude/skills/ticket-abrir-pr/SKILL.md` y `.claude/flujo-github.md`.

## Flujo nuevo de `/ticket-abrir-pr`

Los pasos 1 (verificar rama remota) y los de Status y comentario `pr` no cambian. Entre la verificación y la creación del PR se insertan los pasos **R1 a R6**:

| Paso | Acción | Si falla |
|------|--------|----------|
| 1 | Verificar la rama remota (sin cambios) | ⛔ como hoy |
| **R1** | `sha` = head de `origin/<rama>`. Leer los comentarios del issue (Regla 4) y buscar `crediagil:revision=codigo;commit=<sha>` y `…=cumplimiento;commit=<sha>` | Regla 1 (falla del MCP) |
| **R2** | Si están los dos: `node .claude/revision/revision.ts reutilizar <sha>` con sus cuerpos por stdin → saltar a R6 (↺) | Si no validan, seguir en R3 |
| **R3** | `node .claude/revision/revision.ts preparar` | ⛔ con el motivo (diff vacío, spec sin `Issue de origen`…) |
| **R4** | Invocar la skill `revisar-codigo` con argumento `<sha>`; luego `revisar-cumplimiento` con `<sha>`. Si una revisión queda como fallida, reintentarla **una vez** (R8) | Queda como `fallida`; se sigue a R5 |
| **R5** | `node .claude/revision/revision.ts decidir <sha>` → decisión y cuerpos de los dos comentarios | ⛔ con la causa |
| **R6** | Publicar en el issue los comentarios de registro que falten (idempotente, R7) | Regla 1 |
| R7 | Si `permite` es `false`: ⛔ «PR no abierto», con los motivos y el enlace a los comentarios. El Status sigue en `In Progress`. **Termina** | — |
| 2 | Buscar o crear el PR (sin cambios), con la sección `## Revisiones` en el cuerpo | — |
| 3–4 | Status → `In review` y comentario `pr` (sin cambios) | — |

Notas:
- La creación del PR la vigila además el control `puerta-pr` del guardián ([revisores.md](revisores.md)): si se intenta sin `decision.json` válida, se niega.
- Si ya existe un PR abierto para la rama (↺), los pasos R1 a R6 se ejecutan igual, para que su `sha` quede revisado y registrado. Si la decisión bloquea, se informa, pero el PR existente no se cierra.

## Sección nueva en el cuerpo del PR

Se agrega a la plantilla «Cuerpo del pull request» de `comentarios.md`, entre «Trazabilidad» y «Verificación»:

```markdown
## Revisiones
Commit revisado: `{sha corto}` · Decisión: ✅ no bloquea

| Revisión | Resultado | Registro |
|----------|-----------|----------|
| Código | crítica {n} · alta {n} · media {n} · baja {n} | [comentario]({url}) |
| Cumplimiento | reglas ✅ {n} · ⛔ {n} · ➖ {n} | [comentario]({url}) |
```

## Regla nueva en `.claude/flujo-github.md`

**Regla 7: registros de revisión.** Los comentarios con marcador `<!-- crediagil:revision=<tipo>;commit=<sha> -->` son únicos por `(tipo, sha)`, no por hito: un mismo issue puede tener varios, uno por commit revisado. Se publican y se buscan igual que los de la Regla 4. Su cuerpo lo genera `revision.ts`; la sesión no lo redacta.
