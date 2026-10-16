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

export function puertaPr(accion: Accion, contexto: ContextoPuerta): Bloqueo[] {
  if (accion.herramienta === CREAR_PR) return revisarCreacion(accion, contexto);
  if (!ESCRITURA.has(accion.herramienta)) return [];
  const protegidas = accion.rutas.filter((ruta) => `${ruta}/`.startsWith(CARPETA));
  if (protegidas.length === 0) return [];
  return [
    bloqueo(
      `${accion.herramienta} sobre ${protegidas.join(", ")}`,
      "El paquete, los informes y la decisión los escriben solo revision.ts y capturar.ts; no se editan a mano.",
    ),
  ];
}
