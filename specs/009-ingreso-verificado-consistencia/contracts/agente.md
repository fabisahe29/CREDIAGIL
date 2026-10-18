# Contrato: agente y adaptador

**Feature**: [../spec.md](../spec.md) · **Modelo**: [../data-model.md](../data-model.md) · **Decisiones**: R6 a R9 de [../research.md](../research.md) · **Base**: [#10](../../008-extraccion-documentos/contracts/agente.md)

## Herramienta `verificar_ingreso` (nueva, adaptador `originacion`)

El modelo la llama cuando el solicitante dice cuánto gana al mes, o cuando ya entregó documentos de ingreso.

**Entrada**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ingresoDeclarado` | entero ≥ 0, opcional | Lo que el solicitante dijo ganar al mes, en pesos. Omitirlo si no lo dijo; no lo inventes ni lo calcules |

**Descripción para el modelo**: «Verifica el ingreso mensual del solicitante con sus documentos y lo compara con lo que declaró. Devuelve el ingreso verificado o lo que falta. No calcules ni compares ingresos por tu cuenta. Exige la identidad verificada.»

**Manejador** (`verificar_ingreso` en `src/agente/adaptador.ts`): llama al core con reintentos (`llamarConReintentos("verificar_ingreso", …)`) y aplica los efectos del estado, decididos por código:

| Estado | Efecto | Respuesta al modelo |
|--------|--------|---------------------|
| `verificado` | ninguno | `{ estado, ingresoVerificado, origen }` |
| `falta_declarado` | evento `solicitud_de_dato` (`ingreso_declarado_faltante`) | `{ estado, faltaDeclarado: true }` |
| `sin_ingreso` | evento `solicitud_de_dato` (`ingreso_no_verificable`) | `{ estado, faltanDocumentos: true }` |
| `discrepancia` | señal `discrepancia_de_ingreso` (Regla 3) | `{ escalada: true, estado }` |
| `inconsistencia` | señal `inconsistencia_documental` (Regla 3) | `{ escalada: true, estado }` |
| `no_cubierto` | señal `caso_no_cubierto` (Regla 5), si no la había | `{ escalada: true, estado }` |

- Al modelo **no** le llegan las inconsistencias ni la diferencia: el análisis va al analista (#15). Solo recibe lo que necesita para responder.
- Un `no_cubierto` ya escaló en el #10; el manejador lo confirma y no cambia el motivo ni la causa de esa señal.
- Con la conversación ya escalada, el control de identidad niega la herramienta antes de llegar aquí.
- Si el core falla tras los reintentos, la conversación escala con `falla_transitoria_persistente` (Principio VI); nunca se decide sin respuesta.

## Verificación interna tras cada extracción

Después de registrar un documento `extraido` nuevo (no una extracción reutilizada), `extraer_documento` pide al core `verificarIngreso` **sin** `ingresoDeclarado` y aplica solo:

1. **Reextracción** de las inconsistencias `corregible` que involucran al documento (R6), una ronda por `(adjunto, regla)`. Después vuelve a verificar, una sola vez.
2. **Escalamiento** con `inconsistencia_documental` si queda una inconsistencia con `detiene: true`.

No emite `solicitud_de_dato` ni escala por discrepancia en este camino: esos efectos son de la herramienta `verificar_ingreso`, que sí tiene el ingreso declarado.

### Reextracción

```ts
// src/agente/extraccion.ts
extraerConIntentos({ documento, ejecutarSubagente, correlationId, hoy, erroresIniciales })
```

- `erroresIniciales` (nuevo, opcional) son los errores que recibe el **primer** intento de la ronda; el resto sigue como en el #10 (los errores de un intento inválido pasan al siguiente).
- El error de entrada de una reextracción es `{ campo, motivo: "inconsistencia_entre_documentos", detalle }`, con `detalle` como: «Regla titular_vs_solicitante: el titular del extracto debe ser el solicitante verificado. Valor extraído: «…». Vuelve a leer el documento y copia el titular tal como aparece.» **Nunca** el valor esperado.
- El resultado se registra con `reextraccion: { regla }`. Si el core responde `reextraccion_no_aplica` o `reextraccion_agotada`, se conserva el registro anterior y se sigue: la inconsistencia vigente decide.
- Si el reemplazo deja un registro que ya no está cubierto (`no_cubierto`), el adaptador escala por la Regla 5, que prevalece sobre la Regla 3.
- Si el subagente no responde en la ronda, se conserva el registro anterior; la inconsistencia vigente decide. No escala por ello: la falla de la reextracción no empeora lo que ya había.
- El subagente recibe solo el documento y el error, como en el #10 (FR-011 del #10). No recibe la conversación, otros documentos ni el nombre del solicitante.

## Escalamiento y orden de reglas

`SenalEscalamiento["motivo"]` agrega `discrepancia_de_ingreso` e `inconsistencia_documental`. En `src/agente/adaptador.ts`:

- `ORDEN_REGLA` incluye ambos con la Regla 3.
- `prevalece` usa el orden de la constitución `[4, 5, 1, 3, 2]`. Una señal de la Regla 4, 5 o 1 reemplaza a una de la 3. Una señal técnica ni reemplaza ni es reemplazada.
- `AVISOS` y `REGLAS` en `src/agente/agente.ts` agregan los dos motivos (avisos en [data-model.md](../data-model.md#senalescalamiento-cambia-el-del-910)).

## Control de identidad

`HERRAMIENTAS_CON_IDENTIDAD` pasa a `["extraer_documento", "verificar_ingreso"]`. Sin identidad verificada, `verificar_ingreso` se bloquea con `bloqueo_por_regla` (Regla 1), igual que la extracción. La Regla 5 previa al bloqueo del #10 no cambia: el control sigue preguntando si un documento no está cubierto antes de bloquear por identidad.

## Prompt del modelo (`src/agente/agente.ts`)

Se agregan tres instrucciones:

- «Cuando el solicitante te diga cuánto gana al mes, o cuando ya haya entregado documentos de ingreso, llama a verificar_ingreso con el ingreso que declaró, como un entero de pesos; si no lo dijo, llámala sin ese dato.»
- «No calcules, compares ni des por bueno un ingreso por tu cuenta: usa solo lo que devuelve verificar_ingreso. Un ingreso que el solicitante escribe no reemplaza a un documento.»
- «Si el solicitante declara su ingreso en otra moneda, no lo registres: llama a solicitar_analista con motivo caso_no_cubierto y causa moneda_extranjera.»

El prompt guía; lo obligatorio lo aplica el código (identidad, estados, escalamiento).

## Logs

| Log | Campos | Cuándo |
|-----|--------|--------|
| `verificacion_ingreso` | `correlationId`, `estado`, `origen`, `inconsistencias` (reglas), `declarado: true/false`, `reextracciones` | Cada verificación |
| `intento_extraccion` | los del #10 más `reextraccion: <regla>` | Cada intento de una reextracción |
| `escalamiento` | el del #7, con el motivo nuevo | Una señal de la Regla 3 |

Nunca llevan el contenido, los fragmentos ni los valores de los documentos. Los montos de ingreso solo aparecen como enteros en la auditoría del core.
