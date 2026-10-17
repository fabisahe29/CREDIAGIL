import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { datosReales } from "./datos-reales.ts";

// FR-018: los controles y sus pruebas no contienen datos con forma real escritos literal.
// Si los tuvieran, el propio guardián bloquearía su edición.

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));

function archivos(carpeta: string, extension: string): string[] {
  return readdirSync(join(RAIZ, carpeta), { recursive: true, encoding: "utf8" })
    .filter((ruta) => ruta.endsWith(extension))
    .map((ruta) => join(carpeta, ruta));
}

const REVISADOS = [
  ...archivos(".claude/hooks", ".ts"),
  ...archivos(".claude/revision", ".ts"),
  ...archivos(".claude/agents", ".md"),
  ".claude/skills/revisar-codigo/SKILL.md",
  ".claude/skills/revisar-cumplimiento/SKILL.md",
  ".claude/skills/ticket-abrir-pr/SKILL.md",
  ...archivos("specs/003-guardarrailes-hooks", ".md"),
  ...archivos("specs/004-revision-independiente-pr", ".md"),
  ...archivos("src", ".ts"),
  ...archivos("specs/005-esqueleto-agente-mcp", ".md"),
  ...archivos("specs/006-interfaz-chat", ".md"),
  ...archivos("casos", ".md"),
  ...archivos("casos", ".json"),
  "README.md",
  ...archivos(".claude/rules", ".md"),
  "docs/datos-ficticios.md",
  "DECISIONES.md",
];

describe("el código del ticket no contiene datos con forma real", () => {
  for (const archivo of REVISADOS) {
    const ruta = relative(RAIZ, join(RAIZ, archivo)).replace(/\\/g, "/");
    it(`sin bloqueos al escribir ${ruta}`, () => {
      const texto = readFileSync(join(RAIZ, archivo), "utf8");
      const bloqueos = datosReales({
        herramienta: "Write",
        rutas: [ruta],
        textos: [{ origen: ruta, texto }],
      });
      assert.deepEqual(
        bloqueos.map((b) => b.detectado),
        [],
      );
    });
  }
});
