import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_INTENTOS_EXTRACCION,
  MONEDA_SOPORTADA,
  TIPOS_DOCUMENTO_SOPORTADOS,
  VERSION_POLITICA,
} from "./politica.ts";
import { deducirMoneda, evaluarDocumento, REGLA_5, REGLA_PRINCIPIO_V } from "./documentos.ts";

describe("política: constantes de documentos", () => {
  it("permite 3 intentos de extracción por documento", () => {
    assert.equal(MAX_INTENTOS_EXTRACCION, 3);
  });

  it("soporta solo el certificado laboral y el extracto bancario", () => {
    assert.deepEqual([...TIPOS_DOCUMENTO_SOPORTADOS], ["certificado_laboral", "extracto_bancario"]);
  });

  it("solo soporta pesos colombianos", () => {
    assert.equal(MONEDA_SOPORTADA, "COP");
  });
});

describe("política: deducirMoneda", () => {
  for (const fragmento of [
    "Salario básico $3.800.000 COP",
    "valor en pesos",
    "tres millones ochocientos mil pesos colombianos",
    "cop",
    "PESOS COLOMBIANOS",
  ]) {
    it(`reconoce pesos colombianos en «${fragmento}»`, () => {
      assert.deepEqual(deducirMoneda(fragmento), { tipo: "soportada", codigo: "COP" });
    });
  }

  for (const [fragmento, codigo] of [
    ["salario de USD 1.200", "USD"],
    ["US$ 1.200 mensuales", "USD"],
    ["1.200 dólares", "USD"],
    ["1.200 DOLARES AMERICANOS", "USD"],
    ["EUR 900", "EUR"],
    ["900 euros al mes", "EUR"],
    ["15.000 pesos mexicanos", "MXN"],
    ["GBP 800", "GBP"],
  ] as const) {
    it(`reconoce moneda extranjera ${codigo} en «${fragmento}»`, () => {
      assert.deepEqual(deducirMoneda(fragmento), { tipo: "extranjera", codigo });
    });
  }

  it("un monto con solo el símbolo $ no es una moneda reconocida", () => {
    assert.equal(deducirMoneda("$3.800.000"), null);
  });

  it("un texto sin moneda no es una moneda reconocida", () => {
    assert.equal(deducirMoneda("Salario básico mensual"), null);
  });

  it("no confunde una palabra que contiene «cop» con la moneda", () => {
    assert.equal(deducirMoneda("copia del documento"), null);
  });

  it("si menciona pesos y una moneda extranjera, prevalece la extranjera (escala)", () => {
    assert.deepEqual(deducirMoneda("3.800.000 pesos, equivalentes a USD 900"), {
      tipo: "extranjera",
      codigo: "USD",
    });
  });
});

