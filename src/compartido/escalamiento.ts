// Escalamiento: contrato de las herramientas `escalar_a_analista` y `consultar_escalamiento`
// (specs/013-escalamiento-analista: data-model.md; contracts/core-mcp.md; research.md, R3, R8 y R9).
// Lo usan el core, el servidor MCP, el cliente y el adaptador del agente: la descripción que lee el
// modelo está escrita una sola vez, y una respuesta que no cumple el esquema no se adivina (Principio
// III). La causa, la acción y la regla salen de `src/politica/escalamiento.ts`, nunca del modelo.

import { z } from "zod";
import { errorValidacion, type ErrorCore } from "./errores.ts";
import { ASUNTOS } from "../politica/asuntos.ts";
import { esquemaRegistroExtraccion, huella } from "./extraccion.ts";
import { CODIGOS_BLOQUEO } from "./preaprobacion.ts";
import {
  esquemaProcedenciaRegistro,
  esquemaVerificacionRegistrada,
  validarProcedenciaDato,
  type DatoConProcedencia,
} from "./solicitud.ts";
import {
  ACCIONES_RECOMENDADAS,
  CAUSAS_ESCALAMIENTO,
  MOTIVOS_ESCALAMIENTO,
  PENDIENTES,
  accionRecomendada,
  type Pendiente,
  causaDeEscalamiento,
} from "../politica/escalamiento.ts";

/**
 * Lo que lee el modelo sobre `escalar_a_analista` (R3): qué hace, que se puede usar sin identidad ni
 * solicitud, que solo recibe la causa y que no decide el crédito. No da ningún umbral.
 */
export const DESCRIPCION_ESCALAR_A_ANALISTA =
  "Entrega un caso a un analista de crédito, con un resumen completo que arma el sistema. Se puede usar sin identidad verificada y sin solicitud registrada: en ese caso el resumen marca lo que falta como pendiente. Solo recibe la causa clasificada: el solicitante, la solicitud, los ingresos, los documentos y las discrepancias los toma el sistema de su propio estado. Si el mensaje del solicitante trajo otros asuntos que no se atendieron, el resumen los lista como asuntos pendientes. Es idempotente: repetirla devuelve el mismo resumen. Escalar no decide el crédito: no aprueba ni rechaza.";

/** Clave de idempotencia del escalamiento: una por conversación, la misma entre reintentos (R8). */
export const claveIdempotenciaEscalamiento = (correlationId: string): string =>
  huella(JSON.stringify([correlationId, "escalamiento"]));

// ---------------------------------------------------------------------------------------------
// Entrada de `escalar_a_analista`
// ---------------------------------------------------------------------------------------------

const causa = z.enum(CAUSAS_ESCALAMIENTO);
const motivo = z.enum(MOTIVOS_ESCALAMIENTO);
const codigo = z.enum(CODIGOS_BLOQUEO);

/**
 * Los asuntos del mensaje que quedaron sin atender al escalar (#16, R7): del catálogo, sin repetidos y
 * como mucho los tres que hay. Es información para el analista: no cambia la causa ni la acción.
 */
const esquemaAsuntosPendientes = z
  .array(z.enum(ASUNTOS))
  .max(ASUNTOS.length)
  .refine((asuntos) => new Set(asuntos).size === asuntos.length);

export type ClasificacionEntrada = {
  causa: z.infer<typeof causa>;
  motivo: z.infer<typeof motivo>;
  codigo?: z.infer<typeof codigo> | undefined;
};

/**
 * Si la clasificación no cuadra, el campo que falla: el código va solo con la preaprobación fuera de
 * política y siempre con ella; la causa debe ser la que deduce la política (R1).
 */
function campoIncoherente(c: ClasificacionEntrada): "codigo" | "causa" | null {
  const conCodigo = c.motivo === "preaprobacion_fuera_de_politica";
  if (conCodigo !== (c.codigo !== undefined)) return "codigo";
  return causaDeEscalamiento({ motivo: c.motivo, ...(c.codigo ? { codigo: c.codigo } : {}) }) ===
    c.causa
    ? null
    : "causa";
}

/** Una causa adicional: el caso puede tener más de una (R6). */
const esquemaClasificacion = z.strictObject({
  causa,
  motivo,
  codigo: codigo.optional(),
});

