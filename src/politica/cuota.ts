// Cuota de un crédito de cuota fija (constitución, Principio III; specs/010-simulacion-cuota-
// capacidad-pago, research.md, R2). Funciones puras: las llama el core, nunca el modelo. No evalúa la
// Regla 2: informa la cuota y su proporción del ingreso, y la decisión es de la política del #14.

import { TASA_MENSUAL } from "./politica.ts";

/** Una entrada que no permite calcular la cuota; su mensaje dice el motivo y lo lee el agente. */
export class ErrorCuota extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorCuota";
  }
}

const esEnteroPositivo = (valor: number) => Number.isSafeInteger(valor) && valor > 0;

/**
 * Redondea al peso entero más cercano; la mitad exacta va hacia arriba (aclaración Q1 del #12:
 * 206.723,34 → 206.723). No suma 0,5 para no perder precisión con valores grandes.
 */
export function redondearAlPesoMasCercano(valor: number): number {
  const piso = Math.floor(valor);
  return valor - piso >= 0.5 ? piso + 1 : piso;
}

/**
 * Cuota mensual fija en pesos enteros, con amortización francesa: `P · i / (1 − (1 + i)^−n)` y
 * `i = TASA_MENSUAL`. La potencia usa flotantes; su resultado pasa por un único redondeo definido.
 * Lanza `ErrorCuota` si el monto o el plazo no son enteros positivos, o si la cuota no queda como un
 * entero seguro mayor que cero (un monto diminuto para un plazo largo se redondea a cero pesos).
 */
export function calcularCuota(monto: number, plazoMeses: number): number {
  if (!esEnteroPositivo(monto))
    throw new ErrorCuota("El monto debe ser un entero de pesos mayor que 0.");
  if (!esEnteroPositivo(plazoMeses)) {
    throw new ErrorCuota("El plazo debe ser un entero de meses mayor que 0.");
  }
  const exacta = (monto * TASA_MENSUAL) / (1 - Math.pow(1 + TASA_MENSUAL, -plazoMeses));
  const cuota = redondearAlPesoMasCercano(exacta);
  if (!Number.isFinite(exacta) || !Number.isSafeInteger(cuota)) {
    throw new ErrorCuota("El monto es demasiado grande para calcular la cuota.");
  }
  if (cuota < 1) {
    throw new ErrorCuota("El monto es demasiado pequeño para el plazo: la cuota sería de 0 pesos.");
  }
  return cuota;
}

/**
 * Qué porcentaje del ingreso es la cuota, con dos decimales y aritmética entera: la mitad exacta de
 * la centésima va hacia arriba. Sin recortar: una cuota mayor que el ingreso pasa del 100%.
 */
export function calcularRelacionCuotaIngreso(cuota: number, ingreso: number): number {
  if (!esEnteroPositivo(cuota))
    throw new ErrorCuota("La cuota debe ser un entero de pesos mayor que 0.");
  if (!esEnteroPositivo(ingreso)) {
    throw new ErrorCuota("El ingreso debe ser un entero de pesos mayor que 0.");
  }
  const denominador = BigInt(ingreso);
  // round_half_up(cuota · 10.000 / ingreso) = floor((cuota · 20.000 + ingreso) / (2 · ingreso))
  const centesimas = (BigInt(cuota) * 20_000n + denominador) / (2n * denominador);
  return Number(centesimas) / 100;
}
