import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tarjetaLuhn } from "../../hooks/lib/generadores.ts";
import {
  BloqueJsonInvalido,
  extraerBloqueJson,
  validarInformeCodigo,
  validarInformeCumplimiento,
} from "./informe.ts";
import { PAQUETE, hallazgo, informeCodigo, informeCumplimiento, regla } from "./fixtures.ts";

const errores = (valor: unknown) => {
  const r = validarInformeCodigo(valor, PAQUETE);
  return r.valido ? [] : r.errores;
};

describe("extraerBloqueJson", () => {
  it("devuelve el contenido del único bloque json", () => {
    const mensaje = 'Resumen para personas.\n\n```json\n{"a": 1}\n```\n';
    assert.deepEqual(extraerBloqueJson(mensaje), { a: 1 });
  });

  it("falla con V1 si no hay ningún bloque json", () => {
    assert.throws(() => extraerBloqueJson("sin bloque"), BloqueJsonInvalido);
  });

  it("falla con V1 si hay dos bloques json", () => {
    const mensaje = '```json\n{"a": 1}\n```\n```json\n{"b": 2}\n```';
    assert.throws(() => extraerBloqueJson(mensaje), /V1/);
  });

  it("falla con V1 si el bloque no es JSON", () => {
    assert.throws(() => extraerBloqueJson("```json\n{no es json\n```"), /V1/);
  });
});

describe("validarInformeCodigo: válidos", () => {
  it("acepta el ejemplo del contrato", () => {
    const r = validarInformeCodigo(informeCodigo(), PAQUETE);
    assert.equal(r.valido, true);
  });

  it("acepta un informe sin hallazgos", () => {
    assert.deepEqual(errores(informeCodigo({ hallazgos: [] })), []);
  });

  it("acepta un hallazgo fuera del diff con contexto en el diff", () => {
    const fuera = hallazgo({
      archivo: "src/politica/orden.ts",
      contexto: { archivo: "src/politica/umbrales.ts", linea: 3 },
    });
    assert.deepEqual(errores(informeCodigo({ hallazgos: [fuera] })), []);
  });

  it("acepta un preexistente fuera del diff con severidad baja", () => {
    const viejo = hallazgo({ archivo: "src/otro.ts", severidad: "baja", preexistente: true });
    assert.deepEqual(errores(informeCodigo({ hallazgos: [viejo] })), []);
  });
});

describe("validarInformeCodigo: inválidos", () => {
  it("V2: tipo distinto", () => {
    assert.match(errores(informeCodigo({ tipo: "cumplimiento" })).join("\n"), /V2/);
  });

  it("V2: sha distinto del paquete", () => {
    assert.match(errores(informeCodigo({ sha: "c".repeat(40) })).join("\n"), /V2/);
  });

  it("V3: severidad fuera de sus valores", () => {
    const r = errores(informeCodigo({ hallazgos: [hallazgo({ severidad: "grave" })] }));
    assert.match(r.join("\n"), /V3/);
  });

  it("V3: línea que no es un entero positivo", () => {
    const r = errores(informeCodigo({ hallazgos: [hallazgo({ linea: 0 })] }));
    assert.match(r.join("\n"), /V3/);
  });

  it("V3: hallazgos que no es una lista", () => {
    assert.match(errores(informeCodigo({ hallazgos: "ninguno" })).join("\n"), /V3/);
  });

  it("V6: archivo fuera del diff sin contexto", () => {
    const r = errores(informeCodigo({ hallazgos: [hallazgo({ archivo: "src/otro.ts" })] }));
    assert.match(r.join("\n"), /V6/);
  });

  it("V6: contexto que tampoco está en el diff", () => {
    const fuera = hallazgo({
      archivo: "src/otro.ts",
      contexto: { archivo: "src/tampoco.ts", linea: 1 },
    });
    assert.match(errores(informeCodigo({ hallazgos: [fuera] })).join("\n"), /V6/);
  });

  it("V7: preexistente con severidad distinta de baja", () => {
    const r = errores(informeCodigo({ hallazgos: [hallazgo({ preexistente: true })] }));
    assert.match(r.join("\n"), /V7/);
  });

  it("V8: un texto con un dato con forma real", () => {
    const r = errores(
      informeCodigo({ hallazgos: [hallazgo({ descripcion: `tarjeta ${tarjetaLuhn()}` })] }),
    );
    assert.match(r.join("\n"), /V8/);
    assert.doesNotMatch(r.join("\n"), new RegExp(tarjetaLuhn()));
  });

  it("lista todas las condiciones incumplidas, no solo la primera", () => {
    const r = errores(
      informeCodigo({
        sha: "c".repeat(40),
        hallazgos: [hallazgo({ severidad: "grave" }), hallazgo({ preexistente: true })],
      }),
    );
    assert.ok(r.length >= 3, r.join("\n"));
    for (const v of ["V2", "V3", "V7"]) assert.match(r.join("\n"), new RegExp(v));
  });

  it("rechaza un valor que no es un objeto", () => {
    assert.notDeepEqual(errores(null), []);
    assert.notDeepEqual(errores([]), []);
  });
});

