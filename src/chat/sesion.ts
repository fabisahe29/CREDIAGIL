// Conversación del chat y estado visible de la solicitud (specs/006-interfaz-chat: data-model.md,
// "Conversacion" y "EstadoSolicitud y transiciones"). Funciones puras: el estado solo cambia con
// eventos validados, nunca con el texto del agente (FR-007); los estados finales cierran (FR-007a).

import { randomUUID } from "node:crypto";
import type { EventoNegocio } from "../compartido/eventos.ts";
import type { DocumentoConversacion, TurnoHistorial } from "../agente/agente.ts";

export type { DocumentoConversacion, TurnoHistorial };

export type EstadoSolicitud = "en_curso" | "preaprobada" | "escalada";

export interface Conversacion {
  readonly correlationId: string;
  readonly historial: readonly TurnoHistorial[];
  readonly estado: EstadoSolicitud;
  /** Búsquedas ambiguas de la conversación; viaja a `conversar` en cada turno (#9). */
  readonly busquedasAmbiguas: number;
  /** Si ya se desambiguó al solicitante; viaja a `conversar` en cada turno (#9). */
  readonly desambiguada: boolean;
  /** Documentos entregados, numerados desde 1; viajan a `conversar` en cada turno (#10). */
  readonly documentos: readonly DocumentoConversacion[];
  /** Documentos que ya revisó la Regla 5; viaja a `conversar` en cada turno (#10). */
  readonly documentosRevisados: number;
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
  documentos: [],
  documentosRevisados: 0,
});

/** Lo que el chat sabe de un documento antes de numerarlo. */
export interface DocumentoNuevo {
  nombre: string;
  soportado: boolean;
  /** Solo se guarda si el documento es soportado. */
  contenido?: string;
}

/** Numera el documento con el siguiente número de la conversación; un no soportado no guarda texto. */
export function registrarDocumento(
  conv: Conversacion,
  nuevo: DocumentoNuevo,
): { conversacion: Conversacion; documento: DocumentoConversacion } {
  const adjunto = conv.documentos.length + 1;
  const documento: DocumentoConversacion =
    nuevo.soportado && nuevo.contenido !== undefined
      ? { adjunto, nombre: nuevo.nombre, soportado: true, contenido: nuevo.contenido }
      : { adjunto, nombre: nuevo.nombre, soportado: false };
  return { conversacion: { ...conv, documentos: [...conv.documentos, documento] }, documento };
}

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
