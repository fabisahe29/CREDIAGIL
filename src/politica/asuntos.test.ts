import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ASUNTOS,
  ESTADOS_ASUNTO,
  MOTIVOS_PENDIENTE,
  asuntosPendientes,
  detectarAsuntos,
  estadoDeAsuntos,
  type Asunto,
  type AsuntoObservado,
  type EntradaEstado,
  type ObservacionLlamada,
} from "./asuntos.ts";
import { MOTIVOS_ESCALAMIENTO, type MotivoEscalamiento } from "./escalamiento.ts";

/** El mensaje de ejemplo del enunciado, literal (specs/014, historia 4). */
const MENSAJE_ENUNCIADO =
  "Hola, quiero pedir un crédito de $4.000.000 a 24 meses. Te pego mi certificado laboral y mis extractos de los últimos tres meses. Gano más o menos $3.500.000 al mes. ¿En cuánto me quedaría la cuota?";

describe("política: catálogos de los asuntos del mensaje", () => {
  it("los asuntos son exactamente solicitud, documentos y cuota", () => {
    assert.deepEqual([...ASUNTOS], ["solicitud", "documentos", "cuota"]);
  });

  it("los estados son resuelto, pendiente y escalado", () => {
    assert.deepEqual([...ESTADOS_ASUNTO], ["resuelto", "pendiente", "escalado"]);
  });

  it("los motivos de un asunto pendiente son los cuatro del contrato", () => {
    assert.deepEqual(
      [...MOTIVOS_PENDIENTE],
      ["falta_identidad", "falta_dato", "lo_revisara_el_analista", "sin_atender"],
    );
  });
});

describe("política: detectarAsuntos", () => {
  const casos: { mensaje: string; documentos: boolean; esperado: Asunto[] }[] = [
    {
      mensaje: "¿Cuánto pagaría al mes por 4 millones a 24 meses?",
      documentos: false,
      esperado: ["cuota"],
    },
    {
      mensaje: "Quiero un crédito, te adjunto mi certificado",
      documentos: true,
      esperado: ["solicitud", "documentos"],
    },
    {
      mensaje: "Quiero un crédito y saber la cuota",
      documentos: true,
      esperado: ["solicitud", "documentos", "cuota"],
    },
    { mensaje: "Hola", documentos: false, esperado: [] },
    {
      mensaje: "No quiero un crédito, solo dime la cuota",
      documentos: false,
      esperado: ["cuota"],
    },
    {
      mensaje: "Necesito un préstamo de 3 millones",
      documentos: false,
      esperado: ["solicitud"],
    },
    {
      mensaje: "Quiero iniciar mi solicitud",
      documentos: false,
      esperado: ["solicitud"],
    },
    {
      mensaje: "¿Cuánto me costaría al mes? Tengo ingresos de 5 millones",
      documentos: false,
      esperado: ["cuota"],
    },
    {
      mensaje: "Quiero saber cómo va mi solicitud",
      documentos: false,
      esperado: [],
    },
    {
      mensaje: "Quiero pagar sin cuota inicial",
      documentos: false,
      esperado: [],
    },
  ];

  for (const { mensaje, documentos, esperado } of casos) {
    it(`«${mensaje}» con documentos nuevos = ${String(documentos)} devuelve ${JSON.stringify(esperado)}`, () => {
      assert.deepEqual(detectarAsuntos(mensaje, documentos), esperado);
    });
  }

  it("el mensaje literal del enunciado devuelve los tres asuntos", () => {
    assert.deepEqual(detectarAsuntos(MENSAJE_ENUNCIADO, true), [
      "solicitud",
      "documentos",
      "cuota",
    ]);
  });

  it("sin adjuntos nuevos, el mensaje del enunciado no plantea documentos aunque los mencione", () => {
    assert.deepEqual(detectarAsuntos(MENSAJE_ENUNCIADO, false), ["solicitud", "cuota"]);
  });

  it("ignora mayúsculas y tildes", () => {
    assert.deepEqual(detectarAsuntos("QUIERO PEDIR UN CREDITO Y SABER LA CUOTA", false), [
      "solicitud",
      "cuota",
    ]);
  });

  it("documentos sale de los adjuntos nuevos aunque el texto no hable de documentos", () => {
    assert.deepEqual(detectarAsuntos("Hola", true), ["documentos"]);
  });

  it("documentos no sale sin adjuntos nuevos aunque el texto diga «adjunto»", () => {
    assert.deepEqual(detectarAsuntos("Te adjunto mi certificado", false), []);
  });

  it("devuelve los asuntos en el orden del catálogo y sin repetir", () => {
    const asuntos = detectarAsuntos(
      "¿Cuánta cuota pagaría? Quiero pedir un crédito, de verdad quiero pedir un crédito. ¿La cuota?",
      true,
    );
    assert.deepEqual(asuntos, ["solicitud", "documentos", "cuota"]);
  });

  it("es conservadora: un mensaje sin expresiones reconocidas no inventa asuntos", () => {
    assert.deepEqual(detectarAsuntos("Buenas tardes, gracias por la ayuda", false), []);
  });
});
// ---------------------------------------------------------------------------------------------
// Estado de cada asunto
// ---------------------------------------------------------------------------------------------

