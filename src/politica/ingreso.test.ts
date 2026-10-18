import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REGLA_3,
  calcularDiferenciaPorcentaje,
  calcularIngresoVerificado,
  decidirIngreso,
  esAbonoDeNomina,
  evaluarDiscrepancia,
  pagadorDe,
  promediarHaciaAbajo,
} from "./ingreso.ts";
import { REGLA_5 } from "./documentos.ts";
import { UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE, VERSION_POLITICA } from "./politica.ts";
import {
  CONTENIDO_CERTIFICADO_USD,
  HOY_EJEMPLO,
  salidaCertificadoUsd,
} from "../compartido/extraccion-ejemplos.ts";
import {
  aRegistro,
  ejemploCertificado,
  ejemploExtracto,
  extractosTrimestre,
  nominaDelMes,
  type Ejemplo,
} from "../compartido/ingreso-ejemplos.ts";
import {
  esquemaRegistroExtraccion,
  huella,
  type Movimiento,
  type RegistroExtraccion,
} from "../compartido/extraccion.ts";

const ID_SOLICITANTE = "CLI-0001000001";
const NOMBRE_SOLICITANTE = "Ana Pérez Ficticia";

/** Un movimiento real de un extracto ficticio, para probar la detección de nómina. */
function movimiento(descripcion: string, sentido: "abono" | "cargo" = "abono"): Movimiento {
  const registro = aRegistro(
    ejemploExtracto({
      movimientos: [{ fecha: "2026-09-05", descripcion, valor: 3_800_000, sentido }],
    }),
  );
  assert.equal(registro.estado, "extraido");
  if (registro.estado !== "extraido" || registro.documento.tipo !== "extracto_bancario") {
    throw new Error("se esperaba un extracto");
  }
  return registro.documento.movimientos[0] as Movimiento;
}

const conCertificadoYTrimestre = (nomina = 3_800_000, salario: number | null = 3_800_000) => [
  aRegistro(ejemploCertificado({ salario })),
  ...extractosTrimestre({ nomina }).map((e) => aRegistro(e)),
];

const decidir = (registros: readonly RegistroExtraccion[], ingresoDeclarado: number | null) =>
  decidirIngreso({
    registros,
    nombreSolicitante: NOMBRE_SOLICITANTE,
    idSolicitante: ID_SOLICITANTE,
    ingresoDeclarado,
  });

describe("política de ingreso: esAbonoDeNomina y pagadorDe", () => {
  it("reconoce abonos con «Nómina», «SALARIO» y «sueldo» en la descripción", () => {
    assert.equal(esAbonoDeNomina(movimiento("Nómina Industrias Imaginarias")), true);
    assert.equal(esAbonoDeNomina(movimiento("SALARIO octubre Industrias Imaginarias")), true);
    assert.equal(esAbonoDeNomina(movimiento("Pago sueldo Industrias Imaginarias")), true);
  });

  it("un cargo con «Nómina» no es un abono de nómina", () => {
    assert.equal(esAbonoDeNomina(movimiento("Nómina Industrias Imaginarias", "cargo")), false);
  });

  it("un abono sin la palabra de nómina no lo es", () => {
    assert.equal(esAbonoDeNomina(movimiento("Transferencia a ahorro programado")), false);
  });

  it("la palabra se busca completa: «nominal» no coincide", () => {
    assert.equal(esAbonoDeNomina(movimiento("Valor nominal de la inversión")), false);
  });

  it("el pagador es la descripción sin la palabra de nómina", () => {
    assert.equal(pagadorDe(movimiento("Nómina Industrias Imaginarias")), "Industrias Imaginarias");
    assert.equal(
      pagadorDe(movimiento("Pago de nómina Industrias Imaginarias")),
      "Industrias Imaginarias",
    );
    assert.equal(pagadorDe(movimiento("SALARIO Industrias Imaginarias")), "Industrias Imaginarias");
  });
});

