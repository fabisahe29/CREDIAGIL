// Adaptador MCP en el mismo proceso del agente (research.md, R2; contracts/agente.md).
// El Agent SDK ejecuta el ciclo de herramientas sin devolvernos el control: el manejador de cada
// herramienta es el único punto determinista para llamar al core, reintentar y escalar.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import {
  aResultadoMcp,
  errorValidacion,
  exito,
  fallo,
  transitorioAgotado,
  type Categoria,
  type Respuesta,
} from "../compartido/errores.ts";
import { validarEvento, type DatosEvento, type EventoNegocio } from "../compartido/eventos.ts";
import {
  construirResultado,
  huella,
  NOMBRE_TEXTO_PEGADO,
  type DocumentoConContenido,
  type ErrorExtraccion,
  type RegistroExtraccion,
  type ResultadoExtraccion,
} from "../compartido/extraccion.ts";
import { registrar } from "../compartido/logs.ts";
import type { DocumentoConversacion } from "./agente.ts";
import type { ClienteCore, CriterioBusqueda } from "./cliente-core.ts";
import {
  crearClasificador,
  crearSubagente,
  errorDeInconsistencia,
  extraerConIntentos,
  type ClasificarDocumento,
  type EjecutarSubagente,
} from "./extraccion.ts";
import { conReintentos } from "./reintentos.ts";
import { MAX_INTENTOS_EXTRACCION, MAX_INTENTOS_VERIFICACION } from "../politica/politica.ts";
import {
  evaluarDocumento,
  evaluarRegla5Previa,
  REGLA_5,
  REGLA_PRINCIPIO_V,
} from "../politica/documentos.ts";
import { REGLA_3 } from "../politica/ingreso.ts";
import type { VerificacionIngreso } from "../compartido/ingreso.ts";

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
    | "caso_no_cubierto"
    | "documento_no_extraible"
    | "discrepancia_de_ingreso"
    | "inconsistencia_documental";
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
  /** Documento que llevó al escalamiento (#10: no cubierto o no extraíble). */
  adjunto?: number;
  /** Ingreso declarado, verificado y umbral de una discrepancia (#11, motivo discrepancia_de_ingreso). */
  ingresoDeclarado?: number;
  ingresoVerificado?: number;
  umbralPorcentaje?: number;
  /** Reglas de consistencia que detienen (#11, motivo inconsistencia_documental), separadas por coma. */
  reglas?: string;
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
export const REGLA_5_DOCUMENTOS = "revision_documentos";

/** Espera base entre intentos del clasificador previo, con la variación de los reintentos del #7. */
const ESPERA_CLASIFICACION_MS = 500;
const VARIACION_ESPERA = 0.2;

/**
 * Al cerrar el turno, la Regla 5 sobre los documentos de la conversación, sin modelo: un archivo no
 * soportado o una moneda extranjera en cualquier parte escalan, aunque el modelo no haya hecho nada
 * (revisión de 0aa8c2a). Va después de la Regla 4, que el modelo resuelve durante el turno, y antes
 * que el cierre por identidad (orden 4 → 5 → 1). La primera señal prevalece.
 */
export function cerrarTurnoDocumentos(
  estado: EstadoConversacion,
  documentos: readonly DocumentoConversacion[],
): void {
  for (const documento of documentos) {
    const decision = evaluarRegla5Previa(documento);
    if (decision === null) continue;
    dejarSenal(estado, {
      motivo: "caso_no_cubierto",
      regla: REGLA_NO_CUBIERTO,
      herramienta: REGLA_5_DOCUMENTOS,
      causa: decision.causa ?? "documento_no_soportado",
      adjunto: documento.adjunto,
    });
    return;
  }
}

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
  /** Documentos de la conversación, numerados por el chat (#10, R2). */
  documentos?: readonly DocumentoConversacion[];
  /** Subagente de extracción; por defecto el real (#10, R1). */
  ejecutarSubagente?: EjecutarSubagente;
  /** Clasificador previo del tipo de documento, para la Regla 5 antes de la identidad. */
  clasificarDocumento?: ClasificarDocumento;
  /** "Hoy" para validar fechas extraídas; inyectable en las pruebas. */
  hoy?: () => Date;
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
export const REGLA_NO_CUBIERTO = REGLA_5;
export const REGLA_NO_EXTRAIBLE = `${REGLA_PRINCIPIO_V} · documento no extraíble`;

