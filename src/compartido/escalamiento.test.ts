import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DESCRIPCION_ESCALAR_A_ANALISTA,
  claveIdempotenciaEscalamiento,
  esquemaEntradaEscalamiento,
  esquemaResultadoEscalamiento,
  esquemaResumenAnalista,
  validarEntradaEscalamiento,
  type ResumenAnalista,
} from "./escalamiento.ts";
import { aRegistro, ejemploCertificado } from "./ingreso-ejemplos.ts";
import type { VerificacionRegistrada } from "./solicitud.ts";

const CORRELATION_ID = "6f1c2e4a-8d3b-4a57-9c10-2b7e5a9d4f31";

const afirmacion = { tipo: "afirmacion", fragmento: "quiero 4 millones" };

/** La entrada mínima válida: una petición de persona. */
const entrada = (cambios: Record<string, unknown> = {}) => ({
  correlationId: CORRELATION_ID,
  claveIdempotencia: claveIdempotenciaEscalamiento(CORRELATION_ID),
  causa: "peticion_de_persona",
  motivo: "pide_persona",
  ...cambios,
});

const verificacion = (): VerificacionRegistrada => ({
  estado: "discrepancia",
  ingresoVerificado: {
    monto: 3_800_000,
    origen: "certificado",
    montoCertificado: 3_800_000,
    montoExtractos: null,
    extractosContados: 0,
    usos: [],
    noUsados: [],
  },
  discrepancia: {
    declarado: 4_300_000,
    verificado: 3_800_000,
    diferencia: 500_000,
    umbralPorcentaje: 10,
    supera: true,
    diferenciaPorcentaje: 13.16,
  },
  inconsistencias: [],
  sinContrastar: [],
  calculadaEn: "2026-10-18T12:00:00.000Z",
});

/** El resumen más vacío posible: nada identificado y todo pendiente. */
const resumenVacio = (): Record<string, unknown> => ({
  idEscalamiento: "ESC-0001000001",
  correlationId: CORRELATION_ID,
  claveIdempotencia: claveIdempotenciaEscalamiento(CORRELATION_ID),
  escaladoEn: "2026-10-18T12:00:00.000Z",
  versionPolitica: "2026-10-18.4",
  causa: "peticion_de_persona",
  motivo: "pide_persona",
  regla: "Regla 4 · el solicitante pide hablar con una persona",
  accionRecomendada: "contactar_al_solicitante",
  causasAdicionales: [],
  solicitante: { identificado: false },
  solicitud: null,
  monto: null,
  plazoMeses: null,
  ingresoDeclarado: null,
  verificacionIngreso: null,
  discrepancias: [],
  datosExtraidos: [],
  decision: null,
  pendientes: ["identidad", "monto", "plazo", "ingreso_verificado", "documentos"],
});

/** Un resumen completo: identificado, con solicitud, ingresos, discrepancia y un documento extraído. */
const resumenCompleto = (): Record<string, unknown> => ({
  ...resumenVacio(),
  causa: "discrepancia_de_ingreso",
  motivo: "discrepancia_de_ingreso",
  regla: "Regla 3 · ingreso verificado desde los documentos",
  accionRecomendada: "verificar_ingresos_con_soporte",
  solicitante: {
    identificado: true,
    idSolicitante: "CLI-0001000001",
    nombre: "Ana Pérez Ficticia",
    documentoEnmascarado: "******4567",
  },
  solicitud: { idSolicitud: "SOL-0001000010", estado: "en_estudio" },
  monto: { valor: 4_000_000, procedencia: afirmacion },
  plazoMeses: { valor: 24, procedencia: { ...afirmacion, fragmento: "a 24 meses" } },
  ingresoDeclarado: {
    valor: 4_300_000,
    procedencia: { ...afirmacion, fragmento: "gano 4.300.000" },
  },
  verificacionIngreso: verificacion(),
  discrepancias: [
    {
      tipo: "ingreso",
      declarado: 4_300_000,
      verificado: 3_800_000,
      diferenciaPorcentaje: 13.16,
      umbralPorcentaje: 10,
    },
  ],
  datosExtraidos: [aRegistro(ejemploCertificado())],
  pendientes: [],
});

