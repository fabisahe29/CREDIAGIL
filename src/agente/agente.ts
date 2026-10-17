// Agente de originación (contracts/agente.md; research.md, R4 y R5).
// El Agent SDK sigue el ciclo por la razón de parada del modelo (FR-002); este módulo solo
// interpreta el `result` y compone en código los avisos: toda conversación sin respuesta válida
// escala, nunca se inventa un resultado (FR-012; constitución, Principios V y VI).

import { randomUUID } from "node:crypto";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { registrar } from "../compartido/logs.ts";
import {
  CLAVE_SERVIDOR,
  crearAdaptador,
  crearEstado,
  type SenalEscalamiento,
} from "./adaptador.ts";
import { crearClienteCore, type ClienteCore } from "./cliente-core.ts";

export const MODELO_POR_DEFECTO = "claude-opus-5-5";
export const MAX_TURNOS = 8;
export const TIEMPO_LIMITE_CONVERSACION_MS = 120_000;
const ESPERA_REINTENTO_MODELO_MS = 1_000;
const VARIACION = 0.2;

const SYSTEM_PROMPT = [
  "Eres el asistente de originación de crédito de Crediágil.",
  "Responde en español, con claridad y brevedad.",
  "Para hablar de una solicitud usa solo los datos que devuelven tus herramientas; nunca inventes datos ni supongas resultados.",
  "Si una herramienta devuelve un error, explica su mensaje con tus palabras y no lo reintentes.",
  "No tomas decisiones de crédito: no apruebas, no rechazas ni estimas cuotas.",
].join(" ");

export type ContextoConsulta = ReturnType<typeof crearAdaptador>;

/** Firma de `query()`; las pruebas inyectan una falsa y reciben el adaptador como contexto. */
export type QueryFn = (
  params: { prompt: string; options: Options },
  contexto: ContextoConsulta,
) => AsyncIterable<SDKMessage>;

export interface ResultadoConversacion {
  correlationId: string;
  respuesta: string;
  tipo: "respuesta" | "escalada";
  escalamiento: SenalEscalamiento | null;
  turnos: number;
}

export interface OpcionesConversar {
  correlationId?: string;
  ejecutarConsulta?: QueryFn;
  core?: ClienteCore;
  modelo?: string;
  dormir?: (ms: number) => Promise<void>;
  azar?: () => number;
  tiempoLimiteMs?: number;
}

const dormirDeVerdad = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

type Motivo = SenalEscalamiento["motivo"];

const AVISOS: Readonly<Record<Motivo, string>> = {
  falla_transitoria_persistente:
    "No pude consultar el sistema de originación en este momento. Tu caso pasa a un analista, que te contactará.",
  respuesta_incompleta: "No pude completar tu respuesta. Tu caso pasa a un analista.",
  limite_de_turnos: "No pude completar tu consulta. Tu caso pasa a un analista.",
  falla_del_agente: "Tuve un problema al atender tu consulta. Tu caso pasa a un analista.",
};

const REGLAS: Readonly<Record<Motivo, string>> = {
  falla_transitoria_persistente: "constitución, Principio VI · reintentos agotados",
  respuesta_incompleta: "FR-004 · razón de parada inesperada",
  limite_de_turnos: "FR-003 · límite de seguridad del ciclo",
  falla_del_agente: "constitución, Principio VI · reintento del modelo agotado",
};

interface Intento {
  /** El mensaje `result` del SDK, si llegó. */
  resultado?: Extract<SDKMessage, { type: "result" }>;
  /** Causa cuando no hubo `result` (excepción, tiempo agotado o flujo cortado). */
  causa?: string;
}

type Clasificacion =
  | { tipo: "respuesta"; texto: string }
  | { tipo: "escalar"; motivo: Motivo; ultimoError: string }
  | { tipo: "reintentar"; ultimoError: string };

function clasificar(intento: Intento): Clasificacion {
  const r = intento.resultado;
  if (r === undefined) return { tipo: "reintentar", ultimoError: intento.causa ?? "sin_result" };
  if (r.subtype === "success") {
    return r.stop_reason === "end_turn"
      ? { tipo: "respuesta", texto: r.result }
      : { tipo: "escalar", motivo: "respuesta_incompleta", ultimoError: String(r.stop_reason) };
  }
  if (r.subtype === "error_max_turns") {
    return { tipo: "escalar", motivo: "limite_de_turnos", ultimoError: r.subtype };
  }
  return { tipo: "reintentar", ultimoError: r.subtype };
}

