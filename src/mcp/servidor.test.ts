import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ID_ANULADA,
  ID_EN_ESTUDIO,
  ID_HOMONIMO_1,
  ID_HOMONIMO_2,
  ID_INEXISTENTE,
  ID_RESERVADA,
  ID_SOLICITANTE_UNICO,
  NOMBRE_SIN_COINCIDENCIAS,
  SOLICITANTES_EJEMPLO,
} from "./datos-ejemplo.ts";

import { construirResultado, validarSalida } from "../compartido/extraccion.ts";
import { CONTENIDO_CERTIFICADO, salidaCertificado } from "../compartido/extraccion-ejemplos.ts";
import { VERSION_POLITICA } from "../politica/politica.ts";

const PRINCIPAL = fileURLToPath(new URL("./principal.ts", import.meta.url));

/** Arranca el servidor del core como proceso stdio, igual que Claude Code o el agente. */
export async function conectarServidor(env: Record<string, string> = {}) {
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [PRINCIPAL],
    env: { ...(process.env as Record<string, string>), ...env },
    stderr: "pipe",
  });
  const stderr: string[] = [];
  transporte.stderr?.on("data", (trozo: Buffer) => stderr.push(trozo.toString("utf8")));
  const cliente = new Client({ name: "prueba", version: "0.0.0" });
  await cliente.connect(transporte);
  return { cliente, stderr, cerrar: () => cliente.close() };
}

export type Conexion = Awaited<ReturnType<typeof conectarServidor>>;

