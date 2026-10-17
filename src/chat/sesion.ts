// Conversación del chat y estado visible de la solicitud (specs/006-interfaz-chat: data-model.md,
// "Conversacion" y "EstadoSolicitud y transiciones"). Funciones puras: el estado solo cambia con
// eventos validados, nunca con el texto del agente (FR-007); los estados finales cierran (FR-007a).

import { randomUUID } from "node:crypto";
import type { EventoNegocio } from "../compartido/eventos.ts";
import type { TurnoHistorial } from "../agente/agente.ts";

export type { TurnoHistorial };

export type EstadoSolicitud = "en_curso" | "preaprobada" | "escalada";

export interface Conversacion {
  readonly correlationId: string;
  readonly historial: readonly TurnoHistorial[];
  readonly estado: EstadoSolicitud;
  /** Búsquedas ambiguas de la conversación; viaja a `conversar` en cada turno (#9). */
  readonly busquedasAmbiguas: number;
  /** Si ya se desambiguó al solicitante; viaja a `conversar` en cada turno (#9). */
  readonly desambiguada: boolean;
}

/** Un evento tal como llega a la interfaz, después de validarlo otra vez (R3). */
export type EventoMostrado =
  | { reconocido: true; evento: EventoNegocio }
  | { reconocido: false; crudo: unknown; problema: string };

export const nuevaConversacion = (correlationId: string = randomUUID()): Conversacion => ({
  correlationId,
  historial: [],
  estado: "en_curso",
  busquedasAmbiguas: 0,
  desambiguada: false,
});

export const registrarTurno = (
  conv: Conversacion,
  autor: TurnoHistorial["autor"],
  texto: string,
): Conversacion => ({ ...conv, historial: [...conv.historial, { autor, texto }] });

export const estaCerrada = (conv: Conversacion): boolean => conv.estado !== "en_curso";

const DESTINO: Partial<Record<EventoNegocio["tipo"], EstadoSolicitud>> = {
  preaprobacion: "preaprobada",
  escalamiento: "escalada",
};

/** Aplica los eventos en orden; el primero que lleva a un estado final lo fija. */
export function aplicarEventos(
  conv: Conversacion,
  eventos: readonly EventoMostrado[],
): { conversacion: Conversacion; cambio: boolean } {
  let estado = conv.estado;
  for (const mostrado of eventos) {
    if (estado !== "en_curso" || !mostrado.reconocido) continue;
    estado = DESTINO[mostrado.evento.tipo] ?? estado;
  }
  if (estado === conv.estado) return { conversacion: conv, cambio: false };
  return { conversacion: { ...conv, estado }, cambio: true };
}
