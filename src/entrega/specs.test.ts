import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { verificarSpecs } from "./specs.ts";

let raiz = "";

function escribir(ruta: string, texto: string) {
  mkdirSync(dirname(join(raiz, ruta)), { recursive: true });
  writeFileSync(join(raiz, ruta), texto);
}

const SPEC =
  "# Spec\n\n**Issue de origen**: [fabisahe29/CREDIAGIL#1 — Ejemplo](https://github.example/1)\n";

function carpetaCompleta(nombre: string) {
  escribir(`specs/${nombre}/spec.md`, SPEC);
  escribir(`specs/${nombre}/plan.md`, "# Plan\n");
  escribir(`specs/${nombre}/tasks.md`, "# Tareas\n");
}

describe("completitud de los artefactos de Spec Kit", () => {
  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), "crediagil-specs-"));
    escribir(".specify/memory/constitution.md", "# Constitución\n");
  });
  afterEach(() => rmSync(raiz, { recursive: true, force: true }));

  it("no da hallazgos con una carpeta completa", () => {
    carpetaCompleta("001-primera");
    assert.deepEqual(verificarSpecs(raiz), []);
  });

  it("reporta la carpeta y el archivo si falta tasks.md", () => {
    carpetaCompleta("001-primera");
    escribir("specs/002-segunda/spec.md", SPEC);
    escribir("specs/002-segunda/plan.md", "# Plan\n");
    assert.deepEqual(verificarSpecs(raiz), [
      {
        tipo: "spec-incompleta",
        ubicacion: "specs/002-segunda/tasks.md",
        detalle: "falta tasks.md",
      },
    ]);
  });

  it("reporta una spec sin la línea de issue de origen", () => {
    carpetaCompleta("001-primera");
    escribir("specs/001-primera/spec.md", "# Spec sin cabecera\n");
    const hallazgos = verificarSpecs(raiz);
    assert.equal(hallazgos.length, 1);
    assert.equal(hallazgos[0]!.ubicacion, "specs/001-primera/spec.md");
  });

  it("reporta la falta de la constitución", () => {
    rmSync(join(raiz, ".specify"), { recursive: true });
    carpetaCompleta("001-primera");
    const hallazgos = verificarSpecs(raiz);
    assert.equal(hallazgos.length, 1);
    assert.equal(hallazgos[0]!.ubicacion, ".specify/memory/constitution.md");
  });

  it("admite una numeración con huecos", () => {
    carpetaCompleta("001-a");
    carpetaCompleta("002-b");
    carpetaCompleta("004-d");
    assert.deepEqual(verificarSpecs(raiz), []);
  });

  it("reporta que falta la carpeta specs/", () => {
    const hallazgos = verificarSpecs(raiz);
    assert.deepEqual(
      hallazgos.map((h) => h.ubicacion),
      ["specs/"],
    );
  });
});