const analiza = (resumen: Record<string, unknown>) => esquemaResumenAnalista.safeParse(resumen);

describe("compartido: esquemaEntradaEscalamiento", () => {
  it("acepta la entrada mínima", () => {
    assert.equal(esquemaEntradaEscalamiento.safeParse(entrada()).success, true);
  });

  it("rechaza un campo que el core toma de su estado", () => {
    for (const campo of ["solicitante", "ingresoVerificado", "accionRecomendada", "regla"]) {
      assert.equal(
        esquemaEntradaEscalamiento.safeParse(entrada({ [campo]: "x" })).success,
        false,
        campo,
      );
    }
  });

  it("la clave de idempotencia lleva de 1 a 64 caracteres", () => {
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(entrada({ claveIdempotencia: "" })).success,
      false,
    );
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(entrada({ claveIdempotencia: "a".repeat(64) })).success,
      true,
    );
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(entrada({ claveIdempotencia: "a".repeat(65) })).success,
      false,
    );
  });

  it("la causa y el motivo salen de los catálogos", () => {
    assert.equal(esquemaEntradaEscalamiento.safeParse(entrada({ causa: "otra" })).success, false);
    assert.equal(esquemaEntradaEscalamiento.safeParse(entrada({ motivo: "otro" })).success, false);
  });

  it("el código solo va con la preaprobación fuera de política, y siempre", () => {
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(entrada({ codigo: "monto_sobre_tope" })).success,
      false,
    );
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(
        entrada({
          causa: "monto_sobre_umbral",
          motivo: "preaprobacion_fuera_de_politica",
          codigo: "monto_sobre_tope",
        }),
      ).success,
      true,
    );
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(
        entrada({ causa: "monto_sobre_umbral", motivo: "preaprobacion_fuera_de_politica" }),
      ).success,
      false,
    );
  });

  it("las causas adicionales son hasta 8, coherentes y ninguna repite la principal", () => {
    const adicional = { causa: "caso_no_cubierto", motivo: "caso_no_cubierto" };
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(entrada({ causasAdicionales: [adicional] })).success,
      true,
    );
    const ocho = [
      "caso_no_cubierto",
      "identidad_ambigua",
      "identidad_no_verificable",
      "inconsistencia_documental",
      "documento_no_extraible",
      "falla_transitoria_persistente",
      "falla_del_agente",
      "limite_de_turnos",
    ].map((motivo) => ({ causa: "caso_no_cubierto", motivo }));
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(entrada({ causasAdicionales: ocho })).success,
      true,
    );
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(
        entrada({
          causasAdicionales: [
            ...ocho,
            { causa: "caso_no_cubierto", motivo: "respuesta_incompleta" },
          ],
        }),
      ).success,
      false,
    );
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(
        entrada({ causasAdicionales: [{ causa: "caso_no_cubierto", motivo: "pide_persona" }] }),
      ).success,
      false,
      "causa incoherente con su motivo",
    );
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(
        entrada({ causasAdicionales: [{ causa: "peticion_de_persona", motivo: "pide_persona" }] }),
      ).success,
      false,
      "repite la principal",
    );
  });

  it("declarado lleva monto y plazo opcionales, cada uno con valor y procedencia", () => {
    const declarado = {
      monto: { valor: 4_000_000, procedencia: afirmacion },
      plazoMeses: { valor: 24, procedencia: afirmacion },
    };
    assert.equal(esquemaEntradaEscalamiento.safeParse(entrada({ declarado })).success, true);
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(entrada({ declarado: { monto: declarado.monto } }))
        .success,
      true,
    );
    assert.equal(
      esquemaEntradaEscalamiento.safeParse(entrada({ declarado: { monto: { valor: 4_000_000 } } }))
        .success,
      false,
      "sin procedencia",
    );
  });
});

