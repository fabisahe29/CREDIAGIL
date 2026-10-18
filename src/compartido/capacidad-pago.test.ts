import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AVISOS_CAPACIDAD_PAGO,
  DESCRIPCION_CAPACIDAD_PAGO,
  esquemaEntradaCapacidadPago,
  esquemaSimulacionCapacidadPago,
  validarEntradaCapacidadPago,
} from "./capacidad-pago.ts";
import { TASA_MENSUAL_PUNTOS_BASE, VERSION_POLITICA } from "../politica/politica.ts";

const CORRELATION_ID = "0b0b6b6e-5f0e-4a39-9d57-6a0c1c1f0a11";

const entradaValida = {
  monto: 4_000_000,
  plazoMeses: 24,
  ingresoMensual: 3_800_000,
  correlationId: CORRELATION_ID,
};

const simulacionValida = {
  tipo: "simulacion",
  vinculante: false,
  monto: 4_000_000,
  plazoMeses: 24,
  ingresoMensual: 3_800_000,
  fuenteIngreso: "declarado",
  tasaMensualPuntosBase: TASA_MENSUAL_PUNTOS_BASE,
  cuotaMensual: 206_723,
  relacionCuotaIngresoPorcentaje: 5.44,
  aviso: AVISOS_CAPACIDAD_PAGO.declarado,
  versionPolitica: VERSION_POLITICA,
};

function rechazo(entrada: unknown) {
  const resultado = validarEntradaCapacidadPago(entrada);
  assert.equal(resultado.ok, false);
  if (resultado.ok) throw new Error("se esperaba un rechazo");
  return resultado.error;
}

describe("contrato de la simulación: entrada (#12, US4)", () => {
  it("acepta enteros positivos y devuelve la entrada tipada", () => {
    const resultado = validarEntradaCapacidadPago(entradaValida);
    assert.deepEqual(resultado, { ok: true, entrada: entradaValida });
    assert.equal(esquemaEntradaCapacidadPago.safeParse(entradaValida).success, true);
  });

  const invalidos: Array<[string, string, string, unknown[]]> = [
    ["monto", "monto_invalido", "monto", [0, -1, 1.5, "4000000", null, Number.NaN, 2 ** 60]],
    ["plazoMeses", "plazo_invalido", "plazoMeses", [0, -24, 2.5, "24", null, Number.NaN]],
    ["ingresoMensual", "ingreso_invalido", "ingresoMensual", [0, -1, 3.5, "3800000", null]],
  ];
  for (const [campo, codigo, esperado, valores] of invalidos) {
    for (const valor of valores) {
      it(`rechaza ${campo} = ${String(valor)} como ${codigo}`, () => {
        const error = rechazo({ ...entradaValida, [campo]: valor });
        assert.equal(error.categoria, "validacion");
        assert.equal(error.reintentable, false);
        assert.equal(error.codigo, codigo);
        assert.equal(error.campo, esperado);
        assert.ok(error.mensaje.length > 10);
      });
    }
    it(`rechaza ${campo} ausente como ${codigo}`, () => {
      const { [campo as keyof typeof entradaValida]: _quitado, ...resto } = entradaValida;
      const error = rechazo(resto);
      assert.equal(error.codigo, codigo);
      assert.equal(error.campo, esperado);
    });
  }

  it("un correlationId ausente o que no es UUID es formato_invalido", () => {
    for (const correlationId of [undefined, "no-es-uuid", 12, null]) {
      const error = rechazo({ ...entradaValida, correlationId });
      assert.equal(error.codigo, "formato_invalido");
      assert.equal(error.campo, "correlationId");
      assert.equal(error.categoria, "validacion");
      assert.equal(error.reintentable, false);
    }
  });

  it("un campo de más es formato_invalido sobre ese campo", () => {
    const error = rechazo({ ...entradaValida, ingresoVerificado: 9_000_000 });
    assert.equal(error.codigo, "formato_invalido");
    assert.equal(error.campo, "ingresoVerificado");
  });

  it("informa el primer campo inválido en el orden monto, plazoMeses, ingresoMensual, correlationId", () => {
    const todosMal = { monto: 0, plazoMeses: 0, ingresoMensual: 0, correlationId: "x" };
    assert.equal(rechazo(todosMal).campo, "monto");
    assert.equal(rechazo({ ...todosMal, monto: 1_000 }).campo, "plazoMeses");
    assert.equal(rechazo({ ...todosMal, monto: 1_000, plazoMeses: 6 }).campo, "ingresoMensual");
    assert.equal(
      rechazo({ ...todosMal, monto: 1_000, plazoMeses: 6, ingresoMensual: 5 }).campo,
      "correlationId",
    );
  });

  it("lo que no es un objeto es formato_invalido sobre entrada", () => {
    for (const entrada of [undefined, null, "texto", 7, [entradaValida]]) {
      const error = rechazo(entrada);
      assert.equal(error.codigo, "formato_invalido");
      assert.equal(error.campo, "entrada");
    }
  });

  it("los mensajes dicen el motivo", () => {
    assert.match(rechazo({ ...entradaValida, monto: 0 }).mensaje, /monto/i);
    assert.match(rechazo({ ...entradaValida, plazoMeses: 0 }).mensaje, /plazo/i);
    const sinIngreso = { ...entradaValida, ingresoMensual: undefined };
    assert.match(rechazo(sinIngreso).mensaje, /ingreso/i);
  });
});

