// Regla 5 aplicada a los documentos de soporte (constitución, Principios I y V; specs/008-extraccion-documentos:
// research.md, R5; data-model.md, "DecisionDocumento"). Funciones puras: las usan el agente, para
// decidir qué hacer con un documento, y el core, para revalidar lo que recibe.

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

/** Minúsculas y sin tildes, para comparar el texto con la tabla de expresiones. */
const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * La expresión como palabra: un extremo que es letra no puede pegarse a otra letra (`cop` no
 * coincide con `copia`), pero sí a una cifra (`USD1.200`, `1.200usd`). Un extremo que es símbolo no
 * pide límite: «US$1.200», «€900» o «900€» (revisión de 5d28165).
 */
const comoPalabra = (expresion: string) => {
  const antes = /^[a-z]/.test(expresion) ? "(?<![a-z])" : "";
  const despues = /[a-z]$/.test(expresion) ? "(?![a-z])" : "";
  return new RegExp(`${antes}${escaparRegex(expresion)}${despues}`);
};

const menciona = (texto: string, expresiones: readonly string[]) =>
  expresiones.some((expresion) => comoPalabra(expresion).test(texto));

/**
 * Deduce la moneda de un texto. Si nombra una moneda extranjera, esa prevalece aunque también nombre
 * COP: ante la duda se escala (Principio V). `null` si no nombra ninguna moneda de forma inequívoca
 * («pesos» o `$` sueltos no bastan); nunca se presume COP.
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

/** Longitud máxima de un fragmento citado; la usa también el esquema de procedencia. */
export const LARGO_MAXIMO_FRAGMENTO = 300;
const LARGO_FRAGMENTO = LARGO_MAXIMO_FRAGMENTO;

/**
 * Busca en todo el documento, línea por línea, una mención de moneda extranjera. Devuelve el código
 * y el fragmento literal donde aparece (como mucho 300 caracteres), o `null`. Así la Regla 5 no
 * depende de qué fragmento cite el modelo (revisión de 0aa8c2a).
 */
export function buscarMonedaExtranjera(
  contenido: string,
): { codigo: string; fragmento: string } | null {
  for (const linea of contenido.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (limpia === "") continue;
    // Una línea larga se recorre en ventanas solapadas para citar un fragmento que la contenga.
    const ventanas =
      limpia.length <= LARGO_FRAGMENTO
        ? [limpia]
        : Array.from({ length: Math.ceil(limpia.length / (LARGO_FRAGMENTO / 2)) }, (_, i) =>
            limpia
              .slice(i * (LARGO_FRAGMENTO / 2), i * (LARGO_FRAGMENTO / 2) + LARGO_FRAGMENTO)
              .trim(),
          );
    for (const ventana of ventanas) {
      const moneda = deducirMoneda(ventana);
      if (moneda?.tipo === "extranjera") return { codigo: moneda.codigo, fragmento: ventana };
    }
  }
  return null;
}

/** Lo que la política necesita saber de una extracción ya validada. */
export interface EntradaDocumento {
  /** Lo que el subagente clasificó: un tipo soportado, `otro` o cualquier otro valor. */
  tipo: string;
  /** Fragmento donde el documento menciona la moneda; `null` si no la menciona. */
  fragmentoMoneda: string | null;
  /** Fragmento del documento que nombra una moneda extranjera (`buscarMonedaExtranjera`), o `null`. */
  monedaExtranjeraEnContenido: string | null;
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

const noCubierto = (
  causa: CausaNoCubierto,
  motivo: string,
  valores: Record<string, string>,
): DecisionDocumento => ({
  versionPolitica: VERSION_POLITICA,
  regla: REGLA_5,
  resultado: "no_cubierto",
  causa,
  motivo,
  valores: { ...valores, causa },
  faltantes: [],
});

/**
 * Regla 5 sin modelo, antes que la Regla 1 (orden 4 → 5 → 1): un archivo que el chat no pudo leer, o
 * un documento que nombra una moneda extranjera en cualquier parte, no está cubierto. `null` si con
 * esto no se puede decir; el tipo de documento lo clasifica después el subagente.
 */
export function evaluarRegla5Previa(documento: {
  soportado: boolean;
  contenido?: string;
}): DecisionDocumento | null {
  if (!documento.soportado || documento.contenido === undefined) {
    return noCubierto(
      "documento_no_soportado",
      "El archivo no se pudo leer como texto (formato, tamaño o codificación no soportados).",
      { tipo: "archivo no soportado" },
    );
  }
  const extranjera = buscarMonedaExtranjera(documento.contenido);
  if (extranjera !== null) {
    return noCubierto(
      "moneda_extranjera",
      "El documento nombra una moneda distinta de la soportada.",
      { tipo: "sin clasificar", moneda: extranjera.codigo },
    );
  }
  return null;
}

/**
 * Orden: tipo no soportado → moneda extranjera (citada o en cualquier parte del documento) → valores
 * en conflicto → extraído (Regla 5 y luego Principio V). Si el documento trae montos y no nombra una
 * moneda reconocible, la moneda es un faltante; sin montos, no hace falta.
 */
export function evaluarDocumento(entrada: EntradaDocumento): DecisionDocumento {
  const { tipo, fragmentoMoneda, conflictos } = entrada;
  const base = { versionPolitica: VERSION_POLITICA };

  if (!esTipoSoportado(tipo)) {
    return noCubierto(
      "documento_no_soportado",
      "El tipo de documento no está entre los soportados por la política.",
      { tipo },
    );
  }

  const moneda = fragmentoMoneda === null ? null : deducirMoneda(fragmentoMoneda);
  const enContenido =
    entrada.monedaExtranjeraEnContenido === null
      ? null
      : deducirMoneda(entrada.monedaExtranjeraEnContenido);
  const codigoExtranjero = (m: MonedaDeducida | null) =>
    m?.tipo === "extranjera" ? m.codigo : null;
  const extranjera = codigoExtranjero(moneda) ?? codigoExtranjero(enContenido);
  if (extranjera !== null) {
    return noCubierto(
      "moneda_extranjera",
      "El documento está en una moneda distinta de la soportada.",
      {
        tipo,
        moneda: extranjera,
      },
    );
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