const AVISO = "Simulación no vinculante con el ingreso que declaraste, que no está verificado.";

const llamada = (
  herramienta: string,
  extra: Partial<ObservacionLlamada> = {},
): ObservacionLlamada => ({
  herramienta,
  ok: true,
  ...extra,
});

const simulacion = llamada("calcular_capacidad_pago", {
  simulacion: { cuotaMensual: 206723, aviso: AVISO },
});

const registroConFaltantes = (faltantes: number) => llamada("registrar_extraccion", { faltantes });

function entrada(parcial: Partial<EntradaEstado> = {}): EntradaEstado {
  return {
    esperados: [],
    documentosNuevos: 0,
    observaciones: [],
    bloqueosPorIdentidad: [],
    senales: [],
    ...parcial,
  };
}

const senal = (motivo: MotivoEscalamiento) => ({ motivo });

function estadoDe(asunto: Asunto, parcial: Partial<EntradaEstado>): AsuntoObservado {
  const encontrado = estadoDeAsuntos(entrada({ esperados: [asunto], ...parcial })).find(
    (a) => a.asunto === asunto,
  );
  assert.ok(encontrado, `el asunto ${asunto} debe aparecer`);
  return encontrado;
}

describe("política: estadoDeAsuntos, cuota", () => {
  it("queda resuelta con la cuota y el aviso del core", () => {
    const cuota = estadoDe("cuota", { observaciones: [simulacion] });
    assert.equal(cuota.estado, "resuelto");
    assert.ok(cuota.resultado?.includes("$206.723"), cuota.resultado ?? "");
    assert.ok(cuota.resultado?.includes(AVISO), cuota.resultado ?? "");
    assert.equal(cuota.motivo, undefined);
  });

  it("una simulación que salió bien prevalece sobre un intento anterior inválido", () => {
    const cuota = estadoDe("cuota", {
      observaciones: [
        llamada("calcular_capacidad_pago", {
          ok: false,
          codigoError: "ingreso_invalido",
        }),
        simulacion,
      ],
    });
    assert.equal(cuota.estado, "resuelto");
  });

  for (const codigo of [
    "monto_invalido",
    "plazo_invalido",
    "ingreso_invalido",
    "formato_invalido",
  ]) {
    it(`un error de validación ${codigo} la deja pendiente por falta de un dato`, () => {
      const cuota = estadoDe("cuota", {
        observaciones: [
          llamada("calcular_capacidad_pago", {
            ok: false,
            codigoError: codigo,
          }),
        ],
      });
      assert.deepEqual(cuota, {
        asunto: "cuota",
        estado: "pendiente",
        motivo: "falta_dato",
      });
    });
  }

  it("un error transitorio no es un dato que falte: queda sin atender", () => {
    const cuota = estadoDe("cuota", {
      observaciones: [
        llamada("calcular_capacidad_pago", {
          ok: false,
          codigoError: "no_disponible",
        }),
      ],
    });
    assert.deepEqual(cuota, {
      asunto: "cuota",
      estado: "pendiente",
      motivo: "sin_atender",
    });
  });

  it("sin llamada queda pendiente sin atender", () => {
    assert.deepEqual(estadoDe("cuota", {}), {
      asunto: "cuota",
      estado: "pendiente",
      motivo: "sin_atender",
    });
  });

  it("nunca queda escalada por sí sola: una señal de discrepancia no la cambia", () => {
    const cuota = estadoDe("cuota", {
      senales: [senal("discrepancia_de_ingreso")],
    });
    assert.equal(cuota.estado, "pendiente");
  });
});