describe("contrato de la simulación: salida (#12, US1)", () => {
  it("acepta una simulación válida", () => {
    assert.equal(esquemaSimulacionCapacidadPago.safeParse(simulacionValida).success, true);
    assert.equal(
      esquemaSimulacionCapacidadPago.safeParse({
        ...simulacionValida,
        fuenteIngreso: "verificado",
        aviso: AVISOS_CAPACIDAD_PAGO.verificado,
      }).success,
      true,
    );
  });

  it("rechaza una simulación vinculante o que no es una simulación", () => {
    assert.equal(
      esquemaSimulacionCapacidadPago.safeParse({ ...simulacionValida, vinculante: true }).success,
      false,
    );
    assert.equal(
      esquemaSimulacionCapacidadPago.safeParse({ ...simulacionValida, tipo: "preaprobacion" })
        .success,
      false,
    );
  });

  it("rechaza campos de más, como un campo de decisión", () => {
    assert.equal(
      esquemaSimulacionCapacidadPago.safeParse({ ...simulacionValida, preaprobado: true }).success,
      false,
    );
  });

  it("rechaza una fuente de ingreso desconocida y una cuota que no es un entero positivo", () => {
    assert.equal(
      esquemaSimulacionCapacidadPago.safeParse({ ...simulacionValida, fuenteIngreso: "inventado" })
        .success,
      false,
    );
    for (const cuotaMensual of [0, -1, 206_723.5]) {
      assert.equal(
        esquemaSimulacionCapacidadPago.safeParse({ ...simulacionValida, cuotaMensual }).success,
        false,
      );
    }
  });
});

describe("contrato de la simulación: avisos (#12, FR-008, FR-014)", () => {
  it("cada fuente de ingreso tiene su aviso exacto", () => {
    assert.equal(
      AVISOS_CAPACIDAD_PAGO.declarado,
      "Simulación no vinculante con el ingreso que declaraste, que no está verificado. No reemplaza la verificación de tu ingreso con documentos ni una preaprobación.",
    );
    assert.equal(
      AVISOS_CAPACIDAD_PAGO.verificado,
      "Simulación no vinculante con tu ingreso verificado. No es una preaprobación: la decisión la toma la política de crédito con tu solicitud.",
    );
  });
});

describe("contrato de la simulación: descripción para el modelo (#12, US3, FR-007)", () => {
  it("dice que solo simula y que no registra, reserva ni compromete nada", () => {
    assert.match(DESCRIPCION_CAPACIDAD_PAGO, /^Solo simula/);
    assert.match(DESCRIPCION_CAPACIDAD_PAGO, /No registra, no reserva ni compromete nada/);
  });

  it("dice que puede usarse sin identidad verificada", () => {
    assert.match(DESCRIPCION_CAPACIDAD_PAGO, /puede usarse sin identidad verificada/);
  });

  it("dice que no reemplaza a preaprobar_credito y cuándo corresponde cada una", () => {
    assert.match(DESCRIPCION_CAPACIDAD_PAGO, /No reemplaza a preaprobar_credito/);
    assert.match(
      DESCRIPCION_CAPACIDAD_PAGO,
      /cuando el solicitante explora o pregunta cuánto pagaría al mes/,
    );
    assert.match(
      DESCRIPCION_CAPACIDAD_PAGO,
      /preaprobar_credito corresponde solo con una solicitud con identidad e ingreso verificados/,
    );
  });

  it("dice que el resultado no es una decisión y que se presenta como no vinculante", () => {
    assert.match(DESCRIPCION_CAPACIDAD_PAGO, /no es una decisión de crédito/);
    assert.match(DESCRIPCION_CAPACIDAD_PAGO, /simulación no vinculante/);
  });

  it("no da los umbrales de la Regla 2: ni el 30% ni el tope de monto", () => {
    assert.doesNotMatch(DESCRIPCION_CAPACIDAD_PAGO, /30/);
    assert.doesNotMatch(DESCRIPCION_CAPACIDAD_PAGO, /5\.000\.000|5000000|5 millones/i);
    assert.doesNotMatch(DESCRIPCION_CAPACIDAD_PAGO, /\d+\s?%/);
  });
});
