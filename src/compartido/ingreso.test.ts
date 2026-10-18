import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ESTADOS_VERIFICACION,
  REGLAS_CONSISTENCIA,
  esquemaDiscrepancia,
  esquemaInconsistencia,
  esquemaVerificacionIngreso,
  type Inconsistencia,
  type VerificacionIngreso,
} from "./ingreso.ts";
import { VERSION_POLITICA } from "../politica/politica.ts";

const CORRELATION_ID = "5d2c1e0a-7f4b-4c3a-9a51-0d6f8b2e4c11";
const AHORA = "2026-10-18T12:00:00.000Z";

const usoDocumento = (campo: string, valor: string | number) => ({
  adjunto: 2,
  nombre: "extracto-2026-09.md",
  campo,
  valor,
  fragmento: "Titular: Ana Pérez Ficticia",
});

const usoIdentidad = {
  adjunto: null,
  nombre: "identidad verificada",
  campo: "nombre",
  valor: "Ana Pérez Ficticia",
  fragmento: null,
};

const ingreso = {
  monto: 3800000,
  origen: "ambos" as const,
  montoCertificado: 3800000,
  montoExtractos: 3800000,
  extractosContados: 3,
  usos: [usoDocumento("salario", 3800000)],
  noUsados: [],
};

const discrepancia = (declarado: number, supera: boolean) => ({
  declarado,
  verificado: 3800000,
  diferencia: Math.abs(declarado - 3800000),
  umbralPorcentaje: 10 as const,
  supera,
});

const inconsistencia = (regla: string, extra: Record<string, unknown> = {}) => ({
  regla,
  descripcion: "Titular del extracto frente al solicitante verificado",
  detiene: true,
  corregible: true,
  adjuntos: [2],
  valores: [usoDocumento("titular", "Otra Persona Inventada"), usoIdentidad],
  ...extra,
});

function verificacion(
  estado: (typeof ESTADOS_VERIFICACION)[number],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    correlationId: CORRELATION_ID,
    idSolicitante: "CLI-0001000001",
    estado,
    ingresoDeclarado: 3800000,
    ingreso,
    discrepancia: discrepancia(3800000, false),
    inconsistencias: [],
    sinContrastar: [],
    decision: {
      regla: "Regla 3 · ingreso verificado desde los documentos",
      resultado: estado,
      motivo: "motivo de prueba",
      valores: { ingresoVerificado: 3800000 },
      versionPolitica: VERSION_POLITICA,
    },
    calculadaEn: AHORA,
    ...extra,
  };
}

const sinIngreso = { ingreso: null, discrepancia: null };

describe("esquemaVerificacionIngreso: una verificación de cada estado", () => {
  it("acepta verificado, con ingreso y sin discrepancia que supere", () => {
    assert.ok(esquemaVerificacionIngreso.safeParse(verificacion("verificado")).success);
  });

  it("acepta discrepancia, con ingreso y la discrepancia que supera", () => {
    const valor = verificacion("discrepancia", {
      ingresoDeclarado: 4300000,
      discrepancia: discrepancia(4300000, true),
    });
    assert.ok(esquemaVerificacionIngreso.safeParse(valor).success);
  });

  it("acepta falta_declarado, con ingreso y sin declarado ni discrepancia", () => {
    const valor = verificacion("falta_declarado", { ingresoDeclarado: null, discrepancia: null });
    assert.ok(esquemaVerificacionIngreso.safeParse(valor).success);
  });

  it("acepta sin_ingreso e inconsistencia sin ingreso", () => {
    assert.ok(
      esquemaVerificacionIngreso.safeParse(verificacion("sin_ingreso", sinIngreso)).success,
    );
    const conInconsistencia = verificacion("inconsistencia", {
      ...sinIngreso,
      inconsistencias: [inconsistencia("titular_vs_solicitante")],
    });
    assert.ok(esquemaVerificacionIngreso.safeParse(conInconsistencia).success);
  });

  it("acepta no_cubierto sin ingreso", () => {
    assert.ok(
      esquemaVerificacionIngreso.safeParse(verificacion("no_cubierto", sinIngreso)).success,
    );
  });

  it("rechaza campos extra y estados desconocidos", () => {
    assert.ok(
      !esquemaVerificacionIngreso.safeParse({ ...verificacion("verificado"), extra: 1 }).success,
    );
    assert.ok(!esquemaVerificacionIngreso.safeParse(verificacion("aprobado" as never)).success);
  });

  it("exige que la decisión repita el estado", () => {
    const valor = verificacion("verificado", {
      decision: {
        ...(verificacion("verificado")["decision"] as object),
        resultado: "discrepancia",
      },
    });
    assert.ok(!esquemaVerificacionIngreso.safeParse(valor).success);
  });

  it("exige ingreso con verificado, discrepancia y falta_declarado", () => {
    for (const estado of ["verificado", "discrepancia", "falta_declarado"] as const) {
      assert.ok(
        !esquemaVerificacionIngreso.safeParse(verificacion(estado, { ingreso: null })).success,
        estado,
      );
    }
  });

  it("no admite ingreso en sin_ingreso, inconsistencia ni no_cubierto", () => {
    for (const estado of ["sin_ingreso", "inconsistencia", "no_cubierto"] as const) {
      assert.ok(!esquemaVerificacionIngreso.safeParse(verificacion(estado)).success, estado);
    }
  });

  it("exige la discrepancia con verificado y discrepancia, y la prohíbe con falta_declarado", () => {
    assert.ok(
      !esquemaVerificacionIngreso.safeParse(verificacion("verificado", { discrepancia: null }))
        .success,
    );
    assert.ok(!esquemaVerificacionIngreso.safeParse(verificacion("falta_declarado")).success);
  });
});

