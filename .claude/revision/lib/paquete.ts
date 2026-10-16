// Paquete de revisión (data-model.md, "Paquete de revisión"; research.md, R4).
// Fija el alcance de las dos revisiones: el diff del ticket respecto de main, identificado por un sha.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { specDeTicket, ticketDeRama } from "../../hooks/lib/spec-primero.ts";

export type EstadoArchivo = "agregado" | "modificado" | "eliminado" | "renombrado";

export interface ArchivoCambiado {
  ruta: string;
  estado: EstadoArchivo;
}

export interface Paquete {
  issue: number;
  rama: string;
  sha: string;
  base: string;
  archivos: ArchivoCambiado[];
  spec: string;
  constitucion: string;
}

export const CONSTITUCION = ".specify/memory/constitution.md";

export class DiffVacio extends Error {
  override name = "DiffVacio";
}
export class SinSpec extends Error {
  override name = "SinSpec";
}
export class PaqueteInexistente extends Error {
  override name = "PaqueteInexistente";
}
export class ErrorGit extends Error {
  override name = "ErrorGit";
}

const SHA = /^[0-9a-f]{40}$/;
const ESTADOS: Readonly<Record<string, EstadoArchivo>> = {
  A: "agregado",
  C: "agregado",
  M: "modificado",
  T: "modificado",
  D: "eliminado",
  R: "renombrado",
};

export function esSha(valor: unknown): valor is string {
  return typeof valor === "string" && SHA.test(valor);
}

export function rutaPaquete(raiz: string, sha: string): string {
  return join(raiz, ".git", "crediagil", "revisiones", sha);
}

function git(raiz: string, ...argumentos: string[]): string {
  try {
    return execFileSync("git", argumentos, {
      cwd: raiz,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const causa = error instanceof Error ? error.message : String(error);
    throw new ErrorGit(`git ${argumentos.join(" ")} falló: ${causa}`, { cause: error });
  }
}

/** Interpreta `git diff --name-status`; un renombrado cuenta con su ruta nueva. */
export function archivosDelDiff(nombreEstado: string): ArchivoCambiado[] {
  const archivos: ArchivoCambiado[] = [];
  for (const linea of nombreEstado.split(/\r?\n/)) {
    if (linea.trim() === "") continue;
    const [codigo = "", ...rutas] = linea.split("\t");
    const estado = ESTADOS[codigo.charAt(0)];
    const ruta = rutas.at(-1);
    if (estado !== undefined && ruta !== undefined) archivos.push({ ruta, estado });
  }
  return archivos;
}

export interface OpcionesPreparar {
  raiz: string;
  /** Usa HEAD y main locales en lugar de origin (solo para validar; R4). */
  local?: boolean;
}

export function prepararPaquete({ raiz, local = false }: OpcionesPreparar): Paquete {
  const rama = git(raiz, "branch", "--show-current").trim();
  const issue = ticketDeRama(rama);
  if (issue === undefined) {
    throw new SinSpec(`la rama "${rama || "(sin rama)"}" no es de ningún ticket (<N>-slug)`);
  }
  const spec = specDeTicket(raiz, issue);
  if (spec === undefined) {
    throw new SinSpec(`no hay spec en specs/ con "Issue de origen" #${issue}`);
  }

  const sha = git(raiz, "rev-parse", local ? "HEAD" : `origin/${rama}`).trim();
  const base = git(raiz, "merge-base", local ? "main" : "origin/main", sha).trim();
  const archivos = archivosDelDiff(git(raiz, "diff", "--name-status", "-M", base, sha));
  if (archivos.length === 0) {
    throw new DiffVacio(`la rama ${rama} no tiene cambios respecto de main`);
  }

  const paquete: Paquete = {
    issue,
    rama,
    sha,
    base,
    archivos,
    spec,
    constitucion: CONSTITUCION,
  };
  const carpeta = rutaPaquete(raiz, sha);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, "paquete.json"), `${JSON.stringify(paquete, null, 2)}\n`);
  writeFileSync(join(carpeta, "diff.patch"), git(raiz, "diff", "-M", base, sha));
  return paquete;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esPaquete(valor: unknown): valor is Paquete {
  return (
    esObjeto(valor) &&
    Number.isInteger(valor["issue"]) &&
    typeof valor["rama"] === "string" &&
    esSha(valor["sha"]) &&
    esSha(valor["base"]) &&
    Array.isArray(valor["archivos"]) &&
    valor["archivos"].every(
      (a) =>
        esObjeto(a) &&
        typeof a["ruta"] === "string" &&
        Object.values(ESTADOS).includes(a["estado"] as EstadoArchivo),
    ) &&
    typeof valor["spec"] === "string" &&
    typeof valor["constitucion"] === "string"
  );
}

export function leerPaquete(raiz: string, sha: string): Paquete {
  if (!esSha(sha)) throw new PaqueteInexistente(`"${sha}" no es un sha de 40 hexadecimales`);
  const archivo = join(rutaPaquete(raiz, sha), "paquete.json");
  if (!existsSync(archivo)) throw new PaqueteInexistente(`no hay paquete para ${sha}`);
  let valor: unknown;
  try {
    valor = JSON.parse(readFileSync(archivo, "utf8"));
  } catch (error) {
    throw new PaqueteInexistente(`paquete.json de ${sha} no es JSON`, { cause: error });
  }
  if (!esPaquete(valor) || valor.sha !== sha) {
    throw new PaqueteInexistente(`paquete.json de ${sha} no cumple el esquema`);
  }
  return valor;
}
