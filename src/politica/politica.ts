// Módulo único de política de crédito (constitución, Principio I; specs/007-verificacion-identidad,
// research.md, R5). Es la única fuente de los límites de las reglas de negocio: ningún otro archivo
// los repite como literal. Los umbrales de monto, cuota e ingreso y la tasa llegan con el #12 y el #14.

/** Versión de la política; acompaña cada decisión para poder auditarla. */
export const VERSION_POLITICA = "2026-10-17.2";

/** Regla 1: intentos fallidos de verificación de identidad antes de bloquearla (aclaración Q2 del #9). */
export const MAX_INTENTOS_VERIFICACION = 3;

/**
 * Regla 5: tipos de documento que el MVP sabe extraer (aclaración Q1 del #10). Cualquier otro tipo
 * es un caso no cubierto y se escala.
 */
export const TIPOS_DOCUMENTO_SOPORTADOS = ["certificado_laboral", "extracto_bancario"] as const;
export type TipoDocumentoSoportado = (typeof TIPOS_DOCUMENTO_SOPORTADOS)[number];

/** Regla 5: única moneda soportada (constitución, Restricciones técnicas). Las demás se escalan. */
export const MONEDA_SOPORTADA = "COP";

/**
 * Expresiones con las que un documento nombra cada moneda, en minúsculas y sin tildes. Con ellas el
 * código deduce la moneda a partir del fragmento citado; el modelo no elige el código. Un `$` solo
 * no basta: en Colombia también se usa para dólares.
 */
export const EXPRESIONES_MONEDA: Readonly<Record<string, readonly string[]>> = {
  [MONEDA_SOPORTADA]: ["cop", "peso colombiano", "pesos colombianos", "peso", "pesos"],
  USD: ["usd", "us$", "dolar", "dolares", "dolar americano", "dolares americanos"],
  EUR: ["eur", "euro", "euros"],
  MXN: ["mxn", "peso mexicano", "pesos mexicanos"],
  GBP: ["gbp", "libra esterlina", "libras esterlinas"],
};

/** Intentos de extracción por documento, el primero incluido (spec del #10, FR-012). */
export const MAX_INTENTOS_EXTRACCION = 3;
