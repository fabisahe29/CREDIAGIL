import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { veredictoDe, type Comprobacion, type Hallazgo } from "./tipos.ts";

const ok: Comprobacion = { nombre: "nombres", estado: "ok" };
const noVerificable: Comprobacion = { nombre: "historial", estado: "no verificable" };
const hallazgo: Hallazgo = { tipo: "secreto", ubicacion: "a.txt", detalle: "token" };

describe("veredicto de la entrega", () => {
  it("es listo si todo está ok y no hay hallazgos", () => {
    assert.equal(veredictoDe([ok], []), "listo");
  });

  it("bloquea con un hallazgo", () => {
    assert.equal(veredictoDe([ok], [hallazgo]), "bloqueado");
  });

  it("es incompleto si una comprobación no se pudo verificar y no hay hallazgos", () => {
    assert.equal(veredictoDe([ok, noVerificable], []), "incompleto");
  });

  it("bloquea si hay un hallazgo aunque otra comprobación no sea verificable", () => {
    assert.equal(veredictoDe([noVerificable], [hallazgo]), "bloqueado");
  });
});
