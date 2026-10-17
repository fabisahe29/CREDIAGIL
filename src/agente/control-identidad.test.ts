import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { crearEstado } from "./adaptador.ts";
import type { ClienteCore, RespuestaIdentidad } from "./cliente-core.ts";
import { crearControlIdentidad, HERRAMIENTAS_CON_IDENTIDAD } from "./control-identidad.ts";
import { errorTransitorio, exito, fallo, fueraDeContrato } from "../compartido/errores.ts";

const HERRAMIENTA = "registrar_prueba";
const NOMBRE_SDK = `mcp__originacion__${HERRAMIENTA}`;

function entrada(toolName = NOMBRE_SDK, evento = "PreToolUse"): HookInput {
  return {
    session_id: "sesion-prueba",
    transcript_path: "",
    cwd: ".",
    hook_event_name: evento,
    tool_name: toolName,
    tool_input: {},
    tool_use_id: "uso-1",
  } as HookInput;
}

const identidad = (correlationId: string, verificada: boolean): RespuestaIdentidad =>
  exito({
    identidad: {
      correlationId,
      verificada,
      idSolicitante: verificada ? "CLI-0001000001" : null,
      verificadaEn: verificada ? "2026-10-17T12:00:00.000Z" : null,
    },
  });

/** Core falso: responde en orden (el último se repite) y cuenta las llamadas. */
function coreCon(respuestas: (RespuestaIdentidad | Error)[]) {
  let llamadas = 0;
  const core: Pick<ClienteCore, "consultarIdentidad"> = {
    async consultarIdentidad() {
      const r = respuestas[Math.min(llamadas, respuestas.length - 1)]!;
      llamadas++;
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { core, llamadas: () => llamadas };
}

function preparar(
  respuestas: (RespuestaIdentidad | Error)[] | ((cid: string) => RespuestaIdentidad[]),
) {
  const correlationId = randomUUID();
  const estado = crearEstado(correlationId);
  const lista = typeof respuestas === "function" ? respuestas(correlationId) : respuestas;
  const { core, llamadas } = coreCon(lista);
  const esperas: number[] = [];
  const control = crearControlIdentidad({
    core,
    estado,
    herramientas: [HERRAMIENTA],
    dormir: async (ms) => void esperas.push(ms),
    azar: () => 0.5,
  });
  const invocar = (e: HookInput = entrada()) =>
    control(e, "uso-1", { signal: new AbortController().signal });
  return { estado, llamadas, esperas, invocar };
}

const decision = (salida: unknown) =>
  (salida as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput
    ?.permissionDecision;

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

describe("control de identidad (#9, US4)", () => {
  it("hoy ninguna herramienta exige identidad: #10 y #13 agregarán las suyas", () => {
    assert.deepEqual([...HERRAMIENTAS_CON_IDENTIDAD], []);
  });

  it("una herramienta fuera de la lista sigue sin consultar al core", async (t) => {
    capturarStderr(t);
    const { invocar, llamadas } = preparar([]);
    assert.deepEqual(await invocar(entrada("mcp__originacion__buscar_solicitante")), {});
    assert.equal(llamadas(), 0);
  });

  it("un evento que no es PreToolUse sigue sin consultar al core", async (t) => {
    capturarStderr(t);
    const { invocar, llamadas } = preparar([]);
    assert.deepEqual(await invocar(entrada(NOMBRE_SDK, "PostToolUse")), {});
    assert.equal(llamadas(), 0);
  });

  it("con la identidad verificada deja seguir", async (t) => {
    const logs = capturarStderr(t);
    const { invocar, estado } = preparar((cid) => [identidad(cid, true)]);
    assert.deepEqual(await invocar(), {});
    assert.deepEqual(estado.eventos, []);
    const registro = logs().find((l) => l["evento"] === "control_identidad");
    assert.equal(registro?.["decision"], "permitir");
    assert.equal(registro?.["herramienta"], HERRAMIENTA);
  });

  it("sin identidad verificada bloquea y emite el bloqueo de la Regla 1", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = preparar((cid) => [identidad(cid, false)]);
    const salida = await invocar();
    assert.equal(decision(salida), "deny");
    assert.equal(
      (salida as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput
        .permissionDecisionReason,
      "Regla 1: la identidad del solicitante no está verificada.",
    );
    assert.equal(estado.escalamiento, null);
    assert.equal(estado.eventos.length, 1);
    const evento = estado.eventos[0]!;
    assert.equal(evento.tipo, "bloqueo_por_regla");
    assert.deepEqual(
      {
        descripcion: evento.descripcion,
        motivo: evento.motivo,
        regla: evento.regla,
        valores: evento.valores,
        siguientePaso: evento.tipo === "bloqueo_por_regla" ? evento.siguientePaso : null,
      },
      {
        descripcion: "Para continuar necesito verificar tu identidad.",
        motivo: "identidad_no_verificada",
        regla: "Regla 1 · identidad verificada antes de registrar",
        valores: { identidad: "no verificada", herramienta: HERRAMIENTA },
        siguientePaso: "Indícame tu número de documento para buscarte y verificarte.",
      },
    );
  });

  it("reintenta ante un transitorio y deja seguir si el core responde verificada", async (t) => {
    capturarStderr(t);
    const caido = fallo<never>(errorTransitorio("core_no_disponible", "Caído."));
    const { invocar, llamadas, esperas } = preparar((cid) => [caido, caido, identidad(cid, true)]);
    assert.deepEqual(await invocar(), {});
    assert.equal(llamadas(), 3);
    assert.deepEqual(esperas, [500, 1000]);
  });

  it("con los reintentos agotados bloquea, emite el bloqueo y escala", async (t) => {
    capturarStderr(t);
    const caido = fallo<never>(errorTransitorio("core_no_disponible", "Caído."));
    const { invocar, estado, llamadas } = preparar([caido]);
    const salida = await invocar();
    assert.equal(decision(salida), "deny");
    assert.equal(llamadas(), 3);
    assert.deepEqual(
      estado.eventos.map((e) => e.tipo),
      ["bloqueo_por_regla"],
    );
    assert.equal(estado.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.equal(estado.escalamiento?.herramienta, "consultar_identidad");
    assert.equal(estado.escalamiento?.intentos, 3);
  });

  it("una respuesta fuera de contrato bloquea sin reintentar ni escalar", async (t) => {
    capturarStderr(t);
    const { invocar, estado, llamadas } = preparar([fallo<never>(fueraDeContrato())]);
    assert.equal(decision(await invocar()), "deny");
    assert.equal(llamadas(), 1);
    assert.equal(estado.escalamiento, null);
    assert.deepEqual(
      estado.eventos.map((e) => e.tipo),
      ["bloqueo_por_regla"],
    );
  });

  it("una excepción del core bloquea y se registra, sin lanzar", async (t) => {
    const logs = capturarStderr(t);
    const { invocar } = preparar([new Error("conexión rota")]);
    assert.equal(decision(await invocar()), "deny");
    const registro = logs().find((l) => l["evento"] === "control_identidad");
    assert.equal(registro?.["decision"], "bloquear");
  });

  it("la lista por defecto es HERRAMIENTAS_CON_IDENTIDAD", async (t) => {
    capturarStderr(t);
    const { core, llamadas } = coreCon([]);
    const control = crearControlIdentidad({ core, estado: crearEstado(randomUUID()) });
    const salida = await control(entrada(), "uso-1", { signal: new AbortController().signal });
    assert.deepEqual(salida, {});
    assert.equal(llamadas(), 0);
  });
});
