import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ErrorCuota,
  calcularCuota,
  calcularRelacionCuotaIngreso,
  redondearAlPesoMasCercano,
} from "./cuota.ts";
import { TASA_MENSUAL, TASA_MENSUAL_PUNTOS_BASE } from "./politica.ts";

/** La cuota por otro camino: el monto entre la suma de los factores de descuento de cada mes. */
function cuotaPorFactores(monto: number, plazoMeses: number): number {
  let suma = 0;
  for (let mes = 1; mes <= plazoMeses; mes++) suma += Math.pow(1.018, -mes);
  return Math.round(monto / suma);
}

describe("política de la cuota: la tasa (#12, R1)", () => {
  it("la tasa es el 1,8% mensual y es exactamente el número 0,018", () => {
    assert.equal(TASA_MENSUAL_PUNTOS_BASE, 180);
    assert.equal(TASA_MENSUAL, 0.018);
  });

  it("la tasa no se repite como literal fuera de politica.ts", () => {
    const raiz = fileURLToPath(new URL("..", import.meta.url));
    const archivos = readdirSync(raiz, { recursive: true, encoding: "utf8" })
      .map((ruta) => ruta.replaceAll("\\", "/"))
      .filter((ruta) => ruta.endsWith(".ts") && !ruta.endsWith(".test.ts"))
      .filter((ruta) => ruta !== "politica/politica.ts");
    assert.ok(archivos.length > 10, "la búsqueda recorre el código de src/");
    const infractores = archivos.filter((ruta) =>
      /0[.,]018|\b1[.,]8\s?%/.test(readFileSync(`${raiz}${ruta}`, "utf8")),
    );
    assert.deepEqual(infractores, []);
  });
});

describe("política de la cuota: redondearAlPesoMasCercano (#12, R2)", () => {
  it("redondea al peso entero más cercano", () => {
    assert.equal(redondearAlPesoMasCercano(206723.34), 206723);
    assert.equal(redondearAlPesoMasCercano(206723.49999), 206723);
    assert.equal(redondearAlPesoMasCercano(206723.51), 206724);
  });

  it("la mitad exacta va hacia arriba", () => {
    assert.equal(redondearAlPesoMasCercano(206723.5), 206724);
    assert.equal(redondearAlPesoMasCercano(0.5), 1);
    assert.equal(redondearAlPesoMasCercano(1.5), 2);
  });

  it("un entero queda igual", () => {
    assert.equal(redondearAlPesoMasCercano(206723), 206723);
    assert.equal(redondearAlPesoMasCercano(0), 0);
  });
});

describe("política de la cuota: calcularCuota (#12, US1)", () => {
  it("valor de referencia del issue: 4.000.000 a 24 meses da 206.723", () => {
    assert.equal(calcularCuota(4_000_000, 24), 206_723);
  });

  it("a un mes la cuota es el monto más el interés de un mes", () => {
    assert.equal(calcularCuota(1_000_000, 1), 1_018_000);
  });

  it("coincide con la suma de los factores de descuento", () => {
    for (const [monto, plazo] of [
      [5_000_000, 12],
      [4_000_000, 24],
      [1_500_000, 6],
      [2_300_000, 36],
      [900_000, 60],
    ] as const) {
      assert.equal(
        calcularCuota(monto, plazo),
        cuotaPorFactores(monto, plazo),
        `${monto} a ${plazo}`,
      );
    }
  });

  it("con un plazo larguísimo la cuota tiende al interés de un mes", () => {
    assert.equal(calcularCuota(1_000_000, 1_000_000), 18_000);
  });

  it("un monto de un peso a un mes da una cuota válida", () => {
    assert.equal(calcularCuota(1, 1), 1);
  });

  it("si la cuota se redondea a cero no hay cuota: lanza ErrorCuota", () => {
    assert.throws(() => calcularCuota(1, 24), ErrorCuota);
  });

  it("si la cuota no es un entero seguro lanza ErrorCuota", () => {
    assert.throws(() => calcularCuota(Number.MAX_SAFE_INTEGER, 1), ErrorCuota);
  });

  it("precondiciones rotas lanzan ErrorCuota en lugar de devolver un número", () => {
    for (const [monto, plazo] of [
      [0, 12],
      [-1, 12],
      [1.5, 12],
      [Number.NaN, 12],
      [Number.MAX_SAFE_INTEGER + 2, 12],
      [1_000_000, 0],
      [1_000_000, -3],
      [1_000_000, 2.5],
      [1_000_000, Number.POSITIVE_INFINITY],
    ] as const) {
      assert.throws(() => calcularCuota(monto, plazo), ErrorCuota, `${monto} a ${plazo}`);
    }
  });

  it("es determinista", () => {
    const primera = calcularCuota(3_250_000, 18);
    for (let i = 0; i < 5; i++) assert.equal(calcularCuota(3_250_000, 18), primera);
  });

  it("el mensaje de ErrorCuota dice el motivo", () => {
    assert.throws(() => calcularCuota(0, 12), /monto/i);
    assert.throws(() => calcularCuota(1_000_000, 0), /plazo/i);
  });
});

describe("política de la cuota: calcularRelacionCuotaIngreso (#12, US1)", () => {
  it("devuelve el porcentaje con dos decimales", () => {
    assert.equal(calcularRelacionCuotaIngreso(206_723, 1_000_000), 20.67);
    assert.equal(calcularRelacionCuotaIngreso(206_723, 3_800_000), 5.44);
  });

  it("la mitad exacta de la centésima va hacia arriba", () => {
    assert.equal(calcularRelacionCuotaIngreso(1, 20_000), 0.01);
    assert.equal(calcularRelacionCuotaIngreso(3, 20_000), 0.02);
    assert.equal(calcularRelacionCuotaIngreso(1, 40_000), 0);
  });

  it("una cuota igual al ingreso es el 100%", () => {
    assert.equal(calcularRelacionCuotaIngreso(1_000_000, 1_000_000), 100);
  });

  it("una cuota mayor que el ingreso pasa del 100% sin recortarse", () => {
    assert.equal(calcularRelacionCuotaIngreso(1_500_000, 1_000_000), 150);
  });

  it("el 30% exacto se calcula sin error de flotante", () => {
    assert.equal(calcularRelacionCuotaIngreso(300_000, 1_000_000), 30);
    assert.equal(calcularRelacionCuotaIngreso(300_001, 1_000_000), 30);
  });

  it("no se pierde precisión con valores enormes", () => {
    assert.equal(
      calcularRelacionCuotaIngreso(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      100,
    );
  });

  it("precondiciones rotas lanzan ErrorCuota", () => {
    for (const [cuota, ingreso] of [
      [0, 1_000_000],
      [-5, 1_000_000],
      [100, 0],
      [100, -1],
      [100.5, 1_000_000],
      [100, 1.5],
      [Number.NaN, 1_000_000],
    ] as const) {
      assert.throws(() => calcularRelacionCuotaIngreso(cuota, ingreso), ErrorCuota);
    }
  });
});