describe("compartido: validarEntradaEscalamiento", () => {
  const error = (valor: unknown) => {
    const validacion = validarEntradaEscalamiento(valor);
    assert.equal(validacion.ok, false);
    return validacion.ok ? null : validacion.error;
  };

  it("devuelve la entrada de una petición de persona", () => {
    const validacion = validarEntradaEscalamiento(entrada());
    assert.equal(validacion.ok, true);
  });

  it("una entrada que no es un objeto es formato_invalido sobre entrada", () => {
    for (const valor of [null, "x", 3, [], undefined]) {
      const e = error(valor);
      assert.equal(e?.codigo, "formato_invalido");
      assert.equal(e?.campo, "entrada");
    }
  });

  it("un campo mal formado es formato_invalido y lo nombra", () => {
    const casos: [Record<string, unknown>, string][] = [
      [{ correlationId: "no-es-uuid" }, "correlationId"],
      [{ claveIdempotencia: "" }, "claveIdempotencia"],
      [{ claveIdempotencia: "a".repeat(65) }, "claveIdempotencia"],
      [{ causa: "otra" }, "causa"],
      [{ motivo: "otro" }, "motivo"],
      [{ codigo: "otro" }, "codigo"],
      [{ causasAdicionales: "x" }, "causasAdicionales"],
      [{ declarado: "x" }, "declarado"],
    ];
    for (const [cambio, campo] of casos) {
      const e = error(entrada(cambio));
      assert.equal(e?.codigo, "formato_invalido", campo);
      assert.equal(e?.campo, campo);
    }
  });

  it("un campo de más es formato_invalido y lo nombra", () => {
    const e = error(entrada({ solicitante: "Ana" }));
    assert.equal(e?.codigo, "formato_invalido");
    assert.equal(e?.campo, "solicitante");
  });

  it("un código con otro motivo, o la Regla 2 sin código, es formato_invalido sobre codigo", () => {
    const sobra = error(entrada({ codigo: "monto_sobre_tope" }));
    assert.equal(sobra?.codigo, "formato_invalido");
    assert.equal(sobra?.campo, "codigo");
    const falta = error(
      entrada({ causa: "monto_sobre_umbral", motivo: "preaprobacion_fuera_de_politica" }),
    );
    assert.equal(falta?.codigo, "formato_invalido");
    assert.equal(falta?.campo, "codigo");
  });

  it("una causa que no corresponde al motivo es causa_incoherente sobre causa", () => {
    const e = error(entrada({ causa: "caso_no_cubierto" }));
    assert.equal(e?.codigo, "causa_incoherente");
    assert.equal(e?.campo, "causa");
  });

  it("una causa adicional incoherente o repetida es un error sobre causasAdicionales", () => {
    const incoherente = error(
      entrada({ causasAdicionales: [{ causa: "monto_sobre_umbral", motivo: "pide_persona" }] }),
    );
    assert.equal(incoherente?.codigo, "causa_incoherente");
    assert.equal(incoherente?.campo, "causasAdicionales");
    const repetida = error(
      entrada({ causasAdicionales: [{ causa: "peticion_de_persona", motivo: "pide_persona" }] }),
    );
    assert.equal(repetida?.codigo, "formato_invalido");
    assert.equal(repetida?.campo, "causasAdicionales");
  });

  it("un declarado sin procedencia es procedencia_faltante sobre procedencia.monto", () => {
    const e = error(entrada({ declarado: { monto: { valor: 4_000_000 } } }));
    assert.equal(e?.codigo, "procedencia_faltante");
    assert.equal(e?.campo, "procedencia.monto");
  });

  it("un declarado con una procedencia mal formada es procedencia_invalida sobre su campo", () => {
    const e = error(
      entrada({ declarado: { plazoMeses: { valor: 24, procedencia: { tipo: "otro" } } } }),
    );
    assert.equal(e?.codigo, "procedencia_invalida");
    assert.equal(e?.campo, "procedencia.plazoMeses");
  });

  it("un valor de declarado que no es un entero positivo es formato_invalido sobre declarado", () => {
    for (const valor of [0, -5, 4.5, "4"]) {
      const e = error(entrada({ declarado: { monto: { valor, procedencia: afirmacion } } }));
      assert.equal(e?.codigo, "formato_invalido", String(valor));
      assert.equal(e?.campo, "declarado", String(valor));
    }
  });

  it("los mensajes de error no repiten la cita del solicitante", () => {
    const e = error(
      entrada({
        declarado: {
          monto: { valor: 4_000_000, procedencia: { tipo: "otro", fragmento: "SECRETO" } },
        },
      }),
    );
    assert.equal(e?.mensaje.includes("SECRETO"), false);
  });
});

