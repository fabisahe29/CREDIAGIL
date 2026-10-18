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
  it("exige identidad para extraer documentos (#10) y verificar el ingreso (#11); el #13 agregará el registro", () => {
    assert.deepEqual([...HERRAMIENTAS_CON_IDENTIDAD], ["extraer_documento", "verificar_ingreso"]);
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

describe("control de identidad: extraer_documento (#10, US1 y US5)", () => {
  const EXTRAER = "mcp__originacion__extraer_documento";

  function conListaPorDefecto(respuestas: (cid: string) => RespuestaIdentidad[]) {
    const estado = crearEstado(randomUUID());
    const { core, llamadas } = coreCon(respuestas(estado.correlationId));
    const control = crearControlIdentidad({
      core,
      estado,
      dormir: async () => {},
      azar: () => 0.5,
    });
    const invocar = (nombre = EXTRAER) =>
      control(entrada(nombre), "uso-1", { signal: new AbortController().signal });
    return { estado, llamadas, invocar };
  }

  it("sin identidad verificada niega la extracción y emite bloqueo_por_regla con la Regla 1", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = conListaPorDefecto((cid) => [identidad(cid, false)]);
    assert.equal(decision(await invocar()), "deny");
    const evento = estado.eventos[0];
    assert.equal(evento?.tipo, "bloqueo_por_regla");
    assert.equal(evento?.regla, "Regla 1 · identidad verificada antes de registrar");
    assert.deepEqual(evento?.valores, {
      identidad: "no verificada",
      herramienta: "extraer_documento",
    });
  });

  it("con identidad verificada deja extraer", async (t) => {
    capturarStderr(t);
    const { invocar } = conListaPorDefecto((cid) => [identidad(cid, true)]);
    assert.deepEqual(await invocar(), {});
  });

  it("consultar_extracciones no exige identidad: sin verificación no hay nada registrado", async (t) => {
    capturarStderr(t);
    const { invocar, llamadas } = conListaPorDefecto(() => []);
    assert.deepEqual(await invocar("mcp__originacion__consultar_extracciones"), {});
    assert.equal(llamadas(), 0);
  });

  it("tras escalar por un caso no cubierto, niega cualquier extracción posterior", async (t) => {
    capturarStderr(t);
    const { invocar, estado, llamadas } = conListaPorDefecto((cid) => [identidad(cid, true)]);
    estado.escalamiento = {
      motivo: "caso_no_cubierto",
      regla: "Regla 5 · caso no cubierto por la política",
      resultado: "escalada",
      correlationId: estado.correlationId,
      ts: new Date().toISOString(),
      herramienta: "extraer_documento",
      causa: "moneda_extranjera",
      adjunto: 1,
    };
    assert.equal(decision(await invocar()), "deny");
    assert.equal(llamadas(), 0);
  });
});

describe("control de identidad: solicitante de la acción (cambio de identidad)", () => {
  const conEntrada = (toolInput: Record<string, unknown>): HookInput =>
    ({ ...entrada(), tool_input: toolInput }) as HookInput;

  it("bloquea si la herramienta actúa sobre otro solicitante que el verificado", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = preparar((cid) => [identidad(cid, true)]);
    const salida = await invocar(conEntrada({ idSolicitante: "CLI-0001000002" }));
    assert.equal(decision(salida), "deny");
    assert.equal(
      (salida as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput
        .permissionDecisionReason,
      "Regla 1: la identidad verificada es de otro solicitante.",
    );
    assert.deepEqual(estado.eventos[0]?.valores, {
      identidad: "verificada para otro solicitante",
      herramienta: HERRAMIENTA,
    });
  });

  it("deja seguir si la herramienta actúa sobre el solicitante verificado", async (t) => {
    capturarStderr(t);
    const { invocar } = preparar((cid) => [identidad(cid, true)]);
    assert.deepEqual(await invocar(conEntrada({ idSolicitante: "CLI-0001000001" })), {});
  });
});

describe("control de identidad: conversación escalada (reglas 4 y 5 antes que la 1)", () => {
  it("tras un escalamiento bloquea cualquier herramienta de originacion, sin consultar al core", async (t) => {
    const logs = capturarStderr(t);
    const { invocar, estado, llamadas } = preparar([]);
    estado.escalamiento = {
      motivo: "pide_persona",
      regla: "Regla 4 · el solicitante pide hablar con una persona",
      resultado: "escalada",
      correlationId: estado.correlationId,
      ts: new Date().toISOString(),
      herramienta: "solicitar_analista",
    };
    for (const nombre of ["buscar_solicitante", "verificar_identidad", HERRAMIENTA]) {
      const salida = await invocar(entrada(`mcp__originacion__${nombre}`));
      assert.equal(decision(salida), "deny", nombre);
      assert.equal(
        (salida as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput
          .permissionDecisionReason,
        "La conversación ya pasó a un analista; no se ejecutan más herramientas.",
      );
    }
    assert.equal(llamadas(), 0);
    assert.deepEqual(estado.eventos, []);
    assert.ok(
      logs().some((l) => l["evento"] === "control_identidad" && l["decision"] === "escalada"),
    );
  });
});

describe("control de identidad: Regla 5 antes que la Regla 1 (revisión de 0aa8c2a)", () => {
  function conRegla5(
    respuesta: RespuestaIdentidad | ((cid: string) => RespuestaIdentidad),
    antesDeRegla1: (herramienta: string, entrada: unknown) => Promise<boolean>,
  ) {
    const estado = crearEstado(randomUUID());
    const r = typeof respuesta === "function" ? respuesta(estado.correlationId) : respuesta;
    const { core } = coreCon([r]);
    const control = crearControlIdentidad({
      core,
      estado,
      herramientas: [HERRAMIENTA],
      dormir: async () => {},
      azar: () => 0.5,
      antesDeRegla1,
    });
    const invocar = () =>
      control({ ...entrada(), tool_input: { adjunto: 2 } } as HookInput, "uso-1", {
        signal: new AbortController().signal,
      });
    return { estado, invocar };
  }

  it("sin identidad, si la Regla 5 escala, niega por la Regla 5 sin bloqueo de la Regla 1", async (t) => {
    capturarStderr(t);
    const llamadas: unknown[] = [];
    const { estado, invocar } = conRegla5(
      (cid) => identidad(cid, false),
      async (herramienta, e) => {
        llamadas.push([herramienta, e]);
        return true;
      },
    );
    const salida = await invocar();
    assert.equal(decision(salida), "deny");
    assert.equal(
      (salida as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput
        .permissionDecisionReason,
      "Regla 5 antes que la Regla 1: el caso pasa a un analista.",
    );
    assert.deepEqual(llamadas, [[HERRAMIENTA, { adjunto: 2 }]]);
    assert.deepEqual(estado.eventos, []);
  });

  it("sin identidad, si la Regla 5 no escala, bloquea por la Regla 1 como siempre", async (t) => {
    capturarStderr(t);
    const { estado, invocar } = conRegla5(
      (cid) => identidad(cid, false),
      async () => false,
    );
    assert.equal(decision(await invocar()), "deny");
    assert.equal(estado.eventos[0]?.tipo, "bloqueo_por_regla");
  });

  it("si evaluar la Regla 5 falla, bloquea por la Regla 1 (ante la duda, bloquear)", async (t) => {
    capturarStderr(t);
    const { estado, invocar } = conRegla5(
      (cid) => identidad(cid, false),
      async () => {
        throw new Error("clasificador caído");
      },
    );
    assert.equal(decision(await invocar()), "deny");
    assert.equal(estado.eventos[0]?.tipo, "bloqueo_por_regla");
  });

  it("con identidad verificada no hace falta la evaluación previa: la hace la extracción", async (t) => {
    capturarStderr(t);
    let llamadas = 0;
    const { invocar } = conRegla5(
      (cid) => identidad(cid, true),
      async () => {
        llamadas++;
        return true;
      },
    );
    assert.deepEqual(await invocar(), {});
    assert.equal(llamadas, 0);
  });
});

describe("control de identidad: verificar_ingreso (#11, US1)", () => {
  const VERIFICAR = "mcp__originacion__verificar_ingreso";

  function conListaPorDefecto(respuestas: (cid: string) => RespuestaIdentidad[]) {
    const estado = crearEstado(randomUUID());
    const { core, llamadas } = coreCon(respuestas(estado.correlationId));
    const control = crearControlIdentidad({
      core,
      estado,
      dormir: async () => {},
      azar: () => 0.5,
    });
    const invocar = (entradaHerramienta: Record<string, unknown> = {}) =>
      control({ ...entrada(VERIFICAR), tool_input: entradaHerramienta } as HookInput, "uso-1", {
        signal: new AbortController().signal,
      });
    return { estado, llamadas, invocar };
  }

  it("sin identidad verificada se bloquea con bloqueo_por_regla y la Regla 1", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = conListaPorDefecto((cid) => [identidad(cid, false)]);
    assert.equal(decision(await invocar({ ingresoDeclarado: 3_800_000 })), "deny");
    const evento = estado.eventos[0];
    assert.equal(evento?.tipo, "bloqueo_por_regla");
    assert.equal(evento?.regla, "Regla 1 · identidad verificada antes de registrar");
    assert.deepEqual(evento?.valores, {
      identidad: "no verificada",
      herramienta: "verificar_ingreso",
    });
  });

  it("con identidad verificada la deja pasar", async (t) => {
    capturarStderr(t);
    const { invocar } = conListaPorDefecto((cid) => [identidad(cid, true)]);
    assert.deepEqual(await invocar({ ingresoDeclarado: 3_800_000 }), {});
  });

  it("tras escalar niega la verificación sin consultar al core", async (t) => {
    capturarStderr(t);
    const { invocar, estado, llamadas } = conListaPorDefecto((cid) => [identidad(cid, true)]);
    estado.escalamiento = {
      motivo: "discrepancia_de_ingreso",
      regla: "Regla 3 · ingreso verificado desde los documentos",
      resultado: "escalada",
      correlationId: estado.correlationId,
      ts: new Date().toISOString(),
      herramienta: "verificar_ingreso",
    };
    assert.equal(decision(await invocar()), "deny");
    assert.equal(llamadas(), 0);
  });

  it("consultar_verificacion_ingreso no es del modelo ni exige identidad: no está en la lista", () => {
    assert.ok(!HERRAMIENTAS_CON_IDENTIDAD.includes("consultar_verificacion_ingreso"));
  });
});
