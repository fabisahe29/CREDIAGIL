import { after, afterEach, before, beforeEach, describe, it } from "node:test";
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
import {
  ejemploCertificado,
  extractoConLecturaErrada,
  extractosTrimestre,
  type Ejemplo,
} from "../compartido/ingreso-ejemplos.ts";
import { VERSION_POLITICA } from "../politica/politica.ts";
import {
  DESCRIPCION_CAPACIDAD_PAGO,
  esquemaSimulacionCapacidadPago,
} from "../compartido/capacidad-pago.ts";
import { DESCRIPCION_REGISTRAR_SOLICITUD } from "../compartido/solicitud.ts";
import { DESCRIPCION_PREAPROBAR_CREDITO } from "../compartido/preaprobacion.ts";
import {
  DESCRIPCION_ESCALAR_A_ANALISTA,
  claveIdempotenciaEscalamiento,
} from "../compartido/escalamiento.ts";

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

describe("servidor MCP del core: verificar_ingreso y consultar_verificacion_ingreso (#11)", () => {
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

  async function registrarDocumentos(correlationId: string) {
    for (const e of [ejemploCertificado(), ...extractosTrimestre()]) {
      const v = validarSalida(e.salida, e, new Date());
      if (!v.ok) assert.fail(JSON.stringify(v.errores));
      const r = await llamarHerramienta(conexion, "registrar_extraccion", {
        correlationId,
        adjunto: e.adjunto,
        nombre: e.nombre,
        contenido: e.contenido,
        resultado: construirResultado(v.salida, e, 1),
      });
      assert.equal(r.isError, false, JSON.stringify(r.contenido));
    }
  }

  const verificar = (argumentos: Record<string, unknown>) =>
    llamarHerramienta(conexion, "verificar_ingreso", argumentos);

  it("anuncia las dos herramientas con su esquema de salida; la consulta como solo lectura", async () => {
    const { tools } = await conexion.cliente.listTools();
    const verificarH = tools.find((t) => t.name === "verificar_ingreso");
    const consultarH = tools.find((t) => t.name === "consultar_verificacion_ingreso");
    assert.ok(verificarH?.inputSchema.properties?.["correlationId"]);
    assert.ok(verificarH?.inputSchema.properties?.["ingresoDeclarado"]);
    assert.equal(verificarH?.inputSchema.properties?.["ingresoVerificado"], undefined);
    assert.ok(verificarH?.outputSchema);
    assert.ok(consultarH?.outputSchema);
    assert.equal(consultarH?.annotations?.readOnlyHint, true);
  });

  it("sin identidad verificada responde negocio identidad_no_verificada", async () => {
    const r = await verificar({ correlationId: randomUUID() });
    assert.equal(r.isError, true);
    assert.equal(r.contenido.error?.categoria, "negocio");
    assert.equal(r.contenido.error?.codigo, "identidad_no_verificada");
  });

  it("con los documentos verifica, audita sin contenido ni valores y se puede consultar", async () => {
    const correlationId = await verificado();
    await registrarDocumentos(correlationId);

    const r = await verificar({ correlationId, ingresoDeclarado: 4_300_000 });
    assert.equal(r.isError, false);
    const v = r.contenido.datos?.["verificacion"] as {
      estado: string;
      ingreso: { monto: number; origen: string };
    };
    assert.equal(v.estado, "discrepancia");
    assert.equal(v.ingreso.monto, 3_800_000);

    const consulta = await llamarHerramienta(conexion, "consultar_verificacion_ingreso", {
      correlationId,
    });
    assert.equal(
      (consulta.contenido.datos?.["verificacion"] as { estado: string }).estado,
      "discrepancia",
    );

    const registros = await registrosDe(conexion, correlationId);
    const auditoria = registros.find((l) => l["evento"] === "auditoria_ingreso");
    assert.ok(auditoria, "falta la auditoría");
    assert.equal(auditoria["estado"], "discrepancia");
    assert.equal(auditoria["ingresoVerificado"], 3_800_000);
    assert.equal(auditoria["ingresoDeclarado"], 4_300_000);
    assert.equal(auditoria["diferencia"], 500_000);
    assert.equal(auditoria["umbralPorcentaje"], 10);
    assert.equal(auditoria["versionPolitica"], VERSION_POLITICA);
    assert.equal(typeof auditoria["regla"], "string");
    assert.equal(typeof auditoria["ts"], "string");
    const herramienta = registros.find(
      (l) => l["evento"] === "herramienta" && l["herramienta"] === "verificar_ingreso",
    );
    assert.equal(herramienta?.["estado"], "discrepancia");
    const texto = JSON.stringify(registros);
    for (const dato of ["Certificado laboral ficticio", "Industrias", "Ficticia", "Salario"]) {
      assert.equal(texto.includes(dato), false, `«${dato}» en el log`);
    }
  });

  it("repetir la verificación con los mismos datos no audita otra vez", async () => {
    const correlationId = await verificado();
    await registrarDocumentos(correlationId);
    await verificar({ correlationId, ingresoDeclarado: 3_800_000 });
    await verificar({ correlationId, ingresoDeclarado: 3_800_000 });
    const registros = await registrosDe(conexion, correlationId);
    assert.equal(registros.filter((l) => l["evento"] === "auditoria_ingreso").length, 1);
  });

  it("la consulta antes de verificar devuelve verificacion null", async () => {
    const correlationId = await verificado();
    const r = await llamarHerramienta(conexion, "consultar_verificacion_ingreso", {
      correlationId,
    });
    assert.equal(r.isError, false);
    assert.equal(r.contenido.datos?.["verificacion"], null);
  });

  it("un campo extra, un correlationId inválido o un declarado inválido son validación de ese campo", async () => {
    const correlationId = await verificado();
    const casos: [Record<string, unknown>, string][] = [
      [{ correlationId, ingresoVerificado: 9_999_999 }, "ingresoVerificado"],
      [{ correlationId: "no-uuid" }, "correlationId"],
      [{}, "correlationId"],
      [{ correlationId, ingresoDeclarado: -1 }, "ingresoDeclarado"],
      [{ correlationId, ingresoDeclarado: "mucho" }, "ingresoDeclarado"],
    ];
    for (const [argumentos, campo] of casos) {
      const r = await verificar(argumentos);
      assert.equal(r.isError, true, campo);
      assert.equal(r.contenido.error?.categoria, "validacion", campo);
      assert.equal(r.contenido.error?.campo, campo);
    }
    const consulta = await llamarHerramienta(conexion, "consultar_verificacion_ingreso", {
      correlationId,
      extra: 1,
    });
    assert.equal(consulta.contenido.error?.campo, "extra");
  });
});

