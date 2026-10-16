// Archivos de una revisión dentro del paquete (data-model.md, "Paquete de revisión").
// Solo los escriben capturar.ts y revision.ts; el guardián niega escribirlos a mano (R9).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Entradas } from "./decision.ts";
import { validarInforme, type Informe, type TipoRevision } from "./informe.ts";
import { rutaPaquete, type Paquete } from "./paquete.ts";

export interface Fallo {
  tipo: TipoRevision;
  sha: string;
  causa: string;
  errores: string[];
  fecha: string;
}

export const TIPOS: readonly TipoRevision[] = ["codigo", "cumplimiento"];

export const archivoInforme = (raiz: string, sha: string, tipo: TipoRevision) =>
  join(rutaPaquete(raiz, sha), `informe-${tipo}.json`);
export const archivoFallo = (raiz: string, sha: string, tipo: TipoRevision) =>
  join(rutaPaquete(raiz, sha), `fallo-${tipo}.json`);
export const archivoDecision = (raiz: string, sha: string) =>
  join(rutaPaquete(raiz, sha), "decision.json");

function escribirJson(archivo: string, valor: unknown): void {
  mkdirSync(join(archivo, ".."), { recursive: true });
  writeFileSync(archivo, `${JSON.stringify(valor, null, 2)}\n`);
}

/** Guarda un informe ya validado y borra un fallo anterior del mismo tipo. */
export function guardarInforme(raiz: string, informe: Informe): void {
  escribirJson(archivoInforme(raiz, informe.sha, informe.tipo), informe);
  rmSync(archivoFallo(raiz, informe.sha, informe.tipo), { force: true });
}

/** Guarda la causa de una revisión fallida y borra un informe anterior del mismo tipo. */
export function guardarFallo(
  raiz: string,
  sha: string,
  tipo: TipoRevision,
  causa: string,
  errores: string[] = [],
): void {
  const fallo: Fallo = { tipo, sha, causa, errores, fecha: new Date().toISOString() };
  escribirJson(archivoFallo(raiz, sha, tipo), fallo);
  rmSync(archivoInforme(raiz, sha, tipo), { force: true });
}

export function guardarDecision(raiz: string, sha: string, decision: unknown): void {
  escribirJson(archivoDecision(raiz, sha), decision);
}

/** Lee un JSON del paquete; `undefined` si no existe o no se puede parsear. */
export function leerJson(archivo: string): unknown {
  if (!existsSync(archivo)) return undefined;
  try {
    return JSON.parse(readFileSync(archivo, "utf8"));
  } catch {
    return undefined;
  }
}

function esFallo(valor: unknown, tipo: TipoRevision): valor is Fallo {
  return (
    typeof valor === "object" &&
    valor !== null &&
    (valor as Record<string, unknown>)["tipo"] === tipo &&
    typeof (valor as Record<string, unknown>)["causa"] === "string"
  );
}

/**
 * Informes y fallos guardados en el paquete, listos para decidir. Cada informe se vuelve a validar
 * contra el paquete: uno que no valida (por ejemplo, editado a mano) cuenta como revisión fallida.
 */
export function leerEntradas(raiz: string, paquete: Paquete): Entradas {
  const entradas: Entradas = { fallos: {} };
  for (const tipo of TIPOS) {
    const fallo = leerJson(archivoFallo(raiz, paquete.sha, tipo));
    if (fallo !== undefined) {
      entradas.fallos![tipo] = esFallo(fallo, tipo)
        ? fallo
        : {
            tipo,
            sha: paquete.sha,
            causa: "fallo-*.json ilegible",
            errores: [],
            fecha: new Date().toISOString(),
          };
      continue;
    }
    const valor = leerJson(archivoInforme(raiz, paquete.sha, tipo));
    if (valor === undefined) continue;
    const resultado = validarInforme(tipo, valor, paquete);
    if (!resultado.valido) {
      entradas.fallos![tipo] = {
        tipo,
        sha: paquete.sha,
        causa: "el informe guardado no valida",
        errores: resultado.errores,
        fecha: new Date().toISOString(),
      };
    } else if (resultado.informe.tipo === "codigo") {
      entradas.codigo = resultado.informe;
    } else {
      entradas.cumplimiento = resultado.informe;
    }
  }
  return entradas;
}
