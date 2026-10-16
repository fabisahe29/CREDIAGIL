// Hook SubagentStop de los revisores (contracts/informe.md, "Respuesta del hook SubagentStop"; R5).
// Captura el informe tal como lo produjo el revisor y lo valida en código: la sesión principal
// no lo copia a mano. Nunca guarda un informe sin validar.

import { fileURLToPath } from "node:url";
import { guardarFallo, guardarInforme } from "./lib/almacen.ts";
import { extraerBloqueJson, validarInforme, type TipoRevision } from "./lib/informe.ts";
import { esSha, leerPaquete } from "./lib/paquete.ts";

export const REVISORES: Readonly<Record<string, TipoRevision>> = {
  "revisor-codigo": "codigo",
  "revisor-cumplimiento": "cumplimiento",
};

export interface Respuesta {
  codigo: 0 | 2;
  /** Motivo para el revisor cuando se le pide corregir (código 2). */
  mensaje?: string;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function causaDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Decide la respuesta del hook para una entrada ya parseada. */
export function capturar(entrada: unknown, raiz: string): Respuesta {
  if (!esObjeto(entrada)) return { codigo: 0 };
  const tipo = REVISORES[String(entrada["agent_type"])];
  if (tipo === undefined) return { codigo: 0 };
  const puedeCorregir = entrada["stop_hook_active"] !== true;
  const mensaje = entrada["last_assistant_message"];

  let valor: unknown;
  try {
    valor = extraerBloqueJson(typeof mensaje === "string" ? mensaje : "");
  } catch (error) {
    // Sin bloque JSON no hay sha conocido: si no puede corregir, la revisión queda sin informe
    // y decidir la trata como fallida.
    return puedeCorregir
      ? { codigo: 2, mensaje: `Informe inválido. ${causaDe(error)}` }
      : { codigo: 0 };
  }

  const sha = esObjeto(valor) ? valor["sha"] : undefined;
  if (!esSha(sha)) {
    return puedeCorregir
      ? {
          codigo: 2,
          mensaje: "Informe inválido. V2: falta el sha de 40 hexadecimales del paquete.",
        }
      : { codigo: 0 };
  }

  try {
    const paquete = leerPaquete(raiz, sha);
    const resultado = validarInforme(tipo, valor, paquete);
    if (resultado.valido) {
      guardarInforme(raiz, resultado.informe);
      return { codigo: 0 };
    }
    if (puedeCorregir) {
      return {
        codigo: 2,
        mensaje: `Informe inválido. Corrige y vuelve a terminar con un único bloque json:\n- ${resultado.errores.join("\n- ")}`,
      };
    }
    guardarFallo(raiz, sha, tipo, "informe inválido tras la corrección", resultado.errores);
    return { codigo: 0 };
  } catch (error) {
    guardarFallo(raiz, sha, tipo, `no se pudo validar el informe: ${causaDe(error)}`);
    return { codigo: 0 };
  }
}

async function leerStdin(): Promise<string> {
  let texto = "";
  process.stdin.setEncoding("utf8");
  for await (const fragmento of process.stdin) texto += String(fragmento);
  return texto.replace(/^﻿/, "");
}

async function principal(): Promise<void> {
  let entrada: unknown;
  try {
    entrada = JSON.parse(await leerStdin());
  } catch {
    return; // falla cerrado: sin informe guardado, la revisión cuenta como fallida
  }
  const cwd = esObjeto(entrada) && typeof entrada["cwd"] === "string" ? entrada["cwd"] : ".";
  const raiz = process.env["CLAUDE_PROJECT_DIR"] ?? cwd;
  const respuesta = capturar(entrada, raiz);
  if (respuesta.mensaje !== undefined) process.stderr.write(respuesta.mensaje);
  process.exitCode = respuesta.codigo;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await principal();
}