describe("política de ingreso: promediarHaciaAbajo", () => {
  it("redondea hacia abajo", () => {
    assert.equal(promediarHaciaAbajo(11, 3), 3);
    assert.equal(promediarHaciaAbajo(12, 3), 4);
    assert.equal(promediarHaciaAbajo(0, 3), 0);
    assert.equal(promediarHaciaAbajo(11_400_001, 3), 3_800_000);
  });

  it("lanza con una cantidad que no es un entero positivo", () => {
    assert.throws(() => promediarHaciaAbajo(10, 0));
    assert.throws(() => promediarHaciaAbajo(10, -1));
    assert.throws(() => promediarHaciaAbajo(10, 1.5));
  });
});

describe("política de ingreso: calcularIngresoVerificado", () => {
  it("con certificado y tres extractos iguales, el ingreso sale de los dos orígenes", () => {
    const ingreso = calcularIngresoVerificado(conCertificadoYTrimestre());
    assert.ok(ingreso);
    assert.equal(ingreso.monto, 3_800_000);
    assert.equal(ingreso.origen, "ambos");
    assert.equal(ingreso.montoCertificado, 3_800_000);
    assert.equal(ingreso.montoExtractos, 3_800_000);
    assert.equal(ingreso.extractosContados, 3);
  });

  it("los usos indican el salario y cada abono, con documento, campo y fragmento", () => {
    const ingreso = calcularIngresoVerificado(conCertificadoYTrimestre());
    assert.ok(ingreso);
    assert.equal(ingreso.usos.length, 4);
    const salario = ingreso.usos.find((u) => u.campo === "salario");
    assert.deepEqual(salario, {
      adjunto: 1,
      nombre: "certificado.md",
      campo: "salario",
      valor: 3_800_000,
      fragmento: "Salario básico mensual: $3.800.000 COP",
    });
    const abonos = ingreso.usos.filter((u) => u.campo.startsWith("movimientos["));
    assert.deepEqual(
      abonos.map((u) => u.adjunto),
      [2, 3, 4],
    );
    for (const abono of abonos) {
      assert.equal(abono.valor, 3_800_000);
      assert.match(abono.fragmento ?? "", /Nómina Industrias Imaginarias abono 3\.800\.000/);
    }
  });

  it("un promedio de nómina menor que el salario fija el ingreso (origen extractos)", () => {
    const ingreso = calcularIngresoVerificado(conCertificadoYTrimestre(3_000_000));
    assert.equal(ingreso?.monto, 3_000_000);
    assert.equal(ingreso?.origen, "extractos");
  });

  it("un salario menor que el promedio de nómina fija el ingreso (origen certificado)", () => {
    const ingreso = calcularIngresoVerificado(conCertificadoYTrimestre(5_000_000));
    assert.equal(ingreso?.monto, 3_800_000);
    assert.equal(ingreso?.origen, "certificado");
  });

  it("solo con certificado, el origen de los extractos es null", () => {
    const ingreso = calcularIngresoVerificado([aRegistro(ejemploCertificado())]);
    assert.equal(ingreso?.monto, 3_800_000);
    assert.equal(ingreso?.montoExtractos, null);
    assert.equal(ingreso?.extractosContados, 0);
    assert.equal(ingreso?.origen, "certificado");
  });

  it("solo con extractos, el origen del certificado es null", () => {
    const ingreso = calcularIngresoVerificado(extractosTrimestre().map((e) => aRegistro(e)));
    assert.equal(ingreso?.monto, 3_800_000);
    assert.equal(ingreso?.montoCertificado, null);
    assert.equal(ingreso?.origen, "extractos");
  });

  it("un salario nulo se ignora y queda entre los datos no usados, con su motivo", () => {
    const registros = [
      aRegistro(ejemploCertificado({ salario: null })),
      ...extractosTrimestre().map((e) => aRegistro(e)),
    ];
    const ingreso = calcularIngresoVerificado(registros);
    assert.equal(ingreso?.montoCertificado, null);
    assert.equal(ingreso?.monto, 3_800_000);
    assert.deepEqual(ingreso?.noUsados, [
      { adjunto: 1, nombre: "certificado.md", motivo: "el certificado no trae salario" },
    ]);
  });

  it("sin salario y sin extractos no hay ingreso", () => {
    assert.equal(
      calcularIngresoVerificado([aRegistro(ejemploCertificado({ salario: null }))]),
      null,
    );
    assert.equal(calcularIngresoVerificado([]), null);
  });

  it("un extracto sin nómina cuenta en el divisor y baja el promedio", () => {
    const [julio, agosto] = extractosTrimestre();
    const septiembre = ejemploExtracto({
      adjunto: 4,
      nombre: "extracto-2026-09.md",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      movimientos: [],
    });
    const ingreso = calcularIngresoVerificado(
      [julio, agosto, septiembre].map((e) => aRegistro(e as NonNullable<typeof e>)),
    );
    assert.equal(ingreso?.extractosContados, 3);
    assert.equal(ingreso?.montoExtractos, 2_533_333);
    assert.equal(ingreso?.monto, 2_533_333);
  });

  it("extractos sin ninguna nómina dan ingreso 0: no hay ingreso verificado", () => {
    const registros = [
      aRegistro(ejemploCertificado()),
      aRegistro(ejemploExtracto({ movimientos: [] })),
    ];
    assert.equal(calcularIngresoVerificado(registros), null);
  });

  it("un abono que no es nómina no suma y queda entre los datos no usados", () => {
    const extracto = ejemploExtracto({
      movimientos: [
        nominaDelMes("2026-09-01"),
        {
          fecha: "2026-09-10",
          descripcion: "Transferencia de un familiar",
          valor: 900_000,
          sentido: "abono",
        },
      ],
    });
    const ingreso = calcularIngresoVerificado([aRegistro(extracto)]);
    assert.equal(ingreso?.monto, 3_800_000);
    assert.equal(ingreso?.noUsados.length, 1);
    assert.equal(ingreso?.noUsados[0]?.adjunto, 2);
  });

  it("ignora los registros no extraíbles", () => {
    const noExtraible = esquemaRegistroExtraccion.parse({
      estado: "no_extraible",
      adjunto: 9,
      nombre: "borroso.md",
      huella: huella("borroso"),
      intentos: 3,
      conflictos: [],
      ultimoError: [{ campo: "salario", motivo: "esquema" }],
      adjuntos: [9],
      registradoEn: HOY_EJEMPLO.toISOString(),
    });
    const ingreso = calcularIngresoVerificado([...conCertificadoYTrimestre(), noExtraible]);
    assert.equal(ingreso?.monto, 3_800_000);
    assert.equal(ingreso?.extractosContados, 3);
  });

  it("el mismo contenido registrado dos veces cuenta una sola vez", () => {
    const registros = conCertificadoYTrimestre();
    const ingreso = calcularIngresoVerificado([...registros, ...registros]);
    assert.equal(ingreso?.extractosContados, 3);
    assert.equal(ingreso?.usos.length, 4);
  });

  it("con varios certificados toma el menor salario", () => {
    const registros = [
      aRegistro(ejemploCertificado({ salario: 4_000_000 })),
      aRegistro(ejemploCertificado({ adjunto: 5, nombre: "otro.md", salario: 3_500_000 })),
    ];
    assert.equal(calcularIngresoVerificado(registros)?.monto, 3_500_000);
  });
});

