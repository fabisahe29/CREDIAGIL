// Adaptador MCP en el mismo proceso del agente (research.md, R2; contracts/agente.md).
// El Agent SDK ejecuta el ciclo de herramientas sin devolvernos el control: el manejador de cada
// herramienta es el único punto determinista para llamar al core, reintentar y escalar.

import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { aResultadoMcp, fallo, transitorioAgotado, type Respuesta } from "../compartido/errores.ts";
import { registrar } from "../compartido/logs.ts";
import type { ClienteCore } from "./cliente-core.ts";
import { conReintentos } from "./reintentos.ts";

export const CLAVE_SERVIDOR = "originacion";

export interface SenalEscalamiento {
  motivo:
    | "falla_transitoria_persistente"
    | "falla_del_agente"
    | "limite_de_turnos"
    | "respuesta_incompleta";
  regla: string;
  resultado: "escalada";
  correlationId: string;
  ts: string;
  herramienta?: string;
  intentos?: number;
  ultimoError?: string;
}

/** Estado de una conversación que comparten el adaptador y el agente. */
export interface EstadoConversacion {
  correlationId: string;
  escalamiento: SenalEscalamiento | null;
}

export const crearEstado = (correlationId: string): EstadoConversacion => ({
  correlationId,
  escalamiento: null,
});

export interface OpcionesAdaptador {
  core: ClienteCore;
  estado: EstadoConversacion;
  /** Reloj y azar de los reintentos; inyectables en las pruebas. */
  dormir?: (ms: number) => Promise<void>;
  azar?: () => number;
}

const esquemaConsultar = {
  idSolicitud: z
    .string()
    .describe(
      "Identificador de la solicitud: SOL- seguido de 10 dígitos, por ejemplo SOL-0001000001.",
    ),
};

const dormirDeVerdad = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

export function crearAdaptador({
  core,
  estado,
  dormir = dormirDeVerdad,
  azar = Math.random,
}: OpcionesAdaptador) {
  /** Llama al core con reintentos (FR-011) y, si se agotan, deja la señal de escalamiento (FR-012). */
  async function llamarConReintentos<T>(
    herramienta: string,
    operacion: () => Promise<Respuesta<T>>,
  ): Promise<Respuesta<T>> {
    // Con la conversación ya escalada, insistir solo gasta esperas: el resultado final es la escalada.
    if (estado.escalamiento !== null) return fallo(transitorioAgotado());
    const resultado = await conReintentos(operacion, {
      dormir,
      azar,
      alIntentar: (intento, respuesta) =>
        registrar("llamada_core", {
          herramienta,
          intento,
          correlationId: estado.correlationId,
          resultado: respuesta.ok ? "ok" : respuesta.error.codigo,
        }),
    });
    if (resultado.agotado && estado.escalamiento === null) {
      estado.escalamiento = {
        motivo: "falla_transitoria_persistente",
        regla: "constitución, Principio VI · reintentos agotados",
        resultado: "escalada",
        correlationId: estado.correlationId,
        ts: new Date().toISOString(),
        herramienta,
        intentos: resultado.intentos,
        ultimoError: resultado.ultimoError ?? "desconocido",
      };
      registrar("escalamiento", { ...estado.escalamiento });
    }
    return resultado.respuesta;
  }

  async function consultar({ idSolicitud }: { idSolicitud: string }) {
    const respuesta = await llamarConReintentos("consultar_solicitud", () =>
      core.consultarSolicitud(idSolicitud, estado.correlationId),
    );
    return aResultadoMcp(respuesta);
  }

  const herramientas = {
    consultar_solicitud: { esquema: esquemaConsultar, manejar: consultar },
  };

  const servidor = createSdkMcpServer({
    name: CLAVE_SERVIDOR,
    version: "0.1.0",
    tools: [
      tool(
        "consultar_solicitud",
        "Consulta el estado de una solicitud de crédito en el core de Crediágil por su identificador. Si no existe, devuelve solicitud: null. Si devuelve un error, informa su mensaje; no inventes datos.",
        esquemaConsultar,
        (argumentos) => consultar(argumentos),
        { annotations: { readOnlyHint: true } },
      ),
    ],
  });

  return { servidor, herramientas };
}
