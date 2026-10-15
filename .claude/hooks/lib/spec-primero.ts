// Control spec-primero (FR-008 a FR-010; aclaraciones Q1 y Q3; research.md, R7).
// Escribir bajo src/ exige una spec cuyo "Issue de origen" sea el ticket de la rama actual.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Accion } from "./accion.ts";
import type { Bloqueo } from "./bloqueo.ts";
import { analizarComando, nombreComando, rutaDeArgumento } from "./shell.ts";

interface ContextoSpec {
  raiz: string;
  obtenerRama: () => string;
}

const HERRAMIENTAS_ESCRITURA = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const REDIRECCIONES = new Set([">", ">>"]);
const COPIAS = new Set(["cp", "mv", "copy-item", "cpi", "copy", "move-item", "mi", "move"]);
const ESCRITURAS_PS = new Set([
  "set-content",
  "sc",
  "add-content",
  "ac",
  "out-file",
  "new-item",
  "ni",
]);

export function esCodigoDeProduccion(ruta: string): boolean {
  const normalizada = rutaDeArgumento(ruta);
  return normalizada === "src" || normalizada.startsWith("src/");
}

/** Número del ticket de la rama (`<N>-slug`, sin ceros a la izquierda), o undefined. */
export function ticketDeRama(rama: string): number | undefined {
  const coincidencia = /^([1-9]\d*)-/.exec(rama);
  return coincidencia ? Number(coincidencia[1]) : undefined;
}

/** Verdadero si alguna specs/<carpeta>/spec.md declara el ticket como su issue de origen. */
export function existeSpec(raiz: string, ticket: number): boolean {
  const prefijo = `**Issue de origen**: [fabisahe29/CREDIAGIL#${ticket} `;
  let carpetas: string[];
  try {
    carpetas = readdirSync(join(raiz, "specs"));
  } catch {
    return false;
  }
  return carpetas.some((carpeta) => {
    try {
      const spec = readFileSync(join(raiz, "specs", carpeta, "spec.md"), "utf8");
      return spec.split(/\r?\n/).some((linea) => linea.startsWith(prefijo));
    } catch {
      return false;
    }
  });
}

/** Destinos de escritura de un comando de shell. */
function destinosDeShell(comando: string): string[] {
  const destinos: string[] = [];
  for (const tuberia of analizarComando(comando)) {
    for (const palabras of tuberia) {
      const programa = nombreComando(palabras[0]!);
      palabras.forEach((palabra, i) => {
        if (REDIRECCIONES.has(palabra) && palabras[i + 1] !== undefined)
          destinos.push(palabras[i + 1]!);
      });
      const argumentos = palabras
        .slice(1)
        .filter((p) => !p.startsWith("-") && !REDIRECCIONES.has(p));
      if (programa === "tee") {
        destinos.push(...argumentos);
      } else if (COPIAS.has(programa)) {
        const destino = palabras.findIndex((p) => p.toLowerCase() === "-destination");
        const valor = destino >= 0 ? palabras[destino + 1] : argumentos.at(-1);
        if (valor !== undefined) destinos.push(valor);
      } else if (ESCRITURAS_PS.has(programa)) {
        const opcion = palabras.findIndex((p) =>
          ["-path", "-filepath", "-literalpath"].includes(p.toLowerCase()),
        );
        const valor = opcion >= 0 ? palabras[opcion + 1] : argumentos[0];
        if (valor !== undefined) destinos.push(valor);
      }
    }
  }
  return destinos;
}

export function specPrimero(accion: Accion, contexto: ContextoSpec): Bloqueo[] {
  let destinos: string[] = [];
  if (accion.comando !== undefined) destinos = destinosDeShell(accion.comando);
  else if (HERRAMIENTAS_ESCRITURA.has(accion.herramienta)) destinos = accion.rutas;
  const enSrc = destinos.map(rutaDeArgumento).filter(esCodigoDeProduccion);
  if (enSrc.length === 0) return [];

  const rama = contexto.obtenerRama();
  const ticket = ticketDeRama(rama);
  const lugar = enSrc.join(", ");

  if (ticket === undefined) {
    return [
      {
        control: "spec-primero",
        detectado: `escritura en ${lugar} desde la rama "${rama || "(desconocida)"}", que no es de ningún ticket`,
        regla: "FR-008 · FR-010 · flujo Spec Kit",
        correccion: "Toma el ticket con /ticket-tomar y trabaja en su rama <N>-slug.",
      },
    ];
  }
  if (!existeSpec(contexto.raiz, ticket)) {
    return [
      {
        control: "spec-primero",
        detectado: `escritura en ${lugar} en la rama ${rama}: no hay spec en specs/ con "Issue de origen" #${ticket}`,
        regla: "FR-008 · FR-010 · flujo Spec Kit",
        correccion: `Ejecuta /speckit-specify para el #${ticket} antes de escribir en src/. Si la spec ya existe, agrégale la línea "**Issue de origen**: [fabisahe29/CREDIAGIL#${ticket} — …](…)".`,
      },
    ];
  }
  return [];
}