const esquemaExtraer = {
  adjunto: z
    .number()
    .int()
    .min(1)
    .describe(
      'Número de adjunto del documento: el atributo adjunto de <documento adjunto="N"> o el numero de <adjunto_registrado numero="N"/>.',
    ),
};

const DESCRIPCION_EXTRAER =
  "Extrae los datos de un certificado laboral o de un extracto bancario que entregó el solicitante, por su número de adjunto. Devuelve cada dato con el fragmento del documento del que salió. Si falta un dato, no lo pidas tú: la herramienta ya lo pidió. Exige la identidad verificada.";

const esquemaVerificarIngreso = {
  ingresoDeclarado: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Lo que el solicitante dijo ganar al mes, como un entero de pesos. Omítelo si no lo dijo: no lo inventes ni lo calcules.",
    ),
};

const DESCRIPCION_VERIFICAR_INGRESO =
  "Verifica el ingreso mensual del solicitante con sus documentos y lo compara con lo que declaró. Devuelve el ingreso verificado o lo que falta. No calcules ni compares ingresos por tu cuenta. Exige la identidad verificada.";

const DESCRIPCION_CONSULTAR_EXTRACCIONES =
  "Devuelve los datos ya extraídos de los documentos de esta conversación, con su procedencia. Úsala para recordar datos de turnos anteriores; no vuelve a extraer.";

/** Cómo se nombra cada campo al pedírselo al solicitante. */
const NOMBRES_CAMPO: Readonly<Record<string, string>> = {
  empleador: "el empleador",
  cargo: "el cargo",
  fechaIngreso: "la fecha de ingreso",
  salario: "el salario",
  moneda: "la moneda",
  titular: "el titular",
  periodo: "el periodo",
};

const enumerar = (elementos: readonly string[]) =>
  elementos.length <= 1
    ? elementos.join("")
    : `${elementos.slice(0, -1).join(", ")} y ${elementos.at(-1)}`;

const describirErrores = (errores: readonly ErrorExtraccion[]) =>
  errores.map((e) => `${e.campo}: ${e.motivo}`).join("; ");

/** El registro del core sin sus campos propios: el resultado para volver a registrarlo. */
function resultadoDeRegistro(registro: RegistroExtraccion): ResultadoExtraccion {
  const {
    adjuntos: _adjuntos,
    registradoEn: _registradoEn,
    reextraidaPor: _reextraidaPor,
    ...resultado
  } = registro;
  return resultado;
}

const dormirDeVerdad = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** Regla de negocio de cada motivo de escalamiento; los técnicos no tienen. */
export const ORDEN_REGLA: Partial<Record<SenalEscalamiento["motivo"], 1 | 3 | 4 | 5>> = {
  pide_persona: 4,
  caso_no_cubierto: 5,
  identidad_ambigua: 1,
  identidad_no_verificable: 1,
  discrepancia_de_ingreso: 3,
  inconsistencia_documental: 3,
};

/** Orden de evaluación obligatorio (constitución, Principio I); la Regla 2 llega con el #14. */
const ORDEN_EVALUACION = [4, 5, 1, 3, 2];

/**
 * Orden de evaluación 4 → 5 → 1 → 3 → 2 (constitución, Principio I): una señal de una regla anterior
 * reemplaza a una de una posterior (revisión de 5d28165; #11 agrega la Regla 3). Una señal técnica ni
 * reemplaza ni se reemplaza: la primera prevalece, y entre dos de la misma regla también.
 */
function prevalece(
  nueva: SenalEscalamiento["motivo"],
  actual: SenalEscalamiento["motivo"],
): boolean {
  const orden = ORDEN_EVALUACION;
  const n = ORDEN_REGLA[nueva];
  const a = ORDEN_REGLA[actual];
  return n !== undefined && a !== undefined && orden.indexOf(n) < orden.indexOf(a);
}

