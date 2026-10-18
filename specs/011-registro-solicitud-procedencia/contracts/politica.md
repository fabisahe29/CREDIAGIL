# Contrato: política, `calcularDiferenciaPorcentaje`

**Feature**: [../spec.md](../spec.md) · **Research**: R9 · **Zona**: [`src/politica/`](../../../src/politica/) (regla [politica.md](../../../.claude/rules/politica.md))

Una función pura más en [ingreso.ts](../../../src/politica/ingreso.ts), junto a `evaluarDiscrepancia`. No agrega constantes, no cambia el umbral del 10% y no cambia `VERSION_POLITICA`.

## Función

```ts
export function calcularDiferenciaPorcentaje(declarado: number, verificado: number): number;
```

- **Entrada**: `declarado` entero seguro `≥ 0` y `verificado` entero seguro `> 0`, en pesos. Cualquier otra cosa lanza `RangeError`: el core solo la llama con una discrepancia ya validada, pero la función no adivina.
- **Salida**: `|declarado − verificado| / verificado · 100`, con dos decimales, y la mitad hacia arriba.
- **Aritmética**: con `BigInt`, como `calcularRelacionCuotaIngreso` del #12: `round(|d − v| · 10.000 / v) / 100`. Nada con flotantes decide un valor.

## Relación con la discrepancia

`evaluarDiscrepancia` sigue decidiendo `supera` con la comparación exacta `diferencia · 100 > 10 · verificado`. El porcentaje de esta función es **informativo**: se guarda con la solicitud para que el analista lo vea. No se usa para decidir; por eso el redondeo a dos decimales no puede mover el borde del 10%.

## Casos de la prueba

Cada fila es un caso de [ingreso.test.ts](../../../src/politica/ingreso.test.ts):

| `declarado` | `verificado` | Resultado | Qué fija |
|-------------|--------------|-----------|----------|
| 3.800.000 | 3.800.000 | `0` | Sin diferencia |
| 4.180.000 | 3.800.000 | `10` | Borde exacto: la misma diferencia que no supera el umbral |
| 4.180.001 | 3.800.000 | `10` | Un peso encima del borde: `10,00` por redondeo; el `supera` lo decide la otra función |
| 4.300.000 | 3.800.000 | `13,16` | Caso de la demo (discrepancia) |
| 3.420.000 | 3.800.000 | `10` | Por debajo: la diferencia es absoluta |
| 3.419.999 | 3.800.000 | `10` | Un peso por debajo del borde |
| 1 | 3 | `66,67` | Mitad hacia arriba y dos decimales |
| 0 | 3.800.000 | `100` | Declarado cero |
| `-1`, `1,5`, `NaN` | 3.800.000 | `RangeError` | Entrada inválida |
| 4.000.000 | `0` | `RangeError` | No se divide por cero |

Una prueba adicional comprueba, con los mismos valores, que `evaluarDiscrepancia` da `supera: false` para 4.180.000 y `supera: true` para 4.180.001, y que el porcentaje de ambos es `10`: el informativo y el decisorio no se confunden.
