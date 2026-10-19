# Contrato: `escalar_a_analista` con asuntos pendientes

**Base**: [specs/013-escalamiento-analista/contracts/core-mcp.md](../../013-escalamiento-analista/contracts/core-mcp.md) · **Decisión**: [R7](../research.md)

Un cambio aditivo al contrato del #15. No hay herramientas nuevas.

## Entrada

Un campo opcional:

| Campo | Tipo | Regla |
|-------|------|-------|
| `asuntosPendientes` | lista de `ASUNTOS` | Sin repetidos, hasta 3. Opcional |

- Un valor fuera de `ASUNTOS`, un repetido o más de 3 devuelven un error de validación tipado (`formato_invalido`, campo `asuntosPendientes`). El campo no se corrige.
- Sin el campo, la herramienta funciona exactamente como en el #15.
- `CAMPOS_CONOCIDOS` y el esquema de la entrada incluyen el campo; los demás campos extra siguen rechazándose.

## Resumen del analista

| Campo | Tipo | Regla |
|-------|------|-------|
| `asuntosPendientes` | lista de `ASUNTOS` | Siempre presente; vacía si no hay |

- El core copia la lista de la entrada y no la calcula: es lo que el agente observó, no algo que el core sepa.
- Es de solo información para el analista: no cambia la causa, la acción recomendada ni los `pendientes`.

## Idempotencia

Sin cambios. Hay un solo escalamiento por conversación y repetir, o llegar con otra clave u otros asuntos, devuelve el primero con `repetida: true`. `asuntosPendientes` es el del primer escalamiento.

## Auditoría y logs

La auditoría del escalamiento agrega `asuntosPendientes` como una lista de nombres del catálogo. No incluye el texto del mensaje.

## Descripción para el modelo

El modelo no llama a `escalar_a_analista`: lo hace el agente por código. `DESCRIPCION_ESCALAR_A_ANALISTA` solo agrega una frase que explica que el resumen incluye los asuntos del mensaje que quedaron pendientes.

## Pruebas obligatorias

- La entrada con y sin `asuntosPendientes`, con un valor fuera del catálogo, repetido y con más de 3.
- El resumen devuelve la lista; sin el campo, la lista es vacía.
- Una repetición con otros asuntos devuelve el resumen original.
- El esquema del resumen rechaza un valor fuera del catálogo.
