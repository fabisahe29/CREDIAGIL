// Control de la Regla 2: hook PreToolUse del Agent SDK (specs/012-preaprobacion-automatica-politica:
// research.md, R3, R4 y R5; contracts/agente.md, "Hook nuevo de la Regla 2"). Antes de
// `preaprobar_credito`, lee del core la solicitud registrada de la conversación, sin pasar por el modelo,
// y la evalúa con la misma `evaluarRegla2` que usa el core: si no cumple la política, la bloquea, deja la
// señal de escalamiento y el agente no insiste. Decide con lo que guarda el core, nunca con lo que el
// modelo envíe en la entrada. La Regla 1 la aplica antes el hook de identidad (#9). Ante la duda
// bloquea; si el core no responde tras los reintentos, además escala (Principios IV, V y VI).

import type { HookCallback, HookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { registrar } from "../compartido/logs.ts";
import { evaluarRegla1 } from "../politica/identidad.ts";
import { REGLA_2, evaluarRegla2 } from "../politica/preaprobacion.ts";
import { CLAVE_SERVIDOR, dejarSenal, emitirEvento, type EstadoConversacion } from "./adaptador.ts";
import type { ClienteCore } from "./cliente-core.ts";
import { conReintentos } from "./reintentos.ts";

export interface OpcionesControlPreaprobacion {
  core: Pick<ClienteCore, "consultarSolicitudRegistrada" | "consultarIdentidad">;
  estado: EstadoConversacion;
  /** Reloj y azar de los reintentos; inyectables en las pruebas. */
  dormir?: (ms: number) => Promise<void>;
  azar?: () => number;
}

const HERRAMIENTA = "preaprobar_credito";
const NOMBRE_SDK = `mcp__${CLAVE_SERVIDOR}__${HERRAMIENTA}`;
const MOTIVO_SIN_RESPUESTA = "No se pudo consultar la solicitud registrada; no se continúa.";
const MOTIVO_SIN_SOLICITUD =
  "No hay una solicitud registrada en esta conversación: regístrala antes de preaprobar.";

const dormirDeVerdad = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

const denegar = (motivo: string): SyncHookJSONOutput => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: motivo,
  },
});

export function crearControlPreaprobacion({
  core,
  estado,
  dormir = dormirDeVerdad,
  azar = Math.random,
}: OpcionesControlPreaprobacion): HookCallback {
  /** Decide sin lanzar nunca: cualquier falla al consultar deniega (ante la duda, bloquear). */
  async function decidir(): Promise<SyncHookJSONOutput> {
    let resultado;
    try {
      resultado = await conReintentos(
        () => core.consultarSolicitudRegistrada(estado.correlationId),
        {
          dormir,
          azar,
        },
      );
    } catch (error) {
      registrar(
        "error_control_preaprobacion",
        {
          correlationId: estado.correlationId,
          causa: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        },
        { nivel: "error" },
      );
      return denegar(MOTIVO_SIN_RESPUESTA);
    }
    if (resultado.agotado) {
      // Nunca se decide sin respuesta del core: se deniega y la conversación escala (Principio VI).
      dejarSenal(estado, {
        motivo: "falla_transitoria_persistente",
        regla: "constitución, Principio VI · reintentos agotados",
        herramienta: "consultar_solicitud_registrada",
        intentos: resultado.intentos,
        ultimoError: resultado.ultimoError ?? "desconocido",
      });
      return denegar(MOTIVO_SIN_RESPUESTA);
    }
    if (!resultado.respuesta.ok) return denegar(MOTIVO_SIN_RESPUESTA);

    const solicitud = resultado.respuesta.datos.solicitud;

    // La Regla 1 va antes que la 2 (orden 4 → 5 → 1 → 3 → 2): con la identidad sin verificar, o de otra
    // persona, decide el hook de identidad y este no deja una señal de la Regla 2.
    let identidad;
    try {
      identidad = await conReintentos(() => core.consultarIdentidad(estado.correlationId), {
        dormir,
        azar,
      });
    } catch (error) {
      registrar(
        "error_control_preaprobacion",
        {
          correlationId: estado.correlationId,
          causa: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        },
        { nivel: "error" },
      );
      return denegar(MOTIVO_SIN_RESPUESTA);
    }
    if (identidad.agotado) {
      dejarSenal(estado, {
        motivo: "falla_transitoria_persistente",
        regla: "constitución, Principio VI · reintentos agotados",
        herramienta: "consultar_identidad",
        intentos: identidad.intentos,
        ultimoError: identidad.ultimoError ?? "desconocido",
      });
      return denegar(MOTIVO_SIN_RESPUESTA);
    }
    if (!identidad.respuesta.ok) return denegar(MOTIVO_SIN_RESPUESTA);
    const estadoIdentidad = identidad.respuesta.datos.identidad;
    if (!evaluarRegla1(estadoIdentidad, solicitud?.solicitante.idSolicitante).permitido) {
      registrar("control_preaprobacion", {
        correlationId: estado.correlationId,
        herramienta: HERRAMIENTA,
        decision: "regla_1",
      });
      return {};
    }

    if (solicitud === null) {
      // Un paso olvidado, no un caso fuera de política: se pide registrar y no se escala.
      registrar("control_preaprobacion", {
        correlationId: estado.correlationId,
        herramienta: HERRAMIENTA,
        decision: "sin_solicitud",
      });
      return denegar(MOTIVO_SIN_SOLICITUD);
    }
    // Ya preaprobada: la repetición devuelve la misma preaprobación, sin otro efecto.
    if (solicitud.estado === "preaprobada") {
      registrar("control_preaprobacion", {
        correlationId: estado.correlationId,
        herramienta: HERRAMIENTA,
        decision: "permitir",
      });
      return {};
    }

    const decision = evaluarRegla2({
      monto: solicitud.monto.valor,
      plazoMeses: solicitud.plazoMeses.valor,
      verificacion: solicitud.verificacionIngreso,
    });
    if (decision.permitido) {
      registrar("control_preaprobacion", {
        correlationId: estado.correlationId,
        herramienta: HERRAMIENTA,
        decision: "permitir",
      });
      return {};
    }

    const codigo = decision.codigo ?? "fuera_de_politica";
    dejarSenal(estado, {
      motivo: "preaprobacion_fuera_de_politica",
      regla: REGLA_2,
      herramienta: HERRAMIENTA,
      codigo,
    });
    emitirEvento(estado, {
      tipo: "bloqueo_por_regla",
      descripcion: "Tu solicitud no cumple las condiciones para una preaprobación automática.",
      motivo: codigo,
      regla: REGLA_2,
      valores: decision.valores,
      siguientePaso: "Un analista de crédito revisará tu caso.",
    });
    registrar("control_preaprobacion", {
      correlationId: estado.correlationId,
      herramienta: HERRAMIENTA,
      decision: "bloquear",
      codigo,
    });
    return denegar(
      `Regla 2: ${decision.motivo} El caso pasa a un analista; no insistas, no la intentes con otros datos ni ofrezcas alternativas.`,
    );
  }

  return async (entrada: HookInput) => {
    if (entrada.hook_event_name !== "PreToolUse") return {};
    if (entrada.tool_name !== NOMBRE_SDK) return {};
    // Con la conversación ya escalada, el hook de identidad deniega todas las herramientas: aquí no
    // se evalúa ni se deja otra señal.
    if (estado.escalamiento !== null) return {};
    return decidir();
  };
}
