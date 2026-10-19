import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import {
  TRABAJANDO,
  formatearAdjunto,
  formatearAgente,
  formatearCabecera,
  formatearEntregaPendiente,
  formatearEstado,
  formatearEvento,
  formatearHandoff,
  formatearHerramienta,
  formatearSolicitante,
  textoEstado,
} from "./presentacion.ts";
import type { EventoNegocio } from "../compartido/eventos.ts";
import {
  claveIdempotenciaEscalamiento,
  esquemaResumenAnalista,
  type ResumenAnalista,
} from "../compartido/escalamiento.ts";
import { aRegistro, ejemploCertificado } from "../compartido/ingreso-ejemplos.ts";

const base = {
  descripcion: "Tu caso pasa a un analista",
  motivo: "falla_transitoria_persistente",
  correlationId: "00000000-0000-4000-8000-000000000001",
  ts: "2026-10-17T10:00:00.000Z",
};

const reconocido = (evento: EventoNegocio) => ({ reconocido: true as const, evento });

describe("presentación: mensajes (US1)", () => {
  it("etiqueta al solicitante y al agente", () => {
    assert.equal(formatearSolicitante("Hola", false), "Tú: Hola");
    assert.equal(formatearAgente("¿En qué te ayudo?", false), "Agente: ¿En qué te ayudo?");
    assert.equal(TRABAJANDO, "Agente · trabajando…");
  });

  it("muestra el adjunto con su detalle", () => {
    assert.equal(
      formatearAdjunto(2, "certificado.md", "812 bytes", false),
      "Tú · adjunto 2 · certificado.md (812 bytes)",
    );
  });

  it("la cabecera muestra nombre, ruta del log, correlationId e invitación a /ayuda", () => {
    const cabecera = formatearCabecera(
      { rutaLog: "logs/chat-20261017-100000.jsonl", correlationId: base.correlationId },
      false,
    );
    const lineas = cabecera.split("\n");
    assert.match(lineas[0]!, /Crediágil/);
    assert.ok(lineas.some((l) => l.includes("logs/chat-20261017-100000.jsonl")));
    assert.ok(lineas.some((l) => l.includes(base.correlationId)));
    assert.equal(lineas.at(-1), "Escribe /ayuda para ver los comandos.");
  });

  it("con color, el texto sin secuencias ANSI es el mismo que sin color", () => {
    const evento = reconocido({ tipo: "escalamiento", ...base, regla: "Regla X" });
    for (const [conColor, sinColor] of [
      [formatearAgente("Hola", true), formatearAgente("Hola", false)],
      [formatearSolicitante("Hola", true), formatearSolicitante("Hola", false)],
      [formatearEvento(evento, true), formatearEvento(evento, false)],
      [formatearEstado("escalada", true), formatearEstado("escalada", false)],
    ]) {
      assert.equal(stripVTControlCharacters(conColor!), sinColor);
    }
  });
});

