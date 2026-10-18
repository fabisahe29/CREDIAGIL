# Data Model: Simulación de cuota y capacidad de pago

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

Esta feature no guarda nada. Define parámetros de política, una entrada y un resultado que viajan por la herramienta y no persisten.

## Parámetros de política

En [src/politica/politica.ts](../../src/politica/politica.ts), única fuente (R1).

| Constante | Valor | Uso |
|-----------|-------|-----|
| `TASA_MENSUAL_PUNTOS_BASE` | `180` | Tasa fija ficticia del 1,8% mensual, en puntos base. |
| `TASA_MENSUAL` | `TASA_MENSUAL_PUNTOS_BASE / 10_000` (= `0.018`) | La `i` de la fórmula de la cuota. |
| `VERSION_POLITICA` | sube de `2026-10-18.1` a `2026-10-18.2` | Acompaña cada decisión de la política. |

Los umbrales del 30% y de $5.000.000 **no** se agregan aquí: son del #14.

## EntradaSimulacion

Lo que recibe `calcular_capacidad_pago`. Todos los campos son obligatorios; el servidor los recibe como `unknown` y los valida (R5).

| Campo | Tipo | Regla de validación | Código de error |
|-------|------|---------------------|-----------------|
| `monto` | entero de pesos | entero seguro, `> 0` | `monto_invalido` |
| `plazoMeses` | entero | entero seguro, `> 0` | `plazo_invalido` |
| `ingresoMensual` | entero de pesos | entero seguro, `> 0`; ausente es inválido | `ingreso_invalido` |
| `correlationId` | UUID | formato UUID | `formato_invalido` |

- No hay mínimos ni máximos adicionales (aclaración Q2).
- Un decimal, una cadena o un valor no numérico en `monto`, `plazoMeses` o `ingresoMensual` no pasa el esquema.
- Un ingreso `0` o negativo es inválido: no se divide por cero ni se informa una proporción absurda.
- Una entrada con campos de más se rechaza (`.strict()`), como el resto de herramientas.

## SimulacionCapacidadPago

Lo que devuelve la herramienta cuando la entrada es válida. No se persiste ni se asocia a una solicitud.

| Campo | Tipo | Significado |
|-------|------|-------------|
| `tipo` | `"simulacion"` | Constante: marca que no es una decisión. |
| `vinculante` | `false` | Constante: FR-008. |
| `monto` | entero | El monto simulado, tal cual llegó. |
| `plazoMeses` | entero | El plazo simulado. |
| `ingresoMensual` | entero | El ingreso usado, tal cual llegó. |
| `fuenteIngreso` | `"declarado"` \| `"verificado"` | Quién respalda ese ingreso (R3). No confundir con `origen` del ingreso verificado del #11, que dice de qué documento salió. |
| `tasaMensualPuntosBase` | `180` | La tasa aplicada, tomada de la política. |
| `cuotaMensual` | entero de pesos | Cuota fija, redondeada al peso más cercano (R2). |
| `relacionCuotaIngresoPorcentaje` | número con dos decimales | `cuotaMensual / ingresoMensual · 100`, calculado con enteros (R2). |
| `aviso` | texto | Aviso por código según `fuenteIngreso`; es lo que el agente debe transmitir. |
| `versionPolitica` | texto | `VERSION_POLITICA`. |

Lo que el resultado **no** contiene, por FR-009: si la proporción cumple el 30%, si el monto cumple el tope, ni una frase de aprobación.

### Avisos

Los define `src/compartido/capacidad-pago.ts`; el modelo no los redacta.

| `fuenteIngreso` | Aviso |
|-----------------|-------|
| `declarado` | «Simulación no vinculante con el ingreso que declaraste, que no está verificado. No reemplaza la verificación de tu ingreso con documentos ni una preaprobación.» |
| `verificado` | «Simulación no vinculante con tu ingreso verificado. No es una preaprobación: la decisión la toma la política de crédito con tu solicitud.» |

## Relaciones y estados

- No hay estados ni transiciones: cada llamada es independiente y con las mismas entradas devuelve el mismo resultado (FR-003).
- La única lectura de estado del core es la verificación de ingreso de la conversación, para decidir `fuenteIngreso`. No la modifica.

## Error de validación

Es el `ErrorCore` del contrato común ([src/compartido/errores.ts](../../src/compartido/errores.ts)): `categoria: "validacion"`, `reintentable: false`, `codigo` de la tabla de arriba, `mensaje` con el motivo legible y `campo`. No lleva cuota ni datos parciales (FR-010).

Un monto cuya cuota no sea un entero seguro devuelve `monto_invalido` con un mensaje que lo explica (R2).

## Fórmulas

- Cuota: `P · i / (1 − (1 + i)^−n)` con `i = TASA_MENSUAL`, `P = monto`, `n = plazoMeses`; luego `redondearAlPesoMasCercano`.
- Proporción: `round_half_up(cuota · 10.000 / ingreso) / 100`, con `BigInt`.

## Datos de prueba

Todo ficticio (Principio II). Valores de referencia que las pruebas fijan:

| Monto | Plazo | Cuota |
|-------|-------|-------|
| 4.000.000 | 24 | 206.723 |
| 1.000.000 | 1 | 1.018.000 |
| 5.000.000 | 12 | calculada con la fórmula en la prueba, no copiada de la implementación |
