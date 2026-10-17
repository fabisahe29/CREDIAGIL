// Servidor MCP del core de originación (contracts/core-mcp.md; research.md, R1 y R10).
// El esquema de entrada anunciado describe los campos, pero la validación estricta se hace aquí,
// para que una entrada inválida devuelva el contrato `validacion` con su campo (FR-008)
// y no el error genérico del SDK. Las herramientas de identidad son del #9
// (specs/007-verificacion-identidad/contracts/core-mcp.md).

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
import { MAX_INTENTOS_VERIFICACION } from "../politica/politica.ts";
import {
  esquemaCoincidencia,
  esquemaEstadoIdentidad,
  esquemaSolicitud,
  type Core,
} from "./core-simulado.ts";

export const NOMBRE_SERVIDOR = "crediagil-core";

const correlationId = z.uuid();

/** Entradas estrictas: tipos exactos y sin campos extra. Los valores los valida el core. */
const ENTRADAS = {
  consultar_solicitud: z.object({ idSolicitud: z.string(), correlationId }).strict(),
  buscar_solicitante: z
    .object({ documento: z.unknown().optional(), nombre: z.unknown().optional(), correlationId })
    .strict(),
  verificar_identidad: z
    .object({
      idSolicitante: z.unknown(),
      fechaExpedicion: z.unknown(),
      idIntento: z.unknown(),
      correlationId,
    })
    .strict(),
  consultar_identidad: z.object({ correlationId }).strict(),
} as const;

type NombreHerramienta = keyof typeof ENTRADAS;
type Entrada<N extends NombreHerramienta> = z.infer<(typeof ENTRADAS)[N]>;

function validarEntrada<N extends NombreHerramienta>(
  herramienta: N,
  argumentos: unknown,
): { ok: true; entrada: Entrada<N> } | { ok: false; respuesta: Respuesta<never> } {
  const entrada = ENTRADAS[herramienta].safeParse(argumentos);
  if (entrada.success) return { ok: true, entrada: entrada.data as Entrada<N> };
  const problema = entrada.error.issues[0];
  const campo =
    problema?.code === "unrecognized_keys"
      ? (problema.keys[0] ?? "entrada")
      : String(problema?.path[0] ?? "entrada");
  return {
    ok: false,
    respuesta: fallo(
      errorValidacion(
        "formato_invalido",
        `La entrada de ${herramienta} no es válida en el campo ${campo}.`,
        campo,
      ),
    ),
  };
}

/** El correlationId de los argumentos, aunque la entrada no valide, para la trazabilidad del log. */
function correlationIdDe(argumentos: unknown): string | null {
  const valor = (argumentos as { correlationId?: unknown } | undefined)?.correlationId;
  return typeof valor === "string" ? valor : null;
}

function registrarHerramienta(
  herramienta: NombreHerramienta,
  argumentos: unknown,
  respuesta: Respuesta<unknown>,
  campos: Record<string, unknown> = {},
): void {
  registrar("herramienta", {
    herramienta,
    correlationId: correlationIdDe(argumentos),
    resultado: respuesta.ok ? "ok" : respuesta.error.codigo,
    ...campos,
  });
}

/** Qué criterio usó la búsqueda, para el log; nunca su valor (R9). */
function criterioDe(entrada: Entrada<"buscar_solicitante">): "documento" | "nombre" | null {
  if (entrada.documento !== undefined) return "documento";
  return entrada.nombre === undefined ? null : "nombre";
}

/** Esquema anunciado de un campo obligatorio: opcional aquí para que su falta llegue a validarEntrada. */
const anunciado = (descripcion: string) => z.unknown().optional().describe(descripcion);

const CORRELATION_ID_ANUNCIADO = anunciado(
  "Obligatorio. UUID de la conversación, para trazabilidad.",
);

const salida = <T extends z.ZodRawShape>(datos: T) => ({
  ok: z.boolean(),
  datos: z.object(datos).optional(),
  error: esquemaError.optional(),
});

