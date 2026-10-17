// Formato de salida del chat (specs/006-interfaz-chat/contracts/chat-cli.md, "Formato de salida").
// Las etiquetas son texto fijo; el color es solo refuerzo, así que sin color se lee igual (R4).

import { styleText } from "node:util";
import type { InfoHerramienta } from "../agente/adaptador.ts";
import type { EventoNegocio } from "../compartido/eventos.ts";
import type { EstadoSolicitud, EventoMostrado } from "./sesion.ts";

type Formato = Parameters<typeof styleText>[0];

const pintar = (formato: Formato, texto: string, color: boolean) =>
  color ? styleText(formato, texto, { validateStream: false }) : texto;

export const TRABAJANDO = "Agente · trabajando…";

export const formatearSolicitante = (texto: string, color: boolean) =>
  `${pintar("bold", "Tú:", color)} ${texto}`;

export const formatearAdjunto = (nombre: string, detalle: string, color: boolean) =>
  `${pintar("bold", "Tú · adjunto", color)} ${nombre} (${detalle})`;

export const formatearAgente = (texto: string, color: boolean) =>
  `${pintar(["bold", "cyan"], "Agente:", color)} ${texto}`;

export function formatearCabecera(
  { rutaLog, correlationId }: { rutaLog: string; correlationId: string },
  color: boolean,
): string {
  return [
    pintar("bold", "Crediágil · chat de originación de crédito (datos ficticios)", color),
    `Logs: ${rutaLog}`,
    `Conversación: ${correlationId}`,
    "Escribe /ayuda para ver los comandos.",
  ].join("\n");
}

const ETIQUETAS: Record<EventoNegocio["tipo"], string> = {
  preaprobacion: "[PREAPROBACIÓN]",
  solicitud_de_dato: "[SOLICITUD DE DATO]",
  escalamiento: "[ESCALAMIENTO]",
  bloqueo_por_regla: "[BLOQUEO POR REGLA]",
};

const COLORES: Record<EventoNegocio["tipo"], "green" | "blue" | "yellow" | "red"> = {
  preaprobacion: "green",
  solicitud_de_dato: "blue",
  escalamiento: "yellow",
  bloqueo_por_regla: "red",
};

const miles = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const formatearValores = (valores: Record<string, string | number>) =>
  Object.entries(valores)
    .map(
      ([clave, valor]) => `${clave} = ${typeof valor === "number" ? miles.format(valor) : valor}`,
    )
    .join(" · ");

export function formatearEvento(mostrado: EventoMostrado, color: boolean): string {
  if (!mostrado.reconocido) {
    const tipo = (mostrado.crudo as { tipo?: unknown } | null)?.tipo;
    const borde = pintar("magenta", "┃", color);
    return [
      `${borde} ${pintar(["bold", "magenta"], "[EVENTO NO RECONOCIDO]", color)} tipo: ${typeof tipo === "string" ? tipo : "sin tipo"}`,
      `${borde} Problema: ${mostrado.problema}`,
    ].join("\n");
  }

  const evento = mostrado.evento;
  const borde = pintar(COLORES[evento.tipo], "┃", color);
  const etiqueta = pintar(["bold", COLORES[evento.tipo]], ETIQUETAS[evento.tipo], color);
  const campos: [string, string | undefined][] = [
    ["Dato", "dato" in evento ? evento.dato : undefined],
    ["Regla", evento.regla],
    ["Valores", evento.valores ? formatearValores(evento.valores) : undefined],
    ["Motivo", evento.motivo],
    ["Qué sigue", "siguientePaso" in evento ? evento.siguientePaso : undefined],
  ];
  return [
    `${borde} ${etiqueta} ${evento.descripcion}`,
    ...campos
      .filter((campo): campo is [string, string] => campo[1] !== undefined)
      .map(([nombre, valor]) => `${borde} ${nombre}: ${valor}`),
  ].join("\n");
}

const NOMBRES_ESTADO: Record<EstadoSolicitud, string> = {
  en_curso: "en curso",
  preaprobada: "preaprobada",
  escalada: "escalada a analista",
};

/** Nombre del estado para los avisos («La solicitud está …»). */
export const textoEstado = (estado: EstadoSolicitud) => NOMBRES_ESTADO[estado];

export function formatearEstado(estado: EstadoSolicitud, color: boolean): string {
  const cerrada = estado === "en_curso" ? "" : " (conversación cerrada)";
  return pintar(
    "bold",
    `══ Estado de la solicitud: ${NOMBRES_ESTADO[estado].toUpperCase()}${cerrada} ══`,
    color,
  );
}

export function formatearHerramienta(info: InfoHerramienta, color: boolean): string {
  const resultado =
    info.categoria === undefined ? info.resultado : `${info.resultado} (${info.categoria})`;
  return pintar(
    "dim",
    `   · herramienta ${info.herramienta} · intento ${info.intento} · ${resultado}`,
    color,
  );
}
