import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACCIONES_RECOMENDADAS,
  CAUSAS_ESCALAMIENTO,
  MOTIVOS_ESCALAMIENTO,
  ORDEN_REGLA,
  PENDIENTES,
  REGLA_4,
  REGLA_PIDE_PERSONA,
  accionRecomendada,
  causaDeEscalamiento,
  detectarPeticionPersona,
  reglaDeEscalamiento,
  type AccionRecomendada,
  type CausaEscalamiento,
  type MotivoEscalamiento,
} from "./escalamiento.ts";
import { CODIGOS_BLOQUEO } from "../compartido/preaprobacion.ts";
import { REGLA_2 } from "./preaprobacion.ts";
import { REGLA_3 } from "./ingreso.ts";
import { REGLA_5 } from "./documentos.ts";
import { MAX_INTENTOS_VERIFICACION } from "./politica.ts";

describe("política: catálogos del escalamiento", () => {
  it("las causas son exactamente las cinco de la spec", () => {
    assert.deepEqual(
      [...CAUSAS_ESCALAMIENTO],
      [
        "peticion_de_persona",
        "monto_sobre_umbral",
        "cuota_sobre_porcentaje",
        "discrepancia_de_ingreso",
        "caso_no_cubierto",
      ],
    );
  });

  it("los motivos son los doce de la señal de escalamiento", () => {
    assert.deepEqual(
      [...MOTIVOS_ESCALAMIENTO],
      [
        "pide_persona",
        "caso_no_cubierto",
        "identidad_ambigua",
        "identidad_no_verificable",
        "discrepancia_de_ingreso",
        "inconsistencia_documental",
        "documento_no_extraible",
        "preaprobacion_fuera_de_politica",
        "falla_transitoria_persistente",
        "falla_del_agente",
        "limite_de_turnos",
        "respuesta_incompleta",
      ],
    );
  });

  it("las acciones recomendadas son exactamente las siete del catálogo", () => {
    assert.deepEqual(
      [...ACCIONES_RECOMENDADAS],
      [
        "contactar_al_solicitante",
        "revisar_con_simulacion_de_cuota",
        "verificar_ingresos_con_soporte",
        "revisar_tipo_de_documento_o_moneda",
        "revisar_documentos_manualmente",
        "verificar_identidad_manualmente",
        "atender_falla_tecnica",
      ],
    );
  });

  it("lo que puede faltar en un resumen son cinco pendientes", () => {
    assert.deepEqual(
      [...PENDIENTES],
      ["identidad", "monto", "plazo", "ingreso_verificado", "documentos"],
    );
  });
});

interface Fila {
  motivo: MotivoEscalamiento;
  codigo?: (typeof CODIGOS_BLOQUEO)[number];
  causa: CausaEscalamiento;
  accion: AccionRecomendada;
}

/** La tabla de R1 (causa) y R2 (acción), una fila por combinación válida. */
const TABLA: readonly Fila[] = [
  { motivo: "pide_persona", causa: "peticion_de_persona", accion: "contactar_al_solicitante" },
  {
    motivo: "preaprobacion_fuera_de_politica",
    codigo: "monto_sobre_tope",
    causa: "monto_sobre_umbral",
    accion: "revisar_con_simulacion_de_cuota",
  },
  {
    motivo: "preaprobacion_fuera_de_politica",
    codigo: "cuota_sobre_porcentaje",
    causa: "cuota_sobre_porcentaje",
    accion: "revisar_con_simulacion_de_cuota",
  },
  {
    motivo: "preaprobacion_fuera_de_politica",
    codigo: "discrepancia_registrada",
    causa: "discrepancia_de_ingreso",
    accion: "verificar_ingresos_con_soporte",
  },
  {
    motivo: "preaprobacion_fuera_de_politica",
    codigo: "ingreso_no_verificado",
    causa: "caso_no_cubierto",
    accion: "revisar_documentos_manualmente",
  },
  {
    motivo: "preaprobacion_fuera_de_politica",
    codigo: "cuota_no_calculable",
    causa: "caso_no_cubierto",
    accion: "revisar_con_simulacion_de_cuota",
  },
  {
    motivo: "discrepancia_de_ingreso",
    causa: "discrepancia_de_ingreso",
    accion: "verificar_ingresos_con_soporte",
  },
  {
    motivo: "caso_no_cubierto",
    causa: "caso_no_cubierto",
    accion: "revisar_tipo_de_documento_o_moneda",
  },
  {
    motivo: "inconsistencia_documental",
    causa: "caso_no_cubierto",
    accion: "revisar_documentos_manualmente",
  },
  {
    motivo: "documento_no_extraible",
    causa: "caso_no_cubierto",
    accion: "revisar_documentos_manualmente",
  },
  {
    motivo: "identidad_ambigua",
    causa: "caso_no_cubierto",
    accion: "verificar_identidad_manualmente",
  },
  {
    motivo: "identidad_no_verificable",
    causa: "caso_no_cubierto",
    accion: "verificar_identidad_manualmente",
  },
  {
    motivo: "falla_transitoria_persistente",
    causa: "caso_no_cubierto",
    accion: "atender_falla_tecnica",
  },
  { motivo: "falla_del_agente", causa: "caso_no_cubierto", accion: "atender_falla_tecnica" },
  { motivo: "limite_de_turnos", causa: "caso_no_cubierto", accion: "atender_falla_tecnica" },
  { motivo: "respuesta_incompleta", causa: "caso_no_cubierto", accion: "atender_falla_tecnica" },
];

