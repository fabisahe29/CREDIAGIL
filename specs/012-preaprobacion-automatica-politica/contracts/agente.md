# Contrato: herramienta del agente, hooks, escalamiento y prompt

**Feature**: [../spec.md](../spec.md) · **Research**: R3, R4, R5, R8, R9 · **Zona**: [`src/agente/`](../../../src/agente/)

## Herramienta del adaptador

En [adaptador.ts](../../../src/agente/adaptador.ts), servidor SDK `originacion`. Su clave completa para el modelo es `mcp__originacion__preaprobar_credito`.

- **Descripción**: `DESCRIPCION_PREAPROBAR_CREDITO`, la misma del core (R8).
- **Sin** `readOnlyHint`: tiene efectos.
- **Esquema de entrada**: vacío. El modelo no envía montos, cuotas, ingresos ni el identificador de la solicitud (R3).

### Manejador

```text
preaprobarCredito()
  → llamarConReintentos("preaprobar_credito", core.preaprobarSolicitud(correlationId))
  → si ok: emite el evento «preaprobacion» y devuelve { idSolicitud, estado, repetida }
  → si falla fuera de política: deja la señal preaprobacion_fuera_de_politica y devuelve el error
  → cualquier otro error pasa tal cual
```

- **Evento de negocio** (R9): una preaprobación nueva emite el evento `preaprobacion` del catálogo, desde el código, con la regla (`REGLA_2`) y los valores de la decisión (monto, plazo, cuota, ingreso verificado). Una repetición no emite otro.
- **Bloqueo que llega al core**: si el hook no lo detuvo y el core rechaza con un código de la Regla 2 (`monto_sobre_tope`, `cuota_sobre_porcentaje`, `discrepancia_registrada`, `ingreso_no_verificado`, `cuota_no_calculable`), el adaptador deja la misma señal que el hook y devuelve el error.
- **Sin solicitud registrada** (`solicitud_no_registrada`) o **identidad** (`identidad_no_verificada`): el error pasa al modelo, sin señal de escalamiento por la Regla 2.
- Usa los mismos reintentos acotados y el tiempo límite de las demás herramientas. Si se agotan, deja la señal `falla_transitoria_persistente`.
- El modo de demostración del chat la muestra con `alUsarHerramienta`.

## Hook de identidad (sin cambios de lógica)

[control-identidad.ts](../../../src/agente/control-identidad.ts): `HERRAMIENTAS_CON_IDENTIDAD` pasa a incluir `preaprobar_credito`. Así la Regla 1 la aplica el hook del #9 con el estado del core, y bloquea con el siguiente paso de identificarse. La excepción de la Regla 3 del #13 sigue siendo solo del registro: `preaprobar_credito` con una señal de escalamiento vigente se deniega como cualquier otra herramienta.

## Hook nuevo de la Regla 2

[control-preaprobacion.ts](../../../src/agente/control-preaprobacion.ts), un hook `PreToolUse` que se registra junto al de identidad en `agente.ts`, con el mismo `matcher` del servidor. Solo actúa sobre `preaprobar_credito`; las demás herramientas pasan sin consultar al core.

```text
PreToolUse(preaprobar_credito)
  consulta la solicitud registrada al core (consultarSolicitudRegistrada, con reintentos acotados)
     core no responde      → denegar + señal falla_transitoria_persistente (FR-010)
     sin solicitud         → denegar con «regístrala antes de preaprobar»; sin señal
     con solicitud         → evaluarRegla2(monto, plazo, verificacion)
        permitido          → permitir
        bloqueado          → denegar + señal preaprobacion_fuera_de_politica
                             + evento bloqueo_por_regla (Regla 2) + log
```

- **Decide con el core**: nunca con `tool_input`; la herramienta no tiene campos, y si el modelo envía alguno se ignora.
- **Misma función**: llama a `evaluarRegla2`, la que usa el core.
- **Motivo accionable** al modelo: dice qué falló y que el caso pasa a un analista; no revela el tope ni el porcentaje.
- **Evento `bloqueo_por_regla`**: con la `regla` `REGLA_2`, los `valores` de la decisión y el `siguientePaso`: «Tu caso pasa a un analista».
- **Ante la duda, bloquea**: cualquier excepción al consultar deniega y se registra.