const repiteLaPrincipal = (
  principal: ClasificacionEntrada,
  adicional: ClasificacionEntrada,
): boolean => principal.motivo === adicional.motivo && principal.codigo === adicional.codigo;

const MAX_CAUSAS_ADICIONALES = 8;

/** El monto o el plazo que dijo el solicitante, con su procedencia (R4). */
const esquemaDeclaradoDato = z.strictObject({
  valor: z.int().positive(),
  procedencia: esquemaProcedenciaRegistro,
});

export const esquemaEntradaEscalamiento = z
  .strictObject({
    correlationId: z.uuid(),
    claveIdempotencia: z.string().min(1).max(64),
    causa,
    motivo,
    codigo: codigo.optional(),
    causasAdicionales: z.array(esquemaClasificacion).max(MAX_CAUSAS_ADICIONALES).optional(),
    asuntosPendientes: esquemaAsuntosPendientes.optional(),
    declarado: z
      .strictObject({
        monto: esquemaDeclaradoDato.optional(),
        plazoMeses: esquemaDeclaradoDato.optional(),
      })
      .optional(),
  })
  .superRefine((entrada, ctx) => {
    const campo = campoIncoherente(entrada);
    if (campo !== null) {
      ctx.addIssue({ code: "custom", path: [campo], message: "la clasificación no es coherente" });
    }
    for (const adicional of entrada.causasAdicionales ?? []) {
      if (campoIncoherente(adicional) !== null || repiteLaPrincipal(entrada, adicional)) {
        ctx.addIssue({
          code: "custom",
          path: ["causasAdicionales"],
          message: "una causa adicional no es coherente o repite la principal",
        });
      }
    }
  });
export type EntradaEscalamiento = z.infer<typeof esquemaEntradaEscalamiento>;

export type ValidacionEntradaEscalamiento =
  { ok: true; entrada: EntradaEscalamiento } | { ok: false; error: ErrorCore };

const CAMPOS_CONOCIDOS: readonly string[] = [
  "correlationId",
  "claveIdempotencia",
  "causa",
  "motivo",
  "codigo",
  "causasAdicionales",
  "asuntosPendientes",
  "declarado",
];

const DATOS_DECLARADOS: readonly DatoConProcedencia[] = ["monto", "plazoMeses"];

const invalido = (mensaje: string, campo: string) => ({
  ok: false as const,
  error: errorValidacion("formato_invalido", mensaje, campo),
});

/**
 * Valida la entrada con su código y su campo: la forma, la coherencia entre la causa, el motivo y el
 * código, y la procedencia del monto y el plazo declarados. Nunca completa ni corrige un dato, y los
 * mensajes nunca repiten lo que citó el solicitante (Principio VI).
 */
