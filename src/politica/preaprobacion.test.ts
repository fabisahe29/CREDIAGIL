import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REGLA_2, evaluarRegla2 } from "./preaprobacion.ts";
import { ErrorCuota, calcularCuota, calcularRelacionCuotaIngreso } from "./cuota.ts";
import {
  PORCENTAJE_MAXIMO_CUOTA_INGRESO,
  TOPE_MONTO_PREAPROBACION,
  VERSION_POLITICA,
} from "./politica.ts";
import type { VerificacionRegistrada } from "../compartido/solicitud.ts";

const INGRESO = 3_800_000;

/** Una verificación de ingreso como la guarda la solicitud registrada, con el estado dado. */
function verificacion(
  estado: VerificacionRegistrada["estado"],
  ingreso: number | null = INGRESO,
): VerificacionRegistrada {
  const conIngreso =
    estado === "verificado" || estado === "discrepancia" || estado === "falta_declarado";
  const monto = conIngreso ? (ingreso ?? INGRESO) : null;
  const conDiscrepancia = estado === "verificado" || estado === "discrepancia";
  return {
    estado,
    ingresoVerificado:
      monto === null
        ? null
        : {
            monto,
            origen: "certificado",
            montoCertificado: monto,
            montoExtractos: null,
            extractosContados: 0,
            usos: [],
            noUsados: [],
          },
    discrepancia:
      conDiscrepancia && monto !== null
        ? {
            declarado: estado === "discrepancia" ? monto + 500_000 : monto,
            verificado: monto,
            diferencia: estado === "discrepancia" ? 500_000 : 0,
            umbralPorcentaje: 10,
            supera: estado === "discrepancia",
            diferenciaPorcentaje: estado === "discrepancia" ? 13.16 : 0,
          }
        : null,
    inconsistencias: [],
    sinContrastar: [],
    calculadaEn: "2026-10-18T12:00:00.000Z",
  };
}

const evaluar = (monto: number, plazoMeses: number, v: VerificacionRegistrada | null) =>
  evaluarRegla2({ monto, plazoMeses, verificacion: v });

/** Un monto y un plazo cuya cuota es múltiplo de 3: así `ingreso = cuota · 100 / 30` es un entero. */
function cuotaMultiploDeTres(): { monto: number; plazoMeses: number; cuota: number } {
  const monto = 4_000_000;
  for (let plazoMeses = 1; plazoMeses <= 120; plazoMeses++) {
    const cuota = calcularCuota(monto, plazoMeses);
    if (cuota % 3 === 0) return { monto, plazoMeses, cuota };
  }
  throw new Error("no hay un plazo cuya cuota sea múltiplo de 3");
}

describe("política: constantes de la Regla 2 (#14, R1)", () => {
  it("el tope es de 5.000.000 pesos y el porcentaje máximo es el 30%", () => {
    assert.equal(TOPE_MONTO_PREAPROBACION, 5_000_000);
    assert.equal(PORCENTAJE_MAXIMO_CUOTA_INGRESO, 30);
  });

  it("la versión de la política sube a 2026-10-18.4", () => {
    assert.equal(VERSION_POLITICA, "2026-10-18.4");
  });
});

describe("política: evaluarRegla2, caso simple", () => {
  it("preaprueba 4.000.000 a 24 meses con ingreso verificado de 3.800.000", () => {
    const d = evaluar(4_000_000, 24, verificacion("verificado"));
    assert.equal(d.permitido, true);
    assert.equal("codigo" in d, false);
    assert.equal(d.regla, REGLA_2);
    assert.equal(d.versionPolitica, VERSION_POLITICA);
    assert.equal(d.valores["monto"], 4_000_000);
    assert.equal(d.valores["plazoMeses"], 24);
    assert.equal(d.valores["cuotaMensual"], 206_723);
    assert.equal(d.valores["ingresoVerificado"], INGRESO);
    assert.equal(d.valores["topeMonto"], TOPE_MONTO_PREAPROBACION);
    assert.equal(d.valores["porcentajeMaximo"], PORCENTAJE_MAXIMO_CUOTA_INGRESO);
    assert.ok(d.motivo.length > 0);
  });

  it("la regla se llama como en la constitución", () => {
    assert.equal(REGLA_2, "Regla 2 · preaprobación dentro de la política");
  });
});

