# Data Model: Preaprobación automática dentro de la política

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

Esta feature guarda la preaprobación, en memoria y en el core, dentro de la solicitud registrada del #13. Los tipos viven en [src/compartido/preaprobacion.ts](../../src/compartido/preaprobacion.ts) y reutilizan los de `solicitud.ts`.

## Parámetros de política

En [src/politica/politica.ts](../../src/politica/politica.ts), única fuente (R1).

| Constante | Valor | Uso |
|-----------|-------|-----|
| `TOPE_MONTO_PREAPROBACION` | `5_000_000` | Monto máximo, en pesos, que se preaprueba (inclusive). |
| `PORCENTAJE_MAXIMO_CUOTA_INGRESO` | `30` | Relación máxima, en porcentaje, entre la cuota y el ingreso verificado (inclusive). |
| `VERSION_POLITICA` | sube de `2026-10-18.2` a `2026-10-18.3` | Acompaña cada decisión de la política. |

## Entrada de la política

`evaluarRegla2` recibe lo que ya guarda la solicitud registrada; nunca lo que envía el modelo.

| Campo | Tipo | Origen |
|-------|------|--------|
| `monto` | entero de pesos, `> 0` | `SolicitudRegistrada.monto.valor` |
| `plazoMeses` | entero, `> 0` | `SolicitudRegistrada.plazoMeses.valor` |
| `verificacion` | `VerificacionRegistrada` o `null` | `SolicitudRegistrada.verificacionIngreso` |

## DecisionRegla2

El resultado explicable de evaluar la Regla 2 (Principio III).

| Campo | Tipo | Notas |
|-------|------|-------|
| `regla` | texto | `REGLA_2`: «Regla 2 · preaprobación dentro de la política». |
| `permitido` | booleano | Verdadero solo si se cumple todo. |
| `codigo` | texto o ausente | Solo en un bloqueo: `ingreso_no_verificado`, `discrepancia_registrada`, `monto_sobre_tope`, `cuota_sobre_porcentaje` o `cuota_no_calculable`. |
| `motivo` | texto | La razón, en lenguaje claro. |
| `valores` | mapa de textos o enteros | Monto, plazo, cuota mensual (si se pudo calcular), ingreso verificado (si hay), tope y porcentaje máximo. |
| `versionPolitica` | texto | `VERSION_POLITICA`. |

**Orden de evaluación** (FR-014): estado de la verificación de ingreso (Regla 3) → monto → cuota. El primer criterio que falla decide.

| Condición | `codigo` |
|-----------|----------|
| No hay verificación, o su estado no es `verificado` ni `discrepancia` | `ingreso_no_verificado` |
| El estado es `discrepancia` | `discrepancia_registrada` |
| `monto > TOPE_MONTO_PREAPROBACION` | `monto_sobre_tope` |
| `calcularCuota` lanza `ErrorCuota` | `cuota_no_calculable` |
| `cuota · 100 > PORCENTAJE_MAXIMO_CUOTA_INGRESO · ingreso` | `cuota_sobre_porcentaje` |

Un monto de exactamente $5.000.000 y una cuota que es exactamente el 30% del ingreso verificado se permiten (FR-005).

## Preaprobacion

La constancia que se guarda en la solicitud (aclaración Q1): sin vigencia ni condiciones.

| Campo | Tipo | Notas |
|-------|------|-------|
| `preaprobadaEn` | fecha ISO 8601 | Reloj del core. |
| `decision` | `DecisionRegla2` con `permitido: true` | La decisión explicable, con la regla, los valores y el motivo. |

## SolicitudRegistrada (cambios sobre el #13)

| Campo | Antes | Ahora |
|-------|-------|-------|
| `estado` | `"en_estudio"` | `"en_estudio"` o `"preaprobada"` |
| `preaprobacion` | no existía | `Preaprobacion` o `null` |

Invariantes del esquema:
- `estado = preaprobada` si y solo si `preaprobacion` no es `null`.
- La solicitud preaprobada cuenta como abierta (R6).

### Transiciones

```text
en_estudio ── preaprobar_credito permitido ──▶ preaprobada
en_estudio ── preaprobar_credito bloqueado ──▶ en_estudio (sin cambio; escala)
preaprobada ── preaprobar_credito otra vez ──▶ preaprobada (misma preaprobación, repetida: true)
```

No hay más estados en este ticket: el escalamiento con handoff y el cierre son del #15.

## Respuestas de la herramienta

### Del core: `preaprobar_credito`

`datos.solicitud`: la `SolicitudRegistrada` completa con su `preaprobacion`, y `datos.repetida`: `boolean`.

### Del adaptador al modelo

Lo mínimo para responder, nunca la decisión completa ni la procedencia:

| Campo | Tipo |
|-------|------|
| `idSolicitud` | texto |
| `estado` | `"preaprobada"` |
| `repetida` | `boolean` |

## Señal de escalamiento nueva

| Campo | Valor |
|-------|-------|
| `motivo` | `preaprobacion_fuera_de_politica` |
| `regla` | `REGLA_2` |
| `herramienta` | `preaprobar_credito` |
| `codigo` | el código de la `DecisionRegla2` que bloqueó |
| `ORDEN_REGLA` | 2 (la última del orden 4 → 5 → 1 → 3 → 2) |

## Errores del core

| Situación | `categoria` | `reintentable` | `codigo` | `campo` |
|-----------|-------------|----------------|----------|---------|
| Identidad no verificada, o de otro solicitante | negocio | no | `identidad_no_verificada` | — |
| No hay solicitud registrada en la conversación | negocio | no | `solicitud_no_registrada` | — |
| La Regla 2 no se cumple | negocio | no | el código de la `DecisionRegla2` | — |
| Entrada con campos | validacion | no | `formato_invalido` | el campo |
| Falla transitoria simulada | transitorio | sí | `core_no_disponible` | — |

Un rechazo nunca deja una preaprobación guardada, ni parcial.

## Auditoría

`auditoria_preaprobacion`, solo en el servidor:

| Campo | Valor |
|-------|-------|
| `resultado` | `preaprobada` o `bloqueada` |
| `regla` | `Regla 2 · preaprobación dentro de la política` |
| `codigo` | solo en `bloqueada` |
| `idSolicitud`, `idSolicitante` | si existen |
| `monto`, `plazoMeses`, `cuotaMensual`, `ingresoVerificado` | enteros, o `null` |
| `versionPolitica` | `VERSION_POLITICA` |

Nunca fragmentos, nombres de documentos ni contenido.