/**
 * Deja la señal de escalamiento. Si ya hay una, solo la reemplaza una de una regla anterior en el
 * orden 4 → 5 → 1 (`prevalece`); si no, la primera prevalece. La usan el adaptador y el control de
 * identidad; el escalamiento lo decide el código, nunca el modelo.
 */
export function dejarSenal(
  estado: EstadoConversacion,
  campos: Pick<SenalEscalamiento, "motivo" | "regla" | "herramienta"> & Partial<SenalEscalamiento>,
): void {
  const anterior = estado.escalamiento;
  if (anterior !== null && !prevalece(campos.motivo, anterior.motivo)) return;
  estado.escalamiento = {
    resultado: "escalada",
    correlationId: estado.correlationId,
    ts: new Date().toISOString(),
    ...campos,
  };
  registrar("escalamiento", {
    ...estado.escalamiento,
    ...(anterior !== null ? { reemplaza: anterior.motivo } : {}),
  });
}

export function crearAdaptador({
  core,
  estado,
  dormir = dormirDeVerdad,
  azar = Math.random,
  alUsarHerramienta,
  generarIdIntento = randomUUID,
  documentos = [],
  ejecutarSubagente = crearSubagente(),
  clasificarDocumento = crearClasificador(),
  hoy = () => new Date(),
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

  /** Regla 5: el caso no está cubierto; escala el código, nunca el modelo. */
  function escalarRegla5(adjunto: number, causa: CausaNoCubierto, herramienta: string): void {
    senal({ motivo: "caso_no_cubierto", regla: REGLA_NO_CUBIERTO, herramienta, causa, adjunto });
  }

  /** Documentos que ya pasaron por la Regla 5 en este turno: al cerrar el turno no se repiten. */
  const revisadosEnTurno = new Set<number>();

  /**
   * El tipo del documento con el clasificador, con reintentos acotados y espera creciente
   * (Principio VI). `null` si no respondió en ningún intento.
   */
  async function clasificarConReintentos(documento: DocumentoConContenido): Promise<string | null> {
    for (let intento = 1; intento <= MAX_INTENTOS_EXTRACCION; intento++) {
      const respuesta = await clasificarDocumento({
        documento,
        correlationId: estado.correlationId,
      });
      registrar("clasificacion_previa", {
        correlationId: estado.correlationId,
        adjunto: documento.adjunto,
        intento,
        resultado: respuesta.ok ? respuesta.tipo : respuesta.causa,
      });
      if (respuesta.ok) return respuesta.tipo;
      if (intento < MAX_INTENTOS_EXTRACCION) {
        await dormir(ESPERA_CLASIFICACION_MS * intento * (1 + (azar() * 2 - 1) * VARIACION_ESPERA));
      }
    }
    return null;
  }

  /**
   * La Regla 5 sobre un documento, decidida por código: primero la revisión sin modelo (formato y
   * moneda) y luego el tipo con el clasificador, que no extrae datos personales. Un texto pegado que
   * no es un documento es conversación, no un caso no cubierto. Si el clasificador no responde tras
   * los reintentos, escala por falla transitoria: nunca se decide sin respuesta (revisión de 5d28165).
   * Devuelve `true` si escaló.
   */
  async function aplicarRegla5(
    documento: DocumentoConversacion,
    herramienta: string,
  ): Promise<boolean> {
    revisadosEnTurno.add(documento.adjunto);
    const previa = evaluarRegla5Previa(documento);
    if (previa !== null || !documento.soportado) {
      escalarRegla5(documento.adjunto, previa?.causa ?? "documento_no_soportado", herramienta);
      return true;
    }
    const tipo = await clasificarConReintentos({
      adjunto: documento.adjunto,
      nombre: documento.nombre,
      contenido: documento.contenido,
    });
    if (tipo === null) {
      senal({
        motivo: "falla_transitoria_persistente",
        regla: "constitución, Principio VI · reintentos agotados",
        herramienta: "clasificar_documento",
        intentos: MAX_INTENTOS_EXTRACCION,
        ultimoError: "el clasificador no respondió",
        adjunto: documento.adjunto,
      });
      return true;
    }
    if (tipo === "no_es_documento" && documento.nombre === NOMBRE_TEXTO_PEGADO) return false;
    const decision = evaluarDocumento({
      tipo,
      fragmentoMoneda: null,
      monedaExtranjeraEnContenido: null,
      conflictos: [],
      faltantes: [],
      tieneMontos: false,
    });
    if (decision.resultado !== "no_cubierto") return false;
    escalarRegla5(documento.adjunto, decision.causa ?? "documento_no_soportado", herramienta);
    return true;
  }

  /**
   * Regla 5 antes que la Regla 1 (orden 4 → 5 → 1; revisión de 0aa8c2a). Si se intenta extraer sin
   * identidad, el control de identidad llama aquí antes de bloquear. Devuelve `true` si escaló. No
   * registra ni devuelve ningún dato del documento.
   */
  async function evaluarRegla5AntesDeIdentidad(adjunto: unknown): Promise<boolean> {
    const documento = documentos.find((d) => d.adjunto === adjunto);
    if (documento === undefined) return false;
    return aplicarRegla5(documento, "regla_5_previa");
  }

  /**
   * Al cerrar el turno, la Regla 5 sobre los documentos por código (revisión de 5d28165): la
   * revisión sin modelo de todos y el tipo de los nuevos (`adjunto > desde`) que no se revisaron en
   * el turno. Va después del turno del modelo, que resuelve la Regla 4, y su señal reemplaza a una de
   * la Regla 1 del mismo turno (orden 4 → 5 → 1). Devuelve cuántos documentos quedan revisados.
   */
  async function revisarRegla5AlCerrarTurno(desde: number): Promise<number> {
    const actual = estado.escalamiento;
    // Solo una señal de la Regla 1 o de la 3 (posteriores a la 5 en el orden) se deja reemplazar.
    const reglaActual = actual === null ? undefined : ORDEN_REGLA[actual.motivo];
    if (actual !== null && reglaActual !== 1 && reglaActual !== 3) return documentos.length;
    cerrarTurnoDocumentos(estado, documentos);
    if (estado.escalamiento !== null && estado.escalamiento !== actual) return documentos.length;
    for (const documento of documentos) {
      if (documento.adjunto <= desde || revisadosEnTurno.has(documento.adjunto)) continue;
      if (await aplicarRegla5(documento, REGLA_5_DOCUMENTOS)) break;
    }
    return documentos.length;
  }
  /** Eventos de ingreso ya emitidos en este turno: el modelo puede repetir la llamada (R8). */
  const eventosDeIngreso = new Set<string>();

  /** Nombres de las reglas de consistencia que detienen; nunca valores de documentos. */
  const reglasQueDetienen = (v: VerificacionIngreso): string[] => [
    ...new Set(v.inconsistencias.filter((i) => i.detiene).map((i) => i.regla)),
  ];

  /** Log de una verificación de ingreso (R9): estado y nombres de reglas, sin valores de documentos. */
  function registrarVerificacionLog(v: VerificacionIngreso, reextracciones = 0): void {
    registrar("verificacion_ingreso", {
      correlationId: estado.correlationId,
      estado: v.estado,
      origen: v.ingreso?.origen ?? null,
      inconsistencias: [...new Set(v.inconsistencias.map((i) => i.regla))],
      declarado: v.ingresoDeclarado !== null,
      reextracciones,
    });
  }

  /** Pide al solicitante lo que falta, una sola vez por turno. */
  function pedirDeIngreso(
    motivo: "ingreso_declarado_faltante" | "ingreso_no_verificable",
    descripcion: string,
    dato: string,
  ): void {
    if (eventosDeIngreso.has(motivo)) return;
    eventosDeIngreso.add(motivo);
    emitirEvento(estado, { tipo: "solicitud_de_dato", descripcion, motivo, dato, regla: REGLA_3 });
  }

  /** Escala por una inconsistencia que detiene (Regla 3); lo decide el código, nunca el modelo. */
  function escalarInconsistencia(v: VerificacionIngreso, herramienta: string): void {
    senal({
      motivo: "inconsistencia_documental",
      regla: REGLA_3,
      herramienta,
      reglas: reglasQueDetienen(v).join(", "),
    });
  }

  /**
   * Efectos de una verificación de ingreso, decididos por código (R5, R8). Devuelve lo mínimo que
   * necesita el modelo para responder: nunca las inconsistencias, la diferencia ni valores de
   * documentos.
   */
  function aplicarVerificacion(v: VerificacionIngreso, herramienta: string) {
    switch (v.estado) {
      case "verificado":
        return { estado: v.estado, ingresoVerificado: v.ingreso?.monto, origen: v.ingreso?.origen };
      case "falta_declarado":
        pedirDeIngreso(
          "ingreso_declarado_faltante",
          "Para comparar con tus documentos necesito saber cuánto ganas al mes. Indícame tu ingreso mensual.",
          "ingreso mensual declarado",
        );
        return { estado: v.estado, faltaDeclarado: true };
      case "sin_ingreso":
        pedirDeIngreso(
          "ingreso_no_verificable",
          "Con los documentos que tengo no puedo verificar tu ingreso. Envíame un certificado laboral con tu salario o tus extractos bancarios recientes con el abono de tu nómina.",
          "certificado laboral con salario o extractos con abonos de nómina",
        );
        return { estado: v.estado, faltanDocumentos: true };
      case "discrepancia":
        senal({
          motivo: "discrepancia_de_ingreso",
          regla: REGLA_3,
          herramienta,
          ...(v.ingresoDeclarado !== null ? { ingresoDeclarado: v.ingresoDeclarado } : {}),
          ...(v.ingreso !== null ? { ingresoVerificado: v.ingreso.monto } : {}),
          ...(v.discrepancia !== null ? { umbralPorcentaje: v.discrepancia.umbralPorcentaje } : {}),
        });
        return { escalada: true, estado: v.estado };
      case "inconsistencia":
        escalarInconsistencia(v, herramienta);
        return { escalada: true, estado: v.estado };
      case "no_cubierto": {
        // El documento ya escaló en la extracción; si no hubiera señal, se deja la de la Regla 5.
        const causa = v.decision.valores["causa"];
        const adjunto = v.decision.valores["adjunto"];
        senal({
          motivo: "caso_no_cubierto",
          regla: REGLA_NO_CUBIERTO,
          herramienta,
          causa: CAUSAS_NO_CUBIERTO.find((c) => c === causa) ?? "otro",
          ...(typeof adjunto === "number" ? { adjunto } : {}),
        });
        return { escalada: true, estado: v.estado };
      }
    }
  }

  /** Herramienta del modelo: verifica el ingreso con lo que el core ya guardó (R8). */
  async function verificarIngreso({ ingresoDeclarado }: { ingresoDeclarado?: number }) {
    const respuesta = await llamarConReintentos("verificar_ingreso", () =>
      core.verificarIngreso(
        ingresoDeclarado === undefined ? {} : { ingresoDeclarado },
        estado.correlationId,
      ),
    );
    if (!respuesta.ok) return aResultadoMcp(respuesta);
    const verificacion = respuesta.datos.verificacion;
    registrarVerificacionLog(verificacion);
    return aResultadoMcp(exito(aplicarVerificacion(verificacion, "verificar_ingreso")));
  }

  /** Log de una extracción (R10): metadatos, nunca el contenido ni los fragmentos (FR-017). */
  function registrarExtraccionLog(campos: Record<string, unknown>): void {
    registrar("extraccion", { correlationId: estado.correlationId, ...campos });
  }

  /**
   * Faltantes: un solo evento por documento, que pide un documento nuevo, nunca que el solicitante
   * escriba el dato (aclaración Q2 del #10; Regla 3). Lo emite el código, no el modelo.
   */
  function pedirFaltantes(adjunto: number, nombre: string, faltantes: readonly string[]): void {
    const lista = enumerar(faltantes.map((campo) => NOMBRES_CAMPO[campo] ?? campo));
    emitirEvento(estado, {
      tipo: "solicitud_de_dato",
      descripcion: `Al documento que enviaste (adjunto ${adjunto} · ${nombre}) le falta ${lista}. Envíame un documento que lo indique, por ejemplo un certificado laboral o un extracto bancario actualizado.`,
      motivo: "dato_faltante_en_documento",
      dato: faltantes.join(", "),
      regla: REGLA_PRINCIPIO_V,
      valores: { adjunto, documento: nombre, faltantes: faltantes.join(", ") },
    });
  }

  /** Efectos de un resultado registrado, decididos por código (R7). */
  function aplicarEfectos(registro: RegistroExtraccion, adjunto: number, nombre: string): void {
    if (registro.estado === "extraido") {
      if (registro.faltantes.length > 0) pedirFaltantes(adjunto, nombre, registro.faltantes);
    } else if (registro.estado === "no_cubierto") {
      senal({
        motivo: "caso_no_cubierto",
        regla: REGLA_NO_CUBIERTO,
        herramienta: "extraer_documento",
        causa: registro.causa,
        adjunto,
      });
    } else {
      senal({
        motivo: "documento_no_extraible",
        regla: REGLA_NO_EXTRAIBLE,
        herramienta: "extraer_documento",
        adjunto,
        ultimoError:
          registro.conflictos.length > 0
            ? `conflictos: ${registro.conflictos.join(", ")}`
            : describirErrores(registro.ultimoError),
      });
    }
  }

  /** Pares (adjunto, regla) ya reextraídos: una sola ronda por par (R6). */
  const reextraidos = new Set<string>();

  /**
   * Una ronda de reextracción por cada inconsistencia corregible y cada documento que involucra (R6):
   * el subagente relee el documento con la regla que falló y el valor que extrajo, nunca el valor
   * esperado. Si no responde o el core no acepta el reemplazo, se conserva el registro anterior y la
   * inconsistencia vigente decide. Devuelve cuántos registros se reemplazaron.
   */
  async function reextraerInconsistencias(v: VerificacionIngreso): Promise<number> {
    let reemplazados = 0;
    for (const inconsistencia of v.inconsistencias) {
      if (!inconsistencia.corregible) continue;
      for (const adjunto of inconsistencia.adjuntos) {
        const clave = `${adjunto}|${inconsistencia.regla}`;
        const documento = documentos.find((d) => d.adjunto === adjunto);
        if (documento?.soportado !== true || reextraidos.has(clave)) continue;
        reextraidos.add(clave);
        const conContenido = { adjunto, nombre: documento.nombre, contenido: documento.contenido };
        const intentos = await extraerConIntentos({
          documento: conContenido,
          ejecutarSubagente,
          correlationId: estado.correlationId,
          hoy: hoy(),
          erroresIniciales: [errorDeInconsistencia(inconsistencia, adjunto)],
          alIntentar: (info) => {
            registrar("intento_extraccion", {
              correlationId: estado.correlationId,
              adjunto,
              reextraccion: inconsistencia.regla,
              ...info,
            });
            avisarObservador({
              herramienta: "extraer_documento",
              intento: info.numero,
              resultado: info.resultado,
            });
          },
        });
        if (intentos.tipo !== "valida") continue;
        const registro = await llamarConReintentos("registrar_extraccion", () =>
          core.registrarExtraccion(
            {
              ...conContenido,
              resultado: construirResultado(intentos.salida, conContenido, intentos.intentos),
              reextraccion: { regla: inconsistencia.regla },
            },
            estado.correlationId,
          ),
        );
        if (!registro.ok) continue;
        reemplazados++;
        // Un reemplazo que ya no está cubierto por la política escala por la Regla 5.
        if (registro.datos.extraccion.estado !== "extraido") {
          aplicarEfectos(registro.datos.extraccion, adjunto, documento.nombre);
        }
      }
    }
    return reemplazados;
  }

  /** Extrae con el subagente, o reutiliza una extracción previa del mismo contenido (FR-018). */
  async function obtenerResultado(
    documento: { adjunto: number; nombre: string; contenido: string },
    previa: RegistroExtraccion | undefined,
  ): Promise<{ resultado: ResultadoExtraccion } | { sinRespuesta: string; intentos: number }> {
    if (previa !== undefined) return { resultado: resultadoDeRegistro(previa) };
    const intentos = await extraerConIntentos({
      documento,
      ejecutarSubagente,
      correlationId: estado.correlationId,
      hoy: hoy(),
      alIntentar: (info) => {
        registrar("intento_extraccion", {
          correlationId: estado.correlationId,
          adjunto: documento.adjunto,
          ...info,
        });
        avisarObservador({
          herramienta: "extraer_documento",
          intento: info.numero,
          resultado: info.resultado,
        });
      },
    });
    if (intentos.tipo === "sin_respuesta") {
      return { sinRespuesta: intentos.causa, intentos: intentos.intentos };
    }
    if (intentos.tipo === "valida") {
      return { resultado: construirResultado(intentos.salida, documento, intentos.intentos) };
    }
    return {
      resultado: {
        estado: "no_extraible",
        adjunto: documento.adjunto,
        nombre: documento.nombre,
        huella: huella(documento.contenido),
        intentos: intentos.intentos,
        conflictos: [],
        ultimoError: intentos.errores,
      },
    };
  }

  /**
   * Extracción de un documento por su número (R7). El modelo solo da el número: el texto sale de los
   * documentos de la conversación. La Regla 1 la aplica antes el control de identidad, y el core
   * otra vez al registrar.
   */
  async function extraer({ adjunto }: { adjunto: number }) {
    const documento = documentos.find((d) => d.adjunto === adjunto);
    if (documento !== undefined) revisadosEnTurno.add(adjunto);
    if (documento === undefined) {
      return aResultadoMcp(
        fallo(
          errorValidacion(
            "adjunto_inexistente",
            `No hay un documento con el número de adjunto ${adjunto} en la conversación.`,
            "adjunto",
          ),
        ),
      );
    }
    // Regla 5 sin modelo: un archivo no soportado o una moneda extranjera en cualquier parte del
    // documento escalan antes de extraer nada (FR-016; revisión de 0aa8c2a).
    const regla5 = evaluarRegla5Previa(documento);
    if (regla5 !== null || !documento.soportado) {
      const causa = regla5?.causa ?? "documento_no_soportado";
      escalarRegla5(adjunto, causa, "extraer_documento");
      registrarExtraccionLog({
        adjunto,
        nombre: documento.nombre,
        estado: "no_cubierto",
        causa,
        intentos: 0,
      });
      return aResultadoMcp(exito({ escalada: true, causa }));
    }

    const conContenido = { adjunto, nombre: documento.nombre, contenido: documento.contenido };
    const huellaDocumento = huella(documento.contenido);
    const previas = await llamarConReintentos("consultar_extracciones", () =>
      core.consultarExtracciones(estado.correlationId),
    );
    if (!previas.ok) return aResultadoMcp(previas);
    const previa = previas.datos.extracciones.find((e) => e.huella === huellaDocumento);

    const obtenido = await obtenerResultado(conContenido, previa);
    if ("sinRespuesta" in obtenido) {
      // Nunca se usa un resultado parcial: sin respuesta del subagente se escala (Principio VI).
      senal({
        motivo: "falla_transitoria_persistente",
        regla: "constitución, Principio VI · reintentos agotados",
        herramienta: "extraer_documento",
        intentos: obtenido.intentos,
        ultimoError: obtenido.sinRespuesta,
        adjunto,
      });
      registrarExtraccionLog({
        adjunto,
        nombre: documento.nombre,
        huella: huellaDocumento.slice(0, 12),
        estado: "sin_respuesta",
        intentos: obtenido.intentos,
      });
      return aResultadoMcp(fallo(transitorioAgotado()));
    }

    const registro = await llamarConReintentos("registrar_extraccion", () =>
      core.registrarExtraccion(
        { ...conContenido, resultado: obtenido.resultado },
        estado.correlationId,
      ),
    );
    if (!registro.ok) {
      // El core no aceptó el resultado contra el documento: no se usa ningún dato (Principio V).
      if (registro.error.codigo === "extraccion_invalida") {
        senal({
          motivo: "documento_no_extraible",
          regla: REGLA_NO_EXTRAIBLE,
          herramienta: "registrar_extraccion",
          adjunto,
          ultimoError: registro.error.campo ?? registro.error.codigo,
        });
      }
      registrarExtraccionLog({
        adjunto,
        nombre: documento.nombre,
        estado: "rechazada",
        codigo: registro.error.codigo,
      });
      return aResultadoMcp(registro);
    }

    const guardado = registro.datos.extraccion;
    aplicarEfectos(guardado, adjunto, documento.nombre);
    registrarExtraccionLog({
      adjunto,
      nombre: documento.nombre,
      huella: guardado.huella.slice(0, 12),
      estado: guardado.estado,
      ...(guardado.estado === "extraido" ? { tipo: guardado.documento.tipo } : {}),
      ...(guardado.estado === "no_cubierto" ? { causa: guardado.causa } : {}),
      intentos: guardado.intentos,
      faltantes: guardado.estado === "extraido" ? guardado.faltantes : [],
      errores:
        guardado.estado === "no_extraible"
          ? guardado.ultimoError.map((e) => `${e.campo}: ${e.motivo}`)
          : [],
      reutilizada: previa !== undefined,
    });
    // Un documento extraído nuevo puede contradecir a los anteriores o al solicitante: el core lo
    // recalcula sin ingreso declarado y, si hay una inconsistencia que detiene, escala el código (US3).
    if (guardado.estado === "extraido" && previa === undefined) {
      const verificada = await llamarConReintentos("verificar_ingreso", () =>
        core.verificarIngreso({}, estado.correlationId),
      );
      if (!verificada.ok) return aResultadoMcp(verificada);
      let verificacion = verificada.datos.verificacion;
      let reextracciones = 0;
      if (verificacion.estado === "inconsistencia") {
        reextracciones = await reextraerInconsistencias(verificacion);
        if (reextracciones > 0) {
          const otra = await llamarConReintentos("verificar_ingreso", () =>
            core.verificarIngreso({}, estado.correlationId),
          );
          if (!otra.ok) return aResultadoMcp(otra);
          verificacion = otra.datos.verificacion;
        }
      }
      if (verificacion.estado === "inconsistencia") {
        registrarVerificacionLog(verificacion, reextracciones);
        escalarInconsistencia(verificacion, "extraer_documento");
        return aResultadoMcp(exito({ escalada: true, estado: verificacion.estado }));
      }
      if (reextracciones > 0) registrarVerificacionLog(verificacion, reextracciones);
    }
    // Solo un documento extraído devuelve datos al modelo; los demás ya escalaron.
    return guardado.estado === "extraido"
      ? aResultadoMcp(exito({ resultado: guardado }))
      : aResultadoMcp(
          exito({
            escalada: true,
            estado: guardado.estado,
            ...(guardado.estado === "no_cubierto" ? { causa: guardado.causa } : {}),
          }),
        );
  }

  async function consultarExtracciones(_entrada: Record<string, never>) {
    const respuesta = await llamarConReintentos("consultar_extracciones", () =>
      core.consultarExtracciones(estado.correlationId),
    );
    return aResultadoMcp(respuesta);
  }

  const herramientas = {
    consultar_solicitud: { esquema: esquemaConsultar, manejar: consultar },
    buscar_solicitante: { esquema: esquemaBuscar, manejar: buscar },
    verificar_identidad: { esquema: esquemaVerificar, manejar: verificar },
    solicitar_analista: { esquema: esquemaSolicitarAnalista, manejar: solicitarAnalista },
    extraer_documento: { esquema: esquemaExtraer, manejar: extraer },
    verificar_ingreso: { esquema: esquemaVerificarIngreso, manejar: verificarIngreso },
    consultar_extracciones: { esquema: {}, manejar: consultarExtracciones },
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
      tool("extraer_documento", DESCRIPCION_EXTRAER, esquemaExtraer, (argumentos) =>
        extraer(argumentos),
      ),
      tool(
        "verificar_ingreso",
        DESCRIPCION_VERIFICAR_INGRESO,
        esquemaVerificarIngreso,
        (argumentos) => verificarIngreso(argumentos),
      ),
      tool(
        "consultar_extracciones",
        DESCRIPCION_CONSULTAR_EXTRACCIONES,
        {},
        () => consultarExtracciones({}),
        { annotations: { readOnlyHint: true } },
      ),
    ],
  });

  return {
    servidor,
    herramientas,
    estado,
    evaluarRegla5AntesDeIdentidad,
    revisarRegla5AlCerrarTurno,
  };
}
