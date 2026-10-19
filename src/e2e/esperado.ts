// Resultado esperado de un caso obligatorio (specs/015-casos-prueba-extremo-a-extremo: data-model.md,
// "Resultado esperado"). Se expresa solo en decisión, causa, llamadas, eventos y estado del core:
// el esquema no tiene un campo para el texto de la respuesta (FR-004).

import { z } from "zod";
import { CODIGOS_BLOQUEO } from "../compartido/preaprobacion.ts";
import { TIPOS_EVENTO } from "../compartido/eventos.ts";
import { CAUSAS_ESCALAMIENTO, MOTIVOS_ESCALAMIENTO } from "../politica/escalamiento.ts";

export const DECISIONES = ["preaprobada", "escalada", "solicitud_de_dato", "bloqueada"] as const;
export type Decision = (typeof DECISIONES)[number];

/**
 * Las llamadas que se pueden observar: las que reporta `alUsarHerramienta`, es decir, las llamadas al
 * core. `extraer_documento` del modelo termina en `registrar_extraccion`; `solicitar_analista` y la
 * entrega del escalamiento no son llamadas observables (se verifican por la decisión y el core).
 */
export const HERRAMIENTAS_OBSERVABLES = [
  "buscar_solicitante",
  "verificar_identidad",
  "registrar_extraccion",
  "verificar_ingreso",
  "calcular_capacidad_pago",
  "registrar_solicitud",
  "preaprobar_credito",
  "consultar_solicitud",
  "consultar_extracciones",
] as const;
export type HerramientaObservable = (typeof HERRAMIENTAS_OBSERVABLES)[number];

/** Campos del certificado laboral que un caso puede comprobar en el core. */
export const CAMPOS_CERTIFICADO = [
  "empleador",
  "cargo",
  "fechaIngreso",
  "salario",
  "moneda",
] as const;
export type CampoCertificado = (typeof CAMPOS_CERTIFICADO)[number];

export const MODOS_FALLA = ["una-vez", "siempre"] as const;

const esquemaCampoEsperado = z.strictObject({
  /** Nombre del adjunto, tal como lo entrega el caso. */
  documento: z.string().min(1),
  campo: z.enum(CAMPOS_CERTIFICADO),
  /** `null` es un dato faltante: no se supuso ni se completó. */
  valor: z.union([z.string(), z.number(), z.null()]),
});
export type CampoEsperado = z.infer<typeof esquemaCampoEsperado>;

export const esquemaEstadoCore = z.strictObject({
  solicitudRegistrada: z.boolean().optional(),
  preaprobada: z.boolean().optional(),
  /** El ingreso que salió de los documentos; `null` si no se pudo verificar. */
  ingresoVerificado: z.int().min(0).nullable().optional(),
  campos: z.array(esquemaCampoEsperado).optional(),
  escalamientoRegistrado: z.boolean().optional(),
  entrega: z.enum(["entregada", "pendiente"]).optional(),
});
export type EstadoCoreEsperado = z.infer<typeof esquemaEstadoCore>;

const lista = <T extends z.ZodType>(elemento: T) => z.array(elemento).default([]);

export const esquemaEsperado = z
  .strictObject({
    decision: z.enum(DECISIONES),
    causa: z.enum(CAUSAS_ESCALAMIENTO).optional(),
    motivo: z.enum(MOTIVOS_ESCALAMIENTO).optional(),
    codigoBloqueo: z.enum(CODIGOS_BLOQUEO).optional(),
    llamadasRequeridas: lista(z.enum(HERRAMIENTAS_OBSERVABLES)),
    llamadasProhibidas: lista(z.enum(HERRAMIENTAS_OBSERVABLES)),
    eventosRequeridos: lista(z.enum(TIPOS_EVENTO)),
    /** `solo_guionado`: el bloqueo se exige solo si el modelo guionado intenta la acción (R9). */
    bloqueoRequerido: z.enum(["siempre", "solo_guionado"]).optional(),
    estadoCore: esquemaEstadoCore.optional(),
  })
  .superRefine((esperado, ctx) => {
    const problema = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (esperado.decision === "escalada" && esperado.causa === undefined) {
      problema("causa", "una decisión escalada exige causa");
    }
    if (esperado.decision !== "escalada") {
      for (const campo of ["causa", "motivo", "codigoBloqueo"] as const) {
        if (esperado[campo] !== undefined) {
          problema(campo, `solo una decisión escalada admite ${campo}`);
        }
      }
    }
    const prohibidas = new Set<string>(esperado.llamadasProhibidas);
    for (const herramienta of esperado.llamadasRequeridas) {
      if (prohibidas.has(herramienta)) {
        problema("llamadasProhibidas", `${herramienta} no puede ser requerida y prohibida`);
      }
    }
  });
export type Esperado = z.infer<typeof esquemaEsperado>;

/** El caso 7: cada variante fija la falla del core, su esperado y los intentos de una herramienta. */
export const esquemaVariante = z.strictObject({
  nombre: z.enum(MODOS_FALLA),
  esperado: esquemaEsperado,
  reintentos: z
    .strictObject({
      herramienta: z.enum(HERRAMIENTAS_OBSERVABLES),
      /** El resultado de cada intento, en orden: `ok` o el código del error. */
      resultados: z.array(z.string().min(1)).min(1),
    })
    .optional(),
});
export type Variante = z.infer<typeof esquemaVariante>;
