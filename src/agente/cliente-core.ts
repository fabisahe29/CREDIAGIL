// Cliente MCP del servidor del core, usado por el adaptador del agente (research.md, R2;
// contracts/agente.md, "Adaptador en el mismo proceso"). Cada llamada tiene tiempo límite (FR-013)
// y su respuesta se valida contra el contrato: una respuesta fuera de contrato no se adivina (FR-009).

import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  errorTransitorio,
  esquemaRespuesta,
  fallo,
  fueraDeContrato,
  type Respuesta,
} from "../compartido/errores.ts";
import { esquemaSolicitud } from "../mcp/core-simulado.ts";
import type { Solicitud } from "../mcp/datos-ejemplo.ts";

const PRINCIPAL_CORE = fileURLToPath(new URL("../mcp/principal.ts", import.meta.url));
export const TIEMPO_LIMITE_CORE_MS = 5_000;

const esquemaConsulta = esquemaRespuesta(z.object({ solicitud: esquemaSolicitud.nullable() }));

export type RespuestaConsulta = Respuesta<{ solicitud: Solicitud | null }>;

export interface ClienteCore {
  consultarSolicitud(idSolicitud: string, correlationId: string): Promise<RespuestaConsulta>;
  cerrar(): Promise<void>;
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
}

async function conectarPorStdio(env: Record<string, string>): Promise<LlamadorMcp> {
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [PRINCIPAL_CORE],
    env: { ...(process.env as Record<string, string>), ...env },
    stderr: "inherit",
  });
  const cliente = new Client({ name: "crediagil-agente", version: "0.1.0" });
  await cliente.connect(transporte);
  return cliente as unknown as LlamadorMcp;
}

function esTiempoAgotado(error: unknown): boolean {
  return error instanceof Error && /timed? ?out|timeout/i.test(`${error.name} ${error.message}`);
}

export async function crearClienteCore({
  env = {},
  llamador,
  tiempoLimiteMs = TIEMPO_LIMITE_CORE_MS,
}: OpcionesClienteCore = {}): Promise<ClienteCore> {
  const mcp = llamador ?? (await conectarPorStdio(env));
  let cerrado = false;

  return {
    async consultarSolicitud(idSolicitud, correlationId) {
      if (cerrado) {
        return fallo(
          errorTransitorio("core_no_disponible", "La conexión con el core está cerrada."),
        );
      }
      try {
        const resultado = await mcp.callTool(
          { name: "consultar_solicitud", arguments: { idSolicitud, correlationId } },
          undefined,
          { timeout: tiempoLimiteMs },
        );
        const respuesta = esquemaConsulta.safeParse(resultado.structuredContent);
        return respuesta.success ? (respuesta.data as RespuestaConsulta) : fallo(fueraDeContrato());
      } catch (error) {
        return fallo(
          esTiempoAgotado(error)
            ? errorTransitorio("tiempo_agotado", "El core no respondió a tiempo.")
            : errorTransitorio("core_no_disponible", "No se pudo hablar con el core."),
        );
      }
    },
    async cerrar() {
      if (cerrado) return;
      cerrado = true;
      await mcp.close();
    },
  };
}