export function crearServidor(core: Core): McpServer {
  const servidor = new McpServer({ name: NOMBRE_SERVIDOR, version: "0.2.0" });

  servidor.registerTool(
    "consultar_solicitud",
    {
      title: "Consultar solicitud",
      description:
        "Consulta el estado de una solicitud de crédito del core de Crediágil por su identificador. Devuelve solicitud: null si no existe.",
      inputSchema: z.looseObject({
        idSolicitud: anunciado("Obligatorio. Identificador de la solicitud: SOL- y 10 dígitos."),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({ solicitud: esquemaSolicitud.nullable() }),
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("consultar_solicitud", argumentos);
      const respuesta: Respuesta<unknown> = validacion.ok
        ? core.consultarSolicitud(validacion.entrada.idSolicitud)
        : validacion.respuesta;
      registrarHerramienta("consultar_solicitud", argumentos, respuesta);
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "buscar_solicitante",
    {
      title: "Buscar solicitante",
      description:
        "Busca solicitantes en el core de Crediágil por número de documento o por nombre completo (uno de los dos). Puede devolver cero, una o varias coincidencias; no elijas entre varias, pide el número de documento.",
      inputSchema: z.looseObject({
        documento: anunciado(
          "Número de documento de identidad, con o sin puntos, espacios o guiones. Usa documento o nombre, no ambos.",
        ),
        nombre: anunciado("Nombre completo del solicitante. Usa documento o nombre, no ambos."),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({ coincidencias: z.array(esquemaCoincidencia) }),
      annotations: { readOnlyHint: true },
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("buscar_solicitante", argumentos);
      const respuesta = validacion.ok
        ? core.buscarSolicitante(validacion.entrada)
        : validacion.respuesta;
      // Solo el tipo de criterio y el número de coincidencias: nunca el valor buscado (R9).
      const criterio = validacion.ok ? criterioDe(validacion.entrada) : null;
      registrarHerramienta("buscar_solicitante", argumentos, respuesta, {
        criterio,
        coincidencias: respuesta.ok ? respuesta.datos.coincidencias.length : null,
      });
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "verificar_identidad",
    {
      title: "Verificar identidad",
      description: `Verifica la identidad de un solicitante encontrado con la fecha de expedición de su documento (AAAA-MM-DD). Si el dato no coincide, informa sin revelar el dato correcto. Tras ${MAX_INTENTOS_VERIFICACION} intentos fallidos la verificación queda bloqueada.`,
      inputSchema: z.looseObject({
        idSolicitante: anunciado("Obligatorio. Identificador del solicitante: CLI- y 10 dígitos."),
        fechaExpedicion: anunciado(
          "Obligatorio. Fecha de expedición del documento de identidad, AAAA-MM-DD.",
        ),
        idIntento: anunciado(
          "Obligatorio. Clave de idempotencia del intento (1 a 64 caracteres); repetirla no cuenta otro intento.",
        ),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({ identidad: esquemaEstadoIdentidad }),
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("verificar_identidad", argumentos);
      if (!validacion.ok) {
        registrarHerramienta("verificar_identidad", argumentos, validacion.respuesta);
        return aResultadoMcp(validacion.respuesta);
      }
      const { respuesta, auditoria } = core.verificarIdentidad(validacion.entrada);
      registrarHerramienta("verificar_identidad", argumentos, respuesta);
      // Auditoría de la Regla 1 (R9): resultado y valores usados, nunca la fecha.
      if (auditoria !== null) {
        registrar("auditoria", {
          regla: "Regla 1",
          correlationId: validacion.entrada.correlationId,
          ...auditoria,
        });
      }
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "consultar_identidad",
    {
      title: "Consultar identidad",
      description: "Devuelve el estado de identidad verificada de la conversación. Solo lectura.",
      inputSchema: z.looseObject({ correlationId: CORRELATION_ID_ANUNCIADO }),
      outputSchema: salida({ identidad: esquemaEstadoIdentidad }),
      annotations: { readOnlyHint: true },
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("consultar_identidad", argumentos);
      const respuesta = validacion.ok
        ? core.consultarIdentidad(validacion.entrada.correlationId)
        : validacion.respuesta;
      registrarHerramienta("consultar_identidad", argumentos, respuesta, {
        verificada: respuesta.ok ? respuesta.datos.identidad.verificada : null,
      });
      return aResultadoMcp(respuesta);
    },
  );

  return servidor;
}