describe("política: evaluarRegla2, borde exacto del monto", () => {
  const v = verificacion("verificado", 100_000_000);

  it("5.000.000 exactos se preaprueban", () => {
    assert.equal(evaluar(TOPE_MONTO_PREAPROBACION, 24, v).permitido, true);
  });

  it("4.999.999 se preaprueba", () => {
    assert.equal(evaluar(TOPE_MONTO_PREAPROBACION - 1, 24, v).permitido, true);
  });

  it("5.000.001 se bloquea con monto_sobre_tope", () => {
    const d = evaluar(TOPE_MONTO_PREAPROBACION + 1, 24, v);
    assert.equal(d.permitido, false);
    assert.equal(d.codigo, "monto_sobre_tope");
    assert.equal(d.valores["monto"], TOPE_MONTO_PREAPROBACION + 1);
    assert.equal(d.valores["topeMonto"], TOPE_MONTO_PREAPROBACION);
    assert.ok(d.motivo.length > 0);
  });
});

describe("política: evaluarRegla2, borde exacto de la relación cuota/ingreso", () => {
  const { monto, plazoMeses, cuota } = cuotaMultiploDeTres();
  const ingresoExacto = (cuota * 100) / PORCENTAJE_MAXIMO_CUOTA_INGRESO;

  it("el par de la prueba da una relación exacta del 30%", () => {
    assert.equal(Number.isInteger(ingresoExacto), true);
    assert.equal(cuota * 100, PORCENTAJE_MAXIMO_CUOTA_INGRESO * ingresoExacto);
  });

  it("con la cuota exactamente al 30% del ingreso se preaprueba", () => {
    const d = evaluar(monto, plazoMeses, verificacion("verificado", ingresoExacto));
    assert.equal(d.permitido, true);
    assert.equal(d.valores["cuotaMensual"], cuota);
  });

  it("con un peso menos de ingreso (la cuota pasa del 30%) se bloquea con cuota_sobre_porcentaje", () => {
    const d = evaluar(monto, plazoMeses, verificacion("verificado", ingresoExacto - 1));
    assert.equal(d.permitido, false);
    assert.equal(d.codigo, "cuota_sobre_porcentaje");
    assert.equal(d.valores["cuotaMensual"], cuota);
    assert.equal(d.valores["ingresoVerificado"], ingresoExacto - 1);
    assert.equal(d.valores["porcentajeMaximo"], PORCENTAJE_MAXIMO_CUOTA_INGRESO);
  });

  it("con un peso más de ingreso se preaprueba", () => {
    assert.equal(
      evaluar(monto, plazoMeses, verificacion("verificado", ingresoExacto + 1)).permitido,
      true,
    );
  });

  it("una relación de 30,004% que la relación del #12 redondea a 30,00% se bloquea", () => {
    const cuota24 = calcularCuota(4_000_000, 24);
    const ingreso = Math.floor((cuota24 * 100) / 30.004);
    assert.equal(calcularRelacionCuotaIngreso(cuota24, ingreso), 30);
    assert.ok(cuota24 * 100 > PORCENTAJE_MAXIMO_CUOTA_INGRESO * ingreso);
    const d = evaluar(4_000_000, 24, verificacion("verificado", ingreso));
    assert.equal(d.permitido, false);
    assert.equal(d.codigo, "cuota_sobre_porcentaje");
  });

  it("una cuota muy por debajo del 30% se preaprueba", () => {
    assert.equal(evaluar(1_000_000, 36, verificacion("verificado", 10_000_000)).permitido, true);
  });
});

describe("política: evaluarRegla2, cuota no calculable", () => {
  it("un monto tan pequeño que la cuota sería de 0 pesos se bloquea con cuota_no_calculable", () => {
    assert.throws(() => calcularCuota(1, 24), ErrorCuota);
    const d = evaluar(1, 24, verificacion("verificado"));
    assert.equal(d.permitido, false);
    assert.equal(d.codigo, "cuota_no_calculable");
    assert.equal("cuotaMensual" in d.valores, false);
  });

  it("un plazo que no es un entero positivo se bloquea con cuota_no_calculable, sin lanzar", () => {
    for (const plazo of [0, -3, 1.5, Number.NaN]) {
      const d = evaluar(4_000_000, plazo, verificacion("verificado"));
      assert.equal(d.permitido, false, String(plazo));
      assert.equal(d.codigo, "cuota_no_calculable", String(plazo));
    }
  });
});

