import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { crearClienteCore, type ClienteCore } from "./cliente-core.ts";
import {
  ID_EN_ESTUDIO,
  ID_INEXISTENTE,
  ID_SOLICITANTE_UNICO,
  SOLICITANTES_EJEMPLO,
} from "../mcp/datos-ejemplo.ts";
import { construirResultado, validarSalida } from "../compartido/extraccion.ts";
import { CONTENIDO_CERTIFICADO, salidaCertificado } from "../compartido/extraccion-ejemplos.ts";
import { ejemploCertificado, extractosTrimestre } from "../compartido/ingreso-ejemplos.ts";

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

describe("cliente del core: destino del stderr del servidor (chat, R6)", () => {
  it("con stderr hacia un archivo, los logs del core quedan en ese archivo", async () => {
    const carpeta = mkdtempSync(join(tmpdir(), "crediagil-stderr-"));
    const ruta = join(carpeta, "core.jsonl");
    const descriptor = openSync(ruta, "a");
    const correlationId = randomUUID();
    try {
      const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "" }, stderr: descriptor });
      await core.consultarSolicitud(ID_EN_ESTUDIO, correlationId);
      await core.cerrar();
    } finally {
      closeSync(descriptor);
    }
    const contenido = readFileSync(ruta, "utf8");
    rmSync(carpeta, { recursive: true, force: true });
    assert.ok(contenido.includes(correlationId), "el log del core no quedó en el archivo");
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
        throw new McpError(ErrorCode.RequestTimeout, "Request timed out");
      }),
    });
    const respuesta = await core.consultarSolicitud(ID_EN_ESTUDIO, randomUUID());
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) {
      assert.equal(respuesta.error.codigo, "tiempo_agotado");
      assert.equal(respuesta.error.reintentable, true);
    }
  });

  it("otro error del transporte es transitorio core_no_disponible, aunque su texto diga timeout", async () => {
    const core = await crearClienteCore({
      llamador: llamadorFalso(async () => {
        throw new Error("socket timeout");
      }),
    });
    const respuesta = await core.consultarSolicitud(ID_EN_ESTUDIO, randomUUID());
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) {
      assert.equal(respuesta.error.codigo, "core_no_disponible");
      assert.equal(respuesta.error.reintentable, true);
    }
  });
});

