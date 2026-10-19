// Base del guardián PreToolUse: evalúa los controles que recibe y responde un solo "deny"
// con todos los motivos. Cualquier error se responde con "deny": el guardián falla cerrado.

import { normalizarAccion, type Accion } from "./lib/accion.ts";
import { componerMensaje, type Bloqueo } from "./lib/bloqueo.ts";
import { ConfiguracionInvalida } from "./lib/config-equipo.ts";

export interface ContextoBase {
  /** Raíz del repositorio (CLAUDE_PROJECT_DIR). */
  raiz: string;
}

export type ControlGuardian<C extends ContextoBase = ContextoBase> = (
  accion: Accion,
  contexto: C,
) => Bloqueo[];

/** Una configuración inválida del equipo se informa con su propio motivo, ya legible. */
function configuracionInvalida(causa: ConfiguracionInvalida): Bloqueo {
  return {
    control: "configuracion",
    detectado: causa.message,
    regla: "La configuración del equipo debe ser válida para que los controles se apliquen.",
    correccion: "Corrige la configuración; la acción no se ejecutó.",
  };
}

export function errorInterno(causa: unknown): Bloqueo {
  if (causa instanceof ConfiguracionInvalida) return configuracionInvalida(causa);
  const detalle = causa instanceof Error ? `${causa.name}: ${causa.message}` : String(causa);
  return {
    control: "error-interno",
    detectado: detalle,
    regla: "El guardián falla cerrado: ante un error no se deja pasar la acción.",
    correccion: "Informa a quien mantiene el repositorio; la acción no se ejecutó.",
  };
}

/** Evalúa una entrada ya parseada. Nunca lanza: un error se convierte en bloqueo. */
export function evaluar<C extends ContextoBase>(
  entrada: unknown,
  controles: readonly ControlGuardian<C>[],
  contexto: C,
): Bloqueo[] {
  try {
    const accion = normalizarAccion(entrada, contexto.raiz);
    return controles.flatMap((control) => control(accion, contexto));
  } catch (error) {
    return [errorInterno(error)];
  }
}

export function respuestaDeny(bloqueos: readonly Bloqueo[], orden?: readonly string[]): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: componerMensaje(bloqueos, orden),
    },
  });
}

async function leerStdin(): Promise<string> {
  let texto = "";
  process.stdin.setEncoding("utf8");
  for await (const fragmento of process.stdin) texto += String(fragmento);
  // PowerShell antepone un BOM al pasar texto por tubería.
  return texto.replace(/^﻿/, "");
}

function raizDeEntrada(entrada: unknown): string {
  const cwd =
    typeof entrada === "object" &&
    entrada !== null &&
    "cwd" in entrada &&
    typeof entrada.cwd === "string"
      ? entrada.cwd
      : process.cwd();
  return process.env["CLAUDE_PROJECT_DIR"] ?? cwd;
}

/** Lee la entrada del hook, evalúa los controles e imprime el "deny" si hay motivos. */
export async function ejecutar<C extends ContextoBase>(
  controles: readonly ControlGuardian<C>[],
  crearContexto: (raiz: string) => C,
  orden?: readonly string[],
): Promise<void> {
  let bloqueos: Bloqueo[];
  try {
    const entrada: unknown = JSON.parse(await leerStdin());
    bloqueos = evaluar(entrada, controles, crearContexto(raizDeEntrada(entrada)));
  } catch (error) {
    bloqueos = [errorInterno(error)];
  }
  if (bloqueos.length > 0) process.stdout.write(respuestaDeny(bloqueos, orden));
}
