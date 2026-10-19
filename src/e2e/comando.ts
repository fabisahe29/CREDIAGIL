// Ejecución de los casos obligatorios del comando `npm run casos`, sin E/S propia: la carpeta, el entorno y
// el core se inyectan para probarla. Un caso cuya carpeta no existe es no ejecutable; nunca se omite.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { NUMEROS_DE_CASO, type OpcionesComando } from "./arranque.ts";
import { ejecutarCaso, type OpcionesEjecucion, type ResultadoCaso } from "./ejecutor.ts";
import { armarInforme, type Informe } from "./informe.ts";

export interface ContextoComando {
  /** La carpeta `casos/obligatorios/`. */
  carpetaCasos: string;
  ejecucion?: Pick<OpcionesEjecucion, "entorno" | "stderrCore" | "crearCore">;
}

export async function ejecutarCasos(
  { modo, caso }: OpcionesComando,
  { carpetaCasos, ejecucion = {} }: ContextoComando,
): Promise<Informe> {
  const carpetas = await readdir(carpetaCasos, { withFileTypes: true })
    .then((entradas) => entradas.filter((e) => e.isDirectory()).map((e) => e.name))
    .catch(() => [] as string[]);
  const numeros = caso !== undefined ? [caso] : NUMEROS_DE_CASO;

  const resultados: ResultadoCaso[] = [];
  for (const numero of numeros) {
    const carpeta = carpetas.find((nombre) => nombre.startsWith(`${numero}-`));
    if (carpeta === undefined) {
      resultados.push({
        numero,
        nombre: `caso-${numero}`,
        resultado: "no_ejecutable",
        diferencias: [],
        causa: `no existe la carpeta del caso ${numero} en casos/obligatorios`,
      });
      continue;
    }
    const ejecutados = await ejecutarCaso(join(carpetaCasos, carpeta), {
      modo,
      directorioBase: carpetaCasos,
      ...ejecucion,
    });
    // Un caso que ni siquiera cargó no conoce su número: el de su carpeta.
    resultados.push(...ejecutados.map((r) => ({ ...r, numero: r.numero ?? numero })));
  }
  return armarInforme(modo, resultados);
}
