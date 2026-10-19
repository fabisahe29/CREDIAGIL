// Guion del modelo para el modo guionado (specs/015-casos-prueba-extremo-a-extremo: data-model.md,
// "Guion del modelo"). Es un dato del caso: dice qué llamadas haría el modelo en cada paso y qué
// devolverían el subagente de extracción y el clasificador. No contiene decisiones de crédito: la
// decisión sigue siendo del código (hooks, política y core).

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { CasoPrueba } from "../chat/casos.ts";
import { esquemaClasificacion } from "../agente/extraccion.ts";
import { esquemaSalidaSubagente, validarSalida } from "../compartido/extraccion.ts";

/** Las herramientas que el modelo ve (las del adaptador); no son las llamadas observables al core. */
export const HERRAMIENTAS_DEL_MODELO = [
  "consultar_solicitud",
  "buscar_solicitante",
  "verificar_identidad",
  "solicitar_analista",
  "extraer_documento",
  "verificar_ingreso",
  "consultar_extracciones",
  "calcular_capacidad_pago",
  "registrar_solicitud",
  "preaprobar_credito",
] as const;
export type HerramientaDelModelo = (typeof HERRAMIENTAS_DEL_MODELO)[number];

const esquemaLlamada = z.strictObject({
  herramienta: z.enum(HERRAMIENTAS_DEL_MODELO),
  entrada: z.record(z.string(), z.unknown()),
});

export const esquemaGuion = z.strictObject({
  clasificacion: z.record(z.string().min(1), esquemaClasificacion.shape.tipo),
  extracciones: z.record(z.string().min(1), esquemaSalidaSubagente),
  pasos: z
    .array(
      z.strictObject({
        llamadas: z.array(esquemaLlamada),
        /** El texto del modelo; no se verifica nunca (FR-004). */
        respuesta: z.string().min(1),
      }),
    )
    .min(1),
});
export type Guion = z.infer<typeof esquemaGuion>;
export type LlamadaGuionada = z.infer<typeof esquemaLlamada>;

export type CargaGuion = { ok: true; guion: Guion } | { ok: false; problema: string };

/** Lee y valida `guion.json` de la carpeta del caso. Nunca lanza. */
export async function leerGuion(directorio: string): Promise<CargaGuion> {
  const archivo = join(directorio, "guion.json");
  if (!(await stat(archivo).catch(() => null))?.isFile()) {
    return { ok: false, problema: `no encontré ${archivo}` };
  }
  let datos: unknown;
  try {
    datos = JSON.parse(await readFile(archivo, "utf8"));
  } catch (error) {
    return { ok: false, problema: `guion.json no es JSON válido (${(error as Error).message})` };
  }
  const validado = esquemaGuion.safeParse(datos);
  if (!validado.success) {
    const problema = validado.error.issues
      .map((issue) => `${issue.path.join(".") || "guion"}: ${issue.message}`)
      .join("; ");
    return { ok: false, problema };
  }
  return { ok: true, guion: validado.data };
}

const TIPOS_QUE_SE_EXTRAEN = ["certificado_laboral", "extracto_bancario"];

/**
 * Comprueba el guion contra su caso y devuelve los problemas, vacío si es coherente: un elemento de
 * `pasos` por paso, cada adjunto clasificado y, si se extrae, con una extracción que pasa la
 * validación real contra el contenido del documento.
 */
export async function validarGuion(
  guion: Guion,
  caso: Pick<CasoPrueba, "pasos">,
  leerAdjunto: (ruta: string) => Promise<string>,
  hoy: Date = new Date(),
): Promise<string[]> {
  const problemas: string[] = [];
  if (guion.pasos.length !== caso.pasos.length) {
    problemas.push(`el guion tiene ${guion.pasos.length} pasos y el caso ${caso.pasos.length}`);
  }
  for (const paso of caso.pasos) {
    if (!("adjuntar" in paso)) continue;
    const tipo = guion.clasificacion[paso.adjuntar];
    if (tipo === undefined) {
      problemas.push(`falta la clasificación de ${paso.adjuntar}`);
      continue;
    }
    if (!TIPOS_QUE_SE_EXTRAEN.includes(tipo)) continue;
    const salida = guion.extracciones[paso.adjuntar];
    if (salida === undefined) {
      problemas.push(`falta la extracción de ${paso.adjuntar}`);
      continue;
    }
    const validacion = validarSalida(salida, { contenido: await leerAdjunto(paso.ruta) }, hoy);
    if (!validacion.ok) {
      problemas.push(
        `la extracción de ${paso.adjuntar} no pasa la validación: ${validacion.errores
          .map((e) => `${e.campo}: ${e.motivo}`)
          .join(", ")}`,
      );
    }
  }
  return problemas;
}
