import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { crearEstado } from "./adaptador.ts";
import type {
  ClienteCore,
  RespuestaIdentidad,
  RespuestaSolicitudRegistrada,
} from "./cliente-core.ts";
import { crearControlPreaprobacion } from "./control-preaprobacion.ts";
import { errorTransitorio, exito, fallo, fueraDeContrato } from "../compartido/errores.ts";
import {
  esquemaSolicitudRegistrada,
  type SolicitudRegistrada,
  type VerificacionRegistrada,
} from "../compartido/solicitud.ts";
import { calcularCuota } from "../politica/cuota.ts";
import { REGLA_2 } from "../politica/preaprobacion.ts";
import { PORCENTAJE_MAXIMO_CUOTA_INGRESO, TOPE_MONTO_PREAPROBACION } from "../politica/politica.ts";

const PREAPROBAR = "mcp__originacion__preaprobar_credito";
const INGRESO = 3_800_000;

function entrada(toolName = PREAPROBAR, evento = "PreToolUse", toolInput: unknown = {}): HookInput {
  return {
    session_id: "sesion-prueba",
    transcript_path: "",
    cwd: ".",
    hook_event_name: evento,
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: "uso-1",
  } as HookInput;
}

function verificacion(
  estado: VerificacionRegistrada["estado"],
  ingreso: number = INGRESO,
): VerificacionRegistrada {
  const conIngreso =
    estado === "verificado" || estado === "discrepancia" || estado === "falta_declarado";
  const conDiscrepancia = estado === "verificado" || estado === "discrepancia";
  return {
    estado,
    ingresoVerificado: conIngreso
      ? {
          monto: ingreso,
          origen: "certificado",
          montoCertificado: ingreso,
          montoExtractos: null,
          extractosContados: 0,
          usos: [],
          noUsados: [],
        }
      : null,
    discrepancia: conDiscrepancia
      ? {
          declarado: estado === "discrepancia" ? ingreso + 500_000 : ingreso,
          verificado: ingreso,
          diferencia: estado === "discrepancia" ? 500_000 : 0,
          umbralPorcentaje: 10,
          supera: estado === "discrepancia",
          diferenciaPorcentaje: estado === "discrepancia" ? 13.16 : 0,
        }
      : null,
    inconsistencias: [],
    sinContrastar: [],
    calculadaEn: "2026-10-18T12:00:00.000Z",
  };
}

function solicitud(
  monto: number,
  plazoMeses: number,
  v: VerificacionRegistrada | null,
  preaprobada = false,
): SolicitudRegistrada {
  return esquemaSolicitudRegistrada.parse({
    idSolicitud: "SOL-0002000001",
    correlationId: "0b0b6b6e-5f0e-4a39-9d57-6a0c1c1f0a11",
    claveIdempotencia: "x",
    estado: preaprobada ? "preaprobada" : "en_estudio",
    registradaEn: "2026-10-18T12:00:00.000Z",
    solicitante: {
      idSolicitante: "CLI-0001000001",
      nombre: "Ana Pérez Ficticia",
      documentoEnmascarado: "******4567",
    },
    monto: { valor: monto, procedencia: { tipo: "afirmacion", fragmento: "quiero el monto" } },
    plazoMeses: {
      valor: plazoMeses,
      procedencia: { tipo: "afirmacion", fragmento: "a ese plazo" },
    },
    ingresoDeclarado: null,
    verificacionIngreso: v,
    datosExtraidos: [],
    preaprobacion: preaprobada
      ? {
          preaprobadaEn: "2026-10-18T12:30:00.000Z",
          decision: {
            regla: REGLA_2,
            permitido: true,
            motivo: "Cumple.",
            valores: { monto },
            versionPolitica: "2026-10-18.3",
          },
        }
      : null,
    versionPolitica: "2026-10-18.3",
  });
}

const conSolicitud = (s: SolicitudRegistrada | null): RespuestaSolicitudRegistrada =>
  exito({ solicitud: s });

const identidadDe = (verificadaComo: string | null): RespuestaIdentidad =>
  exito({
    identidad: {
      correlationId: randomUUID(),
      verificada: verificadaComo !== null,
      idSolicitante: verificadaComo,
      verificadaEn: verificadaComo === null ? null : "2026-10-18T12:00:00.000Z",
    },
  });

