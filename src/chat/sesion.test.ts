import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarEventos,
  estaCerrada,
  nuevaConversacion,
  registrarTurno,
  type EventoMostrado,
} from "./sesion.ts";
import type { EventoNegocio, TipoEvento } from "../compartido/eventos.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function evento(tipo: TipoEvento): EventoMostrado {
  const base = {
    descripcion: "Algo pasó",
    motivo: "Motivo",
    correlationId: "00000000-0000-4000-8000-000000000001",
    ts: "2026-10-17T10:00:00.000Z",
  };
  const porTipo: Record<TipoEvento, EventoNegocio> = {
    preaprobacion: { tipo, ...base, regla: "Regla 2", valores: { monto: 3500000 } },
    solicitud_de_dato: { tipo, ...base, dato: "certificado laboral" },
    escalamiento: { tipo, ...base },
    bloqueo_por_regla: {
      tipo,
      ...base,
      regla: "Regla 2",
      valores: { cuota: 1 },
      siguientePaso: "Un analista revisa",
    },
  } as Record<TipoEvento, EventoNegocio>;
  return { reconocido: true, evento: porTipo[tipo] };
}

const noReconocido: EventoMostrado = { reconocido: false, crudo: {}, problema: "falta tipo" };

describe("sesión: conversación (US1)", () => {
  it("una conversación nueva tiene un correlationId UUID, historial vacío y estado en_curso", () => {
    const conv = nuevaConversacion();
    assert.match(conv.correlationId, UUID);
    assert.deepEqual(conv.historial, []);
    assert.equal(conv.estado, "en_curso");
    assert.equal(conv.busquedasAmbiguas, 0);
    assert.equal(conv.desambiguada, false);
  });

  it("cada conversación nueva tiene un correlationId distinto", () => {
    assert.notEqual(nuevaConversacion().correlationId, nuevaConversacion().correlationId);
  });

  it("registrarTurno agrega el turno sin mutar la conversación anterior", () => {
    const antes = nuevaConversacion();
    const despues = registrarTurno(antes, "solicitante", "Hola");
    assert.deepEqual(antes.historial, []);
    assert.deepEqual(despues.historial, [{ autor: "solicitante", texto: "Hola" }]);
    assert.equal(despues.correlationId, antes.correlationId);
  });
});

describe("sesión: estado de la solicitud (US2)", () => {
  it("preaprobacion lleva a preaprobada y cierra la conversación", () => {
    const r = aplicarEventos(nuevaConversacion(), [evento("preaprobacion")]);
    assert.equal(r.conversacion.estado, "preaprobada");
    assert.equal(r.cambio, true);
    assert.equal(estaCerrada(r.conversacion), true);
  });

  it("escalamiento lleva a escalada y cierra la conversación", () => {
    const r = aplicarEventos(nuevaConversacion(), [evento("escalamiento")]);
    assert.equal(r.conversacion.estado, "escalada");
    assert.equal(estaCerrada(r.conversacion), true);
  });

  for (const otro of [evento("solicitud_de_dato"), evento("bloqueo_por_regla"), noReconocido]) {
    const nombre = otro.reconocido ? otro.evento.tipo : "un evento no reconocido";
    it(`${nombre} no cambia el estado`, () => {
      const r = aplicarEventos(nuevaConversacion(), [otro]);
      assert.equal(r.conversacion.estado, "en_curso");
      assert.equal(r.cambio, false);
      assert.equal(estaCerrada(r.conversacion), false);
    });
  }

  it("sin eventos no hay cambio", () => {
    const conv = nuevaConversacion();
    const r = aplicarEventos(conv, []);
    assert.equal(r.cambio, false);
    assert.equal(r.conversacion, conv);
  });

  it("los estados finales son absorbentes: tras preaprobada, un escalamiento no cambia nada", () => {
    const pre = aplicarEventos(nuevaConversacion(), [evento("preaprobacion")]).conversacion;
    const r = aplicarEventos(pre, [evento("escalamiento")]);
    assert.equal(r.conversacion.estado, "preaprobada");
    assert.equal(r.cambio, false);
  });

  it("y tras escalada, una preaprobación no cambia nada", () => {
    const esc = aplicarEventos(nuevaConversacion(), [evento("escalamiento")]).conversacion;
    assert.equal(aplicarEventos(esc, [evento("preaprobacion")]).conversacion.estado, "escalada");
  });

  it("con varios eventos en un turno, el primero que lleva a un estado final lo fija", () => {
    const r = aplicarEventos(nuevaConversacion(), [
      evento("solicitud_de_dato"),
      evento("escalamiento"),
      evento("preaprobacion"),
    ]);
    assert.equal(r.conversacion.estado, "escalada");
    assert.equal(r.cambio, true);
  });

  it("no muta la conversación recibida", () => {
    const conv = nuevaConversacion();
    aplicarEventos(conv, [evento("escalamiento")]);
    assert.equal(conv.estado, "en_curso");
  });
});