describe("política: estadoDeAsuntos, documentos", () => {
  for (const motivo of [
    "caso_no_cubierto",
    "documento_no_extraible",
    "inconsistencia_documental",
  ] as const) {
    it(`la señal ${motivo} los deja escalados`, () => {
      assert.deepEqual(
        estadoDe("documentos", {
          documentosNuevos: 1,
          senales: [senal(motivo)],
        }),
        {
          asunto: "documentos",
          estado: "escalado",
        },
      );
    });
  }

  it("se resuelven con un registro de extracción por cada adjunto nuevo y sin faltantes", () => {
    const documentos = estadoDe("documentos", {
      documentosNuevos: 2,
      observaciones: [registroConFaltantes(0), registroConFaltantes(0)],
    });
    assert.equal(documentos.estado, "resuelto");
    assert.equal(documentos.resultado, "listo");
  });

  it("con menos registros que adjuntos nuevos no están resueltos", () => {
    const documentos = estadoDe("documentos", {
      documentosNuevos: 2,
      observaciones: [registroConFaltantes(0)],
    });
    assert.equal(documentos.estado, "pendiente");
  });

  it("un documento con campos faltantes queda pendiente por falta de un dato", () => {
    assert.deepEqual(
      estadoDe("documentos", {
        documentosNuevos: 1,
        observaciones: [registroConFaltantes(2)],
      }),
      { asunto: "documentos", estado: "pendiente", motivo: "falta_dato" },
    );
  });

  it("un bloqueo de una herramienta de documentos los deja pendientes por falta de identidad", () => {
    for (const herramienta of ["extraer_documento", "verificar_ingreso"]) {
      assert.deepEqual(
        estadoDe("documentos", {
          documentosNuevos: 1,
          bloqueosPorIdentidad: [herramienta],
        }),
        {
          asunto: "documentos",
          estado: "pendiente",
          motivo: "falta_identidad",
        },
      );
    }
  });

  it("sin identidad verificada y sin resultado quedan pendientes por falta de identidad aunque nada los bloqueara", () => {
    assert.deepEqual(
      estadoDe("documentos", {
        documentosNuevos: 1,
        identidadVerificada: false,
      }),
      {
        asunto: "documentos",
        estado: "pendiente",
        motivo: "falta_identidad",
      },
    );
  });

  it("con la identidad verificada y sin resultado quedan sin atender", () => {
    assert.deepEqual(
      estadoDe("documentos", {
        documentosNuevos: 1,
        identidadVerificada: true,
      }),
      {
        asunto: "documentos",
        estado: "pendiente",
        motivo: "sin_atender",
      },
    );
  });

  it("si no se sabe si la identidad está verificada quedan sin atender", () => {
    assert.equal(estadoDe("documentos", { documentosNuevos: 1 }).motivo, "sin_atender");
  });
});

describe("política: estadoDeAsuntos, solicitud", () => {
  for (const motivo of [
    "identidad_ambigua",
    "identidad_no_verificable",
    "discrepancia_de_ingreso",
    "inconsistencia_documental",
    "preaprobacion_fuera_de_politica",
  ] as const) {
    it(`la señal ${motivo} la deja escalada, aunque ya estuviera registrada`, () => {
      const solicitud = estadoDe("solicitud", {
        senales: [senal(motivo)],
        observaciones: [llamada("registrar_solicitud", { idSolicitud: "SOL-0001000001" })],
      });
      assert.deepEqual(solicitud, { asunto: "solicitud", estado: "escalado" });
    });
  }

  it("se resuelve con el registro y dice su identificador", () => {
    const solicitud = estadoDe("solicitud", {
      observaciones: [llamada("registrar_solicitud", { idSolicitud: "SOL-0001000001" })],
    });
    assert.equal(solicitud.estado, "resuelto");
    assert.ok(solicitud.resultado?.includes("SOL-0001000001"), solicitud.resultado ?? "");
  });

  it("se resuelve con la preaprobación", () => {
    const solicitud = estadoDe("solicitud", {
      observaciones: [llamada("preaprobar_credito")],
    });
    assert.equal(solicitud.estado, "resuelto");
    assert.equal(solicitud.resultado, "preaprobada");
  });

  it("un bloqueo de registro o de preaprobación la deja pendiente por falta de identidad", () => {
    for (const herramienta of ["registrar_solicitud", "preaprobar_credito"]) {
      assert.deepEqual(estadoDe("solicitud", { bloqueosPorIdentidad: [herramienta] }), {
        asunto: "solicitud",
        estado: "pendiente",
        motivo: "falta_identidad",
      });
    }
  });

  it("sin identidad verificada y sin resultado queda pendiente por falta de identidad", () => {
    assert.deepEqual(estadoDe("solicitud", { identidadVerificada: false }), {
      asunto: "solicitud",
      estado: "pendiente",
      motivo: "falta_identidad",
    });
  });

  it("una falla técnica no la cambia: queda sin atender", () => {
    assert.deepEqual(
      estadoDe("solicitud", {
        senales: [senal("falla_transitoria_persistente")],
      }),
      {
        asunto: "solicitud",
        estado: "pendiente",
        motivo: "sin_atender",
      },
    );
  });
});

