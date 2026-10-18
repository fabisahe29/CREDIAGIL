import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarEventos,
  estaCerrada,
  nuevaConversacion,
  registrarDocumento,
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

describe("sesion: documentos numerados de la conversación", () => {
  it("una conversación nueva no tiene documentos", () => {
    assert.deepEqual(nuevaConversacion().documentos, []);
  });

  it("asigna 1, 2 y 3 en orden de llegada", () => {
    let conv = nuevaConversacion();
    const numeros: number[] = [];
    for (const nombre of ["a.md", "b.md", "c.md"]) {
      const r = registrarDocumento(conv, { nombre, soportado: true, contenido: `texto ${nombre}` });
      conv = r.conversacion;
      numeros.push(r.documento.adjunto);
    }
    assert.deepEqual(numeros, [1, 2, 3]);
    assert.deepEqual(
      conv.documentos.map((d) => d.nombre),
      ["a.md", "b.md", "c.md"],
    );
  });

  it("guarda el nombre, si es soportado y su contenido", () => {
    const r = registrarDocumento(nuevaConversacion(), {
      nombre: "certificado.md",
      soportado: true,
      contenido: "Salario ficticio",
    });
    assert.deepEqual(r.documento, {
      adjunto: 1,
      nombre: "certificado.md",
      soportado: true,
      contenido: "Salario ficticio",
    });
    assert.deepEqual(r.conversacion.documentos, [r.documento]);
  });

  it("un documento no soportado también recibe número y no guarda contenido", () => {
    const antes = registrarDocumento(nuevaConversacion(), {
      nombre: "a.md",
      soportado: true,
      contenido: "x",
    }).conversacion;
    const r = registrarDocumento(antes, {
      nombre: "foto.png",
      soportado: false,
      contenido: "no debería guardarse",
    });
    assert.equal(r.documento.adjunto, 2);
    assert.equal(r.documento.soportado, false);
    assert.equal("contenido" in r.documento, false);
  });

  it("el mismo nombre dos veces recibe dos números distintos", () => {
    const uno = registrarDocumento(nuevaConversacion(), {
      nombre: "c.md",
      soportado: true,
      contenido: "x",
    });
    const dos = registrarDocumento(uno.conversacion, {
      nombre: "c.md",
      soportado: true,
      contenido: "x",
    });
    assert.deepEqual(
      dos.conversacion.documentos.map((d) => d.adjunto),
      [1, 2],
    );
  });

  it("no muta la conversación recibida", () => {
    const conv = nuevaConversacion();
    registrarDocumento(conv, { nombre: "a.md", soportado: true, contenido: "x" });
    assert.deepEqual(conv.documentos, []);
  });

  it("una conversación nueva vuelve a numerar desde 1", () => {
    const usada = registrarDocumento(nuevaConversacion(), {
      nombre: "a.md",
      soportado: true,
      contenido: "x",
    }).conversacion;
    assert.equal(usada.documentos.length, 1);
    const r = registrarDocumento(nuevaConversacion(), {
      nombre: "b.md",
      soportado: true,
      contenido: "y",
    });
    assert.equal(r.documento.adjunto, 1);
  });
});