const entrada = (fila: Fila) => ({
  motivo: fila.motivo,
  ...(fila.codigo !== undefined ? { codigo: fila.codigo } : {}),
});

const nombre = (fila: Fila) =>
  fila.codigo === undefined ? fila.motivo : `${fila.motivo} con ${fila.codigo}`;

describe("política: causaDeEscalamiento y accionRecomendada, fila por fila", () => {
  for (const fila of TABLA) {
    it(`${nombre(fila)} da la causa ${fila.causa}`, () => {
      assert.equal(causaDeEscalamiento(entrada(fila)), fila.causa);
    });
    it(`${nombre(fila)} da la acción ${fila.accion}`, () => {
      assert.equal(accionRecomendada(entrada(fila)), fila.accion);
    });
  }

  it("la tabla cubre los doce motivos y los cinco códigos de la Regla 2", () => {
    assert.deepEqual(new Set(TABLA.map((f) => f.motivo)), new Set(MOTIVOS_ESCALAMIENTO));
    assert.deepEqual(
      new Set(TABLA.flatMap((f) => (f.codigo === undefined ? [] : [f.codigo]))),
      new Set(CODIGOS_BLOQUEO),
    );
  });

  it("cada causa pertenece al catálogo de causas y cada acción al de acciones", () => {
    for (const fila of TABLA) {
      assert.ok(CAUSAS_ESCALAMIENTO.includes(causaDeEscalamiento(entrada(fila))));
      assert.ok(ACCIONES_RECOMENDADAS.includes(accionRecomendada(entrada(fila))));
    }
  });

  it("un código con un motivo distinto de la preaprobación fuera de política lanza", () => {
    for (const motivo of MOTIVOS_ESCALAMIENTO) {
      if (motivo === "preaprobacion_fuera_de_politica") continue;
      assert.throws(() => causaDeEscalamiento({ motivo, codigo: "monto_sobre_tope" }), motivo);
      assert.throws(() => accionRecomendada({ motivo, codigo: "monto_sobre_tope" }), motivo);
    }
  });

  it("la preaprobación fuera de política sin código lanza", () => {
    assert.throws(() => causaDeEscalamiento({ motivo: "preaprobacion_fuera_de_politica" }));
    assert.throws(() => accionRecomendada({ motivo: "preaprobacion_fuera_de_politica" }));
  });
});

