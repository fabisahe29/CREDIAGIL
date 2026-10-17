import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TIPOS_EVENTO, validarEvento } from "./eventos.ts";

const comunes = {
  descripcion: "Algo pasó con tu solicitud",
  motivo: "Porque sí",
  correlationId: "00000000-0000-4000-8000-000000000001",
  ts: "2026-10-17T10:00:00.000Z",
};

const validos = {
  preaprobacion: {
    tipo: "preaprobacion",
    ...comunes,
    regla: "Regla 2",
    valores: { monto: 3500000, cuota: 180000 },
  },
  solicitud_de_dato: { tipo: "solicitud_de_dato", ...comunes, dato: "certificado laboral" },
  escalamiento: { tipo: "escalamiento", ...comunes },
  bloqueo_por_regla: {
    tipo: "bloqueo_por_regla",
    ...comunes,
    regla: "Regla 2",
    valores: { cuota: 1250000, porcentaje: "32,9 %" },
    siguientePaso: "Un analista revisará tu caso",
  },
} as const;

const sin = (objeto: object, campo: string) =>
  Object.fromEntries(Object.entries(objeto).filter(([clave]) => clave !== campo));

describe("eventos: catálogo", () => {
  it("tiene exactamente los cuatro tipos del contrato", () => {
    assert.deepEqual(
      [...TIPOS_EVENTO],
      ["preaprobacion", "solicitud_de_dato", "escalamiento", "bloqueo_por_regla"],
    );
  });

  for (const [tipo, evento] of Object.entries(validos)) {
    it(`un evento ${tipo} válido pasa la validación`, () => {
      const r = validarEvento(evento);
      assert.equal(r.ok, true);
      if (r.ok) assert.equal(r.evento.tipo, tipo);
    });
  }

  it("escalamiento valida sin regla ni valores", () => {
    assert.equal(validarEvento(validos.escalamiento).ok, true);
  });

  it("acepta regla y valores opcionales en solicitud_de_dato y escalamiento", () => {
    for (const evento of [validos.solicitud_de_dato, validos.escalamiento]) {
      assert.equal(validarEvento({ ...evento, regla: "Regla 3", valores: { a: 1 } }).ok, true);
    }
  });
});

describe("eventos: campos obligatorios", () => {
  for (const campo of ["descripcion", "motivo", "correlationId", "ts"]) {
    it(`sin ${campo} no valida`, () => {
      assert.equal(validarEvento(sin(validos.escalamiento, campo)).ok, false);
    });
  }

  it("descripcion o motivo vacíos no validan", () => {
    assert.equal(validarEvento({ ...validos.escalamiento, descripcion: "" }).ok, false);
    assert.equal(validarEvento({ ...validos.escalamiento, motivo: "" }).ok, false);
  });

  it("un correlationId que no es UUID o un ts que no es ISO 8601 no validan", () => {
    assert.equal(validarEvento({ ...validos.escalamiento, correlationId: "abc" }).ok, false);
    assert.equal(validarEvento({ ...validos.escalamiento, ts: "ayer" }).ok, false);
  });

  it("una regla vacía no valida", () => {
    assert.equal(validarEvento({ ...validos.escalamiento, regla: "" }).ok, false);
  });

  it("preaprobacion exige regla y al menos un valor", () => {
    assert.equal(validarEvento(sin(validos.preaprobacion, "regla")).ok, false);
    assert.equal(validarEvento(sin(validos.preaprobacion, "valores")).ok, false);
    assert.equal(validarEvento({ ...validos.preaprobacion, valores: {} }).ok, false);
  });

  it("solicitud_de_dato exige dato no vacío", () => {
    assert.equal(validarEvento(sin(validos.solicitud_de_dato, "dato")).ok, false);
    assert.equal(validarEvento({ ...validos.solicitud_de_dato, dato: "" }).ok, false);
  });

  it("bloqueo_por_regla exige regla, al menos un valor y siguientePaso", () => {
    assert.equal(validarEvento(sin(validos.bloqueo_por_regla, "regla")).ok, false);
    assert.equal(validarEvento(sin(validos.bloqueo_por_regla, "valores")).ok, false);
    assert.equal(validarEvento({ ...validos.bloqueo_por_regla, valores: {} }).ok, false);
    assert.equal(validarEvento(sin(validos.bloqueo_por_regla, "siguientePaso")).ok, false);
    assert.equal(validarEvento({ ...validos.bloqueo_por_regla, siguientePaso: "" }).ok, false);
  });
});

describe("eventos: esquema estricto", () => {
  it("un campo desconocido no valida", () => {
    assert.equal(validarEvento({ ...validos.escalamiento, extra: 1 }).ok, false);
  });

  it("un tipo fuera del catálogo no valida e informa el tipo", () => {
    const r = validarEvento({ ...validos.escalamiento, tipo: "aprobacion_total" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.problema, /aprobacion_total/);
  });

  it("un valor decimal o de otro tipo en valores no valida", () => {
    assert.equal(
      validarEvento({ ...validos.preaprobacion, valores: { porcentaje: 0.3 } }).ok,
      false,
    );
    assert.equal(validarEvento({ ...validos.preaprobacion, valores: { activo: true } }).ok, false);
  });

  it("un campo propio de otro tipo no valida", () => {
    assert.equal(validarEvento({ ...validos.escalamiento, dato: "x" }).ok, false);
  });
});

describe("eventos: validarEvento nunca lanza", () => {
  for (const valor of [null, undefined, "evento", 42, {}, [], { tipo: 7 }]) {
    it(`con ${JSON.stringify(valor) ?? "undefined"} devuelve un problema legible`, () => {
      const r = validarEvento(valor);
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(typeof r.problema, "string");
        assert.ok(r.problema.length > 0);
      }
    });
  }
});
