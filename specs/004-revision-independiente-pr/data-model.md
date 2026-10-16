# Data Model: Revisión independiente y de cumplimiento antes del pull request

**Feature**: [spec.md](spec.md) · **Decisiones**: [research.md](research.md)

Todas las entidades viven en archivos locales bajo `.git/crediagil/revisiones/<sha>/` (no versionados) o en comentarios del issue. No hay base de datos. Los esquemas exactos están en [contracts/informe.md](contracts/informe.md).

## Paquete de revisión

Lo que recibe cada revisor (R4). Lo crea `revision.ts preparar`.

| Campo | Tipo | Regla |
|-------|------|-------|
| `issue` | entero > 0 | Sale de la spec activa (Regla 2 del flujo) |
| `rama` | texto | Rama actual; debe existir en `origin` |
| `sha` | texto, 40 hex | Head de `origin/<rama>`. Identifica el paquete y la revisión |
| `base` | texto, 40 hex | `git merge-base origin/main <sha>` |
| `archivos` | lista de `{ruta, estado}` | `estado` ∈ `agregado`, `modificado`, `eliminado`, `renombrado`. No vacía (si no, `preparar` falla) |
| `spec` | ruta | `spec.md` de la carpeta activa, con `Issue de origen` #`issue` |
| `constitucion` | ruta | `.specify/memory/constitution.md` |

Archivos del paquete: `paquete.json`, `diff.patch` y, cuando corresponda, `informe-codigo.json`, `informe-cumplimiento.json`, `fallo-<tipo>.json` y `decision.json`.

## Hallazgo (revisión de código)

| Campo | Tipo | Regla |
|-------|------|-------|
| `severidad` | `critica` · `alta` · `media` · `baja` | Definiciones de FR-008a |
| `archivo` | ruta | Debe estar en `paquete.archivos`, o ser contexto afectado (FR-004) |
| `linea` | entero ≥ 1 | |
| `contexto` | `{archivo, linea}` opcional | Obligatorio si el hallazgo cita una línea fuera del diff (FR-004, punto 1) |
| `descripcion` | texto no vacío | Sin datos con forma real (FR-012) |
| `sugerencia` | texto no vacío | |
| `preexistente` | booleano | Si es `true`, `severidad` MUST ser `baja` (FR-004, punto 2) |

**Informe de código**: `{tipo: "codigo", sha, hallazgos: Hallazgo[], resumen}`. Una lista vacía significa «sin hallazgos» y se informa explícitamente (FR-002).

## Estado de regla (revisión de cumplimiento)

| Campo | Tipo | Regla |
|-------|------|-------|
| `regla` | 1 · 2 · 3 · 4 · 5 | Cada valor aparece **exactamente una vez** (FR-005) |
| `estado` | `cumplida` · `incumplida` · `no_aplicable` | |
| `evidencia` | lista de `{archivo, linea, cita}` | No vacía si el estado es `cumplida` o `incumplida` (FR-006) |
| `contrastado_con` | lista de textos | Requisito de la spec o principio de la constitución (por ejemplo, `FR-012`, `Principio I`). Opcional |
| `motivo` | texto | Obligatorio si el estado es `no_aplicable` (FR-006) |

**Informe de cumplimiento**: `{tipo: "cumplimiento", sha, reglas: EstadoRegla[5], restricciones: Hallazgo[], resumen}`. `restricciones` recoge las violaciones de FR-007 (módulo único de política, orden de evaluación, aritmética exacta, determinismo), con la misma forma y severidades que un hallazgo de código.

## Decisión

Resultado de `revision.ts decidir` (R6). Se guarda en `decision.json`.

| Campo | Tipo | Regla |
|-------|------|-------|
| `sha` | texto, 40 hex | El del paquete |
| `permite` | booleano | `false` si alguna regla está `incumplida`, si algún hallazgo o restricción es `alta` o `critica`, o si alguna revisión falló |
| `motivos` | lista de textos | Cada bloqueo con archivo y línea (FR-008, punto 3). Vacía si `permite` |
| `conteos` | `{critica, alta, media, baja, cumplidas, incumplidas, no_aplicables}` | Para el resumen del PR (FR-010a) |
| `revisiones` | `{codigo, cumplimiento}` → `valida` · `fallida` | |

### Transiciones de una revisión

```text
(sin paquete) ──preparar──▶ preparada ──revisor──▶ informe válido ──decidir──▶ decidida
                                │                      ▲
                                │   informe inválido ──┘ (SubagentStop, 1 corrección)
                                ▼
                         fallida (tras 1 reintento del flujo) ──decidir──▶ decidida (permite: false)
```

## Registro de revisión

Comentario del issue (R7). Uno por `(tipo, sha)`.

| Parte | Contenido |
|-------|-----------|
| Marcador | `<!-- crediagil:revision=<tipo>;commit=<sha> -->` en la primera línea |
| Encabezado | tipo, `sha` corto, decisión y fecha |
| Resumen | conteos por severidad o por estado, y los hallazgos o reglas que bloquean |
| Detalle | el informe completo en JSON dentro de `<details>`, para auditar y reutilizar |

**Reutilización**: si el issue ya tiene los dos registros del `sha` actual, `revision.ts reutilizar` recupera los informes del bloque `<details>`, los vuelve a validar y recalcula la decisión. Si alguno no valida, se tratan como inexistentes y se revisa de nuevo.