describe("validarInformeCumplimiento", () => {
  const erroresC = (valor: unknown) => {
    const r = validarInformeCumplimiento(valor, PAQUETE);
    return r.valido ? [] : r.errores;
  };
  const cinco = () => [regla(1), regla(2, "cumplida"), regla(3), regla(4), regla(5)];

  it("acepta el ejemplo del contrato", () => {
    assert.equal(validarInformeCumplimiento(informeCumplimiento(), PAQUETE).valido, true);
  });

  it("acepta una regla incumplida con evidencia", () => {
    const reglas = cinco();
    reglas[1] = regla(2, "incumplida");
    assert.deepEqual(erroresC(informeCumplimiento({ reglas })), []);
  });

  it("V4: falta una regla", () => {
    assert.match(erroresC(informeCumplimiento({ reglas: cinco().slice(0, 4) })).join("\n"), /V4/);
  });

  it("V4: una regla repetida", () => {
    const reglas = [...cinco().slice(0, 4), regla(4)];
    assert.match(erroresC(informeCumplimiento({ reglas })).join("\n"), /V4/);
  });

  it("V4 o V3: una regla 6", () => {
    const reglas = [...cinco().slice(0, 4), regla(6)];
    assert.match(erroresC(informeCumplimiento({ reglas })).join("\n"), /V[34]/);
  });

  it("V5: cumplida sin evidencia", () => {
    const reglas = cinco();
    reglas[1] = regla(2, "cumplida", { evidencia: [] });
    assert.match(erroresC(informeCumplimiento({ reglas })).join("\n"), /V5/);
  });

  it("V5: incumplida sin evidencia", () => {
    const reglas = cinco();
    reglas[0] = { regla: 1, estado: "incumplida" };
    assert.match(erroresC(informeCumplimiento({ reglas })).join("\n"), /V5/);
  });

  it("V5: no aplicable sin motivo", () => {
    const reglas = cinco();
    reglas[2] = { regla: 3, estado: "no_aplicable" };
    assert.match(erroresC(informeCumplimiento({ reglas })).join("\n"), /V5/);
  });

  it("V3: estado fuera de sus valores", () => {
    const reglas = cinco();
    reglas[3] = regla(4, "parcial");
    assert.match(erroresC(informeCumplimiento({ reglas })).join("\n"), /V3/);
  });

  it("V3: evidencia mal formada", () => {
    const reglas = cinco();
    reglas[1] = regla(2, "cumplida", { evidencia: [{ archivo: "a.ts" }] });
    assert.match(erroresC(informeCumplimiento({ reglas })).join("\n"), /V3/);
  });

  it("valida restricciones como hallazgos (V3, V6, V7)", () => {
    const restricciones = [
      hallazgo({ severidad: "grave" }),
      hallazgo({ archivo: "src/otro.ts" }),
      hallazgo({ preexistente: true }),
    ];
    const r = erroresC(informeCumplimiento({ restricciones })).join("\n");
    for (const v of ["V3", "V6", "V7"]) assert.match(r, new RegExp(v));
  });

  it("V8: una cita con un dato con forma real", () => {
    const reglas = cinco();
    reglas[1] = regla(2, "cumplida", {
      evidencia: [{ archivo: "src/politica/umbrales.ts", linea: 3, cita: tarjetaLuhn() }],
    });
    assert.match(erroresC(informeCumplimiento({ reglas })).join("\n"), /V8/);
  });

  it("V2: tipo de código en lugar de cumplimiento", () => {
    assert.match(erroresC(informeCumplimiento({ tipo: "codigo" })).join("\n"), /V2/);
  });
});
