import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conversar, MODELO_POR_DEFECTO, type ContextoConsulta, type QueryFn } from "./agente.ts";
import { errorTransitorio, exito, fallo } from "../compartido/errores.ts";
import type { ClienteCore } from "./cliente-core.ts";

const core: ClienteCore = {
  async consultarSolicitud() {
    return exito({ solicitud: null });
  },
  async cerrar() {},
};

const asistente = (stopReason: string | null, texto = "…") => ({
  type: "assistant",
  message: { stop_reason: stopReason, content: [{ type: "text", text: texto }] },
});

const resultado = (subtype: string, stopReason: string | null, texto = "", turnos = 1) => ({
  type: "result",
  subtype,
  stop_reason: stopReason,
  result: texto,
  num_turns: turnos,
  is_error: subtype !== "success",
});

/** Consulta falsa: cada intento produce la lista de mensajes dada (y opcionalmente usa el contexto). */
function consultaFalsa(
  intentos: (unknown[] | ((contexto: ContextoConsulta) => Promise<unknown[]>) | Error)[],
) {
  const llamadas: { options: Record<string, unknown> }[] = [];
  const fn: QueryFn = async function* (params, contexto) {
    llamadas.push({ options: params.options as Record<string, unknown> });
    const intento = intentos[Math.min(llamadas.length - 1, intentos.length - 1)]!;
    if (intento instanceof Error) throw intento;
    const mensajes = typeof intento === "function" ? await intento(contexto) : intento;
    for (const mensaje of mensajes) yield mensaje as never;
  };
  return { fn, llamadas };
}

function capturarLogs(t: { mock: { method: Function } }) {
  const lineas: string[] = [];
  (t.mock.method as (o: object, m: string, f: Function) => unknown)(
    process.stderr,
    "write",
    (texto: string) => {
      lineas.push(texto);
      return true;
    },
  );
  return () => lineas.map((l) => JSON.parse(l) as Record<string, unknown>);
}

const sinEspera = { dormir: async () => {}, azar: () => 0.5 };

describe("agente: opciones de query()", () => {
  it("usa solo las herramientas del core, sin configuración del repositorio", async (t) => {
    capturarLogs(t);
    const { fn, llamadas } = consultaFalsa([[resultado("success", "end_turn", "Hola")]]);
    await conversar("Hola", { ejecutarConsulta: fn, core, ...sinEspera });
    const opciones = llamadas[0]!.options;
    assert.deepEqual(opciones["tools"], []);
    assert.deepEqual(Object.keys(opciones["mcpServers"] as object), ["originacion"]);
    assert.deepEqual(opciones["allowedTools"], ["mcp__originacion__*"]);
    assert.deepEqual(opciones["settingSources"], []);
    assert.equal(opciones["maxTurns"], 8);
    assert.equal(opciones["model"], MODELO_POR_DEFECTO);
    assert.equal(MODELO_POR_DEFECTO, "claude-opus-5-5");
    assert.equal(
      (opciones["env"] as Record<string, string>)["CLAUDE_CODE_DISABLE_AUTO_MEMORY"],
      "1",
    );
    assert.ok(opciones["abortController"] instanceof AbortController);
    assert.equal(typeof opciones["systemPrompt"], "string");
  });
});

