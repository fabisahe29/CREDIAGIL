// Abonos de nómina y registros extraídos (specs/009-ingreso-verificado-consistencia, research.md, R3).
// Los usan el cálculo del ingreso y las comprobaciones de consistencia. Funciones puras.

import type { Movimiento, RegistroExtraccion } from "../compartido/extraccion.ts";
import { PALABRAS_NOMINA, PALABRAS_VACIAS_NOMBRE } from "./politica.ts";
import { palabras, sinTildes } from "./texto.ts";

/** Palabras que acompañan a la de nómina en una descripción pero no son parte del pagador. */
const PALABRAS_DE_PAGO = ["pago", "abono"];

const contienePalabra = (texto: string, palabra: string) =>
  new RegExp(`(?<![a-z])${palabra}(?![a-z])`).test(texto);

/** Abono de nómina: sentido abono y alguna palabra de `PALABRAS_NOMINA` en la descripción (R3). */
export function esAbonoDeNomina(movimiento: Movimiento): boolean {
  if (movimiento.sentido !== "abono") return false;
  const descripcion = sinTildes(movimiento.descripcion);
  return PALABRAS_NOMINA.some((palabra) => contienePalabra(descripcion, palabra));
}

/** El pagador de un abono de nómina: su descripción sin la palabra de nómina ni palabras de pago. */
export function pagadorDe(movimiento: Movimiento): string {
  const quitar = [...PALABRAS_NOMINA, ...PALABRAS_DE_PAGO];
  const restantes = movimiento.descripcion
    .split(/\s+/)
    .filter((palabra) => palabra !== "" && !quitar.includes(palabras(palabra).join("")));
  while (restantes[0] !== undefined && PALABRAS_VACIAS_NOMBRE.includes(sinTildes(restantes[0]))) {
    restantes.shift();
  }
  return restantes.join(" ");
}

/** Los registros extraídos, sin repetir el mismo contenido y por número de adjunto. */
export function extraidosUnicos(registros: readonly RegistroExtraccion[]) {
  const vistos = new Set<string>();
  const unicos = [];
  for (const registro of registros) {
    if (registro.estado !== "extraido" || vistos.has(registro.huella)) continue;
    vistos.add(registro.huella);
    unicos.push(registro);
  }
  return unicos.toSorted((a, b) => a.adjunto - b.adjunto);
}
