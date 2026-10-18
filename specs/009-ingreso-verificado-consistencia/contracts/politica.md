# Contrato: módulo de política de ingreso y consistencia

**Feature**: [../spec.md](../spec.md) · **Modelo**: [../data-model.md](../data-model.md) · **Decisiones**: R1 a R5 de [../research.md](../research.md)

Funciones puras en `src/politica/`. Sin reloj, sin red, sin modelo. Las usan el core (para decidir y guardar) y el adaptador del agente (para las pruebas y las decisiones de efectos). Todo monto es un entero de pesos.

## `src/politica/politica.ts` (se modifica)

Agrega las constantes de [data-model.md](../data-model.md#parámetros-de-política-nuevos-srcpoliticapoliticats) y sube `VERSION_POLITICA` a `2026-10-18.1`. Ninguna constante se repite como literal en otro archivo; las pruebas lo comprueban buscando el `10` del umbral y las palabras de nómina fuera de este módulo.

## `src/politica/ingreso.ts` (nuevo)

```ts
export const REGLA_3 = "Regla 3 · ingreso verificado desde los documentos";

/** Abono de nómina: sentido abono y alguna palabra de PALABRAS_NOMINA en la descripción (R3). */
export function esAbonoDeNomina(movimiento: Movimiento): boolean;

/** El pagador de un abono de nómina: su descripción sin la palabra de nómina ni palabras vacías. */
export function pagadorDe(movimiento: Movimiento): string;

/** Promedio entero hacia abajo (R3). Lanza si `cantidad` no es un entero positivo. */
export function promediarHaciaAbajo(suma: number, cantidad: number): number;

/**
 * El ingreso verificado a partir de los registros extraídos (FR-001, FR-002). `null` si no hay
 * un origen o si el menor es 0. No recibe el ingreso declarado.
 */
export function calcularIngresoVerificado(
  registros: readonly RegistroExtraido[],
): IngresoVerificado | null;

/** La discrepancia con lo declarado, con aritmética entera (R2). `verificado` debe ser > 0. */
export function evaluarDiscrepancia(declarado: number, verificado: number): Discrepancia;

/** La decisión completa de la Regla 3 sobre la conversación (R5). */
export function decidirIngreso(entrada: {
  registros: readonly RegistroExtraccion[];
  nombreSolicitante: string;
  idSolicitante: string;
  ingresoDeclarado: number | null;
}): Omit<VerificacionIngreso, "correlationId" | "calculadaEn">;
```

**Comportamiento**:

| Entrada | Resultado |
|---------|-----------|
| algún registro `no_cubierto` | `estado: no_cubierto`, regla de la Regla 5; no se calcula nada |
| inconsistencia con `detiene: true` | `estado: inconsistencia`, sin `ingreso` |
| sin origen, o menor igual a 0 | `estado: sin_ingreso` |
| ingreso y `ingresoDeclarado: null` | `estado: falta_declarado`, con `ingreso` |
| ingreso, declarado y `supera: true` | `estado: discrepancia` |
| ingreso, declarado y `supera: false` | `estado: verificado` |
| registros `no_extraible` | se ignoran: el caso ya escaló en el #10 |
| el mismo contenido registrado dos veces | cuenta una vez; el core ya lo une por huella |

**Fronteras que cubre `ingreso.test.ts`** (FR-018): con verificado 3.800.000, declarado 4.180.000 y 3.420.000 (exactamente el 10%) → `supera: false`; 4.180.001 y 3.419.999 → `supera: true`; declarado 0; verificado 1 (no desborda). `promediarHaciaAbajo(11, 3)` → 3 y `(12, 3)` → 4. Un extracto sin nómina cuenta en el divisor. Variar solo `ingresoDeclarado` no cambia `ingreso`.

## `src/politica/consistencia.ts` (nuevo)

```ts
/** Las inconsistencias entre los documentos y con el solicitante verificado (FR-008, R4). */
export function validarConsistencia(entrada: {
  nombreSolicitante: string;
  registros: readonly RegistroExtraccion[];
}): { inconsistencias: Inconsistencia[]; sinContrastar: string[] };

/** Igualdad de nombres como conjuntos de palabras, sin tildes, mayúsculas ni puntuación (R4). */
export function mismoNombre(a: string, b: string): boolean;

/** Empleador y pagador coinciden: iguales o el pagador es prefijo de al menos dos palabras (R4). */
export function mismoEmpleador(empleador: string, pagador: string): boolean;
```

**Comportamiento**:

- Solo mira registros `extraido`. Un campo nulo (por ejemplo, un titular que el documento no trae) no es una inconsistencia: queda en `sinContrastar`.
- `titular_vs_solicitante`: una inconsistencia por extracto cuyo titular no sea `mismoNombre` del solicitante. `valores` lleva el titular del extracto (con su procedencia) y el nombre del solicitante **sin procedencia de documento**, marcado como `identidad verificada` en el `nombre` del uso (no es un documento).
- `empleador_vs_pagador`: una por cada pagador distinto que no sea `mismoEmpleador` del empleador del certificado. `valores`: el empleador y el abono de nómina, cada uno con su procedencia.
- `periodos_superpuestos`: para cada par de extractos distintos cuyos periodos comparten al menos un día.
- `periodo_no_mensual`: un extracto cuyo periodo dura más de `MAX_DIAS_PERIODO_EXTRACTO` días, contando los dos extremos.
- `huecos_entre_periodos`: un mes calendario sin cobertura entre dos extractos ordenados por fecha. `detiene: false`.
- El orden de la lista es estable: por regla y luego por adjunto, para que dos corridas den el mismo resultado.

**Fronteras que cubre `consistencia.test.ts`**: nombres con otro orden y con tildes (iguales); un apellido de menos (distinto); «Industrias Imaginarias» frente a «Industrias Imaginarias del Valle S.A.S.» (coinciden); «Industrias» frente al mismo (no coincide con un pagador de una palabra si el empleador tiene más); periodos de 31 y de 32 días; dos extractos que se tocan en un día; extractos de meses no consecutivos; un registro con titular nulo.

## Lo que la política no hace

- No lee el ingreso declarado para calcular el ingreso verificado.
- No convierte monedas: un registro `no_cubierto` corta antes de calcular.
- No decide sobre el monto, la cuota ni el 30%: es de las reglas del #12 y el #14.
