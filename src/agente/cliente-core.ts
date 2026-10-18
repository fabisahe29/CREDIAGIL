// Cliente MCP del servidor del core, usado por el adaptador del agente (research.md, R2;
// contracts/agente.md, "Adaptador en el mismo proceso"). Cada llamada tiene tiempo límite (FR-013)
// y su respuesta se valida contra el contrato: una respuesta fuera de contrato no se adivina (FR-009).

import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  errorTransitorio,
  esquemaRespuesta,
  fallo,
  fueraDeContrato,
  type Respuesta,
} from "../compartido/errores.ts";
import {
  esquemaCoincidencia,
  esquemaEstadoIdentidad,
  esquemaSolicitud,
  type Coincidencia,
} from "../mcp/core-simulado.ts";
import type { Solicitud } from "../mcp/datos-ejemplo.ts";
import type { EstadoIdentidad } from "../politica/identidad.ts";
import {
  esquemaRegistroExtraccion,
  type RegistroExtraccion,
  type ResultadoExtraccion,
} from "../compartido/extraccion.ts";
import { esquemaVerificacionIngreso, type VerificacionIngreso } from "../compartido/ingreso.ts";
import {
  esquemaSimulacionCapacidadPago,
  type SimulacionCapacidadPago,
} from "../compartido/capacidad-pago.ts";
import {
  esquemaResultadoRegistro,
  esquemaSolicitudRegistrada,
  type EntradaRegistroSolicitud,
  type ResultadoRegistro,
  type SolicitudRegistrada,
} from "../compartido/solicitud.ts";

const PRINCIPAL_CORE = fileURLToPath(new URL("../mcp/principal.ts", import.meta.url));
export const TIEMPO_LIMITE_CORE_MS = 5_000;

const esquemaConsulta = esquemaRespuesta(z.object({ solicitud: esquemaSolicitud.nullable() }));
const esquemaBusqueda = esquemaRespuesta(
  z.object({ coincidencias: z.array(esquemaCoincidencia) }).strict(),
);
const esquemaIdentidad = esquemaRespuesta(z.object({ identidad: esquemaEstadoIdentidad }).strict());

export type RespuestaConsulta = Respuesta<{ solicitud: Solicitud | null }>;
export type RespuestaBusqueda = Respuesta<{ coincidencias: Coincidencia[] }>;
export type RespuestaIdentidad = Respuesta<{ identidad: EstadoIdentidad }>;

const esquemaRegistro = esquemaRespuesta(
  z.object({ extraccion: esquemaRegistroExtraccion }).strict(),
);
const esquemaExtracciones = esquemaRespuesta(
  z.object({ extracciones: z.array(esquemaRegistroExtraccion) }).strict(),
);

const esquemaVerificacion = esquemaRespuesta(
  z.object({ verificacion: esquemaVerificacionIngreso }).strict(),
);
const esquemaVerificacionOpcional = esquemaRespuesta(
  z.object({ verificacion: esquemaVerificacionIngreso.nullable() }).strict(),
);

const esquemaCapacidadPago = esquemaRespuesta(
  z.object({ simulacion: esquemaSimulacionCapacidadPago }).strict(),
);

const esquemaRegistroSolicitud = esquemaRespuesta(esquemaResultadoRegistro);
const esquemaSolicitudConsultada = esquemaRespuesta(
  z.object({ solicitud: esquemaSolicitudRegistrada.nullable() }).strict(),
);

export type RespuestaCapacidadPago = Respuesta<{ simulacion: SimulacionCapacidadPago }>;
export type RespuestaRegistroSolicitud = Respuesta<ResultadoRegistro>;
export type RespuestaSolicitudRegistrada = Respuesta<{ solicitud: SolicitudRegistrada | null }>;
export type RespuestaVerificacionIngreso = Respuesta<{ verificacion: VerificacionIngreso }>;
export type RespuestaVerificacionConsultada = Respuesta<{
  verificacion: VerificacionIngreso | null;
}>;

export type RespuestaRegistroExtraccion = Respuesta<{ extraccion: RegistroExtraccion }>;
export type RespuestaExtracciones = Respuesta<{ extracciones: RegistroExtraccion[] }>;

/** Criterio de búsqueda: exactamente uno de los dos (lo valida el core). */
export type CriterioBusqueda = { documento: string } | { nombre: string };

