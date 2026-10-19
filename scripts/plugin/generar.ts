// Generador del plugin: copia cada fuente a su destino sin transformarla.
// Antes de copiar comprueba que ninguna fuente tenga una referencia propia del repositorio.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARPETA_PLUGIN, PIEZAS, type Pieza } from "./piezas.ts";
import { analizarTexto } from "./portabilidad.ts";

export interface ResultadoGeneracion {
  /** Destinos que se escribieron porque faltaban o eran distintos de su fuente. */
  copiadas: string[];
}

export interface OpcionesGeneracion {
  /** Solo comprueba que las copias coinciden con sus fuentes; no escribe nada. */
  verificar?: boolean;
}

export class FuenteInexistente extends Error {
  override name = "FuenteInexistente";
}

/** Una pieza genérica contiene una referencia propia de este repositorio. */
export class ReferenciaPropia extends Error {
  override name = "ReferenciaPropia";
}

/** Una copia del plugin no coincide con su fuente. */
export class CopiasDesalineadas extends Error {
  override name = "CopiasDesalineadas";
}

function comprobarFuentes(raiz: string, piezas: readonly Pieza[]): void {
  for (const pieza of piezas) {
    if (!existsSync(join(raiz, pieza.fuente))) {
      throw new FuenteInexistente(`la fuente ${pieza.fuente} no existe`);
    }
  }
  const hallazgos = piezas.flatMap((pieza) =>
    analizarTexto(readFileSync(join(raiz, pieza.fuente), "utf8"), pieza.fuente),
  );
  if (hallazgos.length > 0) {
    const detalle = hallazgos.map((h) => `  ${h.archivo}:${h.linea} contiene «${h.termino}»`);
    throw new ReferenciaPropia(
      `una pieza genérica tiene una referencia propia de este repositorio; no se generó nada:\n${detalle.join("\n")}`,
    );
  }
}

function desalineadas(raiz: string, piezas: readonly Pieza[]): string[] {
  return piezas.flatMap((pieza) => {
    const origen = join(raiz, pieza.fuente);
    const destino = join(raiz, CARPETA_PLUGIN, pieza.destino);
    if (!existsSync(destino)) return [`${pieza.destino}: falta la copia`];
    return readFileSync(destino).equals(readFileSync(origen))
      ? []
      : [`${pieza.destino}: difiere de su fuente ${pieza.fuente}`];
  });
}

/**
 * Copia las piezas al plugin. Si una fuente no existe o trae una referencia propia, no escribe
 * nada. Con `verificar` solo compara y falla si alguna copia difiere de su fuente.
 */
export function generar(
  raiz: string,
  piezas: readonly Pieza[] = PIEZAS,
  opciones: OpcionesGeneracion = {},
): ResultadoGeneracion {
  comprobarFuentes(raiz, piezas);
  if (opciones.verificar === true) {
    const diferencias = desalineadas(raiz, piezas);
    if (diferencias.length > 0) {
      throw new CopiasDesalineadas(
        `el plugin no coincide con sus fuentes; ejecuta npm run plugin:generar:\n${diferencias.map((d) => `  ${d}`).join("\n")}`,
      );
    }
    return { copiadas: [] };
  }
  const copiadas: string[] = [];
  for (const pieza of piezas) {
    const origen = join(raiz, pieza.fuente);
    const destino = join(raiz, CARPETA_PLUGIN, pieza.destino);
    if (existsSync(destino) && readFileSync(destino).equals(readFileSync(origen))) continue;
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(origen, destino);
    copiadas.push(pieza.destino);
  }
  return { copiadas };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raiz = fileURLToPath(new URL("../../", import.meta.url));
  const verificar = process.argv.includes("--verificar");
  try {
    const { copiadas } = generar(raiz, PIEZAS, { verificar });
    if (verificar) {
      process.stdout.write("El plugin coincide con sus fuentes.\n");
    } else {
      process.stdout.write(
        copiadas.length === 0
          ? "El plugin ya estaba al día.\n"
          : `Plugin actualizado: ${copiadas.length} pieza(s) copiada(s).\n${copiadas.map((c) => `  ${c}`).join("\n")}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