describe("política de ingreso: decidirIngreso", () => {
  it("sin ingreso declarado: falta_declarado, con el ingreso verificado", () => {
    const d = decidir(conCertificadoYTrimestre(), null);
    assert.equal(d.estado, "falta_declarado");
    assert.equal(d.ingreso?.monto, 3_800_000);
    assert.equal(d.discrepancia, null);
    assert.equal(d.ingresoDeclarado, null);
  });

  it("sin documentos de ingreso: sin_ingreso", () => {
    const d = decidir([], 3_800_000);
    assert.equal(d.estado, "sin_ingreso");
    assert.equal(d.ingreso, null);
  });

  it("con un documento no cubierto: no_cubierto, con la regla de la Regla 5 y sin cálculo", () => {
    const usd = aRegistro({
      adjunto: 8,
      nombre: "certificado-usd.md",
      contenido: CONTENIDO_CERTIFICADO_USD,
      salida: salidaCertificadoUsd(),
    });
    assert.equal(usd.estado, "no_cubierto");
    const d = decidir([...conCertificadoYTrimestre(), usd], 3_800_000);
    assert.equal(d.estado, "no_cubierto");
    assert.equal(d.ingreso, null);
    assert.equal(d.discrepancia, null);
    assert.equal(d.decision.regla, REGLA_5);
    assert.equal(d.decision.valores["adjunto"], 8);
  });

  it("el ingreso verificado no depende del ingreso declarado", () => {
    const registros = conCertificadoYTrimestre();
    const a = decidir(registros, 3_800_000);
    const b = decidir(registros, 9_900_000);
    const c = decidir(registros, null);
    assert.deepEqual(a.ingreso, b.ingreso);
    assert.deepEqual(a.ingreso, c.ingreso);
  });

  it("cada decisión trae regla, motivo, valores y la versión de la política", () => {
    for (const d of [
      decidir(conCertificadoYTrimestre(), 3_800_000),
      decidir(conCertificadoYTrimestre(), null),
      decidir([], 3_800_000),
    ]) {
      assert.equal(d.decision.regla, REGLA_3);
      assert.equal(d.decision.resultado, d.estado);
      assert.ok(d.decision.motivo.length > 0);
      assert.ok(Object.keys(d.decision.valores).length > 0);
      assert.equal(d.decision.versionPolitica, VERSION_POLITICA);
    }
  });

  it("es una función pura: dos llamadas iguales dan el mismo resultado", () => {
    const registros = conCertificadoYTrimestre();
    assert.deepEqual(decidir(registros, 3_800_000), decidir(registros, 3_800_000));
  });
});

