# Contrato: módulo de política de la cuota

**Feature**: [../spec.md](../spec.md) · **Research**: R1, R2 · **Zona**: [`src/politica/`](../../../src/politica/) (regla [politica.md](../../../.claude/rules/politica.md))

Funciones puras, sin red, sin reloj y sin estado. Las llama el core; el modelo nunca las ejecuta.

## `politica.ts` (modificado)

```ts
export const TASA_MENSUAL_PUNTOS_BASE = 180;
export const TASA_MENSUAL = TASA_MENSUAL_PUNTOS_BASE / 10_000; // 0.018
export const VERSION_POLITICA = "2026-10-18.2";
```

Ningún otro archivo escribe `0.018`, `1.8` ni `180` como la tasa.

## `cuota.ts` (nuevo)

```ts
/** Redondea al peso entero más cercano; la mitad va hacia arriba (aclaración Q1). */
export function redondearAlPesoMasCercano(valor: number): number;

/** Cuota fija (amortización francesa), en pesos enteros. Lanza ErrorCuota si no es un entero seguro. */
export function calcularCuota(monto: number, plazoMeses: number): number;

/** Porcentaje cuota/ingreso con dos decimales, con aritmética entera. */
export function calcularRelacionCuotaIngreso(cuota: number, ingreso: number): number;

export class ErrorCuota extends Error {}
```

### Precondiciones

- `monto`, `plazoMeses` e `ingreso` son enteros seguros mayores que cero. La función **no** valida el esquema: eso lo hace el contrato compartido antes de llamarla. Si una precondición no se cumple, lanza `ErrorCuota` en lugar de devolver un número.

### Comportamiento

| Función | Entrada | Resultado |
|---------|---------|-----------|
| `redondearAlPesoMasCercano` | `206723.34` | `206723` |
| | `206723.5` | `206724` |
| | `206723.49999` | `206723` |
| `calcularCuota` | `4_000_000`, `24` | `206723` |
| | `1_000_000`, `1` | `1_018_000` |
| | monto cuya cuota excede el entero seguro | lanza `ErrorCuota` |
| | `1`, `24` (la cuota se redondea a 0 pesos) | lanza `ErrorCuota` |
| `calcularRelacionCuotaIngreso` | `206723`, `1_000_000` | `20.67` |
| | cuota mayor que el ingreso | un valor mayor que `100`, sin recortar |
| | bordes de .5 en el tercer decimal | la mitad hacia arriba |

## Fronteras

- **No evalúa la Regla 2**: no devuelve «dentro de política», no compara con el 30% y no conoce el tope de $5.000.000. Eso es del #14.
- **No usa flotantes para la proporción**: solo `BigInt`.
- **No se parametriza**: la tasa no es un argumento; viene de `politica.ts`.

## Pruebas (`cuota.test.ts`)

- Valor de referencia del issue y de la tabla de arriba.
- Bordes de .5 del redondeo, cada lado.
- Plazo 1 y plazo muy largo (la cuota tiende a `monto · i`).
- Monto 1, que da una cuota válida.
- `ErrorCuota` ante un resultado no seguro y ante precondiciones rotas.
- Proporción: 0,00 a 100 y por encima del 100%, y los bordes de .5.
- `TASA_MENSUAL === 0.018` exactamente.
- Una prueba de convención: ningún archivo de `src/` fuera de `politica.ts` y de sus pruebas contiene la tasa como literal.