### Pruebas (FR-013, sin el modelo)

En `control-preaprobacion.test.ts`, con un core falso y la entrada del hook para `mcp__originacion__preaprobar_credito`:

| Caso | Esperado |
|------|----------|
| Solicitud de 4.000.000 a 24 meses con ingreso verificado de 3.800.000 | `{}` (pasa) |
| Monto de 5.000.000 con cuota dentro del 30% | `{}` |
| Monto de 5.000.001 | `deny`, señal `preaprobacion_fuera_de_politica` con el código `monto_sobre_tope` |
| Cuota exactamente al 30% | `{}` |
| Cuota un peso de ingreso por encima del 30% | `deny` con `cuota_sobre_porcentaje` |
| Verificación en estado `discrepancia` | `deny` con `discrepancia_registrada` |
| Verificación en `inconsistencia`, `sin_ingreso`, `falta_declarado` o sin verificación | `deny` con `ingreso_no_verificado` |
| Sin solicitud registrada | `deny` sin señal, con «regístrala antes» |
| El modelo envía monto, cuota o ingreso en la entrada | Se ignoran: decide el core |
| El core no responde tras los reintentos | `deny` y señal `falla_transitoria_persistente` |
| Otra herramienta (por ejemplo `registrar_solicitud`) | `{}` sin consultar al core |
| Evento que no es `PreToolUse` | `{}` |
| Un bloqueo | Emite `bloqueo_por_regla` con la Regla 2 y no emite `preaprobacion` |

## Escalamiento

Un motivo nuevo en [adaptador.ts](../../../src/agente/adaptador.ts) y [agente.ts](../../../src/agente/agente.ts):

| Dónde | Cambio |
|-------|--------|
| `SenalEscalamiento.motivo` | agrega `preaprobacion_fuera_de_politica` |
| `SenalEscalamiento` | agrega `codigo?`: el código de la decisión que bloqueó |
| `ORDEN_REGLA` | `preaprobacion_fuera_de_politica` → 2 (el tipo de la regla admite 2) |
| `AVISOS` | «Tu solicitud no cumple las condiciones para una preaprobación automática. Pasa a un analista, que te contactará.» |
| `REGLAS` | `REGLA_2` |
| `revisarRegla5AlCerrarTurno` | una señal de la Regla 2 también se deja reemplazar por una de la Regla 5, que va antes en el orden |

Una señal de la Regla 2 prevalece solo sobre las posteriores a ella en el orden (ninguna) y la reemplazan las de las reglas 4, 5, 1 y 3, por el orden 4 → 5 → 1 → 3 → 2 de `prevalece`. Una conversación escalada por la Regla 2 deniega las demás herramientas, como con cualquier señal.

## Prompt (`agente.ts`)

Se agregan estas instrucciones tras las del registro de la solicitud; no cambia ninguna existente:

- «Cuando la solicitud del solicitante verificado ya esté registrada y su ingreso verificado, llama a preaprobar_credito, sin enviarle datos. Compromete a la fintech: no la uses para explorar ni para decir cuánto pagaría; para eso está calcular_capacidad_pago.»
- «Si preaprobar_credito se rechaza porque no cumple las condiciones, no insistas, no la intentes con otros datos ni ofrezcas un monto o plazo alternativo: el caso pasa a un analista. Si dice que falta registrar la solicitud, regístrala y vuelve a intentar una vez.»
- «Una preaprobación es solo la constancia de que se cumple la política; no digas que el crédito está aprobado ni inventes una vigencia ni condiciones. La decisión definitiva la toma un analista.»

`agente.test.ts` verifica que el prompt nombra `preaprobar_credito`, que dice que compromete a la fintech, que no ofrece alternativas y que no menciona el tope ni el porcentaje.

## Lo que no cambia

- El catálogo de eventos de negocio y su presentación en el chat.
- El orden de prevalencia 4 → 5 → 1 → 3 → 2 y los motivos de escalamiento existentes.
- Las herramientas del #7 al #13.
- El hook de identidad salvo su lista de herramientas.
