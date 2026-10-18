// Regla 2: una solicitud se preaprueba de forma automática solo si su monto es de hasta el tope y su
// cuota no supera el porcentaje máximo del ingreso mensual verificado; cualquier otro caso va a un
// analista (constitución, Principio I; specs/012-preaprobacion-automatica-politica: research.md, R1 y
// R2; contracts/politica.md). Función pura: la llaman el hook, el core y las pruebas, y nunca el modelo.
// Decide con lo que guarda la solicitud registrada del #13, nunca con datos que envíe el modelo.

import type { VerificacionRegistrada } from "../compartido/solicitud.ts";
import { ErrorCuota, calcularCuota } from "./cuota.ts";
import {
  PORCENTAJE_MAXIMO_CUOTA_INGRESO,
  TOPE_MONTO_PREAPROBACION,
  VERSION_POLITICA,
} from "./politica.ts";

export const REGLA_2 = "Regla 2 · preaprobación dentro de la política";

/** Por qué se bloquea una preaprobación; el primer criterio que falla decide. */
export type CodigoBloqueo =
  | "ingreso_no_verificado"
  | "discrepancia_registrada"
  | "monto_sobre_tope"
  | "cuota_no_calculable"
  | "cuota_sobre_porcentaje";

/** Decisión explicable de la Regla 2 (Principio III): regla, valores usados y motivo. */
export interface DecisionRegla2 {
  regla: string;
  permitido: boolean;
  /** Solo en un bloqueo. */
  codigo?: CodigoBloqueo;
  motivo: string;
  valores: Record<string, string | number>;
  versionPolitica: string;
}

export interface EntradaRegla2 {
  monto: number;
  plazoMeses: number;
  /** La verificación de ingreso de la solicitud registrada, o `null` si no hay. */
  verificacion: VerificacionRegistrada | null;
}

const MOTIVOS: Readonly<Record<CodigoBloqueo, string>> = {
  ingreso_no_verificado: "No hay un ingreso verificado con los documentos sobre el cual decidir.",
  discrepancia_registrada:
    "El ingreso declarado no coincide con el verificado: hay una discrepancia registrada.",
  monto_sobre_tope: "El monto supera el máximo que se preaprueba de forma automática.",
  cuota_no_calculable: "No se pudo calcular la cuota con el monto y el plazo de la solicitud.",
  cuota_sobre_porcentaje:
    "La cuota supera la proporción máxima del ingreso verificado que se preaprueba de forma automática.",
};

/**
 * Evalúa la Regla 2 con aritmética entera exacta. El orden respeta el de la constitución: primero la
 * verificación de ingreso (Regla 3), después el monto y la cuota. Con exactamente el tope o el
 * porcentaje se permite. La relación se compara como `cuota · 100 ≤ porcentaje · ingreso`, no con el
 * porcentaje redondeado a dos decimales del #12: 30,004% daría 30,00% y se preaprobaría fuera de
 * política. La cuota es la del #12, redondeada al peso. Nunca lanza.
 */
export function evaluarRegla2({ monto, plazoMeses, verificacion }: EntradaRegla2): DecisionRegla2 {
  const base: Record<string, string | number> = {
    monto,
    plazoMeses,
    topeMonto: TOPE_MONTO_PREAPROBACION,
    porcentajeMaximo: PORCENTAJE_MAXIMO_CUOTA_INGRESO,
  };
  const ingreso = verificacion?.ingresoVerificado?.monto ?? null;
  const conIngreso = ingreso === null ? base : { ...base, ingresoVerificado: ingreso };

  const bloqueo = (
    codigo: CodigoBloqueo,
    valores: Record<string, string | number>,
  ): DecisionRegla2 => ({
    regla: REGLA_2,
    permitido: false,
    codigo,
    motivo: MOTIVOS[codigo],
    valores,
    versionPolitica: VERSION_POLITICA,
  });

  // Regla 3 antes que la 2: sin ingreso verificado, o con una discrepancia, no hay base para decidir.
  if (
    verificacion === null ||
    (verificacion.estado !== "verificado" && verificacion.estado !== "discrepancia")
  ) {
    return bloqueo("ingreso_no_verificado", conIngreso);
  }
  if (verificacion.estado === "discrepancia") return bloqueo("discrepancia_registrada", conIngreso);
  if (ingreso === null) return bloqueo("ingreso_no_verificado", conIngreso);

  if (monto > TOPE_MONTO_PREAPROBACION) return bloqueo("monto_sobre_tope", conIngreso);

  let cuota: number;
  try {
    cuota = calcularCuota(monto, plazoMeses);
  } catch (error) {
    if (error instanceof ErrorCuota) return bloqueo("cuota_no_calculable", conIngreso);
    throw error;
  }
  const conCuota = { ...conIngreso, cuotaMensual: cuota };
  if (BigInt(cuota) * 100n > BigInt(PORCENTAJE_MAXIMO_CUOTA_INGRESO) * BigInt(ingreso)) {
    return bloqueo("cuota_sobre_porcentaje", conCuota);
  }
  return {
    regla: REGLA_2,
    permitido: true,
    motivo:
      "La solicitud cumple la política: el monto está dentro del máximo y la cuota dentro de la proporción máxima del ingreso verificado, sin discrepancia.",
    valores: conCuota,
    versionPolitica: VERSION_POLITICA,
  };
}
