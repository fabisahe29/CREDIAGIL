import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import {
  TRABAJANDO,
  formatearAdjunto,
  formatearAgente,
  formatearCabecera,
  formatearEstado,
  formatearEvento,
  formatearHerramienta,
  formatearSolicitante,
  textoEstado,
} from "./presentacion.ts";
import type { EventoNegocio } from "../compartido/eventos.ts";

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
      formatearAdjunto("certificado.md", "812 bytes", false),
      "Tú · adjunto certificado.md (812 bytes)",
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