describe("cliente del core: herramientas de identidad (#9)", () => {
  /** Llamador falso que guarda la última llamada y responde lo indicado. */
  function llamadorQueResponde(contenido: () => unknown) {
    const llamadas: { name: string; arguments: Record<string, unknown> }[] = [];
    return {
      llamadas,
      llamador: {
        callTool: async (params: { name: string; arguments: Record<string, unknown> }) => {
          llamadas.push(params);
          return { structuredContent: contenido() };
        },
        close: async () => {},
      },
    };
  }

  const coincidencia = {
    idSolicitante: ID_SOLICITANTE_UNICO,
    nombre: "Ana Pérez Ficticia",
    documentoEnmascarado: "******4567",
  };

  it("buscarSolicitante llama a buscar_solicitante con el criterio y el correlationId", async () => {
    const falso = llamadorQueResponde(() => ({
      ok: true,
      datos: { coincidencias: [coincidencia] },
    }));
    const core = await crearClienteCore({ llamador: falso.llamador });
    const correlationId = randomUUID();
    const respuesta = await core.buscarSolicitante({ documento: "0001234567" }, correlationId);
    assert.deepEqual(respuesta, { ok: true, datos: { coincidencias: [coincidencia] } });
    assert.deepEqual(falso.llamadas, [
      { name: "buscar_solicitante", arguments: { documento: "0001234567", correlationId } },
    ]);
  });

  it("buscarSolicitante con una coincidencia que trae campos de más es fuera de contrato", async () => {
    const falso = llamadorQueResponde(() => ({
      ok: true,
      datos: { coincidencias: [{ ...coincidencia, fechaExpedicion: "2012-05-14" }] },
    }));
    const core = await crearClienteCore({ llamador: falso.llamador });
    const respuesta = await core.buscarSolicitante({ nombre: "Ana Pérez Ficticia" }, randomUUID());
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) assert.equal(respuesta.error.codigo, "respuesta_fuera_de_contrato");
  });

  it("buscarSolicitante con tiempo agotado es transitorio tiempo_agotado", async () => {
    const core = await crearClienteCore({
      llamador: {
        callTool: async () => {
          throw new McpError(ErrorCode.RequestTimeout, "Request timed out");
        },
        close: async () => {},
      },
    });
    const respuesta = await core.buscarSolicitante({ documento: "0001234567" }, randomUUID());
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) assert.equal(respuesta.error.codigo, "tiempo_agotado");
  });

  it("buscarSolicitante con la conexión cerrada es transitorio", async () => {
    const falso = llamadorQueResponde(() => ({ ok: true, datos: { coincidencias: [] } }));
    const core = await crearClienteCore({ llamador: falso.llamador });
    await core.cerrar();
    const respuesta = await core.buscarSolicitante({ documento: "0001234567" }, randomUUID());
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) assert.equal(respuesta.error.categoria, "transitorio");
    assert.equal(falso.llamadas.length, 0);
  });

  it("contra el servidor real, encuentra a los homónimos", async () => {
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "" } });
    try {
      const respuesta = await core.buscarSolicitante(
        { nombre: "Elena Martínez Inventada" },
        randomUUID(),
      );
      assert.equal(respuesta.ok, true);
      if (respuesta.ok) assert.equal(respuesta.datos.coincidencias.length, 2);
    } finally {
      await core.cerrar();
    }
  });
});
describe("cliente del core: verificarIdentidad (#9, US3)", () => {
  const llamadorCon = (contenido: unknown) => {
    const llamadas: { name: string; arguments: Record<string, unknown> }[] = [];
    return {
      llamadas,
      llamador: {
        callTool: async (params: { name: string; arguments: Record<string, unknown> }) => {
          llamadas.push(params);
          return { structuredContent: contenido };
        },
        close: async () => {},
      },
    };
  };

  it("llama a verificar_identidad con todos los campos y devuelve la identidad validada", async () => {
    const correlationId = randomUUID();
    const identidad = {
      correlationId,
      verificada: true,
      idSolicitante: ID_SOLICITANTE_UNICO,
      verificadaEn: "2026-10-17T12:00:00.000Z",
    };
    const falso = llamadorCon({ ok: true, datos: { identidad } });
    const core = await crearClienteCore({ llamador: falso.llamador });
    const respuesta = await core.verificarIdentidad(
      ID_SOLICITANTE_UNICO,
      "2012-05-14",
      "intento-1",
      correlationId,
    );
    assert.deepEqual(respuesta, { ok: true, datos: { identidad } });
    assert.deepEqual(falso.llamadas, [
      {
        name: "verificar_identidad",
        arguments: {
          idSolicitante: ID_SOLICITANTE_UNICO,
          fechaExpedicion: "2012-05-14",
          idIntento: "intento-1",
          correlationId,
        },
      },
    ]);
  });

  it("un error de negocio del core pasa tal cual", async () => {
    const error = {
      categoria: "negocio",
      reintentable: false,
      codigo: "dato_no_coincide",
      mensaje: "La fecha de expedición no coincide. Te quedan 2 intentos.",
    };
    const core = await crearClienteCore({
      llamador: llamadorCon({ ok: false, error }).llamador,
    });
    const respuesta = await core.verificarIdentidad(
      ID_SOLICITANTE_UNICO,
      "2001-01-01",
      "i",
      randomUUID(),
    );
    assert.deepEqual(respuesta, { ok: false, error });
  });

  it("una identidad con campos de más es fuera de contrato", async () => {
    const correlationId = randomUUID();
    const core = await crearClienteCore({
      llamador: llamadorCon({
        ok: true,
        datos: {
          identidad: {
            correlationId,
            verificada: true,
            idSolicitante: ID_SOLICITANTE_UNICO,
            verificadaEn: "2026-10-17T12:00:00.000Z",
            fechaExpedicion: "2012-05-14",
          },
        },
      }).llamador,
    });
    const respuesta = await core.verificarIdentidad(
      ID_SOLICITANTE_UNICO,
      "2012-05-14",
      "i",
      correlationId,
    );
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) assert.equal(respuesta.error.codigo, "respuesta_fuera_de_contrato");
  });

  it("un tiempo agotado es transitorio tiempo_agotado", async () => {
    const core = await crearClienteCore({
      llamador: {
        callTool: async () => {
          throw new McpError(ErrorCode.RequestTimeout, "Request timed out");
        },
        close: async () => {},
      },
    });
    const respuesta = await core.verificarIdentidad(
      ID_SOLICITANTE_UNICO,
      "2012-05-14",
      "i",
      randomUUID(),
    );
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) assert.equal(respuesta.error.codigo, "tiempo_agotado");
  });
});
describe("cliente del core: consultarIdentidad (#9, US4)", () => {
  const llamadorCon = (contenido: unknown) => {
    const llamadas: { name: string; arguments: Record<string, unknown> }[] = [];
    return {
      llamadas,
      llamador: {
        callTool: async (params: { name: string; arguments: Record<string, unknown> }) => {
          llamadas.push(params);
          return { structuredContent: contenido };
        },
        close: async () => {},
      },
    };
  };

  it("llama a consultar_identidad con el correlationId y devuelve la identidad", async () => {
    const correlationId = randomUUID();
    const identidad = {
      correlationId,
      verificada: false,
      idSolicitante: null,
      verificadaEn: null,
    };
    const falso = llamadorCon({ ok: true, datos: { identidad } });
    const core = await crearClienteCore({ llamador: falso.llamador });
    assert.deepEqual(await core.consultarIdentidad(correlationId), {
      ok: true,
      datos: { identidad },
    });
    assert.deepEqual(falso.llamadas, [
      { name: "consultar_identidad", arguments: { correlationId } },
    ]);
  });

  it("una identidad que no cumple el esquema es fuera de contrato", async () => {
    const core = await crearClienteCore({
      llamador: llamadorCon({
        ok: true,
        datos: { identidad: { verificada: "sí" } },
      }).llamador,
    });
    const r = await core.consultarIdentidad(randomUUID());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.codigo, "respuesta_fuera_de_contrato");
  });

  it("un tiempo agotado es transitorio tiempo_agotado", async () => {
    const core = await crearClienteCore({
      llamador: {
        callTool: async () => {
          throw new McpError(ErrorCode.RequestTimeout, "Request timed out");
        },
        close: async () => {},
      },
    });
    const r = await core.consultarIdentidad(randomUUID());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.codigo, "tiempo_agotado");
  });

  it("contra el servidor real, una conversación nueva no está verificada", async () => {
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "" } });
    try {
      const correlationId = randomUUID();
      const r = await core.consultarIdentidad(correlationId);
      assert.equal(r.ok && r.datos.identidad.verificada, false);
    } finally {
      await core.cerrar();
    }
  });
});

