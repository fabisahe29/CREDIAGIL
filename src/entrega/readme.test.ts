import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { detectarSecretos } from "./contenido.ts";

const README = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

const seccion = (titulo: string): string => {
  const inicio = README.indexOf(`## ${titulo}`);
  assert.notEqual(inicio, -1, `falta la sección «${titulo}»`);
  const siguiente = README.indexOf("\n## ", inicio + 1);
  return README.slice(inicio, siguiente === -1 ? undefined : siguiente);
};

describe("README de la entrega", () => {
  it("tiene «Inicio rápido» antes de «Requisitos»", () => {
    assert.ok(README.indexOf("## Inicio rápido") < README.indexOf("## Requisitos"));
  });

  it("el inicio rápido trae los tres comandos que no necesitan credenciales", () => {
    const inicio = seccion("Inicio rápido");
    for (const comando of ["npm install", "npm test", "npm run casos"]) {
      assert.ok(inicio.includes(comando), `falta ${comando}`);
    }
  });

  it("el inicio rápido dice qué exige credenciales", () => {
    const inicio = seccion("Inicio rápido");
    assert.match(inicio, /sin credenciales/i);
    assert.ok(inicio.includes("ANTHROPIC_API_KEY"));
    assert.ok(inicio.includes("npm run chat"));
  });

  it("enlaza el GitHub Project y el video una sola vez cada uno, en el inicio rápido", () => {
    const inicio = seccion("Inicio rápido");
    assert.ok(inicio.includes("https://github.com/users/fabisahe29/projects/1"));
    assert.match(inicio, /\(https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view[^)]*\)/);
    assert.equal(README.match(/drive\.google\.com/g)?.length, 1);
  });

  it("enlaza el resumen de decisiones y su registro detallado", () => {
    assert.ok(README.includes("](DECISIONES.md)"));
    assert.ok(README.includes("](docs/registro-decisiones.md)"));
  });

  it("no contiene ningún valor con forma de secreto", () => {
    assert.deepEqual(detectarSecretos(README), []);
  });
});
