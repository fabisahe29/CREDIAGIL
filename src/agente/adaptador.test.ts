import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearAdaptador, crearEstado, emitirEvento } from "./adaptador.ts";
import { crearClienteCore, type ClienteCore, type RespuestaConsulta } from "./cliente-core.ts";
import { exito } from "../compartido/errores.ts";
import { ID_EN_ESTUDIO } from "../mcp/datos-ejemplo.ts";

/** Core falso que devuelve las respuestas dadas en orden y registra cada llamada. */
export function coreFalso(respuestas: RespuestaConsulta[]) {
  const llamadas: { idSolicitud: string; correlationId: string }[] = [];
  const core: ClienteCore = {
    async consultarSolicitud(idSolicitud, correlationId) {
      llamadas.push({ idSolicitud, correlationId });
      return respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)]!;
    },
    async cerrar() {},
  };
  return { core, llamadas };
}

describe("adaptador: servidor MCP en el mismo proceso del agente", () => {
  it("expone consultar_solicitud sin correlationId en su entrada", () => {
    const { core } = coreFalso([exito({ solicitud: null })]);
    const adaptador = crearAdaptador({ core, estado: crearEstado(randomUUID()) });
    assert.equal(adaptador.servidor.type, "sdk");
    assert.deepEqual(Object.keys(adaptador.herramientas), ["consultar_solicitud"]);
    assert.deepEqual(Object.keys(adaptador.herramientas.consultar_solicitud.esquema), [
      "idSolicitud",
    ]);
  });

  it("agrega el correlationId, llama al core y devuelve la respuesta en structuredContent", async () => {
    const correlationId = randomUUID();
    const respuesta = exito({ solicitud: null });
    const { core, llamadas } = coreFalso([respuesta]);
    const adaptador = crearAdaptador({ core, estado: crearEstado(correlationId) });
    const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
      idSolicitud: ID_EN_ESTUDIO,
    });
    assert.deepEqual(llamadas, [{ idSolicitud: ID_EN_ESTUDIO, correlationId }]);
    assert.deepEqual(resultado.structuredContent, respuesta);
    assert.equal(resultado.isError, false);
  });

  it("con la conversación ya escalada no vuelve a llamar al core y devuelve transitorio_agotado", async () => {
    const correlationId = randomUUID();
    const estado = crearEstado(correlationId);
    estado.escalamiento = {
      motivo: "falla_transitoria_persistente",
      regla: "constitución, Principio VI · reintentos agotados",
      resultado: "escalada",
      correlationId,
      ts: new Date().toISOString(),
    };
    const esperas: number[] = [];
    const { core, llamadas } = coreFalso([exito({ solicitud: null })]);
    const adaptador = crearAdaptador({ core, estado, dormir: async (ms) => void esperas.push(ms) });
    const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
      idSolicitud: ID_EN_ESTUDIO,
    });
    const contenido = resultado.structuredContent as { error: { codigo: string } };
    assert.equal(llamadas.length, 0);
    assert.deepEqual(esperas, []);
    assert.equal(resultado.isError, true);
    assert.equal(contenido.error.codigo, "transitorio_agotado");
  });
});

describe("adaptador: reintentos y escalamiento contra el servidor real (US3)", () => {
  async function conFalla(modo: string) {
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: modo } });
    const estado = crearEstado(randomUUID());
    const esperas: number[] = [];
    const adaptador = crearAdaptador({
      core,
      estado,
      dormir: async (ms) => void esperas.push(ms),
      azar: () => 0.5,
    });
    return { core, estado, esperas, adaptador };
  }

  it("en una-vez: reintenta y devuelve la solicitud", async (t) => {
    const logs = capturarStderr(t);
    const { core, estado, esperas, adaptador } = await conFalla("una-vez");
    try {
      const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
        idSolicitud: ID_EN_ESTUDIO,
      });
      const contenido = resultado.structuredContent as { ok: boolean };
      assert.equal(contenido.ok, true);
      assert.deepEqual(esperas, [500]);
      const llamadas = logs().filter((l) => l["evento"] === "llamada_core");
      assert.deepEqual(
        llamadas.map((l) => [l["intento"], l["resultado"]]),
        [
          [1, "core_no_disponible"],
          [2, "ok"],
        ],
      );
      assert.equal(estado.escalamiento, null);
    } finally {
      await core.cerrar();
    }
  });

  it("en siempre: 3 intentos, señal de escalamiento y transitorio_agotado no reintentable", async (t) => {
    const logs = capturarStderr(t);
    const { core, estado, esperas, adaptador } = await conFalla("siempre");
    try {
      const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
        idSolicitud: ID_EN_ESTUDIO,
      });
      const contenido = resultado.structuredContent as {
        ok: boolean;
        error: { codigo: string; reintentable: boolean };
      };
      assert.equal(resultado.isError, true);
      assert.equal(contenido.error.codigo, "transitorio_agotado");
      assert.equal(contenido.error.reintentable, false);
      assert.deepEqual(esperas, [500, 1000]);
      assert.equal(logs().filter((l) => l["evento"] === "llamada_core").length, 3);

      const senal = estado.escalamiento;
      assert.ok(senal, "no quedó la señal en el estado");
      assert.equal(senal.motivo, "falla_transitoria_persistente");
      assert.equal(senal.herramienta, "consultar_solicitud");
      assert.equal(senal.intentos, 3);
      assert.equal(senal.ultimoError, "core_no_disponible");
      assert.equal(senal.resultado, "escalada");
      assert.equal(senal.correlationId, estado.correlationId);
      assert.match(senal.regla, /Principio VI/);

      const evento = logs().find((l) => l["evento"] === "escalamiento");
      assert.ok(evento, "no se registró el escalamiento");
      assert.equal(evento["motivo"], "falla_transitoria_persistente");
    } finally {
      await core.cerrar();
    }
  });
});

