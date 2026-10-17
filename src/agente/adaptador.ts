// Adaptador MCP en el mismo proceso del agente (research.md, R2; contracts/agente.md).
// El Agent SDK ejecuta el ciclo de herramientas sin devolvernos el control: el manejador de cada
// herramienta es el único punto determinista para llamar al core, reintentar y escalar.

import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
  aResultadoMcp,
  fallo,
  transitorioAgotado,
  type Categoria,
  type Respuesta,
} from "../compartido/errores.ts";
import { validarEvento, type DatosEvento, type EventoNegocio } from "../compartido/eventos.ts";
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

/** Un intento de llamada al core, para el modo de demostración del chat (R5 del #8). */
export interface InfoHerramienta {
  herramienta: string;
  intento: number;
  /** "ok" o el código del error. */
  resultado: string;
  categoria?: Categoria;
}

/** Estado de una conversación que comparten el adaptador y el agente. */
export interface EstadoConversacion {
  correlationId: string;
  escalamiento: SenalEscalamiento | null;
  /** Eventos de negocio emitidos en este turno, en orden (contracts/eventos.md del #8). */
  eventos: EventoNegocio[];
}

export const crearEstado = (correlationId: string): EstadoConversacion => ({
  correlationId,
  escalamiento: null,
  eventos: [],
});

/**
 * Emite un evento de negocio: solo desde código determinista, nunca a partir del texto del modelo
 * (FR-007 del #8). Un evento que no cumple el catálogo es un error de programación del emisor y lanza.
 */
export function emitirEvento(estado: EstadoConversacion, datos: DatosEvento): EventoNegocio {
  const validacion = validarEvento({
    ...datos,
    correlationId: estado.correlationId,
    ts: new Date().toISOString(),
  });
  if (!validacion.ok) throw new Error(`evento inválido: ${validacion.problema}`);
  const evento = validacion.evento;
  estado.eventos.push(evento);
  registrar("evento_negocio", {
    correlationId: evento.correlationId,
    tipo: evento.tipo,
    regla: evento.regla ?? null,
    valores: evento.valores ?? null,
  });
  return evento;
}

export interface OpcionesAdaptador {
  core: ClienteCore;
  estado: EstadoConversacion;
  /** Reloj y azar de los reintentos; inyectables en las pruebas. */
  dormir?: (ms: number) => Promise<void>;
  azar?: () => number;
  /** Observador de cada intento de llamada al core (modo de demostración del chat, R5 del #8). */
  alUsarHerramienta?: (info: InfoHerramienta) => void;
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
  alUsarHerramienta,
}: OpcionesAdaptador) {
  /** Avisa al observador sin que su falla afecte la llamada; la falla se registra (Principio VI). */
  function avisarObservador(info: InfoHerramienta): void {
    if (alUsarHerramienta === undefined) return;
    try {
      alUsarHerramienta(info);
    } catch (error) {
      registrar(
        "error_observador",
        {
          correlationId: estado.correlationId,
          causa: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        },
        { nivel: "warn" },
      );
    }
  }

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
      alIntentar: (intento, respuesta) => {
        registrar("llamada_core", {
          herramienta,
          intento,
          correlationId: estado.correlationId,
          resultado: respuesta.ok ? "ok" : respuesta.error.codigo,
        });
        avisarObservador(
          respuesta.ok
            ? { herramienta, intento, resultado: "ok" }
            : {
                herramienta,
                intento,
                resultado: respuesta.error.codigo,
                categoria: respuesta.error.categoria,
              },
        );
      },
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

  return { servidor, herramientas, estado };
}