describe("cliente del core: extracciones (#10)", () => {
  function resultadoCertificado() {
    const v = validarSalida(salidaCertificado(), { contenido: CONTENIDO_CERTIFICADO }, new Date());
    if (!v.ok) assert.fail(JSON.stringify(v.errores));
    return construirResultado(
      v.salida,
      { adjunto: 1, nombre: "certificado.md", contenido: CONTENIDO_CERTIFICADO },
      1,
    );
  }

  const entrada = () => ({
    adjunto: 1,
    nombre: "certificado.md",
    contenido: CONTENIDO_CERTIFICADO,
    resultado: resultadoCertificado(),
  });

  it("contra el servidor real, registra tras verificar y luego consulta la extracción", async () => {
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "" } });
    try {
      const correlationId = randomUUID();
      const sinIdentidad = await core.registrarExtraccion(entrada(), correlationId);
      assert.equal(sinIdentidad.ok, false);
      if (!sinIdentidad.ok) assert.equal(sinIdentidad.error.codigo, "identidad_no_verificada");

      const unico = SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === ID_SOLICITANTE_UNICO)!;
      await core.verificarIdentidad(
        unico.idSolicitante,
        unico.fechaExpedicion,
        randomUUID(),
        correlationId,
      );
      const registro = await core.registrarExtraccion(entrada(), correlationId);
      assert.equal(registro.ok, true);
      if (registro.ok) assert.equal(registro.datos.extraccion.estado, "extraido");

      const consulta = await core.consultarExtracciones(correlationId);
      assert.equal(consulta.ok && consulta.datos.extracciones.length, 1);
    } finally {
      await core.cerrar();
    }
  });

  it("envía el correlationId y los campos de la entrada a registrar_extraccion", async () => {
    const llamadas: { name: string; arguments: Record<string, unknown> }[] = [];
    const core = await crearClienteCore({
      llamador: {
        callTool: async (params) => {
          llamadas.push(params);
          return { structuredContent: { ok: true, datos: { extracciones: [] } } };
        },
        close: async () => {},
      },
    });
    const correlationId = randomUUID();
    await core.registrarExtraccion(entrada(), correlationId);
    await core.consultarExtracciones(correlationId);
    assert.equal(llamadas[0]?.name, "registrar_extraccion");
    assert.deepEqual(Object.keys(llamadas[0]!.arguments).sort(), [
      "adjunto",
      "contenido",
      "correlationId",
      "nombre",
      "resultado",
    ]);
    assert.deepEqual(llamadas[1], { name: "consultar_extracciones", arguments: { correlationId } });
  });

  it("un registro que no cumple el esquema es fuera de contrato", async () => {
    const core = await crearClienteCore({
      llamador: {
        callTool: async () => ({
          structuredContent: { ok: true, datos: { extraccion: { estado: "inventado" } } },
        }),
        close: async () => {},
      },
    });
    const r = await core.registrarExtraccion(entrada(), randomUUID());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.codigo, "respuesta_fuera_de_contrato");
  });
});

