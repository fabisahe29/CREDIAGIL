// Adaptador MCP en el mismo proceso del agente (research.md, R2; contracts/agente.md).
// El Agent SDK ejecuta el ciclo de herramientas sin devolvernos el control: el manejador de cada
// herramienta es el único punto determinista para llamar al core, reintentar y escalar.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
  aResultadoMcp,
  exito,
  fallo,
  transitorioAgotado,
  type Categoria,
  type Respuesta,
} from "../compartido/errores.ts";
import { validarEvento, type DatosEvento, type EventoNegocio } from "../compartido/eventos.ts";
import { registrar } from "../compartido/logs.ts";
import type { ClienteCore, CriterioBusqueda } from "./cliente-core.ts";
import { conReintentos } from "./reintentos.ts";
import { MAX_INTENTOS_VERIFICACION } from "../politica/politica.ts";

export const CLAVE_SERVIDOR = "originacion";

export interface SenalEscalamiento {
  motivo:
    | "falla_transitoria_persistente"
    | "falla_del_agente"
    | "limite_de_turnos"
    | "respuesta_incompleta"
    | "identidad_ambigua"
    | "identidad_no_verificable"
    | "pide_persona"
    | "caso_no_cubierto";
  regla: string;
  resultado: "escalada";
  correlationId: string;
  ts: string;
  herramienta?: string;
  intentos?: number;
  ultimoError?: string;
  /** Número de coincidencias de la búsqueda ambigua (motivo identidad_ambigua). */
  coincidencias?: number;
  /** Causa de un caso no cubierto (motivo caso_no_cubierto). */
  causa?: CausaNoCubierto;
}

export const CAUSAS_NO_CUBIERTO = ["moneda_extranjera", "documento_no_soportado", "otro"] as const;
export type CausaNoCubierto = (typeof CAUSAS_NO_CUBIERTO)[number];

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
  /** Búsquedas con varias coincidencias; la segunda escala (specs/007-verificacion-identidad, R6). */
  busquedasAmbiguas: number;
  /** Si ya contó una búsqueda ambigua en este turno: dentro de un turno cuenta una sola. */
  ambiguaEnTurno: boolean;
  /** Ya hubo una búsqueda con una sola coincidencia en la conversación: no se vuelve a pedir el documento. */
  desambiguada: boolean;
  /** Coincidencias de la última búsqueda ambigua contada, para el escalamiento. */
  coincidenciasAmbiguas: number;
}

export const crearEstado = (correlationId: string): EstadoConversacion => ({
  correlationId,
  escalamiento: null,
  eventos: [],
  busquedasAmbiguas: 0,
  ambiguaEnTurno: false,
  desambiguada: false,
  coincidenciasAmbiguas: 0,
});

export const REGLA_AMBIGUA = "Regla 1 · coincidencias sin desambiguar";

/**
 * Al cerrar el turno se decide el escalamiento por identidad ambigua (FR-006): escala si la
 * ambigüedad sigue tras pedir el documento en un turno anterior. Decidirlo al final del turno, y no
 * en la llamada, hace que el resultado no dependa del orden en que el modelo llama a las
 * herramientas: una búsqueda por documento en el mismo turno desambigua (revisión de dea0951).
 */
export function cerrarTurnoIdentidad(estado: EstadoConversacion): void {
  if (estado.busquedasAmbiguas < 2) return;
  dejarSenal(estado, {
    motivo: "identidad_ambigua",
    regla: REGLA_AMBIGUA,
    herramienta: "buscar_solicitante",
    coincidencias: estado.coincidenciasAmbiguas,
  });
}

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
  /** Genera la clave de idempotencia de cada intento de verificación; inyectable en las pruebas. */
  generarIdIntento?: () => string;
}

const esquemaConsultar = {
  idSolicitud: z
    .string()
    .describe(
      "Identificador de la solicitud: SOL- seguido de 10 dígitos, por ejemplo SOL-0001000001.",
    ),
};

const esquemaBuscar = {
  documento: z
    .string()
    .optional()
    .describe(
      "Número de documento de identidad del solicitante, con o sin puntos. Usa documento o nombre, no ambos.",
    ),
  nombre: z
    .string()
    .optional()
    .describe("Nombre completo del solicitante. Usa documento o nombre, no ambos."),
};

const DESCRIPCION_BUSCAR =
  "Busca solicitantes en el core de Crediágil por número de documento o por nombre completo (uno de los dos). Puede devolver cero, una o varias coincidencias; no elijas entre varias, pide el número de documento.";