describe("compartido: esquemaResumenAnalista", () => {
  it("acepta un resumen sin identificar y con todo pendiente", () => {
    assert.equal(analiza(resumenVacio()).success, true);
  });

  it("acepta un resumen completo y sin pendientes", () => {
    const resultado = analiza(resumenCompleto());
    assert.equal(resultado.success, true, JSON.stringify(resultado.error?.issues));
  });

  it("un solicitante identificado trae idSolicitante, nombre y documento enmascarado", () => {
    const sinNombre = {
      ...resumenCompleto(),
      solicitante: {
        identificado: true,
        idSolicitante: "CLI-0001000001",
        documentoEnmascarado: "x",
      },
    };
    assert.equal(analiza(sinNombre).success, false);
    const conExtra = { ...resumenVacio(), solicitante: { identificado: false, nombre: "Ana" } };
    assert.equal(analiza(conExtra).success, false);
  });

  it("la discrepancia documental trae su regla y sus adjuntos", () => {
    const documental = {
      ...resumenCompleto(),
      discrepancias: [{ tipo: "documental", regla: "titular_distinto", adjuntos: [2, 3] }],
    };
    assert.equal(analiza(documental).success, true);
    const sinAdjuntos = {
      ...resumenCompleto(),
      discrepancias: [{ tipo: "documental", regla: "titular_distinto" }],
    };
    assert.equal(analiza(sinAdjuntos).success, false);
  });

  it("el identificador de escalamiento es ESC-000 más 7 dígitos", () => {
    assert.equal(analiza({ ...resumenVacio(), idEscalamiento: "ESC-0001000001" }).success, true);
    for (const id of ["ESC-1001000001", "ESC-000100000", "SOL-0001000001", "ESC-00010000012"]) {
      assert.equal(analiza({ ...resumenVacio(), idEscalamiento: id }).success, false, id);
    }
  });

  it("los pendientes son exactamente lo que falta", () => {
    assert.equal(analiza({ ...resumenVacio(), pendientes: ["identidad"] }).success, false);
    assert.equal(
      analiza({ ...resumenVacio(), pendientes: ["identidad", "monto", "plazo", "documentos"] })
        .success,
      false,
      "falta ingreso_verificado",
    );
    assert.equal(
      analiza({ ...resumenCompleto(), pendientes: ["monto"] }).success,
      false,
      "el monto está presente",
    );
    assert.equal(
      analiza({
        ...resumenVacio(),
        pendientes: ["identidad", "monto", "plazo", "ingreso_verificado", "documentos", "monto"],
      }).success,
      false,
      "sin repetidos",
    );
  });

  it("sin ingreso verificado dentro de la verificación, el ingreso queda pendiente", () => {
    const sinIngreso = {
      ...resumenCompleto(),
      verificacionIngreso: {
        ...verificacion(),
        estado: "sin_ingreso",
        ingresoVerificado: null,
        discrepancia: null,
      },
      discrepancias: [],
      pendientes: ["ingreso_verificado"],
    };
    const resultado = analiza(sinIngreso);
    assert.equal(resultado.success, true, JSON.stringify(resultado.error?.issues));
  });

  it("la causa debe coincidir con el motivo y el código", () => {
    assert.equal(analiza({ ...resumenVacio(), causa: "caso_no_cubierto" }).success, false);
    assert.equal(
      analiza({
        ...resumenVacio(),
        causa: "monto_sobre_umbral",
        motivo: "preaprobacion_fuera_de_politica",
        codigo: "monto_sobre_tope",
        accionRecomendada: "revisar_con_simulacion_de_cuota",
        regla: "Regla 2 · preaprobación dentro de la política",
      }).success,
      true,
    );
  });

  it("la acción recomendada debe coincidir con el motivo y el código", () => {
    assert.equal(
      analiza({ ...resumenVacio(), accionRecomendada: "atender_falla_tecnica" }).success,
      false,
    );
  });

  it("cada causa adicional trae su acción coherente y ninguna repite la principal", () => {
    const adicional = {
      causa: "caso_no_cubierto",
      motivo: "caso_no_cubierto",
      accionRecomendada: "revisar_tipo_de_documento_o_moneda",
    };
    assert.equal(analiza({ ...resumenVacio(), causasAdicionales: [adicional] }).success, true);
    assert.equal(
      analiza({
        ...resumenVacio(),
        causasAdicionales: [{ ...adicional, accionRecomendada: "atender_falla_tecnica" }],
      }).success,
      false,
      "acción incoherente",
    );
    assert.equal(
      analiza({
        ...resumenVacio(),
        causasAdicionales: [
          {
            causa: "peticion_de_persona",
            motivo: "pide_persona",
            accionRecomendada: "contactar_al_solicitante",
          },
        ],
      }).success,
      false,
      "repite la principal",
    );
  });

  it("un dato con valor lleva su procedencia", () => {
    assert.equal(analiza({ ...resumenCompleto(), monto: { valor: 4_000_000 } }).success, false);
  });

  it("no admite campos con el texto de los archivos", () => {
    assert.equal(analiza({ ...resumenVacio(), contenido: "texto del archivo" }).success, false);
  });

  it("la decisión explicable trae regla, motivo, valores y versión", () => {
    const decision = {
      regla: "Regla 2 · preaprobación dentro de la política",
      motivo: "El monto supera el tope.",
      valores: { monto: 6_000_000, plazoMeses: 24 },
      versionPolitica: "2026-10-18.4",
    };
    assert.equal(analiza({ ...resumenVacio(), decision }).success, true);
    assert.equal(
      analiza({ ...resumenVacio(), decision: { ...decision, valores: undefined } }).success,
      false,
    );
  });
});

