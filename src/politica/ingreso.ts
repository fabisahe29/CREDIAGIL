// Regla 3 de la constitución: el ingreso verificado sale de los documentos y se compara con el
// declarado (specs/009-ingreso-verificado-consistencia: research.md, R1 a R5; contracts/politica.md).
// Funciones puras, sin reloj, red ni modelo: las usan el core, para decidir y guardar, y el agente.

import type { RegistroExtraccion } from "../compartido/extraccion.ts";
import type {
  Discrepancia,
  IngresoVerificado,
  ResultadoIngreso,
  Uso,
} from "../compartido/ingreso.ts";
import { REGLA_5 } from "./documentos.ts";
import { validarConsistencia } from "./consistencia.ts";
import { esAbonoDeNomina, extraidosUnicos, pagadorDe } from "./nomina.ts";
import { UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE, VERSION_POLITICA } from "./politica.ts";

export { esAbonoDeNomina, pagadorDe };

export const REGLA_3 = "Regla 3 · ingreso verificado desde los documentos";

/** Promedio entero hacia abajo (R3): el redondeo nunca infla el ingreso. */
export function promediarHaciaAbajo(suma: number, cantidad: number): number {
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
    throw new RangeError("la cantidad del promedio debe ser un entero positivo");
  }
  if (!Number.isSafeInteger(suma) || suma < 0) {
    throw new RangeError("la suma del promedio debe ser un entero no negativo");
  }
  return Math.floor(suma / cantidad);
}

/**
 * El ingreso mensual verificado a partir de los registros extraídos (FR-001, FR-002): el menor entre
 * el salario del certificado y el promedio mensual de abonos de nómina de los extractos. `null` si no
 * hay un origen o si el menor es 0. No recibe el ingreso declarado.
 */
export function calcularIngresoVerificado(
  registros: readonly RegistroExtraccion[],
): IngresoVerificado | null {
  const usos: Uso[] = [];
  const noUsados: IngresoVerificado["noUsados"] = [];
  const salarios: number[] = [];
  let sumaNomina = 0;
  let extractos = 0;

  for (const registro of extraidosUnicos(registros)) {
    const { documento } = registro;
    if (documento.tipo === "certificado_laboral") {
      if (documento.salario === null) {
        noUsados.push({
          adjunto: registro.adjunto,
          nombre: registro.nombre,
          motivo: "el certificado no trae salario",
        });
        continue;
      }
      salarios.push(documento.salario.valor);
      usos.push({
        adjunto: registro.adjunto,
        nombre: registro.nombre,
        campo: "salario",
        valor: documento.salario.valor,
        fragmento: documento.salario.procedencia.fragmento,
      });
      continue;
    }
    extractos++;
    documento.movimientos.forEach((movimiento, indice) => {
      if (esAbonoDeNomina(movimiento)) {
        sumaNomina += movimiento.valor;
        usos.push({
          adjunto: registro.adjunto,
          nombre: registro.nombre,
          campo: `movimientos[${indice}]`,
          valor: movimiento.valor,
          fragmento: movimiento.procedencia.fragmento,
        });
      } else if (movimiento.sentido === "abono") {
        noUsados.push({
          adjunto: registro.adjunto,
          nombre: registro.nombre,
          motivo: "abono sin palabra de nómina en la descripción",
        });
      }
    });
  }

  const montoCertificado = salarios.length > 0 ? Math.min(...salarios) : null;
  const montoExtractos = extractos > 0 ? promediarHaciaAbajo(sumaNomina, extractos) : null;
  const candidatos = [montoCertificado, montoExtractos].filter((monto) => monto !== null);
  if (candidatos.length === 0) return null;
  const monto = Math.min(...candidatos);
  if (monto <= 0) return null;

  const origen =
    montoCertificado === montoExtractos
      ? "ambos"
      : montoExtractos === null || (montoCertificado !== null && montoCertificado < montoExtractos)
        ? "certificado"
        : "extractos";
  return {
    monto,
    origen,
    montoCertificado,
    montoExtractos,
    extractosContados: extractos,
    usos,
    noUsados,
  };
}

/**
 * La discrepancia con lo declarado (R2), con aritmética entera exacta: hay discrepancia si
 * `|declarado − verificado| × 100 > UMBRAL × verificado`. Con exactamente el umbral no la hay. La base
 * es el ingreso verificado (constitución, Principio I, Regla 3).
 */
export function evaluarDiscrepancia(declarado: number, verificado: number): Discrepancia {
  if (!Number.isSafeInteger(declarado) || declarado < 0) {
    throw new RangeError("el ingreso declarado debe ser un entero de pesos no negativo");
  }
  if (!Number.isSafeInteger(verificado) || verificado <= 0) {
    throw new RangeError("el ingreso verificado debe ser un entero de pesos positivo");
  }
  const diferencia = Math.abs(declarado - verificado);
  // BigInt: el producto es exacto para cualquier entero seguro, sin desbordar ni redondear.
  const supera =
    BigInt(diferencia) * 100n > BigInt(UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE) * BigInt(verificado);
  return {
    declarado,
    verificado,
    diferencia,
    umbralPorcentaje: UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE,
    supera,
  };
}