describe("agente: interpretación del resultado", () => {
  it("success + end_turn → respuesta con el texto del modelo", async (t) => {
    capturarLogs(t);
    const { fn } = consultaFalsa([
      [
        asistente("end_turn", "Tu solicitud está en estudio."),
        resultado("success", "end_turn", "Tu solicitud está en estudio.", 2),
      ],
    ]);
    const r = await conversar("¿Estado?", { ejecutarConsulta: fn, core, ...sinEspera });
    assert.equal(r.tipo, "respuesta");
    assert.equal(r.respuesta, "Tu solicitud está en estudio.");
    assert.equal(r.escalamiento, null);
    assert.equal(r.turnos, 2);
  });

  for (const stop of ["max_tokens", "refusal", null, "algo_nuevo"]) {
    it(`success + ${String(stop)} → escalada por respuesta incompleta`, async (t) => {
      capturarLogs(t);
      const { fn } = consultaFalsa([[resultado("success", stop, "texto parcial con datos")]]);
      const r = await conversar("¿Estado?", { ejecutarConsulta: fn, core, ...sinEspera });
      assert.equal(r.tipo, "escalada");
      assert.equal(r.escalamiento?.motivo, "respuesta_incompleta");
      assert.equal(r.respuesta.includes("texto parcial"), false);
    });
  }

  it("error_max_turns → escalada por límite de turnos, sin reintentar", async (t) => {
    capturarLogs(t);
    const { fn, llamadas } = consultaFalsa([[resultado("error_max_turns", null)]]);
    const r = await conversar("¿Estado?", { ejecutarConsulta: fn, core, ...sinEspera });
    assert.equal(r.tipo, "escalada");
    assert.equal(r.escalamiento?.motivo, "limite_de_turnos");
    assert.equal(llamadas.length, 1);
  });

  it("un saludo sin herramientas → respuesta en un turno, sin llamar al core", async (t) => {
    capturarLogs(t);
    let llamadasAlCore = 0;
    const coreContado: ClienteCore = {
      async consultarSolicitud() {
        llamadasAlCore++;
        return exito({ solicitud: null });
      },
      async cerrar() {},
    };
    const { fn } = consultaFalsa([
      [resultado("success", "end_turn", "¡Hola! ¿En qué te ayudo?", 1)],
    ]);
    const r = await conversar("Hola", { ejecutarConsulta: fn, core: coreContado, ...sinEspera });
    assert.equal(r.tipo, "respuesta");
    assert.equal(r.turnos, 1);
    assert.equal(llamadasAlCore, 0);
  });

  it("si el core no arranca → escalada con aviso fijo, sin llamar al modelo ni lanzar", async (t) => {
    const logs = capturarLogs(t);
    const { fn, llamadas } = consultaFalsa([
      [resultado("success", "end_turn", "No debería verse")],
    ]);
    const r = await conversar("¿Estado?", {
      ejecutarConsulta: fn,
      conectarCore: async () => {
        throw new Error("Connection closed");
      },
      ...sinEspera,
    });
    assert.equal(r.tipo, "escalada");
    assert.equal(r.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.match(String(r.escalamiento?.ultimoError), /^core_no_arranco/);
    assert.match(r.respuesta, /analista/);
    assert.equal(llamadas.length, 0);
    assert.ok(logs().some((l) => l["evento"] === "escalamiento"));
    assert.ok(logs().some((l) => l["evento"] === "resultado" && l["tipo"] === "escalada"));
  });
});

describe("agente: reintento de la llamada al modelo", () => {
  it("un error de ejecución y después éxito → respuesta, con 2 llamadas y espera de 1 s ±20%", async (t) => {
    capturarLogs(t);
    const esperas: number[] = [];
    const { fn, llamadas } = consultaFalsa([
      [resultado("error_during_execution", null)],
      [resultado("success", "end_turn", "Listo.")],
    ]);
    const r = await conversar("¿Estado?", {
      ejecutarConsulta: fn,
      core,
      dormir: async (ms) => {
        esperas.push(ms);
      },
      azar: () => 1,
    });
    assert.equal(r.tipo, "respuesta");
    assert.equal(llamadas.length, 2);
    assert.equal(esperas.length, 1);
    assert.ok(esperas[0]! >= 800 && esperas[0]! <= 1200, String(esperas[0]));
  });

  it("si la conversación agota su tiempo límite dos veces → escalada por falla del agente", async (t) => {
    capturarLogs(t);
    let llamadas = 0;
    // Como el SDK real: espera hasta que se aborta la conversación y entonces lanza.
    const fn: QueryFn = async function* (params) {
      llamadas++;
      const senal = params.options.abortController!.signal;
      await new Promise<void>((resolver) => senal.addEventListener("abort", () => resolver()));
      throw new Error("Operation aborted");
    };
    const r = await conversar("¿Estado?", {
      ejecutarConsulta: fn,
      core,
      tiempoLimiteMs: 10,
      ...sinEspera,
    });
    assert.equal(r.tipo, "escalada");
    assert.equal(r.escalamiento?.motivo, "falla_del_agente");
    assert.equal(r.escalamiento?.intentos, 2);
    assert.equal(r.escalamiento?.ultimoError, "tiempo_agotado");
    assert.equal(llamadas, 2);
  });

  for (const [nombre, intento] of [
    ["error_during_execution", [resultado("error_during_execution", null)]],
    ["un flujo sin result", [asistente("tool_use")]],
    ["una excepción", new Error("fallo del proceso")],
  ] as const) {
    it(`dos intentos con ${nombre} → escalada por falla del agente`, async (t) => {
      capturarLogs(t);
      const { fn, llamadas } = consultaFalsa([intento as never, intento as never]);
      const r = await conversar("¿Estado?", { ejecutarConsulta: fn, core, ...sinEspera });
      assert.equal(r.tipo, "escalada");
      assert.equal(r.escalamiento?.motivo, "falla_del_agente");
      assert.equal(r.escalamiento?.intentos, 2);
      assert.equal(llamadas.length, 2);
    });
  }
});

describe("agente: auditoría y logs", () => {
  it("cada escalada registra el evento con motivo, regla, resultado, correlationId y ts", async (t) => {
    const logs = capturarLogs(t);
    const { fn } = consultaFalsa([[resultado("error_max_turns", null)]]);
    const r = await conversar("¿Estado?", {
      ejecutarConsulta: fn,
      core,
      correlationId: "00000000-0000-4000-8000-000000000001",
      ...sinEspera,
    });
    const evento = logs().find((l) => l["evento"] === "escalamiento");
    assert.ok(evento, "no se registró el escalamiento");
    assert.equal(evento["motivo"], "limite_de_turnos");
    assert.equal(typeof evento["regla"], "string");
    assert.equal(evento["resultado"], "escalada");
    assert.equal(evento["correlationId"], "00000000-0000-4000-8000-000000000001");
    assert.match(String(evento["ts"]), /^\d{4}-/);
    assert.match(r.respuesta, /analista/);
    assert.match(r.respuesta, /00000000/);
  });

  it("cada turno y el resultado se registran con el correlationId", async (t) => {
    const logs = capturarLogs(t);
    const { fn } = consultaFalsa([[asistente("end_turn"), resultado("success", "end_turn", "Ok")]]);
    const r = await conversar("Hola", { ejecutarConsulta: fn, core, ...sinEspera });
    const eventos = logs().filter((l) => l["correlationId"] === r.correlationId);
    assert.ok(eventos.some((l) => l["evento"] === "turno"));
    assert.ok(eventos.some((l) => l["evento"] === "resultado" && l["tipo"] === "respuesta"));
  });

  it("varios mensajes assistant con el mismo id cuentan como un solo turno", async (t) => {
    const logs = capturarLogs(t);
    const conId = (id: string) => {
      const m = asistente(null);
      return { ...m, message: { ...m.message, id } };
    };
    const { fn } = consultaFalsa([
      [
        conId("msg_1"),
        conId("msg_1"),
        conId("msg_2"),
        conId("msg_2"),
        resultado("success", "end_turn", "Ok", 2),
      ],
    ]);
    const r = await conversar("¿Estado?", { ejecutarConsulta: fn, core, ...sinEspera });
    const turnos = logs().filter((l) => l["evento"] === "turno");
    assert.deepEqual(
      turnos.map((l) => l["numero"]),
      [1, 2],
    );
    assert.equal(r.turnos, 2);
  });
});

describe("agente: escalamiento por el adaptador (US3)", () => {
  const coreCaido: ClienteCore = {
    async consultarSolicitud() {
      return fallo(errorTransitorio("core_no_disponible", "Caído."));
    },
    async cerrar() {},
  };

  for (const final of [
    resultado("success", "end_turn", "Tu solicitud SOL-0001000001 está aprobada por 3.500.000."),
    resultado("error_during_execution", null),
  ]) {
    it(`con la señal del adaptador y un result ${final.subtype} → aviso fijo, sin el texto del modelo ni reintento`, async (t) => {
      capturarLogs(t);
      const { fn, llamadas } = consultaFalsa([
        async (contexto) => {
          await contexto.herramientas.consultar_solicitud.manejar({
            idSolicitud: "SOL-0001000001",
          });
          return [asistente("end_turn", final.result), final];
        },
      ]);
      const r = await conversar("¿Estado de SOL-0001000001?", {
        ejecutarConsulta: fn,
        core: coreCaido,
        ...sinEspera,
      });
      assert.equal(r.tipo, "escalada");
      assert.equal(r.escalamiento?.motivo, "falla_transitoria_persistente");
      assert.equal(r.escalamiento?.intentos, 3);
      assert.equal(r.escalamiento?.herramienta, "consultar_solicitud");
      assert.match(r.respuesta, /analista/);
      assert.equal(r.respuesta.includes("aprobada"), false);
      assert.equal(r.respuesta.includes("3.500.000"), false);
      assert.equal(llamadas.length, 1);
    });
  }
});