describe("política de ingreso: evaluarDiscrepancia en el borde exacto del 10%", () => {
  const VERIFICADO = 3_800_000;

  it("el umbral es el del módulo de política", () => {
    assert.equal(evaluarDiscrepancia(VERIFICADO, VERIFICADO).umbralPorcentaje, 10);
    assert.equal(UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE, 10);
  });

  it("exactamente el 10% por encima o por debajo no es discrepancia", () => {
    assert.equal(evaluarDiscrepancia(4_180_000, VERIFICADO).supera, false);
    assert.equal(evaluarDiscrepancia(3_420_000, VERIFICADO).supera, false);
  });

  it("un peso más allá del 10% sí es discrepancia, en ambos sentidos", () => {
    assert.equal(evaluarDiscrepancia(4_180_001, VERIFICADO).supera, true);
    assert.equal(evaluarDiscrepancia(3_419_999, VERIFICADO).supera, true);
  });

  it("un peso dentro del 10% no es discrepancia", () => {
    assert.equal(evaluarDiscrepancia(4_179_999, VERIFICADO).supera, false);
    assert.equal(evaluarDiscrepancia(3_420_001, VERIFICADO).supera, false);
  });

  it("el declarado igual al verificado tiene diferencia 0", () => {
    const d = evaluarDiscrepancia(VERIFICADO, VERIFICADO);
    assert.equal(d.diferencia, 0);
    assert.equal(d.supera, false);
  });

  it("un declarado de 0 es discrepancia", () => {
    assert.equal(evaluarDiscrepancia(0, VERIFICADO).supera, true);
  });

  it("trae declarado, verificado y diferencia", () => {
    assert.deepEqual(evaluarDiscrepancia(4_300_000, VERIFICADO), {
      declarado: 4_300_000,
      verificado: VERIFICADO,
      diferencia: 500_000,
      umbralPorcentaje: 10,
      supera: true,
    });
  });

  it("con verificado 1 y declarado 2 no desborda: la diferencia es 100% y supera", () => {
    assert.equal(evaluarDiscrepancia(2, 1).supera, true);
    assert.equal(evaluarDiscrepancia(1, 1).supera, false);
  });

  it("con montos muy grandes sigue exacto, sin flotantes", () => {
    const verificado = 90_000_000_000;
    assert.equal(evaluarDiscrepancia(99_000_000_000, verificado).supera, false);
    assert.equal(evaluarDiscrepancia(99_000_000_001, verificado).supera, true);
  });

  it("exige un verificado entero > 0 y un declarado entero ≥ 0", () => {
    assert.throws(() => evaluarDiscrepancia(1_000_000, 0));
    assert.throws(() => evaluarDiscrepancia(1_000_000, -5));
    assert.throws(() => evaluarDiscrepancia(1_000_000.5, 1_000_000));
    assert.throws(() => evaluarDiscrepancia(-1, 1_000_000));
  });
});

