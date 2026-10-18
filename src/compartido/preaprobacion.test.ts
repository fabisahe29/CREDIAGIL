import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CODIGOS_BLOQUEO,
  DESCRIPCION_PREAPROBAR_CREDITO,
  esquemaDecisionRegla2,
  esquemaPreaprobacion,
} from "./preaprobacion.ts";
import { DESCRIPCION_CAPACIDAD_PAGO } from "./capacidad-pago.ts";
import { REGLA_2 } from "../politica/preaprobacion.ts";
import { VERSION_POLITICA } from "../politica/politica.ts";

const decisionPermitida = {
  regla: REGLA_2,
  permitido: true,
  motivo: "La solicitud cumple la política.",
  valores: {
    monto: 4_000_000,
    plazoMeses: 24,
    cuotaMensual: 206_723,
    ingresoVerificado: 3_800_000,
  },
  versionPolitica: VERSION_POLITICA,
};

const decisionBloqueada = {
  ...decisionPermitida,
  permitido: false,
  codigo: "monto_sobre_tope",
  motivo: "El monto supera el máximo que se preaprueba de forma automática.",
};

describe("compartido/preaprobacion: DecisionRegla2", () => {
  it("acepta una decisión permitida, sin código", () => {
    assert.equal(esquemaDecisionRegla2.safeParse(decisionPermitida).success, true);
  });

  it("acepta una decisión bloqueada, con su código", () => {
    assert.equal(esquemaDecisionRegla2.safeParse(decisionBloqueada).success, true);
  });

  it("un bloqueo sin código y una decisión permitida con código no pasan", () => {
    const { codigo: _quitado, ...sinCodigo } = decisionBloqueada;
    assert.equal(esquemaDecisionRegla2.safeParse(sinCodigo).success, false);
    assert.equal(
      esquemaDecisionRegla2.safeParse({ ...decisionPermitida, codigo: "monto_sobre_tope" }).success,
      false,
    );
  });

  it("los códigos de bloqueo son los cinco de la política", () => {
    assert.deepEqual([...CODIGOS_BLOQUEO].sort(), [
      "cuota_no_calculable",
      "cuota_sobre_porcentaje",
      "discrepancia_registrada",
      "ingreso_no_verificado",
      "monto_sobre_tope",
    ]);
    assert.equal(
      esquemaDecisionRegla2.safeParse({ ...decisionBloqueada, codigo: "otro_codigo" }).success,
      false,
    );
  });

  it("los valores son textos o enteros, y la regla, el motivo y la versión no están vacíos", () => {
    const con = (cambios: Record<string, unknown>) =>
      esquemaDecisionRegla2.safeParse({ ...decisionPermitida, ...cambios }).success;
    assert.equal(con({ valores: { monto: 1.5 } }), false);
    assert.equal(con({ valores: { monto: null } }), false);
    assert.equal(con({ valores: { texto: "ok" } }), true);
    assert.equal(con({ regla: "" }), false);
    assert.equal(con({ motivo: "" }), false);
    assert.equal(con({ versionPolitica: "" }), false);
  });

  it("rechaza un campo de más", () => {
    assert.equal(
      esquemaDecisionRegla2.safeParse({ ...decisionPermitida, extra: 1 }).success,
      false,
    );
  });
});

describe("compartido/preaprobacion: Preaprobacion", () => {
  const preaprobacion = { preaprobadaEn: "2026-10-18T12:00:00.000Z", decision: decisionPermitida };

  it("acepta la constancia con una decisión permitida", () => {
    assert.equal(esquemaPreaprobacion.safeParse(preaprobacion).success, true);
  });

  it("una decisión bloqueada no es una preaprobación", () => {
    assert.equal(
      esquemaPreaprobacion.safeParse({ ...preaprobacion, decision: decisionBloqueada }).success,
      false,
    );
  });

  it("la fecha es ISO 8601 y no hay vigencia ni condiciones: un campo de más no pasa", () => {
    assert.equal(
      esquemaPreaprobacion.safeParse({ ...preaprobacion, preaprobadaEn: "ayer" }).success,
      false,
    );
    for (const campo of ["vigencia", "vigenteHasta", "condiciones"]) {
      assert.equal(
        esquemaPreaprobacion.safeParse({ ...preaprobacion, [campo]: "x" }).success,
        false,
        campo,
      );
    }
  });
});

describe("compartido/preaprobacion: descripción de la herramienta (FR-002)", () => {
  const texto = DESCRIPCION_PREAPROBAR_CREDITO;

  it("dice que compromete a la fintech y que solo opera sobre una solicitud registrada", () => {
    assert.match(texto, /Compromete a la fintech/);
    assert.match(texto, /solicitud registrada/);
  });

  it("manda explorar y preguntar cuánto pagaría con calcular_capacidad_pago", () => {
    assert.match(texto, /No uses esta herramienta para explorar/);
    assert.match(texto, /calcular_capacidad_pago/);
  });

  it("dice que no recibe montos, cuotas ni ingresos y que no ofrece alternativas", () => {
    assert.match(texto, /No recibe montos, cuotas ni ingresos/);
    assert.match(texto, /no se ofrecen alternativas/);
  });

  it("no da el tope ni el porcentaje al modelo", () => {
    assert.doesNotMatch(texto, /5\.000\.000|5_000_000|30\s?%|\b30\b/);
  });

  it("la descripción de la simulación del #12 nombra la misma herramienta", () => {
    assert.match(DESCRIPCION_CAPACIDAD_PAGO, /preaprobar_credito/);
    assert.match(DESCRIPCION_CAPACIDAD_PAGO, /No reemplaza a preaprobar_credito/);
  });
});