describe("política: evaluarDocumento", () => {
  const completo = {
    tipo: "certificado_laboral",
    fragmentoMoneda: "$3.800.000 COP",
    conflictos: [],
    faltantes: [],
    tieneMontos: true,
  } as const;

  it("un certificado completo en COP se extrae sin faltantes", () => {
    const decision = evaluarDocumento(completo);
    assert.equal(decision.resultado, "extraido");
    assert.deepEqual(decision.faltantes, []);
    assert.equal(decision.causa, undefined);
  });

  it("un certificado sin salario se extrae con el salario como faltante", () => {
    const decision = evaluarDocumento({
      ...completo,
      fragmentoMoneda: null,
      faltantes: ["salario", "moneda"],
      tieneMontos: false,
    });
    assert.equal(decision.resultado, "extraido");
    assert.deepEqual(decision.faltantes, ["salario"]);
    assert.equal(decision.valores["faltantes"], "salario");
    assert.equal(decision.regla, REGLA_PRINCIPIO_V);
  });

  it("un extracto sin movimientos se extrae sin faltantes", () => {
    const decision = evaluarDocumento({
      tipo: "extracto_bancario",
      fragmentoMoneda: "Moneda: pesos colombianos",
      conflictos: [],
      faltantes: [],
      tieneMontos: false,
    });
    assert.equal(decision.resultado, "extraido");
    assert.deepEqual(decision.faltantes, []);
  });

  it("un documento de otro tipo es un caso no cubierto por tipo no soportado", () => {
    const decision = evaluarDocumento({ ...completo, tipo: "otro" });
    assert.equal(decision.resultado, "no_cubierto");
    assert.equal(decision.causa, "documento_no_soportado");
    assert.equal(decision.regla, REGLA_5);
  });

  it("un documento en moneda extranjera es un caso no cubierto", () => {
    const decision = evaluarDocumento({ ...completo, fragmentoMoneda: "salario de USD 1.200" });
    assert.equal(decision.resultado, "no_cubierto");
    assert.equal(decision.causa, "moneda_extranjera");
    assert.equal(decision.regla, REGLA_5);
    assert.equal(decision.valores["moneda"], "USD");
  });

  it("un tipo desconocido para la política es un caso no cubierto", () => {
    const decision = evaluarDocumento({ ...completo, tipo: "desprendible_de_nomina" });
    assert.equal(decision.resultado, "no_cubierto");
    assert.equal(decision.causa, "documento_no_soportado");
  });

  it("el tipo no soportado prevalece sobre la moneda extranjera", () => {
    const decision = evaluarDocumento({
      tipo: "otro",
      fragmentoMoneda: "USD 900",
      conflictos: [],
      faltantes: [],
      tieneMontos: true,
    });
    assert.equal(decision.causa, "documento_no_soportado");
  });

  it("la moneda extranjera prevalece sobre los conflictos", () => {
    const decision = evaluarDocumento({
      ...completo,
      fragmentoMoneda: "USD 900",
      conflictos: ["salario"],
    });
    assert.equal(decision.resultado, "no_cubierto");
  });

  it("dos valores en conflicto hacen el documento no extraíble", () => {
    const decision = evaluarDocumento({ ...completo, conflictos: ["salario"] });
    assert.equal(decision.resultado, "no_extraible");
    assert.equal(decision.valores["conflictos"], "salario");
    assert.equal(decision.regla, REGLA_PRINCIPIO_V);
  });

  it("con montos y sin fragmento de moneda no se supone COP: la moneda queda como faltante", () => {
    const decision = evaluarDocumento({ ...completo, fragmentoMoneda: null });
    assert.equal(decision.resultado, "extraido");
    assert.deepEqual(decision.faltantes, ["moneda"]);
  });

  it("sin montos, la moneda no hace falta aunque el documento no la nombre", () => {
    const decision = evaluarDocumento({
      ...completo,
      fragmentoMoneda: null,
      faltantes: ["moneda"],
      tieneMontos: false,
    });
    assert.deepEqual(decision.faltantes, []);
  });

  it("no repite la moneda si ya viene entre los faltantes", () => {
    const decision = evaluarDocumento({
      ...completo,
      fragmentoMoneda: null,
      faltantes: ["moneda"],
    });
    assert.deepEqual(decision.faltantes, ["moneda"]);
  });

  it("un fragmento que no nombra ninguna moneda tampoco se presume COP", () => {
    const decision = evaluarDocumento({ ...completo, fragmentoMoneda: "$3.800.000" });
    assert.equal(decision.resultado, "extraido");
    assert.deepEqual(decision.faltantes, ["moneda"]);
  });

  it("toda decisión trae regla, motivo, valores y la versión de la política", () => {
    for (const entrada of [
      completo,
      { ...completo, tipo: "otro" },
      { ...completo, fragmentoMoneda: "USD 900" },
      { ...completo, conflictos: ["cargo"] },
    ]) {
      const decision = evaluarDocumento(entrada);
      assert.ok(decision.regla.length > 0);
      assert.ok(decision.motivo.length > 0);
      assert.ok(Object.keys(decision.valores).length > 0);
      assert.equal(decision.versionPolitica, VERSION_POLITICA);
    }
  });
});