describe("cliente del core: verificación de ingreso (#11)", () => {
  async function registrarDocumentos(core: ClienteCore, correlationId: string) {
    for (const e of [ejemploCertificado(), ...extractosTrimestre()]) {
      const v = validarSalida(e.salida, e, new Date());
      if (!v.ok) assert.fail(JSON.stringify(v.errores));
      const r = await core.registrarExtraccion(
        {
          adjunto: e.adjunto,
          nombre: e.nombre,
          contenido: e.contenido,
          resultado: construirResultado(v.salida, e, 1),
        },
        correlationId,
      );
      assert.equal(r.ok, true);
    }
  }

  it("contra el servidor real, verifica el ingreso y luego consulta la verificación", async () => {
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "" } });
    try {
      const correlationId = randomUUID();
      const sinIdentidad = await core.verificarIngreso({}, correlationId);
      assert.equal(sinIdentidad.ok, false);
      if (!sinIdentidad.ok) assert.equal(sinIdentidad.error.codigo, "identidad_no_verificada");

      const antes = await core.consultarVerificacionIngreso(correlationId);
      assert.equal(antes.ok && antes.datos.verificacion, null);

      const unico = SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === ID_SOLICITANTE_UNICO)!;
      await core.verificarIdentidad(
        unico.idSolicitante,
        unico.fechaExpedicion,
        randomUUID(),
        correlationId,
      );
      await registrarDocumentos(core, correlationId);

      const sinDeclarar = await core.verificarIngreso({}, correlationId);
      assert.ok(sinDeclarar.ok);
      if (sinDeclarar.ok) assert.equal(sinDeclarar.datos.verificacion.estado, "falta_declarado");

      const declarado = await core.verificarIngreso({ ingresoDeclarado: 3_800_000 }, correlationId);
      assert.ok(declarado.ok);
      if (declarado.ok) {
        assert.equal(declarado.datos.verificacion.estado, "verificado");
        assert.equal(declarado.datos.verificacion.ingreso?.monto, 3_800_000);
      }

      const despues = await core.consultarVerificacionIngreso(correlationId);
      assert.ok(despues.ok);
      if (despues.ok) assert.equal(despues.datos.verificacion?.estado, "verificado");
    } finally {
      await core.cerrar();
    }
  });

  it("envía ingresoDeclarado solo si se pasa, y null para borrarlo", async () => {
    const llamadas: { name: string; arguments: Record<string, unknown> }[] = [];
    const core = await crearClienteCore({
      llamador: {
        callTool: async (params) => {
          llamadas.push(params);
          return { structuredContent: { ok: true, datos: { verificacion: null } } };
        },
        close: async () => {},
      },
    });
    const correlationId = randomUUID();
    await core.verificarIngreso({}, correlationId);
    await core.verificarIngreso({ ingresoDeclarado: 3_800_000 }, correlationId);
    await core.verificarIngreso({ ingresoDeclarado: null }, correlationId);
    await core.consultarVerificacionIngreso(correlationId);
    assert.deepEqual(llamadas[0], { name: "verificar_ingreso", arguments: { correlationId } });
    assert.deepEqual(llamadas[1], {
      name: "verificar_ingreso",
      arguments: { ingresoDeclarado: 3_800_000, correlationId },
    });
    assert.deepEqual(llamadas[2]?.arguments, { ingresoDeclarado: null, correlationId });
    assert.deepEqual(llamadas[3], {
      name: "consultar_verificacion_ingreso",
      arguments: { correlationId },
    });
  });

  it("la entrada del cliente no tiene ningún campo de ingreso verificado", async () => {
    const llamadas: Record<string, unknown>[] = [];
    const core = await crearClienteCore({
      llamador: {
        callTool: async (params) => {
          llamadas.push(params.arguments);
          return { structuredContent: { ok: true, datos: { verificacion: null } } };
        },
        close: async () => {},
      },
    });
    await core.verificarIngreso(
      { ingresoDeclarado: 1, ingresoVerificado: 2 } as never,
      randomUUID(),
    );
    // El cliente solo reenvía el campo declarado; cualquier otro lo rechazaría el servidor.
    assert.deepEqual(Object.keys(llamadas[0] ?? {}).sort(), ["correlationId", "ingresoDeclarado"]);
  });

  it("una verificación que no cumple el esquema es fuera de contrato", async () => {
    const core = await crearClienteCore({
      llamador: {
        callTool: async () => ({
          structuredContent: { ok: true, datos: { verificacion: { estado: "aprobado" } } },
        }),
        close: async () => {},
      },
    });
    const r = await core.verificarIngreso({}, randomUUID());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.codigo, "respuesta_fuera_de_contrato");
    const consulta = await core.consultarVerificacionIngreso(randomUUID());
    assert.equal(consulta.ok, false);
  });

  it("la consulta acepta una verificación null como éxito", async () => {
    const core = await crearClienteCore({
      llamador: {
        callTool: async () => ({
          structuredContent: { ok: true, datos: { verificacion: null } },
        }),
        close: async () => {},
      },
    });
    const r = await core.consultarVerificacionIngreso(randomUUID());
    assert.deepEqual(r, { ok: true, datos: { verificacion: null } });
  });

  it("un tiempo agotado es un error transitorio", async () => {
    const core = await crearClienteCore({
      llamador: {
        callTool: async () => {
          throw new McpError(ErrorCode.RequestTimeout, "tiempo");
        },
        close: async () => {},
      },
    });
    const r = await core.verificarIngreso({}, randomUUID());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.codigo, "tiempo_agotado");
  });
});