const esquemaVerificar = {
  idSolicitante: z
    .string()
    .describe("Identificador del solicitante que devolvió buscar_solicitante (CLI-…)."),
  fechaExpedicion: z
    .string()
    .describe("Fecha de expedición del documento de identidad que da el solicitante, AAAA-MM-DD."),
};

const DESCRIPCION_VERIFICAR = `Verifica la identidad de un solicitante encontrado con la fecha de expedición de su documento (AAAA-MM-DD). Si el dato no coincide, informa sin revelar el dato correcto. Tras ${MAX_INTENTOS_VERIFICACION} intentos fallidos la verificación queda bloqueada.`;

export const REGLA_NO_VERIFICABLE = `Regla 1 · ${MAX_INTENTOS_VERIFICACION} intentos fallidos de verificación`;

/**
 * Reglas 4 y 5 (orden 4 → 5 → 1): el modelo solo clasifica el caso con un motivo tipado
 * (Principio III: comprender y extraer); el escalamiento lo ejecuta el código.
 */
const esquemaSolicitarAnalista = {
  motivo: z
    .enum(["pide_persona", "caso_no_cubierto"])
    .describe(
      "pide_persona: el solicitante pide hablar con una persona. caso_no_cubierto: la política no cubre el caso.",
    ),
  causa: z
    .enum(CAUSAS_NO_CUBIERTO)
    .optional()
    .describe("Solo con caso_no_cubierto: por qué no está cubierto."),
};

const DESCRIPCION_SOLICITAR_ANALISTA =
  "Pasa el caso a un analista de crédito. Úsala antes que cualquier otra herramienta si el solicitante pide hablar con una persona, o si su caso no está cubierto por la política (ingresos en moneda extranjera, documento no soportado). No pide ni envía datos del solicitante.";

export const REGLA_PIDE_PERSONA = "Regla 4 · el solicitante pide hablar con una persona";
export const REGLA_NO_CUBIERTO = "Regla 5 · caso no cubierto por la política";

const dormirDeVerdad = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/**
 * Deja la señal de escalamiento si no hay otra: la primera señal prevalece. La usan el adaptador y
 * el control de identidad; el escalamiento lo decide el código, nunca el modelo.
 */
export function dejarSenal(
  estado: EstadoConversacion,
  campos: Pick<SenalEscalamiento, "motivo" | "regla" | "herramienta"> & Partial<SenalEscalamiento>,
): void {
  if (estado.escalamiento !== null) return;
  estado.escalamiento = {
    resultado: "escalada",
    correlationId: estado.correlationId,
    ts: new Date().toISOString(),
    ...campos,
  };
  registrar("escalamiento", { ...estado.escalamiento });
}

