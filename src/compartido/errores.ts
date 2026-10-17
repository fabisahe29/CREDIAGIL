// Contrato de errores común a todas las herramientas del core (contracts/core-mcp.md;
// data-model.md, "Error del contrato" y "Respuesta de herramienta"; research.md, R3).
// Lo comparten el servidor MCP y el agente: ninguno interpreta errores por el texto del mensaje.

import { z } from "zod";

export const CATEGORIAS = ["transitorio", "validacion", "negocio", "permisos"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const esquemaError = z
  .object({
    categoria: z.enum(CATEGORIAS),
    reintentable: z.boolean(),
    codigo: z.string().regex(/^[a-z][a-z0-9_]*$/),
    mensaje: z.string().min(1),
    campo: z.string().min(1).optional(),
  })
  .strict()
  .refine((e) => !e.reintentable || e.categoria === "transitorio", {
    message: "solo un error transitorio puede ser reintentable",
  })
  .refine((e) => e.categoria !== "validacion" || e.campo !== undefined, {
    message: "un error de validación indica el campo",
  });

export type ErrorCore = z.infer<typeof esquemaError>;

export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: ErrorCore };

/** Esquema de una respuesta de herramienta con los datos validados por `datos`. */
export function esquemaRespuesta<T>(datos: z.ZodType<T>) {
  return z.union([
    z.object({ ok: z.literal(true), datos }).strict(),
    z.object({ ok: z.literal(false), error: esquemaError }).strict(),
  ]);
}

function crear(error: ErrorCore): ErrorCore {
  return esquemaError.parse(error);
}

export const errorValidacion = (codigo: string, mensaje: string, campo: string) =>
  crear({ categoria: "validacion", reintentable: false, codigo, mensaje, campo });

export const errorNegocio = (codigo: string, mensaje: string) =>
  crear({ categoria: "negocio", reintentable: false, codigo, mensaje });

export const errorPermisos = (codigo: string, mensaje: string) =>
  crear({ categoria: "permisos", reintentable: false, codigo, mensaje });

export const errorTransitorio = (codigo: string, mensaje: string) =>
  crear({ categoria: "transitorio", reintentable: true, codigo, mensaje });

/**
 * Los reintentos se agotaron: sigue siendo una falla transitoria, pero ya no se reintenta,
 * para que el modelo no insista por su cuenta (excepción documentada en data-model.md).
 */
export const transitorioAgotado = (mensaje = "El core no respondió tras los reintentos.") =>
  crear({ categoria: "transitorio", reintentable: false, codigo: "transitorio_agotado", mensaje });

/** La respuesta del core no cumple el contrato: no se adivina (FR-009). */
export const fueraDeContrato = (mensaje = "La respuesta del core no cumple el contrato.") =>
  crear({
    categoria: "negocio",
    reintentable: false,
    codigo: "respuesta_fuera_de_contrato",
    mensaje,
  });

export const exito = <T>(datos: T): Respuesta<T> => ({ ok: true, datos });
export const fallo = <T = never>(error: ErrorCore): Respuesta<T> => ({ ok: false, error });

/** Resultado de herramienta MCP: el contrato viaja en `structuredContent` (y como texto, por compatibilidad). */
export function aResultadoMcp(respuesta: Respuesta<unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(respuesta) }],
    structuredContent: respuesta as unknown as Record<string, unknown>,
    isError: !respuesta.ok,
  };
}
