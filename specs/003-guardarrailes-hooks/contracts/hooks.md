# Contrato: hooks del repositorio

**Requisitos**: FR-001 a FR-018 · **Decisiones**: [research.md](../research.md), R1 a R11 · **Entidades**: [data-model.md](../data-model.md)

## Declaración en `.claude/settings.json`

Se agrega a lo que ya existe (`enabledMcpjsonServers`, del #4). Forma esperada:

```json
{
  "enabledMcpjsonServers": ["github"],
  "permissions": {
    "deny": [
      "Read(**/.env)", "Read(**/.env.*)", "Read(!**/.env.example)",
      "Edit(**/.env)", "Edit(**/.env.*)", "Edit(!**/.env.example)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Bash|PowerShell|mcp__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/guardian.ts\"",
            "timeout": 10,
            "onFailure": "block"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/formatear.ts\"",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**Validación**: el JSON es estricto, sin comentarios. Que la sintaxis de la negación `!` en `deny` funcione se comprueba en el quickstart (Escenario 2). Si no funciona, se quitan las dos negaciones y las reglas `Read`/`Edit` se limitan a los nombres concretos (`.env`, `.env.local`, `.env.development`, `.env.production`, `.env.test`), y la decisión se registra.

## Guardián (`PreToolUse`)

### Entrada (stdin)

JSON de Claude Code. Campos usados:

| Campo | Obligatorio | Uso |
|-------|-------------|-----|
| `tool_name` | Sí | Elige los controles |
| `tool_input` | Sí (objeto) | Rutas, textos y comando ([data-model.md](../data-model.md), Acción) |
| `cwd` | No | Base para resolver rutas relativas del comando |

Si la entrada no cumple el esquema, se responde *deny* con el control `error-interno`.

### Controles por herramienta

| Herramienta | `datos-reales` | `secretos` | `spec-primero` |
|-------------|:--------------:|:----------:|:--------------:|
| Write, Edit, MultiEdit, NotebookEdit | ✓ (contenido) | ✓ (ruta) | ✓ (ruta bajo `src/`) |
| Read | — | ✓ (ruta) | — |
| Grep | — | ✓ (`path`) | — |
| Bash, PowerShell | ✓ (texto del comando) | ✓ (FR-006, FR-006a) | ✓ (escrituras bajo `src/`) |
| `mcp__*` | ✓ (todos los textos) | — | — |

### Salida (stdout, código 0)

- **Permitir**: no imprime nada.
- **Bloquear**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "<mensaje>"
  }
}
```

### Mensaje de bloqueo (FR-014)

Un bloque por cada bloqueo, en este orden fijo: `secretos`, `datos-reales`, `spec-primero`, `error-interno`.

```text
Acción bloqueada por los guardarraíles de Crediágil (<n> motivo/s).

[<control>] <detectado>
  Regla: <regla>
  Corrección: <correccion>
```

| Control | Ejemplo de `detectado` | `regla` | `correccion` |
|---------|------------------------|---------|--------------|
| `datos-reales` | `tarjeta ••••1234 en src/x.ts, línea 12` | Principio II · FR-001 | Usa la convención ficticia (prefijo `000`): ver `docs/datos-ficticios.md` |
| `secretos` | `el comando lee .env` | Restricciones técnicas · FR-006 | Los secretos solo se leen del entorno; no abras ni copies `.env` |
| `secretos` (recursivo) | `grep -r alcanza .env sin excluirlo` | FR-006a | Agrega `--exclude='.env*'` o limita la búsqueda a una carpeta sin secretos |
| `spec-primero` | `rama 7-esqueleto…: no hay spec con Issue de origen #7` | FR-008 · flujo Spec Kit | Ejecuta `/speckit-specify` para el #7 antes de escribir en `src/` |
| `spec-primero` (sin ticket) | `rama main: no hay ticket` | FR-010 | Toma el ticket con `/ticket-tomar` |
| `error-interno` | `entrada sin tool_name` o la excepción con su causa | FR-015 · Principio VI | Informa al desarrollador; la acción no se ejecutó |

Un dato detectado **nunca** aparece completo en el mensaje: solo sus últimos 4 dígitos.

## Formateador (`PostToolUse`)

| Situación | Salida | Efecto |
|-----------|--------|--------|
| Extensión fuera de `.ts .tsx .js .mjs .cjs .json`, o ruta en `.prettierignore` | código 0, nada | Sin cambios |
| Formateado con éxito, o ya estaba formateado | código 0, nada | Archivo reescrito si hacía falta |
| Prettier no instalado | código 2, stderr: `Formato omitido: falta Prettier. Ejecuta npm install.` | Edición conservada |
| Error de Prettier (por ejemplo, de sintaxis) | código 2, stderr: `Formato omitido en <ruta>: <mensaje de Prettier>` | Edición conservada (FR-012) |

## Scripts de `package.json`

| Script | Comando | Uso |
|--------|---------|-----|
| `test` | `node --test ".claude/hooks/**/*.test.ts"` | FR-017, SC-001 |
| `typecheck` | `tsc --noEmit` | TypeScript `strict` (constitución) |
| `format` | `prettier --write .` | Formatear todo |
| `format:check` | `prettier --check .` | SC-004 |