export function crearAdaptador({
  core,
  estado,
  dormir = dormirDeVerdad,
  azar = Math.random,
  alUsarHerramienta,
  generarIdIntento = randomUUID,
}: OpcionesAdaptador) {
  const senal = (campos: Parameters<typeof dejarSenal>[1]) => dejarSenal(estado, campos);
  /**
   * Clave de idempotencia por dato dentro del turno. El adaptador vive todo el turno, incluido el
   * reintento del modelo: el mismo dato repetido conserva su clave y el core no cuenta dos fallos.
   */
  const clavesPorDato = new Map<string, string>();

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
    if (resultado.agotado) {
      senal({
        motivo: "falla_transitoria_persistente",
        regla: "constitución, Principio VI · reintentos agotados",
        herramienta,
        intentos: resultado.intentos,
        ultimoError: resultado.ultimoError ?? "desconocido",
      });
    }
    return resultado.respuesta;
  }

  async function consultar({ idSolicitud }: { idSolicitud: string }) {
    const respuesta = await llamarConReintentos("consultar_solicitud", () =>
      core.consultarSolicitud(idSolicitud, estado.correlationId),
    );
    return aResultadoMcp(respuesta);
  }

  async function buscar({ documento, nombre }: { documento?: string; nombre?: string }) {
    // El modelo puede omitir ambos o mandar los dos: la regla "exactamente uno" la aplica el core.
    const criterio = {
      ...(documento !== undefined ? { documento } : {}),
      ...(nombre !== undefined ? { nombre } : {}),
    } as CriterioBusqueda;
    const respuesta = await llamarConReintentos("buscar_solicitante", () =>
      core.buscarSolicitante(criterio, estado.correlationId),
    );
    if (respuesta.ok && respuesta.datos.coincidencias.length > 1 && !estado.desambiguada) {
      desambiguar(respuesta.datos.coincidencias.length);
    } else if (respuesta.ok && respuesta.datos.coincidencias.length === 1) {
      // Ya se desambiguó: el modelo repite la búsqueda en cada turno, también por nombre, y una
      // ambigua posterior no debe escalar ni volver a pedir el documento (FR-006).
      estado.busquedasAmbiguas = 0;
      estado.desambiguada = true;
    }
    return aResultadoMcp(respuesta);
  }

  /**
   * Homónimos: la primera vez se pide el número de documento; si la ambigüedad sigue en un turno
   * posterior, se escala al cerrar ese turno (cerrarTurnoIdentidad; FR-005, FR-006). Dentro de un
   * turno cuenta una sola búsqueda ambigua: el solicitante todavía no pudo responder. Lo decide el
   * código, nunca el modelo (R6).
   */
  function desambiguar(coincidencias: number): void {
    if (estado.ambiguaEnTurno) return;
    estado.ambiguaEnTurno = true;
    estado.busquedasAmbiguas++;
    estado.coincidenciasAmbiguas = coincidencias;
    if (estado.busquedasAmbiguas === 1) {
      emitirEvento(estado, {
        tipo: "solicitud_de_dato",
        descripcion:
          "Encontré varias personas con ese nombre. Necesito tu número de documento para continuar.",
        motivo: "varias_coincidencias",
        dato: "número de documento de identidad",
        regla: REGLA_AMBIGUA,
        valores: { coincidencias },
      });
    }
  }

  async function verificar({
    idSolicitante,
    fechaExpedicion,
  }: {
    idSolicitante: string;
    fechaExpedicion: string;
  }) {
    // Una clave por dato del turno: sus reintentos y su repetición (también si el modelo repite el
    // turno) la reusan y el core no cuenta dos veces (R4).
    const dato = JSON.stringify([idSolicitante, fechaExpedicion]);
    const idIntento = clavesPorDato.get(dato) ?? generarIdIntento();
    clavesPorDato.set(dato, idIntento);
    const respuesta = await llamarConReintentos("verificar_identidad", () =>
      core.verificarIdentidad(idSolicitante, fechaExpedicion, idIntento, estado.correlationId),
    );
    // Tres intentos fallidos: escala el código, no el modelo (FR-009; R6).
    if (!respuesta.ok && respuesta.error.codigo === "verificacion_bloqueada") {
      senal({
        motivo: "identidad_no_verificable",
        regla: REGLA_NO_VERIFICABLE,
        herramienta: "verificar_identidad",
      });
    }
    return aResultadoMcp(respuesta);
  }

  /** Reglas 4 y 5: escala por código, sin llamar al core ni pedir datos (FR-011b). */
  function solicitarAnalista({
    motivo,
    causa,
  }: {
    motivo: "pide_persona" | "caso_no_cubierto";
    causa?: CausaNoCubierto;
  }) {
    senal({
      motivo,
      regla: motivo === "pide_persona" ? REGLA_PIDE_PERSONA : REGLA_NO_CUBIERTO,
      herramienta: "solicitar_analista",
      ...(motivo === "caso_no_cubierto" && causa !== undefined ? { causa } : {}),
    });
    // No llama al core, pero el modo de demostración también la muestra.
    avisarObservador({ herramienta: "solicitar_analista", intento: 1, resultado: "ok" });
    return aResultadoMcp(exito({ escalada: true }));
  }

  const herramientas = {
    consultar_solicitud: { esquema: esquemaConsultar, manejar: consultar },
    buscar_solicitante: { esquema: esquemaBuscar, manejar: buscar },
    verificar_identidad: { esquema: esquemaVerificar, manejar: verificar },
    solicitar_analista: { esquema: esquemaSolicitarAnalista, manejar: solicitarAnalista },
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
      tool(
        "buscar_solicitante",
        DESCRIPCION_BUSCAR,
        esquemaBuscar,
        (argumentos) => buscar(argumentos),
        {
          annotations: { readOnlyHint: true },
        },
      ),
      tool("verificar_identidad", DESCRIPCION_VERIFICAR, esquemaVerificar, (argumentos) =>
        verificar(argumentos),
      ),
      tool(
        "solicitar_analista",
        DESCRIPCION_SOLICITAR_ANALISTA,
        esquemaSolicitarAnalista,
        (argumentos) => Promise.resolve(solicitarAnalista(argumentos)),
      ),
    ],
  });

  return { servidor, herramientas, estado };
}
