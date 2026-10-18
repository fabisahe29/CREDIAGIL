// Preaprobación automática: esquemas de la decisión y de la constancia, y la descripción de la
// herramienta `preaprobar_credito` (specs/012-preaprobacion-automatica-politica: data-model.md;
// contracts/core-mcp.md; research.md, R3, R6 y R8). Lo usan el core, el servidor MCP, el cliente y el
// adaptador del agente: la descripción que lee el modelo está escrita una sola vez, y una respuesta
// que no cumple el esquema no se adivina (Principio III). La decisión la toma `evaluarRegla2`.

import { z } from "zod";
import { errorValidacion, type ErrorCore } from "./errores.ts";
import type { CodigoBloqueo } from "../politica/preaprobacion.ts";

/** Los códigos por los que se bloquea una preaprobación; los mismos que devuelve la política. */
export const CODIGOS_BLOQUEO = [
  "ingreso_no_verificado",
  "discrepancia_registrada",
  "monto_sobre_tope",
  "cuota_no_calculable",
  "cuota_sobre_porcentaje",
] as const satisfies readonly CodigoBloqueo[];

/** Valores de la decisión: textos ya formateados o enteros (pesos), como los eventos de negocio. */
const esquemaValores = z.record(z.string(), z.union([z.string(), z.int()]));

/**
 * La decisión explicable de la Regla 2 (Principio III): regla, valores y motivo. Un bloqueo trae su
 * código y una decisión permitida no.
 */
export const esquemaDecisionRegla2 = z
  .strictObject({
    regla: z.string().min(1),
    permitido: z.boolean(),
    codigo: z.enum(CODIGOS_BLOQUEO).optional(),
    motivo: z.string().min(1),
    valores: esquemaValores,
    versionPolitica: z.string().min(1),
  })
  .refine((d) => (d.codigo === undefined) === d.permitido, {
    message: "un bloqueo trae su código y una decisión permitida no",
    path: ["codigo"],
  });

/**
 * La constancia de una preaprobación: solo la decisión que permite y cuándo se tomó, sin vigencia ni
 * condiciones (aclaración Q1 del #14).
 */
export const esquemaPreaprobacion = z.strictObject({
  preaprobadaEn: z.iso.datetime(),
  decision: esquemaDecisionRegla2.refine((d) => d.permitido, {
    message: "una preaprobación solo guarda una decisión que permite",
  }),
});
export type Preaprobacion = z.infer<typeof esquemaPreaprobacion>;

/**
 * Lo que lee el modelo sobre `preaprobar_credito` (FR-002; research.md, R8): qué hace, que compromete
 * a la fintech y cuándo corresponde frente a la simulación. No da el tope ni el porcentaje: con ellos
 * el modelo concluiría «sí califica» sin pedirla, o intentaría ajustar los datos.
 */
export const DESCRIPCION_PREAPROBAR_CREDITO =
  "Preaprueba automáticamente la solicitud registrada de la conversación, si cumple la política. Compromete a la fintech: úsala solo con una solicitud registrada y con el ingreso verificado. No uses esta herramienta para explorar ni para responder cuánto pagaría el solicitante: para eso está calcular_capacidad_pago. No recibe montos, cuotas ni ingresos: el sistema los toma de la solicitud registrada. Si el caso no cumple la política, se rechaza y pasa a un analista; no se ofrecen alternativas.";

export type ValidacionEntradaPreaprobacion =
  { ok: true; correlationId: string } | { ok: false; error: ErrorCore };

/**
 * La única entrada de `preaprobar_credito` es el `correlationId`: no hay campos para montos, cuotas ni
 * ingresos, y uno de más es un error de formato que lo nombra (research.md, R3). Nunca completa ni
 * corrige un dato.
 */
export function validarEntradaPreaprobacion(entrada: unknown): ValidacionEntradaPreaprobacion {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) {
    return {
      ok: false,
      error: errorValidacion(
        "formato_invalido",
        "La entrada de preaprobar_credito debe ser un objeto.",
        "entrada",
      ),
    };
  }
  const objeto = entrada as Record<string, unknown>;
  const id = z.uuid().safeParse(objeto["correlationId"]);
  if (!id.success) {
    return {
      ok: false,
      error: errorValidacion(
        "formato_invalido",
        "El correlationId debe ser un UUID.",
        "correlationId",
      ),
    };
  }
  const extra = Object.keys(objeto).find((campo) => campo !== "correlationId");
  if (extra !== undefined) {
    return {
      ok: false,
      error: errorValidacion(
        "formato_invalido",
        `El campo ${extra} no existe en preaprobar_credito: el sistema lo toma de la solicitud registrada.`,
        extra,
      ),
    };
  }
  return { ok: true, correlationId: id.data };
}