describe("servidor MCP del core: registrar_extraccion con reextracción (#11, US5)", () => {
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

  const registrar = (correlationId: string, e: Ejemplo, extra: Record<string, unknown> = {}) => {
    const v = validarSalida(e.salida, e, new Date());
    if (!v.ok) assert.fail(JSON.stringify(v.errores));
    return llamarHerramienta(conexion, "registrar_extraccion", {
      correlationId,
      adjunto: e.adjunto,
      nombre: e.nombre,
      contenido: e.contenido,
      resultado: construirResultado(v.salida, e, 1),
      ...extra,
    });
  };

  it("anuncia reextraccion en la entrada de registrar_extraccion", async () => {
    const { tools } = await conexion.cliente.listTools();
    const registrarH = tools.find((t) => t.name === "registrar_extraccion");
    assert.ok(registrarH?.inputSchema.properties?.["reextraccion"]);
  });

  it("reemplaza el registro con una reextracción vigente, audita la regla y la anota en el log", async () => {
    const correlationId = await verificado();
    const { errada, correcta } = extractoConLecturaErrada();
    assert.equal((await registrar(correlationId, errada)).isError, false);
    const r = await registrar(correlationId, correcta, {
      reextraccion: { regla: "titular_vs_solicitante" },
    });
    assert.equal(r.isError, false, JSON.stringify(r.contenido));
    const extraccion = r.contenido.datos?.["extraccion"] as { reextraidaPor: string[] };
    assert.deepEqual(extraccion.reextraidaPor, ["titular_vs_solicitante"]);
    const registros = await registrosDe(conexion, correlationId);
    const auditoria = registros.find(
      (l) => l["evento"] === "auditoria_extraccion" && l["reextraccion"] !== undefined,
    );
    assert.equal(auditoria?.["reextraccion"], "titular_vs_solicitante");
    const herramienta = registros.find(
      (l) => l["evento"] === "herramienta" && l["reextraccion"] !== undefined,
    );
    assert.equal(herramienta?.["reextraccion"], "titular_vs_solicitante");
    assert.equal(JSON.stringify(registros).includes("Luis Gómez"), false, "un valor en el log");
  });

  it("sin inconsistencia vigente responde negocio reextraccion_no_aplica", async () => {
    const correlationId = await verificado();
    const { correcta } = extractoConLecturaErrada();
    assert.equal((await registrar(correlationId, correcta)).isError, false);
    const r = await registrar(correlationId, correcta, {
      reextraccion: { regla: "titular_vs_solicitante" },
    });
    assert.equal(r.isError, true);
    assert.equal(r.contenido.error?.categoria, "negocio");
    assert.equal(r.contenido.error?.codigo, "reextraccion_no_aplica");
  });

  it("rechaza campos extra dentro de reextraccion como validación de ese campo", async () => {
    const correlationId = await verificado();
    const { errada } = extractoConLecturaErrada();
    assert.equal((await registrar(correlationId, errada)).isError, false);
    const r = await registrar(correlationId, errada, {
      reextraccion: { regla: "titular_vs_solicitante", otro: 1 },
    });
    assert.equal(r.isError, true);
    assert.equal(r.contenido.error?.categoria, "validacion");
    assert.equal(r.contenido.error?.campo, "reextraccion");
  });
});

