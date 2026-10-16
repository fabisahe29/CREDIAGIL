// Guardián PreToolUse (contracts/hooks.md; research.md, R2 y R5).
// Ejecuta todos los controles que aplican y responde un solo "deny" con todos los motivos.
// Cualquier error se responde con "deny": el guardián falla cerrado (FR-015).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizarAccion, type Accion } from "./lib/accion.ts";
import { componerMensaje, type Bloqueo } from "./lib/bloqueo.ts";
import { datosReales } from "./lib/datos-reales.ts";
import { secretos } from "./lib/secretos.ts";
import { puertaPr } from "./lib/puerta-pr.ts";
import { revisores } from "./lib/revisores.ts";
import { specPrimero } from "./lib/spec-primero.ts";

export interface Contexto {
  /** Raíz del repositorio (CLAUDE_PROJECT_DIR). */
  raiz: string;
  /** Rama actual; inyectable en las pruebas. Cadena vacía si no se puede leer. */
  obtenerRama: () => string;
  /** sha de origin/<rama>; lanza si no se puede leer (puerta-pr falla cerrado). */
  obtenerHeadRemoto: (rama: string) => string;
}

export type ControlGuardian = (accion: Accion, contexto: Contexto) => Bloqueo[];

export const CONTROLES: ControlGuardian[] = [
  secretos,
  datosReales,
  specPrimero,
  revisores,
  puertaPr,
];

function errorInterno(causa: unknown): Bloqueo {
  const detalle = causa instanceof Error ? `${causa.name}: ${causa.message}` : String(causa);
  return {
    control: "error-interno",
    detectado: detalle,
    regla: "FR-015 · constitución, Principio VI",
    correccion: "Informa al desarrollador; la acción no se ejecutó.",
  };
}

/** Evalúa una entrada ya parseada. Nunca lanza: un error se convierte en bloqueo. */
export function evaluar(entrada: unknown, contexto: Contexto): Bloqueo[] {
  try {
    const accion = normalizarAccion(entrada, contexto.raiz);
    return CONTROLES.flatMap((control) => control(accion, contexto));
  } catch (error) {
    return [errorInterno(error)];
  }
}

export function respuestaDeny(bloqueos: readonly Bloqueo[]): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: componerMensaje(bloqueos),
    },
  });
}

function ramaActual(raiz: string): string {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function headRemoto(raiz: string, rama: string): string {
  return execFileSync("git", ["rev-parse", "--verify", `origin/${rama}`], {
    cwd: raiz,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function leerStdin(): Promise<string> {
  let texto = "";
  process.stdin.setEncoding("utf8");
  for await (const fragmento of process.stdin) texto += String(fragmento);
  // PowerShell antepone un BOM al pasar texto por tubería.
  return texto.replace(/^﻿/, "");
}

async function principal(): Promise<void> {
  let bloqueos: Bloqueo[];
  try {
    const entrada: unknown = JSON.parse(await leerStdin());
    const cwd =
      typeof entrada === "object" &&
      entrada !== null &&
      "cwd" in entrada &&
      typeof entrada.cwd === "string"
        ? entrada.cwd
        : process.cwd();
    const raiz = process.env["CLAUDE_PROJECT_DIR"] ?? cwd;
    bloqueos = evaluar(entrada, {
      raiz,
      obtenerRama: () => ramaActual(raiz),
      obtenerHeadRemoto: (rama) => headRemoto(raiz, rama),
    });
  } catch (error) {
    bloqueos = [errorInterno(error)];
  }
  if (bloqueos.length > 0) process.stdout.write(respuestaDeny(bloqueos));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await principal();
}