export interface ClienteCore {
  consultarSolicitud(idSolicitud: string, correlationId: string): Promise<RespuestaConsulta>;
  buscarSolicitante(criterio: CriterioBusqueda, correlationId: string): Promise<RespuestaBusqueda>;
  /** `idIntento` es la clave de idempotencia del intento: sus reintentos la repiten (R4). */
  verificarIdentidad(
    idSolicitante: string,
    fechaExpedicion: string,
    idIntento: string,
    correlationId: string,
  ): Promise<RespuestaIdentidad>;
  /** Solo lectura; la usa el control de identidad, nunca el modelo (R6, R7). */
  consultarIdentidad(correlationId: string): Promise<RespuestaIdentidad>;
  /** Registra una extracción (#10, R6): el core exige identidad y revalida contra el contenido. */
  registrarExtraccion(
    entrada: EntradaRegistroExtraccion,
    correlationId: string,
  ): Promise<RespuestaRegistroExtraccion>;
  /** Solo lectura: las extracciones ya registradas en la conversación. */
  consultarExtracciones(correlationId: string): Promise<RespuestaExtracciones>;
  /**
   * Calcula el ingreso verificado en el core (#11, R8). `ingresoDeclarado` ausente conserva el último
   * declarado y `null` lo borra. No hay forma de enviar un ingreso verificado: lo calcula el core.
   */
  verificarIngreso(
    entrada: { ingresoDeclarado?: number | null },
    correlationId: string,
  ): Promise<RespuestaVerificacionIngreso>;
  /** Solo lectura: la última verificación de ingreso de la conversación, o `null`. */
  consultarVerificacionIngreso(correlationId: string): Promise<RespuestaVerificacionConsultada>;
  /**
   * Simula la cuota y su proporción del ingreso (#12, R4). Solo lectura: no exige identidad ni deja
   * efectos. `ingresoMensual` es opcional en el tipo para reenviar su falta y que el core la rechace
   * con su error de validación.
   */
  calcularCapacidadPago(
    entrada: { monto: number; plazoMeses: number; ingresoMensual?: number },
    correlationId: string,
  ): Promise<RespuestaCapacidadPago>;
  /**
   * Registra la solicitud con la procedencia de cada dato (#13). El core toma el solicitante, el
   * ingreso y los datos extraídos de su estado: aquí solo viaja lo que citó el solicitante.
   */
  registrarSolicitud(
    entrada: Omit<EntradaRegistroSolicitud, "correlationId">,
    correlationId: string,
  ): Promise<RespuestaRegistroSolicitud>;
  /** Solo lectura: la solicitud registrada en la conversación, o `null`. */
  consultarSolicitudRegistrada(correlationId: string): Promise<RespuestaSolicitudRegistrada>;
  cerrar(): Promise<void>;
}

/** Lo que el adaptador envía al core para registrar una extracción. */
export interface EntradaRegistroExtraccion {
  adjunto: number;
  nombre: string;
  /** El texto exacto del documento, para que el core revalide; el core no lo guarda. */
  contenido: string;
  resultado: ResultadoExtraccion;
  /** Reemplaza el registro tras una inconsistencia corregible; el core la recalcula (#11, R6). */
  reextraccion?: { regla: string };
}

/** Lo mínimo que se usa del cliente MCP; inyectable para probar respuestas fuera de contrato. */
export interface LlamadorMcp {
  callTool(
    params: { name: string; arguments: Record<string, unknown> },
    resultSchema?: undefined,
    options?: { timeout?: number },
  ): Promise<{ structuredContent?: unknown; isError?: unknown }>;
  close(): Promise<void>;
}

export interface OpcionesClienteCore {
  /** Variables de entorno extra para el proceso del servidor (por ejemplo, CREDIAGIL_FALLA). */
  env?: Record<string, string>;
  /** Cliente ya conectado; si falta, se arranca el servidor por stdio. */
  llamador?: LlamadorMcp;
  tiempoLimiteMs?: number;
  /** Destino del stderr del servidor (por defecto "inherit"); el chat lo manda a su archivo de logs. */
  stderr?: StdioServerParameters["stderr"];
}