describe("cliente del core: reextracción (#11, US5)", () => {
  function resultadoCertificado() {
    const v = validarSalida(salidaCertificado(), { contenido: CONTENIDO_CERTIFICADO }, new Date());
    if (!v.ok) assert.fail(JSON.stringify(v.errores));
    return construirResultado(
      v.salida,
      { adjunto: 1, nombre: "certificado.md", contenido: CONTENIDO_CERTIFICADO },
      1,
    );
  }

  it("envía reextraccion con la regla a registrar_extraccion cuando viene, y no la envía si no", async () => {
    const llamadas: { name: string; arguments: Record<string, unknown> }[] = [];
    const core = await crearClienteCore({
      llamador: {
        callTool: async (params) => {
          llamadas.push(params);
          return { structuredContent: { ok: true, datos: {} } };
        },
        close: async () => {},
      },
    });
    const base = {
      adjunto: 1,
      nombre: "extracto.md",
      contenido: CONTENIDO_CERTIFICADO,
      resultado: resultadoCertificado(),
    };
    await core.registrarExtraccion(base, randomUUID());
    await core.registrarExtraccion(
      { ...base, reextraccion: { regla: "titular_vs_solicitante" } },
      randomUUID(),
    );
    assert.equal("reextraccion" in llamadas[0]!.arguments, false);
    assert.deepEqual(llamadas[1]!.arguments["reextraccion"], { regla: "titular_vs_solicitante" });
  });

  it("conserva los códigos reextraccion_no_aplica y reextraccion_agotada del core", async () => {
    for (const codigo of ["reextraccion_no_aplica", "reextraccion_agotada"]) {
      const core = await crearClienteCore({
        llamador: {
          callTool: async () => ({
            isError: true,
            structuredContent: {
              ok: false,
              error: { categoria: "negocio", codigo, mensaje: "x", reintentable: false },
            },
          }),
          close: async () => {},
        },
      });
      const r = await core.registrarExtraccion(
        {
          adjunto: 1,
          nombre: "a.md",
          contenido: CONTENIDO_CERTIFICADO,
          resultado: resultadoCertificado(),
          reextraccion: { regla: "titular_vs_solicitante" },
        },
        randomUUID(),
      );
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error.codigo, codigo);
    }
  });
});