describe("política: evaluarRegla2, verificación de ingreso (Regla 3 primero)", () => {
  it("sin verificación se bloquea con ingreso_no_verificado", () => {
    const d = evaluar(4_000_000, 24, null);
    assert.equal(d.permitido, false);
    assert.equal(d.codigo, "ingreso_no_verificado");
    assert.equal("ingresoVerificado" in d.valores, false);
  });

  it("con los estados inconsistencia, sin_ingreso, falta_declarado y no_cubierto se bloquea con ingreso_no_verificado", () => {
    for (const estado of [
      "inconsistencia",
      "sin_ingreso",
      "falta_declarado",
      "no_cubierto",
    ] as const) {
      const d = evaluar(4_000_000, 24, verificacion(estado));
      assert.equal(d.permitido, false, estado);
      assert.equal(d.codigo, "ingreso_no_verificado", estado);
    }
  });

  it("con el estado discrepancia se bloquea con discrepancia_registrada, aunque haya ingreso verificado", () => {
    const d = evaluar(4_000_000, 24, verificacion("discrepancia"));
    assert.equal(d.permitido, false);
    assert.equal(d.codigo, "discrepancia_registrada");
    assert.equal(d.valores["ingresoVerificado"], INGRESO);
  });
});

describe("política: evaluarRegla2, orden de evaluación (FR-014)", () => {
  it("discrepancia y monto alto a la vez dan discrepancia_registrada: la Regla 3 va antes", () => {
    const d = evaluar(6_000_000, 24, verificacion("discrepancia"));
    assert.equal(d.codigo, "discrepancia_registrada");
  });

  it("sin verificación y monto alto a la vez dan ingreso_no_verificado", () => {
    assert.equal(evaluar(6_000_000, 24, null).codigo, "ingreso_no_verificado");
  });

  it("monto alto y cuota alta a la vez dan monto_sobre_tope: el monto va antes que la cuota", () => {
    const d = evaluar(6_000_000, 3, verificacion("verificado"));
    assert.equal(d.codigo, "monto_sobre_tope");
  });

  it("monto dentro del tope con cuota alta da cuota_sobre_porcentaje", () => {
    const d = evaluar(4_500_000, 3, verificacion("verificado"));
    assert.equal(d.permitido, false);
    assert.equal(d.codigo, "cuota_sobre_porcentaje");
  });
});

describe("política: evaluarRegla2, la decisión es explicable y determinista", () => {
  it("cada bloqueo trae la regla, el motivo, los valores y la versión", () => {
    const decisiones = [
      evaluar(4_000_000, 24, null),
      evaluar(4_000_000, 24, verificacion("discrepancia")),
      evaluar(6_000_000, 24, verificacion("verificado")),
      evaluar(4_500_000, 3, verificacion("verificado")),
      evaluar(1, 24, verificacion("verificado")),
    ];
    for (const d of decisiones) {
      assert.equal(d.permitido, false);
      assert.equal(d.regla, REGLA_2);
      assert.ok(d.motivo.length > 0);
      assert.equal(d.versionPolitica, VERSION_POLITICA);
      assert.equal(d.valores["topeMonto"], TOPE_MONTO_PREAPROBACION);
      assert.equal(d.valores["porcentajeMaximo"], PORCENTAJE_MAXIMO_CUOTA_INGRESO);
      assert.equal(typeof d.codigo, "string");
    }
  });

  it("los mismos datos dan la misma decisión", () => {
    const v = verificacion("verificado");
    assert.deepEqual(evaluar(4_000_000, 24, v), evaluar(4_000_000, 24, structuredClone(v)));
  });

  it("el motivo no revela el tope ni el porcentaje: son para quien audita, no para el modelo", () => {
    for (const d of [
      evaluar(6_000_000, 24, verificacion("verificado")),
      evaluar(4_500_000, 3, verificacion("verificado")),
    ]) {
      assert.doesNotMatch(d.motivo, /5\.000\.000|5_000_000|30\s?%/);
    }
  });
});