export function validarEntradaEscalamiento(entrada: unknown): ValidacionEntradaEscalamiento {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) {
    return invalido("La entrada de escalar_a_analista debe ser un objeto.", "entrada");
  }
  const objeto = entrada as Record<string, unknown>;

  const forma: [string, z.ZodType, string][] = [
    ["correlationId", z.uuid(), "El correlationId debe ser un UUID."],
    [
      "claveIdempotencia",
      z.string().min(1).max(64),
      "La clave de idempotencia debe tener de 1 a 64 caracteres.",
    ],
    ["causa", causa, "La causa no es una de las cinco causas de escalamiento."],
    ["motivo", motivo, "El motivo no es uno de los motivos de escalamiento."],
    ["codigo", codigo.optional(), "El código no es uno de los códigos de bloqueo de la Regla 2."],
    [
      "causasAdicionales",
      z.array(esquemaClasificacion).max(MAX_CAUSAS_ADICIONALES).optional(),
      `Las causas adicionales son hasta ${MAX_CAUSAS_ADICIONALES}, cada una con causa, motivo y código opcional.`,
    ],
    [
      "asuntosPendientes",
      esquemaAsuntosPendientes.optional(),
      "Los asuntos pendientes son una lista de asuntos del catálogo, sin repetidos.",
    ],
  ];
  for (const [campo, esquema, mensaje] of forma) {
    if (!esquema.safeParse(objeto[campo]).success) return invalido(mensaje, campo);
  }

  const declarado = validarDeclarado(objeto["declarado"]);
  if (declarado !== null) return { ok: false, error: declarado };

  const extra = Object.keys(objeto).find((campo) => !CAMPOS_CONOCIDOS.includes(campo));
  if (extra !== undefined) {
    return invalido(
      `El campo ${extra} no existe en escalar_a_analista: el core lo toma de su estado.`,
      extra,
    );
  }

  const analisis = esquemaEntradaEscalamiento.safeParse(objeto);
  if (analisis.success) return { ok: true, entrada: analisis.data };

  // Las comprobaciones de forma ya pasaron: lo que falla aquí es la coherencia.
  const principal = objeto as unknown as ClasificacionEntrada & {
    causasAdicionales?: ClasificacionEntrada[];
  };
  const campo = campoIncoherente(principal);
  if (campo === "codigo") {
    return invalido(
      "El código de bloqueo va solo con la preaprobación fuera de política, y siempre con ella.",
      "codigo",
    );
  }
  if (campo === "causa") {
    return {
      ok: false,
      error: errorValidacion(
        "causa_incoherente",
        "La causa no corresponde al motivo y al código del escalamiento.",
        "causa",
      ),
    };
  }
  const adicionales = principal.causasAdicionales;
  if (adicionales?.some((a) => campoIncoherente(a) !== null) === true) {
    return {
      ok: false,
      error: errorValidacion(
        "causa_incoherente",
        "Una causa adicional no corresponde a su motivo y a su código.",
        "causasAdicionales",
      ),
    };
  }
  return invalido("Una causa adicional repite la principal.", "causasAdicionales");
}