describe("servidor MCP del core como proceso stdio", () => {
  let conexion: Conexion;
  before(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  after(async () => {
    await conexion.cerrar();
  });

  it("anuncia consultar_solicitud con su esquema de entrada y de salida", async () => {
    const { tools } = await conexion.cliente.listTools();
    const herramienta = tools.find((t) => t.name === "consultar_solicitud");
    assert.ok(herramienta, "falta consultar_solicitud");
    assert.ok(herramienta.inputSchema.properties?.["idSolicitud"]);
    assert.ok(herramienta.inputSchema.properties?.["correlationId"]);
    assert.ok(herramienta.outputSchema, "falta el esquema de salida");
  });

  it("devuelve la solicitud en estudio en structuredContent, sin isError", async () => {
    const correlationId = randomUUID();
    const resultado = await conexion.cliente.callTool({
      name: "consultar_solicitud",
      arguments: { idSolicitud: ID_EN_ESTUDIO, correlationId },
    });
    assert.notEqual(resultado.isError, true);
    const contenido = resultado.structuredContent as {
      ok: boolean;
      datos: { solicitud: { idSolicitud: string } };
    };
    assert.equal(contenido.ok, true);
    assert.equal(contenido.datos.solicitud.idSolicitud, ID_EN_ESTUDIO);
  });

  it("registra la llamada en stderr con el correlationId y sin datos del solicitante", async () => {
    const correlationId = randomUUID();
    await conexion.cliente.callTool({
      name: "consultar_solicitud",
      arguments: { idSolicitud: ID_EN_ESTUDIO, correlationId },
    });
    await new Promise((resolver) => setTimeout(resolver, 100));
    const lineas = conexion.stderr.join("").split("\n").filter(Boolean);
    const registro = lineas
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((r) => r["correlationId"] === correlationId);
    assert.ok(registro, "no se registró la llamada");
    assert.equal(registro["evento"], "herramienta");
    assert.equal(registro["resultado"], "ok");
    assert.equal(JSON.stringify(registro).includes("cliente.example"), false);
  });
});

describe("servidor MCP del core: contrato de errores por MCP (US2)", () => {
  let conexion: Conexion;
  before(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  after(async () => {
    await conexion.cerrar();
  });

  async function llamar(argumentos: Record<string, unknown>) {
    const resultado = await conexion.cliente.callTool({
      name: "consultar_solicitud",
      arguments: argumentos,
    });
    return {
      isError: resultado.isError === true,
      contenido: resultado.structuredContent as {
        ok: boolean;
        datos?: { solicitud: unknown };
        error?: { categoria: string; reintentable: boolean; codigo: string; campo?: string };
      },
    };
  }

  it("un identificador inexistente es un éxito vacío, sin isError", async () => {
    const r = await llamar({ idSolicitud: ID_INEXISTENTE, correlationId: randomUUID() });
    assert.equal(r.isError, false);
    assert.deepEqual(r.contenido, { ok: true, datos: { solicitud: null } });
  });

  it("un formato inválido es validación del campo idSolicitud", async () => {
    const r = await llamar({ idSolicitud: "SOL-123", correlationId: randomUUID() });
    assert.equal(r.isError, true);
    assert.equal(r.contenido.error?.categoria, "validacion");
    assert.equal(r.contenido.error?.campo, "idSolicitud");
  });

  it("un campo extra en la entrada es validación de ese campo", async () => {
    const r = await llamar({
      idSolicitud: ID_EN_ESTUDIO,
      correlationId: randomUUID(),
      extra: "x",
    });
    assert.equal(r.contenido.error?.categoria, "validacion");
    assert.equal(r.contenido.error?.campo, "extra");
  });

  it("un campo faltante es validación formato_invalido de ese campo", async () => {
    const r = await llamar({ correlationId: randomUUID() });
    assert.equal(r.isError, true);
    assert.equal(r.contenido.error?.categoria, "validacion");
    assert.equal(r.contenido.error?.codigo, "formato_invalido");
    assert.equal(r.contenido.error?.campo, "idSolicitud");
  });

  it("un correlationId que no es UUID es validación de ese campo", async () => {
    const r = await llamar({ idSolicitud: ID_EN_ESTUDIO, correlationId: "no-uuid" });
    assert.equal(r.contenido.error?.campo, "correlationId");
  });

  it("anulada es negocio y reservada es permisos, ninguna reintentable", async () => {
    const anulada = await llamar({ idSolicitud: ID_ANULADA, correlationId: randomUUID() });
    const reservada = await llamar({ idSolicitud: ID_RESERVADA, correlationId: randomUUID() });
    assert.equal(anulada.isError, true);
    assert.equal(anulada.contenido.error?.categoria, "negocio");
    assert.equal(reservada.contenido.error?.categoria, "permisos");
    for (const r of [anulada, reservada]) assert.equal(r.contenido.error?.reintentable, false);
  });
});

describe("servidor MCP del core: falla configurada al arrancar (US3)", () => {
  it("con CREDIAGIL_FALLA=siempre responde transitorio core_no_disponible por MCP", async () => {
    const conexion = await conectarServidor({ CREDIAGIL_FALLA: "siempre" });
    try {
      const resultado = await conexion.cliente.callTool({
        name: "consultar_solicitud",
        arguments: { idSolicitud: ID_EN_ESTUDIO, correlationId: randomUUID() },
      });
      const contenido = resultado.structuredContent as {
        error: { codigo: string; reintentable: boolean };
      };
      assert.equal(resultado.isError, true);
      assert.equal(contenido.error.codigo, "core_no_disponible");
      assert.equal(contenido.error.reintentable, true);
    } finally {
      await conexion.cerrar();
    }
  });

  it("con un valor inválido de CREDIAGIL_FALLA no arranca y lo explica en stderr", () => {
    const proceso = spawnSync(process.execPath, [PRINCIPAL], {
      env: { ...process.env, CREDIAGIL_FALLA: "a-veces" },
      encoding: "utf8",
      input: "",
      timeout: 20_000,
    });
    assert.equal(proceso.status, 1);
    assert.match(proceso.stderr, /CREDIAGIL_FALLA/);
    assert.equal(proceso.stdout, "");
  });
});

type ContenidoHerramienta = {
  ok: boolean;
  datos?: Record<string, unknown>;
  error?: {
    categoria: string;
    reintentable: boolean;
    codigo: string;
    campo?: string;
    mensaje: string;
  };
};

async function llamarHerramienta(
  conexion: Conexion,
  nombre: string,
  argumentos: Record<string, unknown>,
) {
  const resultado = await conexion.cliente.callTool({ name: nombre, arguments: argumentos });
  return {
    isError: resultado.isError === true,
    contenido: resultado.structuredContent as ContenidoHerramienta,
  };
}

/** Registros JSON de stderr con ese correlationId, tras dar tiempo a que lleguen. */
async function registrosDe(conexion: Conexion, correlationId: string) {
  await new Promise((resolver) => setTimeout(resolver, 100));
  return conexion.stderr
    .join("")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((r) => r["correlationId"] === correlationId);
}

describe("servidor MCP del core: buscar_solicitante (US1)", () => {
  let conexion: Conexion;
  before(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  after(async () => {
    await conexion.cerrar();
  });

  const buscar = (argumentos: Record<string, unknown>) =>
    llamarHerramienta(conexion, "buscar_solicitante", argumentos);

  it("anuncia buscar_solicitante con su esquema de entrada y de salida", async () => {
    const { tools } = await conexion.cliente.listTools();
    const herramienta = tools.find((t) => t.name === "buscar_solicitante");
    assert.ok(herramienta, "falta buscar_solicitante");
    for (const campo of ["documento", "nombre", "correlationId"]) {
      assert.ok(herramienta.inputSchema.properties?.[campo], campo);
    }
    assert.ok(herramienta.outputSchema);
  });

  it("encuentra al solicitante único por documento con el documento enmascarado", async () => {
    const r = await buscar({ documento: "000.123.4567", correlationId: randomUUID() });
    assert.equal(r.isError, false);
    assert.deepEqual(r.contenido, {
      ok: true,
      datos: {
        coincidencias: [
          {
            idSolicitante: ID_SOLICITANTE_UNICO,
            nombre: "Ana Pérez Ficticia",
            documentoEnmascarado: "******4567",
          },
        ],
      },
    });
  });

  it("devuelve los dos homónimos por nombre", async () => {
    const r = await buscar({ nombre: "elena martinez inventada", correlationId: randomUUID() });
    const coincidencias = r.contenido.datos?.["coincidencias"] as { idSolicitante: string }[];
    assert.deepEqual(
      coincidencias.map((c) => c.idSolicitante),
      [ID_HOMONIMO_1, ID_HOMONIMO_2],
    );
  });

  it("sin coincidencias es un éxito vacío, sin isError", async () => {
    const r = await buscar({ nombre: NOMBRE_SIN_COINCIDENCIAS, correlationId: randomUUID() });
    assert.equal(r.isError, false);
    assert.deepEqual(r.contenido, { ok: true, datos: { coincidencias: [] } });
  });

  it("ambos criterios, un campo extra o un correlationId inválido son validación con su campo", async () => {
    const casos: [Record<string, unknown>, string][] = [
      [
        { documento: "0001234567", nombre: "Ana Pérez Ficticia", correlationId: randomUUID() },
        "criterio",
      ],
      [{ correlationId: randomUUID() }, "criterio"],
      [{ documento: "000ABC", correlationId: randomUUID() }, "documento"],
      [{ nombre: "Al", correlationId: randomUUID() }, "nombre"],
      [{ documento: 1234567, correlationId: randomUUID() }, "documento"],
      [{ documento: "0001234567", correlationId: randomUUID(), extra: 1 }, "extra"],
      [{ documento: "0001234567", correlationId: "no-uuid" }, "correlationId"],
    ];
    for (const [argumentos, campo] of casos) {
      const r = await buscar(argumentos);
      assert.equal(r.isError, true, JSON.stringify(argumentos));
      assert.equal(r.contenido.error?.categoria, "validacion");
      assert.equal(r.contenido.error?.codigo, "formato_invalido");
      assert.equal(r.contenido.error?.campo, campo, JSON.stringify(argumentos));
    }
  });

  it("registra el criterio y el número de coincidencias, sin el valor buscado", async () => {
    const correlationId = randomUUID();
    await buscar({ nombre: "Elena Martínez Inventada", correlationId });
    const [registro] = await registrosDe(conexion, correlationId);
    assert.ok(registro, "no se registró la búsqueda");
    assert.equal(registro["evento"], "herramienta");
    assert.equal(registro["herramienta"], "buscar_solicitante");
    assert.equal(registro["criterio"], "nombre");
    assert.equal(registro["coincidencias"], 2);
    assert.equal(registro["resultado"], "ok");
    assert.doesNotMatch(JSON.stringify(registro), /elena|martínez|martinez/i);
  });
});
describe("servidor MCP del core: verificar_identidad (US3)", () => {
  let conexion: Conexion;
  before(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  after(async () => {
    await conexion.cerrar();
  });

  const FECHA_UNICO = SOLICITANTES_EJEMPLO.find(
    (s) => s.idSolicitante === ID_SOLICITANTE_UNICO,
  )!.fechaExpedicion;
  const TODAS_LAS_FECHAS = SOLICITANTES_EJEMPLO.map((s) => s.fechaExpedicion);

  const verificar = (argumentos: Record<string, unknown>) =>
    llamarHerramienta(conexion, "verificar_identidad", argumentos);

  const intento = (correlationId: string, fechaExpedicion: unknown, extra = {}) => ({
    idSolicitante: ID_SOLICITANTE_UNICO,
    fechaExpedicion,
    idIntento: randomUUID(),
    correlationId,
    ...extra,
  });

  it("anuncia verificar_identidad con su esquema de entrada y de salida", async () => {
    const { tools } = await conexion.cliente.listTools();
    const herramienta = tools.find((t) => t.name === "verificar_identidad");
    assert.ok(herramienta, "falta verificar_identidad");
    for (const campo of ["idSolicitante", "fechaExpedicion", "idIntento", "correlationId"]) {
      assert.ok(herramienta.inputSchema.properties?.[campo], campo);
    }
    assert.ok(herramienta.outputSchema);
    assert.match(herramienta.description ?? "", /fecha de expedición/);
  });

  it("con la fecha correcta verifica, sin isError", async () => {
    const correlationId = randomUUID();
    const r = await verificar(intento(correlationId, FECHA_UNICO));
    assert.equal(r.isError, false);
    const identidad = r.contenido.datos?.["identidad"] as Record<string, unknown>;
    assert.equal(identidad["verificada"], true);
    assert.equal(identidad["idSolicitante"], ID_SOLICITANTE_UNICO);
    assert.equal(identidad["correlationId"], correlationId);
  });

  it("distingue validación, solicitante inexistente, dato que no coincide y bloqueo", async () => {
    const correlationId = randomUUID();
    const casos: [Record<string, unknown>, string, string | undefined][] = [
      [intento(correlationId, "2020-13-40"), "validacion/formato_invalido", "fechaExpedicion"],
      [
        intento(correlationId, FECHA_UNICO, { idSolicitante: "CLI-1" }),
        "validacion/formato_invalido",
        "idSolicitante",
      ],
      [
        intento(correlationId, FECHA_UNICO, { idIntento: "" }),
        "validacion/formato_invalido",
        "idIntento",
      ],
      [
        intento(correlationId, FECHA_UNICO, {
          idSolicitante: "CLI-0009999999",
        }),
        "negocio/solicitante_inexistente",
        undefined,
      ],
      [intento(correlationId, "2001-01-01"), "negocio/dato_no_coincide", undefined],
      [intento(correlationId, "2001-01-02"), "negocio/dato_no_coincide", undefined],
      [intento(correlationId, "2001-01-03"), "negocio/verificacion_bloqueada", undefined],
      [intento(correlationId, FECHA_UNICO), "negocio/verificacion_bloqueada", undefined],
    ];
    for (const [argumentos, esperado, campo] of casos) {
      const r = await verificar(argumentos);
      assert.equal(r.isError, true, esperado);
      const error = r.contenido.error!;
      assert.equal(`${error.categoria}/${error.codigo}`, esperado);
      assert.equal(error.campo, campo);
      assert.equal(error.reintentable, false);
    }
  });

  it("un campo faltante, extra o un correlationId inválido es validación de ese campo", async () => {
    const correlationId = randomUUID();
    const sinIntento: Record<string, unknown> = intento(correlationId, FECHA_UNICO);
    delete sinIntento["idIntento"];
    const casos: [Record<string, unknown>, string][] = [
      [sinIntento, "idIntento"],
      [intento(correlationId, FECHA_UNICO, { extra: 1 }), "extra"],
      [intento("no-uuid", FECHA_UNICO), "correlationId"],
    ];
    for (const [argumentos, campo] of casos) {
      const r = await verificar(argumentos);
      assert.equal(r.contenido.error?.categoria, "validacion");
      assert.equal(r.contenido.error?.campo, campo);
    }
  });

  it("audita cada verificación, también la mal formada, y no las repeticiones", async () => {
    const correlationId = randomUUID();
    const repetido = intento(correlationId, "2001-01-01");
    await verificar(intento(correlationId, "2020-13-40"));
    await verificar(repetido);
    await verificar(repetido);
    await verificar(intento(correlationId, FECHA_UNICO));
    await verificar(intento(correlationId, FECHA_UNICO));
    const auditorias = (await registrosDe(conexion, correlationId)).filter(
      (r) => r["evento"] === "auditoria",
    );
    assert.deepEqual(
      auditorias.map((a) => [a["resultado"], a["intentosFallidos"], a["campo"] ?? null]),
      [
        ["formato_invalido", 0, "fechaExpedicion"],
        ["no_coincide", 1, null],
        ["verificada", 1, null],
      ],
    );
    for (const a of auditorias) {
      assert.equal(a["regla"], "Regla 1");
      assert.equal(a["idSolicitante"], ID_SOLICITANTE_UNICO);
      assert.match(String(a["ts"]), /^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("ninguna línea de stderr ni respuesta contiene una fecha de expedición (SC-004)", async () => {
    const correlationId = randomUUID();
    const respuestas = [];
    for (const fecha of ["2001-01-01", "2001-01-02", FECHA_UNICO]) {
      respuestas.push(await verificar(intento(correlationId, fecha)));
    }
    const registros = JSON.stringify(await registrosDe(conexion, correlationId));
    const salida = JSON.stringify(respuestas);
    for (const fecha of [...TODAS_LAS_FECHAS, "2001-01-01", "2001-01-02"]) {
      assert.equal(registros.includes(fecha), false, `log con ${fecha}`);
      assert.equal(salida.includes(fecha), false, `respuesta con ${fecha}`);
    }
  });
});
describe("servidor MCP del core: consultar_identidad (US4)", () => {
  let conexion: Conexion;
  before(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  after(async () => {
    await conexion.cerrar();
  });

  const consultar = (argumentos: Record<string, unknown>) =>
    llamarHerramienta(conexion, "consultar_identidad", argumentos);

  it("anuncia consultar_identidad como solo lectura", async () => {
    const { tools } = await conexion.cliente.listTools();
    const herramienta = tools.find((t) => t.name === "consultar_identidad");
    assert.ok(herramienta, "falta consultar_identidad");
    assert.ok(herramienta.inputSchema.properties?.["correlationId"]);
    assert.ok(herramienta.outputSchema);
    assert.equal(herramienta.annotations?.readOnlyHint, true);
  });

  it("refleja la verificación de la conversación y no la de otra", async () => {
    const correlationId = randomUUID();
    const antes = await consultar({ correlationId });
    assert.equal(antes.isError, false);
    assert.deepEqual(antes.contenido.datos?.["identidad"], {
      correlationId,
      verificada: false,
      idSolicitante: null,
      verificadaEn: null,
    });
    await llamarHerramienta(conexion, "verificar_identidad", {
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === ID_SOLICITANTE_UNICO)!
        .fechaExpedicion,
      idIntento: randomUUID(),
      correlationId,
    });
    const despues = await consultar({ correlationId });
    const identidad = despues.contenido.datos?.["identidad"] as Record<string, unknown>;
    assert.equal(identidad["verificada"], true);
    assert.equal(identidad["idSolicitante"], ID_SOLICITANTE_UNICO);
    const otra = await consultar({ correlationId: randomUUID() });
    assert.equal(
      (otra.contenido.datos?.["identidad"] as { verificada: boolean }).verificada,
      false,
    );
  });

  it("un correlationId inválido o un campo extra es validación de ese campo", async () => {
    const casos: [Record<string, unknown>, string][] = [
      [{ correlationId: "no-uuid" }, "correlationId"],
      [{}, "correlationId"],
      [{ correlationId: randomUUID(), extra: 1 }, "extra"],
    ];
    for (const [argumentos, campo] of casos) {
      const r = await consultar(argumentos);
      assert.equal(r.isError, true);
      assert.equal(r.contenido.error?.categoria, "validacion");
      assert.equal(r.contenido.error?.campo, campo);
    }
  });
});

describe("servidor MCP del core: registrar_extraccion y consultar_extracciones (#10)", () => {
  let conexion: Conexion;
  before(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  after(async () => {
    await conexion.cerrar();
  });

  async function verificado() {
    const correlationId = randomUUID();
    await llamarHerramienta(conexion, "verificar_identidad", {
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === ID_SOLICITANTE_UNICO)!
        .fechaExpedicion,
      idIntento: randomUUID(),
      correlationId,
    });
    return correlationId;
  }

  function resultadoCertificado() {
    const v = validarSalida(salidaCertificado(), { contenido: CONTENIDO_CERTIFICADO }, new Date());
    if (!v.ok) assert.fail(JSON.stringify(v.errores));
    return construirResultado(
      v.salida,
      { adjunto: 1, nombre: "certificado.md", contenido: CONTENIDO_CERTIFICADO },
      1,
    );
  }

  const registrar = (correlationId: string, extra: Record<string, unknown> = {}) =>
    llamarHerramienta(conexion, "registrar_extraccion", {
      correlationId,
      adjunto: 1,
      nombre: "certificado.md",
      contenido: CONTENIDO_CERTIFICADO,
      resultado: resultadoCertificado(),
      ...extra,
    });

  it("anuncia las dos herramientas; consultar_extracciones como solo lectura", async () => {
    const { tools } = await conexion.cliente.listTools();
    const registrarH = tools.find((t) => t.name === "registrar_extraccion");
    const consultarH = tools.find((t) => t.name === "consultar_extracciones");
    assert.ok(registrarH?.inputSchema.properties?.["contenido"]);
    assert.ok(registrarH?.outputSchema);
    assert.equal(consultarH?.annotations?.readOnlyHint, true);
  });

  it("sin identidad verificada responde negocio identidad_no_verificada", async () => {
    const r = await registrar(randomUUID());
    assert.equal(r.isError, true);
    assert.equal(r.contenido.error?.categoria, "negocio");
    assert.equal(r.contenido.error?.codigo, "identidad_no_verificada");
  });

  it("con identidad registra, deja la auditoría sin contenido ni fragmentos y se puede consultar", async () => {
    const correlationId = await verificado();
    const r = await registrar(correlationId);
    assert.equal(r.isError, false);
    const extraccion = r.contenido.datos?.["extraccion"] as { estado: string; adjuntos: number[] };
    assert.equal(extraccion.estado, "extraido");
    assert.deepEqual(extraccion.adjuntos, [1]);

    const consulta = await llamarHerramienta(conexion, "consultar_extracciones", { correlationId });
    assert.equal((consulta.contenido.datos?.["extracciones"] as unknown[]).length, 1);

    const registros = await registrosDe(conexion, correlationId);
    const auditoria = registros.find((l) => l["evento"] === "auditoria_extraccion");
    assert.ok(auditoria, "falta la auditoría");
    assert.equal(auditoria["adjunto"], 1);
    assert.equal(auditoria["estado"], "extraido");
    assert.equal(auditoria["versionPolitica"], VERSION_POLITICA);
    assert.equal(typeof auditoria["regla"], "string");
    assert.equal(typeof auditoria["ts"], "string");
    const texto = JSON.stringify(registros);
    assert.equal(texto.includes("Certificado laboral ficticio"), false, "el contenido en el log");
    assert.equal(texto.includes("trabaja como analista"), false, "un fragmento en el log");
  });

  it("un fragmento ajeno es extraccion_invalida con el campo del resultado", async () => {
    const correlationId = await verificado();
    const resultado = resultadoCertificado();
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "certificado_laboral") {
      return assert.fail("debía ser un certificado extraído");
    }
    resultado.documento.cargo!.procedencia.fragmento = "trabaja como gerente general";
    const r = await registrar(correlationId, { resultado });
    assert.equal(r.isError, true);
    assert.equal(r.contenido.error?.codigo, "extraccion_invalida");
    assert.equal(r.contenido.error?.campo, "resultado.documento.cargo");
  });

  it("un contenido demasiado grande, un campo extra o un correlationId inválido son validación", async () => {
    const correlationId = await verificado();
    const grande = await registrar(correlationId, { contenido: "x".repeat(262_145) });
    assert.equal(grande.contenido.error?.campo, "contenido");
    const extra = await registrar(correlationId, { otro: 1 });
    assert.equal(extra.contenido.error?.campo, "otro");
    const id = await registrar("no-uuid");
    assert.equal(id.contenido.error?.campo, "correlationId");
  });
});
