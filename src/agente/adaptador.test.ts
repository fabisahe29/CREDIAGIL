import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearAdaptador, crearEstado } from "./adaptador.ts";
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
