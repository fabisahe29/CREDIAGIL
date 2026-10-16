// Control puerta-pr (contracts/revisores.md, "Controles nuevos del guardián"; FR-008, FR-009; R9).
// No se crea un PR sin una decisión favorable de las revisiones para el head remoto de la rama,
// y la decisión no se escribe a mano. Lee un archivo local: sin red en el camino del bloqueo.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Accion } from "./accion.ts";
import type { Bloqueo } from "./bloqueo.ts";

export interface ContextoPuerta {
  raiz: string;
  /** sha de `origin/<rama>`; lanza si no se puede leer. */
  obtenerHeadRemoto: (rama: string) => string;
}

const CREAR_PR = "mcp__github__create_pull_request";
const COMENTAR = "mcp__github__add_issue_comment";
const EDITAR_COMENTARIO = "mcp__github__update_issue_comment";
const MARCADOR_REGISTRO = /<!-- crediagil:revision=(codigo|cumplimiento);commit=([0-9a-f]{40}) -->/;
const CORRECCION_REGISTRO =
  "Los registros de revisión los genera `revision.ts decidir`: publica tal cual el cuerpo que devuelve (/ticket-abrir-pr, paso R6) y no los edites.";

const ESCRITURA: ReadonlySet<string> = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const CARPETA = ".git/crediagil/";
const REGLA = "FR-008 · FR-009 (spec 004) · constitución, Principio IV";
const CORRECCION_PR =
  "Abre el PR con /ticket-abrir-pr: ejecuta las revisiones sobre el último commit publicado y solo crea el PR si la decisión lo permite.";

function bloqueo(detectado: string, correccion = CORRECCION_PR): Bloqueo {
  return { control: "puerta-pr", detectado, regla: REGLA, correccion };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Motivo por el que la decisión no habilita el PR, o undefined si lo habilita. */
function motivoDecision(valor: unknown, sha: string): string | undefined {
  if (!esObjeto(valor)) return "decision.json no es un objeto JSON";
  if (valor["sha"] !== sha) return `decision.json es de otro commit (${String(valor["sha"])})`;
  const revisiones = valor["revisiones"];
  if (
    !esObjeto(revisiones) ||
    revisiones["codigo"] !== "valida" ||
    revisiones["cumplimiento"] !== "valida"
  ) {
    return "alguna de las dos revisiones no es válida";
  }
  if (valor["permite"] !== true) {
    const motivos = Array.isArray(valor["motivos"]) ? valor["motivos"].map(String) : [];
    return `la decisión bloquea: ${motivos.join("; ") || "sin motivos registrados"}`;
  }
  return undefined;
}

function revisarCreacion(accion: Accion, contexto: ContextoPuerta): Bloqueo[] {
  const head = accion.parametros?.["head"];
  const rama = typeof head === "string" ? head.slice(head.indexOf(":") + 1) : "";
  if (rama === "") return [bloqueo("create_pull_request sin rama head")];

  let sha: string;
  try {
    sha = contexto.obtenerHeadRemoto(rama).trim();
  } catch (error) {
    const causa = error instanceof Error ? error.message : String(error);
    return [bloqueo(`no se pudo leer el head de origin/${rama}: ${causa}`)];
  }

  let valor: unknown;
  try {
    const archivo = join(contexto.raiz, ".git", "crediagil", "revisiones", sha, "decision.json");
    valor = JSON.parse(readFileSync(archivo, "utf8"));
  } catch {
    return [bloqueo(`no hay una decisión de revisión legible para ${rama} @ ${sha.slice(0, 7)}`)];
  }
  const motivo = motivoDecision(valor, sha);
  return motivo === undefined ? [] : [bloqueo(`PR de ${rama} @ ${sha.slice(0, 7)}: ${motivo}`)];
}

function normalizarCuerpo(texto: string): string {
  return texto.replace(/\r\n/g, "\n").trim();
}

/**
 * Un registro de revisión en el issue solo puede ser el que generó `revision.ts decidir`
 * (registro-<tipo>.md del paquete): si no, `reutilizar` aceptaría un informe inventado.
 */
function revisarRegistro(accion: Accion, contexto: ContextoPuerta): Bloqueo[] {
  const cuerpo = accion.parametros?.["body"];
  if (typeof cuerpo !== "string") return [];
  const marca = MARCADOR_REGISTRO.exec(cuerpo);
  if (marca === null) return [];
  const tipo = marca[1]!;
  const sha = marca[2]!;
  const quien = `registro de ${tipo} @ ${sha.slice(0, 7)}`;
  if (accion.herramienta === EDITAR_COMENTARIO) {
    return [bloqueo(`edición del ${quien}`, CORRECCION_REGISTRO)];
  }
  let esperado: string;
  try {
    const archivo = join(
      contexto.raiz,
      ".git",
      "crediagil",
      "revisiones",
      sha,
      `registro-${tipo}.md`,
    );
    esperado = readFileSync(archivo, "utf8");
  } catch {
    return [
      bloqueo(`${quien} sin registro-${tipo}.md generado por revision.ts`, CORRECCION_REGISTRO),
    ];
  }
  return normalizarCuerpo(cuerpo) === normalizarCuerpo(esperado)
    ? []
    : [bloqueo(`el ${quien} no coincide con el que generó revision.ts`, CORRECCION_REGISTRO)];
}

export function puertaPr(accion: Accion, contexto: ContextoPuerta): Bloqueo[] {
  if (accion.herramienta === CREAR_PR) return revisarCreacion(accion, contexto);
  if (accion.herramienta === COMENTAR || accion.herramienta === EDITAR_COMENTARIO) {
    return revisarRegistro(accion, contexto);
  }
  if (!ESCRITURA.has(accion.herramienta)) return [];
  // Sin distinguir mayúsculas: en Windows `.GIT/Crediagil/` es la misma carpeta.
  const protegidas = accion.rutas.filter((ruta) => `${ruta}/`.toLowerCase().startsWith(CARPETA));
  if (protegidas.length === 0) return [];
  return [
    bloqueo(
      `${accion.herramienta} sobre ${protegidas.join(", ")}`,
      "El paquete, los informes y la decisión los escriben solo revision.ts y capturar.ts; no se editan a mano.",
    ),
  ];
}
