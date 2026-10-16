import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decidir } from "./decision.ts";
import { SHA, hallazgo, informeCodigo, informeCumplimiento, regla } from "./fixtures.ts";
import type { InformeCodigo, InformeCumplimiento } from "./informe.ts";

const codigo = (severidades: string[]) =>
  informeCodigo({
    hallazgos: severidades.map((severidad, i) => hallazgo({ severidad, linea: i + 1 })),
  }) as unknown as InformeCodigo;

const cumplimiento = (cambios: Record<string, unknown> = {}) =>
  informeCumplimiento(cambios) as unknown as InformeCumplimiento;

const FALLO = {
  tipo: "cumplimiento" as const,
  sha: SHA,
  causa: "informe inválido tras la corrección",
  errores: ["V4: la regla 3 aparece 0 veces"],
  fecha: "2026-10-16T00:00:00.000Z",
};

describe("decidir: permite", () => {
  it("con solo hallazgos medios y bajos y reglas cumplidas o no aplicables", () => {
    const d = decidir(SHA, { codigo: codigo(["media", "baja"]), cumplimiento: cumplimiento() });
    assert.equal(d.permite, true);
    assert.deepEqual(d.motivos, []);
    assert.deepEqual(d.revisiones, { codigo: "valida", cumplimiento: "valida" });
  });

  it("sin ningún hallazgo", () => {
    assert.equal(decidir(SHA, { codigo: codigo([]), cumplimiento: cumplimiento() }).permite, true);
  });
});

describe("decidir: bloquea (aclaración Q1)", () => {
  it("con un hallazgo alto", () => {
    const d = decidir(SHA, { codigo: codigo(["alta"]), cumplimiento: cumplimiento() });
    assert.equal(d.permite, false);
    assert.match(d.motivos.join("\n"), /alta.*\.claude\/revision\/lib\/decision\.ts:1/);
  });

  it("con un hallazgo crítico", () => {
    const d = decidir(SHA, { codigo: codigo(["baja", "critica"]), cumplimiento: cumplimiento() });
    assert.equal(d.permite, false);
    assert.match(d.motivos.join("\n"), /crítica.*:2/);
  });

  it("con una restricción alta del informe de cumplimiento", () => {
    const d = decidir(SHA, {
      codigo: codigo([]),
      cumplimiento: cumplimiento({ restricciones: [hallazgo({ severidad: "alta", linea: 7 })] }),
    });
    assert.equal(d.permite, false);
    assert.match(d.motivos.join("\n"), /Restricción alta.*:7/);
  });

  it("con una regla incumplida, citando su evidencia", () => {
    const reglas = [regla(1), regla(2, "incumplida"), regla(3), regla(4), regla(5)];
    const d = decidir(SHA, { codigo: codigo([]), cumplimiento: cumplimiento({ reglas }) });
    assert.equal(d.permite, false);
    assert.match(d.motivos.join("\n"), /Regla 2 incumplida: src\/politica\/umbrales\.ts:3/);
  });

  it("si falta el informe de código", () => {
    const d = decidir(SHA, { cumplimiento: cumplimiento() });
    assert.equal(d.permite, false);
    assert.equal(d.revisiones.codigo, "fallida");
    assert.match(d.motivos.join("\n"), /código.*sin informe/i);
  });

  it("si la revisión de cumplimiento falló, con su causa", () => {
    const d = decidir(SHA, {
      codigo: codigo([]),
      cumplimiento: cumplimiento(),
      fallos: { cumplimiento: FALLO },
    });
    assert.equal(d.permite, false);
    assert.equal(d.revisiones.cumplimiento, "fallida");
    assert.match(d.motivos.join("\n"), /informe inválido tras la corrección/);
  });
});

describe("decidir: conteos", () => {
  it("cuenta severidades de hallazgos y restricciones, y estados de reglas", () => {
    const reglas = [regla(1), regla(2, "cumplida"), regla(3, "incumplida"), regla(4), regla(5)];
    const d = decidir(SHA, {
      codigo: codigo(["critica", "alta", "media", "media", "baja"]),
      cumplimiento: cumplimiento({ reglas, restricciones: [hallazgo({ severidad: "baja" })] }),
    });
    assert.deepEqual(d.conteos, {
      critica: 1,
      alta: 1,
      media: 2,
      baja: 2,
      cumplidas: 1,
      incumplidas: 1,
      no_aplicables: 3,
    });
    assert.equal(d.sha, SHA);
  });
});