describe("política de ingreso: decidirIngreso con la discrepancia", () => {
  it("con una diferencia que supera el 10%: discrepancia, con los valores de la decisión", () => {
    const d = decidir(conCertificadoYTrimestre(), 4_300_000);
    assert.equal(d.estado, "discrepancia");
    assert.equal(d.discrepancia?.supera, true);
    assert.equal(d.decision.valores["ingresoDeclarado"], 4_300_000);
    assert.equal(d.decision.valores["ingresoVerificado"], 3_800_000);
    assert.equal(d.decision.valores["diferencia"], 500_000);
    assert.equal(d.decision.valores["umbralPorcentaje"], 10);
  });

  it("con exactamente el 10%: verificado", () => {
    const d = decidir(conCertificadoYTrimestre(), 4_180_000);
    assert.equal(d.estado, "verificado");
    assert.equal(d.discrepancia?.supera, false);
  });

  it("con un peso más del 10%: discrepancia", () => {
    assert.equal(decidir(conCertificadoYTrimestre(), 4_180_001).estado, "discrepancia");
  });

  it("un declarado mayor y uno menor que el verificado escalan por igual", () => {
    assert.equal(decidir(conCertificadoYTrimestre(), 4_300_000).estado, "discrepancia");
    assert.equal(decidir(conCertificadoYTrimestre(), 3_000_000).estado, "discrepancia");
  });

  it("igual al verificado: verificado, con diferencia 0", () => {
    const d = decidir(conCertificadoYTrimestre(), 3_800_000);
    assert.equal(d.estado, "verificado");
    assert.equal(d.discrepancia?.diferencia, 0);
  });
});

describe("política de ingreso: decidirIngreso con la consistencia (#11, US3)", () => {
  const titularDistinto = () => ejemploExtracto({ titular: "Otra Persona Inventada" });
  const registrosCon = (ejemplos: Ejemplo[]) => ejemplos.map((e) => aRegistro(e));

  it("una inconsistencia que detiene da el estado inconsistencia, sin ingreso, aunque falte el declarado", () => {
    const registros = registrosCon([ejemploCertificado(), titularDistinto()]);
    const d = decidir(registros, null);
    assert.equal(d.estado, "inconsistencia");
    assert.equal(d.ingreso, null);
    assert.equal(d.discrepancia, null);
    assert.equal(d.inconsistencias[0]?.regla, "titular_vs_solicitante");
  });

  it("prevalece sobre la discrepancia: con un declarado muy distinto, sigue siendo inconsistencia", () => {
    const registros = registrosCon([ejemploCertificado(), titularDistinto()]);
    assert.equal(decidir(registros, 9_900_000).estado, "inconsistencia");
  });

  it("prevalece sobre sin_ingreso: un extracto ajeno sin nómina también es inconsistencia", () => {
    const registros = registrosCon([
      ejemploExtracto({ titular: "Otra Persona Inventada", movimientos: [] }),
    ]);
    assert.equal(decidir(registros, 3_800_000).estado, "inconsistencia");
  });

  it("la decisión lleva los nombres de las reglas que detienen y el número de inconsistencias", () => {
    const registros = registrosCon([
      ejemploCertificado({ empleador: "Compañía Inventada del Norte" }),
      titularDistinto(),
    ]);
    const d = decidir(registros, 3_800_000);
    assert.equal(d.estado, "inconsistencia");
    assert.equal(d.decision.regla, REGLA_3);
    assert.equal(d.decision.valores["reglas"], "titular_vs_solicitante, empleador_vs_pagador");
    assert.equal(d.decision.valores["inconsistencias"], 2);
  });

  it("una inconsistencia que solo se reporta no cambia el estado y queda registrada", () => {
    const [julio, , septiembre] = extractosTrimestre();
    const registros = registrosCon([ejemploCertificado(), julio!, septiembre!]);
    const d = decidir(registros, 3_800_000);
    assert.equal(d.estado, "verificado");
    assert.equal(d.inconsistencias.length, 1);
    assert.equal(d.inconsistencias[0]?.regla, "huecos_entre_periodos");
    assert.equal(d.inconsistencias[0]?.detiene, false);
  });

  it("lo que no se pudo contrastar viaja en el resultado", () => {
    const d = decidir(registrosCon([ejemploCertificado()]), 3_800_000);
    assert.ok(d.sinContrastar.some((m) => m.includes("faltan los extractos")));
  });

  it("un documento no cubierto prevalece sobre una inconsistencia (Regla 5 antes que la 3)", () => {
    const usd = aRegistro({
      adjunto: 8,
      nombre: "certificado-usd.md",
      contenido: CONTENIDO_CERTIFICADO_USD,
      salida: salidaCertificadoUsd(),
    });
    const d = decidir([...registrosCon([ejemploCertificado(), titularDistinto()]), usd], 3_800_000);
    assert.equal(d.estado, "no_cubierto");
    assert.equal(d.decision.regla, REGLA_5);
  });

  it("la prioridad completa: no_cubierto > inconsistencia > sin_ingreso > falta_declarado > discrepancia > verificado", () => {
    const buenos = registrosCon([ejemploCertificado(), ...extractosTrimestre()]);
    assert.equal(decidir(buenos, 3_800_000).estado, "verificado");
    assert.equal(decidir(buenos, 5_000_000).estado, "discrepancia");
    assert.equal(decidir(buenos, null).estado, "falta_declarado");
    assert.equal(decidir([], null).estado, "sin_ingreso");
    assert.equal(decidir(registrosCon([titularDistinto()]), null).estado, "inconsistencia");
  });

  it("el nombre del solicitante se contrasta sin importar el orden ni las tildes", () => {
    const registros = registrosCon([ejemploExtracto({ titular: "PEREZ FICTICIA ANA" })]);
    assert.equal(decidir(registros, 3_800_000).inconsistencias.length, 0);
  });
});