describe("política: la regla de cada motivo", () => {
  it("los doce motivos tienen un texto de regla no vacío", () => {
    for (const motivo of MOTIVOS_ESCALAMIENTO) {
      assert.ok(reglaDeEscalamiento(motivo).length > 0, motivo);
    }
  });

  it("REGLA_4 dice que el solicitante pide hablar con una persona", () => {
    assert.equal(REGLA_4, "Regla 4 · el solicitante pide hablar con una persona");
  });

  it("REGLA_PIDE_PERSONA conserva el nombre de antes y es igual a REGLA_4", () => {
    assert.equal(REGLA_PIDE_PERSONA, REGLA_4);
  });

  it("cada motivo con regla de negocio cita la suya", () => {
    assert.equal(reglaDeEscalamiento("pide_persona"), REGLA_4);
    assert.equal(reglaDeEscalamiento("caso_no_cubierto"), REGLA_5);
    assert.equal(reglaDeEscalamiento("discrepancia_de_ingreso"), REGLA_3);
    assert.equal(reglaDeEscalamiento("inconsistencia_documental"), REGLA_3);
    assert.equal(reglaDeEscalamiento("preaprobacion_fuera_de_politica"), REGLA_2);
    assert.equal(
      reglaDeEscalamiento("identidad_ambigua"),
      "Regla 1 · coincidencias sin desambiguar",
    );
    assert.equal(
      reglaDeEscalamiento("identidad_no_verificable"),
      `Regla 1 · ${MAX_INTENTOS_VERIFICACION} intentos fallidos de verificación`,
    );
  });

  it("los motivos técnicos y el documento no extraíble conservan su texto de antes", () => {
    assert.equal(
      reglaDeEscalamiento("documento_no_extraible"),
      "constitución, Principio V · documento no extraíble",
    );
    assert.equal(
      reglaDeEscalamiento("falla_transitoria_persistente"),
      "constitución, Principio VI · reintentos agotados",
    );
    assert.equal(
      reglaDeEscalamiento("falla_del_agente"),
      "constitución, Principio VI · reintento del modelo agotado",
    );
    assert.equal(reglaDeEscalamiento("limite_de_turnos"), "FR-003 · límite de seguridad del ciclo");
    assert.equal(
      reglaDeEscalamiento("respuesta_incompleta"),
      "FR-004 · razón de parada inesperada",
    );
  });

  it("ORDEN_REGLA da el número de regla de los siete motivos que lo tienen", () => {
    assert.deepEqual(ORDEN_REGLA, {
      pide_persona: 4,
      caso_no_cubierto: 5,
      identidad_ambigua: 1,
      identidad_no_verificable: 1,
      discrepancia_de_ingreso: 3,
      inconsistencia_documental: 3,
      preaprobacion_fuera_de_politica: 2,
    });
  });
});
describe("política: detectarPeticionPersona, las frases que coinciden (#15, US2)", () => {
  const coinciden = [
    "Quiero hablar con una persona",
    "Necesito un asesor humano, por favor",
    "Pásame con un analista",
    "Prefiero hablar con alguien real",
    "QUIERO HABLAR CON UNA PERSONA.",
    "Quiero 4 millones a 24 meses, pero prefiero hablar con una persona",
    "Quisiera, mejor dicho, necesito hablar con un humano",
    "Exijo que me atienda una persona de carne y hueso",
    "  quiero   hablar   con   una   asesora  ",
  ];
  for (const frase of coinciden) {
    it(`reconoce «${frase.trim()}»`, () => {
      assert.equal(detectarPeticionPersona(frase), true);
    });
  }

  it("una negación a más de tres palabras antes del verbo no impide la coincidencia", () => {
    assert.equal(
      detectarPeticionPersona("No sé qué decirte, pero necesito hablar con una persona"),
      true,
    );
  });

  it("el sustantivo a menos de ocho palabras del verbo coincide; a ocho o más, no", () => {
    assert.equal(detectarPeticionPersona("Hablar a b c d e f una persona"), true);
    assert.equal(detectarPeticionPersona("Hablar a b c d e f g una persona"), false);
  });
});

describe("política: detectarPeticionPersona, lo que no coincide (#15, US2)", () => {
  const noCoinciden = [
    "No quiero hablar con una persona, sigue tú",
    "Sin hablar con un asesor, ¿cuánto pagaría al mes?",
    "Nunca necesito un asesor humano",
    "Mi asesor del banco me dijo que pidiera un crédito",
    "¿Qué hace un analista de crédito?",
    "Quiero un crédito de 4 millones",
    "Necesito saber el estado de mi solicitud",
    "Una persona real me atendió ayer",
    "",
    "     ",
  ];
  for (const frase of noCoinciden) {
    it(`no reconoce «${frase.trim()}»`, () => {
      assert.equal(detectarPeticionPersona(frase), false);
    });
  }

  it("un verbo que va después del sustantivo no cuenta", () => {
    assert.equal(detectarPeticionPersona("Con una persona quiero"), false);
  });

  it("una negación dentro de las tres palabras anteriores al verbo lo anula", () => {
    assert.equal(detectarPeticionPersona("No, tampoco quiero hablar con una persona"), false);
    assert.equal(detectarPeticionPersona("Ni siquiera quiero hablar con una persona"), false);
  });

  it("no depende de tildes ni de mayúsculas", () => {
    assert.equal(detectarPeticionPersona("PÁSAME CON UN ANALISTA"), true);
    assert.equal(detectarPeticionPersona("NO QUIERO HABLAR CON UNA PERSONA"), false);
  });
});
