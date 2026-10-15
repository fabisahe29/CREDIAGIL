// Convención de datos ficticios: fuente única que usa el control datos-reales.
// Su versión para personas es docs/datos-ficticios.md; una prueba mantiene ambos sincronizados.

export const PREFIJO_FICTICIO = "000";

export type TipoDato = "cédula" | "NIT" | "cuenta";

export interface PalabraClave {
  /** Texto tal como aparece en docs/datos-ficticios.md. */
  texto: string;
  /** Expresión que la reconoce en una línea. */
  patron: RegExp;
}

// Límites de palabra que reconocen letras con tilde (\b solo conoce ASCII).
const antes = "(?<![\\p{L}\\p{N}])";
const despues = "(?![\\p{L}\\p{N}])";

function exacta(texto: string): PalabraClave {
  const escapado = texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { texto, patron: new RegExp(`${antes}${escapado}${despues}`, "u") };
}

function sinMayusculas(texto: string): PalabraClave {
  const escapado = texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { texto, patron: new RegExp(`${antes}${escapado}${despues}`, "iu") };
}

export const PALABRAS_CLAVE: readonly { tipo: TipoDato; palabras: readonly PalabraClave[] }[] = [
  {
    tipo: "cédula",
    palabras: [
      exacta("CC"),
      { texto: "C.C.", patron: /(?<![\p{L}\p{N}])C\.C\./iu },
      sinMayusculas("cédula"),
      sinMayusculas("cedula"),
      sinMayusculas("documento de identidad"),
      sinMayusculas("número de documento"),
    ],
  },
  { tipo: "NIT", palabras: [exacta("NIT")] },
  {
    tipo: "cuenta",
    palabras: [
      sinMayusculas("cuenta"),
      sinMayusculas("cuentas"),
      sinMayusculas("IBAN"),
      sinMayusculas("número de cuenta"),
      { texto: "nro. de cuenta", patron: /(?<![\p{L}\p{N}])nro\. de cuenta(?![\p{L}\p{N}])/iu },
    ],
  },
];

/** Verdadero si la línea contiene alguna palabra clave del tipo. */
export function tienePalabraClave(linea: string, tipo: TipoDato): boolean {
  const entrada = PALABRAS_CLAVE.find((p) => p.tipo === tipo);
  return entrada?.palabras.some((p) => p.patron.test(linea)) ?? false;
}

/** Un número es ficticio si sus dígitos, sin separadores, empiezan por el prefijo de la convención. */
export function esFicticio(valor: string): boolean {
  return valor.replace(/\D/g, "").startsWith(PREFIJO_FICTICIO);
}