describe("adaptador: eventos de negocio (chat, US2)", () => {
  it("un estado nuevo empieza sin eventos", () => {
    assert.deepEqual(crearEstado(randomUUID()).eventos, []);
  });

  it("emitirEvento completa correlationId y ts, agrega el evento y lo registra", (t) => {
    const logs = capturarStderr(t);
    const correlationId = randomUUID();
    const estado = crearEstado(correlationId);
    const evento = emitirEvento(estado, {
      tipo: "bloqueo_por_regla",
      descripcion: "No podemos preaprobar automáticamente tu solicitud",
      motivo: "La cuota supera el máximo",
      regla: "Regla 2",
      valores: { cuota: 1250000 },
      siguientePaso: "Un analista revisará tu caso",
    });
    assert.equal(evento.correlationId, correlationId);
    assert.match(evento.ts, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(estado.eventos, [evento]);
    const registro = logs().find((l) => l["evento"] === "evento_negocio");
    assert.ok(registro, "no se registró evento_negocio");
    assert.equal(registro["tipo"], "bloqueo_por_regla");
    assert.equal(registro["regla"], "Regla 2");
    assert.deepEqual(registro["valores"], { cuota: 1250000 });
    assert.equal(registro["correlationId"], correlationId);
  });

  it("emitirEvento lanza si el evento no cumple el catálogo, sin agregarlo", (t) => {
    capturarStderr(t);
    const estado = crearEstado(randomUUID());
    assert.throws(
      () =>
        emitirEvento(estado, {
          tipo: "preaprobacion",
          descripcion: "Preaprobada",
          motivo: "Cumple",
          regla: "Regla 2",
          valores: {},
        }),
      /evento inválido/,
    );
    assert.deepEqual(estado.eventos, []);
  });
});

describe("adaptador: observador de herramientas del modo de demostración (US2)", () => {
  it("recibe cada intento con herramienta, intento, resultado y categoría, sin argumentos", async (t) => {
    capturarStderr(t);
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "siempre" } });
    const infos: unknown[] = [];
    try {
      const adaptador = crearAdaptador({
        core,
        estado: crearEstado(randomUUID()),
        dormir: async () => {},
        azar: () => 0.5,
        alUsarHerramienta: (info) => void infos.push(info),
      });
      await adaptador.herramientas.consultar_solicitud.manejar({ idSolicitud: ID_EN_ESTUDIO });
    } finally {
      await core.cerrar();
    }
    assert.deepEqual(
      infos,
      [1, 2, 3].map((intento) => ({
        herramienta: "consultar_solicitud",
        intento,
        resultado: "core_no_disponible",
        categoria: "transitorio",
      })),
    );
  });

  it("un intento exitoso llega como ok, sin categoría", async (t) => {
    capturarStderr(t);
    const { core } = coreFalso([exito({ solicitud: null })]);
    const infos: unknown[] = [];
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(randomUUID()),
      alUsarHerramienta: (info) => void infos.push(info),
    });
    await adaptador.herramientas.consultar_solicitud.manejar({ idSolicitud: ID_EN_ESTUDIO });
    assert.deepEqual(infos, [{ herramienta: "consultar_solicitud", intento: 1, resultado: "ok" }]);
  });

  it("una excepción del observador se registra y no interrumpe la llamada", async (t) => {
    const logs = capturarStderr(t);
    const { core, llamadas } = coreFalso([exito({ solicitud: null })]);
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(randomUUID()),
      alUsarHerramienta: () => {
        throw new Error("pantalla rota");
      },
    });
    const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
      idSolicitud: ID_EN_ESTUDIO,
    });
    assert.equal(resultado.isError, false);
    assert.equal(llamadas.length, 1);
    const error = logs().find((l) => l["evento"] === "error_observador");
    assert.ok(error, "no se registró el error del observador");
    assert.match(String(error["causa"]), /pantalla rota/);
  });
});

function capturarStderr(t: { mock: { method: Function } }) {
  const lineas: string[] = [];
  (t.mock.method as (o: object, m: string, f: Function) => unknown)(
    process.stderr,
    "write",
    (texto: string | Uint8Array) => {
      lineas.push(String(texto));
      return true;
    },
  );
  return () =>
    lineas
      .flatMap((l) => l.split("\n"))
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l) as Record<string, unknown>);
}
