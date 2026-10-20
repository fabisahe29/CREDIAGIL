// Completitud de los artefactos de Spec Kit (specs/017-paquete-de-entrega: research.md, R6).
// Cada carpeta de `specs/` necesita spec, plan, tareas y la línea «Issue de origen»; la constitución
// debe existir. La numeración puede tener huecos (la 016 es de un ticket aún en revisión).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hallazgo } from "./tipos.ts";

const ARCHIVOS_OBLIGATORIOS = ["spec.md", "plan.md", "tasks.md"] as const;
const LINEA_ISSUE_DE_ORIGEN = /^\*\*Issue de origen\*\*:/m;
const CONSTITUCION = ".specify/memory/constitution.md";

export function verificarSpecs(raiz: string): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];

  if (!existsSync(join(raiz, CONSTITUCION))) {
    hallazgos.push({
      tipo: "spec-incompleta",
      ubicacion: CONSTITUCION,
      detalle: "falta la constitución en .specify/memory/",
    });
  }

  const carpetaSpecs = join(raiz, "specs");
  if (!existsSync(carpetaSpecs)) {
    return [
      ...hallazgos,
      { tipo: "spec-incompleta", ubicacion: "specs/", detalle: "falta la carpeta specs/" },
    ];
  }

  const carpetas = readdirSync(carpetaSpecs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const carpeta of carpetas) {
    const ubicacion = `specs/${carpeta}`;
    for (const archivo of ARCHIVOS_OBLIGATORIOS) {
      if (!existsSync(join(carpetaSpecs, carpeta, archivo))) {
        hallazgos.push({
          tipo: "spec-incompleta",
          ubicacion: `${ubicacion}/${archivo}`,
          detalle: `falta ${archivo}`,
        });
      }
    }
    const rutaSpec = join(carpetaSpecs, carpeta, "spec.md");
    if (existsSync(rutaSpec) && !LINEA_ISSUE_DE_ORIGEN.test(readFileSync(rutaSpec, "utf8"))) {
      hallazgos.push({
        tipo: "spec-incompleta",
        ubicacion: `${ubicacion}/spec.md`,
        detalle: "falta la línea «Issue de origen»",
      });
    }
  }
  return hallazgos;
}
