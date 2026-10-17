// Servidor MCP del core de originación (contracts/core-mcp.md; research.md, R1 y R10).
// El esquema de entrada anunciado describe los campos, pero la validación estricta se hace aquí,
// para que una entrada inválida devuelva el contrato `validacion` con su campo (FR-008)
// y no el error genérico del SDK.

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  aResultadoMcp,
  errorValidacion,
  esquemaError,
  fallo,
  type Respuesta,
} from "../compartido/errores.ts";
import { registrar } from "../compartido/logs.ts";
import { esquemaSolicitud, type Core } from "./core-simulado.ts";

export const NOMBRE_SERVIDOR = "crediagil-core";

/** Entrada estricta: tipos exactos y sin campos extra. */
const esquemaEntrada = z
  .object({ idSolicitud: z.string(), correlationId: z.string().uuid() })
  .strict();

function validarEntrada(
  argumentos: unknown,
): { ok: true; idSolicitud: string; correlationId: string } | Respuesta<never> {
  const entrada = esquemaEntrada.safeParse(argumentos);
  if (entrada.success) return { ok: true, ...entrada.data };
  const problema = entrada.error.issues[0];
  const campo =
    problema?.code === "unrecognized_keys"
      ? (problema.keys[0] ?? "entrada")
      : String(problema?.path[0] ?? "entrada");
  return fallo(
    errorValidacion(
      "entrada_invalida",
      `La entrada de consultar_solicitud no es válida en el campo ${campo}.`,
      campo,
    ),
  );
}

export function crearServidor(core: Core): McpServer {
  const servidor = new McpServer({ name: NOMBRE_SERVIDOR, version: "0.1.0" });

  servidor.registerTool(
    "consultar_solicitud",
    {
      title: "Consultar solicitud",
      description:
        "Consulta el estado de una solicitud de crédito del core de Crediágil por su identificador. Devuelve solicitud: null si no existe.",
      inputSchema: z
        .object({
          idSolicitud: z.unknown().describe("Identificador de la solicitud: SOL- y 10 dígitos."),
          correlationId: z.unknown().describe("UUID de la conversación, para trazabilidad."),
        })
        .passthrough(),
      outputSchema: {
        ok: z.boolean(),
        datos: z.object({ solicitud: esquemaSolicitud.nullable() }).optional(),
        error: esquemaError.optional(),
      },
    },
    async (argumentos: unknown) => {
      const entrada = validarEntrada(argumentos);
      const correlationId =
        typeof (argumentos as { correlationId?: unknown } | undefined)?.correlationId === "string"
          ? (argumentos as { correlationId: string }).correlationId
          : null;
      const respuesta: Respuesta<unknown> =
        "idSolicitud" in entrada ? core.consultarSolicitud(entrada.idSolicitud) : entrada;
      registrar("herramienta", {
        herramienta: "consultar_solicitud",
        correlationId,
        resultado: respuesta.ok ? "ok" : respuesta.error.codigo,
      });
      return aResultadoMcp(respuesta);
    },
  );

  return servidor;
}