describe("presentación: eventos (US2)", () => {
  it("preaprobación con etiqueta, regla y valores con separador de miles", () => {
    const texto = formatearEvento(
      reconocido({
        tipo: "preaprobacion",
        ...base,
        descripcion: "Tu solicitud quedó preaprobada",
        motivo: "Cumple la política",
        regla: "Regla 2",
        valores: { monto: 3500000, cuota: 180000 },
      }),
      false,
    );
    assert.equal(
      texto,
      [
        "┃ [PREAPROBACIÓN] Tu solicitud quedó preaprobada",
        "┃ Regla: Regla 2",
        "┃ Valores: monto = 3.500.000 · cuota = 180.000",
        "┃ Motivo: Cumple la política",
      ].join("\n"),
    );
  });

  it("solicitud de dato con el dato antes que el motivo", () => {
    const texto = formatearEvento(
      reconocido({
        tipo: "solicitud_de_dato",
        ...base,
        descripcion: "Necesitamos tu certificado laboral",
        motivo: "El ingreso debe salir de un documento",
        dato: "certificado laboral",
      }),
      false,
    );
    assert.equal(
      texto,
      [
        "┃ [SOLICITUD DE DATO] Necesitamos tu certificado laboral",
        "┃ Dato: certificado laboral",
        "┃ Motivo: El ingreso debe salir de un documento",
      ].join("\n"),
    );
  });

  it("bloqueo por regla con aviso, regla, valores, motivo y qué sigue (FR-008)", () => {
    const texto = formatearEvento(
      reconocido({
        tipo: "bloqueo_por_regla",
        ...base,
        descripcion: "No podemos preaprobar automáticamente tu solicitud",
        motivo: "La cuota supera el máximo",
        regla: "Regla 2",
        valores: { cuota: 1250000, "ingreso verificado": 3800000, porcentaje: "32,9 %" },
        siguientePaso: "Un analista revisará tu caso",
      }),
      false,
    );
    assert.equal(
      texto,
      [
        "┃ [BLOQUEO POR REGLA] No podemos preaprobar automáticamente tu solicitud",
        "┃ Regla: Regla 2",
        "┃ Valores: cuota = 1.250.000 · ingreso verificado = 3.800.000 · porcentaje = 32,9 %",
        "┃ Motivo: La cuota supera el máximo",
        "┃ Qué sigue: Un analista revisará tu caso",
      ].join("\n"),
    );
  });

  it("escalamiento muestra solo los campos presentes", () => {
    assert.equal(
      formatearEvento(reconocido({ tipo: "escalamiento", ...base }), false),
      [
        "┃ [ESCALAMIENTO] Tu caso pasa a un analista",
        "┃ Motivo: falla_transitoria_persistente",
      ].join("\n"),
    );
  });

  it("los valores conservan el orden de llegada", () => {
    const texto = formatearEvento(
      reconocido({ tipo: "escalamiento", ...base, valores: { z: 1, a: "b" } }),
      false,
    );
    assert.match(texto, /Valores: z = 1 · a = b/);
  });

  it("línea de estado de cada estado, con conversación cerrada en los finales", () => {
    assert.equal(formatearEstado("en_curso", false), "══ Estado de la solicitud: EN CURSO ══");
    assert.equal(
      formatearEstado("preaprobada", false),
      "══ Estado de la solicitud: PREAPROBADA (conversación cerrada) ══",
    );
    assert.equal(
      formatearEstado("escalada", false),
      "══ Estado de la solicitud: ESCALADA A ANALISTA (conversación cerrada) ══",
    );
  });

  it("texto del estado para los avisos", () => {
    assert.equal(textoEstado("en_curso"), "en curso");
    assert.equal(textoEstado("preaprobada"), "preaprobada");
    assert.equal(textoEstado("escalada"), "escalada a analista");
  });

  it("línea de herramienta del modo de demostración", () => {
    assert.equal(
      formatearHerramienta(
        { herramienta: "consultar_solicitud", intento: 1, resultado: "ok" },
        false,
      ),
      "   · herramienta consultar_solicitud · intento 1 · ok",
    );
    assert.equal(
      formatearHerramienta(
        {
          herramienta: "consultar_solicitud",
          intento: 2,
          resultado: "core_no_disponible",
          categoria: "transitorio",
        },
        false,
      ),
      "   · herramienta consultar_solicitud · intento 2 · core_no_disponible (transitorio)",
    );
  });
});

describe("presentación: evento no reconocido (US3)", () => {
  it("muestra el tipo recibido y el problema, nunca el evento completo", () => {
    const texto = formatearEvento(
      {
        reconocido: false,
        crudo: { tipo: "aprobacion_total", secreto: "no-mostrar" },
        problema: "tipo desconocido: aprobacion_total",
      },
      false,
    );
    assert.equal(
      texto,
      [
        "┃ [EVENTO NO RECONOCIDO] tipo: aprobacion_total",
        "┃ Problema: tipo desconocido: aprobacion_total",
      ].join("\n"),
    );
    assert.equal(texto.includes("no-mostrar"), false);
  });

  it("sin tipo dice «sin tipo»", () => {
    const texto = formatearEvento(
      { reconocido: false, crudo: 42, problema: "no es objeto" },
      false,
    );
    assert.match(texto, /\[EVENTO NO RECONOCIDO\] tipo: sin tipo/);
  });
});
// ── Resumen para el analista en el modo de demostración (#15, US5) ─────────────────────────

