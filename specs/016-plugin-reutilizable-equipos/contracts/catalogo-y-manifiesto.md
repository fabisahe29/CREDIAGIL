# Contrato: catálogo, manifiesto del plugin y registro del hook

**Feature**: [../spec.md](../spec.md) · Requisitos: FR-001 a FR-004, FR-006

Los tres archivos se escriben a mano. Los nombres de campo se confirmaron con `claude plugin validate` (punto c de [R9](../research.md#r9-puntos-por-verificar-antes-de-construir)).

## `.claude-plugin/marketplace.json` (raíz de este repositorio)

```json
{
  "name": "crediagil",
  "description": "Piezas reutilizables de los equipos de Crediágil para Claude Code.",
  "owner": { "name": "Equipo Crediágil" },
  "plugins": [
    {
      "name": "crediagil-controles",
      "source": "./plugins/crediagil-controles",
      "description": "Controles reutilizables: bloqueo de secretos y datos con forma real, revisor de solo lectura y revisión de reglas del equipo."
    }
  ]
}
```

- Sin `version` aquí (R13).
- `owner` es el equipo, no una cuenta personal.
- La descripción no cita este repositorio, tickets ni reglas de originación (FR-005).

## `plugins/crediagil-controles/.claude-plugin/plugin.json`

```json
{
  "name": "crediagil-controles",
  "version": "1.0.0",
  "description": "Controles reutilizables: bloqueo de secretos y datos con forma real, revisor de solo lectura y revisión de reglas del equipo.",
  "author": { "name": "Equipo Crediágil" }
}
```

- `claude plugin validate` pasa sin advertencias con estos campos.
- `version` es SemVer y se sube a mano cuando cambia una pieza generada.
- Los componentes se descubren por su carpeta (`hooks/`, `agents/`, `skills/`), sin listarlos aquí.

## `plugins/crediagil-controles/hooks/hooks.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Bash|PowerShell|Agent|WebFetch|WebSearch|mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/guardian-controles.ts\"",
            "timeout": 10,
            "onFailure": "block"
          }
        ]
      }
    ]
  }
}
```

- El comando usa la variable del plugin y ninguna ruta absoluta (FR-005, FR-006).
- El `matcher` es el mismo que el del guardián de este repositorio, para que cubra las mismas herramientas.
- El guardián responde en `deny` con el formato que ya usa este repositorio (`hookSpecificOutput.permissionDecision`).
- `onFailure: "block"`: si el guardián no arranca o falla (por ejemplo, con un Node anterior a 22.18), la acción se bloquea y no queda desprotegida en silencio (FR-011, R10). Comprobado con una sesión real y un guardián que lanza un error.

## Subagente: `agents/revisor-reglas.md` (copia)

Encabezado exigido:

```yaml
---
name: revisor-reglas
description: "Audita un cambio contra las reglas que declara el equipo en .claude/reglas-equipo.md y entrega un informe. Solo lee."
tools: Read, Grep, Glob
disallowedTools: Write, Edit, MultiEdit, NotebookEdit, Bash, PowerShell, Agent, mcp__*
model: sonnet
maxTurns: 40
---
```

- Sin `Bash`, para que el solo lectura se mantenga (FR-009, R7).
- Sin reglas escritas dentro: las lee de la configuración del equipo (FR-006, FR-007).
- Sin `reglas-equipo.md`, termina con el informe `sin_configuracion` y no audita (FR-008).

## Skill: `skills/revisar-reglas/SKILL.md` (copia)

- Se invoca por nombre; su cuerpo guía cómo declarar las reglas, cómo obtener el diff y cómo leer el informe.
- No menciona carpetas, comandos ni reglas de este repositorio (FR-005).
- El encabezado declara `agent: crediagil-controles:revisor-reglas`, con el prefijo del plugin: sin él, la skill no encuentra el subagente y corre como uno genérico sin restricciones (R9, punto b).
- El diff lo entrega la propia skill con `` !`git diff $ARGUMENTS` ``, y su `allowed-tools` solo pre-aprueba lectura y `git diff`.

## Informe del revisor

Un único bloque `json` al final, para que el equipo lo procese si quiere:

```json
{
  "tipo": "reglas",
  "estado": "revisado",
  "resumen": "Una o dos frases.",
  "reglas": [
    {
      "regla": "Los montos se manejan en enteros",
      "estado": "cumplida",
      "evidencia": [{ "archivo": "ejemplo/calculo.ts", "linea": 12, "cita": "línea citada" }]
    }
  ]
}
```

- `estado` global: `revisado` o `sin_configuracion`. Con `sin_configuracion`, `reglas` va vacío y `resumen` dice qué archivo falta.
- Cada regla: `cumplida`, `incumplida` o `no_aplicable`. `cumplida` exige evidencia con archivo y línea.
- Una regla que el revisor no entiende se informa como `no_aplicable` con el motivo; no se interpreta por analogía.
