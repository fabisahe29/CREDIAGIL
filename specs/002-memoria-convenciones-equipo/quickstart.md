# Quickstart: validar memoria y convenciones del equipo

**Feature**: [spec.md](spec.md) · **Contrato**: [contracts/archivos-memoria.md](contracts/archivos-memoria.md)

Validación manual de punta a punta. Los comandos `/memory` y `/context` de Claude Code muestran qué memoria y qué reglas están cargadas.

## Escenario 1: convenciones al clonar (Historia 1 · FR-001 a FR-004 · SC-001, SC-004)

| Paso | Resultado esperado |
|------|--------------------|
| `git clone` en una carpeta nueva y abrir Claude Code en la raíz | Sin pasos de configuración |
| `/memory` | Aparecen `CLAUDE.md` y la constitución importada; ninguna regla de `.claude/rules/` cargada todavía |
| Preguntar "¿en qué idioma van los commits y qué formato usan?" | "Español, convencionales", sin dar contexto adicional |
| `wc -l CLAUDE.md` | Menos de 60 líneas |
| Comparar `CLAUDE.md` con la constitución y las reglas | Ningún párrafo copiado; solo importación y enlaces |

## Escenario 2: reglas por ruta (Historia 2 · FR-005 a FR-007 · SC-002)

Archivos de ejemplo **temporales**, que no se commitean:
- `src/politica/cuota.test.ts`
- `src/mcp/herramientas/registrar.test.ts`
- `pruebas/e2e/flujo-preaprobable.test.ts`
- `src/politica/cuota.ts` y `pruebas/e2e/fixtures/certificado-laboral.md`, que no son test

| Paso | Resultado esperado |
|------|--------------------|
| Pedir a Claude que lea cada uno de los 3 archivos `.test.ts`, en sesiones nuevas | En los 3 casos `/context` muestra `tests.md` cargada (SC-002: 3 carpetas de distinta profundidad) |
| Leer `src/politica/cuota.ts` en una sesión nueva | Se carga `politica.md` y **no** se carga `tests.md` |
| Leer `pruebas/e2e/fixtures/certificado-laboral.md` en una sesión nueva | **No** se carga `tests.md` (aclaración Q3) |
| Leer `src/politica/cuota.test.ts` | Se cargan `tests.md` y `politica.md` |
| Leer `src/mcp/herramientas/registrar.test.ts` | Se cargan `tests.md` y `servidor-mcp.md` |
| Leer `specs/002-memoria-convenciones-equipo/spec.md` | Se carga `specs.md` |
| `/context` justo al iniciar una sesión nueva | Ninguna regla de `.claude/rules/` cargada (un YAML roto la haría global, R6) |
| Borrar los archivos de ejemplo | `git status` limpio |

## Escenario 3: lo personal aparte (Historia 3 · FR-008 a FR-010 · SC-003)

| Paso | Resultado esperado |
|------|--------------------|
| Crear `CLAUDE.local.md` con "Responde de forma muy breve" | `/memory` lo muestra y Claude lo aplica |
| Crear `.claude/settings.local.json` con un permiso extra | `/status` muestra la configuración combinada; `.claude/settings.json` sin cambios |
| `git status` | Ninguno de los dos aparece |
| `git check-ignore -v CLAUDE.local.md .claude/settings.local.json` | Ambos ignorados por `.gitignore` |
| Poner en `CLAUDE.local.md` "escribe los commits en inglés" y pedir un mensaje de commit | Sale en español: prevalece la convención del equipo |

## Escenario 4: decisiones registradas (Historia 4 · FR-011 · SC-005)

| Paso | Resultado esperado |
|------|--------------------|
| Leer `DECISIONES.md` | Una entrada del #4 con R1, R2, R3, R7 y R8; cada una con su alternativa descartada |
