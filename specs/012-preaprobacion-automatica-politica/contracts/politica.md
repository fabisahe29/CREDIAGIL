# Contrato: política, `evaluarRegla2`

**Feature**: [../spec.md](../spec.md) · **Research**: R1, R2, R11 · **Zona**: [`src/politica/`](../../../src/politica/) (regla [politica.md](../../../.claude/rules/politica.md))

Un módulo nuevo, [preaprobacion.ts](../../../src/politica/preaprobacion.ts), con una función pura. Las constantes entran en [politica.ts](../../../src/politica/politica.ts).

## Constantes (única fuente)

```ts
export const TOPE_MONTO_PREAPROBACION = 5_000_000;
export const PORCENTAJE_MAXIMO_CUOTA_INGRESO = 30;
export const VERSION_POLITICA = "2026-10-18.3";
```

Ningún otro archivo repite `5_000_000`, `5.000.000`, `30` como porcentaje, ni lo da en una descripción para el modelo.

## Función

```ts
export const REGLA_2 = "Regla 2 · preaprobación dentro de la política";

export function evaluarRegla2(entrada: {
  monto: number;
  plazoMeses: number;
  verificacion: VerificacionRegistrada | null;
}): DecisionRegla2;
```

- **Entrada**: lo que guarda la solicitud registrada. La función no valida la identidad: la Regla 1 va antes, en el hook de identidad y en el core.
- **Salida**: `DecisionRegla2` de [data-model.md](../data-model.md#decisionregla2): `regla`, `permitido`, `codigo` (solo en un bloqueo), `motivo`, `valores` y `versionPolitica`. Nunca lanza: una cuota no calculable es un bloqueo con `cuota_no_calculable`.
- **Pura y determinista**: mismas entradas, misma decisión.

## Orden y reglas

1. **Verificación de ingreso (Regla 3 primero)**:
   - `verificacion === null`, o su `estado` no es `verificado` ni `discrepancia` → `ingreso_no_verificado`.
   - `estado === "discrepancia"` → `discrepancia_registrada`.
2. **Monto**: `monto > TOPE_MONTO_PREAPROBACION` → `monto_sobre_tope`. Con exactamente el tope se permite.
3. **Cuota**: `cuota = calcularCuota(monto, plazoMeses)` del #12. Si lanza `ErrorCuota` → `cuota_no_calculable`.
4. **Relación**: con `BigInt`, `cuota · 100 > PORCENTAJE_MAXIMO_CUOTA_INGRESO · ingreso` → `cuota_sobre_porcentaje`. Con exactamente el porcentaje se permite.
5. Si todo se cumple → `permitido: true`.

El primer criterio que falla decide: la decisión trae un solo código.

### Por qué la comparación es entera

`calcularRelacionCuotaIngreso` del #12 devuelve el porcentaje con dos decimales: una relación de 30,004% da 30,00% y se preaprobaría un caso fuera de política. La comparación `cuota · 100 ≤ 30 · ingreso` es exacta en el borde (R1). El porcentaje redondeado puede acompañar a los `valores` como dato informativo, nunca para decidir.

## Valores de la decisión

`valores` lleva textos o enteros, como los eventos de negocio: `monto`, `plazoMeses`, `cuotaMensual` (si se calculó), `ingresoVerificado` (si hay), `topeMonto` y `porcentajeMaximo`. En un bloqueo, los valores que causaron el bloqueo van siempre.

## Casos de la prueba

Cada fila es un caso de [preaprobacion.test.ts](../../../src/politica/preaprobacion.test.ts), con el ingreso verificado ya dado por una verificación en estado `verificado`:

| Caso | Monto | Cuota / relación | Resultado |
|------|-------|------------------|-----------|
| Caso simple | 4.000.000 a 24 meses, ingreso 3.800.000 | cuota 206.723 | permitido |
| Borde del monto | 5.000.000 | cuota muy por debajo del 30% | permitido |
| Un peso por debajo del tope | 4.999.999 | por debajo | permitido |
| Un peso por encima del tope | 5.000.001 | por debajo | `monto_sobre_tope` |
| Borde de la relación | ≤ 5.000.000 | `cuota · 100 = 30 · ingreso` exacto | permitido |
| Relación un peso de ingreso por debajo | mismo caso con ingreso − 1 | `cuota · 100 > 30 · (ingreso − 1)` | `cuota_sobre_porcentaje` |
| Relación con ingreso un peso por encima | mismo caso con ingreso + 1 | por debajo | permitido |
| Relación apenas por encima, que redondea a 30,00% | caso con 30,004% | 30,00% redondeado | `cuota_sobre_porcentaje` |
| Cuota no calculable | monto o plazo fuera de rango | — | `cuota_no_calculable` |
| Sin verificación | cualquiera | — | `ingreso_no_verificado` |
| Verificación `inconsistencia`, `sin_ingreso`, `falta_declarado` o `no_cubierto` | cualquiera | — | `ingreso_no_verificado` |
| Verificación `discrepancia` | cualquiera | — | `discrepancia_registrada` |
| Orden: discrepancia y monto alto a la vez | 6.000.000 | — | `discrepancia_registrada` (la Regla 3 va antes) |
| Orden: monto alto y cuota alta a la vez | 6.000.000 a 3 meses | — | `monto_sobre_tope` (el monto va antes) |

Para el borde de la relación, la prueba busca un par monto y plazo cuya cuota sea múltiplo de 3 (así `ingreso = cuota · 100 / 30` es un entero) y lo fija como dato de la prueba.

Pruebas adicionales:
- Una prueba que comprueba que `5_000_000` y el porcentaje no aparecen como literal fuera de `politica.ts` en los archivos de producción de esta feature.
- `VERSION_POLITICA` cambia a `2026-10-18.3` y aparece en cada decisión.