const CORRELACION_HANDOFF_PRESENTACION = "6f1c2e4a-8d3b-4a57-9c10-2b7e5a9d4f31";

const afirmacion = (fragmento: string) => ({ tipo: "afirmacion", fragmento });

/** Un resumen completo como lo entregaría el core, con los cambios dados. */
const resumen = (cambios: Record<string, unknown> = {}): ResumenAnalista =>
  esquemaResumenAnalista.parse({
    idEscalamiento: "ESC-0003000001",
    correlationId: CORRELACION_HANDOFF_PRESENTACION,
    claveIdempotencia: claveIdempotenciaEscalamiento(CORRELACION_HANDOFF_PRESENTACION),
    escaladoEn: "2026-10-18T12:00:00.000Z",
    versionPolitica: "2026-10-18.4",
    causa: "monto_sobre_umbral",
    motivo: "preaprobacion_fuera_de_politica",
    codigo: "monto_sobre_tope",
    regla: "Regla 2 · preaprobación dentro de la política",
    accionRecomendada: "revisar_con_simulacion_de_cuota",
    causasAdicionales: [],
    solicitante: {
      identificado: true,
      idSolicitante: "CLI-0001000001",
      nombre: "Ana Pérez Ficticia",
      documentoEnmascarado: "******4567",
    },
    solicitud: { idSolicitud: "SOL-0001000010", estado: "en_estudio" },
    monto: { valor: 6_000_000, procedencia: afirmacion("quiero 6 millones") },
    plazoMeses: { valor: 24, procedencia: afirmacion("a 24 meses") },
    ingresoDeclarado: {
      valor: 3_800_000,
      procedencia: afirmacion("gano 3.800.000"),
    },
    verificacionIngreso: {
      estado: "verificado",
      ingresoVerificado: {
        monto: 3_800_000,
        origen: "certificado",
        montoCertificado: 3_800_000,
        montoExtractos: null,
        extractosContados: 0,
        usos: [],
        noUsados: [],
      },
      discrepancia: null,
      inconsistencias: [],
      sinContrastar: [],
      calculadaEn: "2026-10-18T12:00:00.000Z",
    },
    discrepancias: [],
    datosExtraidos: [aRegistro(ejemploCertificado())],
    decision: {
      regla: "Regla 2 · preaprobación dentro de la política",
      motivo: "El monto supera el tope de preaprobación.",
      valores: { monto: 6_000_000, plazoMeses: 24 },
      versionPolitica: "2026-10-18.4",
    },
    pendientes: [],
    ...cambios,
  });

