# Contrato: identidad en el agente

**Requisitos**: FR-005, FR-006, FR-009, FR-011, FR-011a, FR-012 a FR-014 · **Decisiones**: [research.md](../research.md), R5 a R8

Extiende el adaptador y `conversar` del [#7](../../005-esqueleto-agente-mcp/contracts/agente.md) y del [#8](../../006-interfaz-chat/contracts/eventos.md). Sin historial ni identidad, el comportamiento existente no cambia.

## Herramientas del adaptador (`originacion`)

| Herramienta | Llama a | Expuesta al modelo | Anotación |
|-------------|---------|--------------------|-----------|
| `consultar_solicitud` | sin cambios | sí | `readOnlyHint` |
| `buscar_solicitante` | `core.buscarSolicitante` | sí | `readOnlyHint` |
| `verificar_identidad` | `core.verificarIdentidad` | sí | — |
| — | `core.consultarIdentidad` | **no**: solo el control de identidad | — |

`verificar_identidad` usa un `idIntento` (UUID) por dato del turno (`idSolicitante` + `fechaExpedicion`). Lo repiten los reintentos, una llamada repetida con el mismo dato y el reintento del turno cuando falla el modelo. El modelo no lo ve ni lo envía. Las tres pasan por `llamarConReintentos` (2 reintentos ante un error transitorio; si se agotan, escalan con el motivo `falla_transitoria_persistente`). El esquema que ve el modelo para `buscar_solicitante` tiene `documento` y `nombre` opcionales; la regla «exactamente uno» la aplica el core.

## Efectos deterministas del manejador (R6)

| Respuesta del core | Efecto en código |
|--------------------|------------------|
| `buscar_solicitante` con ≥ 2 coincidencias, y ya hubo una ambigua en este mismo turno | ninguno: dentro de un turno cuenta una sola (`ambiguaEnTurno`) |
| `buscar_solicitante` con ≥ 2 coincidencias, primera vez en la conversación | `busquedasAmbiguas += 1`; emite `solicitud_de_dato` (ver abajo) |
| `buscar_solicitante` con ≥ 2 coincidencias, y ya hubo una ambigua sin desambiguar después | señal de escalamiento `identidad_ambigua` |
| `buscar_solicitante` con exactamente 1 coincidencia | `busquedasAmbiguas = 0`: ya se desambiguó |
| `verificar_identidad` → `verificacion_bloqueada` | señal de escalamiento `identidad_no_verificable` |
| 0 coincidencias; `dato_no_coincide`; verificación exitosa; errores de validación | ninguno: el resultado vuelve al modelo |

Evento de la búsqueda ambigua:

```json
{
  "tipo": "solicitud_de_dato",
  "descripcion": "Encontré varias personas con ese nombre. Necesito tu número de documento para continuar.",
  "motivo": "varias_coincidencias",
  "dato": "número de documento de identidad",
  "regla": "Regla 1 · coincidencias sin desambiguar",
  "valores": { "coincidencias": 2 }
}
```

### Contador entre turnos

`conversar` crea un `EstadoConversacion` nuevo en cada turno, así que el contador de búsquedas ambiguas viaja entre turnos de forma explícita, igual que el historial (R1 del #8):

- `OpcionesConversar.busquedasAmbiguas?: number` (por defecto 0): el valor acumulado de la conversación.
- `ResultadoConversacion.busquedasAmbiguas: number`: el valor tras el turno.
- Cada intento del modelo parte del valor recibido. Un intento fallido que se reintenta no suma.
- El chat guarda el valor en su `Conversacion` y lo pasa en cada turno. Una conversación nueva (`/nueva`) empieza en 0.

## Motivos nuevos de escalamiento — `src/agente/agente.ts`

| Motivo | Aviso al solicitante | Regla |
|--------|----------------------|-------|
| `identidad_no_verificable` | «No pude verificar tu identidad. Tu caso pasa a un analista, que te contactará.» | `Regla 1 · 3 intentos fallidos de verificación` |
| `identidad_ambigua` | «No pude identificarte con certeza. Tu caso pasa a un analista, que te contactará.» | `Regla 1 · coincidencias sin desambiguar` |

El evento `escalamiento` lleva en `valores` la herramienta que lo disparó y, para `identidad_ambigua`, `coincidencias: n`. Por eso `SenalEscalamiento` suma el campo opcional `coincidencias`. Nunca lleva documentos ni fechas.

## Control de identidad — `src/agente/control-identidad.ts` (R7)

```ts
export const HERRAMIENTAS_CON_IDENTIDAD: readonly string[]; // hoy []; #10 y #13 agregan
export function crearControlIdentidad(opciones: {
  core: Pick<ClienteCore, "consultarIdentidad">;
  estado: EstadoConversacion;
  herramientas?: readonly string[]; // por defecto HERRAMIENTAS_CON_IDENTIDAD
}): HookCallback;
```

El callback solo actúa sobre `PreToolUse` cuyo `tool_name` es `mcp__originacion__<h>`, con `h` en la lista. Para cualquier otra herramienta responde `{}` (sigue).

| Situación | Respuesta del hook | Evento |
|-----------|--------------------|--------|
| `consultarIdentidad` ok y `evaluarRegla1` permitido (si la herramienta trae `idSolicitante`, debe ser el verificado) | `{}` | — |
| Identidad verificada, pero la herramienta trae otro `idSolicitante` | `deny`, motivo: «Regla 1: la identidad verificada es de otro solicitante.» | `bloqueo_por_regla` con `valores.identidad: "verificada para otro solicitante"` |
| `evaluarRegla1` no permitido | `permissionDecision: "deny"`, motivo: «Regla 1: la identidad del solicitante no está verificada.» | `bloqueo_por_regla` |
| `consultarIdentidad` con un error transitorio, reintentos agotados (`conReintentos`, 2 reintentos con backoff) | `deny`, motivo: «No se pudo comprobar la identidad; no se continúa.» | `bloqueo_por_regla` y señal `falla_transitoria_persistente` con `herramienta: "consultar_identidad"` → la conversación escala |
| `consultarIdentidad` con un error no transitorio (validación o fuera de contrato) | `deny`, el mismo motivo, sin reintentar | `bloqueo_por_regla` |

Evento de bloqueo:

```json
{
  "tipo": "bloqueo_por_regla",
  "descripcion": "Para continuar necesito verificar tu identidad.",
  "motivo": "identidad_no_verificada",
  "regla": "Regla 1 · identidad verificada antes de registrar",
  "valores": { "identidad": "no verificada", "herramienta": "<h>" },
  "siguientePaso": "Indícame tu número de documento para buscarte y verificarte."
}
```

`conversar` registra el control en cada `query()`:

```ts
hooks: { PreToolUse: [{ matcher: `mcp__${CLAVE_SERVIDOR}__.*`, hooks: [controlIdentidad] }] }
```

## System prompt (R8)

Se suman estas instrucciones, sin quitar las existentes, en este orden (4 → 5 → 1):

- «Si el solicitante pide hablar con una persona, no lo busques ni le pidas datos: dile de inmediato que su caso pasa a un analista.»
- «Si el caso no está cubierto por la política, por ejemplo ingresos en moneda extranjera o un documento no soportado, tampoco lo identifiques: dile que su caso pasa a un analista.»
- «En cualquier otro caso, cuando el solicitante quiera iniciar una solicitud, pídele primero su número de documento o su nombre completo y búscalo con buscar_solicitante. Las preguntas generales se responden sin identificar.»
- «Si hay varias coincidencias, no elijas: pide el número de documento.»
- «Verifica la identidad con verificar_identidad y la fecha de expedición del documento. No pidas ni uses documentos de soporte antes de verificar. Si el dato no coincide, no reveles el correcto.»