/**
 * Qué porcentaje del ingreso verificado es la diferencia con el declarado, con dos decimales y
 * aritmética entera: la mitad exacta de la centésima va hacia arriba (#13, R9). Es informativo, para
 * guardarlo con la solicitud: la decisión de la Regla 3 la toma `evaluarDiscrepancia`, con la
 * comparación exacta, y el redondeo no puede mover su borde.
 */
export function calcularDiferenciaPorcentaje(declarado: number, verificado: number): number {
  if (!Number.isSafeInteger(declarado) || declarado < 0) {
    throw new RangeError("el ingreso declarado debe ser un entero de pesos no negativo");
  }
  if (!Number.isSafeInteger(verificado) || verificado <= 0) {
    throw new RangeError("el ingreso verificado debe ser un entero de pesos positivo");
  }
  const diferencia = BigInt(Math.abs(declarado - verificado));
  const denominador = BigInt(verificado);
  // round_half_up(diferencia · 10.000 / verificado) = floor((diferencia · 20.000 + verificado) / (2 · verificado))
  const centesimas = (diferencia * 20_000n + denominador) / (2n * denominador);
  return Number(centesimas) / 100;
}

export interface EntradaDecisionIngreso {
  registros: readonly RegistroExtraccion[];
  /** Nombre del solicitante verificado, para contrastarlo con los documentos (US3). */
  nombreSolicitante: string;
  idSolicitante: string;
  ingresoDeclarado: number | null;
}

/**
 * La decisión completa de la Regla 3 sobre la conversación (R5), en este orden: un documento no
 * cubierto (Regla 5), una inconsistencia que detiene, sin ingreso, sin declarado, discrepancia y
 * verificado.
 */
export function decidirIngreso({
  registros,
  nombreSolicitante,
  idSolicitante,
  ingresoDeclarado,
}: EntradaDecisionIngreso): ResultadoIngreso {
  const { inconsistencias, sinContrastar } = validarConsistencia({ nombreSolicitante, registros });
  const base = { idSolicitante, ingresoDeclarado, inconsistencias, sinContrastar };
  const decision = (
    resultado: ResultadoIngreso["estado"],
    motivo: string,
    valores: Record<string, string | number>,
    regla = REGLA_3,
  ) => ({ regla, resultado, motivo, valores, versionPolitica: VERSION_POLITICA });

  const noCubierto = registros
    .filter((registro) => registro.estado === "no_cubierto")
    .toSorted((a, b) => a.adjunto - b.adjunto)[0];
  if (noCubierto?.estado === "no_cubierto") {
    return {
      ...base,
      estado: "no_cubierto",
      ingreso: null,
      discrepancia: null,
      decision: decision(
        "no_cubierto",
        "Un documento de la conversación no está cubierto por la política; no se calcula el ingreso.",
        { causa: noCubierto.causa, adjunto: noCubierto.adjunto },
        REGLA_5,
      ),
    };
  }

  // Una inconsistencia que detiene invalida el ingreso: se evalúa antes de calcularlo (R5).
  const queDetienen = [...new Set(inconsistencias.filter((i) => i.detiene).map((i) => i.regla))];
  if (queDetienen.length > 0) {
    return {
      ...base,
      estado: "inconsistencia",
      ingreso: null,
      discrepancia: null,
      decision: decision(
        "inconsistencia",
        "Los documentos se contradicen entre sí o con el solicitante; pasa a un analista.",
        { reglas: queDetienen.join(", "), inconsistencias: inconsistencias.length },
      ),
    };
  }

  const ingreso = calcularIngresoVerificado(registros);
  if (ingreso === null) {
    const unicos = extraidosUnicos(registros);
    return {
      ...base,
      estado: "sin_ingreso",
      ingreso: null,
      discrepancia: null,
      decision: decision(
        "sin_ingreso",
        "Los documentos no dan un ingreso verificable; se piden documentos de ingreso.",
        {
          certificados: unicos.filter((r) => r.documento.tipo === "certificado_laboral").length,
          extractos: unicos.filter((r) => r.documento.tipo === "extracto_bancario").length,
        },
      ),
    };
  }

  if (ingresoDeclarado === null) {
    return {
      ...base,
      estado: "falta_declarado",
      ingreso,
      discrepancia: null,
      decision: decision(
        "falta_declarado",
        "Hay ingreso verificado, pero el solicitante no declaró el suyo; se le pide.",
        { ingresoVerificado: ingreso.monto, origen: ingreso.origen },
      ),
    };
  }

  const discrepancia = evaluarDiscrepancia(ingresoDeclarado, ingreso.monto);
  const valores = {
    ingresoVerificado: ingreso.monto,
    ingresoDeclarado,
    diferencia: discrepancia.diferencia,
    umbralPorcentaje: discrepancia.umbralPorcentaje,
    origen: ingreso.origen,
  };
  return discrepancia.supera
    ? {
        ...base,
        estado: "discrepancia",
        ingreso,
        discrepancia,
        decision: decision(
          "discrepancia",
          "El ingreso declarado difiere del verificado en más del umbral; pasa a un analista.",
          valores,
        ),
      }
    : {
        ...base,
        estado: "verificado",
        ingreso,
        discrepancia,
        decision: decision(
          "verificado",
          "El ingreso salió de los documentos y el declarado está dentro del umbral.",
          valores,
        ),
      };
}