describe("política de ingreso: decidirIngreso con la consistencia (#11, US3)", () => {
  const titularDistinto = () => ejemploExtracto({ titular: "Otra Persona Inventada" });
  const registrosCon = (ejemplos: Ejemplo[]) => ejemplos.map((e) => aRegistro(e));

  it("una inconsistencia que detiene da el estado inconsistencia, sin ingreso, aunque falte el declarado", () => {
    const registros = registrosCon([ejemploCertificado(), titularDistinto()]);
    const d = decidir(registros, null);
    assert.equal(d.estado, "inconsistencia");
    assert.equal(d.ingreso, null);
    assert.equal(d.discrepancia, null);
    assert.equal(d.inconsistencias[0]?.regla, "titular_vs_solicitante");
  });

  it("prevalece sobre la discrepancia: con un declarado muy distinto, sigue siendo inconsistencia", () => {
    const registros = registrosCon([ejemploCertificado(), titularDistinto()]);
    assert.equal(decidir(registros, 9_900_000).estado, "inconsistencia");
  });

  it("prevalece sobre sin_ingreso: un extracto ajeno sin nómina también es inconsistencia", () => {
    const registros = registrosCon([
      ejemploExtracto({ titular: "Otra Persona Inventada", movimientos: [] }),
    ]);
    assert.equal(decidir(registros, 3_800_000).estado, "inconsistencia");
  });

  it("la decisión lleva los nombres de las reglas que detienen y el número de inconsistencias", () => {
    const registros = registrosCon([
      ejemploCertificado({ empleador: "Compañía Inventada del Norte" }),
      titularDistinto(),
    ]);
    const d = decidir(registros, 3_800_000);
    assert.equal(d.estado, "inconsistencia");
    assert.equal(d.decision.regla, REGLA_3);
    assert.equal(d.decision.valores["reglas"], "titular_vs_solicitante, empleador_vs_pagador");
    assert.equal(d.decision.valores["inconsistencias"], 2);
  });

  it("una inconsistencia que solo se reporta no cambia el estado y queda registrada", () => {
    const [julio, , septiembre] = extractosTrimestre();
    const registros = registrosCon([ejemploCertificado(), julio!, septiembre!]);
    const d = decidir(registros, 3_800_000);
    assert.equal(d.estado, "verificado");
    assert.equal(d.inconsistencias.length, 1);
    assert.equal(d.inconsistencias[0]?.regla, "huecos_entre_periodos");
    assert.equal(d.inconsistencias[0]?.detiene, false);
  });

  it("lo que no se pudo contrastar viaja en el resultado", () => {
    const d = decidir(registrosCon([ejemploCertificado()]), 3_800_000);
    assert.ok(d.sinContrastar.some((m) => m.includes("faltan los extractos")));
  });

  it("un documento no cubierto prevalece sobre una inconsistencia (Regla 5 antes que la 3)", () => {
    const usd = aRegistro({
      adjunto: 8,
      nombre: "certificado-usd.md",
      contenido: CONTENIDO_CERTIFICADO_USD,
      salida: salidaCertificadoUsd(),
    });
    const d = decidir([...registrosCon([ejemploCertificado(), titularDistinto()]), usd], 3_800_000);
    assert.equal(d.estado, "no_cubierto");
    assert.equal(d.decision.regla, REGLA_5);
  });

  it("la prioridad completa: no_cubierto > inconsistencia > sin_ingreso > falta_declarado > discrepancia > verificado", () => {
    const buenos = registrosCon([ejemploCertificado(), ...extractosTrimestre()]);
    assert.equal(decidir(buenos, 3_800_000).estado, "verificado");
    assert.equal(decidir(buenos, 5_000_000).estado, "discrepancia");
    assert.equal(decidir(buenos, null).estado, "falta_declarado");
    assert.equal(decidir([], null).estado, "sin_ingreso");
    assert.equal(decidir(registrosCon([titularDistinto()]), null).estado, "inconsistencia");
  });

  it("el nombre del solicitante se contrasta sin importar el orden ni las tildes", () => {
    const registros = registrosCon([ejemploExtracto({ titular: "PEREZ FICTICIA ANA" })]);
    assert.equal(decidir(registros, 3_800_000).inconsistencias.length, 0);
  });
});

