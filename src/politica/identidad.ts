// Regla 1: ninguna solicitud se registra sin identidad verificada (constitución, Principio I;
// specs/007-verificacion-identidad: research.md, R5; data-model.md, "DecisionRegla1").
// Funciones puras: las usan el core, para el límite de intentos, y el control de identidad del agente.

import { MAX_INTENTOS_VERIFICACION, VERSION_POLITICA } from "./politica.ts";

/** Estado de identidad de una conversación, tal como lo guarda el core. */
export interface EstadoIdentidad {
  correlationId: string;
  verificada: boolean;
  /** El solicitante verificado; `null` si `verificada` es `false`. */
  idSolicitante: string | null;
  /** Marca de tiempo ISO 8601 de la verificación; `null` si `verificada` es `false`. */
  verificadaEn: string | null;
}

/** Decisión explicable de la Regla 1 (Principio III). */
export interface DecisionRegla1 {
  regla: string;
  permitido: boolean;
  motivo: string;
  valores: Record<string, string>;
  versionPolitica: string;
}

export const REGLA_1 = "Regla 1 · identidad verificada antes de registrar";

/**
 * Con `idSolicitanteAccion`, además exige que la acción sea sobre el solicitante verificado: la
 * verificación de una persona no se transfiere a otra (caso borde de la spec del #9).
 */
export function evaluarRegla1(
  estado: EstadoIdentidad,
  idSolicitanteAccion?: string,
): DecisionRegla1 {
  if (
    estado.verificada &&
    idSolicitanteAccion !== undefined &&
    idSolicitanteAccion !== estado.idSolicitante
  ) {
    return {
      regla: REGLA_1,
      permitido: false,
      motivo: "La identidad verificada en el core es de otro solicitante; no se transfiere.",
      valores: { identidad: "verificada para otro solicitante" },
      versionPolitica: VERSION_POLITICA,
    };
  }
  if (estado.verificada) {
    return {
      regla: REGLA_1,
      permitido: true,
      motivo: "La identidad del solicitante está verificada en el core.",
      valores: { identidad: "verificada" },
      versionPolitica: VERSION_POLITICA,
    };
  }
  return {
    regla: REGLA_1,
    permitido: false,
    motivo: "La identidad del solicitante no está verificada en el core.",
    valores: { identidad: "no verificada" },
    versionPolitica: VERSION_POLITICA,
  };
}

/** Verdadero si con esos intentos fallidos la verificación queda bloqueada. */
export function alcanzaLimite(fallidos: number): boolean {
  return fallidos >= MAX_INTENTOS_VERIFICACION;
}
