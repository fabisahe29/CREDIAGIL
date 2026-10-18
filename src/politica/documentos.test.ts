import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_INTENTOS_EXTRACCION,
  MONEDA_SOPORTADA,
  TIPOS_DOCUMENTO_SOPORTADOS,
  VERSION_POLITICA,
} from "./politica.ts";
import {
  buscarMonedaExtranjera,
  deducirMoneda,
  evaluarDocumento,
  evaluarRegla5Previa,
  REGLA_5,
  REGLA_PRINCIPIO_V,
} from "./documentos.ts";

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
    "tres millones ochocientos mil pesos colombianos",
    "cop",
    "PESOS COLOMBIANOS",
    "$3.800.000 pesos m/cte",
    "tres millones de pesos moneda corriente",
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
    ["1,200 US dollars per month", "USD"],
    ["1,200 dollars", "USD"],
    ["EUR 900", "EUR"],
    ["900 euros al mes", "EUR"],
    ["€ 900", "EUR"],
    ["15.000 pesos mexicanos", "MXN"],
    ["3.800.000 pesos chilenos", "CLP"],
    ["950.000 pesos argentinos", "ARS"],
    ["80.000 pesos uruguayos", "UYU"],
    ["GBP 800", "GBP"],
  ] as const) {
    it(`reconoce moneda extranjera ${codigo} en «${fragmento}»`, () => {
      assert.deepEqual(deducirMoneda(fragmento), { tipo: "extranjera", codigo });
    });
  }

  for (const fragmento of ["valor en pesos", "3.800.000 pesos", "un peso"]) {
    it(`«pesos» sin país no es COP: «${fragmento}» no es una moneda reconocida`, () => {
      assert.equal(deducirMoneda(fragmento), null);
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

  it("si menciona COP y una moneda extranjera, prevalece la extranjera (escala)", () => {
    assert.deepEqual(deducirMoneda("3.800.000 pesos colombianos, equivalentes a USD 900"), {
      tipo: "extranjera",
      codigo: "USD",
    });
  });
});

describe("política: buscarMonedaExtranjera en todo el documento", () => {
  it("encuentra la línea que nombra una moneda extranjera, aunque otra diga COP", () => {
    const contenido = "Moneda: pesos colombianos (COP)\nSalario: USD 1.200\nCargo: consultora";
    assert.deepEqual(buscarMonedaExtranjera(contenido), {
      codigo: "USD",
      fragmento: "Salario: USD 1.200",
    });
  });

  it("un documento solo en COP no tiene moneda extranjera", () => {
    assert.equal(buscarMonedaExtranjera("Moneda: COP\nSalario: $3.800.000"), null);
  });

  it("en una línea muy larga cita un fragmento de 300 caracteres como máximo que contiene la moneda", () => {
    const linea = `${"x ".repeat(400)}salario de USD 1.200 ${"y ".repeat(400)}`;
    const r = buscarMonedaExtranjera(linea);
    assert.equal(r?.codigo, "USD");
    assert.ok((r?.fragmento.length ?? 0) <= 300);
    assert.ok(linea.includes(r?.fragmento ?? "falta"));
  });
});

describe("política: evaluarRegla5Previa, sin modelo y antes de la Regla 1", () => {
  it("un archivo que el chat no pudo leer no está cubierto", () => {
    const decision = evaluarRegla5Previa({ soportado: false });
    assert.equal(decision?.resultado, "no_cubierto");
    assert.equal(decision?.causa, "documento_no_soportado");
    assert.equal(decision?.regla, REGLA_5);
  });

  it("un documento que nombra una moneda extranjera en cualquier parte no está cubierto", () => {
    const decision = evaluarRegla5Previa({
      soportado: true,
      contenido: "Certificado\nSalario mensual: 950.000 pesos argentinos",
    });
    assert.equal(decision?.causa, "moneda_extranjera");
    assert.equal(decision?.valores["moneda"], "ARS");
  });

  it("sin moneda extranjera no decide: el tipo lo clasifica después el subagente", () => {
    assert.equal(
      evaluarRegla5Previa({ soportado: true, contenido: "Salario: $3.800.000 COP" }),
      null,
    );
  });
});

describe("política: evaluarDocumento", () => {
  const completo = {
    tipo: "certificado_laboral",
    fragmentoMoneda: "$3.800.000 COP",
    monedaExtranjeraEnContenido: null,
    conflictos: [],
    faltantes: [],
    tieneMontos: true,
  } as const;

  it("una moneda extranjera en el contenido saca al documento de la política aunque la cita diga COP", () => {
    const decision = evaluarDocumento({
      ...completo,
      monedaExtranjeraEnContenido: "Bonificación: USD 300",
    });
    assert.equal(decision.resultado, "no_cubierto");
    assert.equal(decision.causa, "moneda_extranjera");
    assert.equal(decision.valores["moneda"], "USD");
  });

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
      monedaExtranjeraEnContenido: null,
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
      monedaExtranjeraEnContenido: null,
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

describe("política: moneda pegada a la cifra (revisión de 5d28165)", () => {
  for (const [fragmento, codigo] of [
    ["US$1.200", "USD"],
    ["u$s1.200", "USD"],
    ["USD1.200", "USD"],
    ["1.200usd", "USD"],
    ["€900", "EUR"],
    ["900€", "EUR"],
    ["£800", "GBP"],
  ] as const) {
    it(`reconoce ${codigo} en «${fragmento}»`, () => {
      assert.deepEqual(deducirMoneda(fragmento), { tipo: "extranjera", codigo });
    });
  }

  it("la búsqueda en el documento y la revisión previa también la encuentran", () => {
    assert.equal(buscarMonedaExtranjera("Salario: US$1.200 mensuales")?.codigo, "USD");
    assert.equal(
      evaluarRegla5Previa({ soportado: true, contenido: "Bono anual: €900" })?.causa,
      "moneda_extranjera",
    );
  });

  it("una palabra que empieza o termina con las letras de una moneda no la nombra", () => {
    for (const texto of ["copia", "europa", "dolares" + "x", "usdx"]) {
      assert.equal(deducirMoneda(texto), null, texto);
    }
  });

  it("COP pegado a la cifra se reconoce", () => {
    assert.deepEqual(deducirMoneda("3.800.000COP"), { tipo: "soportada", codigo: "COP" });
  });
});
