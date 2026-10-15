# Contrato: formato de los archivos de memoria, reglas y configuración

**Feature**: [../spec.md](../spec.md) · **Modelo**: [../data-model.md](../data-model.md)

Interfaz que el repositorio expone a Claude Code y a quien lo clona. Define la estructura y el contenido mínimo de cada archivo. El texto definitivo se escribe en la implementación.

## `CLAUDE.md` (raíz)

Menos de 60 líneas, en español, sin copiar texto de la constitución ni de las reglas.

```markdown
# Crediágil — convenciones del equipo

Reglas no negociables (reglas de negocio, datos ficticios, decisiones deterministas…):
@.specify/memory/constitution.md

## Convenciones
- Idioma: …                         (FR-003.1)
- Flujo de trabajo: …               (FR-003.2: Spec Kit + /ticket-tomar, /ticket-abrir-pr, /ticket-cerrar)
- Commits: …                        (FR-003.3)
- Stack: …                          (FR-003.4)

## Mapa del repositorio            (FR-003.5)
- `src/politica/` …  `src/mcp/` …  `specs/` …  `.claude/` …

## Reglas por zona
Se cargan solas al tocar archivos de cada zona: `.claude/rules/` (tests, política, servidor MCP, specs).

## Lo personal va aparte
`CLAUDE.local.md` y `.claude/settings.local.json` (no versionados). Estas convenciones prevalecen sobre lo personal.
```

## `.claude/rules/<nombre>.md`

```markdown
---
paths:
  - "<glob 1>"
  - "<glob 2>"
---

# <Zona>: reglas

- <regla concreta y verificable>
- Reglas no negociables: ver [constitución](../../.specify/memory/constitution.md), Principio <N>.
```

| Archivo | `paths` exactos |
|---------|-----------------|
| `tests.md` | `"**/*.test.ts"` |
| `politica.md` | `"src/politica/**"` |
| `servidor-mcp.md` | `"src/mcp/**"` |
| `specs.md` | `"specs/**"` |

**Reglas del contrato**:

- Solo la clave `paths` en el frontmatter.
- Globs entre comillas dobles.
- Cada viñeta es una instrucción verificable, no una explicación.

## `.claude/settings.json`

JSON estricto, sin comentarios:

```json
{
  "enabledMcpjsonServers": ["github"]
}
```

## `.gitignore` (agregar)

```gitignore
# Preferencias personales de Claude Code (no se versionan)
CLAUDE.local.md
.claude/settings.local.json
```

## Archivos personales (no se crean en el repositorio)

- `CLAUDE.local.md`: texto libre con las preferencias de FR-003a.
- `.claude/settings.local.json`: por ejemplo `{"permissions": {"allow": ["Bash(npm test:*)"]}}`.

La documentación del flujo (sección "Lo personal va aparte" de `CLAUDE.md`) indica que existen, sin dar contenido.
