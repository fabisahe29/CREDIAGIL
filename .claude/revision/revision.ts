// CLI de la revisión (research.md, R4, R6 y R7; contracts/ticket-abrir-pr.md, pasos R2, R3 y R5).
// Lo ejecuta /ticket-abrir-pr: node .claude/revision/revision.ts <subcomando> [argumentos]
// Imprime JSON por stdout. Códigos de salida: 0 bien, 1 error legible por stderr,
// 3 (solo reutilizar) los registros no sirven y hay que revisar de nuevo.

import { fileURLToPath } from "node:url";
import { TIPOS, guardarDecision, guardarInforme, leerEntradas } from "./lib/almacen.ts";
import { decidir, type Decision, type Entradas } from "./lib/decision.ts";
import { validarInforme, type TipoRevision } from "./lib/informe.ts";
import { leerPaquete, prepararPaquete, PaqueteInexistente, type Paquete } from "./lib/paquete.ts";
import { parsearComentario, renderComentario } from "./lib/registro.ts";

export interface Salida {
  codigo: number;
  stdout?: string;
  stderr?: string;
}

const USO =
  "uso: revision.ts preparar [--local] | decidir <sha> | reutilizar <sha> (cuerpos por stdin)";

function json(valor: unknown): string {
  return `${JSON.stringify(valor, null, 2)}\n`;
}

function causaDe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Decide, guarda decision.json y devuelve la decisión con los cuerpos de los dos registros. */
function decidirYRegistrar(
  raiz: string,
  paquete: Paquete,
  entradas: Entradas,
): Decision & { comentarios: Record<TipoRevision, string> } {
  const decision = decidir(paquete.sha, entradas);
  guardarDecision(raiz, paquete.sha, decision);
  const comentarios = {} as Record<TipoRevision, string>;
  for (const tipo of TIPOS) {
    const informe = entradas[tipo];
    const fallo = entradas.fallos?.[tipo];
    comentarios[tipo] = renderComentario({
      tipo,
      sha: paquete.sha,
      fecha: hoy(),
      ...(informe !== undefined ? { informe } : {}),
      ...(fallo !== undefined ? { fallo } : {}),
    });
  }
  return { ...decision, comentarios };
}

/** Paquete del sha: el local, o uno nuevo si el head remoto sigue siendo ese sha. */
function paqueteDe(raiz: string, sha: string): Paquete {
  try {
    return leerPaquete(raiz, sha);
  } catch (error) {
    if (!(error instanceof PaqueteInexistente)) throw error;
    const paquete = prepararPaquete({ raiz });
    if (paquete.sha !== sha) {
      throw new PaqueteInexistente(`el head remoto (${paquete.sha}) ya no es ${sha}`);
    }
    return paquete;
  }
}

/** Reconstruye y revalida los informes desde los cuerpos de los registros del issue (R7, FR-009). */
function reutilizar(raiz: string, sha: string, stdin: string): Salida {
  let cuerpos: unknown;
  try {
    cuerpos = JSON.parse(stdin);
  } catch {
    return {
      codigo: 1,
      stderr: 'stdin debe ser {"codigo": "<cuerpo>", "cumplimiento": "<cuerpo>"}\n',
    };
  }
  const paquete = paqueteDe(raiz, sha);
  const errores: string[] = [];
  const informes = [];
  for (const tipo of TIPOS) {
    const cuerpo = (cuerpos as Record<string, unknown> | null)?.[tipo];
    const registro = typeof cuerpo === "string" ? parsearComentario(cuerpo) : null;
    if (registro === null || registro.tipo !== tipo || registro.sha !== sha) {
      errores.push(`${tipo}: no hay un registro con informe para ${sha}`);
      continue;
    }
    const resultado = validarInforme(tipo, registro.informe, paquete);
    if (resultado.valido) informes.push(resultado.informe);
    else errores.push(`${tipo}: ${resultado.errores.join("; ")}`);
  }
  if (errores.length > 0) {
    return { codigo: 3, stderr: `Revisar de nuevo:\n- ${errores.join("\n- ")}\n` };
  }
  for (const informe of informes) guardarInforme(raiz, informe);
  const { comentarios: _, ...decision } = decidirYRegistrar(
    raiz,
    paquete,
    leerEntradas(raiz, paquete),
  );
  return { codigo: 0, stdout: json({ ...decision, reutilizada: true }) };
}

export function ejecutar(argumentos: string[], raiz: string, stdin = ""): Salida {
  const [subcomando, ...resto] = argumentos;
  try {
    if (subcomando === "preparar") {
      const paquete = prepararPaquete({ raiz, local: resto.includes("--local") });
      return { codigo: 0, stdout: json({ sha: paquete.sha, paquete }) };
    }
    if (subcomando === "decidir") {
      const paquete = leerPaquete(raiz, resto[0] ?? "");
      return {
        codigo: 0,
        stdout: json(decidirYRegistrar(raiz, paquete, leerEntradas(raiz, paquete))),
      };
    }
    if (subcomando === "reutilizar") return reutilizar(raiz, resto[0] ?? "", stdin);
    return { codigo: 1, stderr: `${USO}\n` };
  } catch (error) {
    return { codigo: 1, stderr: `${causaDe(error)}\n` };
  }
}

async function leerStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let texto = "";
  process.stdin.setEncoding("utf8");
  for await (const fragmento of process.stdin) texto += String(fragmento);
  return texto.replace(/^﻿/, "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raiz = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const argumentos = process.argv.slice(2);
  const stdin = argumentos[0] === "reutilizar" ? await leerStdin() : "";
  const salida = ejecutar(argumentos, raiz, stdin);
  if (salida.stdout !== undefined) process.stdout.write(salida.stdout);
  if (salida.stderr !== undefined) process.stderr.write(salida.stderr);
  process.exitCode = salida.codigo;
}