async function conectarPorStdio(
  env: Record<string, string>,
  stderr: StdioServerParameters["stderr"],
): Promise<LlamadorMcp> {
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [PRINCIPAL_CORE],
    env: { ...(process.env as Record<string, string>), ...env },
    stderr,
  });
  const cliente = new Client({ name: "crediagil-agente", version: "0.1.0" });
  await cliente.connect(transporte);
  return cliente as unknown as LlamadorMcp;
}

/** El SDK de MCP señala el tiempo límite con McpError y el código RequestTimeout, no con el texto. */
function esTiempoAgotado(error: unknown): boolean {
  return error instanceof McpError && error.code === ErrorCode.RequestTimeout;
}

export async function crearClienteCore({
  env = {},
  llamador,
  tiempoLimiteMs = TIEMPO_LIMITE_CORE_MS,
  stderr = "inherit",
}: OpcionesClienteCore = {}): Promise<ClienteCore> {
  const mcp = llamador ?? (await conectarPorStdio(env, stderr));
  let cerrado = false;

  /** Llama a una herramienta del core y valida su respuesta: fuera de contrato no se adivina (FR-009). */
  async function llamar<T>(
    nombre: string,
    argumentos: Record<string, unknown>,
    esquema: z.ZodType<unknown>,
  ): Promise<Respuesta<T>> {
    if (cerrado) {
      return fallo(errorTransitorio("core_no_disponible", "La conexión con el core está cerrada."));
    }
    try {
      const resultado = await mcp.callTool({ name: nombre, arguments: argumentos }, undefined, {
        timeout: tiempoLimiteMs,
      });
      const respuesta = esquema.safeParse(resultado.structuredContent);
      return respuesta.success ? (respuesta.data as Respuesta<T>) : fallo(fueraDeContrato());
    } catch (error) {
      return fallo(
        esTiempoAgotado(error)
          ? errorTransitorio("tiempo_agotado", "El core no respondió a tiempo.")
          : errorTransitorio("core_no_disponible", "No se pudo hablar con el core."),
      );
    }
  }

  return {
    consultarSolicitud(idSolicitud, correlationId) {
      return llamar("consultar_solicitud", { idSolicitud, correlationId }, esquemaConsulta);
    },
    buscarSolicitante(criterio, correlationId) {
      return llamar("buscar_solicitante", { ...criterio, correlationId }, esquemaBusqueda);
    },
    verificarIdentidad(idSolicitante, fechaExpedicion, idIntento, correlationId) {
      return llamar(
        "verificar_identidad",
        { idSolicitante, fechaExpedicion, idIntento, correlationId },
        esquemaIdentidad,
      );
    },
    consultarIdentidad(correlationId) {
      return llamar("consultar_identidad", { correlationId }, esquemaIdentidad);
    },
    registrarExtraccion(entrada, correlationId) {
      return llamar("registrar_extraccion", { ...entrada, correlationId }, esquemaRegistro);
    },
    consultarExtracciones(correlationId) {
      return llamar("consultar_extracciones", { correlationId }, esquemaExtracciones);
    },
    verificarIngreso({ ingresoDeclarado }, correlationId) {
      return llamar(
        "verificar_ingreso",
        { ...(ingresoDeclarado !== undefined ? { ingresoDeclarado } : {}), correlationId },
        esquemaVerificacion,
      );
    },
    consultarVerificacionIngreso(correlationId) {
      return llamar(
        "consultar_verificacion_ingreso",
        { correlationId },
        esquemaVerificacionOpcional,
      );
    },
    calcularCapacidadPago({ monto, plazoMeses, ingresoMensual }, correlationId) {
      return llamar(
        "calcular_capacidad_pago",
        {
          monto,
          plazoMeses,
          ...(ingresoMensual !== undefined ? { ingresoMensual } : {}),
          correlationId,
        },
        esquemaCapacidadPago,
      );
    },
    registrarSolicitud(entrada, correlationId) {
      return llamar("registrar_solicitud", { ...entrada, correlationId }, esquemaRegistroSolicitud);
    },
    consultarSolicitudRegistrada(correlationId) {
      return llamar(
        "consultar_solicitud_registrada",
        { correlationId },
        esquemaSolicitudConsultada,
      );
    },
    async cerrar() {
      if (cerrado) return;
      cerrado = true;
      await mcp.close();
    },
  };
}