describe("cliente del core: calcularCapacidadPago (#12, US1)", () => {
  const entrada = { monto: 4_000_000, plazoMeses: 24, ingresoMensual: 3_800_000 };

  it("contra el servidor real devuelve la simulación validada", async () => {
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "" } });
    try {
      const r = await core.calcularCapacidadPago(entrada, randomUUID());
      assert.ok(r.ok, JSON.stringify(r));
      if (!r.ok) return;
      assert.equal(r.datos.simulacion.cuotaMensual, 206_723);
      assert.equal(r.datos.simulacion.fuenteIngreso, "declarado");
      assert.equal(r.datos.simulacion.vinculante, false);
    } finally {
      await core.cerrar();
    }
  });

  it("envía la herramienta, los tres datos y el correlationId", async () => {
    const llamadas: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const correlationId = randomUUID();
    const core = await crearClienteCore({
      llamador: {
        callTool: async (params) => {
          llamadas.push(params);
          return { structuredContent: { ok: false, error: errorDeEjemplo } };
        },
        close: async () => {},
      },
    });
    await core.calcularCapacidadPago(entrada, correlationId);
    assert.deepEqual(llamadas, [
      { name: "calcular_capacidad_pago", arguments: { ...entrada, correlationId } },
    ]);
  });

  it("sin ingresoMensual no envía el campo: el core lo rechaza", async () => {
    const llamadas: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const core = await crearClienteCore({
      llamador: {
        callTool: async (params) => {
          llamadas.push(params);
          return { structuredContent: { ok: false, error: errorDeEjemplo } };
        },
        close: async () => {},
      },
    });
    await core.calcularCapacidadPago({ monto: 1_000_000, plazoMeses: 12 }, randomUUID());
    assert.equal("ingresoMensual" in (llamadas[0]?.arguments ?? {}), false);
  });

  it("una respuesta fuera de contrato es respuesta_fuera_de_contrato, no reintentable", async () => {
    for (const contenido of [
      undefined,
      { ok: true, datos: { simulacion: { cuotaMensual: 206_723 } } },
      { ok: true, datos: { simulacion: { ...simulacionDeEjemplo, vinculante: true } } },
      { ok: true, datos: { simulacion: { ...simulacionDeEjemplo, preaprobado: true } } },
    ]) {
      const core = await crearClienteCore({
        llamador: {
          callTool: async () => ({ structuredContent: contenido }),
          close: async () => {},
        },
      });
      const r = await core.calcularCapacidadPago(entrada, randomUUID());
      assert.equal(r.ok, false);
      if (r.ok) return;
      assert.equal(r.error.codigo, "respuesta_fuera_de_contrato");
      assert.equal(r.error.reintentable, false);
    }
  });

  it("conserva el error de validación del core con su campo", async () => {
    const core = await crearClienteCore({
      llamador: {
        callTool: async () => ({
          isError: true,
          structuredContent: { ok: false, error: errorDeEjemplo },
        }),
        close: async () => {},
      },
    });
    const r = await core.calcularCapacidadPago({ monto: 0, plazoMeses: 12 }, randomUUID());
    assert.deepEqual(r, { ok: false, error: errorDeEjemplo });
  });

  it("un tiempo agotado es un error transitorio", async () => {
    const core = await crearClienteCore({
      llamador: {
        callTool: async () => {
          throw new McpError(ErrorCode.RequestTimeout, "tiempo");
        },
        close: async () => {},
      },
    });
    const r = await core.calcularCapacidadPago(entrada, randomUUID());
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.codigo, "tiempo_agotado");
  });
});

const errorDeEjemplo = {
  categoria: "validacion",
  reintentable: false,
  codigo: "monto_invalido",
  mensaje: "El monto debe ser un entero de pesos mayor que 0.",
  campo: "monto",
} as const;

const simulacionDeEjemplo = {
  tipo: "simulacion",
  vinculante: false,
  monto: 4_000_000,
  plazoMeses: 24,
  ingresoMensual: 3_800_000,
  fuenteIngreso: "declarado",
  tasaMensualPuntosBase: 180,
  cuotaMensual: 206_723,
  relacionCuotaIngresoPorcentaje: 5.44,
  aviso: "Simulación no vinculante.",
  versionPolitica: "2026-10-18.2",
} as const;
