// Normalización de texto para comparar con la política (specs/009-ingreso-verificado-consistencia,
// research.md, R3 y R4): minúsculas, sin tildes y sin puntuación. Funciones puras.

/** Minúsculas y sin tildes: «Nómina» → «nomina». */
export const sinTildes = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Palabras en minúsculas y sin tildes ni puntuación: «S.A.S.» → «sas», «Pérez, Ana» → «perez», «ana». */
export function palabras(texto: string): string[] {
  return sinTildes(texto)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((palabra) => palabra !== "");
}