/** Core falso: responde en orden (el último se repite) y cuenta las llamadas de la solicitud. */
function coreCon(
  respuestas: (RespuestaSolicitudRegistrada | Error)[],
  identidades: (RespuestaIdentidad | Error)[] = [identidadDe("CLI-0001000001")],
) {
  let llamadas = 0;
  let consultasIdentidad = 0;
  const core: Pick<ClienteCore, "consultarSolicitudRegistrada" | "consultarIdentidad"> = {
    async consultarSolicitudRegistrada() {
      const r = respuestas[Math.min(llamadas, respuestas.length - 1)]!;
      llamadas++;
      if (r instanceof Error) throw r;
      return r;
    },
    async consultarIdentidad() {
      const r = identidades[Math.min(consultasIdentidad, identidades.length - 1)]!;
      consultasIdentidad++;
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { core, llamadas: () => llamadas, identidad: () => consultasIdentidad };
}

function preparar(
  respuestas: (RespuestaSolicitudRegistrada | Error)[],
  identidades?: (RespuestaIdentidad | Error)[],
) {
  const estado = crearEstado(randomUUID());
  const { core, llamadas } = coreCon(respuestas, identidades);
  const hook = crearControlPreaprobacion({
    core,
    estado,
    dormir: async () => {},
    azar: () => 0.5,
  });
  const invocar = (e: HookInput = entrada()) =>
    hook(e, "uso-1", { signal: new AbortController().signal });
  return { estado, llamadas, invocar };
}

const decision = (salida: unknown) =>
  (salida as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput
    ?.permissionDecision;

const motivoDe = (salida: unknown) =>
  (salida as { hookSpecificOutput?: { permissionDecisionReason?: string } }).hookSpecificOutput
    ?.permissionDecisionReason ?? "";

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

/** Un monto y un plazo cuya cuota es múltiplo de 3: así existe un ingreso con relación exacta del 30%. */
function parConRelacionExacta() {
  const monto = 4_000_000;
  let plazoMeses = 1;
  while (calcularCuota(monto, plazoMeses) % 3 !== 0) plazoMeses++;
  const cuota = calcularCuota(monto, plazoMeses);
  return { monto, plazoMeses, cuota, ingreso: (cuota * 100) / PORCENTAJE_MAXIMO_CUOTA_INGRESO };
}

describe("control de preaprobación: la Regla 2 sin el modelo (#14, FR-013)", () => {
  it("deja pasar la solicitud de 4.000.000 a 24 meses con ingreso verificado de 3.800.000", async (t) => {
    capturarStderr(t);
    const { invocar, estado, llamadas } = preparar([
      conSolicitud(solicitud(4_000_000, 24, verificacion("verificado"))),
    ]);
    assert.deepEqual(await invocar(), {});
    assert.equal(llamadas(), 1);
    assert.equal(estado.escalamiento, null);
    assert.deepEqual(estado.eventos, []);
  });

  it("deja pasar el monto límite de 5.000.000 con la cuota dentro del 30%", async (t) => {
    capturarStderr(t);
    const { invocar } = preparar([
      conSolicitud(
        solicitud(TOPE_MONTO_PREAPROBACION, 24, verificacion("verificado", 100_000_000)),
      ),
    ]);
    assert.deepEqual(await invocar(), {});
  });

  it("bloquea un monto de 5.000.001 con la señal de la Regla 2 y el código monto_sobre_tope", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = preparar([
      conSolicitud(
        solicitud(TOPE_MONTO_PREAPROBACION + 1, 24, verificacion("verificado", 100_000_000)),
      ),
    ]);
    const salida = await invocar();
    assert.equal(decision(salida), "deny");
    assert.equal(estado.escalamiento?.motivo, "preaprobacion_fuera_de_politica");
    assert.equal(estado.escalamiento?.regla, REGLA_2);
    assert.equal(estado.escalamiento?.herramienta, "preaprobar_credito");
    assert.equal(estado.escalamiento?.codigo, "monto_sobre_tope");
  });

  it("deja pasar la cuota exactamente al 30% del ingreso verificado", async (t) => {
    capturarStderr(t);
    const { monto, plazoMeses, ingreso } = parConRelacionExacta();
    const { invocar } = preparar([
      conSolicitud(solicitud(monto, plazoMeses, verificacion("verificado", ingreso))),
    ]);
    assert.deepEqual(await invocar(), {});
  });

  it("bloquea la cuota un peso de ingreso por encima del 30% con cuota_sobre_porcentaje", async (t) => {
    capturarStderr(t);
    const { monto, plazoMeses, ingreso } = parConRelacionExacta();
    const { invocar, estado } = preparar([
      conSolicitud(solicitud(monto, plazoMeses, verificacion("verificado", ingreso - 1))),
    ]);
    assert.equal(decision(await invocar()), "deny");
    assert.equal(estado.escalamiento?.codigo, "cuota_sobre_porcentaje");
  });

  it("bloquea una solicitud con discrepancia registrada con discrepancia_registrada", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = preparar([
      conSolicitud(solicitud(4_000_000, 24, verificacion("discrepancia"))),
    ]);
    assert.equal(decision(await invocar()), "deny");
    assert.equal(estado.escalamiento?.codigo, "discrepancia_registrada");
  });

  it("bloquea con ingreso_no_verificado una verificación inconsistente, sin ingreso, sin declarado o ausente", async (t) => {
    capturarStderr(t);
    const casos: (VerificacionRegistrada | null)[] = [
      verificacion("inconsistencia"),
      verificacion("sin_ingreso"),
      verificacion("falta_declarado"),
      null,
    ];
    for (const v of casos) {
      const { invocar, estado } = preparar([conSolicitud(solicitud(4_000_000, 24, v))]);
      assert.equal(decision(await invocar()), "deny", String(v?.estado));
      assert.equal(estado.escalamiento?.codigo, "ingreso_no_verificado", String(v?.estado));
    }
  });

  it("sin solicitud registrada deniega con «regístrala antes de preaprobar» y sin señal", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = preparar([conSolicitud(null)]);
    const salida = await invocar();
    assert.equal(decision(salida), "deny");
    assert.match(motivoDe(salida), /regístrala antes de preaprobar/);
    assert.equal(estado.escalamiento, null);
    assert.deepEqual(estado.eventos, []);
  });

  it("decide con la solicitud del core: lo que el modelo envíe en la entrada se ignora", async (t) => {
    capturarStderr(t);
    const enviado = { monto: 1_000_000, cuota: 1, cuotaMensual: 1, ingresoMensual: 99_000_000 };
    const fuera = preparar([
      conSolicitud(solicitud(6_000_000, 24, verificacion("verificado", 100_000_000))),
    ]);
    assert.equal(decision(await fuera.invocar(entrada(PREAPROBAR, "PreToolUse", enviado))), "deny");
    const dentro = preparar([conSolicitud(solicitud(4_000_000, 24, verificacion("verificado")))]);
    const malos = { monto: 9_000_000, cuota: 999_999_999, ingresoMensual: 1 };
    assert.deepEqual(await dentro.invocar(entrada(PREAPROBAR, "PreToolUse", malos)), {});
  });

  it("si el core no responde tras los reintentos, deniega y deja la señal de falla persistente", async (t) => {
    capturarStderr(t);
    const { invocar, estado, llamadas } = preparar([
      fallo(errorTransitorio("core_no_disponible", "El core no está disponible.")),
    ]);
    assert.equal(decision(await invocar()), "deny");
    assert.ok(llamadas() > 1, "debe reintentar de forma acotada");
    assert.equal(estado.escalamiento?.motivo, "falla_transitoria_persistente");
  });

  it("ante una respuesta fuera de contrato o una excepción, ante la duda, deniega", async (t) => {
    capturarStderr(t);
    for (const respuesta of [fallo<never>(fueraDeContrato()), new Error("falla inesperada")]) {
      const { invocar } = preparar([respuesta]);
      assert.equal(decision(await invocar()), "deny");
    }
  });

  it("una solicitud ya preaprobada deja pasar: la repetición devuelve la misma", async (t) => {
    capturarStderr(t);
    const { invocar } = preparar([
      conSolicitud(solicitud(4_000_000, 24, verificacion("verificado"), true)),
    ]);
    assert.deepEqual(await invocar(), {});
  });

  it("con la conversación ya escalada no interviene: la deniega el hook de identidad", async (t) => {
    capturarStderr(t);
    const { invocar, estado, llamadas } = preparar([
      conSolicitud(solicitud(6_000_000, 24, verificacion("verificado", 100_000_000))),
    ]);
    estado.escalamiento = {
      motivo: "pide_persona",
      regla: "Regla 4",
      resultado: "escalada",
      correlationId: estado.correlationId,
      ts: new Date().toISOString(),
    };
    assert.deepEqual(await invocar(), {});
    assert.equal(llamadas(), 0);
    assert.equal(estado.escalamiento.motivo, "pide_persona");
  });

  it("otra herramienta pasa sin consultar al core, y un evento que no es PreToolUse también", async (t) => {
    capturarStderr(t);
    const { invocar, llamadas } = preparar([conSolicitud(null)]);
    assert.deepEqual(await invocar(entrada("mcp__originacion__registrar_solicitud")), {});
    assert.deepEqual(await invocar(entrada(PREAPROBAR, "PostToolUse")), {});
    assert.deepEqual(await invocar(entrada("mcp__otro__preaprobar_credito")), {});
    assert.equal(llamadas(), 0);
  });

  it("un bloqueo emite bloqueo_por_regla con la Regla 2, y no emite preaprobacion", async (t) => {
    const logs = capturarStderr(t);
    const { invocar, estado } = preparar([
      conSolicitud(solicitud(6_000_000, 24, verificacion("verificado", 100_000_000))),
    ]);
    await invocar();
    assert.equal(estado.eventos.length, 1);
    const evento = estado.eventos[0]!;
    assert.equal(evento.tipo, "bloqueo_por_regla");
    assert.equal(evento.regla, REGLA_2);
    assert.equal(evento.motivo, "monto_sobre_tope");
    if (evento.tipo === "bloqueo_por_regla") {
      assert.match(evento.siguientePaso, /analista/);
      assert.equal(evento.valores["monto"], 6_000_000);
    }
    assert.equal(
      estado.eventos.some((e) => e.tipo === "preaprobacion"),
      false,
    );
    assert.ok(
      logs().some((l) => l["evento"] === "control_preaprobacion" && l["decision"] === "bloquear"),
    );
  });

  it("el motivo para el modelo es accionable y no da el tope ni el porcentaje", async (t) => {
    capturarStderr(t);
    const casos = [
      solicitud(6_000_000, 24, verificacion("verificado", 100_000_000)),
      solicitud(4_500_000, 3, verificacion("verificado")),
      solicitud(4_000_000, 24, verificacion("discrepancia")),
      solicitud(4_000_000, 24, null),
    ];
    for (const s of casos) {
      const { invocar } = preparar([conSolicitud(s)]);
      const motivo = motivoDe(await invocar());
      assert.match(motivo, /Regla 2/);
      assert.match(motivo, /pasa a un analista/);
      assert.match(motivo, /no insistas/);
      assert.doesNotMatch(motivo, /5\.000\.000|5_000_000|30\s?%/);
    }
  });
});

