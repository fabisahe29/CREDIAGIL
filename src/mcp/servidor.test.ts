import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ID_ANULADA, ID_EN_ESTUDIO, ID_INEXISTENTE, ID_RESERVADA } from "./datos-ejemplo.ts";

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
