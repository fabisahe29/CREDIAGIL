# Data Model: Guardarraíles del repositorio con hooks

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md) · **Contratos**: [contracts/](contracts/)

No hay almacenamiento. Las entidades son estructuras en memoria que los hooks construyen en cada llamada a una herramienta, más dos fuentes de configuración versionadas: la convención de datos ficticios y la configuración de Claude Code.

## Acción (entrada normalizada)

Lo que el guardián evalúa. Se construye a partir del JSON que Claude Code envía al hook ([contracts/hooks.md](contracts/hooks.md)).

| Campo | Tipo | Origen | Uso |
|-------|------|--------|-----|
| `herramienta` | texto | `tool_name` | Decide qué controles aplican |
| `rutas` | lista de rutas, relativas a la raíz | `file_path`, `notebook_path`, `path` | Secretos (FR-005), spec primero (FR-008) |
| `textos` | lista de textos | `content`, `new_string`, `edits[].new_string`, `command`, todo texto de una herramienta MCP | Datos con forma real (FR-001, FR-002) |
| `comando` | texto u omitido | `command` de Bash o PowerShell | Secretos por shell (FR-006, FR-006a) y escrituras por shell bajo `src/` |
| `rama` | texto | `git branch --show-current` | Spec primero (FR-010) |

**Validación**: la entrada se valida contra su esquema. Si no lo cumple, el guardián **bloquea** con el error (FR-015), no adivina (constitución, Principio III).

## Bloqueo

Resultado de un control que impide la acción (FR-014).

| Campo | Tipo | Regla |
|-------|------|-------|
| `control` | `datos-reales` · `secretos` · `spec-primero` · `error-interno` | Uno por bloqueo |
| `detectado` | texto | Qué se encontró y dónde (archivo y línea, o comando). Para datos reales se muestra **enmascarado**: solo los últimos 4 dígitos. Así el dato no termina en el contexto ni en logs |
| `regla` | texto | Requisito o principio que lo prohíbe (por ejemplo, "Principio II · FR-001") |
| `correccion` | texto | Acción concreta: usar la convención ficticia, excluir `.env` de la búsqueda, crear la spec con `/speckit-specify`… |

**Agregación**: el guardián ejecuta **todos** los controles que aplican y junta todos los bloqueos en un solo mensaje (FR-014). La acción se permite solo si la lista queda vacía.

## Patrón de dato con forma real

Definido en la aclaración Q2 y FR-001. La fuente única es `.claude/hooks/lib/convencion-ficticia.ts`, y su versión legible es `docs/datos-ficticios.md` ([contracts/convencion-datos-ficticios.md](contracts/convencion-datos-ficticios.md)).

| Tipo | Dígitos | Separadores admitidos | Condición extra | Contexto |
|------|---------|-----------------------|-----------------|----------|
| Tarjeta | 13–19 | espacio, guion | pasa Luhn | cualquiera |
| Cédula | 6–10 | punto de miles | — | palabra clave de documento en la misma línea |
| NIT | 9 + DV | punto de miles, guion antes del DV | — | palabra `NIT` en la misma línea |
| Cuenta | 10–20 | espacio, guion | — | palabra clave de cuenta en la misma línea |

**Exención (convención ficticia)**: un número cuyos dígitos empiezan por `000` es ficticio y no se bloquea, sea del tipo que sea (R3).

## Archivo protegido

| Regla | Ejemplos |
|-------|----------|
| Su nombre es `.env` o empieza por `.env.`, en cualquier carpeta | `.env`, `.env.local`, `config/.env.production` |
| **Excepción**: `.env.example` | Plantilla versionada sin valores reales (FR-007) |

## Ticket y spec (FR-010)

| Paso | Regla |
|------|-------|
| Ticket | La rama actual coincide con `^([1-9][0-9]*)-` → `N`. Si no coincide (por ejemplo, `main` o `003-…`), no hay ticket |
| Spec | Existe `specs/*/spec.md` con una línea que empieza por `**Issue de origen**: [fabisahe29/CREDIAGIL#N ` |
| Resultado | Escribir bajo `src/` se permite solo si hay ticket **y** spec |

## Estados de una acción

```text
llamada a herramienta
  └─ PreToolUse: guardián
       ├─ entrada inválida o error interno ──→ BLOQUEADA (error-interno)
       ├─ 1 o más bloqueos ─────────────────→ BLOQUEADA (todos los motivos)
       └─ sin bloqueos ─────────────────────→ PERMITIDA → la herramienta se ejecuta
                                                └─ PostToolUse (Write/Edit/MultiEdit): formateador
                                                     ├─ tipo sin formato ──→ sin cambios, sin aviso
                                                     ├─ formateado ────────→ sin aviso
                                                     └─ falla ─────────────→ edición conservada + motivo al modelo
```