/** El monto y el plazo declarados: el valor entero positivo y la procedencia comprobada por dato. */
function validarDeclarado(valor: unknown): ErrorCore | null {
  if (valor === undefined) return null;
  const forma = invalido(
    "El monto y el plazo declarados son opcionales y cada uno lleva su valor entero positivo y su procedencia.",
    "declarado",
  ).error;
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return forma;
  const declarado = valor as Record<string, unknown>;
  if (Object.keys(declarado).some((clave) => !DATOS_DECLARADOS.includes(clave as never))) {
    return forma;
  }
  for (const dato of DATOS_DECLARADOS) {
    const entrada = declarado[dato];
    if (entrada === undefined) continue;
    if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) return forma;
    const { valor: cantidad, procedencia } = entrada as Record<string, unknown>;
    if (!z.int().positive().safeParse(cantidad).success) return forma;
    const analisis = validarProcedenciaDato(dato, procedencia);
    if (!analisis.ok) return analisis.error;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Resumen para el analista
// ---------------------------------------------------------------------------------------------

/** Un valor del resumen junto con su procedencia: un dato sin procedencia no existe. */
const datoConProcedencia = <T extends z.ZodType>(valor: T) =>
  z.strictObject({ valor, procedencia: esquemaProcedenciaRegistro });

/** El solicitante: sin la identidad verificada solo se sabe que no está identificado (aclaración Q1). */
const esquemaSolicitanteResumen = z.discriminatedUnion("identificado", [
  z.strictObject({
    identificado: z.literal(true),
    idSolicitante: z.string().regex(/^CLI-000\d{7}$/),
    nombre: z.string().min(1),
    documentoEnmascarado: z.string().min(1),
  }),
  z.strictObject({ identificado: z.literal(false) }),
]);

/** Una discrepancia que encontró el core: de ingreso o entre documentos. */
const esquemaDiscrepanciaResumen = z.discriminatedUnion("tipo", [
  z.strictObject({
    tipo: z.literal("ingreso"),
    declarado: z.int().min(0),
    verificado: z.int().min(0),
    diferenciaPorcentaje: z.number().min(0),
    umbralPorcentaje: z.number().positive(),
  }),
  z.strictObject({
    tipo: z.literal("documental"),
    regla: z.string().min(1),
    adjuntos: z.array(z.int().min(1)),
  }),
]);
export type DiscrepanciaResumen = z.infer<typeof esquemaDiscrepanciaResumen>;

/** La decisión de la Regla 2 con sus valores y su motivo (Principio III). */
const esquemaDecisionExplicable = z.strictObject({
  regla: z.string().min(1),
  motivo: z.string().min(1),
  valores: z.record(z.string(), z.union([z.string(), z.int()])),
  versionPolitica: z.string().min(1),
});

const esquemaCausaAdicional = z.strictObject({
  causa,
  motivo,
  codigo: codigo.optional(),
  accionRecomendada: z.enum(ACCIONES_RECOMENDADAS),
});

/** Lo que falta en el resumen: lo calcula el core con lo que sí sabe. */
export const calcularPendientes = (r: {
  solicitante: { identificado: boolean };
  monto: unknown;
  plazoMeses: unknown;
  verificacionIngreso: { ingresoVerificado: unknown } | null;
  datosExtraidos: readonly unknown[];
}): Pendiente[] =>
  PENDIENTES.filter((pendiente) => {
    switch (pendiente) {
      case "identidad":
        return !r.solicitante.identificado;
      case "monto":
        return r.monto === null;
      case "plazo":
        return r.plazoMeses === null;
      case "ingreso_verificado":
        return r.verificacionIngreso === null || r.verificacionIngreso.ingresoVerificado === null;
      case "documentos":
        return r.datosExtraidos.length === 0;
    }
  });

export const esquemaResumenAnalista = z
  .strictObject({
    idEscalamiento: z.string().regex(/^ESC-000\d{7}$/),
    correlationId: z.uuid(),
    claveIdempotencia: z.string().min(1).max(64),
    escaladoEn: z.iso.datetime(),
    versionPolitica: z.string().min(1),
    causa,
    motivo,
    codigo: codigo.optional(),
    regla: z.string().min(1),
    accionRecomendada: z.enum(ACCIONES_RECOMENDADAS),
    causasAdicionales: z.array(esquemaCausaAdicional),
    solicitante: esquemaSolicitanteResumen,
    solicitud: z
      .strictObject({
        idSolicitud: z.string().regex(/^SOL-000\d{7}$/),
        estado: z.enum(["en_estudio", "preaprobada"]),
      })
      .nullable(),
    monto: datoConProcedencia(z.int().positive()).nullable(),
    plazoMeses: datoConProcedencia(z.int().positive()).nullable(),
    ingresoDeclarado: datoConProcedencia(z.int().min(0)).nullable(),
    verificacionIngreso: esquemaVerificacionRegistrada.nullable(),
    discrepancias: z.array(esquemaDiscrepanciaResumen),
    datosExtraidos: z.array(esquemaRegistroExtraccion),
    decision: esquemaDecisionExplicable.nullable(),
    pendientes: z.array(z.enum(PENDIENTES)),
    // Lo que el solicitante planteó y no se atendió; vacío en los resúmenes anteriores al #16.
    asuntosPendientes: esquemaAsuntosPendientes.default([]),
  })
  .superRefine((r, ctx) => {
    const problema = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (campoIncoherente(r) !== null) {
      problema("causa", "la causa no coincide con el motivo y el código");
    } else if (r.accionRecomendada !== accionRecomendada(r)) {
      problema("accionRecomendada", "la acción no coincide con el motivo y el código");
    }
    for (const adicional of r.causasAdicionales) {
      if (
        campoIncoherente(adicional) !== null ||
        repiteLaPrincipal(r, adicional) ||
        adicional.accionRecomendada !== accionRecomendada(adicional)
      ) {
        problema("causasAdicionales", "una causa adicional es incoherente o repite la principal");
        break;
      }
    }
    const esperados = calcularPendientes(r);
    if (
      r.pendientes.length !== esperados.length ||
      r.pendientes.some((p, i) => p !== esperados[i])
    ) {
      problema(
        "pendientes",
        "los pendientes deben ser exactamente lo que falta, en el orden del catálogo",
      );
    }
  });
export type ResumenAnalista = z.infer<typeof esquemaResumenAnalista>;

/** Lo que devuelve `escalar_a_analista` en `datos`. */
export const esquemaResultadoEscalamiento = z.strictObject({
  escalamiento: esquemaResumenAnalista,
  repetida: z.boolean(),
});
export type ResultadoEscalamiento = z.infer<typeof esquemaResultadoEscalamiento>;
