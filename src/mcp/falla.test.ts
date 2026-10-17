import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { crearFalla, leerFalla, ModoFallaInvalido } from "./falla.ts";

describe("falla simulada: leerFalla", () => {
  it("vacío o ausente es sin falla", () => {
    assert.equal(leerFalla(undefined), null);
    assert.equal(leerFalla(""), null);
    assert.equal(leerFalla("  "), null);
  });

  it("acepta una-vez y siempre", () => {
    assert.equal(leerFalla("una-vez"), "una-vez");
    assert.equal(leerFalla("siempre"), "siempre");
  });

  it("un valor desconocido lanza con un mensaje claro: no se adivina", () => {
    assert.throws(() => leerFalla("a veces"), ModoFallaInvalido);
    assert.throws(() => leerFalla("SIEMPRE"), /CREDIAGIL_FALLA.*una-vez.*siempre/);
  });
});

describe("falla simulada: crearFalla", () => {
  it("sin modo nunca falla", () => {
    const falla = crearFalla(null);
    assert.deepEqual([falla.debeFallar(), falla.debeFallar()], [false, false]);
  });

  it("una-vez falla solo la primera llamada", () => {
    const falla = crearFalla("una-vez");
    assert.deepEqual(
      [falla.debeFallar(), falla.debeFallar(), falla.debeFallar()],
      [true, false, false],
    );
  });

  it("siempre falla en todas las llamadas", () => {
    const falla = crearFalla("siempre");
    assert.deepEqual(
      [falla.debeFallar(), falla.debeFallar(), falla.debeFallar()],
      [true, true, true],
    );
  });
});