describe("control de preaprobación: la Regla 1 va antes que la Regla 2 (#14)", () => {
  const fueraDePolitica = () =>
    conSolicitud(solicitud(6_000_000, 24, verificacion("verificado", 100_000_000)));

  it("con la identidad sin verificar no interviene y no deja una señal de la Regla 2", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = preparar([fueraDePolitica()], [identidadDe(null)]);
    assert.deepEqual(await invocar(), {});
    assert.equal(estado.escalamiento, null);
    assert.deepEqual(estado.eventos, []);
  });

  it("con la identidad verificada de otra persona no interviene: la verificación no se transfiere", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = preparar([fueraDePolitica()], [identidadDe("CLI-0001000002")]);
    assert.deepEqual(await invocar(), {});
    assert.equal(estado.escalamiento, null);
  });

  it("con la identidad de la dueña de la solicitud sí evalúa la Regla 2", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = preparar([fueraDePolitica()], [identidadDe("CLI-0001000001")]);
    assert.equal(decision(await invocar()), "deny");
    assert.equal(estado.escalamiento?.motivo, "preaprobacion_fuera_de_politica");
  });

  it("si el core no responde al consultar la identidad, deniega y deja la señal de falla persistente", async (t) => {
    capturarStderr(t);
    const { invocar, estado } = preparar(
      [fueraDePolitica()],
      [fallo(errorTransitorio("core_no_disponible", "El core no está disponible."))],
    );
    assert.equal(decision(await invocar()), "deny");
    assert.equal(estado.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.equal(estado.escalamiento?.herramienta, "consultar_identidad");
  });

  it("una excepción al consultar la identidad deniega, ante la duda", async (t) => {
    capturarStderr(t);
    const { invocar } = preparar([fueraDePolitica()], [new Error("falla inesperada")]);
    assert.equal(decision(await invocar()), "deny");
  });
});
