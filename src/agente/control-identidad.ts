// Control de identidad: hook PreToolUse del Agent SDK (specs/007-verificacion-identidad: research.md,
// R7; contracts/agente.md, "Control de identidad"). Antes de una herramienta que exige identidad
// verificada, consulta el estado en el core, sin pasar por el modelo, y la bloquea si la Regla 1 no
// se cumple. Ante la duda bloquea; si el core no responde tras los reintentos, además escala
// (constitución, Principios IV, V y VI).

import type { HookCallback, HookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { registrar } from "../compartido/logs.ts";
import { evaluarRegla1, REGLA_1 } from "../politica/identidad.ts";
import { CLAVE_SERVIDOR, dejarSenal, emitirEvento, type EstadoConversacion } from "./adaptador.ts";
import type { ClienteCore } from "./cliente-core.ts";
import { conReintentos } from "./reintentos.ts";

/**
 * Herramientas del servidor `originacion` que exigen identidad verificada. La extracción de
 * documentos (#10) entra aquí: así ningún documento se procesa sin identidad, por código y no solo
 * por el prompt (FR-011a del #9). La verificación de ingreso (#11) también: sin identidad no se
 * compara nada con el solicitante. El registro de la solicitud (#13) agregará la suya.
 */
export const HERRAMIENTAS_CON_IDENTIDAD: readonly string[] = [
  "extraer_documento",
  "verificar_ingreso",
];

export interface OpcionesControlIdentidad {
  core: Pick<ClienteCore, "consultarIdentidad">;
  estado: EstadoConversacion;
  /** Por defecto, HERRAMIENTAS_CON_IDENTIDAD; las pruebas pasan una herramienta propia. */
  herramientas?: readonly string[];
  /** Reloj y azar de los reintentos; inyectables en las pruebas. */
  dormir?: (ms: number) => Promise<void>;
  azar?: () => number;
  /**
   * Regla 5 antes que la Regla 1 (orden 4 → 5 → 1; revisión de 0aa8c2a): antes de bloquear por falta
   * de identidad, se pregunta si el caso no está cubierto. Devuelve `true` si ya escaló.
   */
  antesDeRegla1?: (herramienta: string, entrada: unknown) => Promise<boolean>;
}

const PREFIJO = `mcp__${CLAVE_SERVIDOR}__`;
const MOTIVO_SIN_IDENTIDAD = "Regla 1: la identidad del solicitante no está verificada.";
const MOTIVO_SIN_RESPUESTA = "No se pudo comprobar la identidad; no se continúa.";
const MOTIVO_OTRO_SOLICITANTE = "Regla 1: la identidad verificada es de otro solicitante.";
const MOTIVO_ESCALADA = "La conversación ya pasó a un analista; no se ejecutan más herramientas.";
const MOTIVO_REGLA_5 = "Regla 5 antes que la Regla 1: el caso pasa a un analista.";

const dormirDeVerdad = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

const denegar = (motivo: string): SyncHookJSONOutput => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: motivo,
  },
});

