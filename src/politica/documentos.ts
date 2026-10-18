// Regla 5 aplicada a los documentos de soporte (constitución, Principios I y V; specs/008-extraccion-documentos:
// research.md, R5; data-model.md, "DecisionDocumento"). Funciones puras: las usan el agente, para
// decidir qué hacer con un documento ya extraído, y el core, para revalidar lo que recibe.

import {
  EXPRESIONES_MONEDA,
  MONEDA_SOPORTADA,
  TIPOS_DOCUMENTO_SOPORTADOS,
  VERSION_POLITICA,
} from "./politica.ts";

export const REGLA_5 = "Regla 5 · caso no cubierto por la política";
export const REGLA_PRINCIPIO_V = "constitución, Principio V";

export type CausaNoCubierto = "moneda_extranjera" | "documento_no_soportado";

export type MonedaDeducida =
  { tipo: "soportada"; codigo: typeof MONEDA_SOPORTADA } | { tipo: "extranjera"; codigo: string };

/** Minúsculas y sin tildes, para comparar el fragmento con la tabla de expresiones. */
const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** La expresión como palabra completa: `cop` no coincide con `copia`. */
const comoPalabra = (expresion: string) =>
  new RegExp(`(?<![a-z0-9])${escaparRegex(expresion)}(?![a-z0-9])`);

const menciona = (texto: string, expresiones: readonly string[]) =>
  expresiones.some((expresion) => comoPalabra(expresion).test(texto));

/**
 * Deduce la moneda del fragmento donde el documento la menciona. Si el fragmento nombra una moneda
 * extranjera, esa prevalece aunque también diga «pesos»: ante la duda se escala (Principio V).
 * `null` si el fragmento no nombra ninguna moneda conocida; no se presume COP.
 */
export function deducirMoneda(fragmento: string): MonedaDeducida | null {
  const texto = normalizar(fragmento);
  for (const [codigo, expresiones] of Object.entries(EXPRESIONES_MONEDA)) {
    if (codigo !== MONEDA_SOPORTADA && menciona(texto, expresiones)) {
      return { tipo: "extranjera", codigo };
    }
  }
  if (menciona(texto, EXPRESIONES_MONEDA[MONEDA_SOPORTADA] ?? [])) {
    return { tipo: "soportada", codigo: MONEDA_SOPORTADA };
  }
  return null;
}

/** Lo que la política necesita saber de una extracción ya validada. */
export interface EntradaDocumento {
  /** Lo que el subagente clasificó: un tipo soportado, `otro` o cualquier otro valor. */
  tipo: string;
  /** Fragmento donde el documento menciona la moneda; `null` si no la menciona. */
  fragmentoMoneda: string | null;
  /** Campos para los que el documento da dos valores distintos. */
  conflictos: readonly string[];
  /** Campos que el documento no trae. */
  faltantes: readonly string[];
  /** Si el documento trae algún monto (salario o movimientos): solo entonces la moneda hace falta. */
  tieneMontos: boolean;
}

/** Decisión explicable sobre un documento (Principio III). */
export interface DecisionDocumento {
  regla: string;
  resultado: "extraido" | "no_cubierto" | "no_extraible";
  motivo: string;
  valores: Record<string, string>;
  versionPolitica: string;
  /** Solo con `no_cubierto`. */
  causa?: CausaNoCubierto;
  /** Campos nulos del documento; vacío salvo con `extraido`. */
  faltantes: string[];
}

const esTipoSoportado = (tipo: string) =>
  (TIPOS_DOCUMENTO_SOPORTADOS as readonly string[]).includes(tipo);

/**
 * Orden: tipo no soportado → moneda extranjera → valores en conflicto → extraído (Regla 5 y luego
 * Principio V). Si el documento trae montos y no nombra una moneda reconocible, la moneda es un
 * faltante; sin montos, no hace falta.
 */
export function evaluarDocumento(entrada: EntradaDocumento): DecisionDocumento {
  const { tipo, fragmentoMoneda, conflictos } = entrada;
  const base = { versionPolitica: VERSION_POLITICA };

  if (!esTipoSoportado(tipo)) {
    return {
      ...base,
      regla: REGLA_5,
      resultado: "no_cubierto",
      causa: "documento_no_soportado",
      motivo: "El tipo de documento no está entre los soportados por la política.",
      valores: { tipo, causa: "documento_no_soportado" },
      faltantes: [],
    };
  }

  const moneda = fragmentoMoneda === null ? null : deducirMoneda(fragmentoMoneda);
  if (moneda?.tipo === "extranjera") {
    return {
      ...base,
      regla: REGLA_5,
      resultado: "no_cubierto",
      causa: "moneda_extranjera",
      motivo: "El documento está en una moneda distinta de la soportada.",
      valores: { tipo, causa: "moneda_extranjera", moneda: moneda.codigo },
      faltantes: [],
    };
  }

  if (conflictos.length > 0) {
    return {
      ...base,
      regla: REGLA_PRINCIPIO_V,
      resultado: "no_extraible",
      motivo: "El documento da dos valores distintos para el mismo campo; no se elige uno.",
      valores: { tipo, conflictos: conflictos.join(", ") },
      faltantes: [],
    };
  }

  // Sin montos, la moneda no hace falta; con montos, una moneda no indicada no se presume COP.
  const faltantes = entrada.faltantes.filter((f) => f !== "moneda" || entrada.tieneMontos);
  if (moneda === null && entrada.tieneMontos && !faltantes.includes("moneda")) {
    faltantes.push("moneda");
  }
  const valores = {
    tipo,
    moneda: moneda === null ? "no indicada" : moneda.codigo,
    faltantes: faltantes.length === 0 ? "ninguno" : faltantes.join(", "),
  };
  return faltantes.length === 0
    ? {
        ...base,
        regla: REGLA_5,
        resultado: "extraido",
        motivo: "El documento está cubierto por la política y trae todos sus datos.",
        valores,
        faltantes,
      }
    : {
        ...base,
        regla: REGLA_PRINCIPIO_V,
        resultado: "extraido",
        motivo: "El documento trae datos faltantes; no se completan ni se suponen.",
        valores,
        faltantes,
      };
}
