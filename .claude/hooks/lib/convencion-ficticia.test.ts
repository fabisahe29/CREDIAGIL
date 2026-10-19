import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PALABRAS_CLAVE, PREFIJO_FICTICIO, esFicticio } from "./convencion-ficticia.ts";

const DOCUMENTO = fileURLToPath(new URL("../../../docs/datos-ficticios.md", import.meta.url));

describe("esFicticio", () => {
  it("acepta los números cuyos dígitos empiezan por 000", () => {
    assert.equal(esFicticio("0001234567"), true);
    assert.equal(esFicticio("000.123.456-7"), true);
    assert.equal(esFicticio("0000 1234 5678 9010"), true);
  });

  it("rechaza los números que no empiezan por 000", () => {
    assert.equal(esFicticio("0012345678"), false);
    assert.equal(esFicticio("1" + "0".repeat(9)), false);
  });

  it("usa el prefijo que se le pasa en lugar del de por defecto", () => {
    assert.equal(esFicticio("999.123.456", "999"), true);
    assert.equal(esFicticio("0001234567", "999"), false);
  });
});

describe("sincronía con docs/datos-ficticios.md", () => {
  const documento = readFileSync(DOCUMENTO, "utf8");

  it("el documento menciona el prefijo ficticio", () => {
    assert.ok(documento.includes(`\`${PREFIJO_FICTICIO}\``), "falta el prefijo en el documento");
  });

  it("el documento lista cada palabra clave del control", () => {
    for (const { tipo, palabras } of PALABRAS_CLAVE) {
      for (const { texto } of palabras) {
        assert.ok(
          documento.includes(`\`${texto}\``),
          `falta la palabra clave de ${tipo}: ${texto}`,
        );
      }
    }
  });
});
