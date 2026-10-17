import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_INTENTOS_VERIFICACION, VERSION_POLITICA } from "./politica.ts";
import { alcanzaLimite, evaluarRegla1, type EstadoIdentidad } from "./identidad.ts";

const CORRELATION_ID = "00000000-0000-4000-8000-000000000001";

const sinVerificar: EstadoIdentidad = {
  correlationId: CORRELATION_ID,
  verificada: false,
  idSolicitante: null,
  verificadaEn: null,
};

const verificada: EstadoIdentidad = {
  correlationId: CORRELATION_ID,
  verificada: true,
  idSolicitante: "CLI-0001000001",
  verificadaEn: "2026-10-17T10:00:00.000Z",
};

describe("política: constantes de la Regla 1", () => {
  it("permite 3 intentos fallidos de verificación", () => {
    assert.equal(MAX_INTENTOS_VERIFICACION, 3);
  });

  it("tiene una versión no vacía", () => {
    assert.equal(typeof VERSION_POLITICA, "string");
    assert.ok(VERSION_POLITICA.length > 0);
  });
});

describe("política: límite de intentos en el borde exacto", () => {
  it("con 2 fallos todavía no bloquea", () => {
    assert.equal(alcanzaLimite(2), false);
  });

  it("con 3 fallos bloquea (borde exacto)", () => {
    assert.equal(alcanzaLimite(3), true);
  });

  it("con 4 fallos sigue bloqueado", () => {
    assert.equal(alcanzaLimite(4), true);
  });

  it("sin fallos no bloquea", () => {
    assert.equal(alcanzaLimite(0), false);
  });
});

describe("política: evaluarRegla1", () => {
  it("permite seguir con la identidad verificada", () => {
    const decision = evaluarRegla1(verificada);
    assert.equal(decision.permitido, true);
    assert.equal(decision.regla, "Regla 1 · identidad verificada antes de registrar");
    assert.deepEqual(decision.valores, { identidad: "verificada" });
    assert.equal(decision.versionPolitica, VERSION_POLITICA);
    assert.ok(decision.motivo.length > 0);
  });

  it("no permite seguir sin identidad verificada", () => {
    const decision = evaluarRegla1(sinVerificar);
    assert.equal(decision.permitido, false);
    assert.equal(decision.regla, "Regla 1 · identidad verificada antes de registrar");
    assert.deepEqual(decision.valores, { identidad: "no verificada" });
    assert.ok(decision.motivo.length > 0);
  });
});
