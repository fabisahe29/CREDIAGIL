# Contrato: subagentes, skills y hooks de revisión

**Requisitos**: FR-001, FR-003, FR-013, FR-015 · **Decisiones**: [research.md](../research.md), R1 a R5, R8 y R9

## Subagentes (`.claude/agents/`)

Frontmatter común de `revisor-codigo.md` y `revisor-cumplimiento.md`:

```yaml
---
name: revisor-codigo            # o revisor-cumplimiento
description: "Revisa el diff de un ticket de Crediágil desde un contexto aislado y entrega un informe JSON. Solo lo invoca /ticket-abrir-pr."
tools: Read, Grep, Glob
disallowedTools: Write, Edit, MultiEdit, NotebookEdit, Bash, PowerShell, Agent, mcp__*
model: inherit
maxTurns: 40
---
```

Cuerpo (prompt de sistema), en español:

| Sección | `revisor-codigo` | `revisor-cumplimiento` |
|---------|------------------|------------------------|
| Rol | Revisor de código independiente: no conoce la sesión autora y no corrige, solo informa | Auditor de las reglas de negocio de la constitución |
| Entrada | `.git/crediagil/revisiones/<sha>/paquete.json` y `diff.patch`, la spec y la constitución | Lo mismo, con énfasis en el Principio I y en las restricciones de los Principios III y IV |
| Criterios | Corrección, seguridad, datos con forma real o secretos, pruebas de borde, coherencia con la spec y con `.claude/rules/` | Reglas 1 a 5, orden 4 → 5 → 1 → 3 → 2, umbrales y tasa en un único módulo, aritmética exacta, decisiones deterministas (FR-007) |
| Severidades / estados | FR-008a | `cumplida` solo con evidencia; ante la duda, `incumplida` o `no_aplicable` con motivo, nunca `cumplida` |
| Alcance | El diff; el resto del repositorio solo como contexto (FR-004) | Igual |
| Orden de lectura | Primero `paquete.json` y `diff.patch` completo (todos los cambios en una lectura); después solo los archivos o fragmentos que haga falta contrastar. No abrir uno por uno los archivos del diff (R8, dimensionamiento de `maxTurns`) | Igual, más la constitución y la spec |
| Salida | Un único bloque `json` según [informe.md](informe.md) | Igual |

## Skills (`.claude/skills/`)

`revisar-codigo/SKILL.md` (y su par `revisar-cumplimiento/SKILL.md`, con `agent: revisor-cumplimiento`):

```yaml
---
name: revisar-codigo
description: "Ejecuta la revisión de código independiente del commit indicado y devuelve el informe. La invoca /ticket-abrir-pr antes de abrir el PR."
argument-hint: "<sha del commit revisado>"
context: fork
agent: revisor-codigo
background: false
user-invocable: false
allowed-tools: Read, Grep, Glob
disallowed-tools: Write, Edit, MultiEdit, NotebookEdit, Bash, PowerShell, Agent, mcp__*
---
```

El cuerpo es la tarea autocontenida: «Revisa el paquete `.git/crediagil/revisiones/$ARGUMENTS/`…», con los pasos de lectura y el formato de salida. No asume nada de la conversación (FR-001).

## Hooks (`.claude/settings.json`)

Se agrega el evento `SubagentStop`. `PreToolUse` y `PostToolUse` no cambian: el guardián gana dos controles internos.

```json
"SubagentStop": [
  {
    "matcher": "revisor-codigo|revisor-cumplimiento",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/revision/capturar.ts\"",
        "timeout": 15
      }
    ]
  }
]
```

`capturar.ts` sigue la tabla de validación de [informe.md](informe.md). Lee `agent_type`, `last_assistant_message` y `stop_hook_active`. El `sha` sale del bloque JSON y debe coincidir con un paquete existente (V2).

## Controles nuevos del guardián

Se agregan a `CONTROLES` en `.claude/hooks/guardian.ts`. Mismo formato de bloqueo que el #5 (FR-014 del #5: qué, regla y corrección).

### `revisores` (FR-003, SC-004)

| Entrada | Resultado |
|---------|-----------|
| `agent_type` ∈ {`revisor-codigo`, `revisor-cumplimiento`} y herramienta ∉ {`Read`, `Grep`, `Glob`} | **deny**: «el revisor solo puede leer» |
| `agent_type` de revisor y herramienta `Read`, `Grep` o `Glob` | pasa (los demás controles siguen aplicando, por ejemplo `secretos`) |
| Sin `agent_type`, u otro subagente | el control no aplica |

### `puerta-pr` (FR-008, FR-009)

| Entrada | Resultado |
|---------|-----------|
| `mcp__github__create_pull_request`, sin `decision.json` para el head de `origin/<head>` | **deny**: «el PR se abre con `/ticket-abrir-pr`, que ejecuta las revisiones» |
| Igual, con `decision.json` de otro `sha` o con `permite: false` | **deny**, con los motivos de la decisión |
| Igual, con `decision.json` del `sha` actual, `permite: true` y las dos revisiones `valida` | pasa |
| `Write`, `Edit` o `MultiEdit` con ruta bajo `.git/crediagil/` | **deny**: «el paquete y la decisión los escribe solo `revision.ts`» |
| No se puede leer el head remoto o `decision.json` no valida | **deny** (falla cerrado, FR-015 del #5) |

El matcher actual del guardián (`…|mcp__.*`) ya cubre `create_pull_request`. Para que `revisores` cubra todas las herramientas de un revisor, el matcher se amplía con `Glob|Agent|WebFetch|WebSearch` (las que un revisor mal configurado podría tener).
