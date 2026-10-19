// Casos de prueba para la demo (specs/006-interfaz-chat: research.md, R9; data-model.md,
// "CasoPrueba"). Todo se valida antes del primer envío: un caso inválido no envía nada (FR-019).

import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { esquemaEsperado, esquemaVariante, type Esperado, type Variante } from "../e2e/esperado.ts";

const textoNoVacio = z.string().min(1);

const esquemaCaso = z.strictObject({
  nombre: textoNoVacio,
  descripcion: textoNoVacio,
  pasos: z
    .array(
      z.union([
        z.strictObject({ mensaje: textoNoVacio }),
        z.strictObject({ adjuntar: textoNoVacio }),
      ]),
    )
    .min(1),
  // Solo los casos obligatorios (#17) los traen: el ejecutor los exige y el chat los ignora.
  numero: z.int().min(1).max(7).optional(),
  esperado: esquemaEsperado.optional(),
  variantes: z.array(esquemaVariante).min(1).optional(),
});

export type PasoCaso = { mensaje: string } | { adjuntar: string; ruta: string };

export interface CasoPrueba {
  nombre: string;
  descripcion: string;
  /** Carpeta del caso; los adjuntos se resuelven desde aquí. */
  directorio: string;
  pasos: PasoCaso[];
  /** Número del caso obligatorio, de 1 a 7 (#17); el chat no lo usa. */
  numero?: number;
  /** Resultado esperado del caso obligatorio (#17); el chat no lo usa. */
  esperado?: Esperado;
  /** Variantes del caso 7 (#17), cada una con su falla y su esperado; el chat no las usa. */
  variantes?: Variante[];
}

export type CargaCaso = { ok: true; caso: CasoPrueba } | { ok: false; problema: string };

const esArchivo = async (ruta: string) => (await stat(ruta).catch(() => null))?.isFile() ?? false;

/** `ruta` es la carpeta del caso o su `caso.json`, relativa a `directorioBase`. Nunca lanza. */
export async function cargarCaso(ruta: string, directorioBase: string): Promise<CargaCaso> {
  const completa = resolve(directorioBase, ruta);
  const info = await stat(completa).catch(() => null);
  if (info === null) return { ok: false, problema: `no existe ${ruta}` };
  const archivo = info.isDirectory() ? join(completa, "caso.json") : completa;
  if (!(await esArchivo(archivo))) return { ok: false, problema: `no encontré ${archivo}` };

  let datos: unknown;
  try {
    datos = JSON.parse(await readFile(archivo, "utf8"));
  } catch (error) {
    return { ok: false, problema: `caso.json no es JSON válido (${(error as Error).message})` };
  }

  const validado = esquemaCaso.safeParse(datos);
  if (!validado.success) {
    const problema = validado.error.issues
      .map((issue) => `${issue.path.join(".") || "caso"}: ${issue.message}`)
      .join("; ");
    return { ok: false, problema };
  }

  const directorio = dirname(archivo);
  const pasos: PasoCaso[] = [];
  for (const [indice, paso] of validado.data.pasos.entries()) {
    if ("mensaje" in paso) {
      pasos.push(paso);
      continue;
    }
    const destino = resolve(directorio, paso.adjuntar);
    const dentro = relative(directorio, destino);
    if (isAbsolute(paso.adjuntar) || dentro.startsWith("..") || isAbsolute(dentro)) {
      return {
        ok: false,
        problema: `paso ${indice + 1}: el adjunto debe estar dentro de la carpeta del caso`,
      };
    }
    if (!(await esArchivo(destino))) {
      return { ok: false, problema: `paso ${indice + 1}: no existe el adjunto ${paso.adjuntar}` };
    }
    pasos.push({ adjuntar: paso.adjuntar, ruta: destino });
  }

  return {
    ok: true,
    caso: {
      nombre: validado.data.nombre,
      descripcion: validado.data.descripcion,
      directorio,
      pasos,
      ...(validado.data.numero !== undefined ? { numero: validado.data.numero } : {}),
      ...(validado.data.esperado !== undefined ? { esperado: validado.data.esperado } : {}),
      ...(validado.data.variantes !== undefined ? { variantes: validado.data.variantes } : {}),
    },
  };
}
