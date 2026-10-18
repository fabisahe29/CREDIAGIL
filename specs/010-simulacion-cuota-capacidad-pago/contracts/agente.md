# Contrato: herramienta del agente, control de identidad y prompt

**Feature**: [../spec.md](../spec.md) · **Research**: R4, R6, R8 · **Zona**: [`src/agente/`](../../../src/agente/)

## Herramienta del adaptador

En [adaptador.ts](../../../src/agente/adaptador.ts), servidor SDK `originacion`. Su clave completa para el modelo es `mcp__originacion__calcular_capacidad_pago`.

- **Descripción**: `DESCRIPCION_CAPACIDAD_PAGO`, la misma del core (R5).
- **Anotación**: `readOnlyHint: true`.
- **Esquema de entrada**:

| Campo | Esquema | Descripción para el modelo |
|-------|---------|----------------------------|
| `monto` | `z.number()` | Monto que el solicitante quiere, en pesos colombianos. Solo lo que dijo; no lo inventes. |
| `plazoMeses` | `z.number()` | Plazo en meses que dijo el solicitante. |
| `ingresoMensual` | `z.number().optional()` | Ingreso mensual en pesos que dijo el solicitante o que devolvió `verificar_ingreso`. Omítelo si no lo dijo: no lo inventes. |

El esquema del adaptador **no** exige enteros ni positivos y deja `ingresoMensual` opcional: así un valor inválido o ausente llega al core y vuelve con el error de validación tipado, con su motivo (FR-010). Una cadena en lugar de un número la rechaza el SDK antes del manejador; el modelo ve el error y la corrige.

### Manejador

```text
calcularCapacidadPago({ monto, plazoMeses, ingresoMensual })
  → llamarConReintentos("calcular_capacidad_pago", core.calcularCapacidadPago(...))
  → aResultadoMcp(respuesta)
```

- Usa los mismos reintentos acotados y el tiempo límite de las demás herramientas. Si se agotan, deja la señal `falla_transitoria_persistente` (Principio VI).
- **No** deja señal de escalamiento por su cuenta, no emite eventos de negocio y no llama a ninguna otra herramienta. Un error de validación se devuelve tal cual al modelo.
- El modo de demostración del chat la muestra con `alUsarHerramienta`, como las demás.

## Control de identidad

[control-identidad.ts](../../../src/agente/control-identidad.ts) **no cambia**. `calcular_capacidad_pago` no está en `HERRAMIENTAS_CON_IDENTIDAD`, así que el hook la deja pasar sin consultar la identidad (R6).

La única restricción que le aplica es la ya existente: una conversación escalada deniega todas las herramientas.

`control-identidad.test.ts` gana una prueba: con la identidad sin verificar, el hook devuelve `{}` para `mcp__originacion__calcular_capacidad_pago` y no emite `bloqueo_por_regla`.

## Prompt (`agente.ts`)

Cambia la frase de la línea 46 y se agregan dos instrucciones junto a las de `verificar_ingreso`.

| Antes | Después |
|-------|---------|
| «No tomas decisiones de crédito: no apruebas, no rechazas ni estimas cuotas.» | «No tomas decisiones de crédito: no apruebas ni rechazas. Tampoco calculas cuotas por tu cuenta: si preguntan cuánto pagarían al mes, usa calcular_capacidad_pago.» |

Instrucciones nuevas:

- «Llama a calcular_capacidad_pago solo con el monto, el plazo y el ingreso que dio el solicitante; si falta alguno, pídelo. Preséntala siempre como una simulación no vinculante y repite el aviso que devuelve.»
- «Una simulación no es una preaprobación: no digas que el solicitante califica o que el crédito está aprobado a partir de ella.»

`agente.test.ts` verifica que el prompt ya no contiene «estimas cuotas» y que nombra `calcular_capacidad_pago`.

## Lo que no cambia

- Los eventos de negocio y su catálogo.
- El orden de prevalencia de reglas y los motivos de escalamiento.
- Las herramientas del #7 al #11.