describe("servidor MCP del core: calcular_capacidad_pago (#12, US1)", () => {
  let conexion: Conexion;
  before(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  after(async () => {
    await conexion.cerrar();
  });

  it("anuncia calcular_capacidad_pago con su descripción y sus esquemas", async () => {
    const { tools } = await conexion.cliente.listTools();
    const herramienta = tools.find((t) => t.name === "calcular_capacidad_pago");
    assert.ok(herramienta, "falta calcular_capacidad_pago");
    assert.equal(herramienta.description, DESCRIPCION_CAPACIDAD_PAGO);
    for (const campo of ["monto", "plazoMeses", "ingresoMensual", "correlationId"]) {
      assert.ok(herramienta.inputSchema.properties?.[campo], `falta ${campo}`);
    }
    assert.ok(herramienta.outputSchema, "falta el esquema de salida");
  });

  it("devuelve la cuota de referencia en structuredContent, sin isError", async () => {
    const resultado = await conexion.cliente.callTool({
      name: "calcular_capacidad_pago",
      arguments: {
        monto: 4_000_000,
        plazoMeses: 24,
        ingresoMensual: 3_800_000,
        correlationId: randomUUID(),
      },
    });
    assert.notEqual(resultado.isError, true);
    const contenido = resultado.structuredContent as {
      ok: boolean;
      datos: { simulacion: unknown };
    };
    assert.equal(contenido.ok, true);
    const simulacion = esquemaSimulacionCapacidadPago.parse(contenido.datos.simulacion);
    assert.equal(simulacion.cuotaMensual, 206_723);
    assert.equal(simulacion.fuenteIngreso, "declarado");
    assert.equal(simulacion.vinculante, false);
  });

  it("US2: se anuncia como herramienta de solo lectura", async () => {
    const { tools } = await conexion.cliente.listTools();
    const herramienta = tools.find((t) => t.name === "calcular_capacidad_pago");
    assert.equal(herramienta?.annotations?.readOnlyHint, true);
  });

  it("US2: el log lleva el resultado y la fuente, sin montos ni auditoría de decisión", async () => {
    const correlationId = randomUUID();
    await conexion.cliente.callTool({
      name: "calcular_capacidad_pago",
      arguments: { monto: 4_123_457, plazoMeses: 24, ingresoMensual: 3_876_543, correlationId },
    });
    const registros = await registrosDe(conexion, correlationId);
    const llamada = registros.find((r) => r["evento"] === "herramienta");
    assert.ok(llamada, "no se registró la llamada");
    assert.equal(llamada["herramienta"], "calcular_capacidad_pago");
    assert.equal(llamada["resultado"], "ok");
    assert.equal(llamada["fuenteIngreso"], "declarado");
    assert.deepEqual(
      registros.filter((r) => String(r["evento"]).startsWith("auditoria")),
      [],
    );
    // Ni el monto, ni el ingreso, ni la cuota resultante (213.104) aparecen en ninguna línea.
    const texto = JSON.stringify(registros);
    for (const dato of ["4123457", "3876543", "213104"]) {
      assert.equal(texto.includes(dato), false, dato);
    }
  });
});

describe("servidor MCP del core: calcular_capacidad_pago con entradas inválidas (#12, US4)", () => {
  let conexion: Conexion;
  before(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  after(async () => {
    await conexion.cerrar();
  });

  const valida = { monto: 4_000_000, plazoMeses: 24, ingresoMensual: 3_800_000 };

  async function llamar(argumentos: Record<string, unknown>) {
    const resultado = await conexion.cliente.callTool({
      name: "calcular_capacidad_pago",
      arguments: { correlationId: randomUUID(), ...argumentos },
    });
    return {
      isError: resultado.isError,
      contenido: resultado.structuredContent as {
        ok: boolean;
        datos?: unknown;
        error?: { categoria: string; reintentable: boolean; codigo: string; campo?: string };
      },
    };
  }

  const casos: Array<[string, string, string, unknown]> = [
    ["monto", "monto_invalido", "monto", 0],
    ["monto", "monto_invalido", "monto", -4_000_000],
    ["monto", "monto_invalido", "monto", 1.5],
    ["monto", "monto_invalido", "monto", "4000000"],
    ["plazoMeses", "plazo_invalido", "plazoMeses", 0],
    ["plazoMeses", "plazo_invalido", "plazoMeses", -1],
    ["plazoMeses", "plazo_invalido", "plazoMeses", 2.5],
    ["ingresoMensual", "ingreso_invalido", "ingresoMensual", 0],
    ["ingresoMensual", "ingreso_invalido", "ingresoMensual", -500_000],
    ["ingresoMensual", "ingreso_invalido", "ingresoMensual", "3800000"],
  ];
  for (const [campo, codigo, esperado, valor] of casos) {
    it(`${campo} = ${JSON.stringify(valor)} llega como ${codigo} sobre ${esperado}, sin cuota`, async () => {
      const { isError, contenido } = await llamar({ ...valida, [campo]: valor });
      assert.equal(isError, true);
      assert.equal(contenido.ok, false);
      assert.equal(contenido.error?.categoria, "validacion");
      assert.equal(contenido.error?.reintentable, false);
      assert.equal(contenido.error?.codigo, codigo);
      assert.equal(contenido.error?.campo, esperado);
      assert.equal(contenido.datos, undefined);
    });
  }

  for (const [campo, codigo] of [
    ["monto", "monto_invalido"],
    ["plazoMeses", "plazo_invalido"],
    ["ingresoMensual", "ingreso_invalido"],
  ] as const) {
    it(`${campo} ausente llega como ${codigo}, no como el error genérico del SDK`, async () => {
      const entrada: Record<string, unknown> = { ...valida };
      delete entrada[campo];
      const { isError, contenido } = await llamar(entrada);
      assert.equal(isError, true);
      assert.equal(contenido.error?.codigo, codigo);
      assert.equal(contenido.error?.campo, campo);
    });
  }

  it("un campo de más es formato_invalido sobre ese campo", async () => {
    const { isError, contenido } = await llamar({ ...valida, ingresoVerificado: 9_000_000 });
    assert.equal(isError, true);
    assert.equal(contenido.error?.codigo, "formato_invalido");
    assert.equal(contenido.error?.campo, "ingresoVerificado");
  });

  it("un correlationId que no es un UUID es formato_invalido sobre correlationId", async () => {
    const { isError, contenido } = await llamar({ ...valida, correlationId: "no-es-uuid" });
    assert.equal(isError, true);
    assert.equal(contenido.error?.codigo, "formato_invalido");
    assert.equal(contenido.error?.campo, "correlationId");
  });

  it("un monto cuya cuota no es un entero seguro se rechaza como monto_invalido", async () => {
    const { isError, contenido } = await llamar({
      monto: Number.MAX_SAFE_INTEGER,
      plazoMeses: 1,
      ingresoMensual: 1,
    });
    assert.equal(isError, true);
    assert.equal(contenido.error?.codigo, "monto_invalido");
  });
});
describe("servidor MCP del core: registrar_solicitud y consultar_solicitud_registrada (#13)", () => {
  let conexion: Conexion;
  // Un servidor por prueba: cada solicitante puede tener una sola solicitud abierta en el core.
  beforeEach(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  afterEach(async () => {
    await conexion.cerrar();
  });

  const FECHA_UNICO = SOLICITANTES_EJEMPLO.find(
    (s) => s.idSolicitante === ID_SOLICITANTE_UNICO,
  )!.fechaExpedicion;
  const CITA_MONTO = {
    tipo: "afirmacion",
    fragmento: "quiero cuatro millones",
  };
  const CITA_PLAZO = { tipo: "afirmacion", fragmento: "a veinticuatro meses" };
  const CITA_INGRESO = {
    tipo: "afirmacion",
    fragmento: "gano tres millones ochocientos",
  };

  async function verificado(id = ID_SOLICITANTE_UNICO, fecha = FECHA_UNICO) {
    const correlationId = randomUUID();
    const r = await llamarHerramienta(conexion, "verificar_identidad", {
      idSolicitante: id,
      fechaExpedicion: fecha,
      idIntento: randomUUID(),
      correlationId,
    });
    assert.equal(r.isError, false, JSON.stringify(r.contenido));
    return correlationId;
  }

  async function conDocumentos(correlationId: string, declarado: number) {
    for (const e of [ejemploCertificado(), ...extractosTrimestre()]) {
      const v = validarSalida(e.salida, e, new Date());
      if (!v.ok) assert.fail(JSON.stringify(v.errores));
      const r = await llamarHerramienta(conexion, "registrar_extraccion", {
        correlationId,
        adjunto: e.adjunto,
        nombre: e.nombre,
        contenido: e.contenido,
        resultado: construirResultado(v.salida, e, 1),
      });
      assert.equal(r.isError, false, JSON.stringify(r.contenido));
    }
    const v = await llamarHerramienta(conexion, "verificar_ingreso", {
      correlationId,
      ingresoDeclarado: declarado,
    });
    assert.equal(v.isError, false, JSON.stringify(v.contenido));
  }

  const entrada = (correlationId: string, cambios: Record<string, unknown> = {}) => ({
    correlationId,
    idSolicitante: ID_SOLICITANTE_UNICO,
    monto: 4_000_000,
    plazoMeses: 24,
    claveIdempotencia: `clave-${correlationId}`,
    procedencia: {
      monto: CITA_MONTO,
      plazoMeses: CITA_PLAZO,
      ingresoDeclarado: CITA_INGRESO,
    },
    ...cambios,
  });

  const registrar = (argumentos: Record<string, unknown>) =>
    llamarHerramienta(conexion, "registrar_solicitud", argumentos);

  const leer = (correlationId: string) =>
    llamarHerramienta(conexion, "consultar_solicitud_registrada", {
      correlationId,
    });

  it("anuncia registrar_solicitud con efectos y consultar_solicitud_registrada como solo lectura", async () => {
    const { tools } = await conexion.cliente.listTools();
    const registrarH = tools.find((t) => t.name === "registrar_solicitud");
    const leerH = tools.find((t) => t.name === "consultar_solicitud_registrada");
    assert.ok(registrarH, "falta registrar_solicitud");
    assert.ok(leerH, "falta consultar_solicitud_registrada");
    assert.notEqual(registrarH.annotations?.readOnlyHint, true);
    assert.equal(leerH.annotations?.readOnlyHint, true);
    assert.ok(registrarH.outputSchema);
    assert.ok(leerH.outputSchema);
    for (const campo of [
      "idSolicitante",
      "monto",
      "plazoMeses",
      "claveIdempotencia",
      "procedencia",
    ]) {
      assert.ok(registrarH.inputSchema.properties?.[campo], campo);
    }
    for (const campo of [
      "ingresoVerificado",
      "discrepancias",
      "datosExtraidos",
      "ingresoDeclarado",
    ]) {
      assert.equal(registrarH.inputSchema.properties?.[campo], undefined, campo);
    }
    assert.equal(registrarH.description, DESCRIPCION_REGISTRAR_SOLICITUD);
  });

  it("registra con identidad verificada y la solicitud se consulta con la procedencia de cada dato", async () => {
    const correlationId = await verificado();
    await conDocumentos(correlationId, 4_300_000);
    const r = await registrar(entrada(correlationId));
    assert.equal(r.isError, false, JSON.stringify(r.contenido));
    const datos = r.contenido.datos as {
      solicitud: Record<string, any>;
      repetida: boolean;
    };
    assert.equal(datos.repetida, false);
    assert.equal(datos.solicitud["estado"], "en_estudio");
    assert.deepEqual(datos.solicitud["monto"], {
      valor: 4_000_000,
      procedencia: CITA_MONTO,
    });
    const verificacion = datos.solicitud["verificacionIngreso"] as {
      estado: string;
      discrepancia: { diferenciaPorcentaje: number };
    };
    assert.equal(verificacion.estado, "discrepancia");
    assert.equal(datos.solicitud["verificacionIngreso"].discrepancia.diferenciaPorcentaje, 13.16);

    const consulta = await leer(correlationId);
    assert.equal(consulta.isError, false);
    assert.deepEqual(consulta.contenido.datos?.["solicitud"], datos.solicitud);

    const id = datos.solicitud["idSolicitud"] as string;
    const resumen = await llamarHerramienta(conexion, "consultar_solicitud", {
      idSolicitud: id,
      correlationId,
    });
    assert.equal(
      (resumen.contenido.datos?.["solicitud"] as { estado: string }).estado,
      "en_estudio",
    );
  });

  it("la consulta de una conversación sin registro devuelve solicitud null", async () => {
    const r = await leer(randomUUID());
    assert.equal(r.isError, false);
    assert.equal(r.contenido.datos?.["solicitud"], null);
    const mala = await leer("no-uuid");
    assert.equal(mala.contenido.error?.campo, "correlationId");
  });

  it("repetir la misma clave devuelve la misma solicitud con repetida true", async () => {
    const correlationId = await verificado();
    const primera = await registrar(entrada(correlationId, { procedencia: base() }));
    const segunda = await registrar(entrada(correlationId, { procedencia: base() }));
    assert.equal(segunda.isError, false);
    assert.equal(segunda.contenido.datos?.["repetida"], true);
    assert.deepEqual(
      segunda.contenido.datos?.["solicitud"],
      primera.contenido.datos?.["solicitud"],
    );
  });

  function base() {
    return { monto: CITA_MONTO, plazoMeses: CITA_PLAZO };
  }

  it("un campo de más es formato_invalido sobre ese campo, sin guardar nada", async () => {
    const correlationId = await verificado();
    for (const campo of [
      "ingresoVerificado",
      "discrepancias",
      "datosExtraidos",
      "ingresoDeclarado",
    ]) {
      const r = await registrar(entrada(correlationId, { procedencia: base(), [campo]: 1 }));
      assert.equal(r.isError, true, campo);
      assert.equal(r.contenido.error?.codigo, "formato_invalido", campo);
      assert.equal(r.contenido.error?.campo, campo, campo);
    }
    const consulta = await leer(correlationId);
    assert.equal(consulta.contenido.datos?.["solicitud"], null);
  });

  it("la entrada sin correlationId o con uno inválido es formato_invalido sobre correlationId", async () => {
    const { correlationId: _quitado, ...sinId } = entrada(randomUUID());
    const sin = await registrar(sinId);
    assert.equal(sin.contenido.error?.campo, "correlationId");
    const mal = await registrar(entrada("no-uuid"));
    assert.equal(mal.contenido.error?.campo, "correlationId");
  });

  it("deja una auditoría por registro nuevo, ninguna por la repetición, y sin fragmentos ni documentos", async () => {
    const correlationId = await verificado();
    await conDocumentos(correlationId, 3_800_000);
    await registrar(entrada(correlationId));
    await registrar(entrada(correlationId));
    const registros = await registrosDe(conexion, correlationId);
    const auditorias = registros.filter((l) => l["evento"] === "auditoria_solicitud");
    assert.equal(auditorias.length, 1);
    const auditoria = auditorias[0]!;
    assert.equal(auditoria["resultado"], "registrada");
    assert.equal(auditoria["regla"], "Regla 1 · identidad verificada antes de registrar");
    assert.equal(auditoria["monto"], 4_000_000);
    assert.equal(auditoria["plazoMeses"], 24);
    assert.equal(auditoria["ingresoDeclarado"], 3_800_000);
    assert.equal(auditoria["ingresoVerificado"], 3_800_000);
    assert.equal(auditoria["estadoVerificacion"], "verificado");
    assert.equal(auditoria["documentos"], 4);
    assert.equal(auditoria["versionPolitica"], VERSION_POLITICA);
    assert.match(String(auditoria["idSolicitud"]), /^SOL-000\d{7}$/);
    assert.equal(typeof auditoria["ts"], "string");

    const herramienta = registros.find(
      (l) => l["evento"] === "herramienta" && l["herramienta"] === "registrar_solicitud",
    );
    assert.equal(herramienta?.["resultado"], "ok");
    assert.equal(herramienta?.["idSolicitud"], auditoria["idSolicitud"]);
    for (const campo of ["monto", "plazoMeses", "procedencia", "claveIdempotencia"]) {
      assert.equal(campo in herramienta!, false, `${campo} en el log de la herramienta`);
    }
    const delRegistro = registros.filter(
      (l) => l["evento"] === "auditoria_solicitud" || l["herramienta"] === "registrar_solicitud",
    );
    const texto = JSON.stringify(delRegistro);
    for (const dato of [
      "cuatro millones",
      "veinticuatro meses",
      "tres millones ochocientos",
      "certificado",
      "extracto",
      "Industrias",
      "Ficticia",
    ]) {
      assert.equal(texto.includes(dato), false, `«${dato}» en el log`);
    }
  });

  describe("Regla 1 del lado del servidor, sin pasar por el hook (US2)", () => {
    it("sin identidad verificada se rechaza con identidad_no_verificada y no queda solicitud", async () => {
      const correlationId = randomUUID();
      const r = await registrar(entrada(correlationId, { procedencia: base() }));
      assert.equal(r.isError, true);
      assert.equal(r.contenido.error?.categoria, "negocio");
      assert.equal(r.contenido.error?.reintentable, false);
      assert.equal(r.contenido.error?.codigo, "identidad_no_verificada");
      const consulta = await leer(correlationId);
      assert.equal(consulta.contenido.datos?.["solicitud"], null);
      const registros = await registrosDe(conexion, correlationId);
      const auditoria = registros.find((l) => l["evento"] === "auditoria_solicitud");
      assert.equal(auditoria?.["resultado"], "rechazada");
      assert.equal(auditoria?.["codigo"], "identidad_no_verificada");
      assert.equal(JSON.stringify(registros).includes("cuatro millones"), false);
    });

    it("con la identidad verificada de otra persona se rechaza: no se transfiere", async () => {
      const correlationId = await verificado();
      const r = await registrar(
        entrada(correlationId, {
          idSolicitante: ID_HOMONIMO_1,
          procedencia: base(),
        }),
      );
      assert.equal(r.isError, true);
      assert.equal(r.contenido.error?.codigo, "identidad_no_verificada");
      const consulta = await leer(correlationId);
      assert.equal(consulta.contenido.datos?.["solicitud"], null);
    });
  });

  describe("dato sin procedencia (US3)", () => {
    it("falta la procedencia de un dato: procedencia_faltante con su campo", async () => {
      const correlationId = await verificado();
      const r = await registrar(
        entrada(correlationId, { procedencia: { plazoMeses: CITA_PLAZO } }),
      );
      assert.equal(r.isError, true);
      assert.equal(r.contenido.error?.categoria, "validacion");
      assert.equal(r.contenido.error?.reintentable, false);
      assert.equal(r.contenido.error?.codigo, "procedencia_faltante");
      assert.equal(r.contenido.error?.campo, "procedencia.monto");
      const consulta = await leer(correlationId);
      assert.equal(consulta.contenido.datos?.["solicitud"], null);
    });

    it("una procedencia mal formada es procedencia_invalida y no repite el fragmento", async () => {
      const correlationId = await verificado();
      const largo = "x".repeat(301);
      const r = await registrar(
        entrada(correlationId, {
          procedencia: {
            monto: { tipo: "afirmacion", fragmento: largo },
            plazoMeses: CITA_PLAZO,
          },
        }),
      );
      assert.equal(r.contenido.error?.codigo, "procedencia_invalida");
      assert.equal(r.contenido.error?.campo, "procedencia.monto");
      assert.equal(JSON.stringify(r.contenido).includes(largo), false);
      const registros = await registrosDe(conexion, correlationId);
      assert.equal(JSON.stringify(registros).includes(largo), false);
    });

    it("un documento que no está entre los extraídos es procedencia_documento_desconocida", async () => {
      const correlationId = await verificado();
      const r = await registrar(
        entrada(correlationId, {
          procedencia: {
            monto: {
              tipo: "documento",
              adjunto: 3,
              nombre: "carta.md",
              fragmento: "x",
            },
            plazoMeses: CITA_PLAZO,
          },
        }),
      );
      assert.equal(r.contenido.error?.codigo, "procedencia_documento_desconocida");
      assert.equal(r.contenido.error?.campo, "procedencia.monto");
    });
  });
});
describe("servidor MCP del core: preaprobar_credito (#14)", () => {
  let conexion: Conexion;
  // Un servidor por prueba: cada solicitante puede tener una sola solicitud abierta en el core.
  beforeEach(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  afterEach(async () => {
    await conexion.cerrar();
  });

  const FECHA_UNICO = SOLICITANTES_EJEMPLO.find(
    (s) => s.idSolicitante === ID_SOLICITANTE_UNICO,
  )!.fechaExpedicion;
  const cita = (fragmento: string) => ({ tipo: "afirmacion", fragmento });

  async function verificado() {
    const correlationId = randomUUID();
    const r = await llamarHerramienta(conexion, "verificar_identidad", {
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: FECHA_UNICO,
      idIntento: randomUUID(),
      correlationId,
    });
    assert.equal(r.isError, false, JSON.stringify(r.contenido));
    return correlationId;
  }

  /** Identidad, documentos con ingreso de 3.800.000 y la solicitud registrada con el monto y el plazo dados. */
  async function conSolicitudRegistrada(monto: number, plazoMeses: number) {
    const correlationId = await verificado();
    for (const e of [ejemploCertificado(), ...extractosTrimestre()]) {
      const v = validarSalida(e.salida, e, new Date());
      if (!v.ok) assert.fail(JSON.stringify(v.errores));
      const r = await llamarHerramienta(conexion, "registrar_extraccion", {
        correlationId,
        adjunto: e.adjunto,
        nombre: e.nombre,
        contenido: e.contenido,
        resultado: construirResultado(v.salida, e, 1),
      });
      assert.equal(r.isError, false, JSON.stringify(r.contenido));
    }
    const ingreso = await llamarHerramienta(conexion, "verificar_ingreso", {
      correlationId,
      ingresoDeclarado: 3_800_000,
    });
    assert.equal(ingreso.isError, false, JSON.stringify(ingreso.contenido));
    const registro = await llamarHerramienta(conexion, "registrar_solicitud", {
      correlationId,
      idSolicitante: ID_SOLICITANTE_UNICO,
      monto,
      plazoMeses,
      claveIdempotencia: `clave-${correlationId}`,
      procedencia: {
        monto: cita("quiero el monto"),
        plazoMeses: cita("a ese plazo"),
        ingresoDeclarado: cita("gano ese ingreso"),
      },
    });
    assert.equal(registro.isError, false, JSON.stringify(registro.contenido));
    return correlationId;
  }

  const preaprobar = (argumentos: Record<string, unknown>) =>
    llamarHerramienta(conexion, "preaprobar_credito", argumentos);

  const leer = (correlationId: string) =>
    llamarHerramienta(conexion, "consultar_solicitud_registrada", {
      correlationId,
    });

  const estadoDe = async (correlationId: string) =>
    (
      (await leer(correlationId)).contenido.datos?.["solicitud"] as {
        estado: string;
      } | null
    )?.estado;

  it("anuncia preaprobar_credito con efectos, la descripción compartida y solo el correlationId", async () => {
    const { tools } = await conexion.cliente.listTools();
    const herramienta = tools.find((t) => t.name === "preaprobar_credito");
    assert.ok(herramienta, "falta preaprobar_credito");
    assert.notEqual(herramienta.annotations?.readOnlyHint, true);
    assert.equal(herramienta.description, DESCRIPCION_PREAPROBAR_CREDITO);
    assert.ok(herramienta.outputSchema);
    assert.deepEqual(Object.keys(herramienta.inputSchema.properties ?? {}), ["correlationId"]);
  });

  it("preaprueba un caso simple y deja la solicitud en preaprobada", async () => {
    const correlationId = await conSolicitudRegistrada(4_000_000, 24);
    const r = await preaprobar({ correlationId });
    assert.equal(r.isError, false, JSON.stringify(r.contenido));
    const datos = r.contenido.datos as {
      solicitud: {
        estado: string;
        preaprobacion: { decision: { permitido: boolean } };
      };
      repetida: boolean;
    };
    assert.equal(datos.repetida, false);
    assert.equal(datos.solicitud.estado, "preaprobada");
    assert.equal(datos.solicitud.preaprobacion.decision.permitido, true);
    assert.equal(await estadoDe(correlationId), "preaprobada");
  });

  it("repetir devuelve la misma preaprobación con repetida true y una sola auditoría", async () => {
    const correlationId = await conSolicitudRegistrada(4_000_000, 24);
    const primera = await preaprobar({ correlationId });
    const segunda = await preaprobar({ correlationId });
    assert.equal(segunda.isError, false);
    assert.equal(segunda.contenido.datos?.["repetida"], true);
    assert.deepEqual(
      segunda.contenido.datos?.["solicitud"],
      primera.contenido.datos?.["solicitud"],
    );
    const registros = await registrosDe(conexion, correlationId);
    const auditorias = registros.filter((l) => l["evento"] === "auditoria_preaprobacion");
    assert.equal(auditorias.length, 1);
    assert.equal(auditorias[0]?.["resultado"], "preaprobada");
  });

  it("un campo de más, como monto, cuota o ingreso, es formato_invalido sobre ese campo", async () => {
    const correlationId = await conSolicitudRegistrada(4_000_000, 24);
    for (const campo of ["monto", "cuota", "cuotaMensual", "ingresoMensual", "idSolicitud"]) {
      const r = await preaprobar({ correlationId, [campo]: 1 });
      assert.equal(r.isError, true, campo);
      assert.equal(r.contenido.error?.codigo, "formato_invalido", campo);
      assert.equal(r.contenido.error?.campo, campo, campo);
    }
    assert.equal(await estadoDe(correlationId), "en_estudio");
  });

  it("sin correlationId o con uno inválido es formato_invalido sobre correlationId", async () => {
    assert.equal((await preaprobar({})).contenido.error?.campo, "correlationId");
    assert.equal(
      (await preaprobar({ correlationId: "no-uuid" })).contenido.error?.campo,
      "correlationId",
    );
  });

  it("el log de la herramienta lleva el resultado y la solicitud, sin montos, cuotas ni ingresos", async () => {
    const correlationId = await conSolicitudRegistrada(4_000_000, 24);
    await preaprobar({ correlationId });
    const registros = await registrosDe(conexion, correlationId);
    const herramienta = registros.find(
      (l) => l["evento"] === "herramienta" && l["herramienta"] === "preaprobar_credito",
    );
    assert.equal(herramienta?.["resultado"], "ok");
    assert.match(String(herramienta?.["idSolicitud"]), /^SOL-000\d{7}$/);
    for (const campo of ["monto", "plazoMeses", "cuotaMensual", "ingresoVerificado", "ingreso"]) {
      assert.equal(campo in herramienta!, false, `${campo} en el log de la herramienta`);
    }
    const auditoria = registros.find((l) => l["evento"] === "auditoria_preaprobacion");
    assert.equal(auditoria?.["resultado"], "preaprobada");
    assert.equal(auditoria?.["cuotaMensual"], 206_723);
    assert.equal(auditoria?.["versionPolitica"], VERSION_POLITICA);
    assert.equal(typeof auditoria?.["ts"], "string");
    const texto = JSON.stringify(
      registros.filter((l) => l["evento"] === "auditoria_preaprobacion"),
    );
    for (const dato of ["certificado", "extracto", "Industrias", "Ficticia", "quiero el monto"]) {
      assert.equal(texto.includes(dato), false, `«${dato}» en la auditoría`);
    }
  });

  describe("rechazo del lado del servidor, sin pasar por ningún hook (US2)", () => {
    it("sin identidad verificada se rechaza con identidad_no_verificada", async () => {
      const correlationId = randomUUID();
      const r = await preaprobar({ correlationId });
      assert.equal(r.isError, true);
      assert.equal(r.contenido.error?.categoria, "negocio");
      assert.equal(r.contenido.error?.reintentable, false);
      assert.equal(r.contenido.error?.codigo, "identidad_no_verificada");
      const registros = await registrosDe(conexion, correlationId);
      const auditoria = registros.find((l) => l["evento"] === "auditoria_preaprobacion");
      assert.equal(auditoria?.["resultado"], "bloqueada");
      assert.equal(auditoria?.["codigo"], "identidad_no_verificada");
    });

    it("un monto por encima del tope se rechaza con monto_sobre_tope y la solicitud sigue en estudio", async () => {
      const correlationId = await conSolicitudRegistrada(6_000_000, 24);
      const r = await preaprobar({ correlationId });
      assert.equal(r.isError, true);
      assert.equal(r.contenido.error?.codigo, "monto_sobre_tope");
      assert.doesNotMatch(r.contenido.error?.mensaje ?? "", /5\.000\.000|30\s?%/);
      assert.equal(await estadoDe(correlationId), "en_estudio");
      const registros = await registrosDe(conexion, correlationId);
      const auditoria = registros.find((l) => l["evento"] === "auditoria_preaprobacion");
      assert.equal(auditoria?.["resultado"], "bloqueada");
      assert.equal(auditoria?.["codigo"], "monto_sobre_tope");
      const herramienta = registros.find(
        (l) => l["evento"] === "herramienta" && l["herramienta"] === "preaprobar_credito",
      );
      assert.equal(herramienta?.["resultado"], "monto_sobre_tope");
      assert.equal("monto" in herramienta!, false);
    });

    it("una cuota por encima del 30% del ingreso verificado se rechaza con cuota_sobre_porcentaje", async () => {
      const correlationId = await conSolicitudRegistrada(4_500_000, 3);
      const r = await preaprobar({ correlationId });
      assert.equal(r.isError, true);
      assert.equal(r.contenido.error?.codigo, "cuota_sobre_porcentaje");
      assert.equal(await estadoDe(correlationId), "en_estudio");
    });
  });

  describe("solo se preaprueba una solicitud registrada (US3)", () => {
    it("con la identidad verificada y sin solicitud registrada responde solicitud_no_registrada", async () => {
      const correlationId = await verificado();
      const r = await preaprobar({ correlationId });
      assert.equal(r.isError, true);
      assert.equal(r.contenido.error?.categoria, "negocio");
      assert.equal(r.contenido.error?.codigo, "solicitud_no_registrada");
      assert.equal(await estadoDe(correlationId), undefined);
      const registros = await registrosDe(conexion, correlationId);
      assert.equal(
        registros.some((l) => l["evento"] === "auditoria_preaprobacion"),
        false,
      );
    });
  });
});
describe("servidor MCP del core: escalar_a_analista y consultar_escalamiento (#15)", () => {
  let conexion: Conexion;
  // Un servidor por prueba: cada solicitante puede tener una sola solicitud abierta en el core.
  beforeEach(async () => {
    conexion = await conectarServidor({ CREDIAGIL_FALLA: "" });
  });
  afterEach(async () => {
    await conexion.cerrar();
  });

  const FECHA_UNICO = SOLICITANTES_EJEMPLO.find(
    (s) => s.idSolicitante === ID_SOLICITANTE_UNICO,
  )!.fechaExpedicion;
  const cita = (fragmento: string) => ({ tipo: "afirmacion", fragmento });

  /** Identidad de Ana, documentos con ingreso de 3.800.000 y una solicitud registrada. */
  async function conSolicitudRegistrada() {
    const correlationId = randomUUID();
    const identidad = await llamarHerramienta(conexion, "verificar_identidad", {
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: FECHA_UNICO,
      idIntento: randomUUID(),
      correlationId,
    });
    assert.equal(identidad.isError, false, JSON.stringify(identidad.contenido));
    for (const e of [ejemploCertificado(), ...extractosTrimestre()]) {
      const v = validarSalida(e.salida, e, new Date());
      if (!v.ok) assert.fail(JSON.stringify(v.errores));
      const r = await llamarHerramienta(conexion, "registrar_extraccion", {
        correlationId,
        adjunto: e.adjunto,
        nombre: e.nombre,
        contenido: e.contenido,
        resultado: construirResultado(v.salida, e, 1),
      });
      assert.equal(r.isError, false, JSON.stringify(r.contenido));
    }
    const ingreso = await llamarHerramienta(conexion, "verificar_ingreso", {
      correlationId,
      ingresoDeclarado: 3_800_000,
    });
    assert.equal(ingreso.isError, false, JSON.stringify(ingreso.contenido));
    const registro = await llamarHerramienta(conexion, "registrar_solicitud", {
      correlationId,
      idSolicitante: ID_SOLICITANTE_UNICO,
      monto: 4_000_000,
      plazoMeses: 24,
      claveIdempotencia: `clave-${correlationId}`,
      procedencia: {
        monto: cita("quiero el monto"),
        plazoMeses: cita("a ese plazo"),
        ingresoDeclarado: cita("gano ese ingreso"),
      },
    });
    assert.equal(registro.isError, false, JSON.stringify(registro.contenido));
    return correlationId;
  }

  const entrada = (correlationId: string, cambios: Record<string, unknown> = {}) => ({
    correlationId,
    claveIdempotencia: claveIdempotenciaEscalamiento(correlationId),
    causa: "peticion_de_persona",
    motivo: "pide_persona",
    ...cambios,
  });

  const escalar = (argumentos: Record<string, unknown>) =>
    llamarHerramienta(conexion, "escalar_a_analista", argumentos);

  const leer = (correlationId: string) =>
    llamarHerramienta(conexion, "consultar_escalamiento", { correlationId });

  it("anuncia escalar_a_analista con efectos, la descripción compartida y sin los datos que toma el core", async () => {
    const { tools } = await conexion.cliente.listTools();
    const herramienta = tools.find((t) => t.name === "escalar_a_analista");
    assert.ok(herramienta, "falta escalar_a_analista");
    assert.notEqual(herramienta.annotations?.readOnlyHint, true);
    assert.equal(herramienta.description, DESCRIPCION_ESCALAR_A_ANALISTA);
    assert.ok(herramienta.outputSchema, "falta el esquema de salida");
    const campos = Object.keys(herramienta.inputSchema.properties ?? {});
    for (const campo of ["correlationId", "claveIdempotencia", "causa", "motivo", "codigo"]) {
      assert.ok(campos.includes(campo), `falta ${campo} en el esquema anunciado`);
    }
    for (const campo of ["solicitante", "ingresoVerificado", "accionRecomendada", "regla"]) {
      assert.equal(campos.includes(campo), false, `${campo} no es un campo de entrada`);
    }
  });

  it("anuncia consultar_escalamiento como solo lectura", async () => {
    const { tools } = await conexion.cliente.listTools();
    const herramienta = tools.find((t) => t.name === "consultar_escalamiento");
    assert.ok(herramienta, "falta consultar_escalamiento");
    assert.equal(herramienta.annotations?.readOnlyHint, true);
    assert.ok(herramienta.outputSchema);
  });

  it("escala sin identidad ni solicitud y devuelve el resumen con repetida false", async () => {
    const correlationId = randomUUID();
    const r = await escalar(entrada(correlationId));
    assert.equal(r.isError, false, JSON.stringify(r.contenido));
    const datos = r.contenido.datos as {
      escalamiento: {
        idEscalamiento: string;
        causa: string;
        solicitante: { identificado: boolean };
        pendientes: string[];
      };
      repetida: boolean;
    };
    assert.equal(datos.repetida, false);
    assert.match(datos.escalamiento.idEscalamiento, /^ESC-000\d{7}$/);
    assert.equal(datos.escalamiento.causa, "peticion_de_persona");
    assert.equal(datos.escalamiento.solicitante.identificado, false);
    assert.equal(datos.escalamiento.pendientes.length, 5);
  });

  it("con la solicitud armada, el resumen trae el solicitante y la solicitud", async () => {
    const correlationId = await conSolicitudRegistrada();
    const r = await escalar(
      entrada(correlationId, {
        causa: "cuota_sobre_porcentaje",
        motivo: "preaprobacion_fuera_de_politica",
        codigo: "cuota_sobre_porcentaje",
      }),
    );
    assert.equal(r.isError, false, JSON.stringify(r.contenido));
    const escalamiento = (
      r.contenido.datos as {
        escalamiento: {
          solicitante: { identificado: boolean; idSolicitante?: string };
          solicitud: { idSolicitud: string; estado: string } | null;
          pendientes: string[];
        };
      }
    ).escalamiento;
    assert.equal(escalamiento.solicitante.identificado, true);
    assert.equal(escalamiento.solicitante.idSolicitante, ID_SOLICITANTE_UNICO);
    assert.equal(escalamiento.solicitud?.estado, "en_estudio");
    assert.deepEqual(escalamiento.pendientes, []);
  });

  it("repetir devuelve el mismo resumen con repetida true y una sola auditoría", async () => {
    const correlationId = randomUUID();
    const primera = await escalar(entrada(correlationId));
    const segunda = await escalar(entrada(correlationId));
    assert.equal(segunda.isError, false);
    assert.equal(segunda.contenido.datos?.["repetida"], true);
    assert.deepEqual(
      segunda.contenido.datos?.["escalamiento"],
      primera.contenido.datos?.["escalamiento"],
    );
    const registros = await registrosDe(conexion, correlationId);
    const auditorias = registros.filter((l) => l["evento"] === "auditoria_escalamiento");
    assert.equal(auditorias.length, 1);
    assert.equal(auditorias[0]?.["resultado"], "escalada");
  });

  it("un campo que el core toma de su estado es formato_invalido sobre ese campo", async () => {
    const correlationId = randomUUID();
    for (const campo of ["solicitante", "ingresoVerificado", "accionRecomendada", "regla"]) {
      const r = await escalar(entrada(correlationId, { [campo]: "x" }));
      assert.equal(r.isError, true, campo);
      assert.equal(r.contenido.error?.codigo, "formato_invalido", campo);
      assert.equal(r.contenido.error?.campo, campo, campo);
    }
    const leida = await leer(correlationId);
    assert.equal(leida.contenido.datos?.["escalamiento"], null);
  });

  it("una causa que no corresponde al motivo es causa_incoherente sobre causa", async () => {
    const r = await escalar(entrada(randomUUID(), { causa: "caso_no_cubierto" }));
    assert.equal(r.isError, true);
    assert.equal(r.contenido.error?.categoria, "validacion");
    assert.equal(r.contenido.error?.codigo, "causa_incoherente");
    assert.equal(r.contenido.error?.campo, "causa");
  });

  it("sin correlationId o con uno inválido es formato_invalido sobre correlationId", async () => {
    assert.equal((await escalar({})).contenido.error?.campo, "correlationId");
    assert.equal(
      (await escalar({ ...entrada(randomUUID()), correlationId: "no-uuid" })).contenido.error
        ?.campo,
      "correlationId",
    );
    assert.equal((await leer("no-uuid")).contenido.error?.campo, "correlationId");
  });

  it("consultar_escalamiento devuelve null sin escalamiento y el resumen con él", async () => {
    const correlationId = randomUUID();
    const vacio = await leer(correlationId);
    assert.equal(vacio.isError, false);
    assert.equal(vacio.contenido.datos?.["escalamiento"], null);
    const escalado = await escalar(entrada(correlationId));
    const leido = await leer(correlationId);
    assert.deepEqual(
      leido.contenido.datos?.["escalamiento"],
      escalado.contenido.datos?.["escalamiento"],
    );
  });

  it("el log de la herramienta lleva el resultado y el escalamiento, sin datos del caso", async () => {
    const correlationId = await conSolicitudRegistrada();
    await escalar(entrada(correlationId));
    const registros = await registrosDe(conexion, correlationId);
    const herramienta = registros.find(
      (l) => l["evento"] === "herramienta" && l["herramienta"] === "escalar_a_analista",
    );
    assert.equal(herramienta?.["resultado"], "ok");
    assert.match(String(herramienta?.["idEscalamiento"]), /^ESC-000\d{7}$/);
    for (const campo of ["monto", "plazoMeses", "nombre", "solicitante", "ingreso", "causa"]) {
      assert.equal(campo in herramienta!, false, `${campo} en el log de la herramienta`);
    }
    const auditoria = registros.find((l) => l["evento"] === "auditoria_escalamiento");
    assert.equal(auditoria?.["resultado"], "escalada");
    assert.equal(auditoria?.["causa"], "peticion_de_persona");
    assert.equal(auditoria?.["versionPolitica"], VERSION_POLITICA);
    assert.equal(typeof auditoria?.["ts"], "string");
    const texto = JSON.stringify(
      registros.filter(
        (l) =>
          l["evento"] === "auditoria_escalamiento" || l["herramienta"] === "escalar_a_analista",
      ),
    );
    for (const dato of ["certificado", "extracto", "Industrias", "Ficticia", "quiero el monto"]) {
      assert.equal(texto.includes(dato), false, `«${dato}» en el log o la auditoría`);
    }
  });
});
