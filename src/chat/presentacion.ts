// Formato de salida del chat (specs/006-interfaz-chat/contracts/chat-cli.md, "Formato de salida").
// Las etiquetas son texto fijo; el color es solo refuerzo, así que sin color se lee igual (R4).

import { styleText } from "node:util";
import type { InfoHerramienta } from "../agente/adaptador.ts";
import type { EventoNegocio } from "../compartido/eventos.ts";
import type { ResumenAnalista } from "../compartido/escalamiento.ts";
import type { EstadoSolicitud, EventoMostrado } from "./sesion.ts";

type Formato = Parameters<typeof styleText>[0];

const pintar = (formato: Formato, texto: string, color: boolean) =>
  color ? styleText(formato, texto, { validateStream: false }) : texto;

export const TRABAJANDO = "Agente · trabajando…";

export const formatearSolicitante = (texto: string, color: boolean) =>
  `${pintar("bold", "Tú:", color)} ${texto}`;

export const formatearAdjunto = (
  adjunto: number,
  nombre: string,
  detalle: string,
  color: boolean,
) => `${pintar("bold", "Tú · adjunto", color)} ${adjunto} · ${nombre} (${detalle})`;

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
// ── Resumen para el analista, solo en el modo de demostración (#15, R10) ───────────────────

const pesos = (valor: number | null): string =>
  valor === null ? "pendiente" : miles.format(valor);

function describirDiscrepancia(discrepancia: ResumenAnalista["discrepancias"][number]): string {
  if (discrepancia.tipo === "ingreso") {
    return `ingreso declarado ${miles.format(discrepancia.declarado)} contra verificado ${miles.format(discrepancia.verificado)} (${String(discrepancia.diferenciaPorcentaje).replace(".", ",")} %)`;
  }
  const { adjuntos } = discrepancia;
  const donde =
    adjuntos.length === 0
      ? "sin adjuntos"
      : adjuntos.length === 1
        ? `en el adjunto ${adjuntos[0]}`
        : `en los adjuntos ${adjuntos.join(", ")}`;
  return `${discrepancia.regla} ${donde}`;
}

/**
 * El resumen que recibe el analista, en texto fijo (sin depender del color). Muestra lo que el core
 * guardó, nunca el texto de los archivos ni los fragmentos de procedencia. Solo se imprime con `--demo`:
 * es para el analista, no para el solicitante.
 */
export function formatearHandoff(handoff: ResumenAnalista, color: boolean): string {
  const { solicitante, solicitud, causasAdicionales, discrepancias, datosExtraidos } = handoff;
  const codigo = handoff.codigo === undefined ? "" : ` (${handoff.codigo})`;
  const documentos =
    datosExtraidos.length === 0
      ? "ninguno"
      : `${datosExtraidos.length} ${datosExtraidos.length === 1 ? "documento" : "documentos"}`;
  const lineas = [
    pintar("bold", `══ Resumen para el analista · ${handoff.idEscalamiento} ══`, color),
    `Causa: ${handoff.causa} · Motivo: ${handoff.motivo}${codigo} · Regla: ${handoff.regla}`,
    `Acción recomendada: ${handoff.accionRecomendada}`,
    ...(causasAdicionales.length > 0
      ? [
          `Causas adicionales: ${causasAdicionales
            .map((c) => `${c.causa} (${c.motivo}${c.codigo === undefined ? "" : ` · ${c.codigo}`})`)
            .join(", ")}`,
        ]
      : []),
    solicitante.identificado
      ? `Solicitante: ${solicitante.nombre} · documento ${solicitante.documentoEnmascarado}`
      : "Solicitante: sin identificar",
    `Solicitud: ${solicitud === null ? "sin registrar" : `${solicitud.idSolicitud} (${solicitud.estado})`} · ${
      handoff.monto === null ? "monto pendiente" : `monto ${pesos(handoff.monto.valor)}`
    } · ${handoff.plazoMeses === null ? "plazo pendiente" : `plazo ${handoff.plazoMeses.valor} meses`}`,
    `Ingreso: declarado ${pesos(handoff.ingresoDeclarado?.valor ?? null)} · verificado ${pesos(
      handoff.verificacionIngreso?.ingresoVerificado?.monto ?? null,
    )}`,
    `Discrepancias: ${discrepancias.length === 0 ? "ninguna" : discrepancias.map(describirDiscrepancia).join("; ")}`,
    `Datos extraídos: ${documentos}`,
    ...(handoff.decision === null
      ? []
      : [`Decisión: ${handoff.decision.motivo} · ${formatearValores(handoff.decision.valores)}`]),
    `Pendientes: ${handoff.pendientes.length === 0 ? "ninguno" : handoff.pendientes.join(", ")}`,
  ];
  return lineas.join("\n");
}

/** Cuando el resumen no llegó al analista, en lugar del resumen (#15, R7). */
export const formatearEntregaPendiente = (color: boolean): string =>
  pintar(["bold", "yellow"], "Entrega al analista: pendiente", color);
