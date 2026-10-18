# Contrato: herramienta `calcular_capacidad_pago` del core

**Feature**: [../spec.md](../spec.md) · **Research**: R3, R4, R5, R6 · **Zona**: [`src/mcp/`](../../../src/mcp/) (regla [servidor-mcp.md](../../../.claude/rules/servidor-mcp.md))

Una herramienta de solo lectura en el servidor `crediagil-core`, con el mismo contrato de respuesta que las demás (`{ ok, datos } | { ok: false, error }`).

## Anuncio

- **Nombre**: `calcular_capacidad_pago`.
- **Título**: «Calcular capacidad de pago».
- **Anotación**: `readOnlyHint: true`.
- **Descripción**: `DESCRIPCION_CAPACIDAD_PAGO` de [src/compartido/capacidad-pago.ts](../../../src/compartido/capacidad-pago.ts), la misma que usa el adaptador (R5).
- **Esquema anunciado**: `z.looseObject` con los cuatro campos como opcionales, para que su falta llegue a `validarEntrada` y devuelva el contrato `validacion` con su campo, no el error genérico del SDK.

### Texto de la descripción (FR-007)

Debe contener, en este orden y con estas ideas (la prueba fija las frases clave):

1. «Solo simula»: calcula la cuota mensual y qué proporción del ingreso representa.
2. «No registra, no reserva ni compromete nada» y «puede usarse sin identidad verificada».
3. «No reemplaza a `preaprobar_credito`».
4. Cuándo se usa cada una: simular cuando el solicitante explora o pregunta cuánto pagaría; preaprobar solo con una solicitud con identidad e ingreso verificados.
5. «El resultado no es una decisión»: dilo siempre como simulación no vinculante.

No debe contener el 30% ni el tope de monto (R7).

## Entrada

| Campo | Anunciado como | Validación del servidor |
|-------|----------------|-------------------------|
| `monto` | Obligatorio. Monto en pesos colombianos, entero positivo. | entero seguro `> 0` |
| `plazoMeses` | Obligatorio. Plazo en meses, entero positivo. | entero seguro `> 0` |
| `ingresoMensual` | Obligatorio. Ingreso mensual en pesos, entero positivo. | entero seguro `> 0` |
| `correlationId` | Obligatorio. UUID de la conversación, para trazabilidad. | UUID |

`ENTRADAS.calcular_capacidad_pago` es `.strict()`: un campo extra es un error de formato.

## Salida

`SimulacionCapacidadPago` de [data-model.md](../data-model.md#simulacioncapacidadpago), dentro de `datos.simulacion`.

## Errores

| Situación | `categoria` | `reintentable` | `codigo` | `campo` |
|-----------|-------------|----------------|----------|---------|
| `monto` ausente, no entero o `≤ 0` | validacion | no | `monto_invalido` | `monto` |
| `plazoMeses` ausente, no entero o `≤ 0` | validacion | no | `plazo_invalido` | `plazoMeses` |
| `ingresoMensual` ausente, no entero o `≤ 0` | validacion | no | `ingreso_invalido` | `ingresoMensual` |
| Cuota fuera del rango seguro | validacion | no | `monto_invalido` | `monto` |
| `correlationId` ausente o no UUID | validacion | no | `formato_invalido` | `correlationId` |
| Campo extra | validacion | no | `formato_invalido` | el campo extra |
| Falla transitoria simulada del core | transitorio | sí | `core_no_disponible` | — |

- Se informa el primer campo inválido, en el orden `monto`, `plazoMeses`, `ingresoMensual`, `correlationId`.
- Un error no incluye cuota ni dato parcial (FR-010).
- Los mensajes dicen el motivo: «El monto debe ser un entero de pesos mayor que 0.», etc.

## Comportamiento del core

`Core.calcularCapacidadPago(entrada: unknown)` en [core-simulado.ts](../../../src/mcp/core-simulado.ts):

1. Si la falla simulada está activa, devuelve el error transitorio (como las demás).
2. Valida con `esquemaEntradaCapacidadPago.safeParse`; un fallo es el error de la tabla.
3. Calcula con `calcularCuota` y `calcularRelacionCuotaIngreso`. Un `ErrorCuota` es `monto_invalido`.
4. Decide `fuenteIngreso` (R3): lee la verificación guardada de la conversación; es `verificado` solo si su `estado` es `verificado` y su `ingreso.monto` es igual a `ingresoMensual`; en cualquier otro caso, `declarado`.
5. Devuelve la simulación. **No escribe en ningún mapa del core** (`identidades`, `extracciones`, `declarados`, `verificaciones`) ni emite auditoría de decisión.

### Garantías

- **Sin identidad**: no consulta `identidades`; funciona con una conversación nueva (FR-006).
- **Sin efectos**: llamarla n veces deja el core igual que antes (FR-005, SC-003).
- **Determinista**: mismas entradas y misma verificación guardada dan el mismo resultado (FR-003).

## Log

Una línea `herramienta` con `herramienta`, `correlationId` y `resultado`, más `fuenteIngreso` si la respuesta fue correcta. No lleva el monto ni el ingreso: son datos del solicitante, aunque ficticios (FR-015, Principio VI).

## Cliente (`ClienteCore`)

```ts
calcularCapacidadPago(
  entrada: { monto: number; plazoMeses: number; ingresoMensual?: number },
  correlationId: string,
): Promise<Respuesta<{ simulacion: SimulacionCapacidadPago }>>;
```

La respuesta se valida con `esquemaSimulacionCapacidadPago`; una respuesta fuera de contrato es `respuesta_fuera_de_contrato`, no se adivina. `ingresoMensual` es opcional en el tipo para que el adaptador pueda reenviar su falta y que el core la rechace con el error de validación.