export async function conversar(
  mensaje: string,
  {
    correlationId = randomUUID(),
    ejecutarConsulta = query as unknown as QueryFn,
    core,
    modelo = process.env["CREDIAGIL_MODELO"] || MODELO_POR_DEFECTO,
    dormir = dormirDeVerdad,
    azar = Math.random,
    tiempoLimiteMs = TIEMPO_LIMITE_CONVERSACION_MS,
  }: OpcionesConversar = {},
): Promise<ResultadoConversacion> {
  const coreEnUso = core ?? (await crearClienteCore());
  const estado = crearEstado(correlationId);
  const adaptador = crearAdaptador({ core: coreEnUso, estado, dormir, azar });
  let turnos = 0;

  async function intentar(): Promise<Intento> {
    const abortController = new AbortController();
    const reloj = setTimeout(() => abortController.abort(), tiempoLimiteMs);
    const options: Options = {
      model: modelo,
      systemPrompt: SYSTEM_PROMPT,
      tools: [],
      mcpServers: { [CLAVE_SERVIDOR]: adaptador.servidor },
      allowedTools: [`mcp__${CLAVE_SERVIDOR}__*`],
      settingSources: [],
      maxTurns: MAX_TURNOS,
      abortController,
      env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
    };
    try {
      // El SDK puede emitir varios mensajes `assistant` por turno (uno por bloque de contenido),
      // todos con el mismo message.id y stop_reason null: se registra un turno por id distinto.
      let numero = 0;
      let idAnterior: string | undefined;
      for await (const m of ejecutarConsulta({ prompt: mensaje, options }, adaptador)) {
        if (m.type === "assistant") {
          const id: string | undefined = m.message.id;
          if (id === undefined || id !== idAnterior) {
            numero++;
            registrar("turno", { correlationId, numero });
          }
          idAnterior = id;
        } else if (m.type === "result") {
          turnos = m.num_turns;
          return { resultado: m };
        }
      }
      return { causa: abortController.signal.aborted ? "tiempo_agotado" : "sin_result" };
    } catch (error) {
      if (abortController.signal.aborted) return { causa: "tiempo_agotado" };
      return { causa: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    } finally {
      clearTimeout(reloj);
    }
  }

  function escalar(motivo: Motivo, ultimoError: string, intentos?: number): ResultadoConversacion {
    const senal: SenalEscalamiento = estado.escalamiento ?? {
      motivo,
      regla: REGLAS[motivo],
      resultado: "escalada",
      correlationId,
      ts: new Date().toISOString(),
      ultimoError,
      ...(intentos !== undefined ? { intentos } : {}),
    };
    if (estado.escalamiento === null) registrar("escalamiento", { ...senal });
    return {
      correlationId,
      respuesta: `${AVISOS[senal.motivo]} Referencia: ${correlationId.slice(0, 8)}.`,
      tipo: "escalada",
      escalamiento: senal,
      turnos,
    };
  }

  function cerrarCon(r: ResultadoConversacion, intento: Intento): ResultadoConversacion {
    registrar("resultado", {
      correlationId,
      subtype: intento.resultado?.subtype ?? null,
      stop_reason: intento.resultado?.stop_reason ?? null,
      tipo: r.tipo,
      turnos: r.turnos,
    });
    return r;
  }

  try {
    let intento = await intentar();
    let clase = clasificar(intento);
    if (estado.escalamiento === null && clase.tipo === "reintentar") {
      await dormir(ESPERA_REINTENTO_MODELO_MS * (1 + (azar() * 2 - 1) * VARIACION));
      intento = await intentar();
      clase = clasificar(intento);
      if (clase.tipo === "reintentar") {
        return cerrarCon(escalar("falla_del_agente", clase.ultimoError, 2), intento);
      }
    }
    if (estado.escalamiento !== null) {
      return cerrarCon(escalar(estado.escalamiento.motivo, ""), intento);
    }
    if (clase.tipo === "respuesta") {
      return cerrarCon(
        { correlationId, respuesta: clase.texto, tipo: "respuesta", escalamiento: null, turnos },
        intento,
      );
    }
    if (clase.tipo === "escalar")
      return cerrarCon(escalar(clase.motivo, clase.ultimoError), intento);
    return cerrarCon(escalar("falla_del_agente", clase.ultimoError, 1), intento);
  } finally {
    if (core === undefined) await coreEnUso.cerrar();
  }
}
