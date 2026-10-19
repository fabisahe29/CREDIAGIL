// Guardián PreToolUse de este repositorio (contracts/hooks.md; research.md, R2 y R5).
// Usa la base común y suma los controles propios del flujo: spec-primero y puerta-pr.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ejecutar, type ContextoBase, type ControlGuardian } from "./guardian-base.ts";
import { datosReales } from "./lib/datos-reales.ts";
import { secretos } from "./lib/secretos.ts";
import { proteccionConfig } from "./lib/proteccion-config.ts";
import { puertaPr } from "./lib/puerta-pr.ts";
import { revisores } from "./lib/revisores.ts";
import { specPrimero } from "./lib/spec-primero.ts";

export interface Contexto extends ContextoBase {
  /** Rama actual; inyectable en las pruebas. Cadena vacía si no se puede leer. */
  obtenerRama: () => string;
  /** sha de origin/<rama>; lanza si no se puede leer (puerta-pr falla cerrado). */
  obtenerHeadRemoto: (rama: string) => string;
}

export const CONTROLES: ControlGuardian<Contexto>[] = [
  secretos,
  datosReales,
  proteccionConfig,
  specPrimero,
  revisores,
  puertaPr,
];

export const ORDEN: readonly string[] = [
  "secretos",
  "datos-reales",
  "configuracion-protegida",
  "spec-primero",
  "revisores",
  "puerta-pr",
];

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await ejecutar(
    CONTROLES,
    (raiz) => ({
      raiz,
      obtenerRama: () => ramaActual(raiz),
      obtenerHeadRemoto: (rama) => headRemoto(raiz, rama),
    }),
    ORDEN,
  );
}