describe("compartido: esquemaResultadoEscalamiento", () => {
  it("lleva el resumen y si fue una repetición", () => {
    const resumen: ResumenAnalista = esquemaResumenAnalista.parse(resumenVacio());
    assert.equal(
      esquemaResultadoEscalamiento.safeParse({ escalamiento: resumen, repetida: false }).success,
      true,
    );
    assert.equal(esquemaResultadoEscalamiento.safeParse({ escalamiento: resumen }).success, false);
    assert.equal(
      esquemaResultadoEscalamiento.safeParse({ escalamiento: resumen, repetida: false, otro: 1 })
        .success,
      false,
    );
  });
});

describe("compartido: claveIdempotenciaEscalamiento", () => {
  it("es determinista y distinta por conversación", () => {
    const otra = "0b7d9a2c-1e44-4f6a-8c53-7d2f9e1a6b08";
    assert.equal(
      claveIdempotenciaEscalamiento(CORRELATION_ID),
      claveIdempotenciaEscalamiento(CORRELATION_ID),
    );
    assert.notEqual(
      claveIdempotenciaEscalamiento(CORRELATION_ID),
      claveIdempotenciaEscalamiento(otra),
    );
  });

  it("lleva 64 caracteres como máximo", () => {
    assert.ok(claveIdempotenciaEscalamiento(CORRELATION_ID).length <= 64);
  });
});

describe("compartido: DESCRIPCION_ESCALAR_A_ANALISTA", () => {
  const texto = DESCRIPCION_ESCALAR_A_ANALISTA;

  it("dice que entrega el caso a un analista con un resumen que arma el sistema", () => {
    assert.match(texto, /analista de crédito/);
    assert.match(texto, /resumen completo que arma el sistema/);
  });

  it("dice que se puede usar sin identidad verificada y sin solicitud registrada", () => {
    assert.match(texto, /sin identidad verificada y sin solicitud registrada/);
    assert.match(texto, /pendiente/);
  });

  it("dice que solo recibe la causa y que lo demás lo toma el sistema de su estado", () => {
    assert.match(texto, /Solo recibe la causa clasificada/);
    assert.match(texto, /de su propio estado/);
  });

  it("dice que es idempotente", () => {
    assert.match(texto, /idempotente/);
    assert.match(texto, /mismo resumen/);
  });

  it("dice que escalar no decide el crédito", () => {
    assert.match(texto, /no aprueba ni rechaza/);
  });

  it("no da ningún literal de umbral al modelo", () => {
    for (const literal of ["5.000.000", "5_000_000", "30 %", "30%", "10 %", "10%"]) {
      assert.equal(texto.includes(literal), false, literal);
    }
  });
});