export function crearControlIdentidad({
  core,
  estado,
  herramientas = HERRAMIENTAS_CON_IDENTIDAD,
  dormir = dormirDeVerdad,
  azar = Math.random,
  antesDeRegla1,
}: OpcionesControlIdentidad): HookCallback {
  /** Si la Regla 5 ya escaló este caso. Una falla al evaluarla no escala: decide la Regla 1. */
  async function escaloPorRegla5(herramienta: string, entrada: unknown): Promise<boolean> {
    if (antesDeRegla1 === undefined) return false;
    try {
      const escalo = await antesDeRegla1(herramienta, entrada);
      if (escalo) {
        registrar("control_identidad", {
          correlationId: estado.correlationId,
          herramienta,
          decision: "regla_5",
        });
      }
      return escalo;
    } catch (error) {
      registrar(
        "error_regla_5_previa",
        {
          correlationId: estado.correlationId,
          causa: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        },
        { nivel: "error" },
      );
      return false;
    }
  }

  function bloquear(
    herramienta: string,
    motivo: string,
    identidad = "no verificada",
  ): SyncHookJSONOutput {
    emitirEvento(estado, {
      tipo: "bloqueo_por_regla",
      descripcion: "Para continuar necesito verificar tu identidad.",
      motivo: "identidad_no_verificada",
      regla: REGLA_1,
      valores: { identidad, herramienta },
      siguientePaso: "Indícame tu número de documento para buscarte y verificarte.",
    });
    registrar("control_identidad", {
      correlationId: estado.correlationId,
      herramienta,
      decision: "bloquear",
      motivo,
    });
    return denegar(motivo);
  }

  /** Decide sin lanzar nunca: cualquier falla al consultar bloquea (ante la duda, bloquear). */
  async function decidir(
    herramienta: string,
    idSolicitanteAccion: string | undefined,
    entradaHerramienta: unknown,
  ): Promise<SyncHookJSONOutput> {
    let resultado;
    try {
      resultado = await conReintentos(() => core.consultarIdentidad(estado.correlationId), {
        dormir,
        azar,
      });
    } catch (error) {
      registrar(
        "error_control_identidad",
        {
          correlationId: estado.correlationId,
          causa: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        },
        { nivel: "error" },
      );
      return bloquear(herramienta, MOTIVO_SIN_RESPUESTA);
    }
    if (resultado.agotado) {
      // Nunca se decide sin respuesta del core: se bloquea y la conversación escala (Principio VI).
      dejarSenal(estado, {
        motivo: "falla_transitoria_persistente",
        regla: "constitución, Principio VI · reintentos agotados",
        herramienta: "consultar_identidad",
        intentos: resultado.intentos,
        ultimoError: resultado.ultimoError ?? "desconocido",
      });
      return bloquear(herramienta, MOTIVO_SIN_RESPUESTA);
    }
    const respuesta = resultado.respuesta;
    if (!respuesta.ok) return bloquear(herramienta, MOTIVO_SIN_RESPUESTA);
    const decision = evaluarRegla1(respuesta.datos.identidad, idSolicitanteAccion);
    if (!decision.permitido) {
      // La Regla 5 va antes: si el caso no está cubierto, escala en lugar de bloquear por identidad.
      if (await escaloPorRegla5(herramienta, entradaHerramienta)) return denegar(MOTIVO_REGLA_5);
      const identidad = decision.valores["identidad"] ?? "no verificada";
      const deOtro = respuesta.datos.identidad.verificada;
      return bloquear(
        herramienta,
        deOtro ? MOTIVO_OTRO_SOLICITANTE : MOTIVO_SIN_IDENTIDAD,
        identidad,
      );
    }
    registrar("control_identidad", {
      correlationId: estado.correlationId,
      herramienta,
      decision: "permitir",
    });
    return {};
  }

  return async (entrada: HookInput) => {
    if (entrada.hook_event_name !== "PreToolUse") return {};
    if (!entrada.tool_name.startsWith(PREFIJO)) return {};
    const herramienta = entrada.tool_name.slice(PREFIJO.length);
    // Una conversación escalada (p. ej. reglas 4 y 5 con solicitar_analista) no sigue: ninguna
    // herramienta, tampoco las de identificación, se ejecuta después (orden 4 → 5 → 1).
    if (estado.escalamiento !== null) {
      registrar("control_identidad", {
        correlationId: estado.correlationId,
        herramienta,
        decision: "escalada",
      });
      return denegar(MOTIVO_ESCALADA);
    }
    if (!herramientas.includes(herramienta)) return {};
    // Si la herramienta actúa sobre un solicitante concreto (p. ej. el registro del #13), debe ser
    // el verificado: la verificación no se transfiere a otra persona.
    const idSolicitante = (entrada.tool_input as { idSolicitante?: unknown } | null)?.idSolicitante;
    return decidir(
      herramienta,
      typeof idSolicitante === "string" ? idSolicitante : undefined,
      entrada.tool_input,
    );
  };
}