describe("presentación: formatearHandoff (#15, US5)", () => {
  it("imprime el título, la causa con su motivo y su regla, y la acción", () => {
    const lineas = formatearHandoff(resumen(), false).split("\n");
    assert.equal(lineas[0], "══ Resumen para el analista · ESC-0003000001 ══");
    assert.equal(
      lineas[1],
      "Causa: monto_sobre_umbral · Motivo: preaprobacion_fuera_de_politica (monto_sobre_tope) · Regla: Regla 2 · preaprobación dentro de la política",
    );
    assert.equal(lineas[2], "Acción recomendada: revisar_con_simulacion_de_cuota");
  });

  it("imprime el solicitante con el documento enmascarado, y la solicitud con su monto y su plazo", () => {
    const texto = formatearHandoff(resumen(), false);
    assert.match(texto, /^Solicitante: Ana Pérez Ficticia · documento \*{6}4567$/m);
    assert.match(
      texto,
      /^Solicitud: SOL-0001000010 \(en_estudio\) · monto 6\.000\.000 · plazo 24 meses$/m,
    );
  });

  it("imprime el ingreso declarado y el verificado", () => {
    assert.match(
      formatearHandoff(resumen(), false),
      /^Ingreso: declarado 3\.800\.000 · verificado 3\.800\.000$/m,
    );
  });

  it("sin discrepancias dice ninguna; con ellas, una línea por cada una", () => {
    assert.match(formatearHandoff(resumen(), false), /^Discrepancias: ninguna$/m);
    const con = resumen({
      discrepancias: [
        {
          tipo: "ingreso",
          declarado: 4_300_000,
          verificado: 3_800_000,
          diferenciaPorcentaje: 13.16,
          umbralPorcentaje: 10,
        },
        {
          tipo: "documental",
          regla: "titular_vs_solicitante",
          adjuntos: [2, 3],
        },
      ],
    });
    const texto = formatearHandoff(con, false);
    assert.match(
      texto,
      /^Discrepancias: ingreso declarado 4\.300\.000 contra verificado 3\.800\.000/m,
    );
    assert.match(texto, /titular_vs_solicitante en los adjuntos 2, 3/);
  });

  it("imprime cuántos documentos se extrajeron y la decisión con sus valores", () => {
    const texto = formatearHandoff(resumen(), false);
    assert.match(texto, /^Datos extraídos: 1 documento$/m);
    assert.match(
      texto,
      /^Decisión: El monto supera el tope de preaprobación\. · monto = 6\.000\.000 · plazoMeses = 24$/m,
    );
  });

  it("sin decisión no imprime la línea de decisión", () => {
    assert.doesNotMatch(formatearHandoff(resumen({ decision: null }), false), /^Decisión:/m);
  });

  it("sin pendientes dice ninguno; con ellos, los enumera", () => {
    assert.match(formatearHandoff(resumen(), false), /^Pendientes: ninguno$/m);
    const vacio = resumen({
      solicitante: { identificado: false },
      solicitud: null,
      monto: null,
      plazoMeses: null,
      ingresoDeclarado: null,
      verificacionIngreso: null,
      datosExtraidos: [],
      decision: null,
      causa: "peticion_de_persona",
      motivo: "pide_persona",
      codigo: undefined,
      accionRecomendada: "contactar_al_solicitante",
      regla: "Regla 4 · el solicitante pide hablar con una persona",
      pendientes: ["identidad", "monto", "plazo", "ingreso_verificado", "documentos"],
    });
    const texto = formatearHandoff(vacio, false);
    assert.match(texto, /^Pendientes: identidad, monto, plazo, ingreso_verificado, documentos$/m);
    assert.match(texto, /^Solicitante: sin identificar$/m);
    assert.match(texto, /^Solicitud: sin registrar · monto pendiente · plazo pendiente$/m);
    assert.match(texto, /^Ingreso: declarado pendiente · verificado pendiente$/m);
    assert.match(texto, /^Datos extraídos: ninguno$/m);
  });

  it("imprime las causas adicionales con su motivo", () => {
    const con = resumen({
      causasAdicionales: [
        {
          causa: "caso_no_cubierto",
          motivo: "caso_no_cubierto",
          accionRecomendada: "revisar_tipo_de_documento_o_moneda",
        },
      ],
    });
    assert.match(
      formatearHandoff(con, false),
      /^Causas adicionales: caso_no_cubierto \(caso_no_cubierto\)$/m,
    );
    assert.doesNotMatch(formatearHandoff(resumen(), false), /Causas adicionales/);
  });

  it("con y sin color el texto es el mismo", () => {
    assert.equal(
      stripVTControlCharacters(formatearHandoff(resumen(), true)),
      formatearHandoff(resumen(), false),
    );
  });

  it("no imprime el texto de los archivos ni fragmentos de procedencia", () => {
    const texto = formatearHandoff(resumen(), false);
    for (const dato of [
      "quiero 6 millones",
      "a 24 meses",
      "gano 3.800.000",
      "Industrias Imaginarias",
    ]) {
      assert.equal(texto.includes(dato), false, dato);
    }
  });

  it("formatearEntregaPendiente dice que la entrega al analista quedó pendiente", () => {
    assert.equal(formatearEntregaPendiente(false), "Entrega al analista: pendiente");
    assert.equal(
      stripVTControlCharacters(formatearEntregaPendiente(true)),
      "Entrega al analista: pendiente",
    );
  });
});
