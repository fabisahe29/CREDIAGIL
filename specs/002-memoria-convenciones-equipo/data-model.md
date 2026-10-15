# Data Model: Memoria y convenciones del equipo

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

No hay almacenamiento propio: las "entidades" son archivos que Claude Code descubre por su ubicación. Este documento fija cada archivo, si se versiona, cuándo se carga y quién manda si dos dicen cosas distintas.

## Archivos y su ciclo de carga

| Entidad | Archivo | ¿Versionado? | ¿Cuándo se carga? | Contenido (FR) |
|---------|---------|--------------|-------------------|----------------|
| Memoria del proyecto | `CLAUDE.md` | Sí | Al iniciar la sesión | Las 6 convenciones del equipo (FR-003) e `@import` de la constitución (FR-004) |
| Constitución (importada) | `.specify/memory/constitution.md` | Sí (ya existe) | Al iniciar, vía `@import` | Reglas no negociables; no se modifica en este ticket |
| Regla: tests | `.claude/rules/tests.md` | Sí | Al leer o editar `**/*.test.ts` | FR-006, FR-007 (1) |
| Regla: política | `.claude/rules/politica.md` | Sí | Al leer o editar `src/politica/**` | FR-007 (2), FR-007a |
| Regla: servidor MCP | `.claude/rules/servidor-mcp.md` | Sí | Al leer o editar `src/mcp/**` | FR-007 (3), FR-007a |
| Regla: specs | `.claude/rules/specs.md` | Sí | Al leer o editar `specs/**` | FR-007 (4) |
| Memoria personal del proyecto | `CLAUDE.local.md` | **No** (`.gitignore`) | Al iniciar, después de `CLAUDE.md` | Preferencias de FR-003a (FR-008) |
| Memoria personal global | `~/.claude/CLAUDE.md` | Fuera del repositorio | Al iniciar, antes de `CLAUDE.md` | Preferencias para todos los proyectos |
| Configuración compartida | `.claude/settings.json` | Sí | Al iniciar | `enabledMcpjsonServers: ["github"]` (FR-009) |
| Configuración personal | `.claude/settings.local.json` | **No** (`.gitignore`) | Al iniciar, con prioridad sobre la compartida | Permisos extra, modelo (FR-009) |
| Reglas de ignorado | `.gitignore` | Sí (ya existe) | — | Agrega `CLAUDE.local.md` y `.claude/settings.local.json` (FR-010) |
| Registro de decisión | `DECISIONES.md` | Sí (ya existe) | — | Entrada del #4 (FR-011) |

## Validaciones

- **`CLAUDE.md`**:
  - Menos de 60 líneas.
  - No contiene ningún párrafo de la constitución ni de las reglas: solo la importación y los enlaces (FR-002, SC-004).
  - Contiene exactamente las 6 convenciones de FR-003 y ninguna preferencia de FR-003a.
- **Cada regla**:
  - Su frontmatter tiene solo `paths`, como lista YAML de cadenas entre comillas.
  - Ninguna regla deja de tener `paths`: sin esa clave se cargaría siempre (R6).
- **Reglas de política y del servidor MCP**: enlazan la constitución con una ruta relativa y no repiten sus umbrales como norma. Solo los mencionan como bordes de prueba o aplicación (FR-007a).
- **`.gitignore`**: después de crear `CLAUDE.local.md` y `.claude/settings.local.json`, `git status` no los muestra (SC-003).

## Precedencia ante conflicto

- **Memoria** (se concatena, no se sobrescribe):
  1. `~/.claude/CLAUDE.md`
  2. `CLAUDE.md`, con la constitución importada
  3. `CLAUDE.local.md`
  4. reglas por ruta, al tocar archivos

  La convención del equipo prevalece sobre lo personal en lo listado en FR-003 (caso borde de la spec). Por eso `CLAUDE.md` lo declara de forma explícita.
- **Configuración**: `settings.local.json` > `settings.json` > `~/.claude/settings.json`. Las listas, como `permissions.allow`, se combinan.
- **Archivo que coincide con dos reglas** (por ejemplo, `src/politica/cuota.test.ts`): se cargan las dos. No se contradicen porque cada una cubre un aspecto distinto: test frente a política.