describe("política: estadoDeAsuntos, la petición de persona y el conjunto del turno", () => {
  it("la Regla 4 deja todos los asuntos pendientes para el analista, aunque haya observaciones", () => {
    const asuntos = estadoDeAsuntos(
      entrada({
        esperados: ["solicitud", "documentos", "cuota"],
        documentosNuevos: 1,
        observaciones: [simulacion],
        senales: [senal("pide_persona")],
      }),
    );
    assert.deepEqual(
      asuntos,
      ASUNTOS.map((asunto) => ({
        asunto,
        estado: "pendiente",
        motivo: "lo_revisara_el_analista",
      })),
    );
  });

  it("un asunto que solo muestran las herramientas entra al conjunto una sola vez, en el orden del catálogo", () => {
    const asuntos = estadoDeAsuntos(
      entrada({
        esperados: ["documentos"],
        documentosNuevos: 1,
        observaciones: [simulacion, simulacion, registroConFaltantes(0)],
      }),
    );
    assert.deepEqual(
      asuntos.map((a) => a.asunto),
      ["documentos", "cuota"],
    );
  });

  it("un bloqueo por identidad también muestra el asunto", () => {
    const asuntos = estadoDeAsuntos(entrada({ bloqueosPorIdentidad: ["registrar_solicitud"] }));
    assert.deepEqual(
      asuntos.map((a) => a.asunto),
      ["solicitud"],
    );
  });

  it("sin esperados ni observaciones no hay asuntos", () => {
    assert.deepEqual(estadoDeAsuntos(entrada()), []);
  });

  it("una falla técnica no cambia el estado de cada asunto", () => {
    const sin = estadoDeAsuntos(entrada({ esperados: [...ASUNTOS], documentosNuevos: 1 }));
    const con = estadoDeAsuntos(
      entrada({
        esperados: [...ASUNTOS],
        documentosNuevos: 1,
        senales: [senal("falla_transitoria_persistente")],
      }),
    );
    assert.deepEqual(con, sin);
  });

  it("resultado solo con resuelto y motivo solo con pendiente, con cada motivo de escalamiento", () => {
    for (const motivo of MOTIVOS_ESCALAMIENTO) {
      for (const a of estadoDeAsuntos(
        entrada({
          esperados: [...ASUNTOS],
          documentosNuevos: 1,
          senales: [senal(motivo)],
        }),
      )) {
        assert.equal(a.resultado !== undefined, a.estado === "resuelto", `${motivo}/${a.asunto}`);
        assert.equal(a.motivo !== undefined, a.estado === "pendiente", `${motivo}/${a.asunto}`);
      }
    }
  });

  it("es determinista", () => {
    const e = entrada({
      esperados: [...ASUNTOS],
      documentosNuevos: 2,
      observaciones: [simulacion],
    });
    assert.deepEqual(estadoDeAsuntos(e), estadoDeAsuntos(e));
  });
});

describe("política: asuntosPendientes", () => {
  it("devuelve solo los pendientes, en el orden del catálogo", () => {
    const asuntos: AsuntoObservado[] = [
      { asunto: "solicitud", estado: "escalado" },
      { asunto: "documentos", estado: "pendiente", motivo: "falta_identidad" },
      { asunto: "cuota", estado: "pendiente", motivo: "falta_dato" },
    ];
    assert.deepEqual(asuntosPendientes(asuntos), ["documentos", "cuota"]);
  });

  it("sin pendientes devuelve una lista vacía", () => {
    assert.deepEqual(
      asuntosPendientes([{ asunto: "cuota", estado: "resuelto", resultado: "x" }]),
      [],
    );
  });
});
