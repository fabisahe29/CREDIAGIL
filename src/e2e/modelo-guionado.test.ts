import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { ContextoConsulta } from "../agente/agente.ts";
import type { Guion } from "./guion.ts";
import { crearModeloGuionado } from "./modelo-guionado.ts";

const guionCon = (
  llamadas: Guion["pasos"][number]["llamadas"],
  extra: Partial<Guion> = {},
): Guion => ({
  clasificacion: {},
  extracciones: {},
  pasos: [{ llamadas, respuesta: "Texto del modelo" }],
  ...extra,
});

/** Un contexto con herramientas que cuentan sus llamadas. */
function contexto() {
  const llamadas: unknown[] = [];
  const herramientas = {
    preaprobar_credito: {
      esquema: {},
      manejar: async (entrada: unknown) => void llamadas.push(entrada),
    },
    consultar_solicitud: {
      esquema: { idSolicitud: z.string() },
      manejar: async (entrada: unknown) => void llamadas.push(entrada),
    },
  };
  return { llamadas, contexto: { herramientas } as unknown as ContextoConsulta };
}

const hookQue = (permissionDecision: "allow" | "deny") => async () =>
  permissionDecision === "deny"
    ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision } }
    : {};

async function correr(
  modelo: ReturnType<typeof crearModeloGuionado>,
  ctx: ContextoConsulta,
  hooks?: unknown,
) {
  const mensajes: unknown[] = [];
  const options = hooks === undefined ? {} : { hooks };
  for await (const m of modelo.ejecutarConsulta({ prompt: "x", options } as never, ctx)) {
    mensajes.push(m);
  }
  return mensajes;
}

describe("modelo guionado: consulta", () => {
  it("llama a la herramienta real y termina con un result end_turn", async () => {
    const { llamadas, contexto: ctx } = contexto();
    const modelo = crearModeloGuionado(
      guionCon([
        { herramienta: "consultar_solicitud", entrada: { idSolicitud: "SOL-0001000001" } },
      ]),
    );
    const mensajes = (await correr(modelo, ctx)) as {
      type: string;
      subtype: string;
      stop_reason: string;
      result: string;
    }[];
    assert.deepEqual(llamadas, [{ idSolicitud: "SOL-0001000001" }]);
    assert.equal(mensajes.length, 1);
    assert.equal(mensajes[0]!.type, "result");
    assert.equal(mensajes[0]!.subtype, "success");
    assert.equal(mensajes[0]!.stop_reason, "end_turn");
    assert.equal(mensajes[0]!.result, "Texto del modelo");
    assert.deepEqual(modelo.problemas, []);
  });

  it("un hook que deniega impide llamar a la herramienta y el guion sigue", async () => {
    const { llamadas, contexto: ctx } = contexto();
    const modelo = crearModeloGuionado(
      guionCon([
        { herramienta: "preaprobar_credito", entrada: {} },
        { herramienta: "consultar_solicitud", entrada: { idSolicitud: "SOL-0001000001" } },
      ]),
    );
    const hooks = {
      PreToolUse: [{ matcher: "mcp__originacion__preaprobar_credito", hooks: [hookQue("deny")] }],
    };
    await correr(modelo, ctx, hooks);
    assert.deepEqual(llamadas, [{ idSolicitud: "SOL-0001000001" }]);
  });

  it("el matcher es una expresión regular sobre el nombre completo de la herramienta", async () => {
    const { llamadas, contexto: ctx } = contexto();
    const modelo = crearModeloGuionado(
      guionCon([
        { herramienta: "preaprobar_credito", entrada: {} },
        { herramienta: "consultar_solicitud", entrada: { idSolicitud: "SOL-0001000001" } },
      ]),
    );
    const hooks = { PreToolUse: [{ matcher: "mcp__originacion__.*", hooks: [hookQue("deny")] }] };
    await correr(modelo, ctx, hooks);
    assert.deepEqual(llamadas, []);
  });

  it("un hook que permite deja llamar a la herramienta", async () => {
    const { llamadas, contexto: ctx } = contexto();
    const modelo = crearModeloGuionado(
      guionCon([{ herramienta: "preaprobar_credito", entrada: {} }]),
    );
    await correr(modelo, ctx, {
      PreToolUse: [{ matcher: "mcp__originacion__.*", hooks: [hookQue("allow")] }],
    });
    assert.equal(llamadas.length, 1);
  });

  it("anota un problema si la entrada no pasa el esquema o la herramienta no existe", async () => {
    const { llamadas, contexto: ctx } = contexto();
    const modelo = crearModeloGuionado(
      guionCon([
        { herramienta: "consultar_solicitud", entrada: { idSolicitud: 5 } },
        { herramienta: "verificar_ingreso", entrada: {} },
      ]),
    );
    await correr(modelo, ctx);
    assert.deepEqual(llamadas, []);
    assert.equal(modelo.problemas.length, 2);
    assert.match(modelo.problemas[0]!, /entrada inválida/);
    assert.match(modelo.problemas[1]!, /no está disponible/);
  });

  it("sigue el cursor: cada turno ejecuta su paso", async () => {
    const { llamadas, contexto: ctx } = contexto();
    const modelo = crearModeloGuionado({
      clasificacion: {},
      extracciones: {},
      pasos: [
        { llamadas: [], respuesta: "uno" },
        { llamadas: [{ herramienta: "preaprobar_credito", entrada: {} }], respuesta: "dos" },
      ],
    });
    await correr(modelo, ctx);
    assert.equal(llamadas.length, 0);
    modelo.cursor.paso = 1;
    const mensajes = (await correr(modelo, ctx)) as { result: string }[];
    assert.equal(llamadas.length, 1);
    assert.equal(mensajes[0]!.result, "dos");
  });

  it("un cursor fuera del guion queda como problema, sin lanzar", async () => {
    const { contexto: ctx } = contexto();
    const modelo = crearModeloGuionado(guionCon([]));
    modelo.cursor.paso = 5;
    await correr(modelo, ctx);
    assert.match(modelo.problemas[0]!, /paso 6/);
  });
});

describe("modelo guionado: subagente y clasificador", () => {
  const documento = { adjunto: 1, nombre: "certificado.md", contenido: "x" };

  it("devuelven lo que dice el guion", async () => {
    const salida: Guion["extracciones"][string] = {
      tipo: "otro",
      certificado: null,
      extracto: null,
      conflictos: [],
    };
    const modelo = crearModeloGuionado(
      guionCon([], {
        extracciones: { "certificado.md": salida },
        clasificacion: { "certificado.md": "otro" },
      }),
    );
    assert.deepEqual(
      await modelo.ejecutarSubagente({ documento, erroresPrevios: [], correlationId: "c" }),
      { ok: true, salida },
    );
    assert.deepEqual(await modelo.clasificarDocumento({ documento, correlationId: "c" }), {
      ok: true,
      tipo: "otro",
    });
  });

  it("sin entrada en el guion responden con un error y anotan el problema", async () => {
    const modelo = crearModeloGuionado(guionCon([]));
    const sub = await modelo.ejecutarSubagente({
      documento,
      erroresPrevios: [],
      correlationId: "c",
    });
    const cla = await modelo.clasificarDocumento({ documento, correlationId: "c" });
    assert.equal(sub.ok, false);
    assert.equal(cla.ok, false);
    assert.equal(modelo.problemas.length, 2);
  });
});
