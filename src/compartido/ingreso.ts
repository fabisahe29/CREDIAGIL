// Verificación de ingreso: esquemas de lo que guarda el core y lee el agente (specs/009-ingreso-
// verificado-consistencia: data-model.md; research.md, R5). Los usan el core, el servidor MCP y el
// cliente del agente: una respuesta que no cumple el esquema no se adivina (Principio III).

import { z } from "zod";
import { LARGO_MAXIMO_FRAGMENTO } from "../politica/documentos.ts";
import { UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE } from "../politica/politica.ts";

/** Las decisiones posibles, en el orden de prioridad de R5. */
export const ESTADOS_VERIFICACION = [
  "no_cubierto",
  "inconsistencia",
  "sin_ingreso",
  "falta_declarado",
  "discrepancia",
  "verificado",
] as const;
export type EstadoVerificacion = (typeof ESTADOS_VERIFICACION)[number];

/** Las reglas de consistencia entre documentos (R4). */
export const REGLAS_CONSISTENCIA = [
  "titular_vs_solicitante",
  "empleador_vs_pagador",
  "periodos_superpuestos",
  "periodo_no_mensual",
  "huecos_entre_periodos",
] as const;
export type ReglaConsistencia = (typeof REGLAS_CONSISTENCIA)[number];

/** Las únicas reglas cuya inconsistencia puede deberse a un error de extracción (R6). */
export const REGLAS_CORREGIBLES: readonly ReglaConsistencia[] = [
  "titular_vs_solicitante",
  "empleador_vs_pagador",
  "periodo_no_mensual",
];

/** Nombre del uso que no es un documento: la identidad verificada del solicitante. */
export const NOMBRE_IDENTIDAD_VERIFICADA = "identidad verificada";

const pesosNoNegativos = z.int().min(0);
const pesosPositivos = z.int().positive();

/** Qué dato de qué documento entró a un cálculo o a una comparación. */
export const esquemaUso = z
  .strictObject({
    /** `null` solo para el nombre de la identidad verificada, que no es un documento. */
    adjunto: z.int().min(1).nullable(),
    nombre: z.string().min(1).max(255),
    campo: z.string().min(1),
    valor: z.union([z.string(), z.int()]),
    /** `null` solo para la identidad verificada. */
    fragmento: z.string().min(1).max(LARGO_MAXIMO_FRAGMENTO).nullable(),
  })
  .refine((uso) => (uso.adjunto === null) === (uso.fragmento === null), {
    message: "un uso de un documento lleva adjunto y fragmento; el de la identidad, ninguno",
  });
export type Uso = z.infer<typeof esquemaUso>;

export const esquemaIngresoVerificado = z.strictObject({
  monto: pesosPositivos,
  origen: z.enum(["certificado", "extractos", "ambos"]),
  montoCertificado: pesosPositivos.nullable(),
  montoExtractos: pesosNoNegativos.nullable(),
  extractosContados: pesosNoNegativos,
  usos: z.array(esquemaUso),
  noUsados: z.array(
    z.strictObject({
      adjunto: z.int().min(1),
      nombre: z.string().min(1).max(255),
      motivo: z.string().min(1),
    }),
  ),
});
export type IngresoVerificado = z.infer<typeof esquemaIngresoVerificado>;

export const esquemaDiscrepancia = z.strictObject({
  declarado: pesosNoNegativos,
  verificado: pesosPositivos,
  diferencia: pesosNoNegativos,
  umbralPorcentaje: z.literal(UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE),
  supera: z.boolean(),
});
export type Discrepancia = z.infer<typeof esquemaDiscrepancia>;

export const esquemaInconsistencia = z
  .strictObject({
    regla: z.enum(REGLAS_CONSISTENCIA),
    descripcion: z.string().min(1),
    detiene: z.boolean(),
    corregible: z.boolean(),
    adjuntos: z.array(z.int().min(1)),
    valores: z.array(esquemaUso).min(1),
  })
  .refine((i) => i.valores.some((uso) => uso.adjunto !== null), {
    message: "una inconsistencia lleva al menos un valor de un documento, con su procedencia",
    path: ["valores"],
  })
  .refine((i) => !i.corregible || REGLAS_CORREGIBLES.includes(i.regla), {
    message: "esta regla no puede ser corregible por una nueva extracción",
    path: ["corregible"],
  });
export type Inconsistencia = z.infer<typeof esquemaInconsistencia>;

/** Valores de la decisión: textos ya formateados o enteros (pesos), como los eventos de negocio. */
const esquemaValores = z.record(z.string(), z.union([z.string(), z.int()]));

export const esquemaDecisionIngreso = z.strictObject({
  regla: z.string().min(1),
  resultado: z.enum(ESTADOS_VERIFICACION),
  motivo: z.string().min(1),
  valores: esquemaValores,
  versionPolitica: z.string().min(1),
});
export type DecisionIngreso = z.infer<typeof esquemaDecisionIngreso>;

/** Lo que calcula la política: la verificación sin la conversación ni la marca de tiempo. */
export interface ResultadoIngreso {
  idSolicitante: string;
  estado: EstadoVerificacion;
  ingresoDeclarado: number | null;
  ingreso: IngresoVerificado | null;
  discrepancia: Discrepancia | null;
  inconsistencias: Inconsistencia[];
  sinContrastar: string[];
  decision: DecisionIngreso;
}

const CON_INGRESO: readonly EstadoVerificacion[] = [
  "verificado",
  "discrepancia",
  "falta_declarado",
];
const CON_DISCREPANCIA: readonly EstadoVerificacion[] = ["verificado", "discrepancia"];

/** La verificación que guarda el core por conversación. */
export const esquemaVerificacionIngreso = z
  .strictObject({
    correlationId: z.uuid(),
    idSolicitante: z.string().min(1),
    estado: z.enum(ESTADOS_VERIFICACION),
    ingresoDeclarado: pesosNoNegativos.nullable(),
    ingreso: esquemaIngresoVerificado.nullable(),
    discrepancia: esquemaDiscrepancia.nullable(),
    inconsistencias: z.array(esquemaInconsistencia),
    sinContrastar: z.array(z.string()),
    decision: esquemaDecisionIngreso,
    calculadaEn: z.iso.datetime(),
  })
  .superRefine((v, ctx) => {
    const problema = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (v.decision.resultado !== v.estado) problema("decision", "la decisión repite el estado");
    if (CON_INGRESO.includes(v.estado) !== (v.ingreso !== null)) {
      problema("ingreso", "el ingreso va con verificado, discrepancia y falta_declarado");
    }
    if (CON_DISCREPANCIA.includes(v.estado) !== (v.discrepancia !== null)) {
      problema("discrepancia", "la discrepancia va solo con verificado y discrepancia");
    }
    if (v.estado === "discrepancia" && v.discrepancia?.supera !== true) {
      problema("discrepancia", "con el estado discrepancia, la diferencia supera el umbral");
    }
    if (v.estado === "verificado" && v.discrepancia?.supera === true) {
      problema("discrepancia", "con el estado verificado, la diferencia no supera el umbral");
    }
  });
export type VerificacionIngreso = z.infer<typeof esquemaVerificacionIngreso>;