describe("política de ingreso: calcularDiferenciaPorcentaje (#13, R9)", () => {
  const VERIFICADO = 3_800_000;
  const casos: readonly [string, number, number, number][] = [
    ["sin diferencia", 3_800_000, VERIFICADO, 0],
    ["borde exacto del 10%", 4_180_000, VERIFICADO, 10],
    ["un peso por encima del borde", 4_180_001, VERIFICADO, 10],
    ["caso de la demo con discrepancia", 4_300_000, VERIFICADO, 13.16],
    ["por debajo, la diferencia es absoluta", 3_420_000, VERIFICADO, 10],
    ["un peso por debajo del borde", 3_419_999, VERIFICADO, 10],
    ["mitad hacia arriba y dos decimales", 1, 3, 66.67],
    ["declarado en cero", 0, VERIFICADO, 100],
  ];

  for (const [nombre, declarado, verificado, esperado] of casos) {
    it(`${nombre}: ${declarado} contra ${verificado} da ${esperado}`, () => {
      assert.equal(calcularDiferenciaPorcentaje(declarado, verificado), esperado);
    });
  }

  it("la mitad exacta de la centésima va hacia arriba", () => {
    // 1 / 8 = 12,5% exacto; 1 / 16 = 6,25% exacto; 1 / 32 = 3,125% → 3,13
    assert.equal(calcularDiferenciaPorcentaje(33, 32), 3.13);
  });

  it("rechaza un declarado que no es un entero no negativo", () => {
    for (const invalido of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => calcularDiferenciaPorcentaje(invalido, VERIFICADO), RangeError);
    }
  });

  it("rechaza un verificado que no es un entero positivo: no divide por cero", () => {
    for (const invalido of [0, -1, 1.5, Number.NaN]) {
      assert.throws(() => calcularDiferenciaPorcentaje(4_000_000, invalido), RangeError);
    }
  });

  it("el porcentaje informativo no cambia la decisión: en 4.180.000 y 4.180.001 ambos dan 10", () => {
    assert.equal(evaluarDiscrepancia(4_180_000, VERIFICADO).supera, false);
    assert.equal(evaluarDiscrepancia(4_180_001, VERIFICADO).supera, true);
    assert.equal(calcularDiferenciaPorcentaje(4_180_000, VERIFICADO), 10);
    assert.equal(calcularDiferenciaPorcentaje(4_180_001, VERIFICADO), 10);
  });
});
