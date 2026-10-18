// Módulo único de política de crédito (constitución, Principio I; specs/007-verificacion-identidad,
// research.md, R5). Es la única fuente de los límites de las reglas de negocio: ningún otro archivo
// los repite como literal. El umbral del 10% de ingreso llegó con el #11, la tasa con el #12 y los
// de monto y cuota con el #14.

/** Versión de la política; acompaña cada decisión para poder auditarla. */
export const VERSION_POLITICA = "2026-10-18.3";

/**
 * Tasa de interés fija ficticia, en puntos base: 180 es el 1,8% mensual (constitución, Principio I;
 * specs/010-simulacion-cuota-capacidad-pago, research.md, R1). En entero se muestra sin el ruido de
 * flotante que daría `0.018 × 100`.
 */
export const TASA_MENSUAL_PUNTOS_BASE = 180;

/** La `i` de la fórmula de la cuota: exactamente el mismo número que el literal `0.018`. */
export const TASA_MENSUAL = TASA_MENSUAL_PUNTOS_BASE / 10_000;

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
 * código deduce la moneda; el modelo no elige el código. COP solo se reconoce con expresiones
 * inequívocas: «pesos» o `$` sueltos no bastan, porque también los usan otros países (revisión de
 * 0aa8c2a). Cualquier mención de una moneda extranjera en el documento lo saca de la política.
 */
export const EXPRESIONES_MONEDA: Readonly<Record<string, readonly string[]>> = {
  [MONEDA_SOPORTADA]: [
    "cop",
    "peso colombiano",
    "pesos colombianos",
    "pesos m/cte",
    "pesos mcte",
    "pesos moneda corriente",
  ],
  USD: [
    "usd",
    "us$",
    "u$s",
    "dolar",
    "dolares",
    "dolar americano",
    "dolares americanos",
    "dollar",
    "dollars",
    "us dollars",
  ],
  EUR: ["eur", "euro", "euros", "€"],
  GBP: ["gbp", "libra esterlina", "libras esterlinas", "£"],
  MXN: ["mxn", "peso mexicano", "pesos mexicanos"],
  CLP: ["clp", "peso chileno", "pesos chilenos"],
  ARS: ["ars", "peso argentino", "pesos argentinos"],
  UYU: ["uyu", "peso uruguayo", "pesos uruguayos"],
  DOP: ["dop", "peso dominicano", "pesos dominicanos"],
  CUP: ["peso cubano", "pesos cubanos"],
  PHP: ["peso filipino", "pesos filipinos"],
};

/** Intentos de extracción por documento, el primero incluido (spec del #10, FR-012). */
export const MAX_INTENTOS_EXTRACCION = 3;

/**
 * Regla 3 (constitución, Principio I; specs/009-ingreso-verificado-consistencia, research.md, R2):
 * diferencia relativa, en porcentaje del ingreso **verificado**, a partir de la cual el ingreso
 * declarado obliga a pasar el caso a un analista. Con exactamente este valor no hay discrepancia.
 */
export const UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE = 10;

/**
 * Palabras que, en la descripción de un abono, lo reconocen como abono de nómina (R3). En minúsculas
 * y sin tildes; se buscan como palabra completa.
 */
export const PALABRAS_NOMINA: readonly string[] = ["nomina", "salario", "sueldo"];

/** Formas societarias que no cuentan al comparar empleador y pagador (R4). Minúsculas, sin puntos. */
export const SUFIJOS_SOCIETARIOS: readonly string[] = ["sas", "sa", "ltda", "cia", "sca", "eu"];

/** Palabras vacías que no cuentan al comparar empleador y pagador (R4). Minúsculas, sin tildes. */
export const PALABRAS_VACIAS_NOMBRE: readonly string[] = ["de", "del", "la", "las", "los", "y"];

/** Un extracto es un mes: uno de más días no se puede promediar como tal (R3, R4). */
export const MAX_DIAS_PERIODO_EXTRACTO = 31;

/** Reextracciones de un documento por una misma regla de consistencia (R6). */
export const MAX_REEXTRACCIONES_POR_REGLA = 1;

/**
 * Regla 2 (constitución, Principio I; specs/012-preaprobacion-automatica-politica, research.md, R1):
 * monto máximo, en pesos, que se preaprueba de forma automática. Con exactamente este valor se
 * preaprueba; con un peso más, el caso va a un analista.
 */
export const TOPE_MONTO_PREAPROBACION = 5_000_000;

/**
 * Regla 2: relación máxima, en porcentaje, entre la cuota mensual y el ingreso mensual verificado
 * para preaprobar. Con exactamente este valor se preaprueba. Se compara con enteros
 * (`cuota · 100 ≤ porcentaje · ingreso`), nunca con la relación redondeada a dos decimales.
 */
export const PORCENTAJE_MAXIMO_CUOTA_INGRESO = 30;