describe("esquemaVerificacionIngreso: montos enteros", () => {
  const conIngreso = (cambios: Record<string, unknown>) =>
    verificacion("verificado", { ingreso: { ...ingreso, ...cambios } });

  it("monto debe ser un entero > 0", () => {
    assert.ok(!esquemaVerificacionIngreso.safeParse(conIngreso({ monto: 0 })).success);
    assert.ok(!esquemaVerificacionIngreso.safeParse(conIngreso({ monto: 3800000.5 })).success);
    assert.ok(!esquemaVerificacionIngreso.safeParse(conIngreso({ monto: -1 })).success);
  });

  it("origen solo admite certificado, extractos o ambos", () => {
    assert.ok(esquemaVerificacionIngreso.safeParse(conIngreso({ origen: "extractos" })).success);
    assert.ok(!esquemaVerificacionIngreso.safeParse(conIngreso({ origen: "declarado" })).success);
  });

  it("extractosContados es un entero ≥ 0", () => {
    assert.ok(esquemaVerificacionIngreso.safeParse(conIngreso({ extractosContados: 0 })).success);
    assert.ok(!esquemaVerificacionIngreso.safeParse(conIngreso({ extractosContados: -1 })).success);
  });

  it("ingresoDeclarado es un entero ≥ 0 o null", () => {
    assert.ok(
      esquemaVerificacionIngreso.safeParse(
        verificacion("discrepancia", { ingresoDeclarado: 0, discrepancia: discrepancia(0, true) }),
      ).success,
    );
    assert.ok(
      !esquemaVerificacionIngreso.safeParse(verificacion("verificado", { ingresoDeclarado: -5 }))
        .success,
    );
    assert.ok(
      !esquemaVerificacionIngreso.safeParse(verificacion("verificado", { ingresoDeclarado: 1.5 }))
        .success,
    );
  });

  it("calculadaEn es una fecha-hora ISO", () => {
    assert.ok(
      !esquemaVerificacionIngreso.safeParse(verificacion("verificado", { calculadaEn: "ayer" }))
        .success,
    );
  });
});

describe("esquemaDiscrepancia", () => {
  it("diferencia es un entero ≥ 0 y verificado un entero > 0", () => {
    assert.ok(esquemaDiscrepancia.safeParse(discrepancia(3800000, false)).success);
    assert.ok(
      !esquemaDiscrepancia.safeParse({ ...discrepancia(3800000, false), diferencia: -1 }).success,
    );
    assert.ok(
      !esquemaDiscrepancia.safeParse({ ...discrepancia(3800000, false), verificado: 0 }).success,
    );
  });

  it("umbralPorcentaje es el literal del módulo de política", () => {
    assert.ok(
      !esquemaDiscrepancia.safeParse({ ...discrepancia(3800000, false), umbralPorcentaje: 15 })
        .success,
    );
  });
});

describe("esquemaInconsistencia", () => {
  it("acepta una con un uso de documento y el de la identidad verificada", () => {
    assert.ok(esquemaInconsistencia.safeParse(inconsistencia("titular_vs_solicitante")).success);
  });

  it("rechaza una sin ningún uso de un documento", () => {
    const solo = inconsistencia("titular_vs_solicitante", { valores: [usoIdentidad] });
    assert.ok(!esquemaInconsistencia.safeParse(solo).success);
    const vacia = inconsistencia("titular_vs_solicitante", { valores: [] });
    assert.ok(!esquemaInconsistencia.safeParse(vacia).success);
  });

  it("un uso con adjunto sin fragmento (o al revés) no es válido", () => {
    const mal = inconsistencia("titular_vs_solicitante", {
      valores: [{ ...usoDocumento("titular", "X"), fragmento: null }],
    });
    assert.ok(!esquemaInconsistencia.safeParse(mal).success);
    const otro = inconsistencia("titular_vs_solicitante", {
      valores: [usoDocumento("titular", "X"), { ...usoIdentidad, fragmento: "algo" }],
    });
    assert.ok(!esquemaInconsistencia.safeParse(otro).success);
  });

  it("corregible solo se acepta para titular, empleador_vs_pagador y periodo_no_mensual", () => {
    for (const regla of ["titular_vs_solicitante", "empleador_vs_pagador", "periodo_no_mensual"]) {
      assert.ok(esquemaInconsistencia.safeParse(inconsistencia(regla)).success, regla);
    }
    for (const regla of ["periodos_superpuestos", "huecos_entre_periodos"]) {
      assert.ok(!esquemaInconsistencia.safeParse(inconsistencia(regla)).success, regla);
      assert.ok(
        esquemaInconsistencia.safeParse(inconsistencia(regla, { corregible: false })).success,
        regla,
      );
    }
  });

  it("regla solo admite los cinco valores de R4", () => {
    assert.deepEqual(
      [...REGLAS_CONSISTENCIA],
      [
        "titular_vs_solicitante",
        "empleador_vs_pagador",
        "periodos_superpuestos",
        "periodo_no_mensual",
        "huecos_entre_periodos",
      ],
    );
    assert.ok(!esquemaInconsistencia.safeParse(inconsistencia("otra_regla")).success);
  });

  it("el tipo inferido sirve para armar inconsistencias", () => {
    const i: Inconsistencia = esquemaInconsistencia.parse(inconsistencia("titular_vs_solicitante"));
    const v: VerificacionIngreso = esquemaVerificacionIngreso.parse(
      verificacion("inconsistencia", { ...sinIngreso, inconsistencias: [i] }),
    );
    assert.equal(v.inconsistencias[0]?.regla, "titular_vs_solicitante");
  });
});
