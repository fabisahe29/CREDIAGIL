import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { commitEnRama, crearRepositorio } from "./fixtures.ts";
import {
  DiffVacio,
  PaqueteInexistente,
  SinSpec,
  leerPaquete,
  prepararPaquete,
  rutaPaquete,
} from "./paquete.ts";

describe("paquete de revisión", () => {
  const raices: string[] = [];
  after(() => raices.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it("rutaPaquete está bajo .git/crediagil/revisiones/<sha>", () => {
    const sha = "a".repeat(40);
    assert.equal(
      rutaPaquete("/repo", sha).replace(/\\/g, "/"),
      `/repo/.git/crediagil/revisiones/${sha}`,
    );
  });

  it("prepara el paquete local con los campos del modelo y el diff", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    commitEnRama(raiz);
    const paquete = prepararPaquete({ raiz, local: true });

    assert.equal(paquete.issue, 6);
    assert.equal(paquete.rama, "6-prueba");
    assert.match(paquete.sha, /^[0-9a-f]{40}$/);
    assert.match(paquete.base, /^[0-9a-f]{40}$/);
    assert.notEqual(paquete.sha, paquete.base);
    assert.deepEqual(
      [...paquete.archivos].sort((a, b) => a.ruta.localeCompare(b.ruta)),
      [
        { ruta: "borrar.ts", estado: "eliminado" },
        { ruta: "nuevo.ts", estado: "agregado" },
        { ruta: "viejo.ts", estado: "modificado" },
      ],
    );
    assert.equal(paquete.spec, "specs/004-x/spec.md");
    assert.equal(paquete.constitucion, ".specify/memory/constitution.md");

    const carpeta = rutaPaquete(raiz, paquete.sha);
    assert.deepEqual(JSON.parse(readFileSync(join(carpeta, "paquete.json"), "utf8")), paquete);
    const diff = readFileSync(join(carpeta, "diff.patch"), "utf8");
    assert.match(diff, /nuevo\.ts/);
    assert.match(diff, /export const a = 10;/);
  });

  it("leerPaquete devuelve lo que escribió prepararPaquete", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    commitEnRama(raiz);
    const paquete = prepararPaquete({ raiz, local: true });
    assert.deepEqual(leerPaquete(raiz, paquete.sha), paquete);
  });

  it("sin cambios respecto de main lanza DiffVacio y no crea el paquete", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    assert.throws(() => prepararPaquete({ raiz, local: true }), DiffVacio);
    assert.equal(existsSync(join(raiz, ".git", "crediagil")), false);
  });

  it("sin spec con Issue de origen del ticket lanza SinSpec", () => {
    const raiz = crearRepositorio("7-otro");
    raices.push(raiz);
    commitEnRama(raiz);
    assert.throws(() => prepararPaquete({ raiz, local: true }), SinSpec);
  });

  it("en una rama sin número de ticket lanza SinSpec", () => {
    const raiz = crearRepositorio("experimento");
    raices.push(raiz);
    commitEnRama(raiz);
    assert.throws(() => prepararPaquete({ raiz, local: true }), SinSpec);
  });

  it("leerPaquete de un sha sin paquete lanza PaqueteInexistente", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    assert.throws(() => leerPaquete(raiz, "b".repeat(40)), PaqueteInexistente);
  });

  it("leerPaquete rechaza un sha que no son 40 hexadecimales", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    assert.throws(() => leerPaquete(raiz, "../../fuera"), PaqueteInexistente);
  });
});
