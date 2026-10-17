import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearClienteCore, type ClienteCore } from "./cliente-core.ts";
import { ID_EN_ESTUDIO, ID_INEXISTENTE } from "../mcp/datos-ejemplo.ts";

describe("cliente del core contra el servidor real", () => {
  let core: ClienteCore;
  before(async () => {
    core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "" } });
  });
  after(async () => {
    await core.cerrar();
  });

  it("devuelve la respuesta validada de una solicitud existente", async () => {
    const respuesta = await core.consultarSolicitud(ID_EN_ESTUDIO, randomUUID());
    assert.equal(respuesta.ok, true);
    if (respuesta.ok) assert.equal(respuesta.datos.solicitud?.idSolicitud, ID_EN_ESTUDIO);
  });

  it("devuelve el éxito vacío de una solicitud inexistente", async () => {
    assert.deepEqual(await core.consultarSolicitud(ID_INEXISTENTE, randomUUID()), {
      ok: true,
      datos: { solicitud: null },
    });
  });
});

describe("cliente del core: cierre", () => {
  it("cerrar() termina la conexión con el servidor", async () => {
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "" } });
    await core.cerrar();
    const respuesta = await core.consultarSolicitud(ID_EN_ESTUDIO, randomUUID());
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) assert.equal(respuesta.error.categoria, "transitorio");
  });
});

describe("cliente del core: respuestas fuera de contrato y fallas de transporte (US2)", () => {
  const llamadorFalso = (resultado: () => Promise<{ structuredContent?: unknown }>) => ({
    callTool: resultado,
    close: async () => {},
  });

  for (const [nombre, contenido] of [
    ["sin structuredContent", undefined],
    [
      "con una categoría desconocida",
      { ok: false, error: { categoria: "grave", reintentable: false, codigo: "x", mensaje: "m" } },
    ],
    ["con datos que no son una solicitud", { ok: true, datos: { solicitud: { otra: "cosa" } } }],
    [
      "con un permisos reintentable",
      {
        ok: false,
        error: { categoria: "permisos", reintentable: true, codigo: "x", mensaje: "m" },
      },
    ],
  ] as const) {
    it(`una respuesta ${nombre} es negocio respuesta_fuera_de_contrato, no reintentable`, async () => {
      const core = await crearClienteCore({
        llamador: llamadorFalso(async () => ({ structuredContent: contenido })),
      });
      const respuesta = await core.consultarSolicitud(ID_EN_ESTUDIO, randomUUID());
      assert.equal(respuesta.ok, false);
      if (!respuesta.ok) {
        assert.equal(respuesta.error.codigo, "respuesta_fuera_de_contrato");
        assert.equal(respuesta.error.categoria, "negocio");
        assert.equal(respuesta.error.reintentable, false);
      }
    });
  }

  it("un tiempo límite agotado es transitorio tiempo_agotado", async () => {
    const core = await crearClienteCore({
      llamador: llamadorFalso(async () => {
        throw new Error("Request timed out");
      }),
    });
    const respuesta = await core.consultarSolicitud(ID_EN_ESTUDIO, randomUUID());
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) {
      assert.equal(respuesta.error.codigo, "tiempo_agotado");
      assert.equal(respuesta.error.reintentable, true);
    }
  });
});
